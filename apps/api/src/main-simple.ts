import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import http from 'http';

const app = Fastify({
  logger: true,
});

// In-memory stats storage
const statsStore = {
  totalRecognitions: 0,
  successfulRecognitions: 0,
  totalProcessingTimeMs: 0,
  todayRecognitions: 0,
  todayDate: new Date().toDateString(),
  recentActivity: [] as Array<{
    key: string;
    image: string;
    logos: number;
    confidence: number;
    time: string;
    timestamp: string;
  }>,
};

// Training data types
interface TrainingImage {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  size: number;
  category: string;
  annotationStatus: 'pending' | 'in_progress' | 'completed';
  annotationCount: number;
  uploadedAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  imageCount: number;
  createdAt: string;
}

interface Annotation {
  id: string;
  imageId: string;
  type: 'bbox' | 'polygon' | 'point';
  label: string;
  coordinates: number[];
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

interface TrainingJob {
  id: string;
  name: string;
  modelType: string;
  status: 'queued' | 'preparing' | 'training' | 'validating' | 'completed' | 'failed';
  progress: number;
  currentEpoch: number;
  totalEpochs: number;
  metrics: {
    loss?: number;
    accuracy?: number;
    valLoss?: number;
    valAccuracy?: number;
    mAP?: number;
  };
  config: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    dataAugmentation: boolean;
  };
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface TrainedModel {
  id: string;
  name: string;
  version: string;
  type: string;
  status: 'training' | 'ready' | 'deployed' | 'archived';
  accuracy: number;
  size: number;
  trainingJobId?: string;
  metrics: {
    precision: number;
    recall: number;
    f1Score: number;
    mAP: number;
  };
  createdAt: string;
  deployedAt?: string;
}

// In-memory training data stores
const trainingImages: Map<string, TrainingImage> = new Map();
const categories: Map<string, Category> = new Map();
const annotations: Map<string, Annotation> = new Map();
const trainingJobs: Map<string, TrainingJob> = new Map();
const trainedModels: Map<string, TrainedModel> = new Map();

// Initialize with demo data
function initializeDemoData() {
  // Demo categories
  const demoCategories: Category[] = [
    { id: 'cat-1', name: 'Logos', description: 'Brand logos and emblems', color: '#1890ff', imageCount: 45, createdAt: new Date().toISOString() },
    { id: 'cat-2', name: 'Icons', description: 'App and UI icons', color: '#52c41a', imageCount: 32, createdAt: new Date().toISOString() },
    { id: 'cat-3', name: 'Text', description: 'Text and typography', color: '#faad14', imageCount: 28, createdAt: new Date().toISOString() },
    { id: 'cat-4', name: 'Products', description: 'Product images', color: '#f5222d', imageCount: 15, createdAt: new Date().toISOString() },
  ];
  demoCategories.forEach(cat => categories.set(cat.id, cat));

  // Demo training images
  const demoImages: TrainingImage[] = [
    { id: 'img-1', filename: 'apple-logo.png', url: '/uploads/apple-logo.png', thumbnailUrl: '/uploads/thumb-apple-logo.png', width: 512, height: 512, size: 45000, category: 'cat-1', annotationStatus: 'completed', annotationCount: 3, uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'img-2', filename: 'google-logo.png', url: '/uploads/google-logo.png', thumbnailUrl: '/uploads/thumb-google-logo.png', width: 800, height: 400, size: 62000, category: 'cat-1', annotationStatus: 'completed', annotationCount: 4, uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'img-3', filename: 'amazon-logo.jpg', url: '/uploads/amazon-logo.jpg', thumbnailUrl: '/uploads/thumb-amazon-logo.jpg', width: 600, height: 300, size: 38000, category: 'cat-1', annotationStatus: 'in_progress', annotationCount: 2, uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'img-4', filename: 'nike-swoosh.png', url: '/uploads/nike-swoosh.png', thumbnailUrl: '/uploads/thumb-nike-swoosh.png', width: 400, height: 200, size: 28000, category: 'cat-1', annotationStatus: 'pending', annotationCount: 0, uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'img-5', filename: 'settings-icon.svg', url: '/uploads/settings-icon.svg', thumbnailUrl: '/uploads/thumb-settings-icon.png', width: 256, height: 256, size: 12000, category: 'cat-2', annotationStatus: 'completed', annotationCount: 1, uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  demoImages.forEach(img => trainingImages.set(img.id, img));

  // Demo annotations
  const demoAnnotations: Annotation[] = [
    { id: 'ann-1', imageId: 'img-1', type: 'bbox', label: 'Apple Logo', coordinates: [100, 100, 300, 300], confidence: 0.95, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ann-2', imageId: 'img-2', type: 'bbox', label: 'Google G', coordinates: [50, 100, 200, 250], confidence: 0.92, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  demoAnnotations.forEach(ann => annotations.set(ann.id, ann));

  // Demo trained models
  const demoModels: TrainedModel[] = [
    { id: 'model-1', name: 'Logo Detector v1', version: '1.0.0', type: 'YOLOv8', status: 'deployed', accuracy: 0.94, size: 45000000, metrics: { precision: 0.92, recall: 0.91, f1Score: 0.915, mAP: 0.89 }, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), deployedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'model-2', name: 'Logo Detector v2', version: '2.0.0', type: 'YOLOv8', status: 'ready', accuracy: 0.96, size: 52000000, metrics: { precision: 0.95, recall: 0.94, f1Score: 0.945, mAP: 0.92 }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  ];
  demoModels.forEach(model => trainedModels.set(model.id, model));
}

// Initialize demo data on startup
initializeDemoData();

// Simulate training progress (for demo purposes)
function simulateTrainingProgress(jobId: string) {
  const job = trainingJobs.get(jobId);
  if (!job) return;

  job.status = 'preparing';
  job.startedAt = new Date().toISOString();

  // Simulate preparation phase (1 second)
  setTimeout(() => {
    const currentJob = trainingJobs.get(jobId);
    if (!currentJob) return;

    currentJob.status = 'training';

    // Simulate epochs
    let epoch = 0;
    const epochInterval = setInterval(() => {
      const runningJob = trainingJobs.get(jobId);
      if (!runningJob || runningJob.status === 'failed') {
        clearInterval(epochInterval);
        return;
      }

      epoch++;
      runningJob.currentEpoch = epoch;
      runningJob.progress = Math.round((epoch / runningJob.totalEpochs) * 100);

      // Simulate metrics improvement
      runningJob.metrics = {
        loss: Math.max(0.1, 2.0 - epoch * 0.02),
        accuracy: Math.min(0.98, 0.5 + epoch * 0.005),
        valLoss: Math.max(0.15, 2.2 - epoch * 0.018),
        valAccuracy: Math.min(0.96, 0.45 + epoch * 0.0048),
        mAP: Math.min(0.95, 0.3 + epoch * 0.007),
      };

      // Complete after all epochs
      if (epoch >= runningJob.totalEpochs) {
        clearInterval(epochInterval);
        runningJob.status = 'validating';

        // Simulate validation phase (1 second)
        setTimeout(() => {
          const finalJob = trainingJobs.get(jobId);
          if (!finalJob) return;

          finalJob.status = 'completed';
          finalJob.completedAt = new Date().toISOString();
          finalJob.progress = 100;

          // Create a new model from the completed job
          const modelId = `model-${Date.now()}`;
          const newModel: TrainedModel = {
            id: modelId,
            name: finalJob.name,
            version: '1.0.0',
            type: finalJob.modelType,
            status: 'ready',
            accuracy: finalJob.metrics.accuracy || 0.9,
            size: 50000000 + Math.random() * 10000000,
            trainingJobId: jobId,
            metrics: {
              precision: finalJob.metrics.accuracy || 0.9,
              recall: (finalJob.metrics.accuracy || 0.9) - 0.02,
              f1Score: (finalJob.metrics.accuracy || 0.9) - 0.01,
              mAP: finalJob.metrics.mAP || 0.85,
            },
            createdAt: new Date().toISOString(),
          };
          trainedModels.set(modelId, newModel);
        }, 1000);
      }
    }, 500); // Each epoch takes 500ms in demo mode
  }, 1000);
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function recordRecognition(
  imageName: string,
  logosFound: number,
  confidence: number,
  processingTimeMs: number,
  success: boolean
): void {
  const today = new Date().toDateString();
  if (statsStore.todayDate !== today) {
    statsStore.todayRecognitions = 0;
    statsStore.todayDate = today;
  }

  statsStore.totalRecognitions++;
  statsStore.todayRecognitions++;
  statsStore.totalProcessingTimeMs += processingTimeMs;

  if (success) {
    statsStore.successfulRecognitions++;
  }

  const activity = {
    key: crypto.randomUUID(),
    image: imageName,
    logos: logosFound,
    confidence,
    time: getRelativeTime(new Date()),
    timestamp: new Date().toISOString(),
  };

  statsStore.recentActivity.unshift(activity);
  if (statsStore.recentActivity.length > 20) {
    statsStore.recentActivity.pop();
  }
}

async function startServer() {
  try {
    // CORS
    await app.register(cors, {
      origin: '*',
    });

    // Simple health route
    app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Stats route for dashboard
    app.get('/api/v1/stats', async () => {
      // Update relative times
      statsStore.recentActivity = statsStore.recentActivity.map((activity) => ({
        ...activity,
        time: getRelativeTime(new Date(activity.timestamp)),
      }));

      // Reset daily count if new day
      const today = new Date().toDateString();
      if (statsStore.todayDate !== today) {
        statsStore.todayRecognitions = 0;
        statsStore.todayDate = today;
      }

      const successRate =
        statsStore.totalRecognitions > 0
          ? (statsStore.successfulRecognitions / statsStore.totalRecognitions) * 100
          : 0;

      const averageTime =
        statsStore.totalRecognitions > 0
          ? statsStore.totalProcessingTimeMs / statsStore.totalRecognitions / 1000
          : 0;

      return {
        stats: {
          totalRecognitions: statsStore.totalRecognitions,
          successRate: Math.round(successRate * 10) / 10,
          averageTime: Math.round(averageTime * 100) / 100,
          todayCount: statsStore.todayRecognitions,
        },
        recentActivity: statsStore.recentActivity.slice(0, 10),
        timestamp: new Date().toISOString(),
      };
    });

    // Add demo data route (development only)
    app.post('/api/v1/stats/demo', async () => {
      const demoItems = [
        { image: 'product-001.jpg', logos: 3, confidence: 0.95, time: 1200 },
        { image: 'banner-023.png', logos: 1, confidence: 0.87, time: 800 },
        { image: 'photo-156.jpg', logos: 2, confidence: 0.92, time: 1500 },
        { image: 'logo-scan.png', logos: 4, confidence: 0.98, time: 950 },
        { image: 'brand-image.jpg', logos: 1, confidence: 0.76, time: 1100 },
      ];

      for (const item of demoItems) {
        recordRecognition(item.image, item.logos, item.confidence, item.time, item.confidence > 0.5);
      }

      return { message: 'Demo data added', count: demoItems.length };
    });

    // ============================================
    // TRAINING IMAGES API
    // ============================================

    // GET /api/v1/training/images - List all training images
    app.get('/api/v1/training/images', async (request) => {
      const query = request.query as { category?: string; status?: string; page?: string; limit?: string };
      let images = Array.from(trainingImages.values());

      // Filter by category
      if (query.category) {
        images = images.filter(img => img.category === query.category);
      }

      // Filter by annotation status
      if (query.status) {
        images = images.filter(img => img.annotationStatus === query.status);
      }

      // Pagination
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);
      const start = (page - 1) * limit;
      const paginatedImages = images.slice(start, start + limit);

      return {
        data: paginatedImages,
        pagination: {
          page,
          limit,
          total: images.length,
          totalPages: Math.ceil(images.length / limit),
        },
      };
    });

    // GET /api/v1/training/images/:id - Get single training image
    app.get('/api/v1/training/images/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const image = trainingImages.get(id);

      if (!image) {
        return reply.status(404).send({ error: 'Image not found' });
      }

      // Include annotations for this image
      const imageAnnotations = Array.from(annotations.values()).filter(a => a.imageId === id);

      return { ...image, annotations: imageAnnotations };
    });

    // POST /api/v1/training/images - Upload training image (simplified)
    app.post('/api/v1/training/images', async (request) => {
      const body = request.body as Partial<TrainingImage>;
      const id = `img-${Date.now()}`;

      const newImage: TrainingImage = {
        id,
        filename: body.filename || 'uploaded-image.png',
        url: body.url || `/uploads/${id}.png`,
        thumbnailUrl: body.thumbnailUrl || `/uploads/thumb-${id}.png`,
        width: body.width || 800,
        height: body.height || 600,
        size: body.size || 50000,
        category: body.category || 'cat-1',
        annotationStatus: 'pending',
        annotationCount: 0,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      trainingImages.set(id, newImage);

      // Update category count
      const category = categories.get(newImage.category);
      if (category) {
        category.imageCount++;
      }

      return { data: newImage, message: 'Image uploaded successfully' };
    });

    // DELETE /api/v1/training/images/:id - Delete training image
    app.delete('/api/v1/training/images/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const image = trainingImages.get(id);

      if (!image) {
        return reply.status(404).send({ error: 'Image not found' });
      }

      // Delete associated annotations
      for (const [annId, ann] of annotations) {
        if (ann.imageId === id) {
          annotations.delete(annId);
        }
      }

      // Update category count
      const category = categories.get(image.category);
      if (category) {
        category.imageCount = Math.max(0, category.imageCount - 1);
      }

      trainingImages.delete(id);
      return { message: 'Image deleted successfully' };
    });

    // ============================================
    // CATEGORIES API
    // ============================================

    // GET /api/v1/training/categories - List all categories
    app.get('/api/v1/training/categories', async () => {
      return { data: Array.from(categories.values()) };
    });

    // POST /api/v1/training/categories - Create category
    app.post('/api/v1/training/categories', async (request) => {
      const body = request.body as { name: string; description?: string; color?: string };
      const id = `cat-${Date.now()}`;

      const newCategory: Category = {
        id,
        name: body.name,
        description: body.description || '',
        color: body.color || '#1890ff',
        imageCount: 0,
        createdAt: new Date().toISOString(),
      };

      categories.set(id, newCategory);
      return { data: newCategory, message: 'Category created successfully' };
    });

    // PUT /api/v1/training/categories/:id - Update category
    app.put('/api/v1/training/categories/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<Category>;
      const category = categories.get(id);

      if (!category) {
        return reply.status(404).send({ error: 'Category not found' });
      }

      const updated: Category = {
        ...category,
        name: body.name ?? category.name,
        description: body.description ?? category.description,
        color: body.color ?? category.color,
      };

      categories.set(id, updated);
      return { data: updated, message: 'Category updated successfully' };
    });

    // DELETE /api/v1/training/categories/:id - Delete category
    app.delete('/api/v1/training/categories/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!categories.has(id)) {
        return reply.status(404).send({ error: 'Category not found' });
      }

      categories.delete(id);
      return { message: 'Category deleted successfully' };
    });

    // ============================================
    // ANNOTATIONS API
    // ============================================

    // GET /api/v1/training/annotations - List annotations (optionally filtered by imageId)
    app.get('/api/v1/training/annotations', async (request) => {
      const query = request.query as { imageId?: string };
      let result = Array.from(annotations.values());

      if (query.imageId) {
        result = result.filter(a => a.imageId === query.imageId);
      }

      return { data: result };
    });

    // GET /api/v1/training/images/:imageId/annotations - Get annotations for specific image
    app.get('/api/v1/training/images/:imageId/annotations', async (request) => {
      const { imageId } = request.params as { imageId: string };
      const result = Array.from(annotations.values()).filter(a => a.imageId === imageId);
      return { data: result };
    });

    // POST /api/v1/training/annotations - Create annotation
    app.post('/api/v1/training/annotations', async (request, reply) => {
      const body = request.body as Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>;

      if (!trainingImages.has(body.imageId)) {
        return reply.status(404).send({ error: 'Image not found' });
      }

      const id = `ann-${Date.now()}`;
      const newAnnotation: Annotation = {
        id,
        imageId: body.imageId,
        type: body.type || 'bbox',
        label: body.label,
        coordinates: body.coordinates,
        confidence: body.confidence,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      annotations.set(id, newAnnotation);

      // Update image annotation count and status
      const image = trainingImages.get(body.imageId);
      if (image) {
        image.annotationCount++;
        image.annotationStatus = 'in_progress';
        image.updatedAt = new Date().toISOString();
      }

      return { data: newAnnotation, message: 'Annotation created successfully' };
    });

    // PUT /api/v1/training/annotations/:id - Update annotation
    app.put('/api/v1/training/annotations/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<Annotation>;
      const annotation = annotations.get(id);

      if (!annotation) {
        return reply.status(404).send({ error: 'Annotation not found' });
      }

      const updated: Annotation = {
        ...annotation,
        label: body.label ?? annotation.label,
        coordinates: body.coordinates ?? annotation.coordinates,
        confidence: body.confidence ?? annotation.confidence,
        updatedAt: new Date().toISOString(),
      };

      annotations.set(id, updated);
      return { data: updated, message: 'Annotation updated successfully' };
    });

    // DELETE /api/v1/training/annotations/:id - Delete annotation
    app.delete('/api/v1/training/annotations/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const annotation = annotations.get(id);

      if (!annotation) {
        return reply.status(404).send({ error: 'Annotation not found' });
      }

      // Update image annotation count
      const image = trainingImages.get(annotation.imageId);
      if (image) {
        image.annotationCount = Math.max(0, image.annotationCount - 1);
        if (image.annotationCount === 0) {
          image.annotationStatus = 'pending';
        }
        image.updatedAt = new Date().toISOString();
      }

      annotations.delete(id);
      return { message: 'Annotation deleted successfully' };
    });

    // ============================================
    // TRAINING JOBS API
    // ============================================

    // GET /api/v1/training/jobs - List training jobs
    app.get('/api/v1/training/jobs', async () => {
      return { data: Array.from(trainingJobs.values()) };
    });

    // GET /api/v1/training/jobs/:id - Get training job details
    app.get('/api/v1/training/jobs/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const job = trainingJobs.get(id);

      if (!job) {
        return reply.status(404).send({ error: 'Training job not found' });
      }

      return { data: job };
    });

    // POST /api/v1/training/jobs - Start new training job
    app.post('/api/v1/training/jobs', async (request) => {
      const body = request.body as {
        name: string;
        modelType: string;
        config?: Partial<TrainingJob['config']>;
      };

      const id = `job-${Date.now()}`;
      const newJob: TrainingJob = {
        id,
        name: body.name,
        modelType: body.modelType || 'YOLOv8',
        status: 'queued',
        progress: 0,
        currentEpoch: 0,
        totalEpochs: body.config?.epochs || 100,
        metrics: {},
        config: {
          epochs: body.config?.epochs || 100,
          batchSize: body.config?.batchSize || 16,
          learningRate: body.config?.learningRate || 0.001,
          dataAugmentation: body.config?.dataAugmentation ?? true,
        },
        createdAt: new Date().toISOString(),
      };

      trainingJobs.set(id, newJob);

      // Simulate training progress (in real app, this would be handled by ML service)
      simulateTrainingProgress(id);

      return { data: newJob, message: 'Training job started successfully' };
    });

    // DELETE /api/v1/training/jobs/:id - Cancel/delete training job
    app.delete('/api/v1/training/jobs/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!trainingJobs.has(id)) {
        return reply.status(404).send({ error: 'Training job not found' });
      }

      trainingJobs.delete(id);
      return { message: 'Training job cancelled' };
    });

    // ============================================
    // MODELS API
    // ============================================

    // GET /api/v1/models - List all models
    app.get('/api/v1/models', async (request) => {
      const query = request.query as { status?: string };
      let models = Array.from(trainedModels.values());

      if (query.status) {
        models = models.filter(m => m.status === query.status);
      }

      return { data: models };
    });

    // GET /api/v1/models/:id - Get model details
    app.get('/api/v1/models/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const model = trainedModels.get(id);

      if (!model) {
        return reply.status(404).send({ error: 'Model not found' });
      }

      return { data: model };
    });

    // POST /api/v1/models/:id/deploy - Deploy a model
    app.post('/api/v1/models/:id/deploy', async (request, reply) => {
      const { id } = request.params as { id: string };
      const model = trainedModels.get(id);

      if (!model) {
        return reply.status(404).send({ error: 'Model not found' });
      }

      if (model.status !== 'ready') {
        return reply.status(400).send({ error: 'Model is not ready for deployment' });
      }

      // Undeploy any currently deployed model
      for (const [, m] of trainedModels) {
        if (m.status === 'deployed') {
          m.status = 'ready';
        }
      }

      model.status = 'deployed';
      model.deployedAt = new Date().toISOString();

      return { data: model, message: 'Model deployed successfully' };
    });

    // POST /api/v1/models/:id/archive - Archive a model
    app.post('/api/v1/models/:id/archive', async (request, reply) => {
      const { id } = request.params as { id: string };
      const model = trainedModels.get(id);

      if (!model) {
        return reply.status(404).send({ error: 'Model not found' });
      }

      if (model.status === 'deployed') {
        return reply.status(400).send({ error: 'Cannot archive deployed model' });
      }

      model.status = 'archived';
      return { data: model, message: 'Model archived successfully' };
    });

    // DELETE /api/v1/models/:id - Delete a model
    app.delete('/api/v1/models/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const model = trainedModels.get(id);

      if (!model) {
        return reply.status(404).send({ error: 'Model not found' });
      }

      if (model.status === 'deployed') {
        return reply.status(400).send({ error: 'Cannot delete deployed model' });
      }

      trainedModels.delete(id);
      return { message: 'Model deleted successfully' };
    });

    // Start server
    const port = parseInt(process.env.PORT || '8000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`✅ API Server running at http://${host}:${port}`);
    console.log(`✅ Health check: http://${host}:${port}/health`);

    // Get the underlying HTTP server from Fastify
    const httpServer = app.server as http.Server;

    // Initialize Socket.io with CORS configuration
    const io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['polling', 'websocket'],
    });

    // Socket.io connection handling
    io.on('connection', (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);

      // Send welcome message
      socket.emit('system', {
        type: 'system',
        event: 'connected',
        data: { clientId: socket.id, message: 'Connected to real-time updates' },
        timestamp: new Date().toISOString(),
      });

      // Handle recognition requests
      socket.on('recognition:start', (data) => {
        console.log(`[Socket.io] Recognition request from ${socket.id}:`, data);

        // Simulate recognition process (replace with actual ML service call)
        socket.emit('recognition', {
          type: 'recognition',
          event: 'recognition_started',
          data: { requestId: data.requestId || socket.id, status: 'processing' },
          timestamp: new Date().toISOString(),
        });

        // Simulate completion after 2 seconds
        setTimeout(() => {
          socket.emit('recognition', {
            type: 'recognition',
            event: 'recognition_completed',
            data: {
              requestId: data.requestId || socket.id,
              status: 'completed',
              results: [],
              processingTimeMs: 2000,
            },
            timestamp: new Date().toISOString(),
          });
        }, 2000);
      });

      // Handle subscriptions
      socket.on('subscribe', (topic: string) => {
        socket.join(topic);
        console.log(`[Socket.io] Client ${socket.id} subscribed to ${topic}`);
        socket.emit('system', {
          type: 'system',
          event: 'subscribed',
          data: { topic },
          timestamp: new Date().toISOString(),
        });
      });

      socket.on('unsubscribe', (topic: string) => {
        socket.leave(topic);
        console.log(`[Socket.io] Client ${socket.id} unsubscribed from ${topic}`);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}, reason: ${reason}`);
      });
    });

    console.log(`✅ Socket.io server running`);
    console.log(`✅ WebSocket endpoint: ws://${host}:${port}/socket.io/`);

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
