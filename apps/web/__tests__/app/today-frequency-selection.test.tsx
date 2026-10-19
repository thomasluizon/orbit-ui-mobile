import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { useTodaySelection } from '@/app/(app)/use-today-selection'
import { HabitListFrequencyEmptyState } from '@/components/habits/habit-list/empty-state'
import type { HabitListHandle } from '@/components/habits/habit-list'
import { useUIStore } from '@/stores/ui-store'

const mutations = vi.hoisted(() => ({ delete: vi.fn(), log: vi.fn(), skip: vi.fn() }))
vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => ({ mutateAsync: mutations.delete }),
  useBulkLogHabits: () => ({ mutateAsync: mutations.log }),
  useBulkSkipHabits: () => ({ mutateAsync: mutations.skip }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showToast: vi.fn(), showQueued: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

const noop = () => {}
const date = '2026-09-12'
const habits = [
  createMockHabit({ id: 'daily', frequencyUnit: 'Day', scheduledDates: [date] }),
  createMockHabit({ id: 'monthly', frequencyUnit: 'Month', scheduledDates: [date] }),
]
const habitListRef = { current: null } as React.RefObject<HabitListHandle | null>
let selection: ReturnType<typeof useTodaySelection>

function TodayHarness({ recovery = false }: Readonly<{ recovery?: boolean }>) {
  const frequencyUnit = useUIStore((state) => state.activeFilters.frequencyUnit)
  const visible = habits.filter((habit) => !frequencyUnit || habit.frequencyUnit === frequencyUnit)
  const currentSelection = useTodaySelection({
    selectedDateStr: date, today: date, habitListRef,
    habitsById: new Map(visible.map((habit) => [habit.id, habit])),
    childrenByParent: new Map(), habitsCount: visible.length,
  })
  React.useEffect(() => { selection = currentSelection }, [currentSelection])
  return <>
    <output>{visible.map((habit) => habit.id).join(',')}</output>
    <TodayDateControl dayName={en.dates.today} numericDate="12/09" isTodaySelected nextDisabled={false}
      previousLabel={en.dates.previousDay} goToTodayLabel={en.dates.goToToday}
      nextLabel={en.dates.nextDay} moreLabel={en.habits.listOptions} menuHeading={en.common.options}
      selectLabel={en.common.select} collapseLabel={en.habits.collapseAll} allCollapsed={false}
      refreshLabel={en.habits.refresh} completedLabel={en.habits.showCompleted} showCompleted={false}
      isFetching={false} searchLabel={en.habits.search.title} onSearch={noop}
      onToggleSelect={noop} onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop}
      onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} />
    {recovery && frequencyUnit ? <HabitListFrequencyEmptyState frequencyUnit={frequencyUnit} /> : null}
  </>
}

beforeEach(() => {
  useUIStore.setState({ activeFilters: {}, isSelectMode: false, selectedHabitIds: new Set(), manuallySelectedIds: new Set() })
  for (const mutation of Object.values(mutations)) mutation.mockReset().mockResolvedValue({ results: [] })
})

async function chooseFrequency(label: string) {
  fireEvent.click(screen.getByRole('button', { name: en.habits.listOptions }))
  fireEvent.click(await screen.findByRole('menuitem', { name: en.habits.frequencyFilter }))
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: label }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

const transitions = [
  ['switch', undefined, en.habits.filter.monthly, 'Month', 'daily', false],
  ['toggle off', 'Month', en.habits.filter.monthly, undefined, 'monthly', false],
  ['All', 'Month', en.common.all, undefined, 'monthly', false],
  ['empty recovery', 'Month', en.common.all, undefined, 'monthly', true],
] as const

it.each(transitions.flatMap((transition) => (['confirmBulkDelete', 'confirmBulkLog', 'confirmBulkSkip'] as const)
  .map((action) => ({ name: transition[0], initial: transition[1], label: transition[2], expected: transition[3], selected: transition[4], recovery: transition[5], action }))))('resets bulk actions on frequency $name with $action', async ({ initial, label, expected, selected, recovery, action }) => {
  useUIStore.getState().setFilters({ frequencyUnit: initial })
  render(<NextIntlClientProvider locale="en" messages={en}><TodayHarness recovery={recovery} /></NextIntlClientProvider>)
  act(() => {
    selection.handleToggleSelection(selected)
    selection.setShowBulkDeleteConfirm(true)
  })
  expect(useUIStore.getState().selectedHabitIds).toEqual(new Set([selected]))
  if (recovery) fireEvent.click(screen.getByRole('button', { name: en.common.all }))
  else await chooseFrequency(label)
  expect(useUIStore.getState().activeFilters.frequencyUnit).toBe(expected)
  expect(screen.getByRole('status')).toHaveTextContent(expected === 'Month' ? 'monthly' : 'daily,monthly')
  await act(async () => { await selection[action]() })
  for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled()
  expect(useUIStore.getState().selectedHabitIds.size).toBe(0)
  expect(useUIStore.getState().manuallySelectedIds.size).toBe(0)
  expect(useUIStore.getState().isSelectMode).toBe(false)
  expect(selection.showBulkDeleteConfirm).toBe(false)
  for (const [action, mutation] of [
    ['confirmBulkDelete', mutations.delete], ['confirmBulkLog', mutations.log], ['confirmBulkSkip', mutations.skip],
  ] as const) {
    act(() => selection.handleToggleSelection('monthly'))
    await act(async () => { await selection[action]() })
    expect(mutation).toHaveBeenCalledWith(action === 'confirmBulkDelete' ? ['monthly'] : [{ habitId: 'monthly', date }])
  }
})
