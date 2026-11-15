import { sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
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
const labels = (tree: ReturnType<typeof TestRenderer.create>) => options(tree).map((node) => node.props.accessibilityLabel)
const sheetTitle = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'Sheet').map((node: ReactTestInstance) => node.props.title)
const press = (node: ReactTestInstance) => TestRenderer.act(() => { (node.props.onPress as () => void)() })
const mascots = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node: ReactTestInstance) => node.props.testID === 'orbit-mascot')

describe('Android habit prompts as one question', () => {
  it('asks the parent question as the sheet title, with the two answers as quick options', () => {
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    const tree = dialogs(spies, { parentPrompt: promptOf([parent]) })
    expect(sheetTitle(tree)).toEqual(['habits.autoLogParentMessage'])
    expect(labels(tree)).toEqual(['habits.autoLogParentConfirm', 'common.notNow'])
    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual([])
    expect(mascots(tree)).toHaveLength(0)
    press(options(tree)[0]!)
    expect(spies.onConfirmParent).toHaveBeenCalledOnce()
    expect(spies.onCancelParent).not.toHaveBeenCalled()
  })

  it('sends the cancel of the parent prompt from the second quick option', () => {
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    const tree = dialogs(spies, { parentPrompt: promptOf([parent]) })
    press(options(tree)[1]!)
    expect(spies.onCancelParent).toHaveBeenCalledOnce()
    expect(spies.onConfirmParent).not.toHaveBeenCalled()
  })

  it('keeps the ancestor choices as the free path with its own action', () => {
    enableTestFlags('orbit_guided_flows')
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
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    const tree = dialogs(spies, { duplicateHabitName: 'Read' })
    expect(sheetTitle(tree)).toEqual(['habits.duplicateConfirmTitle'])
    expect(labels(tree)).toEqual(['habits.duplicateConfirm', 'common.notNow'])
    press(options(tree)[0]!)
    expect(spies.onConfirmDuplicate).toHaveBeenCalledOnce()
  })

  it('keeps the delete confirmation as a destructive confirmation with no quick option and no mascot', () => {
    enableTestFlags('orbit_guided_flows')
    const tree = dialogs(handlers(), { showDeleteConfirm: true, deleteHabitName: 'Read' })
    expect(sheetTitle(tree)).toEqual(['habits.deleteConfirmTitle'])
    expect(options(tree)).toHaveLength(0)
    expect(hosts(tree, 'button-destructive-sm')).toHaveLength(1)
    expect(mascots(tree)).toHaveLength(0)
  })

  it('renders the current confirm sheets with the flag off', () => {
    const tree = dialogs(handlers(), { parentPrompt: promptOf([parent]) })
    expect(sheetTitle(tree)).toEqual(['habits.autoLogParentTitle'])
    expect(options(tree)).toHaveLength(0)
    expect(hosts(tree, 'button-primary-sm')).toHaveLength(1)
  })

  it('asks the checklist question after the last item, and keeps the confirm sheet with the flag off', () => {
    const off = mount(<ChecklistCompletePrompt open name="Read" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(sheetTitle(off)).toEqual(['habits.checklistCompleteTitle'])
    expect(options(off)).toHaveLength(0)
    enableTestFlags('orbit_guided_flows')
    const onConfirm = vi.fn()
    const tree = mount(<ChecklistCompletePrompt open name="Read" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(sheetTitle(tree)).toEqual(['habits.checklistCompleteQuestion'])
    expect(labels(tree)).toEqual(['habits.checklistCompleteConfirm', 'common.notNow'])
    press(options(tree)[0]!)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it.each([['log', 'habits.detail.logDateQuestion', 'habits.detail.logDateConfirmLog'], ['unlog', 'habits.detail.logDateUnlogQuestion', 'habits.detail.logDateConfirmUnlog']] as const)('asks one question before a %s on another date', (intent, question, answer) => {
    enableTestFlags('orbit_guided_flows')
    const onConfirm = vi.fn()
    const tree = mount(<LogDatePrompt pending={{ habitId: 'h', intent, date, name: 'Read', permanent: false }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(sheetTitle(tree)).toEqual([question])
    expect(labels(tree)).toEqual([answer, 'common.notNow'])
    press(options(tree)[0]!)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the confirmation for a removal that cannot be undone', () => {
    enableTestFlags('orbit_guided_flows')
    const tree = mount(<LogDatePrompt pending={{ habitId: 'h', intent: 'unlog', date, name: 'Read', permanent: true }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(sheetTitle(tree)).toEqual(['habits.detail.logDateConfirmTitle'])
    expect(options(tree)).toHaveLength(0)
  })
})
