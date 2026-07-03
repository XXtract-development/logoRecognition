/**
 * Referentie-vliegwiel-routes (Epics 13-18) — `/api/v1/flywheel/*`.
 *
 * Dit routebestand start als skelet (Story 13.2) met alleen `overview`; latere
 * stories (batches, kandidaten, drempels, pauze, rapporten) vullen het modulair
 * aan (coördinatie-noot epics, Structural Seed). Alle reads gaan uitsluitend via
 * dit v1-pad (AD-10) — de SPA praat nooit rechtstreeks met ml-service of de DB.
 *
 * Story 13.6 voegt toe: `POST batches/:id/rollback` (toegestane, gelogde
 * statusmutatie — AD-15-verduidelijking, GÉÉN poort-executie),
 * `GET hard-negatives/export` (gate-trainingsmateriaal, menselijke categorie) en
 * de pauze-stand in de overview-response. De pauze/resume-HTTP-endpoints zelf
 * zijn Story 15.4 (die op de `pause.ts`-service bouwt).
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { createLogger } from '../../core/logger';
import {
  rollbackBatch,
  BatchNotFoundError,
  BatchNotRollbackableError,
} from '../../services/flywheel/rollback';
import {
  getHardNegativeExport,
  toCsv,
} from '../../services/flywheel/hard-negative-export';
import { composeOverview } from '../../services/flywheel/overview';
import {
  decideOutlier,
  OutlierFindingNotFoundError,
  OutlierFindingAlreadyDecidedError,
  type OutlierDecision,
} from '../../services/flywheel/outlier-decision';

const logger = createLogger('flywheel-routes');

const REQUIRE_ADMIN = requireRole('ADMIN');

export async function flywheelRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/flywheel/overview
   *
   * Vliegwiel-overzicht — modulair samengesteld (Story 15.2, coördinatie-noot
   * epics). Vijf epics (13 t/m 18) leveren panelen; elk paneel is één sub-service
   * onder `services/flywheel/overview/`. De compositie zit in `composeOverview()`
   * (géén monoliet-handler hier); elk paneel faalt sectie-lokaal (`{ error }` in
   * de payload i.p.v. een 500 op het geheel — EXPERIENCE.md State Patterns). De
   * response bevat `generatedAt` t.b.v. de client-side "verouderde data"-melding.
   */
  fastify.get(
    '/flywheel/overview',
    { preHandler: authMiddleware },
    async (_request, reply: FastifyReply) => {
      const overview = await composeOverview();
      logger.info('Flywheel overview opgevraagd', {
        generatedAt: overview.generatedAt,
        quarantineCount: overview.quarantineCount,
        paused: overview.paused,
      });
      return reply.status(200).send(overview);
    }
  );

  /**
   * POST /api/v1/flywheel/outliers/:id/decision
   *
   * Beoordeel een open outlier-melding (Story 15.2, AC6, FR-8/AD-5/AD-13). Body
   * `{ decision: 'behouden' | 'deactiveren' }`. `behouden` markeert de finding als
   * beoordeeld; `deactiveren` zet de referentie op `active=false` (soft-delete,
   * gelogd) én markeert de baseline als VEROUDERD (AD-5) — GÉÉN poort-executie
   * (AD-15). 404 onbekende finding, 409 reeds beoordeelde finding (idempotentie),
   * 400 ongeldige decision. Alleen ADMIN.
   */
  fastify.post<{ Params: { id: string }; Body: { decision?: string } }>(
    '/flywheel/outliers/:id/decision',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const { id } = request.params;
      const decision = request.body?.decision;
      const by = request.user?.userId ?? 'onbekend';

      if (decision !== 'behouden' && decision !== 'deactiveren') {
        return reply.status(400).send({
          error: "Ongeldige beslissing — verwacht 'behouden' of 'deactiveren'.",
        });
      }

      try {
        const result = await decideOutlier({
          findingId: id,
          decision: decision as OutlierDecision,
          by,
        });
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof OutlierFindingNotFoundError) {
          return reply.status(404).send({ error: 'Outlier-melding niet gevonden' });
        }
        if (err instanceof OutlierFindingAlreadyDecidedError) {
          return reply.status(409).send({
            error: `Outlier-melding is al beoordeeld (status ${err.status}).`,
          });
        }
        logger.error('Outlier-beslissing mislukt', {
          findingId: id,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return reply.status(500).send({ error: 'Outlier-beslissing mislukt' });
      }
    }
  );

  /**
   * POST /api/v1/flywheel/batches/:id/rollback
   *
   * Draai een gepasseerde batch als geheel terug (Story 13.6, AD-3/AD-13/AD-15).
   * Dit is een TOEGESTANE, GELOGDE STATUSMUTATIE — GÉÉN poort-executie in het
   * request-pad: het endpoint muteert alleen status + soft-delete + logt (de
   * verse nulmeting gebeurt vanzelf bij de eerstvolgende worker-run via de stale-
   * marker). Body `{ reason }` verplicht. 404 onbekende batch, 409 als status ≠
   * `passed`, 400 zonder reden. Alleen ADMIN.
   */
  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/flywheel/batches/:id/rollback',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const { id } = request.params;
      const reason = request.body?.reason;
      const by = request.user?.userId ?? 'onbekend';

      if (!reason || reason.trim().length === 0) {
        return reply.status(400).send({ error: 'Een reden is verplicht voor rollback (herleidbaarheid).' });
      }

      try {
        const result = await rollbackBatch({ batchId: id, reason: reason.trim(), by });
        logger.warn('Batch-rollback via endpoint', {
          batchId: id,
          by,
          deactivatedReferences: result.deactivatedReferences,
        });
        return reply.status(200).send({
          batchId: result.batchId,
          status: 'rolled_back',
          deactivatedReferences: result.deactivatedReferences,
          candidateIds: result.candidateIds,
        });
      } catch (err) {
        if (err instanceof BatchNotFoundError) {
          return reply.status(404).send({ error: 'Batch niet gevonden' });
        }
        if (err instanceof BatchNotRollbackableError) {
          return reply.status(409).send({
            error: `Batch kan niet teruggedraaid worden (status ${err.status}) — alleen een passed-batch.`,
          });
        }
        logger.error('Rollback mislukt', {
          batchId: id,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return reply.status(500).send({ error: 'Rollback mislukt' });
      }
    }
  );

  /**
   * GET /api/v1/flywheel/hard-negatives/export
   *
   * Exporteer de hard-negatives als gate-trainingsmateriaal (Story 13.6, AC 6,
   * AD-12), GEFILTERD op uitsluitend de menselijke afkeuringscategorieën. Bevat
   * uitsluitend eigen crop-paden (nooit GS1-gidsbeelden, NFR-6). `?format=csv`
   * levert CSV; standaard JSON. Alleen ADMIN.
   *
   * Variance (Dev Notes): dit pad staat niet in de seed-endpointlijst; gekozen
   * binnen `/api/v1/flywheel/` en gedocumenteerd in het Dev Agent Record.
   */
  fastify.get<{ Querystring: { format?: string } }>(
    '/flywheel/hard-negatives/export',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const rows = await getHardNegativeExport();
      logger.info('Hard-negative-export opgevraagd', { count: rows.length });

      if (request.query?.format === 'csv') {
        return reply
          .status(200)
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', 'attachment; filename="hard-negatives.csv"')
          .send(toCsv(rows));
      }

      return reply.status(200).send({ total: rows.length, rows });
    }
  );
}

export default flywheelRoutes;
