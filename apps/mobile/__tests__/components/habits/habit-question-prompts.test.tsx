import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitListConfirmDialogs } from '@/components/habit-list/confirm-dialogs'
import { ChecklistCompletePrompt, LogDatePrompt } from '@/components/habits/habit-detail-prompts'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const date = '2026-09-12'
const root = createMockHabit({ id: 'root', title: 'Morning', scheduledDates: [date] })
const parent = createMockHabit({ id: 'parent', title: 'Stretch', parentId: root.id, scheduledDates: [date] })
const promptOf = (ancestorHabits: typeof root[]) => {
  const ancestors = ancestorHabits.map((habit) => ({ habit, mode: 'log' as const }))
  return { ...ancestors[0]!, childId: 'child', ancestors, selectedCount: 1, date }
}
const handlers = () => ({
  onSelectParentAncestor: vi.fn(), onConfirmDelete: vi.fn(), onCancelDelete: vi.fn(), onDeleteClosed: vi.fn(),
  onConfirmDuplicate: vi.fn(), onCancelDuplicate: vi.fn(), onCancelParent: vi.fn(), onConfirmParent: vi.fn(),
})
function mount(element: React.ReactElement) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree
}
function dialogs(spies: ReturnType<typeof handlers>, props: Partial<React.ComponentProps<typeof HabitListConfirmDialogs>>) {
  return mount(<HabitListConfirmDialogs t={(key) => key} parentPrompt={null} showDeleteConfirm={false} deletePending={false} deleteHabitName="" deleteDescendantCount={0} duplicateHabitName={null} {...spies} {...props} />)
}
const hosts = (tree: ReturnType<typeof TestRenderer.create>, testID: string): ReactTestInstance[] => tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === testID)
const options = (tree: ReturnType<typeof TestRenderer.create>) => hosts(tree, 'option-card')
const answers = (tree: ReturnType<typeof TestRenderer.create>): ReactTestInstance[] => tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && /^button-(ghost|primary)-sm$/.test(String(node.props.testID)) && typeof node.props.onPress === 'function')
const labels = (tree: ReturnType<typeof TestRenderer.create>) => sheetSlotButtons(tree.root, 'SheetActions')
const sheetTitle = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'Sheet').map((node: ReactTestInstance) => node.props.title)
const sentences = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'Text' && node.props.children === 'habits.checklistCompleteMessage').map((node: ReactTestInstance) => node.props.children as string)
const press = (node: ReactTestInstance) => TestRenderer.act(() => { (node.props.onPress as () => void)() })
const mascots = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node: ReactTestInstance) => node.props.testID === 'orbit-mascot')

describe('Android habit prompts as one question', () => {
  it('asks the parent question as the sheet title, with the two answers as the sheet actions, the positive answer last', () => {
    const spies = handlers()
    const tree = dialogs(spies, { parentPrompt: promptOf([parent]) })
    expect(sheetTitle(tree)).toEqual(['habits.autoLogParentMessage'])
    expect(labels(tree)).toEqual(['common.notNow', 'habits.autoLogParentConfirm'])
    expect(options(tree)).toHaveLength(0)
    expectSmallSheetActions(tree.root)
    expect(mascots(tree)).toHaveLength(0)
    press(answers(tree)[1]!)
    expect(spies.onConfirmParent).toHaveBeenCalledOnce()
    expect(spies.onCancelParent).not.toHaveBeenCalled()
  })

  it('sends the cancel of the parent prompt from the first answer', () => {
    const spies = handlers()
    const tree = dialogs(spies, { parentPrompt: promptOf([parent]) })
    press(answers(tree)[0]!)
    expect(spies.onCancelParent).toHaveBeenCalledOnce()
    expect(spies.onConfirmParent).not.toHaveBeenCalled()
  })

  it('keeps the ancestor choices as the free path with its own action', () => {
    const spies = handlers()
    const tree = dialogs(spies, { parentPrompt: promptOf([parent, root]) })
    const boxes: ReactTestInstance[] = tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')
    expect(boxes).toHaveLength(2)
    press(boxes[1]!)
    expect(spies.onSelectParentAncestor).toHaveBeenCalledWith(1, true)
    press(hosts(tree, 'button-secondary-sm')[0]!)
    expect(spies.onConfirmParent).toHaveBeenCalledOnce()
  })

  it('asks the duplicate question with quick options and sends the same request', () => {
    const spies = handlers()
    const tree = dialogs(spies, { duplicateHabitName: 'Read' })
    expect(sheetTitle(tree)).toEqual(['habits.duplicateConfirmTitle'])
    expect(labels(tree)).toEqual(['common.notNow', 'habits.duplicateConfirm'])
    press(answers(tree)[1]!)
    expect(spies.onConfirmDuplicate).toHaveBeenCalledOnce()
  })

  it('keeps the delete confirmation as a destructive confirmation with no quick option and no mascot', () => {
    const tree = dialogs(handlers(), { showDeleteConfirm: true, deleteHabitName: 'Read' })
    expect(sheetTitle(tree)).toEqual(['habits.deleteConfirmTitle'])
    expect(options(tree)).toHaveLength(0)
    expect(hosts(tree, 'button-destructive-sm')).toHaveLength(1)
    expect(mascots(tree)).toHaveLength(0)
  })

  it('asks the checklist question after the last item', () => {
    const onConfirm = vi.fn()
    const tree = mount(<ChecklistCompletePrompt open name="Read" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(sheetTitle(tree)).toEqual(['habits.checklistCompleteQuestion'])
    expect(sentences(tree)).toEqual([])
    expect(labels(tree)).toEqual(['common.notNow', 'habits.checklistCompleteConfirm'])
    press(answers(tree)[1]!)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it.each([['log', 'habits.detail.logDateQuestion', 'habits.detail.logDateConfirmLog'], ['unlog', 'habits.detail.logDateUnlogQuestion', 'habits.detail.logDateConfirmUnlog']] as const)('asks one question before a %s on another date', (intent, question, answer) => {
    const onConfirm = vi.fn()
    const tree = mount(<LogDatePrompt pending={{ habitId: 'h', intent, date, name: 'Read', permanent: false }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(sheetTitle(tree)).toEqual([question])
    expect(labels(tree)).toEqual(['common.notNow', answer])
    press(answers(tree)[1]!)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the confirmation for a removal that cannot be undone', () => {
    const tree = mount(<LogDatePrompt pending={{ habitId: 'h', intent: 'unlog', date, name: 'Read', permanent: true }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(sheetTitle(tree)).toEqual(['habits.detail.logDateConfirmTitle'])
    expect(options(tree)).toHaveLength(0)
  })
})
