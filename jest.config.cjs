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
      isolatedModules: true,  // Faster compilation, skip type checking
      diagnostics: false,      // Disable type checking diagnostics
    }] 
  },
  testTimeout: 10000,
  // Optimize memory usage
  maxWorkers: 1,
  logHeapUsage: true,
  detectOpenHandles: true,
  collectCoverage: false,  // Disable coverage by default to save memory
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'cobertura'],
  coveragePathIgnorePatterns: ['/node_modules/', '/test/'],
  coverageThreshold: {
    global: {
      branches: 28,
      functions: 36,
      lines: 47,
      statements: 48
    }
  }
};

module.exports = config;
