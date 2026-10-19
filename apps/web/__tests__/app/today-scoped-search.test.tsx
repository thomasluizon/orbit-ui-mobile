import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { createAppendedGeneralSearchItems, createHabitViewItems, createHabitViewScheduleItems } from '@orbit/shared/__tests__/habit-view-fixtures'
import { habitListQueryFilters, habitViewQueryOptions, mergeHabitListSchedule } from '@orbit/shared/utils'
import type { HabitsFilter } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import { TodayHeaderRegion, TodayHabitsPanel } from '@/app/(app)/today-page-view'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { SelectionTray } from '@/components/habits/selection-tray'
import { useUIStore } from '@/stores/ui-store'
import { writeShowGeneralOnToday } from '@/lib/show-general-on-today-storage'

const today = '2026-09-04'
const selectedDay = '2026-09-03'
const boundary = vi.hoisted(() => ({ date: null as string | null, log: vi.fn(), fetch: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(boundary.date ? { date: boundary.date } : {}),
}))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-09-04' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', hasProAccess: true } }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-config', async () => {
  const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config')
  return { useConfig: () => ({ config: DEFAULT_CONFIG }) }
})
vi.mock('@/lib/api-fetch', () => ({ fetchJson: (...args: unknown[]) => boundary.fetch(...args) }))
vi.mock('@/hooks/use-habits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-habits')>()),
  useBulkLogHabits: () => ({ mutateAsync: boundary.log }),
}))

function TodaySearchSurface() {
  const view = useTodayPage(today, null)
  return <>
    <TodayHeaderRegion view={view} />
    <TodayHabitsPanel view={view} />
    {view.isSelectMode ? <SelectionTray selectedCount={view.selectedHabitIds.size} allSelected={view.selection.allSelected}
      onSelectAll={view.selection.selectAll} onDeselectAll={view.selection.deselectAll}
      onBulkLog={() => void view.selection.confirmBulkLog()} onBulkSkip={() => void view.selection.confirmBulkSkip()}
      onBulkDelete={() => view.selection.setShowBulkDeleteConfirm(true)} onCancel={view.toggleSelectMode} /> : null}
  </>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${today}T12:00:00Z`))
  useUIStore.setState({ ...useUIStore.getInitialState(), activeFilters: { frequencyUnit: 'Day' } })
  boundary.fetch.mockReset().mockRejectedValue(new Error('Unexpected uncached query'))
  boundary.log.mockReset().mockResolvedValue({ results: [] })
  writeShowGeneralOnToday(false)
})
afterEach(() => vi.useRealTimers())

it.each([false, true])('scopes Hoje search with general habits enabled, matching descendant=%s', async (matchesDescendant) => {
  boundary.date = null
  useUIStore.setState({ activeView: 'today', activeFilters: {} })
  writeShowGeneralOnToday(true)
  const query = matchesDescendant ? 'Needle child' : 'zzzz-no-match'
  const filters = { dateFrom: today, dateTo: today, includeOverdue: true, includeGeneral: true }
  const options = habitViewQueryOptions('today', today)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  for (const search of ['', query]) {
    client.setQueryData(habitKeys.list(habitListQueryFilters({ ...filters, search: search || undefined }, options.completeDay, options.scheduleDate)), createAppendedGeneralSearchItems(Boolean(search) && matchesDescendant))
  }
  client.setQueryData(habitKeys.count(), 4)
  const rendered = render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={en}>
    <TodaySearchSurface />
  </NextIntlClientProvider></QueryClientProvider>)
  try {
    expect(screen.getAllByTestId('habit-row')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: en.habits.search.title }))
    fireEvent.change(screen.getByRole('textbox', { name: en.habits.search.title }), { target: { value: query } })
    await act(async () => { vi.advanceTimersByTime(300) })
    const rows = screen.queryAllByTestId('habit-row')
    expect(rows.map((row) => row.textContent)).toHaveLength(matchesDescendant ? 2 : 0)
    if (matchesDescendant) {
      expect(rows[0]).toHaveTextContent('Someday')
      expect(rows[1]).toHaveTextContent('Needle child')
      expect(screen.queryByText('Any day')).not.toBeInTheDocument()
      expect(screen.queryByText('Other child')).not.toBeInTheDocument()
    } else {
      expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === `Nothing found for “${query}”`)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: en.common.clear }))
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(screen.queryByRole('textbox', { name: en.habits.search.title })).not.toBeInTheDocument()
      expect(screen.getAllByTestId('habit-row')).toHaveLength(4)
    }
    expect(boundary.fetch).not.toHaveBeenCalled()
  } finally {
    rendered.unmount()
    client.clear()
    writeShowGeneralOnToday(false)
  }
})

it.each([
  { view: 'today', label: en.habits.viewToday, query: 'Today child', target: 'today-child', excluded: 'Overdue' },
  { view: 'all', label: en.habits.viewAll, query: 'Later child', target: 'future-child', excluded: 'Future' },
  { view: 'general', label: en.habits.viewGeneral, query: 'Any day child', target: 'general-child', excluded: 'Any day done' },
] as const)('filters and acts on the $view list without changing its date or frequency scope', async ({ view, label, query, target, excluded }) => {
  boundary.date = view === 'today' ? selectedDay : null
  useUIStore.setState({ activeView: view })
  const date = boundary.date ?? today
  const filters: HabitsFilter = view === 'today'
    ? { dateFrom: date, dateTo: date, includeOverdue: false, frequencyUnit: 'Day' }
    : view === 'all' ? { frequencyUnit: 'Day' } : { isGeneral: true }
  const options = habitViewQueryOptions(view, today)
  const items = createHabitViewItems(date, view)
    .filter((habit) => view === 'general' || habit.frequencyUnit === 'Day')
    .map((habit) => habit.id === 'general-done' ? { ...habit, isCompleted: false } : habit)
  const scheduled = view === 'all' ? mergeHabitListSchedule(items, createHabitViewScheduleItems(today)) : items
  const searched = scheduled.filter((habit) => habit.children.some((child) => child.id === target))
    .map((habit) => ({ ...habit, searchMatches: [{ field: 'child' as const, value: query }],
      children: habit.children.map((child) => ({ ...child,
        searchMatches: child.id === target ? [{ field: 'title' as const, value: query }] : [],
      })),
    }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  for (const search of ['', query]) {
    client.setQueryData(habitKeys.list(habitListQueryFilters({ ...filters, search: search || undefined }, options.completeDay, options.scheduleDate)), search ? searched : scheduled)
  }
  client.setQueryData(habitKeys.count(), items.length)
  const rendered = render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={en}>
    <TodaySearchSurface />
  </NextIntlClientProvider></QueryClientProvider>)
  try {
    const rows = () => screen.getAllByTestId('habit-row')
    const before = rows().length
    const pager = rendered.container.querySelector('[data-today-date-row]')
    const pagerText = pager?.textContent
    fireEvent.click(screen.getByRole('button', { name: en.habits.search.title }))
    const input = screen.getByRole('textbox', { name: en.habits.search.title })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: query } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(rows().length).toBeLessThan(before)
    expect(rows().some((row) => row.textContent.includes(query))).toBe(true)
    expect(rows().some((row) => row.textContent.includes(excluded))).toBe(false)
    expect(screen.getByRole('radio', { name: label })).toBeChecked()
    expect(useUIStore.getState().activeFilters.frequencyUnit).toBe('Day')
    expect(rendered.container.querySelector('[data-today-date-row]')).toBe(pager)
    expect(pager?.textContent).toBe(pagerText)
    expect(boundary.date).toBe(view === 'today' ? selectedDay : null)
    fireEvent.click(screen.getByRole('button', { name: en.habits.listOptions }))
    fireEvent.click(screen.getByRole('menuitem', { name: en.common.select }))
    const row = rows().find((row) => row.textContent.includes(query))!
    fireEvent.click(within(row).getByRole('button', { name: query, pressed: false }))
    expect(useUIStore.getState().selectedHabitIds).toEqual(new Set([target]))
    fireEvent.click(screen.getByRole('button', { name: en.habits.bulkBar.log }))
    await act(async () => {})
    expect(boundary.log).toHaveBeenCalledWith([{ habitId: target, date: view === 'today' ? selectedDay : today }])
    expect(boundary.fetch).not.toHaveBeenCalled()
  } finally {
    rendered.unmount()
    client.clear()
  }
})
