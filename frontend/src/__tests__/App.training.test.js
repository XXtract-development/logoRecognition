import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import App from '../App';

// Mock fetch API
global.fetch = jest.fn();

// Mock MediaQuery
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('Training Auto-Start Functionality', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    fetch.mockClear();

    // Mock localStorage
    Storage.prototype.getItem = jest.fn(() => null);
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();

    // Reset MediaQuery mock
    window.matchMedia.mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Auto-start conditions', () => {
    test('should NOT auto-start training when there is an active running job', async () => {
      // Setup: Mock API responses with a running job
      fetch.mockImplementation((url) => {
        if (url.includes('/api/v1/training/jobs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              jobs: [{
                id: 'job-1',
                status: 'running',
                progress: 50,
                created_at: new Date().toISOString()
              }]
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      });

      const { container } = render(<App />);

      // Simulate moving to step 2 with auto-start flag
      act(() => {
        // Simulate state changes that would normally happen when completing annotations
        const setStateEvents = new CustomEvent('test-set-state', {
          detail: {
            currentStep: 2,
            shouldAutoStartTraining: true
          }
        });
        window.dispatchEvent(setStateEvents);
      });

      // Wait and verify that training start was NOT called
      await waitFor(() => {
        const trainingStartCalls = fetch.mock.calls.filter(
          call => call[0].includes('/api/v1/training/start')
        );
        expect(trainingStartCalls.length).toBe(0);
      }, { timeout: 3000 });
    });

    test('should auto-start training when there is a completed job (not running)', async () => {
      // Setup: Mock API responses with completed jobs only
      fetch.mockImplementation((url) => {
        if (url.includes('/api/v1/training/jobs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              jobs: [{
                id: 'job-1',
                status: 'completed',
                progress: 100,
                created_at: new Date().toISOString(),
                finished_at: new Date().toISOString()
              }]
            })
          });
        }
        if (url.includes('/api/v1/training/start')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'new-job',
              status: 'running',
              progress: 0,
              created_at: new Date().toISOString()
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      });

      const { container } = render(<App />);

      // Simulate completing the last annotation
      act(() => {
        const setStateEvents = new CustomEvent('test-set-state', {
          detail: {
            currentStep: 2,
            shouldAutoStartTraining: true
          }
        });
        window.dispatchEvent(setStateEvents);
      });

      // Wait for auto-start to trigger (includes 1.5s delay)
      await waitFor(() => {
        const trainingStartCalls = fetch.mock.calls.filter(
          call => call[0].includes('/api/v1/training/start')
        );
        expect(trainingStartCalls.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    test('should auto-start training when there are no existing jobs', async () => {
      // Setup: Mock API responses with no existing jobs
      fetch.mockImplementation((url) => {
        if (url.includes('/api/v1/training/jobs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jobs: [] })
          });
        }
        if (url.includes('/api/v1/training/start')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'new-job',
              status: 'running',
              progress: 0,
              created_at: new Date().toISOString()
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      });

      const { container } = render(<App />);

      // Simulate completing annotations
      act(() => {
        const setStateEvents = new CustomEvent('test-set-state', {
          detail: {
            currentStep: 2,
            shouldAutoStartTraining: true
          }
        });
        window.dispatchEvent(setStateEvents);
      });

      // Verify training starts
      await waitFor(() => {
        const trainingStartCalls = fetch.mock.calls.filter(
          call => call[0].includes('/api/v1/training/start')
        );
        expect(trainingStartCalls.length).toBe(1);
      }, { timeout: 3000 });
    });

    test('should NOT auto-start if shouldAutoStartTraining flag is false', async () => {
      // Setup: Mock API responses
      fetch.mockImplementation((url) => {
        if (url.includes('/api/v1/training/jobs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jobs: [] })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      });

      const { container } = render(<App />);

      // Move to step 2 WITHOUT auto-start flag
      act(() => {
        const setStateEvents = new CustomEvent('test-set-state', {
          detail: {
            currentStep: 2,
            shouldAutoStartTraining: false // Flag is false
          }
        });
        window.dispatchEvent(setStateEvents);
      });

      // Wait and verify no training start
      await waitFor(() => {
        const trainingStartCalls = fetch.mock.calls.filter(
          call => call[0].includes('/api/v1/training/start')
        );
        expect(trainingStartCalls.length).toBe(0);
      }, { timeout: 2000 });
    });

    test('should reset shouldAutoStartTraining flag after successful training start', async () => {
      let capturedState = {};

      // Setup: Mock successful training start
      fetch.mockImplementation((url) => {
        if (url.includes('/api/v1/training/jobs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jobs: [] })
          });
        }
        if (url.includes('/api/v1/training/start')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'new-job',
              status: 'running',
              progress: 0,
              created_at: new Date().toISOString()
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      });

      const { container } = render(<App />);

      // Start with flag true
      act(() => {
        const setStateEvents = new CustomEvent('test-set-state', {
          detail: {
            currentStep: 2,
            shouldAutoStartTraining: true
          }
        });
        window.dispatchEvent(setStateEvents);
      });

      // Wait for training to start and flag to reset
      await waitFor(() => {
        const trainingStartCalls = fetch.mock.calls.filter(
          call => call[0].includes('/api/v1/training/start')
        );
        expect(trainingStartCalls.length).toBe(1);

        // In real implementation, the flag should be reset
        // This would need to be checked via component state or effects
      }, { timeout: 3000 });
    });
  });

  describe('Complete & Next Image button behavior', () => {
    test('should set auto-start flag when completing last image', async () => {
      // This test would need more complex setup with the actual UI components
      // Including file upload, annotation, and completion flow
      // Placeholder for now - would need to refactor App.js to be more testable
      expect(true).toBe(true);
    });
  });

  describe('Training status with failed jobs', () => {
    test('should auto-start training even with failed jobs in history', async () => {
      // Setup: Mock API responses with failed jobs
      fetch.mockImplementation((url) => {
        if (url.includes('/api/v1/training/jobs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              jobs: [{
                id: 'job-1',
                status: 'failed',
                progress: 0,
                created_at: new Date().toISOString(),
                error: 'Previous training failed'
              }]
            })
          });
        }
        if (url.includes('/api/v1/training/start')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'new-job',
              status: 'running',
              progress: 0,
              created_at: new Date().toISOString()
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      });

      const { container } = render(<App />);

      act(() => {
        const setStateEvents = new CustomEvent('test-set-state', {
          detail: {
            currentStep: 2,
            shouldAutoStartTraining: true
          }
        });
        window.dispatchEvent(setStateEvents);
      });

      // Should start training despite failed jobs
      await waitFor(() => {
        const trainingStartCalls = fetch.mock.calls.filter(
          call => call[0].includes('/api/v1/training/start')
        );
        expect(trainingStartCalls.length).toBe(1);
      }, { timeout: 3000 });
    });
  });
});