import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { addDays, format } from 'date-fns'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from '@/components/ui/chip'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { RadioRow } from '@/components/ui/select-check'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { makeHabitDetailScopedChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import { buildHabitUnderstandingLabels, formatLocaleDate } from '@orbit/shared/utils'
import { TimeField } from '@/components/ui/time-field'
import { DateField } from '@/components/ui/date-field'
import { GoalTypeSelector } from '@/components/habits/create-goal-from-habit/goal-type-selector'
import { createStyles as createGoalStyles } from '@/components/habits/create-goal-from-habit/styles'
import { HabitDetailSchedule } from '@/components/habits/habit-detail-fields'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { ProfilePreferencesContent } from '@/app/(tabs)/profile/_components/profile-preferences-content'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'

vi.unmock('@/components/ui/date-field')

vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))
vi.mock('@/components/profile/preferences-sections', () => ({ PreferencePickerSheet: () => null }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true, weekStartDay: 1 } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/app/use-preference-controls', () => ({ usePreferenceControls: () => ({ selectedLanguage: 'en', currentTheme: 'dark', currentScheme: 'orange', activePicker: null, setActivePicker: vi.fn(), handleThemeModeChange: vi.fn(), timeZoneMutation: { mutate: vi.fn() }, weekStartMutation: { mutate: vi.fn() }, clockFormatMutation: { mutate: vi.fn() } }) }))

const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('orange', 'dark')

function ringCount(host: { props: { style: unknown }; findAllByType: (type: string) => { props: { style: unknown } }[] }) {
  return [...new Set([host, ...host.findAllByType('View')])].reduce((count, node) => {
    const style = StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style)
    return count + (style?.outlineWidth > 0 ? 1 : 0) + (style?.borderWidth > 0 && [tokens.primary, tintFromPrimary(tokens, 0.45)].includes(style.borderColor) ? 1 : 0)
  }, 0)
}

describe('selected controls share one focus indicator', () => {
  for (const selected of [false, true]) {
    for (const variant of ['default', 'period'] as const) {
      it(`Chip ${variant}, selected ${selected}`, () => {
        verify(<Chip active={selected} variant={variant}>Chip</Chip>, selected)
      })
    }
    for (const fullWidth of [false, true]) {
      it(`SegmentedControl fullWidth ${fullWidth}, selected ${selected}`, () => {
        verify(<SegmentedControl label="View" fullWidth={fullWidth} value={selected ? 'one' : 'two'} options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} onChange={vi.fn()} />, selected)
      })
    }
    it(`RadioRow selected ${selected}`, () => {
      verify(<RadioRow label="Radio" selected={selected} onSelect={vi.fn()} />, selected)
    })
  }
  it.each([false, true])('track uses a padded borderless well, fullWidth %s', (fullWidth) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<SegmentedControl label="View" fullWidth={fullWidth} value="one" options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} onChange={vi.fn()} />) })
    const group = tree!.root.findByProps({ accessibilityRole: 'radiogroup' })
    expect(StyleSheet.flatten(group.props.style)).toMatchObject({ padding: 4, gap: 4, borderRadius: 12, backgroundColor: tokens.bgWell })
    expect(StyleSheet.flatten(group.props.style).borderWidth ?? 0).toBe(0)
    for (const option of tree!.root.findAllByType('Pressable')) {
      const style = typeof option.props.style === 'function' ? option.props.style({ pressed: false }) : option.props.style
      expect(StyleSheet.flatten(style).paddingHorizontal).toBeGreaterThanOrEqual(8)
    }
    TestRenderer.act(() => tree!.unmount())
  })
})

function verify(element: React.ReactNode, selected: boolean) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  const host = () => tree!.root.findAllByType('Pressable')[0]
  expect(ringCount(host())).toBe(selected ? 1 : 0)
  const target = {}
  const event = { target, currentTarget: target }
  TestRenderer.act(() => host().props.onFocus?.(event))
  expect(ringCount(host())).toBe(1)
  TestRenderer.act(() => host().props.onBlur?.(event))
  expect(ringCount(host())).toBe(selected ? 1 : 0)
  TestRenderer.act(() => tree!.unmount())
}

function verifyAllChoices(tree: ReturnType<typeof TestRenderer.create>) {
  const choices = () => tree.root.findAllByType('Pressable').filter((node: { props: { accessibilityState?: { selected?: boolean; checked?: boolean } } }) => {
    const state = node.props.accessibilityState
    return state?.selected !== undefined || state?.checked !== undefined
  })
  expect(choices().length).toBeGreaterThan(1)
  for (let index = 0; index < choices().length; index += 1) {
    let choice = choices()[index]
    const selected = Boolean(choice.props.accessibilityState.selected || choice.props.accessibilityState.checked)
    expect(ringCount(choice)).toBe(selected ? 1 : 0)
    const target = {}
    const event = { target, currentTarget: target }
    TestRenderer.act(() => choice.props.onFocus?.(event))
    choice = choices()[index]
    expect(ringCount(choice)).toBe(1)
    TestRenderer.act(() => choice.props.onBlur?.(event))
    choice = choices()[index]
    const settledSelected = Boolean(choice.props.accessibilityState.selected || choice.props.accessibilityState.checked)
    expect(ringCount(choice)).toBe(settledSelected ? 1 : 0)
  }
}

it('TimeField options use one indicator with and without selection', () => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<TimeField label="Time" value="09:00" onChange={vi.fn()} />) })
  TestRenderer.act(() => tree!.root.findAllByType('Pressable')[0].props.onPress())
  verifyAllChoices(tree)
  TestRenderer.act(() => tree!.unmount())
})

it.each([false, true])('emoji options and category chips share the focus rule, category selected %s', (selectCategory) => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<HabitEmojiSelector selectedEmoji="😀" tokens={tokens} styles={createStyles(tokens)} onSelect={vi.fn()} />) })
  TestRenderer.act(() => tree!.root.findAllByType('Pressable')[0].props.onPress())
  if (selectCategory) {
    const category = tree!.root.findAllByType('Pressable').find((node: { props: { accessibilityState?: { selected?: boolean } }; findAllByType: (type: string) => unknown[] }) => node.props.accessibilityState?.selected === false && node.findAllByType('Text').length === 1)
    TestRenderer.act(() => category.props.onPress())
  }
  verifyAllChoices(tree)
  TestRenderer.act(() => tree!.unmount())
})

it('theme pills keep the selected tint while focus takes the perimeter', () => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfilePreferencesContent profile={createMockProfile()} patchProfile={vi.fn()} />) })
  verifyAllChoices(tree)
  const unselected = tree!.root.findAllByType('Pressable').find((node: { props: { accessibilityRole?: string; accessibilityState?: { selected?: boolean } } }) => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.selected === false)
  expect(StyleSheet.flatten(unselected.props.style({ pressed: true })).backgroundColor).toBe(tokens.bgHover)
  expect(ringCount(unselected)).toBe(0)
  TestRenderer.act(() => tree!.unmount())
})

it.each(['empty', 'today', 'tomorrow'] as const)('DateField day focus replaces the today perimeter, value %s', (value) => {
  const today = new Date()
  const tomorrow = addDays(today, 1)
  const selectedDate = value === 'empty' ? '' : format(value === 'today' ? today : tomorrow, 'yyyy-MM-dd')
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<DateField value={selectedDate} onChange={vi.fn()} />) })
  TestRenderer.act(() => tree!.root.findAllByType('Pressable')[0].props.onPress())
  for (const day of [today, tomorrow]) {
    const label = formatLocaleDate(day, 'en', { month: 'long', day: 'numeric', year: 'numeric' })
    const control = () => tree!.root.findAllByType('Pressable').find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === label)
    const restingRings = day === today && value !== 'today' ? 1 : 0
    expect(ringCount(control())).toBe(restingRings)
    const target = {}
    const event = { target, currentTarget: target }
    TestRenderer.act(() => control().props.onFocus?.(event))
    expect(ringCount(control())).toBe(1)
    expect(control().findAllByType('View').filter((node: { props: { style: StyleProp<ViewStyle> } }) => StyleSheet.flatten(node.props.style).outlineWidth === 2)).toHaveLength(1)
    TestRenderer.act(() => control().props.onBlur?.(event))
    expect(ringCount(control())).toBe(restingRings)
  }
  TestRenderer.act(() => tree!.unmount())
})

it.each([false, true])('habit detail schedule choices share one indicator, editor %s', (open) => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailSchedule habit={{ ...makeHabitDetailScopedChild('2026-09-04'), days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 }} tokens={tokens} summary="Daily" open={open} onToggle={vi.fn()} onCancel={vi.fn()} onSave={vi.fn()} />) })
  verifyAllChoices(tree)
  TestRenderer.act(() => tree!.unmount())
})

it('habit form day pills share one indicator', () => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<HabitUnderstanding value="Read" emoji="" days={['Monday']} dayOptions={[{ value: 'Monday', label: 'Mon', accessibleLabel: 'Monday' }, { value: 'Tuesday', label: 'Tue', accessibleLabel: 'Tuesday' }]} quantity={1} mode="fixed" sentence={null} consumed={[]} labels={buildHabitUnderstandingLabels((key) => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} />) })
  verifyAllChoices(tree)
  TestRenderer.act(() => tree!.unmount())
})

it.each([false, true])('disabled RadioRow retains its selection perimeter, selected %s', (selected) => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<RadioRow label="Radio" selected={selected} disabled reason="Sending" />) })
  const row = tree!.root.findAllByType('View').find((node: { props: { accessibilityRole?: string } }) => node.props.accessibilityRole === 'radio')
  expect(ringCount(row)).toBe(selected ? 1 : 0)
  TestRenderer.act(() => tree!.unmount())
})

it.each(['Standard', 'Streak'] as const)('goal type choices share one indicator, selected %s', (goalType) => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<GoalTypeSelector styles={createGoalStyles(tokens)} goalType={goalType} onTypeChange={vi.fn()} />) })
  verifyAllChoices(tree)
  TestRenderer.act(() => tree!.unmount())
})
