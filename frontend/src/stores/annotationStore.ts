import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { Annotation, AnnotationHistory } from '../types/annotation';

interface AnnotationState {
  annotations: Annotation[];
  selectedAnnotations: string[];
  history: AnnotationHistory[];
  historyIndex: number;
  currentTool: 'boundingBox' | 'polygon' | 'point' | 'select';
  isDrawing: boolean;

  // Actions
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  setAnnotations: (annotations: Annotation[]) => void;

  // Selection
  selectAnnotation: (id: string) => void;
  deselectAnnotation: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  deselectAll: () => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Tool management
  setTool: (tool: AnnotationState['currentTool']) => void;
  setIsDrawing: (isDrawing: boolean) => void;

  // Bulk operations
  deleteSelected: () => void;
  duplicateSelected: () => void;
  alignSelected: (alignment: 'left' | 'right' | 'top' | 'bottom' | 'center' | 'middle') => void;
  distributeSelected: (direction: 'horizontal' | 'vertical') => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        annotations: [],
        selectedAnnotations: [],
        history: [],
        historyIndex: -1,
        currentTool: 'select',
        isDrawing: false,
        canUndo: false,
        canRedo: false,

        addAnnotation: (annotation) => {
          set((state) => {
            state.annotations.push(annotation);

            // Add to history
            const historyEntry: AnnotationHistory = {
              id: `history_${Date.now()}`,
              annotationId: annotation.id,
              action: 'create',
              changes: annotation,
              userId: 'current_user',
              timestamp: new Date(),
            };

            // Remove any redo history
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(historyEntry);
            state.historyIndex = state.history.length - 1;
            state.canUndo = true;
            state.canRedo = false;
          });
        },

        updateAnnotation: (id, updates) => {
          set((state) => {
            const index = state.annotations.findIndex((a) => a.id === id);
            if (index !== -1) {
              const previousState = { ...state.annotations[index] };
              Object.assign(state.annotations[index], updates, {
                updated: new Date(),
              });

              // Add to history
              const historyEntry: AnnotationHistory = {
                id: `history_${Date.now()}`,
                annotationId: id,
                action: 'update',
                changes: updates,
                userId: 'current_user',
                timestamp: new Date(),
              };

              state.history = state.history.slice(0, state.historyIndex + 1);
              state.history.push(historyEntry);
              state.historyIndex = state.history.length - 1;
              state.canUndo = true;
              state.canRedo = false;
            }
          });
        },

        deleteAnnotation: (id) => {
          set((state) => {
            const annotation = state.annotations.find((a) => a.id === id);
            if (annotation) {
              state.annotations = state.annotations.filter((a) => a.id !== id);
              state.selectedAnnotations = state.selectedAnnotations.filter((sid) => sid !== id);

              // Add to history
              const historyEntry: AnnotationHistory = {
                id: `history_${Date.now()}`,
                annotationId: id,
                action: 'delete',
                changes: annotation,
                userId: 'current_user',
                timestamp: new Date(),
              };

              state.history = state.history.slice(0, state.historyIndex + 1);
              state.history.push(historyEntry);
              state.historyIndex = state.history.length - 1;
              state.canUndo = true;
              state.canRedo = false;
            }
          });
        },

        setAnnotations: (annotations) => {
          set((state) => {
            state.annotations = annotations;
          });
        },

        selectAnnotation: (id) => {
          set((state) => {
            if (!state.selectedAnnotations.includes(id)) {
              state.selectedAnnotations.push(id);
            }
          });
        },

        deselectAnnotation: (id) => {
          set((state) => {
            state.selectedAnnotations = state.selectedAnnotations.filter((sid) => sid !== id);
          });
        },

        selectMultiple: (ids) => {
          set((state) => {
            state.selectedAnnotations = ids;
          });
        },

        deselectAll: () => {
          set((state) => {
            state.selectedAnnotations = [];
          });
        },

        undo: () => {
          const state = get();
          if (state.historyIndex >= 0) {
            const entry = state.history[state.historyIndex];

            set((draft) => {
              if (entry.action === 'create') {
                // Undo creation by deleting
                draft.annotations = draft.annotations.filter((a) => a.id !== entry.annotationId);
              } else if (entry.action === 'delete') {
                // Undo deletion by recreating
                draft.annotations.push(entry.changes as Annotation);
              } else if (entry.action === 'update') {
                // Find previous state and restore
                const annotation = draft.annotations.find((a) => a.id === entry.annotationId);
                if (annotation) {
                  // Simple revert - in production, store full previous state
                  Object.keys(entry.changes).forEach(key => {
                    delete (annotation as any)[key];
                  });
                }
              }

              draft.historyIndex--;
              draft.canUndo = draft.historyIndex >= 0;
              draft.canRedo = true;
            });
          }
        },

        redo: () => {
          const state = get();
          if (state.historyIndex < state.history.length - 1) {
            const entry = state.history[state.historyIndex + 1];

            set((draft) => {
              if (entry.action === 'create') {
                draft.annotations.push(entry.changes as Annotation);
              } else if (entry.action === 'delete') {
                draft.annotations = draft.annotations.filter((a) => a.id !== entry.annotationId);
              } else if (entry.action === 'update') {
                const annotation = draft.annotations.find((a) => a.id === entry.annotationId);
                if (annotation) {
                  Object.assign(annotation, entry.changes);
                }
              }

              draft.historyIndex++;
              draft.canUndo = true;
              draft.canRedo = draft.historyIndex < draft.history.length - 1;
            });
          }
        },

        setTool: (tool) => {
          set({ currentTool: tool });
        },

        setIsDrawing: (isDrawing) => {
          set({ isDrawing });
        },

        deleteSelected: () => {
          const state = get();
          state.selectedAnnotations.forEach((id) => {
            state.deleteAnnotation(id);
          });
        },

        duplicateSelected: () => {
          set((state) => {
            const selectedAnnotations = state.annotations.filter((a) =>
              state.selectedAnnotations.includes(a.id)
            );

            const duplicates = selectedAnnotations.map((annotation) => ({
              ...annotation,
              id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              x: (annotation.x || 0) + 20,
              y: (annotation.y || 0) + 20,
              created: new Date(),
              updated: new Date(),
            }));

            state.annotations.push(...duplicates);
            state.selectedAnnotations = duplicates.map((d) => d.id);
          });
        },

        alignSelected: (alignment) => {
          set((state) => {
            const selected = state.annotations.filter((a) =>
              state.selectedAnnotations.includes(a.id)
            );

            if (selected.length < 2) return;

            let referenceValue: number;

            switch (alignment) {
              case 'left':
                referenceValue = Math.min(...selected.map((a) => a.x || 0));
                selected.forEach((annotation) => {
                  const original = state.annotations.find((a) => a.id === annotation.id);
                  if (original && original.x !== undefined) {
                    original.x = referenceValue;
                  }
                });
                break;

              case 'right':
                referenceValue = Math.max(...selected.map((a) => (a.x || 0) + (a.width || 0)));
                selected.forEach((annotation) => {
                  const original = state.annotations.find((a) => a.id === annotation.id);
                  if (original && original.x !== undefined && original.width !== undefined) {
                    original.x = referenceValue - original.width;
                  }
                });
                break;

              case 'top':
                referenceValue = Math.min(...selected.map((a) => a.y || 0));
                selected.forEach((annotation) => {
                  const original = state.annotations.find((a) => a.id === annotation.id);
                  if (original && original.y !== undefined) {
                    original.y = referenceValue;
                  }
                });
                break;

              case 'bottom':
                referenceValue = Math.max(...selected.map((a) => (a.y || 0) + (a.height || 0)));
                selected.forEach((annotation) => {
                  const original = state.annotations.find((a) => a.id === annotation.id);
                  if (original && original.y !== undefined && original.height !== undefined) {
                    original.y = referenceValue - original.height;
                  }
                });
                break;

              case 'center':
                const minX = Math.min(...selected.map((a) => a.x || 0));
                const maxX = Math.max(...selected.map((a) => (a.x || 0) + (a.width || 0)));
                const centerX = (minX + maxX) / 2;
                selected.forEach((annotation) => {
                  const original = state.annotations.find((a) => a.id === annotation.id);
                  if (original && original.x !== undefined && original.width !== undefined) {
                    original.x = centerX - original.width / 2;
                  }
                });
                break;

              case 'middle':
                const minY = Math.min(...selected.map((a) => a.y || 0));
                const maxY = Math.max(...selected.map((a) => (a.y || 0) + (a.height || 0)));
                const centerY = (minY + maxY) / 2;
                selected.forEach((annotation) => {
                  const original = state.annotations.find((a) => a.id === annotation.id);
                  if (original && original.y !== undefined && original.height !== undefined) {
                    original.y = centerY - original.height / 2;
                  }
                });
                break;
            }
          });
        },

        distributeSelected: (direction) => {
          set((state) => {
            const selected = state.annotations
              .filter((a) => state.selectedAnnotations.includes(a.id))
              .sort((a, b) => {
                if (direction === 'horizontal') {
                  return (a.x || 0) - (b.x || 0);
                }
                return (a.y || 0) - (b.y || 0);
              });

            if (selected.length < 3) return;

            if (direction === 'horizontal') {
              const firstX = selected[0].x || 0;
              const lastX = selected[selected.length - 1].x || 0;
              const spacing = (lastX - firstX) / (selected.length - 1);

              selected.forEach((annotation, index) => {
                const original = state.annotations.find((a) => a.id === annotation.id);
                if (original && original.x !== undefined) {
                  original.x = firstX + spacing * index;
                }
              });
            } else {
              const firstY = selected[0].y || 0;
              const lastY = selected[selected.length - 1].y || 0;
              const spacing = (lastY - firstY) / (selected.length - 1);

              selected.forEach((annotation, index) => {
                const original = state.annotations.find((a) => a.id === annotation.id);
                if (original && original.y !== undefined) {
                  original.y = firstY + spacing * index;
                }
              });
            }
          });
        },
      }))
    )
  )
);