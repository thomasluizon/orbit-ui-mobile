import { controlStyle, expectPressFill } from '@/__tests__/support/press-feedback'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, type ViewStyle } from 'react-native'
import { HabitRepeatInterval, HabitScheduleCorrections } from '@/components/habits/habit-form-fields/habit-understanding'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { createTokensV2, radius } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'light' }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
  update(element: React.ReactNode): void
}
const TestRenderer = require('react-test-renderer') as {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const tokens = createTokensV2('orange', 'light')

const labels = {
  field: 'Describe the habit',
  placeholder: 'Run every weekday',
  understood: 'Orbit understood',
  unresolved: 'Choose a schedule',
  days: 'Active days',
  less: 'Less often',
  more: 'More often',
  count: (count: number) => `${count === 1 ? 'time' : 'times'} a week`,
  repeat: (count: number) => (count === 1 ? 'Every week' : `Every ${count} weeks`),
  repeatLess: 'Repeat less often',
  repeatMore: 'Repeat more often',
  proposed: 'Proposed by Orbit',
}

function renderCorrections(overrides: Partial<React.ComponentProps<typeof HabitScheduleCorrections>> = {}) {
  const props: React.ComponentProps<typeof HabitScheduleCorrections> = {
    days: [],
    dayOptions: [
      { value: 'Monday', label: 'S', accessibleLabel: 'Segunda-feira' },
      { value: 'Tuesday', label: 'T', accessibleLabel: 'Terça-feira' },
    ],
    quantity: 1,
    showCount: true,
    onToggleDay: vi.fn(),
    onQuantityChange: vi.fn(),
    labels,
    ...overrides,
  }
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitScheduleCorrections {...props} />)
  })
  return { tree, props }
}

function button(tree: TestTree, label: string): TestNode {
  return tree.root.findAll((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0]!
}

const press = (tree: TestTree, label: string) => TestRenderer.act(() => (button(tree, label).props.onPress as () => void)())

describe('the count stepper of the repeat step', () => {
  it('keeps the weekly quantity positive and imposes no ceiling', () => {
    const lower = renderCorrections({ quantity: 1 })
    press(lower.tree, labels.less)
    expect(lower.props.onQuantityChange).toHaveBeenCalledWith(1)

    const upper = renderCorrections({ quantity: 7 })
    press(upper.tree, labels.more)
    expect(upper.props.onQuantityChange).toHaveBeenCalledWith(8)
    press(upper.tree, labels.less)
    expect(upper.props.onQuantityChange).toHaveBeenLastCalledWith(6)
  })

  it('locks the stepper and the weekdays while the schedule is locked', () => {
    const { tree, props } = renderCorrections({ scheduleLocked: true })
    expect(button(tree, labels.less).props.disabled).toBe(true)
    expect(button(tree, labels.more).props.disabled).toBe(true)
    expect(button(tree, 'Segunda-feira').props.disabled).toBe(true)
    expect(props.onQuantityChange).not.toHaveBeenCalled()
  })
})

describe('schedule press fills', () => {
  it('fills selected and idle weekday controls', () => {
    const { tree } = renderCorrections({ days: ['Monday'] })
    for (const label of ['Segunda-feira', 'Terça-feira']) {
      const target = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]!
      const box = StyleSheet.flatten(target.props.style as ViewStyle)
      expect(box.minWidth).toBe(24)
      expect(box.minHeight).toBe(48)
      const resting = controlStyle(target).backgroundColor
      TestRenderer.act(() => (target.props.onPressIn as () => void)())
      expect(controlStyle(target as never).backgroundColor).toBe(tokens.bgHover)
      TestRenderer.act(() => (target.props.onPressOut as () => void)())
      expect(controlStyle(target as never).backgroundColor).toBe(resting)
    }
  })

  it('fills both count controls', () => {
    const { tree } = renderCorrections({ quantity: 2 })
    for (const label of [labels.less, labels.more]) expectPressFill(tree, label, tokens.bgHover, radius.full)
  })
})

describe('cadence correction visibility', () => {
  it.each([
    { showCount: false, hasCount: false },
    { showCount: true, hasCount: true },
  ])('keeps the weekdays visible with the count: $hasCount', ({ showCount, hasCount }) => {
    const { tree, props } = renderCorrections({ showCount })
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'radiogroup')).toHaveLength(0)
    expect(button(tree, 'Segunda-feira')).toBeDefined()
    expect(tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === labels.more)).toHaveLength(hasCount ? 1 : 0)
    expect(tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === labels.repeatMore)).toHaveLength(0)
    press(tree, 'Segunda-feira')
    expect(props.onToggleDay).toHaveBeenCalledWith('Monday')
  })

  it('renders nothing when hidden', () => {
    const { tree } = renderCorrections({ hidden: true })
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0)
  })

  it('shows every weekday selected for a daily repeat', () => {
    const { tree } = renderCorrections({ daily: true, days: [] })
    expect(['Segunda-feira', 'Terça-feira'].every((label) => (button(tree, label).props.accessibilityState as { selected: boolean }).selected)).toBe(true)
  })
})

describe('the interval stepper of the repeat step', () => {
  const renderInterval = (intervalWeeks: number) => {
    const onIntervalWeeksChange = vi.fn()
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitRepeatInterval visible intervalWeeks={intervalWeeks} onIntervalWeeksChange={onIntervalWeeksChange} labels={labels} />)
    })
    return { tree, onIntervalWeeksChange }
  }

  it('disables less at one week and more at the maximum', () => {
    const lowest = renderInterval(1)
    expect(button(lowest.tree, labels.repeatLess).props.disabled).toBe(true)
    expect(button(lowest.tree, labels.repeatMore).props.disabled).toBe(false)
    const highest = renderInterval(MAX_HABIT_INTERVAL_WEEKS)
    expect(button(highest.tree, labels.repeatMore).props.disabled).toBe(true)
    expect(button(highest.tree, labels.repeatLess).props.disabled).toBe(false)
  })

  it('moves the interval by one week and stays in range', () => {
    const middle = renderInterval(3)
    press(middle.tree, labels.repeatMore)
    expect(middle.onIntervalWeeksChange).toHaveBeenLastCalledWith(4)
    press(middle.tree, labels.repeatLess)
    expect(middle.onIntervalWeeksChange).toHaveBeenLastCalledWith(2)
    const highest = renderInterval(MAX_HABIT_INTERVAL_WEEKS)
    TestRenderer.act(() => (button(highest.tree, labels.repeatMore).props.onPress as () => void)())
    expect(highest.onIntervalWeeksChange).toHaveBeenLastCalledWith(MAX_HABIT_INTERVAL_WEEKS)
  })
})
