/**
 * Category Store
 *
 * Zustand store for managing category state with filtering, search, and modal management
 */

// Check if zustand is available, otherwise provide a mock implementation
let create: any;
let devtools: any;
let persist: any;
let immer: any;

try {
  const zustand = require('zustand');
  create = zustand.create;
  devtools = require('zustand/middleware').devtools;
  persist = require('zustand/middleware').persist;
  immer = require('zustand/middleware/immer').immer;
} catch (e) {
  // Fallback implementation if zustand is not installed
  console.warn('Zustand not found, using fallback state management');

  // Simple fallback implementation
  create = () => () => ({
    categories: [],
    filteredCategories: [],
    selectedCategory: null,
    totalCount: 0,
    filteredCount: 0,
    searchTerm: '',
    page: 1,
    pageSize: 20,
    sortBy: 'categorie',
    sortOrder: 'asc',
    modalVisible: false,
    loading: false,
    error: null,
    selectedRowKeys: [],
    setSearchTerm: () => {},
    setPage: () => {},
    setPageSize: () => {},
    setSorting: () => {},
    setSelectedCategory: () => {},
    setModalVisible: () => {},
    setSelectedRowKeys: () => {},
    fetchCategories: async () => {},
    saveCategory: async () => {},
    deleteCategory: async () => {},
    deleteBulkCategories: async () => {},
    importCategories: async () => {},
    resetFilters: () => {},
    clearError: () => {},
    getFilteredCategories: () => [],
  });

  devtools = (fn: any) => fn;
  persist = (fn: any) => fn;
  immer = (fn: any) => fn;
}
import type { Category, CategoryListResponse } from '../types/category';
import { CategoryFormData } from '../components/Categories/CategoryModal';
import { categoryService } from '../services/categoryService';

interface CategoryState {
  // Data
  categories: Category[];
  filteredCategories: Category[];
  selectedCategory: Category | null;

  // Counts
  totalCount: number;
  filteredCount: number;

  // UI State
  searchTerm: string;
  page: number;
  pageSize: number;
  sortBy: 'categorie' | 'annotation_count' | 'created_at';
  sortOrder: 'asc' | 'desc';
  modalVisible: boolean;
  loading: boolean;
  error: string | null;

  // Selection
  selectedRowKeys: React.Key[];

  // Actions
  setSearchTerm: (term: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSorting: (field: 'categorie' | 'annotation_count' | 'created_at', order: 'asc' | 'desc') => void;
  setSelectedCategory: (category: Category | null) => void;
  setModalVisible: (visible: boolean) => void;
  setSelectedRowKeys: (keys: React.Key[]) => void;

  // API Actions
  fetchCategories: () => Promise<void>;
  fetchAllCategories: () => Promise<void>;
  saveCategory: (category: CategoryFormData) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  deleteBulkCategories: (ids: number[]) => Promise<void>;
  importCategories: (file: File) => Promise<void>;

  // Utilities
  resetFilters: () => void;
  clearError: () => void;
  getFilteredCategories: () => Category[];
}

const useCategoryStore = create<CategoryState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial state
        categories: [],
        filteredCategories: [],
        selectedCategory: null,
        totalCount: 0,
        filteredCount: 0,
        searchTerm: '',
        page: 1,
        pageSize: 20,
        sortBy: 'categorie',
        sortOrder: 'asc',
        modalVisible: false,
        loading: false,
        error: null,
        selectedRowKeys: [],

        // UI Actions
        setSearchTerm: (term) => set((state) => {
          state.searchTerm = term;
          state.page = 1; // Reset to first page on search
        }),

        setPage: (page) => set((state) => {
          state.page = page;
        }),

        setPageSize: (size) => set((state) => {
          state.pageSize = size;
          state.page = 1; // Reset to first page on size change
        }),

        setSorting: (field, order) => set((state) => {
          state.sortBy = field;
          state.sortOrder = order;
        }),

        setSelectedCategory: (category) => set((state) => {
          state.selectedCategory = category;
        }),

        setModalVisible: (visible) => set((state) => {
          state.modalVisible = visible;
          if (!visible) {
            state.selectedCategory = null;
          }
        }),

        setSelectedRowKeys: (keys) => set((state) => {
          state.selectedRowKeys = keys;
        }),

        // API Actions
        fetchCategories: async () => {
          set((state) => {
            state.loading = true;
            state.error = null;
          });

          try {
            const { searchTerm, page, pageSize, sortBy, sortOrder } = get();

            const response = await categoryService.getCategoriesWithSearch(
              searchTerm,
              page,
              pageSize,
              sortBy,
              sortOrder
            );

            set((state) => {
              state.categories = response.categories;
              state.filteredCategories = response.categories;
              state.totalCount = response.total;
              state.filteredCount = response.filtered || response.total;
              state.loading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to fetch categories';
              state.loading = false;
            });
          }
        },

        fetchAllCategories: async () => {
          set((state) => {
            state.loading = true;
            state.error = null;
          });

          try {
            // Fetch all categories without pagination by using maximum allowed page size
            const response = await categoryService.getCategoriesWithSearch(
              '', // no search filter
              1, // first page
              1000, // maximum page size allowed by backend (le=1000)
              'categorie', // sort by category name
              'asc' // ascending order
            );

            set((state) => {
              state.categories = response.categories;
              state.filteredCategories = response.categories;
              state.totalCount = response.total;
              state.filteredCount = response.filtered || response.total;
              state.loading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to fetch all categories';
              state.loading = false;
            });
          }
        },

        saveCategory: async (formData) => {
          set((state) => {
            state.loading = true;
            state.error = null;
          });

          try {
            const selectedCategory = get().selectedCategory;

            if (selectedCategory?.id) {
              // Update existing
              await categoryService.updateCategory(selectedCategory.id, formData);
            } else {
              // Create new
              await categoryService.createCategory(formData);
              // Reset to first page to see new category
              set((state) => {
                state.page = 1;
              });
            }

            // Refresh list
            await get().fetchCategories();

            set((state) => {
              state.modalVisible = false;
              state.selectedCategory = null;
              state.loading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to save category';
              state.loading = false;
            });
            throw error; // Re-throw for modal to handle
          }
        },

        deleteCategory: async (id) => {
          set((state) => {
            state.loading = true;
            state.error = null;
          });

          try {
            await categoryService.deleteCategory(id);
            await get().fetchCategories();

            set((state) => {
              state.loading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to delete category';
              state.loading = false;
            });
            throw error;
          }
        },

        deleteBulkCategories: async (ids) => {
          set((state) => {
            state.loading = true;
            state.error = null;
          });

          try {
            // In real implementation, this would be a single bulk delete endpoint
            for (const id of ids) {
              await categoryService.deleteCategory(id);
            }

            await get().fetchCategories();

            set((state) => {
              state.selectedRowKeys = [];
              state.loading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to delete categories';
              state.loading = false;
            });
            throw error;
          }
        },

        importCategories: async (file) => {
          set((state) => {
            state.loading = true;
            state.error = null;
          });

          try {
            await categoryService.importCategoriesFromFile(file);
            await get().fetchCategories();

            set((state) => {
              state.loading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to import categories';
              state.loading = false;
            });
            throw error;
          }
        },

        // Utilities
        resetFilters: () => set((state) => {
          state.searchTerm = '';
          state.page = 1;
          state.pageSize = 20;
          state.sortBy = 'categorie';
          state.sortOrder = 'asc';
          state.selectedRowKeys = [];
        }),

        clearError: () => set((state) => {
          state.error = null;
        }),

        getFilteredCategories: () => {
          const state = get();

          if (!state.searchTerm) {
            return state.categories;
          }

          const searchLower = state.searchTerm.toLowerCase();
          return state.categories.filter(cat =>
            cat.categorie.toLowerCase().includes(searchLower) ||
            cat.code.toLowerCase().includes(searchLower) ||
            cat.categorie_naam?.toLowerCase().includes(searchLower) ||
            cat.code_naam?.toLowerCase().includes(searchLower)
          );
        },
      })),
      {
        name: 'category-store',
        // Only persist UI preferences, not data
        partialize: (state) => ({
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
        }),
      }
    ),
    { name: 'CategoryStore' }
  )
);

export default useCategoryStore;