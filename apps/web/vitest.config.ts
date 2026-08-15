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
    /**
     * `turbo run test` runs the four workspace suites at once and vitest defaults its pool to
     * the whole machine, so together they oversubscribe the CPU and time out module-graph
     * imports. The cap keeps the aggregate near one machine's worth. The cap alone still went
     * red in 1 of 3 runs, so the margin over the 5s default covers the residual import cost.
     */
    maxWorkers: '25%',
    testTimeout: 15000,
    hookTimeout: 15000,
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
        'app/(app)/about/page.tsx',
        'app/(public)/privacy/page.tsx',
        'app/(public)/terms/page.tsx',
        'app/(public)/delete-account/page.tsx',
        'app/r/[code]/page.tsx',
        'app/(onboarding)/onboarding/page.tsx',
        'app/not-found.tsx',
        'app/(chat)/error.tsx',
        'components/motion/route-transition-shell.tsx',
        'components/navigation/navigation-history-tracker.tsx',
        'components/navigation/web-nav.tsx',
        'components/shell/astra-copilot-rail.tsx',
        'components/calendar/calendar-week-view.tsx',
        'components/ui/parent-ring.tsx',
        'components/onboarding/retained-onboarding-overlay.tsx',
        'components/habits/habit-form-fields/habit-tag-chip.tsx',
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
