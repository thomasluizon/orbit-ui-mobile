import { act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import InsightsPage from '@/app/(app)/insights/page'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    syncSchemeFromProfile: vi.fn(),
    syncThemeFromProfile: vi.fn(),
    detectAndSaveSchemeIfNeeded: vi.fn(),
    detectAndSaveThemeIfNeeded: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-habit-trends', () => ({ useHabitTrends: () => ({ data: undefined, isLoading: true }) }))
vi.mock('@/hooks/use-xp-history', () => ({ useXpHistory: () => ({ data: undefined, isLoading: true }) }))
vi.mock('@/hooks/use-streak-history', () => ({ useStreakHistory: () => ({ data: undefined, isLoading: true }) }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ data: { allGoals: [] }, isLoading: false }) }))
vi.mock('@/hooks/use-goal-progress-history', () => ({ useGoalProgressHistory: () => ({ data: undefined, isLoading: true }) }))
vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarRange: () => ({ dayMap: new Map(), isLoading: true, isFetching: true, error: null, refresh: vi.fn() }),
  useCalendarRangeChunked: () => ({ dayMap: new Map(), isLoading: true, isFetching: true, error: null, refresh: vi.fn() }),
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ profile: null, earnedAchievements: [], isLoading: true, isError: false }),
}))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: undefined, isLoading: true, isError: false }) }))

function Tree({ queryClient }: { queryClient: QueryClient }) {
  return <QueryClientProvider client={queryClient}><InsightsPage /></QueryClientProvider>
}

describe('Insights hydration', () => {
  let root: Root | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    document.body.replaceChildren()
  })

  it('keeps the loading branch when a free profile is cached before hydration', async () => {
    const serverQueryClient = new QueryClient()
    const serverHtml = renderToString(<Tree queryClient={serverQueryClient} />)
    serverQueryClient.clear()
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)

    const clientQueryClient = new QueryClient()
    clientQueryClient.setQueryData(profileKeys.detail(), createMockProfile({ hasProAccess: false }))
    const recoverableError = vi.fn()
    await act(async () => {
      root = hydrateRoot(container, <Tree queryClient={clientQueryClient} />, {
        onRecoverableError: recoverableError,
      })
    })

    expect(serverHtml).toContain('insights.title')
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.textContent).toContain('insights.lockedTitle')
    clientQueryClient.clear()
  })
})
