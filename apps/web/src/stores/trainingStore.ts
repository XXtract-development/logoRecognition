/**
 * Training Store
 * State management for training images, categories, and annotations
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  TrainingImage,
  Category,
  Annotation,
  ImageFilters,
  ImageSort,
  ViewMode,
  BatchUploadProgress,
} from '@/types/training.types';

interface TrainingState {
  // Images
  images: TrainingImage[];
  selectedImageIds: string[];
  currentImage: TrainingImage | null;
  filters: ImageFilters;
  sort: ImageSort;
  viewMode: ViewMode;
  isLoading: boolean;

  // Upload
  uploadProgress: BatchUploadProgress | null;
  isUploading: boolean;

  // Categories
  categories: Category[];
  selectedCategoryId: string | null;

  // Annotations for current image
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  isAnnotating: boolean;

  // Actions - Images
  setImages: (images: TrainingImage[]) => void;
  addImage: (image: TrainingImage) => void;
  updateImage: (id: string, updates: Partial<TrainingImage>) => void;
  removeImage: (id: string) => void;
  selectImage: (id: string) => void;
  toggleImageSelection: (id: string) => void;
  selectAllImages: () => void;
  clearSelection: () => void;
  setCurrentImage: (image: TrainingImage | null) => void;
  setFilters: (filters: ImageFilters) => void;
  setSort: (sort: ImageSort) => void;
  setViewMode: (mode: ViewMode) => void;
  setLoading: (loading: boolean) => void;

  // Actions - Upload
  setUploadProgress: (progress: BatchUploadProgress | null) => void;
  setUploading: (uploading: boolean) => void;

  // Actions - Categories
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  selectCategory: (id: string | null) => void;

  // Actions - Annotations
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  setAnnotating: (annotating: boolean) => void;

  // Computed
  getFilteredImages: () => TrainingImage[];
  getSelectedImages: () => TrainingImage[];

  // Reset
  reset: () => void;
}

const initialState = {
  images: [],
  selectedImageIds: [],
  currentImage: null,
  filters: {},
  sort: { field: 'uploadedAt' as const, order: 'desc' as const },
  viewMode: 'grid' as ViewMode,
  isLoading: false,
  uploadProgress: null,
  isUploading: false,
  categories: [],
  selectedCategoryId: null,
  annotations: [],
  selectedAnnotationId: null,
  isAnnotating: false,
};

export const useTrainingStore = create<TrainingState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,

        // Image Actions
        setImages: (images) =>
          set((state) => {
            state.images = images;
          }),

        addImage: (image) =>
          set((state) => {
            state.images.unshift(image);
          }),

        updateImage: (id, updates) =>
          set((state) => {
            const index = state.images.findIndex((img) => img.id === id);
            if (index !== -1) {
              Object.assign(state.images[index], updates);
            }
          }),

        removeImage: (id) =>
          set((state) => {
            state.images = state.images.filter((img) => img.id !== id);
            state.selectedImageIds = state.selectedImageIds.filter((i) => i !== id);
          }),

        selectImage: (id) =>
          set((state) => {
            if (!state.selectedImageIds.includes(id)) {
              state.selectedImageIds.push(id);
            }
          }),

        toggleImageSelection: (id) =>
          set((state) => {
            const index = state.selectedImageIds.indexOf(id);
            if (index === -1) {
              state.selectedImageIds.push(id);
            } else {
              state.selectedImageIds.splice(index, 1);
            }
          }),

        selectAllImages: () =>
          set((state) => {
            state.selectedImageIds = state.images.map((img) => img.id);
          }),

        clearSelection: () =>
          set((state) => {
            state.selectedImageIds = [];
          }),

        setCurrentImage: (image) =>
          set((state) => {
            state.currentImage = image;
          }),

        setFilters: (filters) =>
          set((state) => {
            state.filters = filters;
          }),

        setSort: (sort) =>
          set((state) => {
            state.sort = sort;
          }),

        setViewMode: (mode) =>
          set((state) => {
            state.viewMode = mode;
          }),

        setLoading: (loading) =>
          set((state) => {
            state.isLoading = loading;
          }),

        // Upload Actions
        setUploadProgress: (progress) =>
          set((state) => {
            state.uploadProgress = progress;
          }),

        setUploading: (uploading) =>
          set((state) => {
            state.isUploading = uploading;
          }),

        // Category Actions
        setCategories: (categories) =>
          set((state) => {
            state.categories = categories;
          }),

        addCategory: (category) =>
          set((state) => {
            state.categories.push(category);
          }),

        updateCategory: (id, updates) =>
          set((state) => {
            const index = state.categories.findIndex((cat) => cat.id === id);
            if (index !== -1) {
              Object.assign(state.categories[index], updates);
            }
          }),

        removeCategory: (id) =>
          set((state) => {
            state.categories = state.categories.filter((cat) => cat.id !== id);
          }),

        selectCategory: (id) =>
          set((state) => {
            state.selectedCategoryId = id;
          }),

        // Annotation Actions
        setAnnotations: (annotations) =>
          set((state) => {
            state.annotations = annotations;
          }),

        addAnnotation: (annotation) =>
          set((state) => {
            state.annotations.push(annotation);
          }),

        updateAnnotation: (id, updates) =>
          set((state) => {
            const index = state.annotations.findIndex((ann) => ann.id === id);
            if (index !== -1) {
              Object.assign(state.annotations[index], updates);
            }
          }),

        removeAnnotation: (id) =>
          set((state) => {
            state.annotations = state.annotations.filter((ann) => ann.id !== id);
            if (state.selectedAnnotationId === id) {
              state.selectedAnnotationId = null;
            }
          }),

        selectAnnotation: (id) =>
          set((state) => {
            state.selectedAnnotationId = id;
          }),

        setAnnotating: (annotating) =>
          set((state) => {
            state.isAnnotating = annotating;
          }),

        // Computed
        getFilteredImages: () => {
          const { images, filters, sort } = get();
          let filtered = [...images];

          if (filters.status) {
            filtered = filtered.filter((img) => img.annotationStatus === filters.status);
          }
          if (filters.categoryId) {
            filtered = filtered.filter((img) => img.categoryId === filters.categoryId);
          }
          if (filters.search) {
            const search = filters.search.toLowerCase();
            filtered = filtered.filter((img) =>
              img.originalName.toLowerCase().includes(search)
            );
          }
          if (filters.dateFrom) {
            filtered = filtered.filter(
              (img) => new Date(img.uploadedAt) >= filters.dateFrom!
            );
          }
          if (filters.dateTo) {
            filtered = filtered.filter(
              (img) => new Date(img.uploadedAt) <= filters.dateTo!
            );
          }

          // Sort
          filtered.sort((a, b) => {
            const aVal = a[sort.field];
            const bVal = b[sort.field];
            const modifier = sort.order === 'asc' ? 1 : -1;

            if (aVal < bVal) return -1 * modifier;
            if (aVal > bVal) return 1 * modifier;
            return 0;
          });

          return filtered;
        },

        getSelectedImages: () => {
          const { images, selectedImageIds } = get();
          return images.filter((img) => selectedImageIds.includes(img.id));
        },

        reset: () => set(initialState),
      })),
      {
        name: 'training-store',
        partialize: (state) => ({
          viewMode: state.viewMode,
          sort: state.sort,
        }),
      }
    ),
    { name: 'TrainingStore' }
  )
);
