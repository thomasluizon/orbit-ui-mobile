import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

interface HabitPickerOption {
  id: string
  title: string
  parentTitle?: string
}

const state = vi.hoisted(() => ({
  options: [] as HabitPickerOption[],
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    buildHabitPickerOptions: () => state.options,
    filterHabitPickerOptions: (options: HabitPickerOption[], query: string) =>
      query ? options.filter((option) => option.title.toLowerCase().includes(query.toLowerCase())) : options,
  }
})

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { topLevelHabits: [], childrenByParent: new Map(), habitsById: new Map() } }),
  EMPTY_NORMALIZED_HABITS: [],
  EMPTY_CHILDREN_BY_PARENT: new Map(),
  EMPTY_HABITS_BY_ID: new Map(),
}))

import { HabitMultiSelect } from '@/app/social/_components/habit-multi-select'

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

function render(selectedIds: string[], onChange: (ids: string[]) => void) {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitMultiSelect selectedIds={selectedIds} onChange={onChange} />)
  })
  return tree
}

function texts(tree: TestTree): unknown[] {
  return tree.root.findAll((node) => node.type === 'Text').map((node) => node.props.children)
}

function buttonByText(tree: TestTree, text: string): TestNode | undefined {
  return tree.root.findAll(
    (node) =>
      node.props?.accessibilityRole === 'button' &&
      node.findAll((child) => child.type === 'Text' && child.props.children === text).length > 0,
  )[0]
}

function buttonByLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => node.props?.accessibilityRole === 'button' && node.props.accessibilityLabel === label,
  )[0]
}

function press(node: TestNode | undefined) {
  if (!node) throw new Error('no node to press')
  TestRenderer.act(() => {
    ;(node.props as { onPress: () => void }).onPress()
  })
}

function setQuery(tree: TestTree, value: string) {
  const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
  TestRenderer.act(() => {
    ;(input.props as { onChangeText: (value: string) => void }).onChangeText(value)
  })
}

describe('HabitMultiSelect', () => {
  beforeEach(() => {
    state.options = [
      { id: 'h1', title: 'Run' },
      { id: 'h2', title: 'Read', parentTitle: 'Learn' },
    ]
  })

  it('renders the empty state when there are no habit options', () => {
    state.options = []
    const tree = render([], vi.fn())
    expect(texts(tree)).toContain('social.buddies.noHabits')
  })

  it('selects an unselected habit', () => {
    const onChange = vi.fn()
    const tree = render([], onChange)
    press(buttonByText(tree, 'Run'))
    expect(onChange).toHaveBeenCalledWith(['h1'])
  })

  it('removes a selected habit from its chip', () => {
    const onChange = vi.fn()
    const tree = render(['h1'], onChange)
    press(buttonByLabel(tree, 'social.buddies.removeHabit:{"title":"Run"}'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('disables and ignores an unselected habit once the cap is reached', () => {
    state.options = Array.from({ length: 11 }, (_unused, index) => ({ id: `o${index}`, title: `o${index}` }))
    const selected = Array.from({ length: 10 }, (_unused, index) => `o${index}`)
    const onChange = vi.fn()
    const tree = render(selected, onChange)
    const overflowRow = buttonByText(tree, 'o10')
    expect(overflowRow!.props.accessibilityState).toMatchObject({ selected: false, disabled: true })
    expect(overflowRow!.props.disabled).toBe(true)
    press(overflowRow)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('filters by query and shows the no-match state', () => {
    const onChange = vi.fn()
    const tree = render([], onChange)
    setQuery(tree, 'zzz')
    expect(texts(tree)).toContain('social.buddies.noHabitMatch')
  })

  it('clears the query through the clear button', () => {
    const tree = render([], vi.fn())
    setQuery(tree, 'Run')
    expect(texts(tree)).not.toContain('Read')
    press(buttonByLabel(tree, 'common.clear'))
    expect(texts(tree)).toContain('Read')
  })

  it('truncates the list and reports the hidden overflow count', () => {
    state.options = Array.from({ length: 61 }, (_unused, index) => ({ id: `h${index}`, title: `Habit ${index}` }))
    const tree = render([], vi.fn())
    expect(texts(tree)).toContain('social.buddies.moreHabits:{"count":1}')
  })
})
