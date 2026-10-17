import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, readdirSync } from 'node:fs'

const chromiumTests = readdirSync(path.resolve(__dirname, '__tests__'), { recursive: true })
  .map(String)
  .filter((file) => /\.test\.tsx?$/.test(file))
  .map((file) => `__tests__/${file.split(path.sep).join('/')}`)
  .filter((file) => /\bfrom\s+['"][^'"]*\/chromium['"]/.test(readFileSync(path.resolve(__dirname, file), 'utf8')))
  .sort((left, right) => left.localeCompare(right))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    globals: true,
    maxWorkers: '25%',
    testTimeout: 15000,
    hookTimeout: 15000,
    // WHY: Chrome owns a process tree per suite, so CPU-based worker percentages do not bound browser contention. https://github.com/thomasluizon/orbit-tickets/issues/1451
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          include: ['__tests__/**/*.test.{ts,tsx}'],
          exclude: chromiumTests,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'chromium',
          include: chromiumTests,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'stores/**/*.ts',
        'lib/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.d.ts',
        'app/**/layout.tsx',
        'app/api/**',
        'app/(auth)/auth-callback/page.tsx',
        'app/(public)/privacy/page.tsx',
        'app/(public)/terms/page.tsx',
        'app/(public)/delete-account/page.tsx',
        'app/r/[code]/page.tsx',
        'app/(onboarding)/onboarding/page.tsx',
        'app/not-found.tsx',
        'app/(chat)/error.tsx',
        'components/motion/route-transition-shell.tsx',
        'components/navigation/navigation-history-tracker.tsx',
        'components/calendar/calendar-week-view.tsx',
        'components/ui/parent-ring.tsx',
        'components/onboarding/retained-onboarding-overlay.tsx',
        'stores/version-gate-store.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 71,
        functions: 75,
        lines: 82,
      },
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
