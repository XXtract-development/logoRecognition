/**
 * Referentie-vliegwiel-routes (Epics 13-18) — `/api/v1/flywheel/*`.
 *
 * Dit routebestand start als skelet (Story 13.2) met alleen `overview`; latere
 * stories (batches, kandidaten, drempels, pauze, rapporten) vullen het modulair
 * aan (coördinatie-noot epics, Structural Seed). Alle reads gaan uitsluitend via
 * dit v1-pad (AD-10) — de SPA praat nooit rechtstreeks met ml-service of de DB.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth';
import { createLogger } from '../../core/logger';
import { getMissedNominationCounts } from '../../services/flywheel/missed-nominations';
import { getLastSuccessfulPromotionRun } from '../../services/flywheel/watchdog';

const logger = createLogger('flywheel-routes');

export async function flywheelRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/flywheel/overview
   *
   * Vliegwiel-overzicht. Story 13.2 leverde hier de gemiste-nominatie-teller
   * (`missedNominations`, per reden); Story 13.4 voegt de watchdog-observatie
   * `lastSuccessfulPromotionRun` toe (ISO-timestamp of `null` als de promotielus
   * nog nooit succesvol draaide). Latere stories (15.2 dashboard) breiden dit uit
   * met batch-/kandidaat-/poort-statistieken.
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

      logger.info('Flywheel overview opgevraagd', {
        missedNominationsTotal,
        lastSuccessfulPromotionRun,
      });

      return reply.status(200).send({
        missedNominations,
        missedNominationsTotal,
        lastSuccessfulPromotionRun,
      });
    }
  );
}

export default flywheelRoutes;
