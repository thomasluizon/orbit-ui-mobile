import React, { type ReactElement } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionTray } from '@/components/habits/selection-tray'
import { createTokensV2 } from '@/lib/theme'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const visibleLocale = vi.hoisted(() => ({ language: 'en' }))
const interactionState = vi.hoisted((): { mode: 'dark' | 'light'; reducedMotion: boolean } => ({
  mode: 'dark', reducedMotion: false,
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: interactionState.mode }),
}))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => interactionState.reducedMotion }))

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
  update: (element: ReactElement) => void
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

function actionStyle(tree: RenderedTree, label: string, pressed = false) {
  const style = findButtonByLabel(tree, label).props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
  return StyleSheet.flatten(style({ pressed }))
}

async function actionEvent(
  tree: RenderedTree, label: string, event: 'onHoverIn' | 'onHoverOut' | 'onFocus' | 'onBlur',
) {
  const handler = findButtonByLabel(tree, label).props[event] as (() => void) | undefined
  await TestRenderer.act(() => { handler?.() })
}

describe('SelectionTray', () => {
  it('omits Skip for an all-General selection', async () => {
    const { tree } = await renderBar({ count: 2, skippableCount: 0 })
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Skip selected')).toHaveLength(0)
    expect(findButtonByLabel(tree, 'Log selected').props.disabled).toBe(false)
  })

  it.each(['en', 'pt-BR'])('shows the eligible Skip count for a mixed selection in %s', async (locale) => {
    visibleLocale.language = locale
    const { tree } = await renderBar({ count: 3, skippableCount: 1 })
    expect(flattenRenderedText(tree.toJSON())).toContain(locale === 'en'
      ? '1 selected habit can be skipped.' : '1 hábito selecionado pode ser pulado.')
  })

  beforeEach(() => {
    visibleLocale.language = 'en'
    interactionState.mode = 'dark'
    interactionState.reducedMotion = false
  })

  it.each(['dark', 'light'] as const)('retains neutral hover feedback across the four actions in %s', async (mode) => {
    interactionState.mode = mode
    const { tree, props } = await renderBar()
    for (const label of [props.logLabel, props.skipLabel, props.moveLabel, props.deleteLabel]) {
      const rest = actionStyle(tree, label)
      expect(rest.backgroundColor).toBe('transparent')
      await actionEvent(tree, label, 'onHoverIn')
      expect(actionStyle(tree, label)).toMatchObject({
        width: 48, height: 48, borderRadius: 999, overflow: 'hidden',
        backgroundColor: createTokensV2('purple', mode).bgHoverOpaque,
      })
      expect(actionStyle(tree, label).transform).toBeUndefined()
      await actionEvent(tree, label, 'onHoverOut')
      expect(actionStyle(tree, label)).toEqual(rest)
    }
    for (const handler of [props.onLog, props.onSkip, props.onMove, props.onDelete]) {
      expect(handler).not.toHaveBeenCalled()
    }
  })

  it.each([false, true])('preserves overlapping hover, focus and press feedback with reduced motion %s', async (reducedMotion) => {
    interactionState.reducedMotion = reducedMotion
    const { tree, props } = await renderBar()
    const fill = createTokensV2('purple', 'dark').bgHoverOpaque
    for (const label of [props.logLabel, props.skipLabel, props.moveLabel, props.deleteLabel]) {
      const rest = actionStyle(tree, label)
      await actionEvent(tree, label, 'onFocus')
      expect(actionStyle(tree, label).backgroundColor).toBe(fill)
      expect(actionStyle(tree, label).transform).toBeUndefined()
      await actionEvent(tree, label, 'onHoverIn')
      await actionEvent(tree, label, 'onBlur')
      expect(actionStyle(tree, label).backgroundColor).toBe(fill)
      expect(actionStyle(tree, label, true).transform).toEqual(reducedMotion ? undefined : [{ scale: 0.96 }])
      expect(actionStyle(tree, label, true).backgroundColor).toBe(fill)
      expect(actionStyle(tree, label).backgroundColor).toBe(fill)
      await actionEvent(tree, label, 'onFocus')
      await actionEvent(tree, label, 'onHoverOut')
      expect(actionStyle(tree, label).backgroundColor).toBe(fill)
      await actionEvent(tree, label, 'onBlur')
      expect(actionStyle(tree, label, true).backgroundColor).toBe(fill)
      expect(actionStyle(tree, label)).toEqual(rest)
      await actionEvent(tree, label, 'onHoverIn')
      await actionEvent(tree, label, 'onHoverOut')
      expect(actionStyle(tree, label, true).backgroundColor).toBe(fill)
      expect(actionStyle(tree, label)).toEqual(rest)
    }
  })

  it.each([
    { overrides: { count: 0 }, labels: ['Log selected', 'Skip selected', 'Move selected', 'Delete selected'] },
    { overrides: { completionReadOnly: true }, labels: ['Log selected', 'Skip selected'] },
    { overrides: { count: 101 }, labels: ['Move selected'] },
  ])('keeps disabled actions unpainted for $overrides', async ({ overrides, labels }) => {
    const { tree } = await renderBar(overrides)
    for (const label of labels) {
      const button = findButtonByLabel(tree, label)
      expect(button.props.disabled).toBe(true)
      expect(button.props.accessibilityState).toEqual({ disabled: true })
      const rest = actionStyle(tree, label)
      await actionEvent(tree, label, 'onHoverIn')
      await actionEvent(tree, label, 'onFocus')
      expect(actionStyle(tree, label)).toEqual(rest)
      expect(actionStyle(tree, label, true)).toEqual(rest)
      expect(rest).toMatchObject({ backgroundColor: 'transparent', opacity: 0.45 })
      expect(rest.transform).toBeUndefined()
    }
  })

  it('blocks disabled entry events and clears active feedback when selection becomes empty', async () => {
    const { tree, props } = await renderBar({ count: 0 })
    const labels = [props.logLabel, props.skipLabel, props.moveLabel, props.deleteLabel]
    for (const label of labels) {
      await actionEvent(tree, label, 'onHoverIn')
      await actionEvent(tree, label, 'onFocus')
    }
    await TestRenderer.act(() => { tree.update(<SelectionTray {...props} count={100} />) })
    for (const label of labels) {
      expect(findButtonByLabel(tree, label).props.disabled).toBe(false)
      expect(actionStyle(tree, label).backgroundColor).toBe('transparent')
      await actionEvent(tree, label, 'onHoverIn')
      await actionEvent(tree, label, 'onFocus')
    }
    await TestRenderer.act(() => { tree.update(<SelectionTray {...props} count={0} />) })
    for (const label of labels) {
      expect(actionStyle(tree, label).backgroundColor).toBe('transparent')
      expect(actionStyle(tree, label, true).transform).toBeUndefined()
      await actionEvent(tree, label, 'onHoverOut')
      await actionEvent(tree, label, 'onBlur')
    }
    await TestRenderer.act(() => { tree.update(<SelectionTray {...props} count={3} />) })
    for (const label of labels) expect(actionStyle(tree, label).backgroundColor).toBe('transparent')
  })

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
