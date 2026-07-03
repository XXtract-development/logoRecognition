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
import sharp from 'sharp';
import prisma from '../../core/db';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { createLogger } from '../../core/logger';
import { downloadTrainingObject } from '../../services/storage';
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
import {
  getBatchDetail,
  BatchDetailNotFoundError,
} from '../../services/flywheel/batch-detail';
import {
  decideCandidate,
  isCandidateDecision,
  CandidateNotFoundError,
  CandidateBatchProcessingError,
  CandidateConflictError,
} from '../../services/flywheel/candidate-decision';
import {
  closeBatch,
  BatchCloseNotFoundError,
  BatchNotFullyReviewedError,
  BatchNotCloseableError,
} from '../../services/flywheel/batch-close';

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

  /**
   * GET /api/v1/flywheel/batches/:id
   *
   * Batch-detail voor de quarantaine-afhandelpagina (Story 15.3, AC1). Levert de
   * batch-kop (faalreden, poort-uitkomsten), de kandidatenlijst (status, T3777-
   * code, evidence-contract) en per kandidaat of er een crop/actieve referentie
   * is. ON-READ, GÉÉN poortlogica (AD-15). 404 bij onbekende id. Alleen ADMIN.
   */
  fastify.get<{ Params: { id: string } }>(
    '/flywheel/batches/:id',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const detail = await getBatchDetail(id);
        return reply.status(200).send(detail);
      } catch (err) {
        if (err instanceof BatchDetailNotFoundError) {
          return reply.status(404).send({ error: 'Batch niet gevonden' });
        }
        logger.error('Batch-detail ophalen mislukt', {
          batchId: id,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return reply.status(500).send({ error: 'Batch-detail kon niet geladen worden' });
      }
    }
  );

  /**
   * GET /api/v1/flywheel/candidates/:id/crop
   *
   * Streamt het crop-beeld van een kandidaat door de API (cookie-auth same-origin;
   * MinIO blijft intern) — patroon van de reviewstation-crop-route. 404 als de
   * kandidaat of zijn crop-object ontbreekt. Alleen ADMIN.
   */
  fastify.get<{ Params: { id: string } }>(
    '/flywheel/candidates/:id/crop',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const { id } = request.params;
      const candidate = await prisma.referenceCandidate.findUnique({
        where: { id },
        select: { cropPath: true },
      });
      if (!candidate || !candidate.cropPath) {
        return reply.status(404).send({ error: 'Geen crop voor deze kandidaat' });
      }
      const buffer = await downloadTrainingObject(candidate.cropPath);
      if (!buffer) {
        return reply.status(404).send({ error: 'Crop niet gevonden in opslag' });
      }
      reply.header('Cache-Control', 'private, max-age=300');
      const ext = candidate.cropPath.split('.').pop()?.toLowerCase();
      if (ext === 'svg') return reply.type('image/svg+xml').send(buffer);
      try {
        const out = await sharp(buffer).resize({ width: 400, withoutEnlargement: true }).png().toBuffer();
        return reply.type('image/png').send(out);
      } catch {
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        return reply.type(mime).send(buffer);
      }
    }
  );

  /**
   * POST /api/v1/flywheel/candidates/:id/decision
   *
   * Beslis per kandidaat bij quarantaine-afhandeling (Story 15.3, AC2/AC3, FR-18,
   * AD-12/AD-15/AD-16). Body `{ decision: 'afkeuren' | 'vrijgeven' | 'undo' }`.
   *   - afkeuren  → rejected + hard-negative (`quarantaine-afkeuring`) + gold-set-
   *                 VALS-aanwas (14.1-service, bron `quarantaine`), conditional.
   *   - vrijgeven → candidate + losgekoppeld; GÉÉN poortlogica in dit pad (AD-15):
   *                 de eerstvolgende worker-run herbundelt in een nieuwe batch die
   *                 opnieuw de volledige poort doorloopt.
   *   - undo      → laatste beslissing terugnemen (spiegel 14.1-undo).
   * 400 ongeldige decision, 404 onbekende kandidaat, 409 kandidaat in een batch in
   * verwerking (AD-16) of een verloren conditional-update-race. Alleen ADMIN.
   */
  fastify.post<{ Params: { id: string }; Body: { decision?: string } }>(
    '/flywheel/candidates/:id/decision',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const { id } = request.params;
      const decision = request.body?.decision;
      const by = request.user?.userId ?? null;

      if (!decision || !isCandidateDecision(decision)) {
        return reply.status(400).send({
          error: "Ongeldige beslissing — verwacht 'afkeuren', 'vrijgeven' of 'undo'.",
        });
      }

      try {
        const result = await decideCandidate({ candidateId: id, decision, by });
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof CandidateNotFoundError) {
          return reply.status(404).send({ error: 'Kandidaat niet gevonden' });
        }
        if (err instanceof CandidateBatchProcessingError) {
          return reply.status(409).send({
            error:
              'Deze kandidaat zit in een batch die nog verwerkt wordt — beslissen kan pas als de batch is afgesloten.',
          });
        }
        if (err instanceof CandidateConflictError) {
          return reply.status(409).send({
            error: 'De kandidaat is intussen gewijzigd — vernieuw en probeer opnieuw.',
          });
        }
        logger.error('Kandidaat-beslissing mislukt', {
          candidateId: id,
          decision,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return reply.status(500).send({ error: 'Beslissing niet opgeslagen — probeer opnieuw.' });
      }
    }
  );

  /**
   * POST /api/v1/flywheel/batches/:id/close
   *
   * Sluit een gequarantaineerde batch af (Story 15.3, AC4). Zet `closedAt`; de
   * batch-status BLIJFT `quarantined` (herleidbaarheid). Pas toegestaan als álle
   * kandidaten beoordeeld zijn (geen `in_batch` meer). GÉÉN poortlogica (AD-15).
   * 404 onbekende batch, 409 niet-afsluitbaar of nog onbeoordeelde kandidaten.
   * Alleen ADMIN.
   */
  fastify.post<{ Params: { id: string } }>(
    '/flywheel/batches/:id/close',
    { preHandler: REQUIRE_ADMIN },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const result = await closeBatch(id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof BatchCloseNotFoundError) {
          return reply.status(404).send({ error: 'Batch niet gevonden' });
        }
        if (err instanceof BatchNotFullyReviewedError) {
          return reply.status(409).send({
            error: `Nog ${err.pending} kandidaten wachten op jouw beoordeling — sluit ze eerst af.`,
          });
        }
        if (err instanceof BatchNotCloseableError) {
          return reply.status(409).send({
            error: 'Deze batch is niet (meer) afsluitbaar.',
          });
        }
        logger.error('Batch afsluiten mislukt', {
          batchId: id,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return reply.status(500).send({ error: 'Batch afsluiten mislukt' });
      }
    }
  );
}

export default flywheelRoutes;
