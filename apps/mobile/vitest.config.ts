import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test-setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/mobile',
      include: ['lib/**/*.{ts,tsx}', 'stores/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'lib/google-auth.ts',
        'lib/offline-queue.ts',
        'lib/orbit-widget.ts',
        'lib/providers.tsx',
        'lib/supabase.ts',
        'lib/theme-provider.tsx',
        'lib/use-app-theme.ts',
        'stores/auth-store.ts',
      ],
    },
  },
  resolve: {
    alias: [
      {
        find: 'react-native/Libraries/Animated/NativeAnimatedHelper',
        replacement: path.resolve(__dirname, './test-mocks/native-animated-helper.ts'),
      },
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
      {
        find: 'react-native-svg',
        replacement: path.resolve(__dirname, './test-mocks/react-native-svg.ts'),
      },
      {
        find: '@react-native-async-storage/async-storage',
        replacement: path.resolve(__dirname, './test-mocks/async-storage.ts'),
      },
      {
        find: 'react-native-gesture-handler',
        replacement: path.resolve(__dirname, './test-mocks/react-native-gesture-handler.ts'),
      },
      {
        find: 'react-native-reanimated',
        replacement: path.resolve(__dirname, './test-mocks/react-native-reanimated.ts'),
      },
      {
        find: /\.(png|jpg|jpeg|gif|webp)$/,
        replacement: path.resolve(__dirname, './test-mocks/file-asset.ts'),
      },
      {
        find: 'nativewind/jsx-dev-runtime',
        replacement: path.resolve(__dirname, './test-mocks/react-jsx-dev-runtime.ts'),
      },
      {
        find: 'nativewind/jsx-runtime',
        replacement: path.resolve(__dirname, './test-mocks/react-jsx-runtime.ts'),
      },
      {
        find: 'react-native-css-interop/jsx-dev-runtime',
        replacement: path.resolve(__dirname, './test-mocks/react-jsx-dev-runtime.ts'),
      },
      {
        find: 'react-native-css-interop/jsx-runtime',
        replacement: path.resolve(__dirname, './test-mocks/react-jsx-runtime.ts'),
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
