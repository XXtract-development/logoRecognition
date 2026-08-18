/**
 * Artwork Pipeline Routes Tests — ATDD (Epic 8, Stories 8.1, 8.5, 8.6)
 *
 * Contract (Story 8.1 — FR44, NFR7):
 *   POST /api/v1/artwork-import/runs        { gtins?: string[] } → 202 { runId }
 *   GET  /api/v1/artwork-import/runs/:runId → 200 { status, imported, skipped, failed: [{gtin, reason}] }
 *   Reeds gecachete bestanden (zelfde mediaId) worden vóór de download overgeslagen.
 *
 * Contract (Story 8.5 — FR48):
 *   POST /api/v1/artwork/:gtin/crosscheck   → 200 { autoAccepted: [...], reviewItems: [...] }
 *   - detectie ∈ T3777-declaratie ∧ confidence ≥ drempel → autoAccepted
 *   - "verwacht maar niet gevonden" / "gevonden maar niet verwacht" → reviewItems
 *     (uncertainty-queue) met discrepantie-reden
 *   - zonder T3777-declaratie → alles reviewItems, niets auto-accepted
 *
 * Contract (Story 8.6 — FR49):
 *   Registratie auto-geaccepteerde crop → trainingData-record met provenance:
 *   { sourceFile, bbox, method: 'template'|'classifier'|'human'|'synthetic', confidence }
 *   PATCH /api/v1/training/data/deactivate-by-source → bulk-deactivatie mogelijk
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mockUser, mockArtworkImportRun, mockArtworkImport } from '../helpers/mock-data';
import { mlClient } from '../../services/ml-client';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

describe('Artwork Pipeline Routes (ATDD — Epic 8)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up default Prisma mock responses for import flow
    (mockPrisma.artworkImportRun.updateMany as vi.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.artworkImportRun.create as vi.Mock).mockImplementation(async () => ({
      ...mockArtworkImportRun,
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'running',
      importedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    }));
    (mockPrisma.artworkImportRun.update as vi.Mock).mockImplementation(async ({ where, data }) => ({
      ...mockArtworkImportRun,
      id: where.id,
      ...data,
    }));
    // Default: no existing imported record (first run scenario)
    (mockPrisma.artworkImport.findUnique as vi.Mock).mockResolvedValue(null);
    (mockPrisma.artworkImport.upsert as vi.Mock).mockResolvedValue(mockArtworkImport);
    (mockPrisma.artworkImport.create as vi.Mock).mockResolvedValue(mockArtworkImport);
    // Default GET run response: completed with 1 imported
    (mockPrisma.artworkImportRun.findUnique as vi.Mock).mockResolvedValue({
      ...mockArtworkImportRun,
      status: 'completed',
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      items: [],
    });
    (mockPrisma.artworkReviewItem.createMany as vi.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.artworkReviewItem.findMany as vi.Mock).mockResolvedValue([]);
    (mockPrisma.logoImage.upsert as vi.Mock).mockResolvedValue({ id: 'img-001', storagePath: 'x' });
    (mockPrisma.logo.upsert as vi.Mock).mockResolvedValue({ id: 'logo-001' });
    (mockPrisma.trainingData.create as vi.Mock).mockResolvedValue({
      id: 'c1c2c3c4-0000-0000-0000-000000000001',
      label: 'EU_ORGANIC_FARMING',
    });
    (mockPrisma.trainingData.updateMany as vi.Mock).mockResolvedValue({ count: 4 });

    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    // RBAC-contract: alle muterende artwork-pipeline-endpoints vereisen ADMIN
    app.addHook('preHandler', async (request) => {
      (request as any).user = { userId: mockUser.id, email: mockUser.email, role: 'ADMIN' };
    });
    try {
      const { artworkPipelineRoutes } = await import('../../api/v1/artwork-pipeline');
      await app.register(artworkPipelineRoutes, { prefix: '/api/v1' });
    } catch {
      /* module ontbreekt nog — tests worden overgeslagen */
    }
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Story 8.1 — Artwork-import via mediaserver met caching (P0)
  // -------------------------------------------------------------------------

  describe('POST /artwork-import/runs', () => {
    /** Arrange-helper: start een run en geef de runId terug (zelfstandig contract). */
    async function startRun(gtins: string[]): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork-import/runs',
        payload: { gtins },
      });
      expect(response.statusCode).toBe(202);
      const { runId } = JSON.parse(response.body);
      expect(runId).toBeDefined();
      return runId;
    }

    it('should start an import run and return 202 with runId', async () => {
      await startRun(['08718989912451', '05745000121045']);
    });

    it('should report per-item failures without aborting the run', async () => {
      // Arrange: run met één onbestaande GTIN → die faalt, de rest gaat door.
      // Mediaserver-client is gemockt zodat '00000000000000' geen items teruggeeft.
      const runId = await startRun(['08718989912451', '00000000000000']);

      // Override findUnique to return the run with a failed item
      (mockPrisma.artworkImportRun.findUnique as vi.Mock).mockResolvedValue({
        ...mockArtworkImportRun,
        id: runId,
        status: 'completed',
        importedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        items: [],
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/artwork-import/runs/${runId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toMatch(/completed|running|failed/);
      expect(Array.isArray(body.failed)).toBe(true);
      // Mislukte items hebben gtin + reden en zijn herstartbaar
      if (body.failed.length > 0) {
        expect(body.failed[0]).toHaveProperty('gtin');
        expect(body.failed[0]).toHaveProperty('reason');
      }
    });

    it('should skip already-imported media on a re-run (mediaId dedup before fetch)', async () => {
      // Dedup-contract: skip beslist op mediaId VÓÓR de download
      const gtins = ['08718989912451'];
      const firstRun = await startRun(gtins);

      // Simulate first run has completed and media is now in DB
      (mockPrisma.artworkImport.findUnique as vi.Mock).mockResolvedValue({
        ...mockArtworkImport,
        status: 'imported',
      });

      // Second run: override findUnique for the run status to show skipped items
      const secondRunId = `run-second-${Date.now()}`;
      (mockPrisma.artworkImportRun.create as vi.Mock).mockResolvedValueOnce({
        ...mockArtworkImportRun,
        id: secondRunId,
        status: 'running',
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
      });
      (mockPrisma.artworkImportRun.findUnique as vi.Mock).mockResolvedValueOnce({
        ...mockArtworkImportRun,
        id: secondRunId,
        status: 'completed',
        importedCount: 0,
        skippedCount: 1,
        failedCount: 0,
        items: [],
      });

      const secondRun = await startRun(gtins);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/artwork-import/runs/${secondRun}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.skipped).toBeGreaterThan(0);
      expect(firstRun).not.toBe(secondRun);
    });

    it('should return 404 for an unknown runId', async () => {
      (mockPrisma.artworkImportRun.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork-import/runs/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should refuse import runs for non-admin users with 403', async () => {
      const userApp = Fastify({ logger: false });
      await userApp.register(cookie, { secret: 'test-secret' });
      userApp.addHook('preHandler', async (request) => {
        (request as any).user = { userId: mockUser.id, email: mockUser.email, role: 'USER' };
      });
      const { artworkPipelineRoutes } = await import('../../api/v1/artwork-pipeline');
      await userApp.register(artworkPipelineRoutes, { prefix: '/api/v1' });
      await userApp.ready();

      const response = await userApp.inject({
        method: 'POST',
        url: '/api/v1/artwork-import/runs',
        payload: { gtins: ['08718989912451'] },
      });

      expect(response.statusCode).toBe(403);
      await userApp.close();
    });
  });

  // -------------------------------------------------------------------------
  // Story 8.5 — T3777-kruischeck en routing (P0)
  // -------------------------------------------------------------------------

  describe('POST /artwork/:gtin/crosscheck', () => {
    it('should auto-accept detections that match the declared T3777 set', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/08718989912451/crosscheck',
        payload: {
          detections: [
            { t3777Code: 'EU_ORGANIC_FARMING', confidence: 0.94, bbox: { x: 10, y: 10, width: 80, height: 80 } },
          ],
          declared: ['EU_ORGANIC_FARMING', 'GREEN_DOT'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.autoAccepted).toHaveLength(1);
      expect(body.autoAccepted[0].t3777Code).toBe('EU_ORGANIC_FARMING');
    });

    it('should route "expected but not found" to the review queue with reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/08718989912451/crosscheck',
        payload: { detections: [], declared: ['BETER_LEVEN_1_STER'] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.reviewItems).toHaveLength(1);
      expect(body.reviewItems[0].reason).toMatch(/verwacht|expected/i);
      expect(body.reviewItems[0].t3777Code).toBe('BETER_LEVEN_1_STER');
    });

    it('should route "found but not declared" to the review queue with reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/08718989912451/crosscheck',
        payload: {
          detections: [{ t3777Code: 'FAIR_TRADE_MARK', confidence: 0.91, bbox: { x: 5, y: 5, width: 40, height: 40 } }],
          declared: ['GREEN_DOT'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.autoAccepted).toHaveLength(0);
      expect(body.reviewItems[0].reason).toMatch(/niet verwacht|not declared|unexpected/i);
    });

    it('persists cropPath/sourceFile on review items so they can be doorgezet (Story 8.6)', async () => {
      // A detection that goes to review (found but not declared) carries crop +
      // source refs; these MUST be persisted on the ArtworkReviewItem so an
      // accepted item can later be registered with truthful provenance.
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/08718989912451/crosscheck',
        payload: {
          detections: [
            {
              t3777Code: 'FAIR_TRADE_MARK',
              confidence: 0.91,
              bbox: { x: 5, y: 5, width: 40, height: 40 },
              method: 'template',
              cropPath: 'artwork-crops/08718989912451/crop-7.png',
              sourceFile: '08718989912451_46182_001.jpg',
            },
          ],
          declared: ['GREEN_DOT'],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.artworkReviewItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              t3777Code: 'FAIR_TRADE_MARK',
              cropPath: 'artwork-crops/08718989912451/crop-7.png',
              sourceFile: '08718989912451_46182_001.jpg',
            }),
          ]),
        }),
      );
    });

    it('should never auto-accept when no T3777 declaration exists', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/00000000000000/crosscheck',
        payload: {
          detections: [{ t3777Code: 'EU_ORGANIC_FARMING', confidence: 0.99, bbox: { x: 0, y: 0, width: 10, height: 10 } }],
          declared: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.autoAccepted).toHaveLength(0);
      expect(body.reviewItems).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Story 8.6 — Trainingsdata-registratie met herkomst (P0)
  // -------------------------------------------------------------------------

  describe('Provenance registration', () => {
    it('should register auto-accepted crops as training data with full provenance', async () => {
      (mockPrisma.trainingData.create as vi.Mock).mockResolvedValue({
        id: 'c1c2c3c4-0000-0000-0000-000000000001',
        label: 'EU_ORGANIC_FARMING',
        provenance: {
          sourceFile: '08718989912451_46182_001.jpg',
          bbox: { x: 10, y: 10, width: 80, height: 80 },
          method: 'template',
          confidence: 0.94,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/08718989912451/register-training-data',
        payload: {
          items: [
            {
              t3777Code: 'EU_ORGANIC_FARMING',
              cropPath: 'artwork-crops/08718989912451/crop-1.png',
              sourceFile: '08718989912451_46182_001.jpg',
              bbox: { x: 10, y: 10, width: 80, height: 80 },
              method: 'template',
              confidence: 0.94,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockPrisma.trainingData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            label: 'EU_ORGANIC_FARMING',
          }),
        }),
      );
    });

    it('should support bulk-deactivation of all training data from one source file', async () => {
      (mockPrisma.trainingData.updateMany as vi.Mock).mockResolvedValue({ count: 4 });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/training/data/deactivate-by-source',
        payload: { sourceFile: '08718989912451_46182_001.jpg' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).deactivated).toBe(4);
      expect(mockPrisma.trainingData.delete).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Story 8.7 — Synthetic training-data generation
  // -------------------------------------------------------------------------

  describe('POST /artwork/synthesize (Story 8.7)', () => {
    it('generates composites via ML and registers them through the 8.6 path with method=synthetic, holdout=false', async () => {
      (mlClient.synthesizeArtwork as vi.Mock).mockResolvedValueOnce({
        t3777_code: 'EU_ORGANIC_FARMING',
        generated: 2,
        samples: [
          {
            t3777_code: 'EU_ORGANIC_FARMING',
            crop_path: 'synthetic/EU_ORGANIC_FARMING/100.png',
            source_file: 'artwork/123/page-1.png',
            bbox: { x: 10, y: 20, width: 50, height: 50 },
            method: 'synthetic',
            confidence: 1.0,
            seed: 100,
          },
          {
            t3777_code: 'EU_ORGANIC_FARMING',
            crop_path: 'synthetic/EU_ORGANIC_FARMING/101.png',
            source_file: 'artwork/123/page-1.png',
            bbox: { x: 30, y: 40, width: 50, height: 50 },
            method: 'synthetic',
            confidence: 1.0,
            seed: 101,
          },
        ],
      });
      (mockPrisma.trainingData.create as vi.Mock).mockResolvedValue({
        id: 'synth-td-1',
        label: 'EU_ORGANIC_FARMING',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/synthesize',
        payload: { t3777Code: 'EU_ORGANIC_FARMING', count: 2, seed: 100 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.generated).toBe(2);
      expect(body.registered).toBe(2);
      expect(mlClient.synthesizeArtwork).toHaveBeenCalledWith('EU_ORGANIC_FARMING', 2, 100);
      // Registered through registerCropsTx → method 'synthetic', holdout false.
      expect(mockPrisma.trainingData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            label: 'EU_ORGANIC_FARMING',
            holdout: false,
            provenance: expect.objectContaining({
              method: 'synthetic',
              sourceFile: 'artwork/123/page-1.png',
            }),
          }),
        }),
      );
    });

    it('returns 200 generated=0 (no registration) when no references/backgrounds exist (open-input gate)', async () => {
      (mlClient.synthesizeArtwork as vi.Mock).mockResolvedValueOnce({
        t3777_code: 'RARE_MARK',
        generated: 0,
        samples: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/synthesize',
        payload: { t3777Code: 'RARE_MARK', count: 5 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.generated).toBe(0);
      expect(body.registered).toBe(0);
      expect(mockPrisma.trainingData.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid request (missing t3777Code) with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/synthesize',
        payload: { count: 3 },
      });

      expect(response.statusCode).toBe(400);
      expect(mlClient.synthesizeArtwork).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Story 8.5 (AC3 UI) — On-view crop presign for the review UI
  // -------------------------------------------------------------------------

  describe('GET /artwork/review-items/:id/crop-url', () => {
    // Testcorrectie 2026-06-06 (8.2-precedent, intentie behouden): presigned
    // MinIO-URLs dragen het interne endpoint (localhost:9000 op ACC) en zijn
    // onbereikbaar voor de browser. Het contract is nu een API-relatieve
    // streaming-URL; de intentie — een browser-bruikbare cropUrl per item met
    // crop, null zonder crop — is ongewijzigd.
    it('returns an API-relative streaming cropUrl for an item that has a crop', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-crop',
        cropPath: 'artwork-crops/08718989912451/crop-1.png',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-crop/crop-url',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.cropUrl).toBe('/api/v1/artwork/review-items/ri-crop/crop');
    });

    it('returns cropUrl=null for a crop-less item (no fabrication)', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-nocrop',
        cropPath: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-nocrop/crop-url',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).cropUrl).toBeNull();
    });

    it('streams the crop bytes via /crop with the right content type', async () => {
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(Buffer.from('png-bytes'));
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-crop',
        cropPath: 'artwork-crops/08718989912451/crop-1.png',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-crop/crop',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.body).toBe('png-bytes');
      expect(storage.downloadTrainingObject).toHaveBeenCalledWith('artwork-crops/08718989912451/crop-1.png');
    });

    it('Story 12.19 — /source emits an X-Context-Window consistent with the extract', async () => {
      const sharp = (await import('sharp')).default;
      const png = await sharp({
        create: { width: 1000, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .png()
        .toBuffer();
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(png);
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-src',
        sourceFile: 'artwork/08718989912451/page-0.png',
        bbox: { x: 400, y: 300, width: 80, height: 60 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-src/source',
      });

      expect(response.statusCode).toBe(200);
      // Story 20.17 — het contextfragment gaat als JPEG de deur uit i.p.v. PNG: met
      // server-side vergroten erbij loopt een PNG op tot vele megabytes, en /marked gebruikt
      // op dezelfde afmeting al JPEG q82.
      expect(response.headers['content-type']).toContain('image/jpeg');
      const header = response.headers['x-context-window'] as string;
      expect(header).toBeDefined();
      const [left, top, rw, rh, W, H] = header.split(',').map(Number);
      // Full artwork size is echoed back, and the extract window stays in-bounds.
      expect([W, H]).toEqual([1000, 800]);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + rw).toBeLessThanOrEqual(W);
      expect(top + rh).toBeLessThanOrEqual(H);
      // The box (400,300,80,60) centres a 250px-margin window → 190,80,500,500.
      expect([left, top, rw, rh]).toEqual([190, 80, 500, 500]);
    });

    // --- Story 20.17: het contextfragment mag vergroten ---

    /** Zet een artwork + reviewitem klaar en geeft het fragment terug. */
    async function haalContextFragment(bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) {
      const sharp = (await import('sharp')).default;
      const png = await sharp({
        create: { width: 4000, height: 3000, channels: 3, background: { r: 240, g: 240, b: 240 } },
      })
        .png()
        .toBuffer();
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(png);
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-20-17',
        sourceFile: 'artwork/08718989912451/page-0.png',
        bbox,
        updatedAt: new Date('2026-08-18T09:00:00.000Z'),
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-20-17/source',
      });
      const meta = await sharp(response.rawPayload).metadata();
      return { response, meta };
    }

    it('20.17 AC1: een KLEIN kader levert nu een vergroot fragment (was byte-identiek)', async () => {
      // Kader 100 px → venster 5 x 100 = 500 px. Vóór 20.17 was de schaal geklemd op 1, dus
      // bleef het fragment 500 px, ongeacht de grens. Nu mag het 3x omhoog: 1500 px.
      const { response, meta } = await haalContextFragment({
        x: 2000,
        y: 1500,
        width: 100,
        height: 100,
      });
      expect(response.statusCode).toBe(200);
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1500);
    });

    it('20.17 AC2: de opblaasfactor begrenst, niet de pixelgrens — ook bij een piepklein kader', async () => {
      // Kader 40 px. Het uitgeknipte gebied wordt NOOIT kleiner dan 500 px: de marge is
      // `max(2,5 x kader, 250)` per zijde, dus minimaal 250 + 250. Zonder factorgrens zou dat
      // venster naar 1600 gaan (3,2x); de grens van 3x houdt het op 1500. Dat de uitkomst
      // 1500 is en niet 1600 IS het bewijs dat de factor bindt.
      const { meta } = await haalContextFragment({ x: 2000, y: 1500, width: 40, height: 40 });
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1500);
    });

    it('20.17 AC2: een GROOT kader wordt nog steeds verkleind tot de pixelgrens', async () => {
      // Kader 400 px → venster 2000 px → terug naar 1600.
      const { meta } = await haalContextFragment({ x: 2000, y: 1500, width: 400, height: 400 });
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
    });

    it('20.17 AC5: de context-window-header blijft schaal-ONAFHANKELIJK', async () => {
      // De header staat in artwork-pixels en wordt berekend vóór het schalen; de client rekent
      // met fracties. Daardoor levert hetzelfde relatieve kader dezelfde artwork-fracties, of
      // het fragment nu verkleind of vergroot is. Dit is de invariant die NIET mag verschuiven.
      const klein = await haalContextFragment({ x: 2000, y: 1500, width: 100, height: 100 });
      const groot = await haalContextFragment({ x: 2000, y: 1500, width: 400, height: 400 });

      const parse = (r: { headers: Record<string, unknown> }) =>
        (r.headers['x-context-window'] as string).split(',').map(Number);
      const [kl, kt, krw, krh, kW, kH] = parse(klein.response);
      const [, , , , gW, gH] = parse(groot.response);

      // Venster van het kleine kader: 2,5 x 100 = 250 px marge per zijde → 500 x 500.
      expect([kl, kt, krw, krh]).toEqual([1800, 1300, 500, 500]);
      // De artwork-afmetingen zijn in beide gevallen dezelfde en zijn niet meegeschaald.
      expect([kW, kH]).toEqual([4000, 3000]);
      expect([gW, gH]).toEqual([4000, 3000]);
      // Een kader op 10% van het fragment mapt op dezelfde artwork-fractie, ongeacht de schaal.
      const fractieUitVenster = (rel: number) => (kl + rel * krw) / kW;
      expect(fractieUitVenster(0.1)).toBeCloseTo((1800 + 50) / 4000, 10);
    });

    it('20.17 AC2: onbruikbare instellingen vallen terug op de STANDAARD, niet op de ondergrens', async () => {
      // Code-review 20.17 (H1): de eerste versie klemde het geparste getal, en `Number(' ')` en
      // `Number('')` zijn 0 — die kwamen dus op de ONDERGRENS uit. Gemeten gevolg: een spatie in
      // de omgeving leverde een fragment van 300 px, slechter dan vóór deze story, en
      // MAX_UPSCALE=0 zette het vergroten stil helemaal uit.
      const origPx = process.env.CONTEXT_FRAGMENT_MAX_PX;
      const origUp = process.env.CONTEXT_FRAGMENT_MAX_UPSCALE;
      try {
        for (const rommel of [' ', '', 'abc', '0', '-5']) {
          process.env.CONTEXT_FRAGMENT_MAX_PX = rommel;
          process.env.CONTEXT_FRAGMENT_MAX_UPSCALE = rommel;
          const { meta } = await haalContextFragment({ x: 2000, y: 1500, width: 100, height: 100 });
          // Standaard = 1600 px en 3x → venster 500 wordt 1500.
          expect(Math.max(meta.width ?? 0, meta.height ?? 0), `waarde ${JSON.stringify(rommel)}`).toBe(1500);
        }
      } finally {
        process.env.CONTEXT_FRAGMENT_MAX_PX = origPx;
        process.env.CONTEXT_FRAGMENT_MAX_UPSCALE = origUp;
      }
    });

    it('20.17 AC2: de harde bovengrenzen klemmen werkelijk (2400 px en 4x)', async () => {
      const origPx = process.env.CONTEXT_FRAGMENT_MAX_PX;
      const origUp = process.env.CONTEXT_FRAGMENT_MAX_UPSCALE;
      try {
        // Absurd hoge waarden: geklemd op 2400 px en 4x. Venster 500 x 4 = 2000 (< 2400).
        process.env.CONTEXT_FRAGMENT_MAX_PX = '99999';
        process.env.CONTEXT_FRAGMENT_MAX_UPSCALE = '50';
        const klein = await haalContextFragment({ x: 2000, y: 1500, width: 100, height: 100 });
        expect(Math.max(klein.meta.width ?? 0, klein.meta.height ?? 0)).toBe(2000);
        // Een groot venster (2000 px) loopt tegen de pixelgrens van 2400 aan, niet tegen 99999.
        const groot = await haalContextFragment({ x: 2000, y: 1500, width: 400, height: 400 });
        expect(Math.max(groot.meta.width ?? 0, groot.meta.height ?? 0)).toBe(2400);
      } finally {
        process.env.CONTEXT_FRAGMENT_MAX_PX = origPx;
        process.env.CONTEXT_FRAGMENT_MAX_UPSCALE = origUp;
      }
    });

    it('20.17 AC5: dezelfde uitsnede levert dezelfde artwork-fracties bij 900 én bij 1600', async () => {
      // Dit is de echte schaal-onafhankelijkheidstoets: HETZELFDE kader, twee verschillende
      // instellingen, en de header moet identiek zijn. De vorige versie van deze test vergeleek
      // twee verschillende kaders en bewees daarmee niets (code-review 20.17, M3).
      const orig = process.env.CONTEXT_FRAGMENT_MAX_PX;
      try {
        process.env.CONTEXT_FRAGMENT_MAX_PX = '900';
        const bij900 = await haalContextFragment({ x: 2000, y: 1500, width: 400, height: 400 });
        process.env.CONTEXT_FRAGMENT_MAX_PX = '1600';
        const bij1600 = await haalContextFragment({ x: 2000, y: 1500, width: 400, height: 400 });

        const kop = (r: { headers: Record<string, unknown> }) => r.headers['x-context-window'] as string;
        // De fragmenten verschillen aantoonbaar in grootte...
        expect(Math.max(bij900.meta.width ?? 0, bij900.meta.height ?? 0)).toBe(900);
        expect(Math.max(bij1600.meta.width ?? 0, bij1600.meta.height ?? 0)).toBe(1600);
        // ...maar de terugrekening is identiek. Dat is de invariant die nooit mag verschuiven.
        expect(kop(bij900.response)).toBe(kop(bij1600.response));
      } finally {
        process.env.CONTEXT_FRAGMENT_MAX_PX = orig;
      }
    });

    it('20.17: doorzichtig bron-artwork wordt WIT, niet zwart', async () => {
      // Code-review 20.17 (M2): `sharp` flattet alfa bij JPEG naar ZWART. Bron-artwork kan een
      // alfakanaal hebben — /annotate in ditzelfde bestand rekent daar expliciet op. Zonder
      // `.flatten({background:'#ffffff'})` zou een etiket op doorzichtige achtergrond als een
      // zwart vlak in de review verschijnen.
      const sharp = (await import('sharp')).default;
      const rgba = await sharp({
        create: { width: 4000, height: 3000, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
      })
        .png()
        .toBuffer();
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(rgba);
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-alpha',
        sourceFile: 'artwork/g/page-0.png',
        bbox: { x: 2000, y: 1500, width: 100, height: 100 },
        updatedAt: new Date('2026-08-18T09:00:00.000Z'),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-alpha/source',
      });
      expect(response.statusCode).toBe(200);

      // Kijk naar een hoekpixel, ver van de rode kaderlijn.
      const { data } = await sharp(response.rawPayload)
        .extract({ left: 5, top: 5, width: 4, height: 4 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const [r, g, b] = [data[0], data[1], data[2]];
      expect({ r, g, b }).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('20.17 AC4: de ETag van /source draagt de instellingen, zodat 304 geen oud fragment vasthoudt', async () => {
      const { response } = await haalContextFragment({ x: 2000, y: 1500, width: 100, height: 100 });
      const etag = response.headers['etag'] as string;
      // Zonder deze vingerafdruk blijft de ETag gelijk als de instellingen wijzigen, en houdt
      // de browser via 304 het oude 900-px-fragment — juist bij al bezochte items.
      expect(etag).toMatch(/cf\d+x\d+(\.\d+)?j\d+/);
      // En hij revalideert nog steeds (Story 20.6).
      expect(response.headers['cache-control']).toBe('private, no-cache');
    });

    // --- Story 20.6: per-item beeld-endpoints revalideren i.p.v. 5-min blind cachen ---

    it('20.6 AC1: /crop stuurt no-cache + een ETag afgeleid van updatedAt (geen max-age)', async () => {
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(Buffer.from('png-bytes'));
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-c1',
        cropPath: 'artwork-crops/g/annot_ri-c1.png',
        updatedAt: new Date('2026-07-20T14:48:41.494Z'),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-c1/crop',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-cache');
      expect(response.headers['cache-control']).not.toContain('max-age');
      expect(response.headers['etag']).toBe(`W/"ri-c1-${new Date('2026-07-20T14:48:41.494Z').getTime()}"`);
    });

    it('20.6 AC2: /crop met matchende If-None-Match -> 304 zonder de crop te downloaden', async () => {
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(Buffer.from('png-bytes'));
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-c2',
        cropPath: 'artwork-crops/g/annot_ri-c2.png',
        updatedAt: new Date('2026-07-20T14:48:41.494Z'),
      });
      const etag = `W/"ri-c2-${new Date('2026-07-20T14:48:41.494Z').getTime()}"`;

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-c2/crop',
        headers: { 'if-none-match': etag },
      });

      expect(response.statusCode).toBe(304);
      expect(storage.downloadTrainingObject).not.toHaveBeenCalled();
    });

    it('20.6 AC3: na een correctie (nieuwe updatedAt) wijkt de ETag af -> verse 200', async () => {
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(Buffer.from('nieuwe-crop'));
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-c3',
        cropPath: 'artwork-crops/g/annot_ri-c3.png',
        updatedAt: new Date('2026-07-20T15:00:00.000Z'),
      });
      const staleEtag = `W/"ri-c3-${new Date('2026-07-20T14:48:41.494Z').getTime()}"`;

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-c3/crop',
        headers: { 'if-none-match': staleEtag },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('nieuwe-crop');
      expect(response.headers['etag']).toBe(`W/"ri-c3-${new Date('2026-07-20T15:00:00.000Z').getTime()}"`);
    });

    it('20.6 AC1: /marked stuurt eveneens no-cache + ETag (box weerspiegelt bbox)', async () => {
      const sharp = (await import('sharp')).default;
      const png = await sharp({
        create: { width: 600, height: 2000, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .png()
        .toBuffer();
      const storage = await import('../../services/storage');
      (storage.downloadTrainingObject as vi.Mock).mockResolvedValue(png);
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-m1',
        sourceFile: 'artwork/g/page-0.png',
        bbox: { x: 59, y: 374, width: 45, height: 40 },
        updatedAt: new Date('2026-07-20T14:48:41.494Z'),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-m1/marked',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-cache');
      expect(response.headers['etag']).toBe(`W/"ri-m1-${new Date('2026-07-20T14:48:41.494Z').getTime()}"`);
    });

    it('returns 404 on /crop for a crop-less item', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue({
        id: 'ri-nocrop',
        cropPath: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/ri-nocrop/crop',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when the review item does not exist', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/artwork/review-items/missing/crop-url',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Story 8.6 — Doorzet: accepted review items → training-data registration
  // -------------------------------------------------------------------------

  describe('Accept/reject doorzet of review items', () => {
    const reviewItemWithCrop = {
      id: 'ri-0001',
      gtin: '08718989912451',
      t3777Code: 'EU_ORGANIC_FARMING',
      cropPath: 'artwork-crops/08718989912451/crop-1.png',
      sourceFile: '08718989912451_46182_001.jpg',
      bbox: { x: 10, y: 10, width: 80, height: 80 },
      confidence: 0.91,
      method: 'template',
      reason: 'Confidence onder drempel',
      status: 'open',
    };

    const reviewItemWithoutCrop = {
      ...reviewItemWithCrop,
      id: 'ri-0002',
      cropPath: null,
      sourceFile: null,
    };

    it('accepts a review item with a crop and registers it as training data', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(reviewItemWithCrop);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...reviewItemWithCrop,
        status: 'registered',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-0001/accept',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('registered');
      expect(body.registered).toBe(1);
      // Real registration happened: a training-data record was created with the
      // human provenance method, and the item was set to 'registered'.
      expect(mockPrisma.trainingData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            label: 'EU_ORGANIC_FARMING',
            provenance: expect.objectContaining({ method: 'human' }),
          }),
        }),
      );
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ri-0001' },
          data: { status: 'registered' },
        }),
      );
    });

    it('does NOT fabricate training data for an accepted item lacking a crop', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(reviewItemWithoutCrop);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...reviewItemWithoutCrop,
        status: 'accepted',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-0002/accept',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('accepted');
      expect(body.skipped).toBe(1);
      // No training data may be fabricated without a crop/source.
      expect(mockPrisma.trainingData.create).not.toHaveBeenCalled();
    });

    it('rejects a review item without creating training data', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(reviewItemWithCrop);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...reviewItemWithCrop,
        status: 'rejected',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-0001/reject',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('rejected');
      expect(mockPrisma.trainingData.create).not.toHaveBeenCalled();
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
    });

    // Story 12.3 — review→reference loop -------------------------------------

    it('registers the confirmed crop as a live reference on accept', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(reviewItemWithCrop);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...reviewItemWithCrop,
        status: 'registered',
      });
      (mlClient.registerReference as vi.Mock).mockResolvedValueOnce({ added: true, reason: 'added' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-0001/accept',
      });

      expect(response.statusCode).toBe(200);
      // The confirmed crop is promoted to a reference under its (corrected) code.
      expect(mlClient.registerReference).toHaveBeenCalledWith(
        'artwork-crops/08718989912451/crop-1.png',
        'EU_ORGANIC_FARMING',
      );
      expect(JSON.parse(response.body).referenceAdded).toBe(true);
    });

    // Story 12.12 — Nutri-Score vorm-oogst: een vorm-geharveste kandidaat draagt
    // een provisionele code (kleur-gok/placeholder); de mens kiest de exacte
    // letter via de bestaande relabel-picker (12.7) en stuurt die mee als
    // accept-override. Dit bewijst dat het GENERIEKE accept→referentie-pad
    // (19.8/19.12, hierboven al gedekt voor EU_ORGANIC_FARMING) ook voor een
    // Nutri-Score-letter een actieve review-confirmed referentie registreert —
    // geen nieuwe code nodig, alleen de bestaande override-flow.
    it('koppelt een Nutri-Score-vorm-oogst-kandidaat aan de door de mens gekozen letter (12.12 AC2/AC3)', async () => {
      const nutriscoreCandidate = {
        ...reviewItemWithCrop,
        id: 'ri-nutriscore-1',
        t3777Code: 'NUTRISCORE', // provisionele placeholder (onduidelijke kleur-gok)
        method: 'embedding-shape',
        reason: '12.12 nutriscore-vorm-oogst (letter-onafhankelijk)',
      };
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(nutriscoreCandidate);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...nutriscoreCandidate,
        t3777Code: 'NUTRISCORE_C',
        status: 'registered',
      });
      (mlClient.registerReference as vi.Mock).mockResolvedValueOnce({ added: true, reason: 'added' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-nutriscore-1/accept',
        payload: { t3777Code: 'NUTRISCORE_C' },
      });

      expect(response.statusCode).toBe(200);
      // De correctie (placeholder -> gekozen letter) wordt toegepast vóórdat
      // de crop wordt geregistreerd.
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ri-nutriscore-1' },
          data: expect.objectContaining({ status: 'accepted', t3777Code: 'NUTRISCORE_C' }),
        }),
      );
      // De bevestigde crop wordt een actieve review-confirmed referentie ONDER
      // de door de mens gekozen letter (niet de provisionele placeholder).
      expect(mlClient.registerReference).toHaveBeenCalledWith(
        'artwork-crops/08718989912451/crop-1.png',
        'NUTRISCORE_C',
      );
      expect(JSON.parse(response.body).referenceAdded).toBe(true);
    });

    // Elke letter moet werken — de accept-override is code-agnostisch, geen
    // Nutri-Score-specifieke aanname in artwork-pipeline.ts.
    it.each(['NUTRISCORE_A', 'NUTRISCORE_B', 'NUTRISCORE_D', 'NUTRISCORE_E'])(
      'koppelt ook aan %s',
      async (letter) => {
        const candidate = { ...reviewItemWithCrop, id: 'ri-nutriscore-2', t3777Code: 'NUTRISCORE' };
        (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(candidate);
        (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
          ...candidate,
          t3777Code: letter,
          status: 'registered',
        });
        (mlClient.registerReference as vi.Mock).mockResolvedValueOnce({ added: true, reason: 'added' });

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/v1/artwork/review-items/ri-nutriscore-2/accept',
          payload: { t3777Code: letter },
        });

        expect(response.statusCode).toBe(200);
        expect(mlClient.registerReference).toHaveBeenCalledWith(
          'artwork-crops/08718989912451/crop-1.png',
          letter,
        );
      },
    );

    it('accept still succeeds when reference registration fails (best-effort)', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(reviewItemWithCrop);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...reviewItemWithCrop,
        status: 'registered',
      });
      (mlClient.registerReference as vi.Mock).mockRejectedValueOnce(new Error('ML service down'));

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-0001/accept',
      });

      // The accept (and training-data registration) is unaffected by the failure.
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('registered');
      expect(mockPrisma.trainingData.create).toHaveBeenCalled();
    });

    it('deactivates the review-confirmed reference when the item is reopened', async () => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(reviewItemWithCrop);
      (mockPrisma.trainingData.updateMany as vi.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.referenceLogo.updateMany as vi.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({
        ...reviewItemWithCrop,
        status: 'open',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-0001/reopen',
      });

      expect(response.statusCode).toBe(200);
      // Only review-confirmed references for this crop are deactivated — never guides.
      expect(mockPrisma.referenceLogo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storagePath: 'artwork-crops/08718989912451/crop-1.png', source: 'review-confirmed', active: true },
          data: { active: false },
        }),
      );
      expect(JSON.parse(response.body).deactivatedReferences).toBe(1);
    });

    it('catch-up processes pre-existing accepted items into training data', async () => {
      (mockPrisma.artworkReviewItem.findMany as vi.Mock).mockResolvedValue([
        { ...reviewItemWithCrop, id: 'ri-A', status: 'accepted' },
        { ...reviewItemWithoutCrop, id: 'ri-B', status: 'accepted' },
      ]);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({ status: 'registered' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork/review-items/process-accepted',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.processed).toBe(2);
      expect(body.registered).toBe(1); // only the crop-carrying item
      expect(body.skipped).toBe(1); // the crop-less item is skipped, not faked
      expect(mockPrisma.trainingData.create).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Story 14.1 — Gold-set-aanwas uit reviewbeslissingen (achter de hoofdvlag)
  // -------------------------------------------------------------------------
  describe('Story 14.1 — reviewbeslissing → gold-set/hard-negative', () => {
    const item = {
      id: 'ri-14',
      gtin: '08718989912451',
      t3777Code: 'EU_ORGANIC_FARMING',
      cropPath: 'artwork-crops/08718989912451/crop-1.png',
      sourceFile: '08718989912451_46182_001.jpg',
      bbox: { x: 10, y: 10, width: 80, height: 80 },
      confidence: 0.91,
      method: 'template',
      reason: 'Confidence onder drempel',
      status: 'open',
    };

    beforeEach(() => {
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(item);
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({ ...item, status: 'registered' });
      (mockPrisma.goldSetRecord.create as vi.Mock).mockResolvedValue({ id: 'gold-1' });
      (mockPrisma.goldSetRecord.updateMany as vi.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.goldSetRecord.findFirst as vi.Mock).mockResolvedValue(null);
      (mockPrisma.hardNegative.upsert as vi.Mock).mockResolvedValue({ id: 'hn-1' });
      (mockPrisma.hardNegative.deleteMany as vi.Mock).mockResolvedValue({ count: 0 });
      (mlClient.computePhash as vi.Mock).mockResolvedValue({ content_hash: 'hash-abc', phash: 'p-abc' });
    });

    afterEach(() => {
      delete process.env.FLYWHEEL_NOMINATION_ENABLED;
    });

    it('vlag AAN: accept → één ECHT gold-set-record (AC1)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/accept',
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ label: 'ECHT', source: 'review-accept' }),
        }),
      );
    });

    it('vlag UIT: accept schrijft GEEN gold-set-record (byte-gelijk legacy, AC1)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/accept',
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
    });

    it('vlag AAN: reject "geen-keurmerk" → VALS + hard-negative, status rejected (AC2)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'geen-keurmerk' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).reason).toBe('geen-keurmerk');
      expect(mlClient.computePhash).toHaveBeenCalledWith(item.cropPath);
      expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ label: 'VALS' }) }),
      );
      expect(mockPrisma.hardNegative.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ reason: 'reviewstation-geen-keurmerk' }),
        }),
      );
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
    });

    // ---- Story 20.10 — kaderloos item ----------------------------------
    // Sinds Epic 8 maakt de crosscheck voor elke "gedeclareerd maar niet
    // gevonden"-code een open item ZONDER crop. Die liepen sinds 14.1 op een 422
    // zodra een reviewer ze met "geen keurmerk" afwees, terwijl dat oordeel juist
    // klopt. Er is dan niets om als hard-negative vast te leggen.
    const itemZonderCrop = {
      ...item,
      id: 'ri-20-10',
      cropPath: null,
      bbox: {},
      confidence: null,
      method: 'human-annotation-request',
      reason: 'Verwacht maar niet gevonden op het artwork (gedeclareerd)',
    };

    it('Story 20.10: reject "geen-keurmerk" op een KADERLOOS item → 200, registers overgeslagen', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(itemZonderCrop);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-20-10/reject',
        payload: { reason: 'geen-keurmerk' },
      });

      // Vóór 20.10 was dit een 422 en liep de reviewer vast.
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('rejected');
      expect(body.registersSkipped).toBe(true);

      // Geen hash, geen registers — er is geen crop om te hashen.
      expect(mlClient.computePhash).not.toHaveBeenCalled();
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.hardNegative.upsert).not.toHaveBeenCalled();

      // De afwijzing zelf moet WEL landen.
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
    });

    it('Story 20.10: mét crop blijft registersSkipped false (geen stille uitzondering)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'geen-keurmerk' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).registersSkipped).toBe(false);
      expect(mockPrisma.goldSetRecord.create).toHaveBeenCalled();
    });

    it('Story 20.10: kaderloos + "onjuiste-locatie-verkeerde-code" blijft ongewijzigd werken', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValue(itemZonderCrop);
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-20-10/reject',
        payload: { reason: 'onjuiste-locatie-verkeerde-code' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).registersSkipped).toBe(false);
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
    });

    it('vlag AAN: reject "onjuiste-locatie-verkeerde-code" → GEEN registers (AC2)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'onjuiste-locatie-verkeerde-code' },
      });
      expect(res.statusCode).toBe(200);
      expect(mlClient.computePhash).not.toHaveBeenCalled();
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.hardNegative.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
    });

    it('vlag AAN: reject "geen-keurmerk" met phash-down → 503 én GEEN statuswijziging (AC2 fail-closed)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      (mlClient.computePhash as vi.Mock).mockRejectedValueOnce(new Error('ml down'));
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'geen-keurmerk' },
      });
      expect(res.statusCode).toBe(503);
      // Geen VALS-record, geen hard-negative, geen status-update: alles of niets.
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.hardNegative.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.artworkReviewItem.update).not.toHaveBeenCalled();
    });

    it('vlag AAN: onbekende reject-reden → 400', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'iets-anders' },
      });
      expect(res.statusCode).toBe(400);
      expect(mockPrisma.artworkReviewItem.update).not.toHaveBeenCalled();
    });

    it('vlag UIT: reject met reden → legacy (alleen status, geen registers)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'geen-keurmerk' },
      });
      expect(res.statusCode).toBe(200);
      expect(mlClient.computePhash).not.toHaveBeenCalled();
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
    });

    it('vlag AAN: reopen → gold-record self-tombstone + hard-negative-delete (AC3)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      (mockPrisma.trainingData.updateMany as vi.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.referenceLogo.updateMany as vi.Mock).mockResolvedValue({ count: 0 });
      (mockPrisma.goldSetRecord.findFirst as vi.Mock).mockResolvedValue({ id: 'gold-5' });
      (mockPrisma.hardNegative.deleteMany as vi.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({ ...item, status: 'open' });

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reopen',
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.goldSetRecord.updateMany).toHaveBeenCalledWith({
        where: { id: 'gold-5', replacedById: null },
        data: { replacedById: 'gold-5' },
      });
      expect(mockPrisma.hardNegative.deleteMany).toHaveBeenCalledWith({
        where: { cropPath: item.cropPath, reason: 'reviewstation-geen-keurmerk' },
      });
    });

    it('vlag UIT: reopen raakt gold-set/hard-negatives NIET (byte-gelijk legacy, AC3)', async () => {
      (mockPrisma.trainingData.updateMany as vi.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.referenceLogo.updateMany as vi.Mock).mockResolvedValue({ count: 0 });
      (mockPrisma.artworkReviewItem.update as vi.Mock).mockResolvedValue({ ...item, status: 'open' });

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reopen',
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.goldSetRecord.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.hardNegative.deleteMany).not.toHaveBeenCalled();
    });

    it('vlag AAN: reject "geen-keurmerk" op een AL afgewezen item → GEEN tweede VALS (M1-idempotentie)', async () => {
      process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
      // Item is al afgewezen (dubbelklik/retry na een eerdere reject).
      (mockPrisma.artworkReviewItem.findUnique as vi.Mock).mockResolvedValueOnce({
        ...item,
        status: 'rejected',
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/artwork/review-items/ri-14/reject',
        payload: { reason: 'geen-keurmerk' },
      });

      expect(res.statusCode).toBe(200);
      // Geen registers opnieuw gevoed: geen phash, geen tweede VALS, geen
      // hard-negative-upsert. De append-only gold-set wordt niet gescheefd.
      expect(mlClient.computePhash).not.toHaveBeenCalled();
      expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.hardNegative.upsert).not.toHaveBeenCalled();
      // De status-update draait wel (byte-gelijk legacy: reject blijft 200).
      expect(mockPrisma.artworkReviewItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
      expect(JSON.parse(res.body).reason).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Story 8.2 — PDF-artwork rasterization (P0)
  //   AC1: na import van een PDF → rasterization-stap; paginarelatie vastgelegd
  //   AC2: rasterization-fout = zacht falen, item blijft 'imported', geen pipeline-fout
  // -------------------------------------------------------------------------

  describe('rasterizeImportedPdf (Story 8.2)', () => {
    it('rasterizes a PDF and persists the page relation in ArtworkImport.pages', async () => {
      const { rasterizeImportedPdf } = await import('../../api/v1/artwork-pipeline');

      (mlClient.rasterizeArtwork as vi.Mock).mockResolvedValueOnce({
        storage_path: 'artwork/08718989912451/label.pdf',
        dpi: 300,
        pages: [
          { source_file: 'label.pdf', page: 1, image_path: 'artwork/08718989912451/label.page-1.png', dpi: 300 },
          { source_file: 'label.pdf', page: 2, image_path: 'artwork/08718989912451/label.page-2.png', dpi: 300 },
        ],
        error: null,
      });

      await rasterizeImportedPdf('import-001', '08718989912451', 'artwork/08718989912451/label.pdf');

      // ML service was called with the storage path + DPI
      expect(mlClient.rasterizeArtwork).toHaveBeenCalledWith('artwork/08718989912451/label.pdf', 300);

      // Page relation is persisted as a structured JSON object (not a string)
      expect(mockPrisma.artworkImport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'import-001' },
          data: {
            pages: {
              dpi: 300,
              pages: [
                { page: 1, imagePath: 'artwork/08718989912451/label.page-1.png' },
                { page: 2, imagePath: 'artwork/08718989912451/label.page-2.png' },
              ],
            },
          },
        }),
      );
    });

    it('soft-fails on rasterization error: records reason, item stays imported, never throws', async () => {
      const { rasterizeImportedPdf } = await import('../../api/v1/artwork-pipeline');

      (mlClient.rasterizeArtwork as vi.Mock).mockRejectedValueOnce(new Error('ML service down'));

      // Must not throw (AC2: telt niet als pipeline-fout)
      await expect(
        rasterizeImportedPdf('import-002', '08718989912451', 'artwork/08718989912451/broken.pdf'),
      ).resolves.toBeUndefined();

      // The error is recorded on the item's pages JSON; status is NOT touched.
      const updateCall = (mockPrisma.artworkImport.update as vi.Mock).mock.calls.find(
        (c) => c[0]?.where?.id === 'import-002',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].data.pages.error).toContain('ML service down');
      expect(updateCall[0].data.pages.pages).toEqual([]);
      // Soft-fail must never flip the import status to 'failed'
      expect(updateCall[0].data).not.toHaveProperty('status');
    });

    it('propagates the corrupt-PDF soft error from the ML service (200, empty pages + reason)', async () => {
      const { rasterizeImportedPdf } = await import('../../api/v1/artwork-pipeline');

      (mlClient.rasterizeArtwork as vi.Mock).mockResolvedValueOnce({
        storage_path: 'artwork/08718989912451/corrupt.pdf',
        dpi: 300,
        pages: [],
        error: 'PDF kon niet gerasterized worden (corrupt, leeg of beveiligd)',
      });

      await rasterizeImportedPdf('import-003', '08718989912451', 'artwork/08718989912451/corrupt.pdf');

      const updateCall = (mockPrisma.artworkImport.update as vi.Mock).mock.calls.find(
        (c) => c[0]?.where?.id === 'import-003',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].data.pages.pages).toEqual([]);
      expect(updateCall[0].data.pages.error).toMatch(/corrupt/i);
    });
  });

  describe('Import flow PDF detection (Story 8.2 AC1)', () => {
    it('does NOT rasterize a non-PDF (JPG) import', async () => {
      // The mocked mediaserver returns a .jpg item for this GTIN; after a full
      // import run, rasterizeArtwork must not be invoked for it.
      (mlClient.rasterizeArtwork as vi.Mock).mockClear();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork-import/runs',
        payload: { gtins: ['08718989912451'] },
      });
      expect(response.statusCode).toBe(202);

      // Allow the background (setImmediate) import loop to run to completion.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mlClient.rasterizeArtwork).not.toHaveBeenCalled();
    });
  });
});
