import React, { type ReactElement } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { SelectionTray } from '@/components/habits/selection-tray'
import { createTokensV2 } from '@/lib/theme'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const visibleLocale = vi.hoisted(() => ({ language: 'en' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const messages = visibleLocale.language === 'pt-BR' ? ptBR : en
      const message = (messages.habits.bulkBar as Record<string, string>)[key.replace('habits.bulkBar.', '')]
      return message ? String(new IntlMessageFormat(message, visibleLocale.language).format(values)) : key
    },
  }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
}

type RenderedTree = {
  root: {
    findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
  }
  toJSON: () => unknown
}

function flattenRenderedText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenRenderedText).join('')
  if (typeof node === 'object' && 'children' in node) {
    return flattenRenderedText(node.children)
  }
  return ''
}

async function renderBar(
  overrides: Partial<Parameters<typeof SelectionTray>[0]> = {},
) {
  const props = {
    count: 2,
    allSelected: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onLog: vi.fn(),
    onSkip: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    countSuffixLabel: 'selected',
    selectAllLabel: 'Select all',
    deselectAllLabel: 'Deselect all',
    logLabel: 'Log selected',
    skipLabel: 'Skip selected',
    moveLabel: 'Move selected',
    deleteLabel: 'Delete selected',
    closeLabel: 'Cancel',
    ...overrides,
  }
  let tree: RenderedTree | undefined
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <SelectionTray {...props} />,
    ) as unknown as RenderedTree
  })
  if (!tree) throw new Error('Expected bulk action bar to render')
  return { tree, props }
}

function findButtonByLabel(tree: RenderedTree, label: string): RenderedNode {
  const matches = tree.root.findAll(
    (node) => node.props.accessibilityLabel === label,
  )
  if (matches.length === 0) throw new Error(`No button labeled ${label}`)
  return matches[0]!
}

describe('SelectionTray', () => {
  it.each([
    ['en', 'Select up to 100 habits to move at once.'],
    ['pt-BR', 'Selecione até 100 hábitos para mover de uma vez.'],
  ])('explains an oversized move in %s', async (locale, message) => {
    visibleLocale.language = locale
    const { tree, props } = await renderBar({ count: 101 })
    const move = findButtonByLabel(tree, props.moveLabel)
    expect(move.props.disabled).toBe(true)
    expect(move.props.accessibilityState).toEqual({ disabled: true })
    expect(move.props.accessibilityHint).toBe(message)
    expect(flattenRenderedText(tree.toJSON())).toContain(message)
  })

  it('paints every action across its whole target without invisible slop', async () => {
    const { tree, props } = await renderBar()
    for (const label of [props.logLabel, props.skipLabel, props.moveLabel, props.deleteLabel, props.closeLabel]) {
      const button = findButtonByLabel(tree, label)
      const style = button.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
      expect(button.props.hitSlop).toBeUndefined()
      expect(StyleSheet.flatten(style({ pressed: true }))).toMatchObject({ width: 48, height: 48 })
      expect(StyleSheet.flatten(style({ pressed: true })).backgroundColor).toBe(createTokensV2('purple', 'dark').bgHoverOpaque)
    }
  })

  it.each([false, true])('fills the whole select-all target with allSelected: %s', async (allSelected) => {
    const { tree } = await renderBar({ allSelected })
    const control = tree.root.findAll((node) => typeof node.props.children === 'function'
      && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === undefined)[0]!
    const style = control.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
    expect(control.props.hitSlop).toBeUndefined()
    expect(StyleSheet.flatten(style({ pressed: true }))).toMatchObject({
      minHeight: 48, minWidth: 48,
      borderRadius: 999, overflow: 'hidden',
    })
    const child = control.props.children as (state: { pressed: boolean }) => ReactElement<{ children: [ReactElement<{ style: StyleProp<ViewStyle>; pointerEvents: string }>, ReactElement] }>
    for (const pressed of [false, true]) {
      const layer = child({ pressed }).props.children[0]
      expect(layer.props.pointerEvents).toBe('none')
      expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
        position: 'absolute', inset: 0, borderRadius: 999,
        backgroundColor: createTokensV2('purple', 'dark').bgHoverOpaque, opacity: pressed ? 1 : 0,
      })
    }
    expect(StyleSheet.flatten(style({ pressed: false })).backgroundColor).toBeUndefined()
  })

  it('renders the tabular count beside the digit-free suffix', async () => {
    const { tree } = await renderBar({ count: 7, countSuffixLabel: 'selected' })

    const text = flattenRenderedText(tree.toJSON())
    expect(text).toContain('7')
    expect(text).toContain('selected')
  })

  it('keeps move enabled when the selected day is completion read only', async () => {
    const { tree, props } = await renderBar({ completionReadOnly: true })
    const move = findButtonByLabel(tree, props.moveLabel)
    expect(move.props.disabled).toBe(false)
    expect(move.props.accessibilityState).toMatchObject({ disabled: false })
    await TestRenderer.act(() => { (move.props.onPress as () => void)() })
    expect(props.onMove).toHaveBeenCalledOnce()
  })

  it('disables log, skip, and delete at zero selection but keeps close active', async () => {
    const { tree } = await renderBar({ count: 0 })

    for (const label of ['Log selected', 'Skip selected', 'Move selected', 'Delete selected']) {
      const button = findButtonByLabel(tree, label)
      expect(button.props.disabled).toBe(true)
      expect(
        (button.props.accessibilityState as { disabled: boolean }).disabled,
      ).toBe(true)
    }
    expect(findButtonByLabel(tree, 'Cancel').props.disabled).toBeFalsy()
  })

  it('fires the action handlers when pressed with a selection', async () => {
    const { tree, props } = await renderBar({ count: 3 })

    await TestRenderer.act(() => {
      ;(findButtonByLabel(tree, 'Log selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Skip selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Move selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Delete selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Cancel').props.onPress as () => void)()
    })

    expect(props.onLog).toHaveBeenCalled()
    expect(props.onSkip).toHaveBeenCalled()
    expect(props.onMove).toHaveBeenCalled()
    expect(props.onDelete).toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows a select-all text control that selects everything', async () => {
    const { tree, props } = await renderBar({ allSelected: false })

    expect(flattenRenderedText(tree.toJSON())).toContain('Select all')

    const selectAllButton = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === undefined &&
        typeof node.props.onPress === 'function',
    )[0]
    if (!selectAllButton) throw new Error('Expected the select-all control')

    await TestRenderer.act(() => {
      ;(selectAllButton.props.onPress as () => void)()
    })
    expect(props.onSelectAll).toHaveBeenCalled()
  })

  it('swaps to a deselect-all text control when everything is selected', async () => {
    const { tree, props } = await renderBar({ allSelected: true })

    expect(flattenRenderedText(tree.toJSON())).toContain('Deselect all')

    const deselectAllButton = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === undefined &&
        typeof node.props.onPress === 'function',
    )[0]
    if (!deselectAllButton) throw new Error('Expected the deselect-all control')

    await TestRenderer.act(() => {
      ;(deselectAllButton.props.onPress as () => void)()
    })
    expect(props.onDeselectAll).toHaveBeenCalled()
  })
})
