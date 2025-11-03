module.exports = {
  projects: [
    {
      displayName: 'Backend',
      testMatch: ['<rootDir>/**/*.test.js'],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        './app/services/': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100
        },
        // 100% critical path coverage
        './app/services/authentication/': { branches: 100, functions: 100, lines: 100, statements: 100 },
        './app/services/detection/': { branches: 100, functions: 100, lines: 100, statements: 100 },
        './app/services/storage/': { branches: 100, functions: 100, lines: 100, statements: 100 },
        './app/services/model/': { branches: 100, functions: 100, lines: 100, statements: 100 }
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testEnvironment: 'node',
      maxWorkers: 4,
      collectCoverageFrom: [
        'app/**/*.js',
        '!app/**/*.test.js',
        '!**/node_modules/**',
        '!**/uploads/**',
        '!**/coverage/**'
      ],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '/uploads/',
        '/tests/',
        '/config/'
      ]
    }
  ],
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/coverage/**',
    '!**/*.config.js',
    '!**/uploads/**'
  ],
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './test-results',
      outputName: 'junit.xml',
      suiteName: 'A++ Backend Test Suite',
      includeConsoleOutput: true
    }]
  ],
  testTimeout: 10000,
  verbose: true
};