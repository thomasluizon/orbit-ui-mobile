import { setTimeout } from 'node:timers/promises'
import { defineConfig, mergeConfig } from 'vitest/config'
import sharedConfig from './vitest.config.ts'

export default mergeConfig(sharedConfig, defineConfig({
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
    include: ['src/__tests__/types.test.ts'],
  },
}))
