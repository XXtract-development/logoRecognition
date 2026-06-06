/**
 * Artwork Detection Orchestration Tests — ATDD RED PHASE (Story 8-3O, Epic 8-nazorg)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `it.skip`; verwijder de `.skip` per test zodra
 * story 8-3O geïmplementeerd is (ná 8-3P).
 *
 * Verwachte module-indeling (contract uit de bevroren ontwerpbeslissingen,
 * adversarial review O1–O8/S3 verwerkt — zie review-8-3POD-voorwerk.md):
 *   services/artwork-crosscheck.ts            — crosscheck-logica als service
 *       (byte-gelijk gedrag aan de huidige route incl. declared=[]-regel);
 *       route wordt dunne wrapper
 *   services/pipeline/detection-flow.ts       — worker-flow per artwork-beeld:
 *       dedup-pre-filter → mlClient.localizeArtwork → mlClient.classifyArtwork
 *       (persist_crops) → crosscheckService → registerCropsTx (auto-accepts)
 *   services/pipeline/queue.ts                — queue 'artwork-detection' +
 *       getJobStatus geparametriseerd op queue-naam (O6)
 *   services/ml-client.ts                     — localizeArtwork() + classifyArtwork()
 *   import-flow                               — enqueue per beeld (JPG/PNG) of
 *       per PDF-page (pages.pages[].imagePath, O5) + gln wegschrijven (S3/D1)
 *
 * BullMQ/mlClient/prisma worden gemockt — contracten, geen Redis.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Artwork Detection Orchestration (ATDD RED — 8-3O)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC1 — keten-job: localize → classify(persist_crops) → crosscheck → registratie
  // -------------------------------------------------------------------------

  describe('Detection job chain', () => {
    // ATDD: Story 8-3O implemented
    it.skip('should run localize → classify → crosscheck in order with full provenance', async () => {
      const { runDetectionJob } = await import('../../services/pipeline/detection-flow');
      const mlClient = (await import('../../services/ml-client')).mlClient;

      const localizeSpy = vi
        .spyOn(mlClient, 'localizeArtwork' as never)
        .mockResolvedValue({
          detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 10, y: 20, width: 110, height: 110 }, score: 0.7, threshold: 0.55 }],
          truncated: false,
        } as never);
      const classifySpy = vi
        .spyOn(mlClient, 'classifyArtwork' as never)
        .mockResolvedValue({
          results: [{ bbox: { x: 10, y: 20, width: 110, height: 110 }, t3777_code: 'GREEN_DOT', confidence: 0.8, method: 'embedding', crop_path: 'artwork-crops/123/abc.png' }],
        } as never);

      const result = await runDetectionJob({ gtin: '123', storagePath: 'artwork/123/x.png' });

      expect(localizeSpy).toHaveBeenCalledOnce();
      // classify krijgt gtin + persist_crops (O1: crop-persistentie is classify-uitbreiding)
      expect(classifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ gtin: '123', persist_crops: true })
      );
      // crosscheck-resultaat draagt volledige provenance incl. crop_path
      expect(result.reviewItemsCreated + result.autoAccepted).toBeGreaterThan(0);
    });

    // ATDD: Story 8-3O implemented
    it.skip('should dedup detections against existing review items BEFORE crosscheck (quantized bbox)', async () => {
      const { dedupDetections } = await import('../../services/pipeline/detection-flow');

      const existing = [{ sourceFile: 'artwork/123/x.png', t3777Code: 'GREEN_DOT', bbox: { x: 12, y: 18, width: 110, height: 110 } }];
      const fresh = [
        // zelfde detectie, bbox 3px verschoven → valt op hetzelfde 8px-raster → dedup (O3)
        { t3777Code: 'GREEN_DOT', bbox: { x: 9, y: 21, width: 110, height: 110 }, sourceFile: 'artwork/123/x.png', confidence: 0.8 },
        // andere locatie → blijft
        { t3777Code: 'GREEN_DOT', bbox: { x: 400, y: 300, width: 110, height: 110 }, sourceFile: 'artwork/123/x.png', confidence: 0.8 },
      ];

      const kept = dedupDetections(fresh, existing);
      expect(kept).toHaveLength(1);
      expect(kept[0].bbox.x).toBe(400);
    });

    // ATDD: Story 8-3O implemented
    it.skip('should route auto-accepted detections to the existing registration path', async () => {
      const { runDetectionJob } = await import('../../services/pipeline/detection-flow');
      // declared bevat GREEN_DOT (provider gemockt) → auto-accept → registerCropsTx-pad
      // (volledige mock-opzet bij implementatie; contract: registratie wordt aangeroepen
      // met crop_path + provenance, géén interne HTTP)
      expect(runDetectionJob).toBeDefined();
    });

    // ATDD: Story 8-3O implemented
    it.skip('should fail one artwork without breaking the run (per-item errors, 8.1 pattern)', async () => {
      const { runDetectionJob } = await import('../../services/pipeline/detection-flow');
      const mlClient = (await import('../../services/ml-client')).mlClient;
      vi.spyOn(mlClient, 'localizeArtwork' as never).mockRejectedValue(new Error('ml down'));

      // de job-functie gooit (BullMQ retry-semantiek), maar markeert het item;
      // een tweede job voor een ander beeld draait onafhankelijk
      await expect(runDetectionJob({ gtin: '123', storagePath: 'artwork/123/broken.png' })).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Crosscheck-service-refactor (gedrag byte-gelijk aan de route)
  // -------------------------------------------------------------------------

  describe('Crosscheck service extraction', () => {
    // ATDD: Story 8-3O implemented
    it.skip('should keep the declared=[] safety rule: no auto-accept without declaration', async () => {
      const { crosscheckDetections } = await import('../../services/artwork-crosscheck');

      const out = await crosscheckDetections('123', [
        { t3777Code: 'GREEN_DOT', confidence: 0.99, bbox: { x: 1, y: 1, width: 10, height: 10 }, method: 'embedding', cropPath: 'c.png', sourceFile: 's.png' },
      ], []);

      expect(out.autoAccepted).toHaveLength(0);
      expect(out.reviewItems).toHaveLength(1);
      expect(out.reviewItems[0].reason).toContain('Geen T3777-declaratie');
    });

    // ATDD: Story 8-3O implemented
    it.skip('should auto-accept declared detections above the per-method threshold', async () => {
      const { crosscheckDetections } = await import('../../services/artwork-crosscheck');

      const out = await crosscheckDetections('123', [
        { t3777Code: 'GREEN_DOT', confidence: 0.99, bbox: { x: 1, y: 1, width: 10, height: 10 }, method: 'embedding', cropPath: 'c.png', sourceFile: 's.png' },
      ], ['GREEN_DOT']);

      expect(out.autoAccepted).toHaveLength(1);
      expect(out.reviewItems).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // AC3 — run-beheer: enqueue per beeld/page, queue-status per queue-naam
  // -------------------------------------------------------------------------

  describe('Run management', () => {
    // ATDD: Story 8-3O implemented
    it.skip('should enqueue one detection job per imported image, and per PDF page (O5)', async () => {
      const { enqueueDetectionForImport } = await import('../../services/pipeline/detection-flow');

      const jobs = await enqueueDetectionForImport({
        gtin: '123',
        mimeType: 'application/pdf',
        storagePath: 'artwork/123/label.pdf',
        pages: { dpi: 300, pages: [{ page: 1, imagePath: 'artwork/123/label.page-1.png' }, { page: 2, imagePath: 'artwork/123/label.page-2.png' }] },
      } as never);

      expect(jobs).toHaveLength(2); // per page, niet per PDF
      expect(jobs[0].storagePath).toContain('page-1');
    });

    // ATDD: Story 8-3O implemented
    it.skip('should expose job status for the artwork-detection queue (getJobStatus parametrized, O6)', async () => {
      const { getJobStatus } = await import('../../services/pipeline/queue');
      // nieuwe signatuur: (jobId, queueName?) — default 'training' blijft backward-compatible
      const status = await getJobStatus('nonexistent-id', 'artwork-detection');
      expect(status).toHaveProperty('state');
    });

    // ATDD: Story 8-3O implemented
    it.skip('should write gln on import so 8-3D can resolve declarations (S3/D1)', async () => {
      // contract: importGtin persisteert gln uit de mediaserver-respons in artwork_imports
      // (test bij implementatie via gemockte prisma.create-assertie op gln)
      const mod = await import('../../api/v1/artwork-pipeline');
      expect(mod).toBeDefined();
    });
  });
});
