/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@tik-live-pro/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@tik-live-pro/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@tik-live-pro/events$': '<rootDir>/../../packages/events/src/index.ts',
    '^@tik-live-pro/logger$': '<rootDir>/../../packages/logger/src/index.ts',
    '^@tik-live-pro/config$': '<rootDir>/../../packages/config/src/index.ts',
    '^@tik-live-pro/platform-adapters$': '<rootDir>/../../packages/platform-adapters/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
      },
    ],
  },
};

module.exports = config;
