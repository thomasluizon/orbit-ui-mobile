import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    /**
     * Four workspace vitest instances run at once under `turbo run test`, and each sizes its
     * worker pool to the whole machine, so they oversubscribe the CPU. The 5s/10s defaults
     * expire on module-graph re-import cost alone, which passes in under 500ms run standalone.
     */
    testTimeout: 30000,
    hookTimeout: 30000,
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
