import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test-setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    deps: {
      inline: [/^react-native(\/.*)?$/, /^@testing-library\/react-native$/, /^react-native-safe-area-context$/, /^lucide-react-native$/],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/mobile',
    },
  },
  resolve: {
    alias: [
      {
        find: /^react-native(\/.*)?$/,
        replacement: path.resolve(__dirname, './test-mocks/react-native.ts'),
      },
      {
        find: 'react-native-safe-area-context',
        replacement: path.resolve(__dirname, './test-mocks/react-native-safe-area-context.ts'),
      },
      {
        find: 'lucide-react-native',
        replacement: path.resolve(__dirname, './test-mocks/lucide-react-native.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname) },
      { find: '@orbit/shared', replacement: path.resolve(__dirname, '../../packages/shared/src') },
      { find: '@orbit/shared/types', replacement: path.resolve(__dirname, '../../packages/shared/src/types') },
      { find: '@orbit/shared/types/*', replacement: path.resolve(__dirname, '../../packages/shared/src/types/*') },
      { find: '@orbit/shared/utils', replacement: path.resolve(__dirname, '../../packages/shared/src/utils') },
      { find: '@orbit/shared/api', replacement: path.resolve(__dirname, '../../packages/shared/src/api') },
      { find: '@orbit/shared/query', replacement: path.resolve(__dirname, '../../packages/shared/src/query') },
      { find: '@orbit/shared/theme', replacement: path.resolve(__dirname, '../../packages/shared/src/theme') },
      { find: '@orbit/shared/validation', replacement: path.resolve(__dirname, '../../packages/shared/src/validation') },
      { find: '@orbit/shared/chat', replacement: path.resolve(__dirname, '../../packages/shared/src/chat') },
    ],
  },
})
