import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/web',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@orbit/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@orbit/shared/types': path.resolve(__dirname, '../../packages/shared/src/types'),
      '@orbit/shared/types/*': path.resolve(__dirname, '../../packages/shared/src/types/*'),
      '@orbit/shared/utils': path.resolve(__dirname, '../../packages/shared/src/utils'),
      '@orbit/shared/api': path.resolve(__dirname, '../../packages/shared/src/api'),
      '@orbit/shared/query': path.resolve(__dirname, '../../packages/shared/src/query'),
      '@orbit/shared/theme': path.resolve(__dirname, '../../packages/shared/src/theme'),
      '@orbit/shared/validation': path.resolve(__dirname, '../../packages/shared/src/validation'),
    },
  },
})
