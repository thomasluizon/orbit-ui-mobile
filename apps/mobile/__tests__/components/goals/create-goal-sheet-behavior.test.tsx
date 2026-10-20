import React from 'react'
import { FlatList } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { PillButton } from '@/components/ui/pill-button'
import { ListRow } from '@/components/ui/list-row'

interface TestNode {
  type: unknown
  props: Record<string, unknown> & {
    onPress: () => void
    onClick: () => Promise<void>
    onChangeText: (value: string) => void
    onChange: (value: string) => void
    data: ReturnType<typeof createMockHabit>[]
    renderItem: (input: { item: ReturnType<typeof createMockHabit>; index: number }) => React.ReactElement
  }
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  findByType: (type: unknown) => TestNode
  findAllByType: (type: unknown) => TestNode[]
}
interface TestTree { root: TestNode; unmount: () => void; update: (element: React.ReactElement) => void }
const TestRenderer = require('react-test-renderer') as {
  create: (element: React.ReactElement) => TestTree
  act: (callback: () => unknown) => Promise<void>
}
const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'created-goal' }),
  showError: vi.fn(),
  pending: false,
  habits: { data: { habitsById: new Map<string, ReturnType<typeof createMockHabit>>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({ BottomSheetAppTextInput: 'GoalInput' }))
vi.mock('@/components/ui/date-field', () => ({ DateField: (props: Record<string, unknown>) => React.createElement('DateField', props) }))

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ id: 'created-goal' })
  mocks.showError.mockClear()
  mocks.habits.data.habitsById.clear()
  mocks.habits.isLoading = false
  mocks.habits.isError = false
  mocks.habits.refetch.mockClear()
  mocks.pending = false
  sheetTestControls.defer(false)
})

function button(tree: TestTree, label: string) {
  return tree.root.findAllByType(PillButton).find((node) => node.props.children === label)!
}

async function fillGoal(tree: TestTree) {
  for (const [label, value] of [['goals.form.title', 'Read every day'], ['goals.form.targetValue', '12'], ['goals.form.unit', 'books']]) {
    await TestRenderer.act(() => tree.root.findAll((node) => node.type === 'GoalInput' && node.props.accessibilityLabel === label)[0]!.props.onChangeText(value!))
  }
}

async function mount(onClose = vi.fn(), initialHabitIds?: string[]) {
  let tree!: TestTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<CreateGoalSheet open onClose={onClose} initialHabitIds={initialHabitIds} />) })
  return tree
}

async function openHabitPicker(tree: TestTree) {
  await TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node) => node.props.title === 'goals.linkedHabits')!.props.onClick())
}

describe('goal creation with habits', () => {
  it('rejects empty, negative and nonnumeric targets, missing units and missing titles', async () => {
    for (const [target, unit, title] of [['', 'books', 'Read'], ['-1', 'books', 'Read'], ['abc', 'books', 'Read'], ['2', '', 'Read'], ['2', 'books', '']]) {
      const tree = await mount()
      for (const [label, value] of [['goals.form.title', title], ['goals.form.targetValue', target], ['goals.form.unit', unit]]) {
        await TestRenderer.act(() => tree.root.findAll((node) => node.type === 'GoalInput' && node.props.accessibilityLabel === label)[0]!.props.onChangeText(value!))
      }
      await TestRenderer.act(async () => { await button(tree, 'goals.create').props.onClick() })
      expect(mocks.create).not.toHaveBeenCalled()
      expect(mocks.showError).toHaveBeenCalled()
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it('saves the selected habits and deadline and waits for native dismissal', async () => {
    const habit = createMockHabit({ id: 'habit-reading', title: 'Read' })
    mocks.habits.data.habitsById.set(habit.id, habit)
    const onClose = vi.fn()
    const tree = await mount(onClose)
    await fillGoal(tree)
    await openHabitPicker(tree)
    const habitRow = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === habit.title)[0]!
    await TestRenderer.act(() => habitRow.props.onPress())
    await TestRenderer.act(() => tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss').at(-1)!.props.onPress())
    const addDeadline = tree.root.findAll((node) => node.type === 'Pressable' && node.findAll((child) => child.type === 'Text' && child.props.children === 'goals.form.addDeadline').length > 0)[0]!
    await TestRenderer.act(() => addDeadline.props.onPress())
    await TestRenderer.act(() => tree.root.findAll((node) => node.type === 'DateField')[0]!.props.onChange('2099-12-01'))
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => { await button(tree, 'goals.create').props.onClick() })
    expect(mocks.create).toHaveBeenCalledWith({ title: 'Read every day', type: 'Standard', targetValue: 12, unit: 'books', deadline: '2099-12-01', habitIds: [habit.id] })
    expect(onClose).not.toHaveBeenCalled()
    await TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('finishes a successful save when native dismissal rejects', async () => {
    const onClose = vi.fn()
    const tree = await mount(onClose)
    await fillGoal(tree)
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => { await button(tree, 'goals.create').props.onClick() })
    await TestRenderer.act(() => sheetTestControls.rejectDismissal())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('saves without the current habit when it is deselected', async () => {
    const habit = createMockHabit({ id: 'habit-reading', title: 'Read' })
    mocks.habits.data.habitsById.set(habit.id, habit)
    const tree = await mount(vi.fn(), [habit.id])
    await fillGoal(tree)
    await openHabitPicker(tree)
    await TestRenderer.act(() => tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === habit.title)[0]!.props.onPress())
    await TestRenderer.act(() => button(tree, 'common.done').props.onClick())
    await TestRenderer.act(() => button(tree, 'goals.create').props.onClick())
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ habitIds: [] }))
  })

  it('shows habit loading, retries errors and returns to the same draft', async () => {
    const onClose = vi.fn()
    mocks.habits.isLoading = true
    const tree = await mount(onClose)
    await fillGoal(tree)
    await openHabitPicker(tree)
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'common.loading').length).toBeGreaterThan(0)
    mocks.habits.isLoading = false
    mocks.habits.isError = true
    await TestRenderer.act(() => tree.update(<CreateGoalSheet open onClose={onClose} />))
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'goals.form.habitsError')).toHaveLength(1)
    await TestRenderer.act(() => button(tree, 'common.retry').props.onClick())
    expect(mocks.habits.refetch).toHaveBeenCalledOnce()
    mocks.habits.isError = false
    await TestRenderer.act(() => tree.update(<CreateGoalSheet open onClose={onClose} />))
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'habits.emptyState')).toHaveLength(1)
    await TestRenderer.act(() => button(tree, 'common.done').props.onClick())
    expect(tree.root.findAll((node) => node.type === 'GoalInput' && node.props.accessibilityLabel === 'goals.form.title')[0]!.props.value).toBe('Read every day')
  })

  it('keeps a failed save visible and retains the draft for retry', async () => {
    mocks.create.mockRejectedValueOnce(new Error('save failed'))
    const onClose = vi.fn()
    const tree = await mount(onClose)
    await fillGoal(tree)
    await TestRenderer.act(async () => { await button(tree, 'goals.create').props.onClick() })
    expect(onClose).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'alert').at(-1)!.props.children).toBe('goals.form.createError')
    expect(tree.root.findAll((node) => node.type === 'GoalInput' && node.props.accessibilityLabel === 'goals.form.title')[0]!.props.value).toBe('Read every day')
    await TestRenderer.act(async () => { await button(tree, 'goals.create').props.onClick() })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('enforces habit capacity and allows deselection', async () => {
    const habits = Array.from({ length: 21 }, (_, index) => createMockHabit({ id: `habit-${index}`, title: `Habit ${index}` }))
    mocks.habits.data.habitsById = new Map(habits.map((habit) => [habit.id, habit]))
    const tree = await mount(vi.fn(), habits.slice(0, 20).map((habit) => habit.id))
    await openHabitPicker(tree)
    const search = tree.root.findAll((node) => node.type === 'GoalInput' && node.props.accessibilityLabel === 'goals.form.searchHabits')[0]!
    await TestRenderer.act(() => search.props.onChangeText('Habit 20'))
    const renderFirstRow = async () => {
      const list = tree.root.findByType(FlatList)
      let row!: TestTree
      await TestRenderer.act(() => { row = TestRenderer.create(list.props.renderItem({ item: list.props.data[0]!, index: 0 })) })
      return row
    }
    const blocked = await renderFirstRow()
    expect(blocked.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Habit 20')[0]!.props.disabled).toBe(true)
    await TestRenderer.act(() => search.props.onChangeText('Habit 0'))
    const selected = await renderFirstRow()
    await TestRenderer.act(() => selected.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Habit 0')[0]!.props.onPress())
    await TestRenderer.act(() => search.props.onChangeText('Habit 20'))
    const enabled = await renderFirstRow()
    expect(enabled.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Habit 20')[0]!.props.disabled).toBe(false)
  })

  it('retains both action labels while a save is pending', async () => {
    mocks.pending = true
    const tree = await mount()
    expect(button(tree, 'goals.create').props).toMatchObject({ disabled: true, loading: true, children: 'goals.create' })
    expect(button(tree, 'common.cancel').props.disabled).toBe(true)
  })
})
