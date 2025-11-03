import { create } from 'zustand';
import {
  AnnotationBox,
  AnnotationConflict,
  AnnotationSaveResponse,
  AnnotationSummary,
} from '../types/annotations';

interface TrainingStoreState {
  datasetId: string;
  userId: string;
  annotationsByImage: Record<string, AnnotationBox[]>;
  saveResponse?: AnnotationSaveResponse;
  conflicts: AnnotationConflict[];
  versionHistory: AnnotationSummary[];
  auditTrail: Record<string, string>[];
  dirty: boolean;
  setDatasetId: (datasetId: string) => void;
  setUserId: (userId: string) => void;
  upsertAnnotations: (imageId: string, boxes: AnnotationBox[]) => void;
  removeAnnotation: (imageId: string, annotationId: string) => void;
  setSaveResponse: (response?: AnnotationSaveResponse) => void;
  setConflicts: (conflicts: AnnotationConflict[]) => void;
  setVersionHistory: (versions: AnnotationSummary[]) => void;
  setAuditTrail: (entries: Record<string, string>[]) => void;
  setDirty: (dirty: boolean) => void;
  reset: () => void;
}

export const useTrainingStore = create<TrainingStoreState>((set, get) => ({
  datasetId: 'dataset-default',
  userId: 'annotator-unknown',
  annotationsByImage: {},
  conflicts: [],
  versionHistory: [],
  auditTrail: [],
  dirty: false,

  setDatasetId: (datasetId) => set({ datasetId }),
  setUserId: (userId) => set({ userId }),
  upsertAnnotations: (imageId, boxes) => {
    const payload = boxes.map((box) => ({
      ...box,
      tags: box.tags ?? [],
      metadata: box.metadata ?? {},
    }));
    set((state) => ({
      annotationsByImage: {
        ...state.annotationsByImage,
        [imageId]: payload,
      },
      dirty: true,
    }));
  },
  removeAnnotation: (imageId, annotationId) => {
    const current = get().annotationsByImage[imageId] ?? [];
    set((state) => ({
      annotationsByImage: {
        ...state.annotationsByImage,
        [imageId]: current.filter((box) => box.id !== annotationId),
      },
      dirty: true,
    }));
  },
  setSaveResponse: (response) => set({ saveResponse: response }),
  setConflicts: (conflicts) => set({ conflicts }),
  setVersionHistory: (versions) => set({ versionHistory: versions }),
  setAuditTrail: (entries) => set({ auditTrail: entries }),
  setDirty: (dirty) => set({ dirty }),
  reset: () =>
    set({
      annotationsByImage: {},
      saveResponse: undefined,
      conflicts: [],
      versionHistory: [],
      auditTrail: [],
      dirty: false,
    }),
}));
