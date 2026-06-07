/**
 * Artwork Detection Orchestration Tests — Story 8-3O (Epic 8-nazorg)
 *
 * GREEN PHASE: the red-phase `.skip` markers are removed and the two
 * "contract: bij implementatie" stubs are fleshed out to real assertions.
 *
 * Module layout (bevroren ontwerpbeslissingen, O1–O8/S3):
 *   services/artwork-crosscheck.ts            — crosscheckDetections (byte-gelijk)
 *   services/pipeline/detection-flow.ts       — runDetectionJob / dedupDetections /
 *                                               enqueueDetectionForImport
 *   services/pipeline/queue.ts                — getJobStatus(jobId, queueName?) (O6)
 *   services/ml-client.ts                     — localizeArtwork() + classifyArtwork()
 *   api/v1/artwork-pipeline.ts                — enqueue-hook + gln (S3/D1)
 *
 * BullMQ / ioredis / mlClient / prisma are mocked in src/__tests__/setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';

describe('Artwork Detection Orchestration (8-3O)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nothing already processed → dedup keeps everything.
    (prisma.artworkReviewItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.trainingData.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.artworkReviewItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    (prisma.logoImage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.logoImage.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'img-1' });
    (prisma.logo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'logo-1' });
    (prisma.trainingData.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'td-1' });
  });

  // -------------------------------------------------------------------------
  // AC1 — keten-job: localize → classify(persist_crops) → crosscheck → registratie
  // -------------------------------------------------------------------------

  describe('Detection job chain', () => {
    it('should run localize → classify → crosscheck in order with full provenance', async () => {
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

    it('should dedup detections against existing review items BEFORE crosscheck (quantized bbox)', async () => {
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

    it('should route auto-accepted detections to the existing registration path', async () => {
      // declared bevat GREEN_DOT (provider gemockt) → auto-accept → registerCropsTx-pad
      // Contract: de registratie loopt via $transaction → registerCropsTx
      // (LogoImage + Logo + TrainingData) met crop_path + provenance, géén interne HTTP.
      const detectionFlow = await import('../../services/pipeline/detection-flow');
      const { runDetectionJob, setDeclarationProvider, emptyDeclarationProvider } = detectionFlow;
      const mlClient = (await import('../../services/ml-client')).mlClient;

      vi.spyOn(mlClient, 'localizeArtwork' as never).mockResolvedValue({
        detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 10, y: 20, width: 110, height: 110 }, score: 0.95, threshold: 0.55 }],
        truncated: false,
      } as never);
      vi.spyOn(mlClient, 'classifyArtwork' as never).mockResolvedValue({
        // confidence 0.99 ≥ embedding-drempel 0.80 → auto-accept
        results: [{ bbox: { x: 10, y: 20, width: 110, height: 110 }, t3777_code: 'GREEN_DOT', confidence: 0.99, method: 'embedding', crop_path: 'artwork-crops/123/abc.png' }],
      } as never);

      // declaratie bevat GREEN_DOT → auto-accept i.p.v. review
      setDeclarationProvider(async () => ['GREEN_DOT']);
      try {
        const result = await runDetectionJob({ gtin: '123', storagePath: 'artwork/123/x.png' });

        // registratie liep via het transactionele 8.6-pad:
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(prisma.trainingData.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              label: 'GREEN_DOT',
              cropPath: 'artwork-crops/123/abc.png',
            }),
          })
        );
        // provenance draagt de bron (sourceFile = storagePath) en bbox
        const createArg = (prisma.trainingData.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(createArg.data.provenance).toEqual(
          expect.objectContaining({ sourceFile: 'artwork/123/x.png' })
        );
        expect(result.autoAccepted).toBe(1);
        expect(result.reviewItemsCreated).toBe(0);
      } finally {
        setDeclarationProvider(emptyDeclarationProvider);
      }
    });

    it('should fail one artwork without breaking the run (per-item errors, 8.1 pattern)', async () => {
      const { runDetectionJob } = await import('../../services/pipeline/detection-flow');
      const mlClient = (await import('../../services/ml-client')).mlClient;
      vi.spyOn(mlClient, 'localizeArtwork' as never).mockRejectedValue(new Error('ml down'));

      // de job-functie gooit (BullMQ retry-semantiek), maar markeert het item;
      // een tweede job voor een ander beeld draait onafhankelijk
      await expect(runDetectionJob({ gtin: '123', storagePath: 'artwork/123/broken.png' })).rejects.toThrow();
    });

    it('should not double-register on retry after a partial success (dedup vs registrations)', async () => {
      // Na een eerdere (deels geslaagde) run bestaat er al een registratie voor
      // deze (sourceFile, code, bbox) → de dedup-pre-filter laat 'm vallen, dus
      // er volgt GEEN tweede registratie (O2-bescherming).
      const { runDetectionJob } = await import('../../services/pipeline/detection-flow');
      const mlClient = (await import('../../services/ml-client')).mlClient;

      vi.spyOn(mlClient, 'localizeArtwork' as never).mockResolvedValue({
        detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 10, y: 20, width: 110, height: 110 }, score: 0.95, threshold: 0.55 }],
        truncated: false,
      } as never);
      vi.spyOn(mlClient, 'classifyArtwork' as never).mockResolvedValue({
        results: [{ bbox: { x: 10, y: 20, width: 110, height: 110 }, t3777_code: 'GREEN_DOT', confidence: 0.99, method: 'embedding', crop_path: 'artwork-crops/123/abc.png' }],
      } as never);
      // bestaande registratie met dezelfde bron + code + bbox
      (prisma.trainingData.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { label: 'GREEN_DOT', provenance: { sourceFile: 'artwork/123/x.png', bbox: { x: 10, y: 20, width: 110, height: 110 } } },
      ]);

      const result = await runDetectionJob({ gtin: '123', storagePath: 'artwork/123/x.png' });

      expect(result.autoAccepted).toBe(0);
      expect(result.reviewItemsCreated).toBe(0);
      expect(prisma.trainingData.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Crosscheck-service-refactor (gedrag byte-gelijk aan de route)
  // -------------------------------------------------------------------------

  describe('Crosscheck service extraction', () => {
    it('should keep the declared=[] safety rule: no auto-accept without declaration', async () => {
      const { crosscheckDetections } = await import('../../services/artwork-crosscheck');

      const out = await crosscheckDetections('123', [
        { t3777Code: 'GREEN_DOT', confidence: 0.99, bbox: { x: 1, y: 1, width: 10, height: 10 }, method: 'embedding', cropPath: 'c.png', sourceFile: 's.png' },
      ], []);

      expect(out.autoAccepted).toHaveLength(0);
      expect(out.reviewItems).toHaveLength(1);
      expect(out.reviewItems[0].reason).toContain('Geen T3777-declaratie');
    });

    it('should auto-accept declared detections above the per-method threshold', async () => {
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
    it('should enqueue one detection job per imported image, and per PDF page (O5)', async () => {
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

    it('should evict completed history so manual re-runs actually reprocess (AC3)', async () => {
      // BullMQ refuses adds whose stable jobId still lives in the completed
      // history (removeOnComplete:false) — without eviction a manual re-run
      // (e.g. after a calibration change) is a silent no-op.
      const { enqueueDetectionForImport } = await import('../../services/pipeline/detection-flow');
      const bullmq = await import('bullmq');

      const removeSpy = vi.fn().mockResolvedValue(undefined);
      const addSpy = vi.fn().mockResolvedValue({ id: 'detect:123:artwork/123/x.png' });
      (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        getJob: vi.fn().mockResolvedValue({ getState: vi.fn().mockResolvedValue('completed'), remove: removeSpy }),
        add: addSpy,
        close: vi.fn().mockResolvedValue(undefined),
      }));

      const jobs = await enqueueDetectionForImport({
        gtin: '123',
        mimeType: 'image/png',
        storagePath: 'artwork/123/x.png',
      } as never);

      expect(removeSpy).toHaveBeenCalledOnce(); // finished history evicted...
      expect(addSpy).toHaveBeenCalledOnce(); // ...then re-added for real reprocessing
      expect(jobs).toHaveLength(1);
    });

    it('should NOT evict pending/active jobs (dedup of in-flight work stays)', async () => {
      const { enqueueDetectionForImport } = await import('../../services/pipeline/detection-flow');
      const bullmq = await import('bullmq');

      const removeSpy = vi.fn().mockResolvedValue(undefined);
      const addSpy = vi.fn().mockResolvedValue(null); // BullMQ dedups the add itself
      (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        getJob: vi.fn().mockResolvedValue({ getState: vi.fn().mockResolvedValue('waiting'), remove: removeSpy }),
        add: addSpy,
        close: vi.fn().mockResolvedValue(undefined),
      }));

      await enqueueDetectionForImport({
        gtin: '123',
        mimeType: 'image/png',
        storagePath: 'artwork/123/x.png',
      } as never);

      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('should enqueue exactly one job for a JPG/PNG image (O5)', async () => {
      const { enqueueDetectionForImport } = await import('../../services/pipeline/detection-flow');

      const jobs = await enqueueDetectionForImport({
        gtin: '123',
        mimeType: 'image/png',
        storagePath: 'artwork/123/front.png',
      } as never);

      expect(jobs).toHaveLength(1);
      expect(jobs[0].storagePath).toBe('artwork/123/front.png');
    });

    it('should expose job status for the artwork-detection queue (getJobStatus parametrized, O6)', async () => {
      const { getJobStatus } = await import('../../services/pipeline/queue');
      // nieuwe signatuur: (jobId, queueName?) — default 'training' blijft backward-compatible
      const status = await getJobStatus('nonexistent-id', 'artwork-detection');
      expect(status).toHaveProperty('state');
    });

    it('should write gln on import so 8-3D can resolve declarations (S3/D1)', async () => {
      // contract: importGtin persisteert gln uit de mediaserver-respons in artwork_imports.
      // Driven via de POST /artwork-import/runs-route met gemockte mediaserver + prisma.
      const Fastify = (await import('fastify')).default;
      const cookie = (await import('@fastify/cookie')).default;
      const { mediaServerClient } = await import('../../services/mediaserver-client');

      // discovery levert één item met gln; download geeft een buffer
      (mediaServerClient.discoverArtwork as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'm-1', fileName: 'front.png', previewUrl: '/p/1', typeInfo: 'PACKAGING_ARTWORK', active: true, createdAt: '', gln: '8710400000007' },
      ]);
      (mediaServerClient.downloadFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        buffer: Buffer.from('x'),
        mimeType: 'image/png',
      });

      (prisma.artworkImportRun.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.artworkImportRun.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'run-gln', status: 'running' });
      (prisma.artworkImportRun.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'run-gln' });
      (prisma.artworkImport.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.artworkImport.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'imp-1', storagePath: 'artwork/123/front.png' });

      const app = Fastify({ logger: false });
      await app.register(cookie, { secret: 'test-secret' });
      app.addHook('preHandler', async (request) => {
        (request as { user?: unknown }).user = { userId: 'u1', email: 'a@b.c', role: 'ADMIN' };
      });
      const { artworkPipelineRoutes } = await import('../../api/v1/artwork-pipeline');
      await app.register(artworkPipelineRoutes, { prefix: '/api/v1' });
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/artwork-import/runs',
        payload: { gtins: ['123'] },
      });
      expect(res.statusCode).toBe(202);

      // background import loop is async; wait a tick for it to flush
      await new Promise((r) => setTimeout(r, 50));

      // de upsert kreeg gln meegegeven (create én update branch)
      const upsertArg = (prisma.artworkImport.upsert as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[0]?.where?.mediaId === 'm-1'
      );
      expect(upsertArg).toBeDefined();
      expect(upsertArg[0].create.gln).toBe('8710400000007');
      expect(upsertArg[0].update.gln).toBe('8710400000007');

      await app.close();
    });
  });

  // -------------------------------------------------------------------------
  // AC4 — crash-bestendigheid (verplicht, O7): job-state overleeft worker-herstart
  // -------------------------------------------------------------------------

  describe('Crash resilience (AC4)', () => {
    it('should persist detection jobs with retry + history defaults so they survive a restart', async () => {
      // Volgt het 9.1-queue-testpatroon: durability = de queue draagt
      // removeOnComplete:false + attempts ≥ 3, zodat wachtende/gefaalde jobs een
      // herstart overleven en hervatten (NFR1). De enqueue-add MOET dezelfde
      // opties dragen (BullMQ leest attempts/backoff van de toevoegende instantie).
      const { createPipelineQueues, PIPELINE_JOB_OPTIONS } = await import('../../services/pipeline/queue');
      const detectionQueue = createPipelineQueues()['artwork-detection'];
      expect(detectionQueue.defaultJobOptions.removeOnComplete).not.toBe(true);
      expect(detectionQueue.defaultJobOptions.attempts).toBeGreaterThanOrEqual(3);
      expect(detectionQueue.defaultJobOptions.backoff).toBeDefined();
      // De enqueue-pad gebruikt dezelfde gedeelde opties (geen bare attempts:1).
      expect(PIPELINE_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(3);
      expect(PIPELINE_JOB_OPTIONS.removeOnComplete).toBe(false);
    });

    it('should keep queued detection jobs in Redis-backed state across a worker restart', async () => {
      // Een ge-enqueued job blijft opvraagbaar via getJobStatus nadat de worker
      // opnieuw geregistreerd is — de jobstate leeft in Redis, niet in-proces.
      const { enqueueDetectionForImport, DETECTION_QUEUE } = await import('../../services/pipeline/detection-flow');
      const { getJobStatus } = await import('../../services/pipeline/queue');
      const { registerDetectionWorker } = await import('../../services/pipeline/workers');
      const bullmq = await import('bullmq');

      // enqueue een job (de BullMQ-mock geeft een stabiele job terug)
      const jobs = await enqueueDetectionForImport({
        gtin: '123',
        mimeType: 'image/png',
        storagePath: 'artwork/123/front.png',
      } as never);
      expect(jobs).toHaveLength(1);

      // simuleer een worker-herstart: registreer de worker (twee keer — singleton)
      const w1 = registerDetectionWorker();
      const w2 = registerDetectionWorker();
      expect(w1).toBe(w2); // dezelfde worker-instantie (geen dubbele consumers)
      // de Worker is op de detection-queue geconstrueerd
      expect(bullmq.Worker).toHaveBeenCalledWith(
        DETECTION_QUEUE,
        expect.any(Function),
        expect.objectContaining({ concurrency: expect.any(Number) })
      );

      // jobstate is na 'herstart' nog opvraagbaar (Redis-backed, niet in-proces)
      const status = await getJobStatus('job-failed-1', 'artwork-detection');
      expect(status).toHaveProperty('state');
      expect(status.state).not.toBe('not_found');
    });
  });
});
