import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.mjs'],
    /**
     * `turbo run test` runs the four workspace suites at once and vitest defaults its pool to
     * the whole machine, so together they oversubscribe the CPU and time out module-graph
     * imports. The cap keeps the aggregate near one machine's worth.
     */
    maxWorkers: '25%',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['*.cjs'],
    },
  },
})
