import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { useAuthStore } from '@/stores/auth-store'
import { MetricsCard } from '@/components/chat/metrics-card'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: false } }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabitMetrics: () => ({ isPending: false, isError: false, refetch: vi.fn() }) }))
afterEach(() => vi.unstubAllGlobals())

it.each([3, 0])('refreshes Free overview metrics with %s scheduled habits and no completions through the real query adapter', async (scheduled) => {
  useAuthStore.getState().setAuth({ userId: 'free-account', name: 'Alex', email: 'alex@example.com' })
  const recap = createMockRecap({ goalCompletions: 0, metrics: createMockRetrospectiveMetrics({ completionRate: 0, totalCompletions: 0, totalScheduled: scheduled, activeDays: 0, badHabitSlips: 0, topHabits: [], needsAttention: [], completionSeries: { granularity: 'day', points: [{ startDate: '2026-10-17', endDate: '2026-10-17', scheduled, completed: 0, completionRate: scheduled ? 0 : null }] } }) })
  const request = vi.fn((url: string) => Promise.resolve(url === '/api/gamification/recap?period=week'
    ? new Response(JSON.stringify(recap), { status: 200 })
    : new Response(JSON.stringify({ error: 'Retrospectives are a Pro feature.', errorCode: 'PAY_GATE' }), { status: 403 })))
  vi.stubGlobal('fetch', request)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><MetricsCard metricsCard={{ period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} /></QueryClientProvider>)
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/gamification/recap?period=week', expect.any(Object)))
  await waitFor(() => expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'resting'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  if (scheduled) expect(within(screen.getByText('progressScreen.window.completionRate').parentElement!).getByText('0%')).toBeInTheDocument()
  else expect(screen.getByText('chat.metrics.empty')).toBeInTheDocument()
  view.unmount(); client.clear()
})
