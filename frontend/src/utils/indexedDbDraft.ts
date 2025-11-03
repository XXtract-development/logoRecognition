import { AnnotationBox } from '../types/annotations';

const DB_NAME = 'logo-annotation-drafts';
const STORE_NAME = 'drafts';
const INDEX_DATASET = 'datasetId';

interface DraftRecord {
  id?: number;
  datasetId: string;
  annotations: AnnotationBox[];
  timestamp: number;
}

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex(INDEX_DATASET, INDEX_DATASET, { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
};

const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const waitForTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

export const saveDraftToIndexedDb = async (
  datasetId: string,
  annotations: AnnotationBox[],
): Promise<void> => {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: DraftRecord = {
      datasetId,
      annotations,
      timestamp: Date.now(),
    };

    await promisifyRequest(store.add(record));

    const index = store.index(INDEX_DATASET);
    const range = IDBKeyRange.only(datasetId);
    const existing = (await promisifyRequest(index.getAll(range))) as DraftRecord[];
    if (existing.length > 20) {
      const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);
      const toDelete = sorted.slice(20);
      for (const item of toDelete) {
        if (item.id !== undefined) {
          store.delete(item.id);
        }
      }
    }

    await waitForTransaction(tx);
    db.close();
  } catch (error) {
    console.warn('IndexedDB autosave failed:', error);
  }
};

export const loadLatestDraftFromIndexedDb = async (
  datasetId: string,
): Promise<DraftRecord | null> => {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index(INDEX_DATASET);
    const range = IDBKeyRange.only(datasetId);
    const cursorRequest = index.openCursor(range, 'prev');
    const cursor = await promisifyRequest(cursorRequest as unknown as IDBRequest<IDBCursorWithValue | null>);
    db.close();
    if (!cursor) {
      return null;
    }
    return cursor.value as DraftRecord;
  } catch (error) {
    console.warn('IndexedDB draft load failed:', error);
    return null;
  }
};

export const clearDraftsFromIndexedDb = async (datasetId: string): Promise<void> => {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index(INDEX_DATASET);
    const range = IDBKeyRange.only(datasetId);
    const keys = (await promisifyRequest(index.getAllKeys(range))) as IDBValidKey[];
    keys.forEach((key) => store.delete(key));
    await waitForTransaction(tx);
    db.close();
  } catch (error) {
    console.warn('IndexedDB draft clear failed:', error);
  }
};
