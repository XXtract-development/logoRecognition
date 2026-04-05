import { describe, it, expect, beforeEach } from 'vitest';
import { useRecognitionStore } from './recognitionStore';

describe('recognitionStore', () => {
  beforeEach(() => {
    useRecognitionStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useRecognitionStore.getState();
    expect(state.currentImage).toBeNull();
    expect(state.results).toEqual([]);
    expect(state.isProcessing).toBe(false);
    expect(state.progress).toBe(0);
    expect(state.error).toBeNull();
    expect(state.history).toEqual([]);
  });

  it('setProcessing sets processing and clears error when true', () => {
    const store = useRecognitionStore.getState();
    store.setError('some error');
    store.setProcessing(true);

    const state = useRecognitionStore.getState();
    expect(state.isProcessing).toBe(true);
    expect(state.error).toBeNull();
  });

  it('setProgress clamps value between 0 and 100', () => {
    const store = useRecognitionStore.getState();

    store.setProgress(50);
    expect(useRecognitionStore.getState().progress).toBe(50);

    store.setProgress(150);
    expect(useRecognitionStore.getState().progress).toBe(100);

    store.setProgress(-10);
    expect(useRecognitionStore.getState().progress).toBe(0);
  });

  it('setError clears processing and progress', () => {
    const store = useRecognitionStore.getState();
    store.setProcessing(true);
    store.setProgress(75);
    store.setError('Network failure');

    const state = useRecognitionStore.getState();
    expect(state.error).toBe('Network failure');
    expect(state.isProcessing).toBe(false);
    expect(state.progress).toBe(0);
  });

  it('setResults adds to history when currentImage exists', () => {
    const store = useRecognitionStore.getState();
    const mockImage = { id: 'img-1', dataUrl: 'data:image/png;base64,...', name: 'test.png' } as any;
    const mockResults = [{ id: 'r1', label: 'Nike', confidence: 0.95 }] as any;

    store.setCurrentImage(mockImage);
    store.setResults(mockResults);

    const state = useRecognitionStore.getState();
    expect(state.results).toEqual(mockResults);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].image).toEqual(mockImage);
  });

  it('clearResults resets results and progress', () => {
    const store = useRecognitionStore.getState();
    store.setResults([{ id: 'r1' }] as any);
    store.setProgress(80);
    store.clearResults();

    const state = useRecognitionStore.getState();
    expect(state.results).toEqual([]);
    expect(state.progress).toBe(0);
  });

  it('history is limited to 10 items', () => {
    const store = useRecognitionStore.getState();
    const mockImage = { id: 'img', dataUrl: 'data:...', name: 'test.png' } as any;
    store.setCurrentImage(mockImage);

    for (let i = 0; i < 12; i++) {
      store.setResults([{ id: `r${i}`, label: `Logo ${i}`, confidence: 0.9 }] as any);
    }

    expect(useRecognitionStore.getState().history.length).toBeLessThanOrEqual(10);
  });

  it('reset restores initial state', () => {
    const store = useRecognitionStore.getState();
    store.setProcessing(true);
    store.setProgress(50);
    store.setError('error');
    store.reset();

    const state = useRecognitionStore.getState();
    expect(state.isProcessing).toBe(false);
    expect(state.progress).toBe(0);
    expect(state.error).toBeNull();
  });
});
