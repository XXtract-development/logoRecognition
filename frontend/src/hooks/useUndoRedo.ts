import { useState, useCallback } from 'react';

export interface UndoRedoState<T> {
  present: T;
  past: T[];
  future: T[];
}

export interface UndoRedoActions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
  push: (newState: any) => void;
  set: (newState: any) => void;
}

export const useUndoRedo = <T>(initialState: T, maxHistorySize: number = 50): [T, UndoRedoActions] => {
  const [state, setState] = useState<UndoRedoState<T>>({
    present: initialState,
    past: [],
    future: []
  });

  const push = useCallback((newState: T) => {
    setState(currentState => ({
      present: newState,
      past: [...currentState.past.slice(-maxHistorySize + 1), currentState.present],
      future: []
    }));
  }, [maxHistorySize]);

  const set = useCallback((newState: T) => {
    setState(currentState => ({
      present: newState,
      past: currentState.past,
      future: []
    }));
  }, []);

  const undo = useCallback(() => {
    setState(currentState => {
      if (currentState.past.length === 0) return currentState;

      const previous = currentState.past[currentState.past.length - 1];
      const newPast = currentState.past.slice(0, currentState.past.length - 1);

      return {
        present: previous,
        past: newPast,
        future: [currentState.present, ...currentState.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState(currentState => {
      if (currentState.future.length === 0) return currentState;

      const next = currentState.future[0];
      const newFuture = currentState.future.slice(1);

      return {
        present: next,
        past: [...currentState.past, currentState.present],
        future: newFuture
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      present: initialState,
      past: [],
      future: []
    });
  }, [initialState]);

  const actions: UndoRedoActions = {
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
    push,
    set
  };

  return [state.present, actions];
};
