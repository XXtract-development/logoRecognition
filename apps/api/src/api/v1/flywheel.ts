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

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { createLogger } from '../../core/logger';
import { getMissedNominationCounts } from '../../services/flywheel/missed-nominations';
import { getLastSuccessfulPromotionRun } from '../../services/flywheel/watchdog';
import { getPauseState } from '../../services/flywheel/pause';
import {
  rollbackBatch,
  BatchNotFoundError,
  BatchNotRollbackableError,
} from '../../services/flywheel/rollback';
import {
  getHardNegativeExport,
  toCsv,
} from '../../services/flywheel/hard-negative-export';
import { isNominationEnabled } from '../../services/flywheel/config';
import { getGoldSetComposition } from '../../services/flywheel/gold-set-composition';
import { getOutliersPanel } from '../../services/flywheel/outliers-overview';
import { getQuarantineCount } from '../../services/flywheel/quarantine-count';

const logger = createLogger('flywheel-routes');

const REQUIRE_ADMIN = requireRole('ADMIN');

export async function flywheelRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/flywheel/overview
   *
   * Vliegwiel-overzicht. Story 13.2 leverde hier de gemiste-nominatie-teller
   * (`missedNominations`, per reden); Story 13.4 voegde de watchdog-observatie
   * `lastSuccessfulPromotionRun` toe; Story 13.6 voegt de pauze-stand `paused`
   * toe (AD-11-scope zichtbaar). Story 14.2 voegt het modulaire paneel
   * `goldSetComposition` toe (ON-READ berekend, geen job — AD-6 ongeraakt).
   * Latere stories (15.2 dashboard) breiden dit uit met batch-/kandidaat-/
   * poort-statistieken.
   *
   * Modulariteit (coördinatie-noot epics): vijf epics leveren panelen; elk
   * paneel is één sub-service-aanroep hier, geen gedeelde monoliet-handler. Het
   * `goldSetComposition`-contract (sleutels) is stabiel voor Story 15.2.
   */
  fastify.get(
    '/flywheel/overview',
    { preHandler: authMiddleware },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const missedNominations = await getMissedNominationCounts();
      const missedNominationsTotal = Object.values(missedNominations).reduce(
        (sum, n) => sum + n,
        0
      );

      const lastSuccessfulPromotionRun = await getLastSuccessfulPromotionRun();
      const pauseState = await getPauseState();
      // Story 14.2: ON-READ samenstellingsbewaking (paneel goldSetComposition).
      const goldSetComposition = await getGoldSetComposition();
      // Story 14.3: open outlier-meldingen + laatste audit-run (paneel outliers).
      const outliers = await getOutliersPanel();
      // Story 15.1: aantal openstaande quarantainebatches (voedt de nav-badge).
      const quarantineCount = await getQuarantineCount();

      logger.info('Flywheel overview opgevraagd', {
        missedNominationsTotal,
        lastSuccessfulPromotionRun,
        paused: pauseState.paused,
        goldSetSize: goldSetComposition.size,
        goldSetSkewSignals: goldSetComposition.skewSignals.length,
        outliersOpen: outliers.openCount,
        quarantineCount,
      });

      return reply.status(200).send({
        // Story 14.1: de reviewstation-web-app leest hier de hoofdvlag zodat de
        // redenkeuze-UI bij reject alleen bij vlag-aan verschijnt (runtime-
        // schakelbaar, geen web-build env-var).
        nominationEnabled: isNominationEnabled(),
        missedNominations,
        missedNominationsTotal,
        lastSuccessfulPromotionRun,
        paused: pauseState.paused,
        pause: pauseState,
        // Story 14.2 (FR-11): gold-set-omvang, ECHT/VALS-verdeling, top-5
        // meest/minst vertegenwoordigde klassen en scheefgroei-signalen.
        goldSetComposition,
        // Story 14.3 (FR-8): open outlier-meldingen van de wekelijkse audit +
        // laatste run-tijdstempel. Beoordeling (Behouden/Deactiveren) = Story 15.2.
        outliers,
        // Story 15.1 (AC2): aantal openstaande quarantainebatches voor de
        // navigatie-badge. Story 15.2 breidt dit paneel verder uit.
        quarantineCount,
      });
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
