import { createElement, useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ChecklistItem } from '@orbit/shared/types/habit'

import { HabitChecklist } from '@/components/habits/habit-checklist'
import { i18n } from '@/lib/i18n'

interface RenderedNode {
  type: unknown
  props: Record<string, unknown>
}

interface RenderedInput extends RenderedNode {
  props: {
    onChangeText: (value: string) => void
    onFocus: (event: unknown) => void
    style: readonly unknown[]
    value: string
  }
}

interface RenderedTree {
  root: {
    findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
    findAllByType: (type: string) => RenderedInput[]
  }
}

const TestRenderer: {
  act: (callback: () => void) => void
  create: (element: ReactElement) => RenderedTree
} = require('react-test-renderer')

const translationMockState = vi.hoisted(() => ({
  translate: (key: string, _params?: Record<string, unknown>) => key,
}))

translationMockState.translate = (key, params) => i18n.t(key, params)

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: translationMockState.translate,
    i18n: { language: i18n.language },
  }),
}))

vi.mock('lucide-react-native', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    createElement(name, props)

  return {
    Check: icon('Check'),
    ChevronDown: icon('ChevronDown'),
    ChevronUp: icon('ChevronUp'),
    Copy: icon('Copy'),
    Plus: icon('Plus'),
    RotateCcw: icon('RotateCcw'),
    X: icon('X'),
  }
})

const INITIAL_ITEMS: ChecklistItem[] = [
  { text: 'First item', isChecked: false },
  { text: 'Second item', isChecked: false },
]

function ChecklistHarness() {
  const [items, setItems] = useState(INITIAL_ITEMS)
  return <HabitChecklist items={items} editable onItemsChange={setItems} />
}

function renderChecklist() {
  let tree: RenderedTree | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ChecklistHarness />)
  })
  if (!tree) throw new Error('Checklist did not render')
  return tree
}

function itemInputs(tree: RenderedTree) {
  return tree.root
    .findAllByType('TextInput')
    .filter((input) => input.props.value !== '')
}

function pressMoveUp(tree: RenderedTree) {
  const moveUpLabel = i18n.t('habits.form.moveChecklistItemUp')
  const buttons = tree.root.findAll(
    (node) =>
      node.type === 'Pressable' &&
      node.props.accessibilityLabel === moveUpLabel &&
      !node.props.disabled,
  )
  const button = buttons[0]
  if (!button) throw new Error('Enabled move-up button was not rendered')

  TestRenderer.act(() => {
    const onPress = button.props.onPress as () => void
    onPress()
  })
}

describe('HabitChecklist editable rows', () => {
  it('moves a focused row without replacing either item text', () => {
    const tree = renderChecklist()
    const secondInput = itemInputs(tree)[1]
    if (!secondInput) throw new Error('Second checklist input was not rendered')

    TestRenderer.act(() => {
      secondInput.props.onFocus({})
    })
    pressMoveUp(tree)

    expect(itemInputs(tree).map((input) => input.props.value)).toEqual([
      'Second item',
      'First item',
    ])
  })

  it('keeps an in-progress edit with its row when moved', () => {
    const tree = renderChecklist()
    const secondInput = itemInputs(tree)[1]
    if (!secondInput) throw new Error('Second checklist input was not rendered')

    TestRenderer.act(() => {
      secondInput.props.onFocus({})
      secondInput.props.onChangeText('Edited second item')
    })
    pressMoveUp(tree)

    expect(itemInputs(tree).map((input) => input.props.value)).toEqual([
      'Edited second item',
      'First item',
    ])
  })

  it('gives editable item text horizontal breathing room', () => {
    const tree = renderChecklist()
    const firstInput = itemInputs(tree)[0]
    if (!firstInput) throw new Error('First checklist input was not rendered')
    const style = firstInput.props.style

    expect(style.at(-1)).toMatchObject({ paddingHorizontal: 8 })
  })
})
