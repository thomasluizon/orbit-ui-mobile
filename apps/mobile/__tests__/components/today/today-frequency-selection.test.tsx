import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { Pressable, Text } from 'react-native'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import { TodayDateControl } from '@/components/today/today-date-control'
import { useTodaySelection } from '@/app/(tabs)/use-today-selection'
import { HabitListFrequencyEmptyState } from '@/components/habit-list/empty-state'
import type { HabitListHandle } from '@/components/habit-list'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')
const { act } = TestRenderer

const mutations = vi.hoisted(() => ({ delete: vi.fn(), log: vi.fn(), skip: vi.fn() }))
vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => ({ mutateAsync: mutations.delete }),
  useBulkLogHabits: () => ({ mutateAsync: mutations.log }),
  useBulkSkipHabits: () => ({ mutateAsync: mutations.skip }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showToast: vi.fn(), showQueued: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string) => {
    let value: unknown = en
    for (const part of key.split('.')) value = (value as Record<string, unknown>)[part]
    return value
  }, i18n: { language: 'en' },
}) }))

const noop = () => {}
const date = '2026-09-12'
const habits = [
  createMockHabit({ id: 'daily', frequencyUnit: 'Day', scheduledDates: [date] }),
  createMockHabit({ id: 'monthly', frequencyUnit: 'Month', scheduledDates: [date] }),
]
const habitListRef = { current: null } as React.RefObject<HabitListHandle | null>
let selection: ReturnType<typeof useTodaySelection>
let tree: ReactTestRenderer & { unmount: () => void }
afterEach(() => { act(() => tree.unmount()) })

function TodayHarness({ recovery = false }: Readonly<{ recovery?: boolean }>) {
  const frequencyUnit = useUIStore((state) => state.activeFilters.frequencyUnit)
  const visible = habits.filter((habit) => !frequencyUnit || habit.frequencyUnit === frequencyUnit)
  const currentSelection = useTodaySelection({
    selectedDateStr: date, today: date, habitListRef,
    habitsById: new Map(visible.map((habit) => [habit.id, habit])),
    habitListAllLoadedIds: new Set(visible.map((habit) => habit.id)), closeControlsMenu: noop,
  })
  React.useEffect(() => { selection = currentSelection }, [currentSelection])
  return <>
    <Text testID="visible">{visible.map((habit) => habit.id).join(',')}</Text>
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

async function press(label: string) {
  const control = tree.root.findAll((node) => node.type === Pressable).find((node) =>
    node.props.accessibilityLabel === label || node.findAll((child) => child.type === Text).some((text) => text.props.children === label),
  )
  if (!control) throw new Error(`Missing control: ${label}`)
  await act(async () => {
    (control.props.onPress as () => void)()
    await Promise.resolve()
  })
}

async function chooseFrequency(label: string) {
  await press(en.habits.listOptions)
  await press(en.habits.frequencyFilter)
  await press(label)
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
  act(() => { tree = TestRenderer.create(<TodayHarness recovery={recovery} />) })
  act(() => {
    useUIStore.getState().selectAllHabits([selected])
    selection.setShowBulkDeleteConfirm(true)
  })
  expect(useUIStore.getState().selectedHabitIds).toEqual(new Set([selected]))
  if (recovery) await press(en.common.all)
  else await chooseFrequency(label)
  expect(useUIStore.getState().activeFilters.frequencyUnit).toBe(expected)
  expect(tree.root.findAll((node) => node.props.testID === 'visible')[0]!.props.children).toBe(expected === 'Month' ? 'monthly' : 'daily,monthly')
  await act(async () => { await selection[action]() })
  for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled()
  expect(useUIStore.getState().selectedHabitIds.size).toBe(0)
  expect(useUIStore.getState().manuallySelectedIds.size).toBe(0)
  expect(useUIStore.getState().isSelectMode).toBe(false)
  expect(selection.showBulkDeleteConfirm).toBe(false)
  for (const [action, mutation] of [
    ['confirmBulkDelete', mutations.delete], ['confirmBulkLog', mutations.log], ['confirmBulkSkip', mutations.skip],
  ] as const) {
    act(() => { useUIStore.getState().selectAllHabits(['monthly']) })
    await act(async () => { await selection[action]() })
    expect(mutation).toHaveBeenCalledWith(action === 'confirmBulkDelete' ? ['monthly'] : [{ habitId: 'monthly', date }])
  }
})
