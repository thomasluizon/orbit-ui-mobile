import React from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { habitKeys } from '@orbit/shared/query'
import type { HabitScheduleItem, PaginatedResponse } from '@orbit/shared/types/habit'
import { buildTodayFilters } from '@/app/(app)/today-model'
import type { TodayInitialHabits } from '@/app/(app)/today-initial-data'
import { TodayProvider } from '@/app/(app)/today-provider'
import { useTodayHabitsData } from '@/app/(app)/use-today-habits-data'
import { useTodayNavigation } from '@/app/(app)/use-today-navigation'

const navigationState = vi.hoisted(() => ({ dateParam: null as string | null }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(
    navigationState.dateParam ? { date: navigationState.dateParam } : undefined,
  ),
}))

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'habit-1',
    title: 'Habit',
    description: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-08-29',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2026-08-29T00:00:00Z',
    scheduledDates: ['2026-08-29'],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    children: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    linkedGoals: [],
    instances: [],
    ...overrides,
  }
}

function paginated(items: HabitScheduleItem[]): PaginatedResponse<HabitScheduleItem> {
  return {
    items,
    page: 1,
    pageSize: 50,
    totalCount: items.length,
    totalPages: 1,
  }
}

function todayQueryKey(dateStr: string, includeOverdue: boolean) {
  const filters = buildTodayFilters({
    view: 'today',
    dateStr,
    isTodayDate: includeOverdue,
    searchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
  })
  return habitKeys.list(filters)
}

function TodayHydrationSurface({
  initialToday,
  initialHabits,
}: Readonly<{
  initialToday: string
  initialHabits: TodayInitialHabits
}>) {
  const t = useTranslations()
  const navigation = useTodayNavigation(initialToday)
  const habits = useTodayHabitsData({
    dateStr: navigation.dateStr,
    isTodayDate: navigation.isTodaySelected,
    initialHabits,
  })
  const titles = Array.from(habits.habitsById.values(), (habit) => habit.title)

  return (
    <div data-testid="today-content">
      {titles.length > 0 ? titles.join(', ') : t('habits.noHabitsBody')}
    </div>
  )
}

function createTree(
  queryClient: QueryClient,
  initialToday: string,
  initialHabits: TodayInitialHabits,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestIntlProvider locale="en" messages={en}>
        <TodayProvider>
          <TodayHydrationSurface
            initialToday={initialToday}
            initialHabits={initialHabits}
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

async function hydrateAcrossDays({
  serverNow,
  browserNow,
  initialToday,
  initialHabits,
}: Readonly<{
  serverNow: Date
  browserNow: Date
  initialToday: string
  initialHabits: TodayInitialHabits
}>): Promise<{
  container: HTMLDivElement
  queryClient: QueryClient
  recoverableError: ReturnType<typeof vi.fn>
  root: Root
  serverHtml: string
}> {
  vi.setSystemTime(serverNow)
  const serverHtml = renderToString(
    createTree(createTestQueryClient(), initialToday, initialHabits),
  )
  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.append(container)

  vi.setSystemTime(browserNow)
  const queryClient = createTestQueryClient()
  const recoverableError = vi.fn()
  let root: Root | undefined
  await act(async () => {
    root = hydrateRoot(
      container,
      createTree(queryClient, initialToday, initialHabits),
      { onRecoverableError: recoverableError },
    )
  })

  if (!root) throw new Error('Hydration did not create a React root')
  return { container, queryClient, recoverableError, root, serverHtml }
}

const fetchMock = vi.fn()

describe('Today preload hydration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    navigationState.dateParam = null
    localStorage.clear()
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('hydrates the server day, then renders the browser day query across midnight', async () => {
    const serverHabit = makeHabit({ id: 'server', title: 'Server day' })
    const browserHabit = makeHabit({ id: 'browser', title: 'Browser day' })
    fetchMock.mockResolvedValue({ ok: true, json: async () => paginated([browserHabit]) })
    const initialHabits = {
      queryKey: todayQueryKey('2026-08-30', true),
      items: [serverHabit],
    }

    const hydrated = await hydrateAcrossDays({
      serverNow: new Date('2026-08-30T00:30:00'),
      browserNow: new Date('2026-08-29T23:30:00'),
      initialToday: '2026-08-30',
      initialHabits,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(hydrated.recoverableError).not.toHaveBeenCalled()
    expect(hydrated.serverHtml).toContain('Server day')
    expect(hydrated.container).toHaveTextContent('Browser day')
    expect(hydrated.queryClient.getQueryData(todayQueryKey('2026-08-29', true))).toEqual([
      browserHabit,
    ])

    await act(async () => hydrated.root.unmount())
  })

  it('does not cache an overdue-inclusive explicit-date seed under the browser key', async () => {
    navigationState.dateParam = '2026-08-29'
    const overdueSeed = makeHabit({ id: 'overdue', title: 'Overdue seed', isOverdue: true })
    const browserHabit = makeHabit({ id: 'browser', title: 'Pinned browser result' })
    fetchMock.mockResolvedValue({ ok: true, json: async () => paginated([browserHabit]) })
    const initialHabits = {
      queryKey: todayQueryKey('2026-08-29', true),
      items: [overdueSeed],
    }

    const hydrated = await hydrateAcrossDays({
      serverNow: new Date('2026-08-29T23:30:00'),
      browserNow: new Date('2026-08-30T00:30:00'),
      initialToday: '2026-08-29',
      initialHabits,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    const browserKey = todayQueryKey('2026-08-29', false)
    expect(hydrated.recoverableError).not.toHaveBeenCalled()
    expect(hydrated.container).toHaveTextContent('Pinned browser result')
    expect(hydrated.queryClient.getQueryData(browserKey)).toEqual([browserHabit])
    expect(hydrated.queryClient.getQueryData(browserKey)).not.toContainEqual(overdueSeed)

    await act(async () => hydrated.root.unmount())
  })

  it('seeds one agreeing query and keeps the empty-state sentence in server HTML', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => paginated([]) })
    const initialHabits = {
      queryKey: todayQueryKey('2026-08-29', true),
      items: [],
    }

    const hydrated = await hydrateAcrossDays({
      serverNow: new Date('2026-08-29T12:00:00'),
      browserNow: new Date('2026-08-29T12:00:00'),
      initialToday: '2026-08-29',
      initialHabits,
    })

    expect(hydrated.recoverableError).not.toHaveBeenCalled()
    expect(hydrated.serverHtml).toContain(en.habits.noHabitsBody)
    expect(hydrated.queryClient.getQueryCache().getAll()).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => hydrated.root.unmount())
  })
})
