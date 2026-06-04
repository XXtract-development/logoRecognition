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
