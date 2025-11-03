// Test setup for migration modules

// Mock PerformanceObserver if not available
if (typeof PerformanceObserver === 'undefined') {
  global.PerformanceObserver = class PerformanceObserver {
    constructor(callback: Function) {}
    observe(options: any) {}
    disconnect() {}
  } as any;
}

// Add missing global functions for tests
if (typeof btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

if (typeof atob === 'undefined') {
  global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

// Mock crypto.subtle if not available
if (typeof crypto === 'undefined' || !crypto.subtle) {
  global.crypto = {
    subtle: {},
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }
  } as any;
}

export {};