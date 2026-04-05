import '@testing-library/jest-dom';

// Mock matchMedia for Ant Design components
// Use a non-mock function to avoid being reset by vitest's mockReset
const matchMediaMock = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock getComputedStyle to handle Ant Design style calculations
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
  try {
    return originalGetComputedStyle(elt, pseudoElt);
  } catch {
    return {} as CSSStyleDeclaration;
  }
};

// Suppress noisy console errors in tests
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const msg = String(args[0]);
  if (
    msg.includes('Warning:') ||
    msg.includes('act(') ||
    msg.includes('Not implemented: HTMLCanvasElement') ||
    msg.includes('Error: Uncaught') ||
    msg.includes('Consider adding an error boundary')
  ) {
    return;
  }
  originalError.call(console, ...args);
};
