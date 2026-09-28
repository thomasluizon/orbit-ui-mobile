import React from 'react'
import { act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { habitKeys } from '@orbit/shared/query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { habitScheduleItemSchema, type HabitScheduleItem } from '@orbit/shared/types/habit'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { formatAPIDate } from '@orbit/shared/utils'
import { TodayPageClient } from '@/app/(app)/today-page-client'
import { RenderedAccountSeed } from '@/app/(app)/rendered-account-seed'
import { getQueryClient } from '@/lib/query-client'
import { respondWithAccount, retireHeldAccount } from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'

const logHabitAction = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('@/lib/actions/habits', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/habits')>(),
  logHabit: logHabitAction,
}))
import { TodayProvider } from '@/app/(app)/today-provider'
import { buildTodayFilters } from '@/app/(app)/today-model'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
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
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: DEFAULT_CONFIG }) }))
vi.mock('@/components/shell/destination-shell', () => ({
  useShellComposerSlot: () => undefined,
}))

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

function createTodayTree(client: QueryClient, items: HabitScheduleItem[] = [], accountId: string | null = null) {
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
        <RenderedAccountSeed accountId={accountId}>
        <TodayProvider>
          <TodayPageClient
            initialToday={initialToday}
            initialHabits={{ queryKey: habitKeys.list(filters), items }}
            initialProfile={profileFixture}
          />
        </TodayProvider>
        </RenderedAccountSeed>
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
    logHabitAction.mockReset()
    routerPush.mockReset()
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

  it('keeps the first opened row menu and preloaded queries after confirming the rendered account', async () => {
    await retireHeldAccount()
    const queryClient = getQueryClient()
    queryClient.clear()
    const date = formatAPIDate(new Date())
    const habit = habitScheduleItemSchema.parse({
      ...createMockHabit({ id: 'habit-a', title: 'Read', dueDate: date, scheduledDates: [date] }),
      children: [], linkedGoals: [],
    })
    const serverClient = createTestQueryClient()
    const container = document.createElement('div')
    container.innerHTML = renderToString(createTodayTree(serverClient, [habit], 'user-1'))
    document.body.append(container)
    let root: ReturnType<typeof hydrateRoot> | undefined

    try {
      await act(async () => {
        root = hydrateRoot(container, createTodayTree(queryClient, [habit], 'user-1'))
      })
      const menu = container.querySelector<HTMLButtonElement>('button[data-habit-row-control="menu"]')
      expect(menu).not.toBeNull()
      fireEvent.click(menu!)
      expect(menu).toHaveAttribute('aria-expanded', 'true')

      respondWithAccount('user-1')
      await act(async () => { await useAuthStore.getState().checkSession() })

      expect(menu).toHaveAttribute('aria-expanded', 'true')
      expect(container.querySelector('[aria-busy="true"]')).toBeNull()
      expect(vi.mocked(globalThis.fetch).mock.calls.filter(([url]) =>
        typeof url === 'string' && (url.startsWith('/api/habits') || url === '/api/profile'))).toEqual([])
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      queryClient.clear()
      serverClient.clear()
    }
  })

  it('keeps an optimistic log through the first check for the rendered account', async () => {
    await retireHeldAccount()
    const queryClient = getQueryClient()
    queryClient.clear()
    const date = formatAPIDate(new Date())
    const habit = habitScheduleItemSchema.parse({
      ...createMockHabit({ id: 'habit-a', title: 'Read', dueDate: date, scheduledDates: [date] }),
      children: [], linkedGoals: [],
    })
    let answerLog: ((value: { logId: string; isFirstCompletionToday: boolean; currentStreak: number }) => void) | undefined
    logHabitAction.mockImplementation(() => new Promise((resolve) => { answerLog = resolve }))
    const serverClient = createTestQueryClient()
    const container = document.createElement('div')
    container.innerHTML = renderToString(createTodayTree(serverClient, [habit], 'user-1'))
    document.body.append(container)
    let root: ReturnType<typeof hydrateRoot> | undefined

    try {
      await act(async () => {
        root = hydrateRoot(container, createTodayTree(queryClient, [habit], 'user-1'))
      })
      const ring = container.querySelector<HTMLButtonElement>('[data-testid="habit-status-toggle"]')
      expect(ring).not.toBeNull()
      fireEvent.click(ring!)
      await vi.waitFor(() => expect(logHabitAction).toHaveBeenCalledOnce())
      expect(ring?.getAttribute('aria-label')).toContain(en.habits.statusDot.done)

      respondWithAccount('user-1')
      await act(async () => { await useAuthStore.getState().checkSession() })
      expect(ring?.getAttribute('aria-label')).toContain(en.habits.statusDot.done)

      await act(async () => { answerLog?.({ logId: 'log-1', isFirstCompletionToday: false, currentStreak: 1 }) })
      expect(ring?.getAttribute('aria-label')).toContain(en.habits.statusDot.done)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      queryClient.clear()
      serverClient.clear()
    }
  })

  it('keeps the first habit row tap after the rendered account is confirmed', async () => {
    await retireHeldAccount()
    const queryClient = getQueryClient()
    queryClient.clear()
    const date = formatAPIDate(new Date())
    const habit = habitScheduleItemSchema.parse({
      ...createMockHabit({ id: 'habit-a', title: 'Read', dueDate: date, scheduledDates: [date] }),
      children: [], linkedGoals: [],
    })
    const serverClient = createTestQueryClient()
    const container = document.createElement('div')
    container.innerHTML = renderToString(createTodayTree(serverClient, [habit], 'user-1'))
    document.body.append(container)
    let root: ReturnType<typeof hydrateRoot> | undefined

    try {
      await act(async () => {
        root = hydrateRoot(container, createTodayTree(queryClient, [habit], 'user-1'))
      })
      const row = container.querySelector<HTMLButtonElement>('[data-habit-row-body]')
      expect(row).not.toBeNull()
      fireEvent.pointerDown(row!)
      respondWithAccount('user-1')
      await act(async () => { await useAuthStore.getState().checkSession() })
      fireEvent.click(row!)

      expect(routerPush).toHaveBeenCalledWith(`/habits/habit-a?date=${date}&from=today`)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      queryClient.clear()
      serverClient.clear()
    }
  })
})
