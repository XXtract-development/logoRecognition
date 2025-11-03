/**
 * useOnScreen Hook
 * Detects when an element is visible in viewport
 */

import { useState, useEffect, RefObject } from 'react';

interface UseOnScreenOptions {
  rootMargin?: string;
  threshold?: number | number[];
}

export function useOnScreen<T extends Element>(
  ref: RefObject<T>,
  options: UseOnScreenOptions = {}
): boolean {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIntersecting(entry.isIntersecting);
      },
      {
        rootMargin: options.rootMargin || '0px',
        threshold: options.threshold || 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [ref, options.rootMargin, options.threshold]);

  return isIntersecting;
}