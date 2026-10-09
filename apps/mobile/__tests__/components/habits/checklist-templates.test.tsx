import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expectPersonalTextLayout, expandedTextControls, pressTextControl } from '@/__tests__/support/personal-text'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import { ChecklistTemplates } from '@/components/habits/checklist-templates'

const mocks = vi.hoisted(() => ({
  templates: [] as ChecklistTemplate[],
  create: vi.fn(),
  remove: vi.fn(),
  showError: vi.fn(),
  isPending: false,
  closeSheet: vi.fn<(afterClose: () => void) => void>(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { name: string }) => key === 'common.showFullText' ? `${key}:${JSON.stringify(values)}` : key }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'light' }),
}))

vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: mocks.templates }),
  useCreateChecklistTemplate: () => ({ mutate: mocks.create, isPending: mocks.isPending }),
  useDeleteChecklistTemplate: () => ({ mutate: mocks.remove }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRow', props),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: (props: Record<string, unknown>) => React.createElement('Sheet', props, props.children as React.ReactNode),
  useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: mocks.closeSheet }),
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
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

function listRow(tree: TestTree, title: string): TestNode {
  return tree.root.findAll((node) => node.type === 'ListRow' && node.props.title === title || node.type === 'Pressable' && node.props.accessibilityLabel === title && node.props.accessibilityState === undefined)[0]!
}

function press(node: TestNode, prop = 'onClick') {
  TestRenderer.act(() => {
    ;((node.props[prop] ?? node.props.onPress) as () => void)()
  })
}

function renderTemplates(onLoad = vi.fn()) {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ChecklistTemplates
        items={[{ text: 'Shoes', isChecked: false }]}
        onLoad={onLoad}
      />,
    )
  })
  return { tree, onLoad }
}

describe('ChecklistTemplates mobile', () => {
  beforeEach(() => {
    mocks.templates = []
    mocks.create.mockReset()
    mocks.remove.mockReset()
    mocks.showError.mockReset()
    mocks.isPending = false
    mocks.closeSheet.mockReset()
  })

  it('shows a template entry without a count', () => {
    mocks.templates = [{ id: 'template-1', name: 'Workout', items: ['Run'] }]
    const { tree } = renderTemplates()
    const row = listRow(tree, 'habits.form.useTemplate')
    expect(row.props.icon).toBe('template')
    expect(row.props.value).toBeUndefined()
  })

  it('saves the current checklist under a trimmed template name', () => {
    const { tree } = renderTemplates()
    press(listRow(tree, 'habits.form.useTemplate'))
    const saveCurrent = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && node.findAll((child) => child.type === 'Text' && child.props.children === 'habits.form.saveCurrentList').length > 0)[0]!
    press(saveCurrent, 'onPress')

    const input = tree.root.findAll((node) => node.type === 'TextInput')[0]!
    TestRenderer.act(() => {
      ;(input.props.onChangeText as (value: string) => void)('  Morning  ')
    })
    const save = tree.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'common.save',
    )[0]!
    press(save, 'onPress')

    expect(mocks.create).toHaveBeenCalledWith(
      { name: 'Morning', items: ['Shoes'] },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('loads a selected template as unchecked checklist items', () => {
    mocks.templates = [{ id: 'template-1', name: 'Workout', items: ['Warm up', 'Run'] }]
    const { tree, onLoad } = renderTemplates()
    press(listRow(tree, 'habits.form.useTemplate'))
    press(listRow(tree, 'Workout'))
    expect(mocks.closeSheet).toHaveBeenCalledOnce()
    expect(onLoad).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(1)
    TestRenderer.act(() => mocks.closeSheet.mock.calls[0]![0]())
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)
    expect(onLoad).toHaveBeenCalledWith([
      { text: 'Warm up', isChecked: false },
      { text: 'Run', isChecked: false },
    ])
  })

  it('surfaces deletion failures through the app toast', () => {
    mocks.templates = [{ id: 'template-1', name: 'Workout', items: ['Run'] }]
    const { tree } = renderTemplates()
    press(listRow(tree, 'habits.form.useTemplate'))
    press(listRow(tree, 'common.delete: Workout'), 'onPress')
    const onError = mocks.remove.mock.calls[0]![1].onError as () => void
    onError()
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.deleteTemplateError')
  })
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full template name %s without loading it', async (name) => {
    mocks.templates = [{ id: 'template-1', name, items: ['Run'] }]
    const onLoad = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ChecklistTemplates items={[]} onLoad={onLoad} />) })
    const entry = tree.root.findAll((node) => String(node.type) === 'ListRow' && node.props.title === 'habits.form.useTemplate')[0]!
    await act(() => { (entry.props.onClick as () => void)() })
    await expectPersonalTextLayout(tree.root, name)
    await act(() => pressTextControl(expandedTextControls(tree.root, `common.showFullText:${JSON.stringify({ name })}`, false)[0]!))
    expect(onLoad).not.toHaveBeenCalled()
    const load = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === name && !(node.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded && node.props.accessibilityState === undefined)[0]!
    await act(() => pressTextControl(load))
    expect(mocks.closeSheet).toHaveBeenCalledOnce()
    const afterClose = mocks.closeSheet.mock.calls[0]![0]
    await act(() => afterClose())
    expect(onLoad).toHaveBeenCalledWith([{ text: 'Run', isChecked: false }])
    await act(() => tree.update(<></>))
  })

})
