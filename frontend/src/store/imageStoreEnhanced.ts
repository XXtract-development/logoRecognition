/**
 * Enhanced Image Store with A++ Memory Management and Performance
 * Complete implementation with WeakMap, memory limits, and performance tracking
 */

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import imageService, { UploadedImage, ImageUploadProgress, BatchUploadResult } from '../services/imageService';
import annotationsService, { BoundingBox, Annotation, AnnotationBatchResult } from '../services/annotationsService';
import { errorService, ErrorCategory, ErrorSeverity } from '../services/errorService';

// Memory management configuration
const MEMORY_CONFIG = {
  MAX_CACHED_IMAGES: 100,
  MAX_ANNOTATION_SETS: 50,
  IMAGE_CLEANUP_THRESHOLD: 80, // Start cleanup at 80% capacity
  MEMORY_CHECK_INTERVAL: 30000, // Check memory every 30 seconds
  MAX_UNDO_HISTORY: 20,
  PERFORMANCE_LOG_SIZE: 100,
};

// Performance tracker
class PerformanceTracker {
  private metrics: Map<string, number[]> = new Map();
  private operationCount = 0;

  track(operation: string, duration: number): void {
    const operations = this.metrics.get(operation) || [];
    operations.push(duration);

    if (operations.length > MEMORY_CONFIG.PERFORMANCE_LOG_SIZE) {
      operations.shift();
    }

    this.metrics.set(operation, operations);
    this.operationCount++;
  }

  getMetrics(): Map<string, { avg: number; min: number; max: number; count: number }> {
    const result = new Map();
    for (const [op, durations] of this.metrics) {
      if (durations.length > 0) {
        result.set(op, {
          avg: durations.reduce((a, b) => a + b, 0) / durations.length,
          min: Math.min(...durations),
          max: Math.max(...durations),
          count: durations.length,
        });
      }
    }
    return result;
  }

  getTotalOperations(): number {
    return this.operationCount;
  }

  reset(): void {
    this.metrics.clear();
    this.operationCount = 0;
  }
}

// Memory manager with WeakMap for efficient garbage collection
class MemoryManager {
  private imageCache: WeakMap<object, UploadedImage> = new WeakMap();
  private annotationCache: WeakMap<object, BoundingBox[]> = new WeakMap();
  private cacheKeys: Map<string, object> = new Map();
  private memoryUsage = 0;
  private lastCleanup = Date.now();

  storeImage(id: string, image: UploadedImage): void {
    const key = this.getOrCreateKey(id);
    this.imageCache.set(key, image);
    this.updateMemoryUsage();
  }

  getImage(id: string): UploadedImage | undefined {
    const key = this.cacheKeys.get(id);
    return key ? this.imageCache.get(key) : undefined;
  }

  storeAnnotations(imageId: string, annotations: BoundingBox[]): void {
    const key = this.getOrCreateKey(`ann_${imageId}`);
    this.annotationCache.set(key, annotations);
    this.updateMemoryUsage();
  }

  getAnnotations(imageId: string): BoundingBox[] | undefined {
    const key = this.cacheKeys.get(`ann_${imageId}`);
    return key ? this.annotationCache.get(key) : undefined;
  }

  private getOrCreateKey(id: string): object {
    let key = this.cacheKeys.get(id);
    if (!key) {
      key = {};
      this.cacheKeys.set(id, key);
      this.checkMemoryLimit();
    }
    return key;
  }

  private checkMemoryLimit(): void {
    if (this.cacheKeys.size > MEMORY_CONFIG.MAX_CACHED_IMAGES) {
      this.cleanup();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < 5000) return; // Prevent cleanup spam

    console.log('[MemoryManager] Starting cleanup...');
    const keysToRemove: string[] = [];
    const targetSize = Math.floor(MEMORY_CONFIG.MAX_CACHED_IMAGES * 0.7);

    // Remove oldest entries
    let count = 0;
    for (const [id] of this.cacheKeys) {
      if (count >= this.cacheKeys.size - targetSize) break;
      keysToRemove.push(id);
      count++;
    }

    keysToRemove.forEach(id => this.cacheKeys.delete(id));
    this.lastCleanup = now;
    console.log(`[MemoryManager] Cleaned up ${keysToRemove.length} entries`);
  }

  private updateMemoryUsage(): void {
    // Estimate memory usage (simplified)
    this.memoryUsage = this.cacheKeys.size * 1024; // Rough estimate
  }

  getMemoryStats(): {
    cachedImages: number;
    cachedAnnotations: number;
    estimatedMemory: number;
  } {
    let annotationCount = 0;
    let imageCount = 0;

    for (const id of this.cacheKeys.keys()) {
      if (id.startsWith('ann_')) {
        annotationCount++;
      } else {
        imageCount++;
      }
    }

    return {
      cachedImages: imageCount,
      cachedAnnotations: annotationCount,
      estimatedMemory: this.memoryUsage,
    };
  }

  clear(): void {
    this.cacheKeys.clear();
    this.memoryUsage = 0;
    console.log('[MemoryManager] Cache cleared');
  }
}

// Undo/Redo manager
class UndoRedoManager<T> {
  private history: T[] = [];
  private currentIndex = -1;

  push(state: T): void {
    // Remove everything after current index
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Add new state
    this.history.push(state);

    // Limit history size
    if (this.history.length > MEMORY_CONFIG.MAX_UNDO_HISTORY) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  undo(): T | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  redo(): T | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}

// Enhanced state interface
interface ImageState {
  // Images
  images: UploadedImage[];
  currentImageIndex: number;
  totalImages: number;
  isLoadingImages: boolean;
  imageError: string | null;

  // Annotations
  annotations: Map<string, BoundingBox[]>;
  isLoadingAnnotations: boolean;
  annotationError: string | null;
  isSavingAnnotations: boolean;
  dirtyAnnotations: Set<string>; // Track unsaved changes

  // Pagination
  currentPage: number;
  pageSize: number;
  hasMore: boolean;

  // Upload progress
  uploadProgress: Map<string, ImageUploadProgress>;
  activeUploads: number;

  // Performance & Memory
  performanceMetrics: Map<string, any>;
  memoryStats: {
    cachedImages: number;
    cachedAnnotations: number;
    estimatedMemory: number;
  };

  // Selection
  selectedImages: Set<string>;
  isMultiSelectMode: boolean;

  // Actions - Images
  fetchImages: (page?: number) => Promise<void>;
  fetchRecentImages: () => Promise<void>;
  fetchPendingAnnotation: () => Promise<void>;
  uploadImage: (file: File, onProgress?: (progress: ImageUploadProgress) => void) => Promise<UploadedImage>;
  uploadBatch: (files: File[], onProgress?: (file: string, progress: ImageUploadProgress) => void) => Promise<BatchUploadResult>;
  deleteImage: (imageId: string) => Promise<void>;
  deleteSelectedImages: () => Promise<void>;
  setCurrentImageIndex: (index: number) => void;
  prefetchAdjacentImages: () => void;

  // Actions - Annotations
  fetchAnnotations: (imageId: string) => Promise<void>;
  saveAnnotations: (imageId: string, boundingBoxes: BoundingBox[]) => Promise<void>;
  saveAllDirtyAnnotations: () => Promise<void>;
  updateAnnotation: (imageId: string, boundingBox: BoundingBox) => void;
  deleteAnnotation: (imageId: string, annotationId: string) => void;
  batchUpdateAnnotations: (updates: { imageId: string; annotations: BoundingBox[] }[]) => Promise<AnnotationBatchResult>;

  // Actions - Selection
  toggleImageSelection: (imageId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setMultiSelectMode: (enabled: boolean) => void;

  // Actions - Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions - Performance & Memory
  getPerformanceMetrics: () => Map<string, any>;
  clearMemoryCache: () => void;
  optimizeMemory: () => void;

  // Utility
  clearErrors: () => void;
  reset: () => void;
  exportState: () => any;
  importState: (state: any) => void;
}

// Create the enhanced store
export const useImageStore = create<ImageState>()(
  subscribeWithSelector(
    devtools(
      persist(
        (set, get) => {
          // Initialize managers
          const memoryManager = new MemoryManager();
          const performanceTracker = new PerformanceTracker();
          const undoManager = new UndoRedoManager<{ annotations: Map<string, BoundingBox[]> }>();

          // Setup memory monitoring
          setInterval(() => {
            set({ memoryStats: memoryManager.getMemoryStats() });
          }, MEMORY_CONFIG.MEMORY_CHECK_INTERVAL);

          return {
            // Initial state
            images: [],
            currentImageIndex: 0,
            totalImages: 0,
            isLoadingImages: false,
            imageError: null,
            annotations: new Map(),
            isLoadingAnnotations: false,
            annotationError: null,
            isSavingAnnotations: false,
            dirtyAnnotations: new Set(),
            currentPage: 1,
            pageSize: 20,
            hasMore: false,
            uploadProgress: new Map(),
            activeUploads: 0,
            performanceMetrics: new Map(),
            memoryStats: {
              cachedImages: 0,
              cachedAnnotations: 0,
              estimatedMemory: 0,
            },
            selectedImages: new Set(),
            isMultiSelectMode: false,

            // Fetch images with performance tracking
            fetchImages: async (page = 1) => {
              const startTime = Date.now();
              set({ isLoadingImages: true, imageError: null });

              try {
                const response = await imageService.getImages(page, get().pageSize);

                // Cache images in memory manager
                response.images.forEach(img => {
                  memoryManager.storeImage(img.id, img);
                });

                set({
                  images: response.images,
                  totalImages: response.total,
                  currentPage: response.page,
                  hasMore: response.hasMore,
                  isLoadingImages: false,
                });

                // Track performance
                performanceTracker.track('fetchImages', Date.now() - startTime);

                // Prefetch adjacent pages
                if (response.hasMore) {
                  get().prefetchAdjacentImages();
                }
              } catch (error) {
                set({
                  imageError: error instanceof Error ? error.message : 'Failed to fetch images',
                  isLoadingImages: false,
                });
              }
            },

            // Fetch recent images
            fetchRecentImages: async () => {
              const startTime = Date.now();
              set({ isLoadingImages: true, imageError: null });

              try {
                const images = await imageService.getRecentImages();

                images.forEach(img => {
                  memoryManager.storeImage(img.id, img);
                });

                set({
                  images,
                  totalImages: images.length,
                  isLoadingImages: false,
                });

                performanceTracker.track('fetchRecentImages', Date.now() - startTime);
              } catch (error) {
                set({
                  imageError: error instanceof Error ? error.message : 'Failed to fetch recent images',
                  isLoadingImages: false,
                });
              }
            },

            // Fetch pending annotation images
            fetchPendingAnnotation: async () => {
              const startTime = Date.now();
              set({ isLoadingImages: true, imageError: null });

              try {
                const images = await imageService.getPendingAnnotation();

                images.forEach(img => {
                  memoryManager.storeImage(img.id, img);
                });

                set({
                  images,
                  totalImages: images.length,
                  isLoadingImages: false,
                });

                performanceTracker.track('fetchPendingAnnotation', Date.now() - startTime);
              } catch (error) {
                set({
                  imageError: error instanceof Error ? error.message : 'Failed to fetch pending images',
                  isLoadingImages: false,
                });
              }
            },

            // Upload single image with progress tracking
            uploadImage: async (file: File, onProgress) => {
              const uploadId = `upload_${Date.now()}`;
              set(state => ({
                activeUploads: state.activeUploads + 1,
                imageError: null,
              }));

              try {
                const response = await imageService.uploadImage(file, (progress) => {
                  set(state => ({
                    uploadProgress: new Map(state.uploadProgress).set(uploadId, progress),
                  }));
                  onProgress?.(progress);
                });

                const newImage: UploadedImage = {
                  id: response.file_id,
                  file_id: response.file_id,
                  filename: response.filename,
                  url: response.url,
                  uploaded_at: new Date().toISOString(),
                };

                // Cache the new image
                memoryManager.storeImage(newImage.id, newImage);

                set(state => ({
                  images: [newImage, ...state.images],
                  totalImages: state.totalImages + 1,
                  activeUploads: Math.max(0, state.activeUploads - 1),
                  uploadProgress: (() => {
                    const newMap = new Map(state.uploadProgress);
                    newMap.delete(uploadId);
                    return newMap;
                  })(),
                }));

                return newImage;
              } catch (error) {
                set(state => ({
                  imageError: error instanceof Error ? error.message : 'Failed to upload image',
                  activeUploads: Math.max(0, state.activeUploads - 1),
                  uploadProgress: (() => {
                    const newMap = new Map(state.uploadProgress);
                    newMap.delete(uploadId);
                    return newMap;
                  })(),
                }));
                throw error;
              }
            },

            // Batch upload with progress
            uploadBatch: async (files: File[], onProgress) => {
              const startTime = Date.now();
              set({ imageError: null });

              try {
                const result = await imageService.uploadBatch(files, onProgress);

                // Process successful uploads
                const newImages: UploadedImage[] = result.successful.map(response => ({
                  id: response.file_id,
                  file_id: response.file_id,
                  filename: response.filename,
                  url: response.url,
                  uploaded_at: new Date().toISOString(),
                }));

                // Cache new images
                newImages.forEach(img => {
                  memoryManager.storeImage(img.id, img);
                });

                set(state => ({
                  images: [...newImages, ...state.images],
                  totalImages: state.totalImages + newImages.length,
                }));

                performanceTracker.track('batchUpload', Date.now() - startTime);

                return result;
              } catch (error) {
                set({
                  imageError: error instanceof Error ? error.message : 'Failed to upload images',
                });
                throw error;
              }
            },

            // Delete image
            deleteImage: async (imageId: string) => {
              const startTime = Date.now();
              set({ imageError: null });

              try {
                const success = await imageService.deleteImage(imageId);
                if (success) {
                  set(state => ({
                    images: state.images.filter(img => img.id !== imageId),
                    totalImages: Math.max(0, state.totalImages - 1),
                    annotations: new Map(
                      Array.from(state.annotations).filter(([id]) => id !== imageId)
                    ),
                    dirtyAnnotations: new Set(
                      Array.from(state.dirtyAnnotations).filter(id => id !== imageId)
                    ),
                    selectedImages: new Set(
                      Array.from(state.selectedImages).filter(id => id !== imageId)
                    ),
                  }));

                  performanceTracker.track('deleteImage', Date.now() - startTime);
                }
              } catch (error) {
                set({
                  imageError: error instanceof Error ? error.message : 'Failed to delete image',
                });
              }
            },

            // Delete selected images
            deleteSelectedImages: async () => {
              const selectedIds = Array.from(get().selectedImages);
              const promises = selectedIds.map(id => get().deleteImage(id));
              await Promise.allSettled(promises);
              get().clearSelection();
            },

            // Set current image index
            setCurrentImageIndex: (index: number) => {
              set({ currentImageIndex: index });

              // Prefetch annotations for current image
              const images = get().images;
              if (images[index]) {
                get().fetchAnnotations(images[index].id);
              }
            },

            // Prefetch adjacent images
            prefetchAdjacentImages: () => {
              const { currentImageIndex, images } = get();

              // Prefetch next and previous images
              if (currentImageIndex > 0 && images[currentImageIndex - 1]) {
                memoryManager.storeImage(images[currentImageIndex - 1].id, images[currentImageIndex - 1]);
              }
              if (currentImageIndex < images.length - 1 && images[currentImageIndex + 1]) {
                memoryManager.storeImage(images[currentImageIndex + 1].id, images[currentImageIndex + 1]);
              }
            },

            // Fetch annotations with caching
            fetchAnnotations: async (imageId: string) => {
              // Check memory cache first
              const cached = memoryManager.getAnnotations(imageId);
              if (cached) {
                set(state => ({
                  annotations: new Map(state.annotations).set(imageId, cached),
                }));
                return;
              }

              const startTime = Date.now();
              set({ isLoadingAnnotations: true, annotationError: null });

              try {
                const annotation = await annotationsService.getAnnotations(imageId);
                const boundingBoxes = annotation?.bounding_boxes || [];

                // Cache in memory manager
                memoryManager.storeAnnotations(imageId, boundingBoxes);

                set(state => ({
                  annotations: new Map(state.annotations).set(imageId, boundingBoxes),
                  isLoadingAnnotations: false,
                }));

                performanceTracker.track('fetchAnnotations', Date.now() - startTime);
              } catch (error) {
                set({
                  annotationError: error instanceof Error ? error.message : 'Failed to fetch annotations',
                  isLoadingAnnotations: false,
                });
              }
            },

            // Save annotations with undo support
            saveAnnotations: async (imageId: string, boundingBoxes: BoundingBox[]) => {
              // Save current state for undo
              undoManager.push({ annotations: new Map(get().annotations) });

              const startTime = Date.now();
              set({ isSavingAnnotations: true, annotationError: null });

              try {
                await annotationsService.saveAnnotations(imageId, boundingBoxes);

                // Update cache
                memoryManager.storeAnnotations(imageId, boundingBoxes);

                set(state => ({
                  annotations: new Map(state.annotations).set(imageId, boundingBoxes),
                  isSavingAnnotations: false,
                  dirtyAnnotations: new Set(
                    Array.from(state.dirtyAnnotations).filter(id => id !== imageId)
                  ),
                }));

                performanceTracker.track('saveAnnotations', Date.now() - startTime);
              } catch (error) {
                set({
                  annotationError: error instanceof Error ? error.message : 'Failed to save annotations',
                  isSavingAnnotations: false,
                });
                throw error;
              }
            },

            // Save all dirty annotations
            saveAllDirtyAnnotations: async () => {
              const dirtyIds = Array.from(get().dirtyAnnotations);
              const annotations = get().annotations;

              const promises = dirtyIds.map(id => {
                const boxes = annotations.get(id);
                if (boxes) {
                  return get().saveAnnotations(id, boxes);
                }
                return Promise.resolve();
              });

              await Promise.allSettled(promises);
            },

            // Update annotation optimistically
            updateAnnotation: (imageId: string, boundingBox: BoundingBox) => {
              set(state => {
                const currentAnnotations = state.annotations.get(imageId) || [];
                const updatedAnnotations = currentAnnotations.map(box =>
                  box.id === boundingBox.id ? boundingBox : box
                );

                // Mark as dirty for auto-save
                const dirtyAnnotations = new Set(state.dirtyAnnotations).add(imageId);

                return {
                  annotations: new Map(state.annotations).set(imageId, updatedAnnotations),
                  dirtyAnnotations,
                };
              });
            },

            // Delete annotation optimistically
            deleteAnnotation: (imageId: string, annotationId: string) => {
              set(state => {
                const currentAnnotations = state.annotations.get(imageId) || [];
                const updatedAnnotations = currentAnnotations.filter(box => box.id !== annotationId);

                // Mark as dirty
                const dirtyAnnotations = new Set(state.dirtyAnnotations).add(imageId);

                return {
                  annotations: new Map(state.annotations).set(imageId, updatedAnnotations),
                  dirtyAnnotations,
                };
              });
            },

            // Batch update annotations
            batchUpdateAnnotations: async (updates) => {
              const startTime = Date.now();
              const result = await annotationsService.batchUpdateAnnotations(updates);

              // Update cache for successful updates
              result.successful.forEach(annotation => {
                memoryManager.storeAnnotations(annotation.image_id, annotation.bounding_boxes);
                set(state => ({
                  annotations: new Map(state.annotations).set(
                    annotation.image_id,
                    annotation.bounding_boxes
                  ),
                }));
              });

              performanceTracker.track('batchUpdateAnnotations', Date.now() - startTime);

              return result;
            },

            // Selection actions
            toggleImageSelection: (imageId: string) => {
              set(state => {
                const selectedImages = new Set(state.selectedImages);
                if (selectedImages.has(imageId)) {
                  selectedImages.delete(imageId);
                } else {
                  selectedImages.add(imageId);
                }
                return { selectedImages };
              });
            },

            selectAll: () => {
              set(state => ({
                selectedImages: new Set(state.images.map(img => img.id)),
              }));
            },

            clearSelection: () => {
              set({ selectedImages: new Set() });
            },

            setMultiSelectMode: (enabled: boolean) => {
              set({ isMultiSelectMode: enabled });
              if (!enabled) {
                get().clearSelection();
              }
            },

            // Undo/Redo
            undo: () => {
              const prevState = undoManager.undo();
              if (prevState) {
                set({ annotations: prevState.annotations });
              }
            },

            redo: () => {
              const nextState = undoManager.redo();
              if (nextState) {
                set({ annotations: nextState.annotations });
              }
            },

            canUndo: () => undoManager.canUndo(),
            canRedo: () => undoManager.canRedo(),

            // Performance & Memory
            getPerformanceMetrics: () => performanceTracker.getMetrics(),

            clearMemoryCache: () => {
              memoryManager.clear();
              set({
                memoryStats: {
                  cachedImages: 0,
                  cachedAnnotations: 0,
                  estimatedMemory: 0,
                },
              });
            },

            optimizeMemory: () => {
              // Clear unused data
              const currentImageIds = new Set(get().images.map(img => img.id));
              const annotations = get().annotations;

              // Remove annotations for non-existent images
              const cleanedAnnotations = new Map();
              for (const [id, boxes] of annotations) {
                if (currentImageIds.has(id)) {
                  cleanedAnnotations.set(id, boxes);
                }
              }

              set({ annotations: cleanedAnnotations });
              memoryManager.clear();
            },

            // Utility actions
            clearErrors: () => {
              set({ imageError: null, annotationError: null });
            },

            reset: () => {
              memoryManager.clear();
              performanceTracker.reset();
              undoManager.clear();

              set({
                images: [],
                currentImageIndex: 0,
                totalImages: 0,
                isLoadingImages: false,
                imageError: null,
                annotations: new Map(),
                isLoadingAnnotations: false,
                annotationError: null,
                isSavingAnnotations: false,
                dirtyAnnotations: new Set(),
                currentPage: 1,
                pageSize: 20,
                hasMore: false,
                uploadProgress: new Map(),
                activeUploads: 0,
                selectedImages: new Set(),
                isMultiSelectMode: false,
              });
            },

            exportState: () => {
              const state = get();
              return {
                images: state.images,
                annotations: Array.from(state.annotations),
                currentImageIndex: state.currentImageIndex,
                currentPage: state.currentPage,
                pageSize: state.pageSize,
              };
            },

            importState: (importedState) => {
              if (importedState.images) {
                set({
                  images: importedState.images,
                  annotations: new Map(importedState.annotations || []),
                  currentImageIndex: importedState.currentImageIndex || 0,
                  currentPage: importedState.currentPage || 1,
                  pageSize: importedState.pageSize || 20,
                });
              }
            },
          };
        },
        {
          name: 'enhanced-image-store',
          partialize: (state) => ({
            // Only persist essential data
            currentImageIndex: state.currentImageIndex,
            currentPage: state.currentPage,
            pageSize: state.pageSize,
            isMultiSelectMode: state.isMultiSelectMode,
          }),
        }
      ),
      {
        name: 'EnhancedImageStore',
      }
    )
  )
);

// Export selectors for optimized re-renders
export const useCurrentImage = () =>
  useImageStore(state => state.images[state.currentImageIndex], shallow);

export const useCurrentAnnotations = () =>
  useImageStore(state => {
    const currentImage = state.images[state.currentImageIndex];
    return currentImage ? state.annotations.get(currentImage.id) || [] : [];
  }, shallow);

export const useImageSelection = () =>
  useImageStore(
    state => ({
      selectedImages: state.selectedImages,
      isMultiSelectMode: state.isMultiSelectMode,
      toggleImageSelection: state.toggleImageSelection,
      selectAll: state.selectAll,
      clearSelection: state.clearSelection,
    }),
    shallow
  );

export const useMemoryStats = () =>
  useImageStore(state => state.memoryStats, shallow);

export const useUploadProgress = () =>
  useImageStore(
    state => ({
      uploadProgress: state.uploadProgress,
      activeUploads: state.activeUploads,
    }),
    shallow
  );

export default useImageStore;