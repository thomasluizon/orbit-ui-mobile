import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts', 'scripts/**/*.test.mjs'],
    /** CI runs workspace suites one at a time; local suites share the host. */
    maxWorkers: process.env.CI ? '100%' : '25%',
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      exclude: [...coverageConfigDefaults.exclude, 'src/types/__generated__/**'],
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
