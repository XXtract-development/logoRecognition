import { useEffect, useCallback, useState } from 'react';

interface KeyboardNavigationOptions {
  onEnter?: (index: number) => void;
  onSpace?: (index: number) => void;
  onEscape?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  itemCount: number;
  enabled?: boolean;
}

export const useKeyboardNavigation = ({
  onEnter,
  onSpace,
  onEscape,
  onArrowUp,
  onArrowDown,
  onArrowLeft,
  onArrowRight,
  itemCount,
  enabled = true
}: KeyboardNavigationOptions) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const { key, shiftKey, ctrlKey, metaKey } = event;

    switch (key) {
      case 'Enter':
        if (focusedIndex >= 0 && onEnter) {
          event.preventDefault();
          onEnter(focusedIndex);
        }
        break;

      case ' ':
      case 'Space':
        if (focusedIndex >= 0 && onSpace) {
          event.preventDefault();
          onSpace(focusedIndex);
        }
        break;

      case 'Escape':
        if (onEscape) {
          event.preventDefault();
          onEscape();
          setFocusedIndex(-1);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (onArrowUp) {
          onArrowUp();
        } else {
          setFocusedIndex(prev => Math.max(0, prev - 1));
        }
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (onArrowDown) {
          onArrowDown();
        } else {
          setFocusedIndex(prev => Math.min(itemCount - 1, prev + 1));
        }
        break;

      case 'ArrowLeft':
        event.preventDefault();
        if (onArrowLeft) {
          onArrowLeft();
        } else {
          setFocusedIndex(prev => Math.max(0, prev - 1));
        }
        break;

      case 'ArrowRight':
        event.preventDefault();
        if (onArrowRight) {
          onArrowRight();
        } else {
          setFocusedIndex(prev => Math.min(itemCount - 1, prev + 1));
        }
        break;

      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        event.preventDefault();
        setFocusedIndex(itemCount - 1);
        break;

      case 'Tab':
        // Allow default tab behavior but track focus
        if (shiftKey) {
          setFocusedIndex(prev => Math.max(0, prev - 1));
        } else {
          setFocusedIndex(prev => Math.min(itemCount - 1, prev + 1));
        }
        break;

      // Shortcuts for common actions
      case 'f':
        if (ctrlKey || metaKey) {
          // Focus on filter
          event.preventDefault();
          document.getElementById('filter-panel')?.focus();
        }
        break;

      case 'e':
        if (ctrlKey || metaKey) {
          // Focus on export
          event.preventDefault();
          document.getElementById('export-panel')?.focus();
        }
        break;

      case 'r':
        if (ctrlKey || metaKey) {
          // Reset view
          event.preventDefault();
          document.getElementById('reset-view-btn')?.click();
        }
        break;

      case '+':
      case '=':
        if (ctrlKey || metaKey) {
          // Zoom in
          event.preventDefault();
          document.getElementById('zoom-in-btn')?.click();
        }
        break;

      case '-':
      case '_':
        if (ctrlKey || metaKey) {
          // Zoom out
          event.preventDefault();
          document.getElementById('zoom-out-btn')?.click();
        }
        break;

      default:
        break;
    }
  }, [enabled, focusedIndex, itemCount, onEnter, onSpace, onEscape, onArrowUp, onArrowDown, onArrowLeft, onArrowRight]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);

  const resetFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  const setFocus = useCallback((index: number) => {
    setFocusedIndex(Math.max(0, Math.min(itemCount - 1, index)));
  }, [itemCount]);

  return {
    focusedIndex,
    setFocus,
    resetFocus
  };
};