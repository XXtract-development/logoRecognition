/**
 * Declared-values verification routes (Story 12.8 — kruischeck-endpoint voor n8n).
 *
 * Two routes implement the 202 + poll run-pattern (same shape as
 * /artwork-import/runs, artwork-pipeline.ts):
 *
 *   POST /api/v1/artwork/:gtin/verify-declared        → 202 { runId }
 *   GET  /api/v1/artwork/verify-declared/runs/:runId  → 200 { status, ... } | 404
 *
 * ── n8n aanroeprecept (AC6) ──────────────────────────────────────────────────
 *   1. POST /api/v1/artwork/{gtin}/verify-declared
 *        header: x-api-key: <API_KEY>            (n8n heeft geen JWT)
 *        → 202 { "runId": "<uuid>" }
 *   2. Poll (Wait-node, ~2–5 s interval):
 *        GET /api/v1/artwork/verify-declared/runs/{runId}
 *        header: x-api-key: <API_KEY>
 *        → 200 { status, gtin, declaration:{reason,codes}, verdicts:[...], processingTimeMs }
 *      Herhaal zolang status == "running".
 *   3. Interpreteer:
 *        status "done"       → lees `verdicts` (CONFIRMED/UNCERTAIN/NOT_FOUND/UNSUPPORTED
 *                              per code); `declaration.reason` toont waarom de
 *                              declaratielijst leeg kan zijn (fail-safe, AC2).
 *        status "no-artwork" → geen artwork geïmporteerd voor deze GTIN (geen fout).
 *        status "failed"     → onverwachte fout tijdens verwerking (`error`-veld).
 *      404 → onbekende/verlopen runId.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Auth (AC1): the routes accept EITHER a valid JWT (cookie/bearer, existing
 * dashboard users) OR the system API key via `x-api-key` (n8n). No new auth
 * mechanism — `verifyDeclaredAuth` composes the existing `apiKeyAuth`
 * (x-api-key against process.env.API_KEY) and `authMiddleware` (JWT).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { logger } from '../../core/logger';
import { authMiddleware, apiKeyAuth } from '../../middleware/auth';
import {
  enqueueVerifyDeclared,
  readRunState,
} from '../../services/pipeline/verify-flow';

interface VerifyParams {
  gtin: string;
}

interface RunParams {
  runId: string;
}

/**
 * Auth preHandler that accepts the system API key (n8n) OR a JWT (dashboard).
 * When an `x-api-key` header is present it is validated via the existing
 * `apiKeyAuth`; otherwise the request falls back to JWT `authMiddleware`. Either
 * path that rejects has already sent the 401 (reply.sent) so we return early.
 */
async function verifyDeclaredAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  const hasApiKey = !!request.headers['x-api-key'];
  const hasJwt =
    request.headers.authorization?.startsWith('Bearer ') ||
    !!request.cookies?.access_token;

  // n8n path first: an x-api-key is validated by the existing apiKeyAuth
  // (system key against process.env.API_KEY).
  if (hasApiKey) {
    await apiKeyAuth(request, reply);
  } else if (hasJwt) {
    // Existing dashboard users: fall back to the JWT middleware.
    await authMiddleware(request, reply);
  } else {
    // No credential at all → reject without invoking either middleware so the
    // 401 is deterministic regardless of the auth strategy (AC1/AC9).
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required (x-api-key or JWT)' },
    });
  }

  // A rejecting middleware has already sent a 401. In Fastify a preHandler that
  // produced a response must RETURN the reply so the route handler is skipped.
  if (reply.raw.writableEnded || reply.sent) {
    return reply;
  }
}

export async function verifyDeclaredRoutes(fastify: FastifyInstance) {
  /**
   * POST /artwork/:gtin/verify-declared
   * Start a declared-values verification run for a GTIN. Returns 202 { runId }
   * immediately; the BullMQ worker resolves declarations, runs targeted
   * detection only for the declared (alias-mapped) codes, and produces a verdict
   * per code. If no artwork is imported the run terminates with status
   * `no-artwork` (never a throw/error, AC1).
   */
  fastify.post<{ Params: VerifyParams }>(
    '/artwork/:gtin/verify-declared',
    { preHandler: verifyDeclaredAuth },
    async (request: FastifyRequest<{ Params: VerifyParams }>, reply: FastifyReply) => {
      const { gtin } = request.params;
      if (!gtin || !/^\d{8,14}$/.test(gtin)) {
        return reply.status(400).send({ error: 'Ongeldige GTIN' });
      }

      const runId = crypto.randomUUID();

      try {
        await enqueueVerifyDeclared(gtin, runId);
      } catch (err) {
        logger.error('Verify-declared enqueue failed', {
          gtin,
          runId,
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(502).send({ error: 'Verificatie kon niet worden gestart' });
      }

      logger.info('Verify-declared run started', { gtin, runId });
      return reply.status(202).send({ runId });
    }
  );

  /**
   * GET /artwork/verify-declared/runs/:runId
   * Poll the status/result of a verification run (n8n Wait-node). Returns 200
   * with the full run-state; 404 for an unknown/expired runId. Run-state lives
   * in Redis (AC7) — no DB row.
   */
  fastify.get<{ Params: RunParams }>(
    '/artwork/verify-declared/runs/:runId',
    { preHandler: verifyDeclaredAuth },
    async (request: FastifyRequest<{ Params: RunParams }>, reply: FastifyReply) => {
      const { runId } = request.params;

      const state = await readRunState(runId);
      if (!state) {
        return reply.status(404).send({ error: 'Verificatie-run niet gevonden' });
      }

      return reply.status(200).send({
        status: state.status,
        gtin: state.gtin,
        declaration: state.declaration,
        verdicts: state.verdicts,
        processingTimeMs: state.processingTimeMs,
        ...(state.error ? { error: state.error } : {}),
      });
    }
  );
}
