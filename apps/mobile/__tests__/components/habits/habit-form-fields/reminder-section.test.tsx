import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HABIT_REMINDER_PRESETS, buildCreateHabitRequest, buildEmptyHabitFormValues } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) =>
    React.createElement('TextInput', props),
}))

vi.mock('@/components/ui/settings-row', () => ({
  Switch: (props: Record<string, unknown>) => React.createElement('Switch', props),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

const tokens = createTokensV2()

function descendantText(node: TestNode): string | undefined {
  const texts = node.findAll((child) => child.type === 'Text')
  for (const text of texts) {
    if (typeof text.props.children === 'string') return text.props.children
  }
  return undefined
}

function renderSection(overrides: {
  reminderTimes?: number[]
  reminderEnabled?: boolean
  onReminderTimesChange?: (times: number[]) => void
  scheduledReminderCount?: number
  onValidationError?: (message: string) => void
}) {
  const onReminderTimesChange = overrides.onReminderTimesChange ?? vi.fn()
  const onValidationError = overrides.onValidationError ?? vi.fn()
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ReminderSection
        tokens={tokens}
        reminderEnabled={overrides.reminderEnabled ?? true}
        reminderTimes={overrides.reminderTimes ?? []}
        onReminderTimesChange={onReminderTimesChange}
        onToggleReminder={vi.fn()}
        reminderLabel={(minutes) => `${minutes}m`}
        scheduledReminderCount={overrides.scheduledReminderCount}
        onValidationError={onValidationError}
      />,
    )
  })
  return { tree, onReminderTimesChange, onValidationError }
}

function press(tree: TestTree, node: TestNode) {
  TestRenderer.act(() => {
    ;(node.props as { onPress: () => void }).onPress()
  })
}

function buttons(tree: TestTree): TestNode[] {
  return tree.root.findAll((node) => node.props.accessibilityRole === 'button')
}

describe('ReminderSection', () => {
  it('adds an after-due choice to the relative request', () => {
    const { tree, onReminderTimesChange } = renderSection({ reminderTimes: [15] })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminder15minAfter')!)
    expect(onReminderTimesChange).toHaveBeenCalledWith([15, -15])
    const form = { ...buildEmptyHabitFormValues('2025-03-10'), dueTime: '09:00', reminderEnabled: true }
    const request = buildCreateHabitRequest(form, [15, -15], [], [], [])
    expect(request.relativeReminders).toEqual([{ minutesBefore: 15 }, { minutesBefore: -15 }])
  })

  it('hides the reminder body while the toggle is off', () => {
    const { tree } = renderSection({ reminderEnabled: false, reminderTimes: [60] })
    expect(tree.root.findAll((node) => descendantText(node) === '60m')).toHaveLength(0)
  })

  it('renders a chip per reminder time using the label formatter', () => {
    const { tree } = renderSection({ reminderTimes: [60, 30] })
    const chipTexts = tree.root
      .findAll((node) => node.type === 'Text')
      .map((node) => node.props.children)
    expect(chipTexts).toContain('60m')
    expect(chipTexts).toContain('30m')
  })

  it('removes a reminder when multiple remain', () => {
    const { tree, onReminderTimesChange } = renderSection({ reminderTimes: [60, 30] })
    const removeButtons = buttons(tree).filter(
      (node) => node.props.accessibilityLabel === 'habits.form.removeReminder',
    )
    expect(removeButtons[0]!.props.disabled).toBe(false)
    press(tree, removeButtons[0]!)
    expect(onReminderTimesChange).toHaveBeenCalledWith([30])
  })

  it('disables removal when only one reminder is left', () => {
    const { tree } = renderSection({ reminderTimes: [60] })
    const removeButton = buttons(tree).find(
      (node) => node.props.accessibilityLabel === 'habits.form.removeReminder',
    )
    expect(removeButton!.props.disabled).toBe(true)
  })

  it('adds a preset reminder and keeps the list sorted descending', () => {
    const { tree, onReminderTimesChange } = renderSection({ reminderTimes: [] })
    const addButton = buttons(tree).find(
      (node) => descendantText(node) === 'habits.form.reminderAdd',
    )
    press(tree, addButton!)
    const preset = HABIT_REMINDER_PRESETS[0]
    const presetButton = buttons(tree).find(
      (node) => descendantText(node) === preset.key,
    )
    press(tree, presetButton!)
    expect(onReminderTimesChange).toHaveBeenCalledWith([preset.value])
  })

  it('converts a custom hours entry into minutes before adding', () => {
    const { tree, onReminderTimesChange } = renderSection({ reminderTimes: [30] })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderCustom')!)
    const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
    TestRenderer.act(() => {
      ;(input.props as { onChangeText: (value: string) => void }).onChangeText('2')
    })
    const hoursButton = buttons(tree).find(
      (node) => descendantText(node) === 'habits.form.reminderUnitHours',
    )
    press(tree, hoursButton!)
    const confirm = buttons(tree).find((node) => node.props.accessibilityLabel === 'common.add')
    press(tree, confirm!)
    expect(onReminderTimesChange).toHaveBeenCalledWith([120, 30])
  })

  it('ignores a non-positive custom entry', () => {
    const { tree, onReminderTimesChange } = renderSection({ reminderTimes: [30] })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderCustom')!)
    const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
    TestRenderer.act(() => {
      ;(input.props as { onChangeText: (value: string) => void }).onChangeText('0')
    })
    const confirm = buttons(tree).find((node) => node.props.accessibilityLabel === 'common.add')
    press(tree, confirm!)
    expect(onReminderTimesChange).not.toHaveBeenCalled()
  })

  it('saves a custom after-due reminder as a signed offset', () => {
    const { tree, onReminderTimesChange } = renderSection({ reminderTimes: [15] })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderCustom')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAfter')!)
    const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
    TestRenderer.act(() => {
      ;(input.props as { onChangeText: (value: string) => void }).onChangeText('30')
    })
    press(tree, buttons(tree).find((node) => node.props.accessibilityLabel === 'common.add')!)
    expect(onReminderTimesChange).toHaveBeenCalledWith([15, -30])
  })

  it('rejects an after-due offset beyond the allowed range', () => {
    const { tree, onReminderTimesChange, onValidationError } = renderSection({ reminderTimes: [15] })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderCustom')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAfter')!)
    const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
    TestRenderer.act(() => {
      ;(input.props as { onChangeText: (value: string) => void }).onChangeText('1440')
    })
    press(tree, buttons(tree).find((node) => node.props.accessibilityLabel === 'common.add')!)
    expect(onValidationError).toHaveBeenCalledWith('habits.form.invalidRelativeReminder')
    expect(onReminderTimesChange).not.toHaveBeenCalled()
  })

  it('blocks a preset when offsets and clock reminders fill the shared limit', () => {
    const { tree, onReminderTimesChange, onValidationError } = renderSection({
      reminderTimes: Array.from({ length: 14 }, (_, index) => index + 1),
      scheduledReminderCount: 1,
    })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminder1hour')!)
    expect(onValidationError).toHaveBeenCalledWith('habits.form.relativeReminderMax')
    expect(onReminderTimesChange).not.toHaveBeenCalled()
  })

  it('blocks a custom offset when offsets and clock reminders fill the shared limit', () => {
    const { tree, onReminderTimesChange, onValidationError } = renderSection({
      reminderTimes: [15],
      scheduledReminderCount: 14,
    })
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderAdd')!)
    press(tree, buttons(tree).find((node) => descendantText(node) === 'habits.form.reminderCustom')!)
    const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
    TestRenderer.act(() => {
      ;(input.props as { onChangeText: (value: string) => void }).onChangeText('30')
    })
    press(tree, buttons(tree).find((node) => node.props.accessibilityLabel === 'common.add')!)
    expect(onValidationError).toHaveBeenCalledWith('habits.form.relativeReminderMax')
    expect(onReminderTimesChange).not.toHaveBeenCalled()
  })
})
