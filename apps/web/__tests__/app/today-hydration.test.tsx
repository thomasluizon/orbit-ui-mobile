import React from 'react'
import { act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { TodayPageClient } from '@/app/(app)/today-page-client'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ syncThemeFromProfile: vi.fn(), detectAndSaveThemeIfNeeded: vi.fn() }),
}))
vi.mock('@/hooks/use-session-reset', () => ({ useAccountGeneration: () => 0 }))
vi.mock('@/stores/auth-store', () => ({
  useHeldAccountId: () => 'account-a',
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }),
}))
vi.mock('@/app/(app)/use-today-page', () => ({
  useTodayPage: () => ({
    nav: { dateStr: '2026-09-28', today: '2026-09-28' },
    isSelectMode: false,
    showCreateModal: false,
    listSurfaceOpen: false,
    data: { isFetching: false, showLoadError: false },
  }),
}))
vi.mock('@/app/(app)/today-page-view', () => ({
  TodayHeaderRegion: () => <h1>Today</h1>,
  TodayHabitsPanel: () => null,
  TodayOverlays: () => null,
}))
vi.mock('@/components/today/today-astra', () => ({ TodayAstra: () => null }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div>Loading habits</div> }))
function Tree({ client }: { client: QueryClient }) {
  return <QueryClientProvider client={client}>
    <TodayPageClient initialToday="2026-09-28" initialHabits={null} initialProfile={null} />
  </QueryClientProvider>
}

describe('Today hydration', () => {
  it('keeps the loading tree until mount when the client already has a profile', async () => {
    const serverClient = new QueryClient()
    const html = renderToString(<Tree client={serverClient} />)
    expect(html).toContain('Loading habits')
    expect(html).toContain('max-w-[740px]')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)

    const client = new QueryClient()
    client.setQueryData(profileKeys.detail(), createMockProfile())
    const recoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <Tree client={client} />, { onRecoverableError: recoverableError })
    })
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('h1')).toHaveTextContent('Today')
    const column = container.querySelector('[data-today-day-transition]')?.parentElement
    expect(column).toHaveClass('mx-auto', 'w-full', 'max-w-[740px]')
    await act(async () => root?.unmount())
    container.remove()
    client.clear()
    serverClient.clear()
  })
})
