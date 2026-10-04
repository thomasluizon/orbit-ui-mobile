import { createElement, useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { StyleSheet, type ViewStyle } from 'react-native'

import { HabitChecklist } from '@/components/habits/habit-checklist'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

interface RenderedNode {
  type: unknown
  props: Record<string, unknown>
  parent: RenderedNode | null
}

interface RenderedInput extends RenderedNode {
  props: {
    accessibilityLabel?: string
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

const themeState = vi.hoisted(() => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: themeState.mode }),
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

let setHarnessItems: ((items: ChecklistItem[]) => void) | undefined

function ChecklistHarness() {
  const [items, setItems] = useState(INITIAL_ITEMS)
  setHarnessItems = setItems
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

function pressPaint(node: RenderedNode, pressed: boolean) {
  const style = node.props.style as (state: { pressed: boolean }) => ViewStyle
  return StyleSheet.flatten(style({ pressed }))
}

describe('HabitChecklist press paint', () => {
  it.each(['dark', 'light'] as const)('uses the hover role for editable actions in %s', (mode) => {
    themeState.mode = mode
    const tokens = createTokensV2('purple', mode)
    const tree = renderChecklist()
    for (const key of ['moveChecklistItemUp', 'moveChecklistItemDown', 'duplicateChecklistItem', 'removeChecklistItem']) {
      const controls = tree.root.findAll((node) =>
        node.type === 'Pressable' && node.props.accessibilityLabel === i18n.t(`habits.form.${key}`),
      )
      expect(controls).toHaveLength(2)
      for (const control of controls) {
        expect(pressPaint(control, false).backgroundColor).toBeUndefined()
        expect(pressPaint(control, true).backgroundColor).toBe(control.props.disabled ? undefined : tokens.bgHover)
        expect(pressPaint(control, true).overflow).toBe('hidden')
      }
    }
    const clear = tree.root.findAll((node) => node.type === 'Pressable' && !node.props.accessibilityLabel)[0]!
    expect(pressPaint(clear, false).backgroundColor).toBeUndefined()
    expect(pressPaint(clear, true)).toMatchObject({ backgroundColor: tokens.bgHover, overflow: 'hidden' })
    themeState.mode = 'dark'
  })

  it.each(['dark', 'light'] as const)('paints reset and clear feedback in %s', (mode) => {
    themeState.mode = mode
    const tokens = createTokensV2('purple', mode)
    let tree!: RenderedTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitChecklist items={[{ text: 'Read', isChecked: true }]} interactive />)
    })
    for (const key of ['resetChecklist', 'clearChecklist']) {
      const controls = tree.root.findAll((node) =>
        node.type === 'Pressable' && node.props.accessibilityLabel === i18n.t(`habits.form.${key}`),
      )
      expect(controls).toHaveLength(1)
      const control = controls[0]!
      expect(pressPaint(control, false).backgroundColor).toBeUndefined()
      expect(pressPaint(control, true)).toMatchObject({ backgroundColor: tokens.bgHover, overflow: 'hidden' })
      if (key === 'resetChecklist') {
        const children = control.parent?.parent?.props.children as (state: { pressed: boolean }) => ReactElement<{ color: string }>
        expect(children({ pressed: false }).props.color).toBe(tokens.primary)
        expect(children({ pressed: true }).props.color).toBe(tokens.fg2)
      }
    }
    themeState.mode = 'dark'
  })
})

describe('HabitChecklist checked rows', () => {
  it('paints each checklist icon action in its whole target', () => {
    const tree = renderChecklist()
    const labels = new Set(['moveChecklistItemUp', 'moveChecklistItemDown', 'duplicateChecklistItem', 'removeChecklistItem'].map((key) => i18n.t(`habits.form.${key}`)))
    const buttons = tree.root.findAll((node) => node.type === 'Pressable' && labels.has(String(node.props.accessibilityLabel)))
    expect(buttons.length).toBeGreaterThanOrEqual(6)
    for (const button of buttons) {
      const style = button.props.style as (state: { pressed: boolean }) => ViewStyle[]
      const pressed = StyleSheet.flatten(style({ pressed: true }))
      expect(button.props.hitSlop).toBeUndefined()
      expect(pressed).toMatchObject({ width: 48, height: 48 })
      if (!button.props.disabled) expect(pressed.backgroundColor).toBe(createTokensV2('purple', 'dark').bgHover)
    }
  })

  it('dims a checked label without striking it', () => {
    let tree: RenderedTree | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitChecklist items={[{ text: 'Done task', isChecked: true }]} interactive />,
      )
    })
    const label = tree!.root.findAll((node) =>
      node.type === 'Text' && (node as RenderedNode & { children?: unknown[] }).children?.includes('Done task') === true,
    )[0]
    expect(label).toBeDefined()
    const style = StyleSheet.flatten(label!.props.style) as Record<string, unknown>
    expect(style.color).toBe(createTokensV2('purple', 'dark').fg3)
    expect(style.textDecorationLine).not.toBe('line-through')
  })
})

describe('HabitChecklist editable rows', () => {
  it('separates the add field focus perimeter from the primary button', () => {
    const tree = renderChecklist()
    const input = tree.root.findAllByType('TextInput').find((node) => node.props.value === '')
    if (!input) throw new Error('Expected checklist add input')
    expect(input.props.accessibilityLabel).toBe(i18n.t('habits.form.checklistPlaceholder'))
    let row = input.parent
    while (row && StyleSheet.flatten(row.props.style as ViewStyle).minHeight !== 48) row = row.parent
    if (!row) throw new Error('Expected checklist add row')
    expect(StyleSheet.flatten(row.props.style as object)).toMatchObject({ gap: 12 })
  })

  it('keeps a draft with its row through an optimistic reorder and rollback', () => {
    const tree = renderChecklist()
    const secondInput = itemInputs(tree)[1]!
    TestRenderer.act(() => {
      secondInput.props.onFocus({})
      secondInput.props.onChangeText('Draft second item')
    })
    TestRenderer.act(() => setHarnessItems?.([INITIAL_ITEMS[1]!, INITIAL_ITEMS[0]!]))
    expect(itemInputs(tree)[0]).toBe(secondInput)
    expect(itemInputs(tree)[0]?.props.value).toBe('Draft second item')
    TestRenderer.act(() => setHarnessItems?.(INITIAL_ITEMS))
    expect(itemInputs(tree)[1]).toBe(secondInput)
    expect(itemInputs(tree)[1]?.props.value).toBe('Draft second item')
  })

  it('keeps a draft with its row after a rejected positional removal', () => {
    const tree = renderChecklist()
    const secondInput = itemInputs(tree)[1]!
    TestRenderer.act(() => {
      secondInput.props.onFocus({})
      secondInput.props.onChangeText('Draft second item')
    })
    const removeLabel = i18n.t('habits.form.removeChecklistItem')
    const removeButtons = tree.root.findAll((node) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === removeLabel,
    )
    TestRenderer.act(() => (removeButtons[0]?.props.onPress as () => void)())
    expect(itemInputs(tree)[0]).toBe(secondInput)
    TestRenderer.act(() => setHarnessItems?.(INITIAL_ITEMS))
    expect(itemInputs(tree)[1]).toBe(secondInput)
    expect(itemInputs(tree)[1]?.props.value).toBe('Draft second item')
  })

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

    expect(StyleSheet.flatten(style)).toMatchObject({ paddingHorizontal: 8 })
  })
})


it('keeps the reset glyph above the graphic floor on a pressed card child', () => {
  let tree: RenderedTree | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitChecklist items={[{ text: 'Read', isChecked: true }]} interactive onReset={vi.fn()} />)
  })
  const reset = tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === i18n.t('habits.form.resetChecklist'))[0]!
  const style = reset.props.style as (state: { pressed: boolean }) => ViewStyle
  const fill = StyleSheet.flatten(style({ pressed: true })).backgroundColor as string
  const children = reset.parent?.parent?.props.children
  const icon = (typeof children === 'function' ? children({ pressed: true }) : children) as ReactElement<{ color: string }>
  const tokens = createTokensV2('orange', 'dark')
  expect(contrastOnSurface(icon.props.color, [tokens.bg, tokens.bgCard, fill])).toBeGreaterThanOrEqual(3)
})
