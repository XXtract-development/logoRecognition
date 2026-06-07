/**
 * Reference Keurmerk Logos API Routes (Epic 7, Story 7.3)
 *
 * Curated library of official keurmerk artwork + variants. Each variant is
 * stored in MinIO under `reference-logos/{t3777Code}/{variantLabel}.{ext}`
 * (this path structure is the contract consumed by Epic 8 template-matching
 * and 8.7 synthesis — do not change it) and tracked in a database record that
 * supports soft delete (active flag) so history is never lost.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { uploadReferenceLogo, getReferenceLogoUrl } from '../../services/storage';
import { optionalAuth } from '../../middleware/auth';
import { logger } from '../../core/logger';
import prisma from '../../core/db';
import { KEURMERK_CATEGORY } from '../../services/provenance';
import { mlClient } from '../../services/ml-client';

/** Allowed reference-logo file extensions. */
const ALLOWED_EXTENSIONS = ['png', 'svg'] as const;

/** Minimum PNG resolution (px) — configurable via REFERENCE_MIN_RESOLUTION. */
function minResolution(): number {
  return parseInt(process.env.REFERENCE_MIN_RESOLUTION || '200', 10);
}

interface ListQuery {
  code?: string;
  limit?: string;
  offset?: string;
}

/** Default/max page size for reference-logo listings. */
const LIST_DEFAULT_LIMIT = 100;
const LIST_MAX_LIMIT = 500;

/** Lowercased file extension without the dot, or '' when absent. */
function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : '';
}

export async function referenceLogosRoutes(fastify: FastifyInstance) {
  // User info is available when logged in (consistent with other v1 routes).
  fastify.addHook('preHandler', optionalAuth);

  /**
   * POST /reference-logos
   * Upload a reference keurmerk logo with metadata (multipart/form-data).
   */
  fastify.post('/reference-logos', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'Geen bestand geüpload' });
    }

    // Form fields travel alongside the file part in @fastify/multipart.
    const fields = data.fields as Record<string, { value?: string } | undefined>;
    const t3777Code = fields.t3777Code?.value?.trim();
    const variantLabel = fields.variantLabel?.value?.trim();
    const source = fields.source?.value?.trim() || null;

    // Buffer must be consumed regardless so the multipart stream drains.
    const buffer = await data.toBuffer();

    if (!t3777Code || !variantLabel) {
      return reply
        .status(400)
        .send({ error: 'Verplichte velden ontbreken: t3777Code en variantLabel zijn vereist' });
    }

    // Format validation is extension-based (the browser/multipart MIME cannot
    // be trusted — e.g. a .docx may arrive labelled image/png).
    const ext = extensionOf(data.filename);
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return reply
        .status(400)
        .send({ error: 'Bestandsformaat niet ondersteund: alleen PNG of SVG toegestaan' });
    }

    // Resolution check applies to raster PNG only; SVG is vector and is
    // validated on extension + non-empty content.
    if (ext === 'png') {
      try {
        const metadata = await sharp(buffer).metadata();
        const min = minResolution();
        if (!metadata.width || !metadata.height || metadata.width < min || metadata.height < min) {
          return reply.status(400).send({
            error: `Resolutie te laag: minimaal ${min}x${min} pixels vereist`,
          });
        }
      } catch {
        return reply.status(400).send({ error: 'Resolutie kon niet worden bepaald' });
      }
    } else if (buffer.length === 0) {
      return reply.status(400).send({ error: 'Bestand is leeg' });
    }

    const storagePath = `reference-logos/${t3777Code}/${variantLabel}.${ext}`;

    // Duplicate guard BEFORE touching object storage: a re-upload of an
    // existing (code, variant) must not overwrite the stored artwork and then
    // fail on the unique constraint, leaving storage and DB out of sync.
    const existing = await prisma.referenceLogo.findUnique({
      where: { t3777Code_variantLabel: { t3777Code, variantLabel } },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({
        error: `Variant '${variantLabel}' bestaat al voor ${t3777Code}. Deactiveer de bestaande variant of kies een ander variantlabel.`,
      });
    }

    // Persist the artwork to object storage. Wrapped defensively so a storage
    // hiccup does not crash the request handler.
    try {
      await uploadReferenceLogo(
        buffer,
        storagePath,
        ext === 'svg' ? 'image/svg+xml' : 'image/png'
      );
    } catch (error) {
      logger.error('Failed to store reference logo', {
        error: error instanceof Error ? error.message : 'Unknown error',
        storagePath,
      });
      return reply.status(500).send({ error: 'Opslaan van referentie-afbeelding mislukt' });
    }

    // Couple to the existing Logo definition (category='keurmerk', value=code).
    let logoId: string | null = null;
    try {
      const logo = await prisma.logo.upsert({
        where: { category_value: { category: KEURMERK_CATEGORY, value: t3777Code } },
        update: {},
        create: { category: KEURMERK_CATEGORY, value: t3777Code },
      });
      logoId = logo?.id ?? null;
    } catch (error) {
      logger.warn('Could not upsert Logo for reference logo', {
        error: error instanceof Error ? error.message : 'Unknown error',
        t3777Code,
      });
    }

    try {
      const record = await prisma.referenceLogo.create({
        data: { t3777Code, variantLabel, source, storagePath, active: true, logoId },
      });

      logger.info('Reference logo created', { id: record.id, t3777Code, variantLabel });

      // 8-3O decision 2/O4: refresh the ML template cache after library mutations
      // (best-effort — a failure only means the TTL covers the gap).
      void mlClient.reloadTemplates().catch((err: unknown) => {
        logger.warn('reload-templates after create failed (TTL will refresh)', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });

      return reply.status(201).send({
        id: record.id,
        t3777Code: record.t3777Code,
        variantLabel: record.variantLabel,
        source: record.source,
        storagePath: record.storagePath,
        active: record.active,
        logoId: record.logoId ?? logoId,
      });
    } catch (error) {
      // Race fallback: concurrent upload of the same (code, variant) slipped
      // past the pre-check → unique violation. Report conflict, not a 500.
      if ((error as { code?: string }).code === 'P2002') {
        return reply.status(409).send({
          error: `Variant '${variantLabel}' bestaat al voor ${t3777Code}.`,
        });
      }
      logger.error('Failed to create reference logo record', {
        error: error instanceof Error ? error.message : 'Unknown error',
        t3777Code,
        variantLabel,
      });
      return reply.status(500).send({ error: 'Opslaan van referentierecord mislukt' });
    }
  });

  /**
   * GET /reference-logos?code=X
   * List all variants for a T3777 code — including inactive ones (history).
   */
  fastify.get<{ Querystring: ListQuery }>(
    '/reference-logos',
    async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
      const { code } = request.query;
      const limit = Math.min(
        Math.max(parseInt(request.query.limit || `${LIST_DEFAULT_LIMIT}`, 10) || LIST_DEFAULT_LIMIT, 1),
        LIST_MAX_LIMIT
      );
      const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);

      try {
        const records = await prisma.referenceLogo.findMany({
          where: code ? { t3777Code: code } : {},
          orderBy: [{ t3777Code: 'asc' }, { variantLabel: 'asc' }],
          take: limit,
          skip: offset,
        });

        const data = await Promise.all(
          records.map(async (r) => {
            // Presign previews only for active variants: inactive history is
            // listed (contract) but its previews are rarely rendered — signing
            // them all makes the unbounded soft-delete history a per-request cost.
            let previewUrl: string | null = null;
            if (r.active) {
              try {
                previewUrl = (await getReferenceLogoUrl(r.storagePath)) ?? null;
              } catch {
                previewUrl = null;
              }
            }
            return {
              id: r.id,
              t3777Code: r.t3777Code,
              variantLabel: r.variantLabel,
              source: r.source,
              storagePath: r.storagePath,
              active: r.active,
              logoId: r.logoId,
              createdAt: r.createdAt,
              previewUrl,
            };
          })
        );

        return { data };
      } catch (error) {
        logger.error('Failed to list reference logos', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return reply.status(500).send({ error: 'Ophalen van referenties mislukt' });
      }
    }
  );

  /**
   * PATCH /reference-logos/:id/deactivate
   * Soft delete: mark a variant inactive. The record is never deleted so the
   * keurmerk history stays intact.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/reference-logos/:id/deactivate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const record = await prisma.referenceLogo.update({
          where: { id },
          data: { active: false },
        });

        logger.info('Reference logo deactivated', { id });

        // 8-3O decision 2/O4: best-effort ML template-cache refresh (see POST).
        void mlClient.reloadTemplates().catch((err: unknown) => {
          logger.warn('reload-templates after deactivate failed (TTL will refresh)', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });

        return {
          id: record.id,
          t3777Code: record.t3777Code,
          variantLabel: record.variantLabel,
          active: record.active,
        };
      } catch (error) {
        logger.error('Failed to deactivate reference logo', {
          error: error instanceof Error ? error.message : 'Unknown error',
          id,
        });
        return reply.status(500).send({ error: 'Deactiveren van referentie mislukt' });
      }
    }
  );
}
