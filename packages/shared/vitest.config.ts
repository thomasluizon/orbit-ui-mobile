import { defineConfig } from 'vitest/config'

/**
 * The device calendar for every pool. A worker thread copies `process.env`, so a `TZ` change at
 * run time does not reach `Date` in the threads pool that Stryker uses. The main process sets it here.
 */
process.env.TZ = 'America/Sao_Paulo'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts', 'scripts/**/*.test.mjs'],
    /** CI runs workspace suites one at a time; local suites share the host. */
    maxWorkers: process.env.CI ? '100%' : '25%',
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 95,
        branches: 88,
        functions: 96,
        lines: 97,
      },
    },
  },
})
