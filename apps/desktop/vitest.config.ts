import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    /** A release-step case spawns about 22 Node fake tools; on a shared CI runner one took 5.2 s, past the 5 s default. */
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
