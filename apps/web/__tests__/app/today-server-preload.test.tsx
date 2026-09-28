import React from 'react'
import { act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
import { TodayPageClient } from '@/app/(app)/today-page-client'
import { TodayProvider } from '@/app/(app)/today-provider'
import { buildTodayFilters } from '@/app/(app)/today-model'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    syncThemeFromProfile: vi.fn(),
    detectAndSaveThemeIfNeeded: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/shell/destination-shell', () => ({
  useShellComposerSlot: () => undefined,
}))

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

function createTodayTree(client: QueryClient) {
  const initialToday = formatAPIDate(new Date())
  const filters = buildTodayFilters({
    dateStr: initialToday,
    isTodayDate: true,
    searchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
  })

  return (
    <QueryClientProvider client={client}>
      <TestIntlProvider locale="en" messages={en}>
        <TodayProvider>
          <TodayPageClient
            initialToday={initialToday}
            initialHabits={{ queryKey: habitKeys.list(filters), items: [] }}
            initialProfile={profileFixture}
          />
        </TodayProvider>
      </TestIntlProvider>
    </QueryClientProvider>
  )
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
}

describe('Today server preload', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'))
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders the real empty Today content and free plan trial line on the server', () => {
    const client = createTestQueryClient()
    try {
      const html = renderToString(createTodayTree(client))

      expect(html).toContain(`>${en.habits.noHabitsBody}<`)
      expect(html).toContain('data-trial-line=""')
    } finally {
      client.clear()
    }
  })

  it('hydrates the signed-in preloaded Today tree without a recoverable error', async () => {
    const serverClient = createTestQueryClient()
    const html = renderToString(createTodayTree(serverClient))
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const browserClient = createTestQueryClient()
    const recoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined

    try {
      await act(async () => {
        root = hydrateRoot(container, createTodayTree(browserClient), {
          onRecoverableError: recoverableError,
        })
      })

      expect(recoverableError).not.toHaveBeenCalled()
      expect(container.innerHTML).toContain(`>${en.habits.noHabitsBody}<`)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      browserClient.clear()
      serverClient.clear()
    }
  })
})
