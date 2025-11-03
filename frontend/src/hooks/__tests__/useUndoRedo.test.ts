import { renderHook, act } from '@testing-library/react';
import { useUndoRedo } from '../useUndoRedo';

describe('useUndoRedo', () => {
  it('should initialize with initial state', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    expect(result.current[0]).toEqual(['initial']);
    expect(result.current[1].canUndo).toBe(false);
    expect(result.current[1].canRedo).toBe(false);
  });

  it('should push new states and enable undo', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].push(['second']);
    });

    expect(result.current[0]).toEqual(['second']);
    expect(result.current[1].canUndo).toBe(true);
    expect(result.current[1].canRedo).toBe(false);
  });

  it('should undo to previous state', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].push(['second']);
      result.current[1].push(['third']);
    });

    act(() => {
      result.current[1].undo();
    });

    expect(result.current[0]).toEqual(['second']);
    expect(result.current[1].canUndo).toBe(true);
    expect(result.current[1].canRedo).toBe(true);
  });

  it('should redo to next state', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].push(['second']);
      result.current[1].push(['third']);
      result.current[1].undo();
    });

    act(() => {
      result.current[1].redo();
    });

    expect(result.current[0]).toEqual(['third']);
    expect(result.current[1].canUndo).toBe(true);
    expect(result.current[1].canRedo).toBe(false);
  });

  it('should clear future when pushing new state after undo', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].push(['second']);
      result.current[1].push(['third']);
      result.current[1].undo();
      result.current[1].push(['branch']);
    });

    expect(result.current[0]).toEqual(['branch']);
    expect(result.current[1].canUndo).toBe(true);
    expect(result.current[1].canRedo).toBe(false);
  });

  it('should respect max history size', () => {
    const { result } = renderHook(() => useUndoRedo(['initial'], 3));

    act(() => {
      result.current[1].push(['second']);
      result.current[1].push(['third']);
      result.current[1].push(['fourth']);
      result.current[1].push(['fifth']);
    });

    // Should only be able to undo 2 times (maxHistorySize - 1)
    act(() => {
      result.current[1].undo();
      result.current[1].undo();
    });

    expect(result.current[0]).toEqual(['third']);
    expect(result.current[1].canUndo).toBe(true);

    // One more undo should reach the limit
    act(() => {
      result.current[1].undo();
    });

    expect(result.current[1].canUndo).toBe(false);
  });

  it('should reset to initial state', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].push(['second']);
      result.current[1].push(['third']);
      result.current[1].reset();
    });

    expect(result.current[0]).toEqual(['initial']);
    expect(result.current[1].canUndo).toBe(false);
    expect(result.current[1].canRedo).toBe(false);
  });

  it('should handle undo when no past states exist', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].undo();
    });

    expect(result.current[0]).toEqual(['initial']);
    expect(result.current[1].canUndo).toBe(false);
  });

  it('should handle redo when no future states exist', () => {
    const { result } = renderHook(() => useUndoRedo(['initial']));

    act(() => {
      result.current[1].redo();
    });

    expect(result.current[0]).toEqual(['initial']);
    expect(result.current[1].canRedo).toBe(false);
  });
});