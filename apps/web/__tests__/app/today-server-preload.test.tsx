import React from 'react'
import { act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { habitKeys } from '@orbit/shared/query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { habitScheduleItemSchema, type HabitScheduleItem } from '@orbit/shared/types/habit'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { formatAPIDate, habitListQueryFilters } from '@orbit/shared/utils'
import { AccountClock } from '@/lib/account-clock'
import CalendarPage from '@/app/(app)/calendar/page'
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

vi.mock('@orbit/shared/utils/intl-format-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils/intl-format-cache')>()
  return { ...actual, getDateTimeFormat: (locale: string, options?: Intl.DateTimeFormatOptions) => actual.getDateTimeFormat(locale, { ...options, timeZone: options?.timeZone ?? process.env.TZ }) }
})

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
  useNotifications: () => ({ notifications: [], unreadCount: 0 }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: DEFAULT_CONFIG }) }))
vi.mock('@/components/shell/destination-shell', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/shell/destination-shell')>(),
  useShellComposerSlot: () => undefined,
}))

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

interface HydrationSettings {
  route: string
  initialToday: string
  timeZone: string | null
  now: number
  locale: string
}

function createTodayTree(client: QueryClient, items: HabitScheduleItem[] = [], accountId: string | null = null, settings?: HydrationSettings) {
  const { route = 'today', initialToday = formatAPIDate(new Date()), timeZone = profileFixture.timeZone, now = Date.now(), locale = 'en' } = settings ?? {}
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
      <TestIntlProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
        <RenderedAccountSeed accountId={accountId}>
        <AccountClock now={now} timeZone={timeZone}>
        <TodayProvider>
          {route === 'calendar' ? <CalendarPage /> : <TodayPageClient
            initialToday={initialToday}
            initialHabits={{ queryKey: habitKeys.list(habitListQueryFilters(filters, true)), items, totalCount: items.length }}
            initialProfile={{ ...profileFixture, timeZone }}
          />}
        </TodayProvider>
        </AccountClock>
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

  it('renders the real empty Today content without a plan line on the server', () => {
    const client = createTestQueryClient()
    try {
      const html = renderToString(createTodayTree(client))

      expect(html).toContain(`>${en.habits.nothingOpen}<`)
      expect(html).not.toContain(`>${en.habits.noHabitsBody}<`)
      expect(html).not.toContain('data-trial-line')
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
      expect(container.innerHTML).toContain(`>${en.habits.nothingOpen}<`)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      browserClient.clear()
      serverClient.clear()
    }
  })


  it.each([
    ['today', 'en', 'America/Sao_Paulo', '2026-10-27', '2026-10-28T01:30:00Z', 'October 27'],
    ['calendar', 'en', 'America/Sao_Paulo', '2026-10-27', '2026-10-28T01:30:00Z', 'October 27'],
    ['today', 'pt-BR', 'America/Sao_Paulo', '2026-10-27', '2026-10-28T01:30:00Z', '27 de outubro'],
    ['calendar', 'pt-BR', 'America/Sao_Paulo', '2026-10-27', '2026-10-28T01:30:00Z', '27 de outubro'],
    ['today', 'en', 'Pacific/Kiritimati', '2026-10-28', '2026-10-27T12:30:00Z', 'October 28'],
    ['calendar', 'en', 'Pacific/Kiritimati', '2026-10-28', '2026-10-27T12:30:00Z', 'October 28'],
  ])('hydrates %s in %s using %s across host calendar days', async (route, locale, timeZone, initialToday, instant, label) => {
    const originalTimeZone = process.env.TZ
    const serverClient = createTestQueryClient()
    const browserClient = createTestQueryClient()
    const container = document.createElement('div')
    const recoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    const now = new Date(instant).getTime()
    const settings = { route, locale, timeZone, initialToday, now }
    vi.setSystemTime(now)
    const items = [habitScheduleItemSchema.parse({ ...createMockHabit({ dueDate: '2026-10-27', scheduledDates: ['2026-10-27'] }), children: [], linkedGoals: [] })]
    try {
      process.env.TZ = 'UTC'
      container.innerHTML = renderToString(createTodayTree(serverClient, items, null, settings))
      expect(container).toHaveTextContent(label)
      document.body.append(container)
      process.env.TZ = timeZone
      expect(new Date().getDate()).toBe(Number(initialToday.slice(-2)))
      await act(async () => {
        root = hydrateRoot(container, createTodayTree(browserClient, items, null, settings), {
          onRecoverableError: recoverableError,
        })
      })
      expect(recoverableError).not.toHaveBeenCalled()
      expect(container).toHaveTextContent(label)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      browserClient.clear()
      serverClient.clear()
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
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
      const accountRequests = vi.mocked(globalThis.fetch).mock.calls.filter(([url]) =>
        typeof url === 'string' && (url.startsWith('/api/habits') || url === '/api/profile'))
      expect(accountRequests.map(([url]) => url)).toEqual(['/api/habits/count'])
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
    let logSettled = false
    let habitListFetches = 0
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
      const fetchSession = vi.mocked(globalThis.fetch).getMockImplementation()!
      vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
        if (input === '/api/auth/session') return fetchSession(input, init)
        if (typeof input === 'string' && input.startsWith('/api/habits')) {
          habitListFetches += 1
          return Promise.resolve({
            ok: true, status: 200,
            json: async () => ({
              items: [logSettled ? { ...habit, isCompleted: true } : habit],
              page: 1, pageSize: 50, totalCount: 1, totalPages: 1,
            }),
          } as Response)
        }
        return new Promise<Response>(() => undefined)
      })
      await act(async () => { await useAuthStore.getState().checkSession() })
      expect(ring?.getAttribute('aria-label')).toContain(en.habits.statusDot.done)
      expect(habitListFetches).toBe(0)

      logSettled = true
      await act(async () => { answerLog?.({ logId: 'log-1', isFirstCompletionToday: false, currentStreak: 1 }) })
      await vi.waitFor(() => expect(habitListFetches).toBeGreaterThan(0))
      expect(ring?.getAttribute('aria-label')).toContain(en.habits.statusDot.done)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      queryClient.clear()
      serverClient.clear()
    }
  })

  it('keeps the first habit row tap after the rendered account is confirmed', async () => {
    const documentFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const user = userEvent.setup()
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
      await user.pointer({ target: row!, keys: '[MouseLeft>]' })
      respondWithAccount('user-1')
      await act(async () => { await useAuthStore.getState().checkSession() })
      await user.pointer({ target: row!, keys: '[/MouseLeft]' })

      expect(routerPush).toHaveBeenCalledWith(`/habits/habit-a?date=${date}&from=today`)
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      queryClient.clear()
      serverClient.clear()
      documentFocus.mockRestore()
    }
  })
})
