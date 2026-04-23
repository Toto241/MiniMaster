/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: false,      // Disable diagnostic output during compilation
    }]
  },
  testTimeout: 10000,
  // Optimize memory usage
  maxWorkers: 1,
  logHeapUsage: true,
  detectOpenHandles: true,
  collectCoverage: false,  // Disable coverage by default to save memory
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'cobertura', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test/admin-panel-helpers.test.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/test/', '/src/affiliate.ts', '/src/b2b-licensing.ts'],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 93,
      statements: 93
    }
  }
};

module.exports = config;
