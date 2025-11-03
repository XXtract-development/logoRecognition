// A++ Test Setup Configuration
// Global test environment configuration and utilities

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || 8001;
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

// Global test timeout
jest.setTimeout(10000);

// Mock external services
jest.mock('axios');

// Global test utilities
global.testUtils = {
  // Generate random test data
  generateTestImage: () => {
    return Buffer.from('fake-image-data');
  },

  // Create mock request
  mockRequest: (options = {}) => ({
    headers: {},
    body: {},
    params: {},
    query: {},
    file: null,
    files: [],
    ...options
  }),

  // Create mock response
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    return res;
  },

  // Wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Clean up test artifacts
  cleanupTestFiles: async () => {
    const fs = require('fs').promises;
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../uploads/test');
    try {
      await fs.rmdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory doesn't exist, ignore
    }
  }
};

// Clean up after each test suite
afterAll(async () => {
  await global.testUtils.cleanupTestFiles();
  // Close any open handles
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection in test:', err);
  process.exit(1);
});