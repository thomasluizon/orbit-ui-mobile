import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.mjs'],
    /**
     * RuleTester files load parser graphs while the installed-config assertion loads web
     * plugins. Run files serially so these imports do not compete within this suite when
     * the other workspace verifications are active. Keep worker isolation between files.
     */
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['*.cjs'],
    },
  },
})
