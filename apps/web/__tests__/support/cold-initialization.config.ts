import { defineConfig } from 'vitest/config'
import webConfig from '../../vitest.config'

const delayedProducers = [
  '/stores/auth-store.ts',
  '/hooks/use-push-notification-preferences.ts',
  '/lib/sentry-scrub.ts',
]

/** Exercises the real producers with import latency greater than the assertion budget. */
export default defineConfig({
  ...webConfig,
  plugins: [
    ...webConfig.plugins ?? [],
    {
      name: 'cold-initialization-delay',
      enforce: 'pre',
      transform(source, moduleId) {
        if (!delayedProducers.some((producer) => moduleId.endsWith(producer))) return
        return `await new Promise((resolve) => setTimeout(resolve, 2000));\n${source}`
      },
    },
  ],
  test: {
    ...webConfig.test,
    include: ['__tests__/stores/session-cookie-lock.test.ts', '__tests__/sentry-init.test.ts'],
    maxWorkers: 1,
    testTimeout: 1000,
  },
})
