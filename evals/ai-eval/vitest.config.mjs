import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['__tests__/**/*.test.mjs'], maxWorkers: 1, testTimeout: 60000 },
})
