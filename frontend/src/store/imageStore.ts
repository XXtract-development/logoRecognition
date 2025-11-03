/**
 * Image Store - Zustand store for image management
 * Replaces sessionStorage with persistent state management
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import imageService, { UploadedImage } from '../services/imageService';
import annotationsService, { BoundingBox, Annotation } from '../services/annotationsService';

interface ImageState {
  // Images
  images: UploadedImage[];
  currentImageIndex: number;
  totalImages: number;
  isLoadingImages: boolean;
  imageError: string | null;

  // Annotations
  annotations: Map<string, BoundingBox[]>; // Map of imageId to annotations
  isLoadingAnnotations: boolean;
  annotationError: string | null;
  isSavingAnnotations: boolean;

  // Pagination
  currentPage: number;
  pageSize: number;
  hasMore: boolean;

  // Actions - Images
  fetchImages: (page?: number) => Promise<void>;
  fetchRecentImages: () => Promise<void>;
  fetchPendingAnnotation: () => Promise<void>;
  uploadImage: (file: File, onProgress?: (progress: number) => void) => Promise<UploadedImage>;
  uploadMultipleImages: (files: File[], onProgress?: (index: number, progress: number) => void) => Promise<UploadedImage[]>;
  deleteImage: (imageId: string) => Promise<void>;
  setCurrentImageIndex: (index: number) => void;

  // Actions - Annotations
  fetchAnnotations: (imageId: string) => Promise<void>;
  saveAnnotations: (imageId: string, boundingBoxes: BoundingBox[]) => Promise<void>;
  updateAnnotation: (imageId: string, boundingBox: BoundingBox) => void;
  deleteAnnotation: (imageId: string, annotationId: string) => void;

  // Utility
  clearErrors: () => void;
  reset: () => void;
}

const initialState = {
  images: [],
  currentImageIndex: 0,
  totalImages: 0,
  isLoadingImages: false,
  imageError: null,
  annotations: new Map(),
  isLoadingAnnotations: false,
  annotationError: null,
  isSavingAnnotations: false,
  currentPage: 1,
  pageSize: 20,
  hasMore: false,
};

export const useImageStore = create<ImageState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Fetch images from backend
        fetchImages: async (page = 1) => {
          set({ isLoadingImages: true, imageError: null });
          try {
            const response = await imageService.getImages(page, get().pageSize);
            set({
              images: response.images,
              totalImages: response.total,
              currentPage: response.page,
              hasMore: response.hasMore,
              isLoadingImages: false,
            });
          } catch (error) {
            set({
              imageError: error instanceof Error ? error.message : 'Failed to fetch images',
              isLoadingImages: false,
            });
          }
        },

        // Fetch recent images for annotation
        fetchRecentImages: async () => {
          set({ isLoadingImages: true, imageError: null });
          try {
            const images = await imageService.getRecentImages();
            set({
              images,
              totalImages: images.length,
              isLoadingImages: false,
            });
          } catch (error) {
            set({
              imageError: error instanceof Error ? error.message : 'Failed to fetch recent images',
              isLoadingImages: false,
            });
          }
        },

        // Fetch images pending annotation
        fetchPendingAnnotation: async () => {
          set({ isLoadingImages: true, imageError: null });
          try {
            const images = await imageService.getPendingAnnotation();
            set({
              images,
              totalImages: images.length,
              isLoadingImages: false,
            });
          } catch (error) {
            set({
              imageError: error instanceof Error ? error.message : 'Failed to fetch pending images',
              isLoadingImages: false,
            });
          }
        },

        // Upload single image
        uploadImage: async (file: File, onProgress?: (progress: number) => void) => {
          set({ imageError: null });
          try {
            const response = await imageService.uploadImage(file, onProgress ? (progress) => onProgress(progress.percentage) : undefined);
            const newImage: UploadedImage = {
              id: response.file_id,
              file_id: response.file_id,
              filename: response.filename,
              url: response.url,
              uploaded_at: new Date().toISOString(),
            };

            set(state => ({
              images: [newImage, ...state.images],
              totalImages: state.totalImages + 1,
            }));

            return newImage;
          } catch (error) {
            set({
              imageError: error instanceof Error ? error.message : 'Failed to upload image',
            });
            throw error;
          }
        },

        // Upload multiple images
        uploadMultipleImages: async (files: File[], onProgress?: (index: number, progress: number) => void) => {
          set({ imageError: null });
          try {
            const responses = await imageService.uploadMultiple(files, onProgress ? (filename, progress) => {
              const index = files.findIndex(f => f.name === filename);
              onProgress(index, progress.percentage);
            } : undefined);
            const newImages: UploadedImage[] = responses.successful.map(response => ({
              id: response.file_id,
              file_id: response.file_id,
              filename: response.filename,
              url: response.url,
              uploaded_at: new Date().toISOString(),
            }));

            set(state => ({
              images: [...newImages, ...state.images],
              totalImages: state.totalImages + newImages.length,
            }));

            return newImages;
          } catch (error) {
            set({
              imageError: error instanceof Error ? error.message : 'Failed to upload images',
            });
            throw error;
          }
        },

        // Delete image
        deleteImage: async (imageId: string) => {
          set({ imageError: null });
          try {
            await imageService.deleteImage(imageId);
            set(state => ({
              images: state.images.filter(img => img.id !== imageId),
              totalImages: Math.max(0, state.totalImages - 1),
              annotations: new Map(
                Array.from(state.annotations).filter(([id]) => id !== imageId)
              ),
            }));
          } catch (error) {
            set({
              imageError: error instanceof Error ? error.message : 'Failed to delete image',
            });
            throw error;
          }
        },

        // Set current image index
        setCurrentImageIndex: (index: number) => {
          set({ currentImageIndex: index });
        },

        // Fetch annotations for an image
        fetchAnnotations: async (imageId: string) => {
          set({ isLoadingAnnotations: true, annotationError: null });
          try {
            const annotation = await annotationsService.getAnnotations(imageId);
            const boundingBoxes = annotation?.bounding_boxes || [];

            set(state => ({
              annotations: new Map(state.annotations).set(imageId, boundingBoxes),
              isLoadingAnnotations: false,
            }));
          } catch (error) {
            set({
              annotationError: error instanceof Error ? error.message : 'Failed to fetch annotations',
              isLoadingAnnotations: false,
            });
          }
        },

        // Save annotations
        saveAnnotations: async (imageId: string, boundingBoxes: BoundingBox[]) => {
          set({ isSavingAnnotations: true, annotationError: null });
          try {
            await annotationsService.saveAnnotations(imageId, boundingBoxes);
            set(state => ({
              annotations: new Map(state.annotations).set(imageId, boundingBoxes),
              isSavingAnnotations: false,
            }));
          } catch (error) {
            set({
              annotationError: error instanceof Error ? error.message : 'Failed to save annotations',
              isSavingAnnotations: false,
            });
            throw error;
          }
        },

        // Update annotation locally (optimistic update)
        updateAnnotation: (imageId: string, boundingBox: BoundingBox) => {
          set(state => {
            const currentAnnotations = state.annotations.get(imageId) || [];
            const updatedAnnotations = currentAnnotations.map(box =>
              box.id === boundingBox.id ? boundingBox : box
            );
            return {
              annotations: new Map(state.annotations).set(imageId, updatedAnnotations),
            };
          });
        },

        // Delete annotation locally (optimistic update)
        deleteAnnotation: (imageId: string, annotationId: string) => {
          set(state => {
            const currentAnnotations = state.annotations.get(imageId) || [];
            const updatedAnnotations = currentAnnotations.filter(box => box.id !== annotationId);
            return {
              annotations: new Map(state.annotations).set(imageId, updatedAnnotations),
            };
          });
        },

        // Clear errors
        clearErrors: () => {
          set({ imageError: null, annotationError: null });
        },

        // Reset store
        reset: () => {
          set(initialState);
        },
      }),
      {
        name: 'image-store', // Unique name for localStorage
        partialize: (state) => ({
          // Only persist essential data
          currentImageIndex: state.currentImageIndex,
          currentPage: state.currentPage,
          pageSize: state.pageSize,
        }),
      }
    ),
    {
      name: 'ImageStore',
    }
  )
);