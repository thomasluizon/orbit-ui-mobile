import { act, create } from 'react-test-renderer'
import { View } from 'react-native'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { renderedText } from '../../support/react-test-renderer'
import { apiClient } from '@/lib/api-client'
import type { z } from 'zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { MetricsCard } from '@/components/chat/metrics-card'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: false } }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabitMetrics: () => ({ isPending: false, isError: false, refetch: vi.fn() }) }))
afterEach(() => vi.unstubAllGlobals())

it.each([3, 0])('refreshes Free overview metrics with %s scheduled habits and no completions through the real query adapter', async (scheduled) => {
  const recap = createMockRecap({ goalCompletions: 0, metrics: createMockRetrospectiveMetrics({ completionRate: 0, totalCompletions: 0, totalScheduled: scheduled, activeDays: 0, badHabitSlips: 0, topHabits: [], needsAttention: [], completionSeries: { granularity: 'day', points: [{ startDate: '2026-10-17', endDate: '2026-10-17', scheduled, completed: 0, completionRate: scheduled ? 0 : null }] } }) })
  vi.mocked(apiClient).mockReset()
  vi.mocked(apiClient).mockImplementation(<T,>(url: string, _options?: RequestInit, schema?: z.ZodType<T>) => {
    if (url !== '/api/gamification/recap?period=week') throw new Error('Retrospectives are a Pro feature.')
    if (!schema) throw new Error('Expected recap validation')
    return Promise.resolve(schema.parse(recap))
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let view!: GeometryTree
  await act(() => { view = create(<QueryClientProvider client={client}><MetricsCard metricsCard={{ period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} /></QueryClientProvider>) as GeometryTree })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(apiClient).toHaveBeenCalledWith('/api/gamification/recap?period=week', undefined, expect.anything())
  expect(view.root.findAll(node => node.type === View && node.props.testID === 'block-frame-resting')).toHaveLength(1)
  expect(view.root.findAll(node => node.props.accessibilityRole === 'alert')).toHaveLength(0)
  expect(renderedText(view.toJSON())).toContain(scheduled ? '0%' : 'chat.metrics.empty')
  await act(() => view.unmount()); client.clear()
})
