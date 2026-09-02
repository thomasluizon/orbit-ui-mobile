import React from 'react'
import { AccessibilityInfo, Animated } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitTagChip } from '@/components/habits/habit-form-fields/habit-tag-chip'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/components/ui/icons', () => ({
  PenSquare: (props: Record<string, unknown>) => React.createElement('PenSquare', props),
  X: (props: Record<string, unknown>) => React.createElement('X', props),
}))

interface TestNode {
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestTree {
  root: TestNode
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void>): Promise<void>
  act(callback: () => void): void
}

const TestRenderer: TestRendererApi = require('react-test-renderer')
const tokens = createTokensV2()
const styles = createStyles(tokens)

function renderChip(overrides: Partial<React.ComponentProps<typeof HabitTagChip>> = {}) {
  const props: React.ComponentProps<typeof HabitTagChip> = {
    tag: { id: 'tag-1', name: 'Health' },
    selected: false,
    atLimit: false,
    disabled: false,
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    editAriaLabel: 'Edit Health',
    deleteAriaLabel: 'Delete Health',
    styles,
    tokens,
    ...overrides,
  }
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitTagChip {...props} />)
  })
  return { tree, props }
}

function button(tree: TestTree, label: string): TestNode {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label,
  )[0]!
}

describe('HabitTagChip mobile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the selection pop and forwards all three actions', async () => {
    const start = vi.fn()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    vi.spyOn(Animated, 'timing').mockReturnValue({ start } as never)
    const { tree, props } = renderChip({ selected: true })

    await TestRenderer.act(async () => {
      await Promise.resolve()
    })
    expect(Animated.timing).toHaveBeenCalledWith(
      expect.anything(),
      { duration: 160, toValue: 1, useNativeDriver: true },
    )
    expect(start).toHaveBeenCalledOnce()

    const toggle = button(tree, 'Health')
    const edit = button(tree, 'Edit Health')
    const remove = button(tree, 'Delete Health')
    ;(toggle.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true })
    ;(edit.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true })
    ;(remove.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false })
    TestRenderer.act(() => {
      ;(toggle.props.onPress as () => void)()
      ;(edit.props.onPress as () => void)()
      ;(remove.props.onPress as () => void)()
    })
    expect(props.onToggle).toHaveBeenCalledOnce()
    expect(props.onEdit).toHaveBeenCalledOnce()
    expect(props.onDelete).toHaveBeenCalledOnce()
  })

  it('locks only an unselected chip at the tag limit', () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const timing = vi.spyOn(Animated, 'timing')
    const { tree } = renderChip({ atLimit: true, disabled: true })
    expect(button(tree, 'Health').props.disabled).toBe(true)
    expect(button(tree, 'Edit Health').props.disabled).toBe(true)
    expect(button(tree, 'Delete Health').props.disabled).toBe(true)
    expect(timing).not.toHaveBeenCalled()
  })
})
