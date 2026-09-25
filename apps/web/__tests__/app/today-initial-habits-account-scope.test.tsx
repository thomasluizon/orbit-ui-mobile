import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { habitKeys } from '@orbit/shared/query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import {
  habitScheduleItemSchema,
  type HabitScheduleItem,
} from '@orbit/shared/types/habit'
import { getQueryClient } from '@/lib/query-client'
import { useTodayHabitsData } from '@/app/(app)/use-today-habits-data'
import { buildTodayFilters } from '@/app/(app)/today-model'
import { holdAccount, recoverSameAccount, replaceAccountWith, respondWithAccount, retireHeldAccount } from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }))

vi.mock('@/lib/api-fetch', () => ({
  fetchJson: (...args: unknown[]) => mocks.fetchJson(...args),
}))

/**
 * The real query client, the one `startAccountScopedSession` clears. The leak this covers is the
 * rebuild that follows the clear, so a mocked `useQuery` would hide the whole mechanism.
 */
function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
}

const DATE = '2025-01-01'

/** Built through the schema the API response is parsed by, so the fixture cannot drift off it. */
function scheduleItem(id: string, title: string): HabitScheduleItem {
  return habitScheduleItemSchema.parse({
    ...createMockHabit({ id, title, dueDate: DATE, scheduledDates: [DATE] }),
    children: [],
    linkedGoals: [],
  })
}

/** The same producers `today-initial-data.ts` runs on the server, so the key matches the client's. */
function initialHabitsFor(item: HabitScheduleItem) {
  const filters = buildTodayFilters({
    view: 'today',
    dateStr: DATE,
    isTodayDate: true,
    searchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
  })
  return { queryKey: habitKeys.list(filters), items: [item] }
}

function renderToday() {
  return renderHook(
    () => useTodayHabitsData({
      dateStr: DATE,
      isTodayDate: true,
      initialHabits: initialHabitsFor(scheduleItem('habit-a', 'Take lithium at 9pm')),
    }),
    { wrapper },
  )
}

function titlesOf(habitsById: Map<string, { title: string }>): string[] {
  return [...habitsById.values()].map((habit) => habit.title)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  getQueryClient().clear()
  globalThis.localStorage.clear()
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  getQueryClient().clear()
  mocks.fetchJson.mockReset()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('never shows the next account the habits the server rendered for the previous one', async () => {
  const rendered = renderToday()
  expect(titlesOf(rendered.result.current.habitsById)).toEqual(['Take lithium at 9pm'])
  expect(mocks.fetchJson).not.toHaveBeenCalled()

  mocks.fetchJson.mockResolvedValue({
    items: [scheduleItem('habit-b', 'Walk the dog')],
    page: 1,
    pageSize: 200,
    totalCount: 1,
    totalPages: 1,
  })
  await replaceAccountWith('user-2')

  await waitFor(() =>
    expect(titlesOf(rendered.result.current.habitsById)).toEqual(['Walk the dog']))
})

it('discards server habits when the first client session check finds another account', async () => {
  await retireHeldAccount()
  const rendered = renderToday()
  expect(titlesOf(rendered.result.current.habitsById)).toEqual(['Take lithium at 9pm'])
  mocks.fetchJson.mockResolvedValue({
    items: [scheduleItem('habit-b', 'Walk the dog')],
    page: 1,
    pageSize: 200,
    totalCount: 1,
    totalPages: 1,
  })

  respondWithAccount('user-2')
  await act(async () => { await useAuthStore.getState().checkSession() })

  await waitFor(() => expect(titlesOf(rendered.result.current.habitsById)).toEqual(['Walk the dog']))
})

it('keeps the rendered habits when the same account recovers from a rejected refresh', async () => {
  const rendered = renderToday()
  expect(titlesOf(rendered.result.current.habitsById)).toEqual(['Take lithium at 9pm'])

  await recoverSameAccount('user-1')

  expect(titlesOf(rendered.result.current.habitsById)).toEqual(['Take lithium at 9pm'])
  expect(mocks.fetchJson).not.toHaveBeenCalled()
})
