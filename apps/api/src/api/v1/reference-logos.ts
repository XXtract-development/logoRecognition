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
import {
  uploadReferenceLogo,
  getReferenceLogoUrl,
  downloadTrainingObject,
} from '../../services/storage';
import { optionalAuth } from '../../middleware/auth';
import { logger } from '../../core/logger';
import prisma from '../../core/db';
import { KEURMERK_CATEGORY } from '../../services/provenance';
import { mlClient } from '../../services/ml-client';
import { markBaselineStale } from '../../services/flywheel/baseline';
import { resolveFieldType } from '../../services/field-type-mapping';
import { REAL_CROP_SOURCES } from '../../services/flywheel/bootstrap-run';

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

/**
 * Story 20.13 — kies het VOORBEELDlogo op HERKOMST, niet op alfabet.
 *
 * Voorheen: `findFirst({ orderBy: { variantLabel: 'asc' } })`. Dat is willekeurig
 * ten opzichte van wat een reviewer moet zien. Gemeten op ACC (2026-07-27) toonden
 * 9 van de 53 codes met een gidslogo iets anders, langs twee patronen:
 *   - `auto-…` (vliegwiel-promotie) sorteert vóór `gs1-guide` → RECYCLABLE_GENERAL_CLAIM
 *     liet een nagenoeg witte auto-crop zien, dus een leeg vakje;
 *   - `default` (oude wikimedia-rijen) sorteert vóór `gs1-guide` → o.a. EU_ORGANIC_FARMING
 *     en GREEN_DOT toonden het wikimedia-plaatje i.p.v. het op 2026-07-26 geseede
 *     officiële GS1-logo.
 *
 * Het voorbeeld vertelt de reviewer WAAR hij naar zoekt; een willekeurige uitsnede
 * kan hem juist op het verkeerde been zetten. Vandaar een expliciete rangorde:
 *   1. officieel zaadlogo (GS1-gids; voor Nutri-Score het synthetische zaad)
 *   2. door een mens bevestigde crop
 *   3. overige echte crops (POC / vliegwiel-promotie)
 *   4. de rest (o.a. de historische wikimedia-`default`-rijen, en `source: null`)
 *
 * Binnen een categorie `variantLabel asc` → deterministisch (AC5).
 * Weergave-only: raakt `reference_logos`/embeddings en dus de herkenning niet.
 */
const SEED_SOURCES = ['gs1-packaging-label-guide', 'synthetic-nutriscore-bootstrap'];
const HUMAN_SOURCE = 'review-confirmed';
/** De overige ECHTE-crop-bronnen (REAL_CROP_SOURCES minus de mens-bevestigde). */
const OTHER_REAL_SOURCES = REAL_CROP_SOURCES.filter((s) => s !== HUMAN_SOURCE);

export function exampleSourceRank(source: string | null | undefined): number {
  if (source && SEED_SOURCES.includes(source)) return 0;
  if (source === HUMAN_SOURCE) return 1;
  if (source && (OTHER_REAL_SOURCES as readonly string[]).includes(source)) return 2;
  // Ook `null` valt hier: de curatie-upload laat `source` leeg (zie 19.15). Die
  // rijen horen onderaan, niet bovenaan — en een `notIn`-filter zou ze juist
  // stilzwijgend WEGgooien (NULL NOT IN (...) = UNKNOWN), vandaar sorteren i.p.v.
  // filteren.
  return 3;
}

async function pickExampleReference(code: string) {
  const refs = await prisma.referenceLogo.findMany({
    where: { t3777Code: code, active: true },
    orderBy: { variantLabel: 'asc' },
  });
  if (refs.length === 0) return null;
  // Stabiele sort: `findMany` levert al op variantLabel, dus binnen dezelfde
  // herkomst-rang blijft die volgorde staan.
  return refs.reduce((best, r) =>
    exampleSourceRank(r.source) < exampleSourceRank(best.source) ? r : best
  );
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
      // Story 12.10 (AC3): field_type/gs1_field expliciet afleiden uit de code i.p.v.
      // de schema-default te laten staan — voorkomt dat curatie-uploads opnieuw
      // in de PackagingMarkedLabelAccreditationCode-default-bak belanden. Bij een
      // (zeldzame) onopgeloste ambiguïteit blijft de schema-default het vangnet
      // (fieldType/gs1Field weggelaten uit `data` → Prisma past de kolom-default toe).
      const resolvedFieldType = resolveFieldType(t3777Code);
      if (resolvedFieldType.resolution === 'unresolved') {
        logger.warn('Ambigue code bij curatie-upload — schema-default field_type toegepast', {
          t3777Code,
          note: resolvedFieldType.note,
        });
      }

      const record = await prisma.referenceLogo.create({
        data: {
          t3777Code,
          variantLabel,
          source,
          storagePath,
          active: true,
          logoId,
          ...(resolvedFieldType.fieldType ? { fieldType: resolvedFieldType.fieldType } : {}),
          ...(resolvedFieldType.gs1Field ? { gs1Field: resolvedFieldType.gs1Field } : {}),
        },
      });

      logger.info('Reference logo created', { id: record.id, t3777Code, variantLabel });

      // Baseline-invalidatie (Story 13.6, AC 3 / AD-5): handmatige curatie muteert
      // de actieve referentieset buiten batch-promotie om → markeer de baseline
      // verouderd zodat de eerstvolgende poortrun een verse nulmeting draait.
      // Best-effort — een markeerfout mag de (al geslaagde) creatie niet breken.
      void markBaselineStale('reference-curatie', (request as { user?: { userId?: string } }).user?.userId ?? null);

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
   * GET /reference-logos/code/:code/image
   * Streams the first ACTIVE reference variant image for a T3777 code
   * (downscaled), so the review station can show "this is what {code} looks
   * like" next to the artwork. Cookie-auth same-origin — presigned previews
   * carry the internal MinIO endpoint the browser cannot reach.
   *
   * Story 12.13: the review-UI's code-picker (`MobileReviewDeck`'s `RefThumb`,
   * capped at 80 rendered rows per open) renders one `<img>` per filtered
   * keurmerk code, so opening the picker fires up to ~80 of these GETs at
   * once. That legitimate bulk fanout was eating the global per-IP
   * rate-limit budget (100/60s) and causing the NEXT normal action (e.g. the
   * accept-PATCH) to be rejected.
   *
   * Fix: a generous but still-BOUNDED per-route override (3x the global
   * budget), not a full `rateLimit: false` bypass — this route has no auth
   * gate (`optionalAuth` never rejects unauthenticated callers) and each hit
   * does a DB lookup + MinIO download + a synchronous `sharp` resize, so
   * leaving it completely unmetered would turn a read-only thumbnail route
   * into an unbounded, unauthenticated resource-exhaustion vector. The
   * bounded override still comfortably covers a full picker open (~80
   * requests) several times per minute while keeping a hard ceiling on
   * sustained abuse — consistent with AC3 ("geen versoepeling van de
   * beveiliging").
   */
  fastify.get<{ Params: { code: string } }>(
    '/reference-logos/code/:code/image',
    { config: { rateLimit: { max: 300, timeWindow: 60000 } } },
    async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
      const { code } = request.params;
      // Story 20.8 review-F2 — defensie in de diepte: `code` gaat straks in een
      // storage-key (`reference-examples/<code>.png`). Weiger traversal-tekens
      // zodat rauwe input nooit `../` in de sleutel kan brengen (de bucket is al
      // vast op training-images en `.png` is geforceerd, dus niet exploiteerbaar,
      // maar dit is de enige tak die input in een key interpoleert).
      if (code.includes('/') || code.includes('\\') || code.includes('..')) {
        return reply.status(404).send({ error: 'Ongeldige code' });
      }
      const ref = await pickExampleReference(code);

      // Story 20.8 — een reviewer moet ALTIJD zien naar welk logo hij zoekt.
      // Zonder actieve referentie vallen we terug op het opgeslagen GS1-gids-
      // VOORBEELDbeeld (weergave-only: geen reference_logos-rij, geen embedding,
      // dus de herkenning blijft ongemoeid). Bestaat ook dat niet -> 404 en de
      // frontend toont een placeholder.
      if (!ref) {
        const example = await downloadTrainingObject(`reference-examples/${code}.png`);
        if (!example) {
          return reply.status(404).send({ error: 'Geen referentie voor deze code' });
        }
        reply.header('Cache-Control', 'private, max-age=3600');
        reply.header('X-Reference-Source', 'guide-example');
        // Review-F3 — normaliseer/cap net als het ref-pad (consistent, en een
        // te groot gids-voorbeeld wordt begrensd); rauw als sharp faalt.
        try {
          const out = await sharp(example)
            .resize({ width: 400, withoutEnlargement: true })
            .png()
            .toBuffer();
          return reply.type('image/png').send(out);
        } catch {
          return reply.type('image/png').send(example);
        }
      }

      const buffer = await downloadTrainingObject(ref.storagePath);
      if (!buffer) {
        return reply.status(404).send({ error: 'Referentiebeeld niet gevonden' });
      }
      reply.header('Cache-Control', 'private, max-age=3600');
      reply.header('X-Reference-Source', 'reference');
      const ext = ref.storagePath.split('.').pop()?.toLowerCase();
      if (ext === 'svg') {
        return reply.type('image/svg+xml').send(buffer);
      }
      try {
        const out = await sharp(buffer)
          .resize({ width: 400, withoutEnlargement: true })
          .png()
          .toBuffer();
        return reply.type('image/png').send(out);
      } catch {
        return reply.type('image/png').send(buffer);
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

        // Baseline-invalidatie (Story 13.6, AC 3 / AD-5): een handmatige
        // deactivatie muteert de actieve set → baseline verouderd markeren.
        void markBaselineStale('reference-curatie', (request as { user?: { userId?: string } }).user?.userId ?? null);

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
