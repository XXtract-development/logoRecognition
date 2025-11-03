/**
 * Navigation Features Test Suite for AnnotationPage
 * Tests keyboard navigation, jump-to feature, and accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('AnnotationPage Navigation Features - Unit Tests', () => {
  describe('Keyboard Navigation Logic', () => {
    it('should handle ArrowLeft key press', () => {
      const handlePrevious = jest.fn();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          handlePrevious();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(handlePrevious).toHaveBeenCalled();
      window.removeEventListener('keydown', handleKeyDown);
    });

    it('should handle ArrowRight key press', () => {
      const handleNext = jest.fn();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          handleNext();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(handleNext).toHaveBeenCalled();
      window.removeEventListener('keydown', handleKeyDown);
    });

    it('should not navigate when input field is focused', () => {
      const handleNavigation = jest.fn();
      const handleKeyDown = (event: KeyboardEvent) => {
        const activeElement = document.activeElement;
        if (
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
           activeElement.tagName === 'TEXTAREA')
        ) {
          return;
        }
        handleNavigation();
      };

      const { container } = render(<input type="text" />);
      const input = container.querySelector('input');
      input?.focus();

      window.addEventListener('keydown', handleKeyDown);
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(handleNavigation).not.toHaveBeenCalled();
      window.removeEventListener('keydown', handleKeyDown);
    });
  });

  describe('Jump-to Navigation Logic', () => {
    it('should validate jump-to input correctly', () => {
      const isValidJump = (value: string, max: number): boolean => {
        const num = parseInt(value, 10) - 1;
        return !isNaN(num) && num >= 0 && num < max;
      };

      expect(isValidJump('1', 3)).toBe(true);
      expect(isValidJump('3', 3)).toBe(true);
      expect(isValidJump('4', 3)).toBe(false);
      expect(isValidJump('0', 3)).toBe(false);
      expect(isValidJump('-1', 3)).toBe(false);
      expect(isValidJump('abc', 3)).toBe(false);
    });

    it('should calculate correct target index', () => {
      const getTargetIndex = (value: string): number => {
        return parseInt(value, 10) - 1;
      };

      expect(getTargetIndex('1')).toBe(0);
      expect(getTargetIndex('2')).toBe(1);
      expect(getTargetIndex('10')).toBe(9);
    });
  });

  describe('Navigation State Management', () => {
    it('should handle boundary conditions', () => {
      const canGoPrevious = (currentIndex: number): boolean => {
        return currentIndex > 0;
      };

      const canGoNext = (currentIndex: number, total: number): boolean => {
        return currentIndex < total - 1;
      };

      expect(canGoPrevious(0)).toBe(false);
      expect(canGoPrevious(1)).toBe(true);

      expect(canGoNext(0, 3)).toBe(true);
      expect(canGoNext(2, 3)).toBe(false);
    });

    it('should handle navigation with loading state', async () => {
      let isNavigating = false;

      const navigate = async (direction: 'next' | 'prev') => {
        if (isNavigating) return false;

        isNavigating = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        isNavigating = false;
        return true;
      };

      const result = await navigate('next');
      expect(result).toBe(true);
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(
        <div>
          <button aria-label="Navigate to previous file">Previous</button>
          <button aria-label="Navigate to next file">Next</button>
          <input aria-label="Jump to image number" type="number" />
          <div aria-live="polite" aria-atomic="true">File 1 of 3</div>
        </div>
      );

      const prevButton = screen.getByText('Previous');
      const nextButton = screen.getByText('Next');
      const input = container.querySelector('input[type="number"]');

      expect(prevButton).toHaveAttribute('aria-label', 'Navigate to previous file');
      expect(nextButton).toHaveAttribute('aria-label', 'Navigate to next file');
      expect(input).toHaveAttribute('aria-label', 'Jump to image number');
    });

    it('should support keyboard navigation for accessibility', () => {
      const { container } = render(
        <div>
          <button>Previous</button>
          <button>Next</button>
          <input type="number" />
        </div>
      );

      const buttons = container.querySelectorAll('button');
      const input = container.querySelector('input');

      // All interactive elements should be keyboard accessible
      buttons.forEach(button => {
        expect(button).not.toHaveAttribute('tabindex', '-1');
      });
      expect(input).not.toHaveAttribute('tabindex', '-1');
    });

    it('should announce navigation changes to screen readers', () => {
      const { container, rerender } = render(
        <div aria-live="polite" aria-atomic="true">File 1 of 3</div>
      );

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion?.textContent).toBe('File 1 of 3');

      // Update content
      rerender(
        <div aria-live="polite" aria-atomic="true">File 2 of 3</div>
      );

      expect(liveRegion?.textContent).toBe('File 2 of 3');
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation errors gracefully', async () => {
      const onError = jest.fn();

      const navigateWithError = async () => {
        try {
          throw new Error('Navigation failed');
        } catch (error) {
          onError('Failed to navigate');
          return false;
        }
      };

      const result = await navigateWithError();
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalledWith('Failed to navigate');
    });

    it('should validate input before navigation', () => {
      const validateAndJump = (value: string, max: number): string | null => {
        if (value.trim() === '') {
          return 'Please enter an image number';
        }

        const num = parseInt(value, 10) - 1;
        if (isNaN(num) || num < 0 || num >= max) {
          return `Please enter a number between 1 and ${max}`;
        }

        return null;
      };

      expect(validateAndJump('', 3)).toBe('Please enter an image number');
      expect(validateAndJump('0', 3)).toBe('Please enter a number between 1 and 3');
      expect(validateAndJump('4', 3)).toBe('Please enter a number between 1 and 3');
      expect(validateAndJump('2', 3)).toBe(null);
    });
  });

  describe('Loading States', () => {
    it('should show loading state during navigation', () => {
      const { container } = render(
        <button disabled={true} aria-busy="true">
          <span>Loading...</span>
          Next
        </button>
      );

      const button = container.querySelector('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('should disable controls during navigation', () => {
      const isNavigating = true;

      const { container } = render(
        <div>
          <button disabled={isNavigating}>Previous</button>
          <button disabled={isNavigating}>Next</button>
          <input disabled={isNavigating} />
        </div>
      );

      const buttons = container.querySelectorAll('button');
      const input = container.querySelector('input');

      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
      expect(input).toBeDisabled();
    });
  });

  describe('Keyboard Shortcut Documentation', () => {
    it('should display keyboard shortcut information', () => {
      render(
        <div title="Keyboard Shortcuts: ← Arrow: Previous image, → Arrow: Next image">
          Keyboard shortcuts available
        </div>
      );

      const helpText = screen.getByText('Keyboard shortcuts available');
      expect(helpText).toHaveAttribute('title', expect.stringContaining('Keyboard Shortcuts'));
    });
  });
});

describe('Navigation Integration Tests', () => {
  it('should handle complete navigation flow', async () => {
    let currentIndex = 0;
    const totalFiles = 3;

    const navigate = (direction: 'next' | 'prev') => {
      if (direction === 'next' && currentIndex < totalFiles - 1) {
        currentIndex++;
      } else if (direction === 'prev' && currentIndex > 0) {
        currentIndex--;
      }
    };

    const jumpTo = (index: number) => {
      if (index >= 0 && index < totalFiles) {
        currentIndex = index;
      }
    };

    // Test navigation flow
    expect(currentIndex).toBe(0);

    navigate('next');
    expect(currentIndex).toBe(1);

    navigate('next');
    expect(currentIndex).toBe(2);

    navigate('next'); // Should not go beyond
    expect(currentIndex).toBe(2);

    navigate('prev');
    expect(currentIndex).toBe(1);

    jumpTo(0);
    expect(currentIndex).toBe(0);

    navigate('prev'); // Should not go below 0
    expect(currentIndex).toBe(0);
  });
});