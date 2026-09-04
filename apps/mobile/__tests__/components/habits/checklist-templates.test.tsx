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
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
}))

vi.mock('@/components/ui/icons', () => ({
  X: (props: Record<string, unknown>) => React.createElement('X', props),
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
  return tree.root.findAll((node) => node.type === 'ListRow' && node.props.title === title)[0]!
}

function press(node: TestNode, prop = 'onClick') {
  TestRenderer.act(() => {
    ;(node.props[prop] as () => void)()
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
  })

  it('saves the current checklist under a trimmed template name', () => {
    const { tree } = renderTemplates()
    press(listRow(tree, 'habits.form.templates'))
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
    press(listRow(tree, 'habits.form.templates'))
    press(listRow(tree, 'Workout'))
    expect(onLoad).toHaveBeenCalledWith([
      { text: 'Warm up', isChecked: false },
      { text: 'Run', isChecked: false },
    ])
  })

  it('surfaces deletion failures through the app toast', () => {
    mocks.templates = [{ id: 'template-1', name: 'Workout', items: ['Run'] }]
    const { tree } = renderTemplates()
    press(listRow(tree, 'habits.form.templates'))
    const action = listRow(tree, 'Workout').props.action as { onPress: () => void }
    TestRenderer.act(() => action.onPress())
    const onError = mocks.remove.mock.calls[0]![1].onError as () => void
    onError()
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.deleteTemplateError')
  })
})
