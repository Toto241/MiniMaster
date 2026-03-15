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
  coverageReporters: ['text', 'lcov', 'cobertura'],
  coveragePathIgnorePatterns: ['/node_modules/', '/test/'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 65,
      statements: 65
    }
  }
};

module.exports = config;
