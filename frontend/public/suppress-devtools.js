// Suppress React DevTools suggestion in production-like environments
if (typeof window !== 'undefined' && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  // DevTools already installed, no need for the message
} else if (typeof window !== 'undefined') {
  // Prevent the DevTools suggestion from appearing
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject: () => {},
    onCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
  };
}