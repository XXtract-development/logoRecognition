import { useCallback } from 'react';

export const useAccessibility = () => {
  const setupAccessibility = useCallback(() => {
    // Add keyboard navigation support
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip to main content with Alt + S
      if (e.altKey && e.key === 's') {
        const main = document.querySelector('main, [role="main"]');
        if (main instanceof HTMLElement) {
          main.focus();
          main.scrollIntoView({ behavior: 'smooth' });
        }
      }

      // Toggle high contrast mode with Alt + H
      if (e.altKey && e.key === 'h') {
        document.body.classList.toggle('high-contrast');
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Add focus visible styles
    document.body.classList.add('focus-visible-enabled');

    // Set language attribute
    document.documentElement.lang = navigator.language.split('-')[0] || 'en';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Announce page changes to screen readers
  const announcePageChange = useCallback((message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }, []);

  // Trap focus within a container
  const trapFocus = useCallback((container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    container.addEventListener('keydown', handleTabKey);
    return () => container.removeEventListener('keydown', handleTabKey);
  }, []);

  return {
    setupAccessibility,
    announcePageChange,
    trapFocus,
  };
};
