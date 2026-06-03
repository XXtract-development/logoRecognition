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

/** Allowed reference-logo file extensions. */
const ALLOWED_EXTENSIONS = ['png', 'svg'] as const;

/** Minimum PNG resolution (px) — configurable via REFERENCE_MIN_RESOLUTION. */
function minResolution(): number {
  return parseInt(process.env.REFERENCE_MIN_RESOLUTION || '200', 10);
}

interface ListQuery {
  code?: string;
}

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
        where: { category_value: { category: 'keurmerk', value: t3777Code } },
        update: {},
        create: { category: 'keurmerk', value: t3777Code },
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

      try {
        const records = await prisma.referenceLogo.findMany({
          where: code ? { t3777Code: code } : {},
          orderBy: [{ t3777Code: 'asc' }, { variantLabel: 'asc' }],
        });

        const data = await Promise.all(
          records.map(async (r) => {
            let previewUrl: string | null = null;
            try {
              previewUrl = (await getReferenceLogoUrl(r.storagePath)) ?? null;
            } catch {
              previewUrl = null;
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
