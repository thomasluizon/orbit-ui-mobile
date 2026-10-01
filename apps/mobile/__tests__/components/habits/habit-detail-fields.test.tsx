import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { makeHabitDetailScopedChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailSchedule } from '@/components/habits/habit-detail-fields'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string | null) => time ?? '', uses24HourClock: true }),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true } }) }))

vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))

vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))

vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))

type PressableNode = Readonly<{
  props: {
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { checked?: boolean; selected?: boolean }
    style: (state: { pressed: boolean }) => StyleProp<ViewStyle>
    onPress: () => void
  }
}>

type TestTree = Readonly<{
  root: {
    findAllByType(type: unknown): PressableNode[]
    findByProps(props: Record<string, unknown>): { props: { onClick: () => void } }
    findAll(predicate: (node: { props: { children?: unknown; onClick?: () => void } }) => boolean): { props: { onClick: () => void } }[]
  }
}>

const renderer = require('react-test-renderer') as {
  create(element: React.ReactElement): TestTree
  act(callback: () => Promise<void>): Promise<void>
  act(callback: () => void): void
}

const tokens = createTokensV2('purple', 'dark')

function renderScheduleEditor(onPatch: (patch: unknown) => Promise<boolean>, daily = false) {
  let tree: TestTree | undefined
  renderer.act(() => {
    tree = renderer.create(
      <HabitDetailSchedule
        habit={{ ...makeHabitDetailScopedChild('2026-09-29'), frequencyQuantity: daily ? 1 : 2 }}
        summary="Every day"
        open={!daily}
        tokens={tokens}
        onSave={(patch) => { void onPatch(patch) }}
        onToggle={() => {}}
        onCancel={() => {}}
      />,
    )
  })
  if (!tree) throw new Error('The renderer produced no tree')
  return tree
}

function control(tree: TestTree, label: string) {
  const found = tree.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)
  if (!found) throw new Error(`Missing control: ${label}`)
  return found
}

function fill(tree: TestTree, label: string, pressed: boolean) {
  return StyleSheet.flatten(control(tree, label).props.style({ pressed }))
}

describe('HabitDetailSchedule schedule chips', () => {
  it('fills a pressed frequency unit inside its pill and keeps the chosen unit marked', () => {
    const tree = renderScheduleEditor(vi.fn().mockResolvedValue(true))

    expect(control(tree, 'habits.form.unitDay').props.accessibilityState).toMatchObject({ checked: true })
    expect(fill(tree, 'habits.form.unitDay', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.primaryDim })
    expect(fill(tree, 'habits.form.unitWeek', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.hairline, backgroundColor: tokens.bgWell })
    expect(fill(tree, 'habits.form.unitWeek', true).backgroundColor).toBe(tokens.bgHover)
    expect(fill(tree, 'habits.form.unitDay', true).backgroundColor).toBe(tokens.bgHover)
  })

  it('fills a pressed weekday inside its pill and saves the days left selected', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const tree = renderScheduleEditor(onPatch, true)

    renderer.act(() => control(tree, 'dates.daysLong.sunday').props.onPress())
    expect(fill(tree, 'dates.daysLong.sunday', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.primaryDim })
    expect(fill(tree, 'dates.daysLong.monday', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.primaryDim })
    expect(fill(tree, 'dates.daysLong.sunday', true).backgroundColor).toBe(tokens.bgHover)
    expect(fill(tree, 'dates.daysLong.monday', true).backgroundColor).toBe(tokens.bgHover)

    await renderer.act(async () => { await Promise.resolve() })
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    }))
  })
})
