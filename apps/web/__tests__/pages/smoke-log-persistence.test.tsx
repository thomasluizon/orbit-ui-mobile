import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, Response } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { habitListQueryFilters, habitViewQueryOptions } from '@orbit/shared/utils'
import { createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { habitScheduleItemSchema, logHabitResponseSchema } from '@orbit/shared/types/habit'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { TodayHeaderRegion, TodayHabitsPanel } from '@/app/(app)/today-page-view'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { holdAccount } from '@/__tests__/support/account-change'
import { SmokeDomPage, expectSmokeDom } from '@/__tests__/support/smoke-dom'
import { logSmokeHabit } from '@/e2e/support/smoke-adapters'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'

const today = '2026-09-04'
const title = 'Smoke persisted recurring habit'
const rowSelector = `[data-habit-title="${title}"]`
const boundary = vi.hoisted(() => ({ fetch: vi.fn(), log: vi.fn(), toast: vi.fn() }))

vi.mock('@playwright/test', () => ({ expect: expectSmokeDom }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/', useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-09-04' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ timeZone: 'UTC' }) }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: DEFAULT_CONFIG }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: boundary.toast }) }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: (...args: unknown[]) => boundary.fetch(...args) }))
vi.mock('@/lib/actions/habits', () => ({ logHabit: (...args: unknown[]) => boundary.log(...args) }))
vi.mock('@/lib/posthog', () => ({ captureHabitLogged: vi.fn(), identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))

function TodaySurface() {
  const view = useTodayPage(today, null)
  return <><TodayHeaderRegion view={view} /><TodayHabitsPanel view={view} /></>
}

function scheduleItem(done: boolean) {
  return habitScheduleItemSchema.parse(createMockHabitScheduleItem({
    id: 'smoke-persisted-habit', title, dueDate: today,
    scheduledDates: done ? [] : [today], isLoggedInRange: done,
    instances: done ? [{ date: today, status: 'Completed', logId: 'persisted-log' }] : [],
  }))
}

function mountToday(page: SmokeDomPage, locale: 'en' | 'pt-BR', persisted = true) {
  let stored = false
  let reloads = 0
  const hiddenAfterReload: boolean[] = []
  const clients: QueryClient[] = []
  const filters = { dateFrom: today, dateTo: today, includeOverdue: true }
  const options = habitViewQueryOptions('today', today)
  const key = habitKeys.list(habitListQueryFilters(filters, options.completeDay, options.scheduleDate))
  boundary.fetch.mockImplementation(async (url: string) => {
    if (url === API.habits.count) return { count: 1 }
    if (!url.startsWith(`${API.habits.list}?`)) throw new Error(`Unexpected query: ${url}`)
    return { items: [scheduleItem(stored)], page: 1, pageSize: 20, totalCount: 1, totalPages: 1 }
  })
  boundary.log.mockImplementation(async () => {
    stored = true
    page.respond?.({
      request: () => ({ method: () => 'POST', headers: () => ({ 'next-action': '<action-id>' }) }),
      ok: () => true,
    } as unknown as Response)
    return logHabitResponseSchema.parse({ logId: 'persisted-log', isFirstCompletionToday: false, currentStreak: 0 })
  })
  function freshMount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    clients.push(client)
    client.setQueryData(key, [scheduleItem(stored)])
    client.setQueryData(habitKeys.count(), 1)
    client.setQueryData(profileKeys.detail(), createMockProfile({ timeZone: 'UTC' }))
    return render(<TodaySurface />, { wrapper: ({ children }: { children: ReactNode }) =>
      <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </NextIntlClientProvider> })
  }
  let surface = freshMount()
  page.setReload(async () => {
    reloads += 1
    surface.unmount()
    for (const client of clients) client.clear()
    stored = stored && persisted
    surface = freshMount()
    hiddenAfterReload.push(document.querySelector(rowSelector) === null)
  })
  return { hiddenAfterReload, reloads: () => reloads, clear: () => { surface.unmount(); for (const client of clients) client.clear() } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${today}T12:00:00Z`))
  localStorage.clear()
  holdAccount('smoke-unit-account')
  useUIStore.setState(useUIStore.getInitialState())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  useAuthStore.setState(useAuthStore.getInitialState())
  localStorage.clear()
})

describe.each(['en', 'pt-BR'] as const)('smoke persisted Today completion in %s', (locale) => {
  it.each([false, true])('reveals the persisted row through the real list menu, wide=%s', async (wide) => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: wide, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
    const page = new SmokeDomPage()
    const surface = mountToday(page, locale)
    try {
      await waitFor(() => expect(document.querySelector(rowSelector)).toHaveAttribute('data-status', 'empty'))
      await logSmokeHabit(page as unknown as Page, title)
      expect(boundary.log).toHaveBeenCalledExactlyOnceWith('smoke-persisted-habit', { date: today }, 'smoke-unit-account')
      expect(surface.reloads()).toBe(1)
      expect(surface.hiddenAfterReload).toEqual([true])
      expect(document.querySelector(rowSelector)).toHaveAttribute('data-status', 'done')
      expect(screen.queryByRole('menu')).toBeNull()
    } finally { surface.clear() }
  })

  it('rejects completion absent after reload despite a successful Server Action response', async () => {
    const page = new SmokeDomPage()
    const surface = mountToday(page, locale, false)
    try {
      await expect(logSmokeHabit(page as unknown as Page, title)).rejects.toThrow(/done/)
      expect(boundary.log).toHaveBeenCalledTimes(1)
      expect(surface.reloads()).toBe(1)
      expect(document.querySelector(rowSelector)).toHaveAttribute('data-status', 'empty')
    } finally { surface.clear() }
  })
})
