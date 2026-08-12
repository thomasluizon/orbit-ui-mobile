import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    /**
     * `turbo run test` runs the four workspace suites at once and vitest defaults its pool to
     * the whole machine, so together they oversubscribe the CPU and time out module-graph
     * imports. The cap keeps the aggregate near one machine's worth. The cap alone still went
     * red in 1 of 3 runs, so the margin over the 5s default covers the residual import cost.
     */
    maxWorkers: '25%',
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
