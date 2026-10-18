import { setTimeout } from 'node:timers/promises'
import { defineConfig } from 'vitest/config'
import sharedConfig from './vitest.config.ts'

export default defineConfig({
  ...sharedConfig,
  plugins: [{
    name: 'slow-utility-barrel-import',
    async load(id) {
      if (id.endsWith('/src/utils/index.ts')) {
        await setTimeout(16000)
      }
      return null
    },
  }],
  test: {
    ...sharedConfig.test,
    include: ['src/__tests__/types.test.ts'],
  },
})
