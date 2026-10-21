import React from 'react'
import { StyleSheet, type LayoutChangeEvent, type TextLayoutEvent, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'
import { Menu } from '@/components/ui/menu'
import { AI_MESSAGE_COUNTER_THRESHOLD, buildComposerChips } from '@orbit/shared/chat'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { SPACING } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { IntlMessageFormat } from 'intl-messageformat'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

const translation = vi.hoisted((): { words: Record<string, string> } => ({ words: {} }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => translation.words[key] ?? key }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

interface Host {
  type: string
  props: { style?: (ViewStyle & TextStyle) | ((state: { pressed: boolean }) => ViewStyle & TextStyle); testID?: string; contentContainerStyle?: ViewStyle; horizontal?: boolean; accessibilityLabel?: string; accessibilityRole?: string; width?: number; height?: number }
  children: (Host | string)[] | null
}

type Tree = ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }

function applyDimensions(node: YogaNode, style: ViewStyle) {
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
  if (style.maxWidth === '100%') node.setMaxWidthPercent(100)
}

function applyAlignment(node: YogaNode, style: ViewStyle) {
  if (style.alignItems === 'flex-end') node.setAlignItems(Yoga.ALIGN_FLEX_END)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.justifyContent === 'flex-end') node.setJustifyContent(Yoga.JUSTIFY_FLEX_END)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applyDimensions(node, style)
  applyAlignment(node, style)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.borderTopWidth === 'number') node.setBorder(Yoga.EDGE_TOP, style.borderTopWidth)
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (typeof style.flexBasis === 'number') node.setFlexBasis(style.flexBasis)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  for (const [property, edge] of [['start', Yoga.EDGE_START], ['end', Yoga.EDGE_END], ['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT], ['top', Yoga.EDGE_TOP], ['bottom', Yoga.EDGE_BOTTOM]] as const) {
    const value = style[property]
    if (typeof value === 'number') node.setPosition(edge, value)
  }
}

function measureText(host: Host, style: TextStyle, scale: number, available: number) {
  const { fontFamily, fontSize, lineHeight, letterSpacing } = style
  const fontStyle: TextStyle = { fontFamily, fontSize, lineHeight, letterSpacing }
  const measured = measureProfileRow({ type: 'View', props: { style: { alignItems: 'flex-start' } }, children: [{ type: 'Text', props: { style: fontStyle }, children: host.children }] }, available, scale).texts[0]!
  return { width: measured.width, height: measured.height }
}

function build(host: Host, nodes: Map<string, YogaNode>, fontScale = 1, inField = false): YogaNode {
  const node = Yoga.Node.create()
  const insideField = inField || host.props.testID === 'composer-field'
  const declared = host.props.style
  const style = declared === undefined ? {} : StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared)
  applyStyle(node, style)
  if (host.type === 'Svg' && host.props.width !== undefined && host.props.height !== undefined) {
    node.setWidth(host.props.width)
    node.setHeight(host.props.height)
  }
  if (host.props.testID) nodes.set(host.props.testID, node)
  if (insideField && host.props.accessibilityRole === 'button') nodes.set(`button:${host.props.accessibilityLabel}`, node)
  if (host.props.accessibilityLabel === `${en.todayAstra.openConversation}, nav.astra`) nodes.set('open-conversation', node)
  if (host.type === 'TextInput') {
    nodes.set('input', node)
    node.setMeasureFunc(() => ({ width: 80, height: (style.lineHeight ?? 24) * fontScale }))
  } else if (host.type === 'Text') {
    nodes.set(`text:${host.children?.filter(child => typeof child === 'string').join('')}`, node)
    node.setMeasureFunc((available, mode) => measureText(host, style, fontScale, mode === Yoga.MEASURE_MODE_UNDEFINED ? 10000 : available))
  } else {
    const children = host.type === 'ScrollView' ? [{ type: 'View', props: { style: { ...StyleSheet.flatten(host.props.contentContainerStyle), flexDirection: 'row' as const } }, children: host.children }] : host.children ?? []
    children.filter((child): child is Host => typeof child !== 'string').forEach((child, index) => node.insertChild(build(child, nodes, fontScale, insideField), index))
  }
  return node
}

function bounds(node: YogaNode) {
  let left = 0
  let top = 0
  let ancestor: YogaNode | null = node
  while (ancestor) { left += ancestor.getComputedLeft(); top += ancestor.getComputedTop(); ancestor = ancestor.getParent() }
  return { left, right: left + node.getComputedWidth(), top, bottom: top + node.getComputedHeight() }
}

it.each([320, 412].flatMap(width => [false, true].flatMap(withGlyph =>
  ['ltr', 'rtl'].map(direction => ({ width, withGlyph, direction })),
)))('insets caret and placeholder together at $width with glyph $withGlyph in $direction', async ({ width, withGlyph, direction }) => {
  let tree!: Tree
  await renderer.act(() => {
    tree = renderer.create(<Composer state="idle" value="" suggestions={[]} words={en.shell.composer}
      onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
      attachWords={{ ...en.shell.composer.attach, remove: name => name }}
      {...withGlyph ? { onOpenConversation: vi.fn(), conversationLabel: en.todayAstra.openConversation } : {}} />) as Tree
  })
  const nodes = new Map<string, YogaNode>()
  const layout = build(tree.toJSON(), nodes)
  try {
    layout.calculateLayout(width, undefined, direction === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR)
    const pill = bounds(nodes.get('composer-field')!)
    const input = nodes.get('input')!
    const inputBox = bounds(input)
    const placeholder = bounds(nodes.get('composer-placeholder')!)
    const start = direction === 'rtl' ? pill.right - inputBox.right + input.getComputedPadding(Yoga.EDGE_RIGHT)
      : inputBox.left - pill.left + input.getComputedPadding(Yoga.EDGE_LEFT)
    const placeholderStart = direction === 'rtl' ? pill.right - placeholder.right : placeholder.left - pill.left
    expect.soft(start).toBe(4 + (withGlyph ? nodes.get('open-conversation')!.getComputedWidth() : 0) + 8)
    expect.soft(placeholderStart).toBe(start)
    expect(input.getComputedPadding(Yoga.EDGE_LEFT)).toBe(8)
    expect(input.getComputedPadding(Yoga.EDGE_RIGHT)).toBe(8)
    expect(placeholder.right - placeholder.left).toBe(inputBox.right - inputBox.left - 16)
  } finally { layout.freeRecursive(); await renderer.act(() => tree.unmount()) }
})

function dailySuggestions(messages: typeof en) {
  const chips = buildComposerChips({ surface: 'habitDetail', status: 'success', habits: [], totalHabitCount: 1,
    detailHabit: { title: 'Reading', checklistItems: [] }, profile: createMockProfile() })
  const labels = messages.shell.composer.chips.habitDetail
  return toComposerSuggestions(chips.map(({ id }) => ({ id,
    label: labels[id.replace('habitDetail.', '') as keyof typeof labels], onSelect: vi.fn() })))
}

it.each([en, ptBR])('keeps the live chip labels on one line beside their Astra attribution at default text', async messages => {
  translation.words = { 'nav.astra': messages.nav.astra }
  const habit = createMockHabit({ isOverdue: true, hasSubHabits: true })
  const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [habit], totalHabitCount: 1,
    profile: createMockProfile() })
  const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
    label: messages.shell.composer.chips.today[id.replace('today.', '') as keyof typeof messages.shell.composer.chips.today], onSelect: vi.fn() })))
  let tree!: Tree
  await renderer.act(() => { tree = renderer.create(<Composer state="idle" value="" words={messages.shell.composer}
    suggestions={suggestions} onChangeValue={vi.fn()} onSend={vi.fn()} />) as Tree })
  try {
    const host = tree.root.findAll(node => node.props.testID === 'composer-suggestions-layout')[0]!
    const onLayout = host.props.onLayout as (event: LayoutChangeEvent) => void
    await renderer.act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 48 } } } as LayoutChangeEvent))
    const nodes = new Map<string, YogaNode>()
    const layout = build(tree.toJSON(), nodes)
    try {
      layout.calculateLayout(320, undefined)
      for (const suggestion of suggestions) {
        const text = tree.root.findAll(node => String(node.type) === 'Text' && typeof node.props.children === 'string'
          && node.props.children.startsWith(suggestion.label))[0]!
        const body = nodes.get(`text:${String(text.props.children)}`)!
        const label = measureProfileRow({ type: 'Text', props: { style: text.props.style as TextStyle }, children: [suggestion.label] }, body.getComputedWidth(), 1).texts[0]!
        expect(label.lines, suggestion.label).toBe(1)
      }
    } finally { layout.freeRecursive() }
  } finally { await renderer.act(() => tree.unmount()); translation.words = {} }
})

const allowanceCases = [320, 412].flatMap(width => [en, ptBR].flatMap(messages => [5, 50].flatMap(limit =>
  [false, true].map(withSuggestions => ({ width, messages, limit, withSuggestions, fontScale: 1 })))))
  .concat([en, ptBR].map(messages => ({ width: 320, messages, limit: 50, withSuggestions: true, fontScale: 2 })))

function assertAllowanceNodes(nodes: Map<string, YogaNode>, nearLimit: boolean, exhausted: boolean) {
  const status = nodes.get('composer-status-slot')
  expect(Boolean(status)).toBe(nearLimit)
  expect(nodes.has('composer-usage')).toBe(nearLimit && !exhausted)
  if (nearLimit) {
    const noticeHeight = nodes.get('composer-allowance-reason')!.getComputedHeight() + nodes.get('composer-renewal')!.getComputedHeight() + SPACING.s8
    expect(status!.getComputedHeight()).toBeCloseTo(Math.max(SPACING.s96, noticeHeight), 0)
    for (const id of ['composer-usage', 'composer-suggestions-layout']) {
      const content = nodes.get(id)
      if (content) expect(bounds(content).bottom).toBeLessThanOrEqual(bounds(status!).bottom)
    }
  }
}

it.each(allowanceCases)('keeps Hoje stable near $limit messages at $width with chips $withSuggestions and scale $fontScale', async ({ width, messages, limit, withSuggestions, fontScale }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  const measured: { height: number; inputTop: number }[] = []
  for (const used of [limit - 3, limit - 2, limit - 1, limit]) {
    const nearLimit = limit - used <= AI_MESSAGE_COUNTER_THRESHOLD
    const reason = messages.shell.composer.limit.reason.replace('{allowance}', String(limit))
    let tree!: Tree
    await renderer.act(() => {
      tree = renderer.create(<Composer value="" suggestions={withSuggestions && used < limit ? dailySuggestions(messages) : []}
        words={messages.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()}
        usageMessage={nearLimit && used < limit ? messages.shell.composer.usage.replace('{used}', String(used)).replace('{limit}', String(limit)) : undefined}
        allowanceReason={nearLimit ? reason : undefined}
        renewalHint={nearLimit ? messages.shell.composer.limit.renewal : undefined}
        {...used === limit ? { state: 'atLimit', limitReason: reason } : { state: 'idle' }} />) as Tree
    })
    const suggestions = tree.root.findAll(node => node.props.testID === 'composer-suggestions-layout')[0]
    if (suggestions) {
      const onLayout = suggestions.props.onLayout as (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void
      await renderer.act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: width - 32, height: 48 } } }))
    }
    const nodes = new Map<string, YogaNode>()
    const layout = build(tree.toJSON(), nodes, fontScale)
    try {
      layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
      measured.push({ height: layout.getComputedHeight(), inputTop: nodes.get('composer-field')!.getComputedTop() })
      assertAllowanceNodes(nodes, nearLimit, used === limit)
      if (!nearLimit && !withSuggestions) expect(nodes.get('composer-field')!.getComputedTop()).toBe(SPACING.s16 + StyleSheet.hairlineWidth)
    } finally { layout.freeRecursive(); await renderer.act(() => tree.unmount()) }
  }
  expect(measured[0]!.height).toBeLessThan(measured[1]!.height)
  expect(measured[1]).toEqual(measured[2])
  expect(measured[2]).toEqual(measured[3])
  __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
})

function readMountedFrame(tree: Tree, width: number, fontScale: number) {
  const nodes = new Map<string, YogaNode>()
  const layout = build(tree.toJSON(), nodes, fontScale)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    const field = bounds(nodes.get('composer-field')!)
    const input = bounds(nodes.get('input')!)
    for (const [id, node] of nodes) if (id.startsWith('button:')) {
      const target = bounds(node)
      expect(target.right - target.left, id).toBeGreaterThanOrEqual(48)
      expect(target.bottom - target.top, id).toBeGreaterThanOrEqual(48)
      expect(target.left, id).toBeGreaterThanOrEqual(field.left + 4)
      expect(target.right, id).toBeLessThanOrEqual(field.right - 4)
      expect(target.top, id).toBeGreaterThanOrEqual(field.top + 4)
      expect(target.bottom, id).toBeLessThanOrEqual(field.bottom - 4)
      expect(target.right <= input.left || target.left >= input.right || target.bottom <= input.top || target.top >= input.bottom, id).toBe(true)
    }
    expect(input.right - input.left).toBeGreaterThanOrEqual(48 * fontScale)
    expect(input.bottom - input.top).toBeLessThanOrEqual(5 * 24 * fontScale + 24)
    const placeholder = tree.root.findAll(node => node.props.testID === 'composer-placeholder')[0]
    if (placeholder && fontScale === 1) {
      const { fontFamily, fontSize, lineHeight } = StyleSheet.flatten(placeholder.props.style as TextStyle)
      const fontStyle: TextStyle = { fontFamily, fontSize, lineHeight }
      const text = measureProfileRow({ type: 'Text', props: { style: fontStyle },
        children: [placeholder.props.children as string] }, input.right - input.left - 16, fontScale).texts[0]!
      expect(text.lines).toBe(1)
    }
    return { height: layout.getComputedHeight(), inputTop: input.top, fieldHeight: field.bottom - field.top }
  } finally { layout.freeRecursive() }
}

function assertMountedActions(tree: Tree, messages: typeof en, state: 'idle' | 'atLimit') {
  const field = tree.root.findAll(node => node.props.testID === 'composer-field')[0]!
  const controls = field.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button')
  const names = controls.map(node => String(node.props.accessibilityLabel))
  const menu = field.findAll(node => node.type === Menu)[0]!
  const items = menu.props.items as { id: string }[]
  const expected = [`${messages.todayAstra.openConversation}, ${messages.nav.astra}`, messages.shell.composer.actions,
    `${messages.shell.composer.send}, ${messages.habits.form.askDate}`]
  if (state === 'idle' && !items.some(item => item.id === 'paste')) expected.push(messages.shell.composer.paste)
  expect([...names].sort((left, right) => left.localeCompare(right))).toEqual(expected.sort((left, right) => left.localeCompare(right)))
  const send = controls.find(node => node.props.accessibilityLabel === `${messages.shell.composer.send}, ${messages.habits.form.askDate}`)!
  expect(send.props.disabled).toBe(true)
}

async function replayTextMeasurements(tree: Tree, width: number, fontScale: number) {
  for (const id of ['composer-paste-measure', 'composer-placeholder-measure', 'composer-placeholder']) {
    const element = tree.root.findAll(node => node.props.testID === id)[0]
    if (!element) continue
    const nodes = new Map<string, YogaNode>()
    const layout = build(tree.toJSON(), nodes, fontScale)
    try {
      layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
      const { fontFamily, fontSize, lineHeight, letterSpacing } = StyleSheet.flatten(element.props.style as TextStyle)
      const fontStyle: TextStyle = { fontFamily, fontSize, lineHeight, letterSpacing }
      const measured = measureProfileRow({ type: 'Text', props: { style: fontStyle },
        children: [element.props.children as string] }, nodes.get(id)!.getComputedWidth(), fontScale).texts[0]!
      if (id === 'composer-placeholder') {
        const onLayout = element.props.onLayout as (event: { nativeEvent: Pick<LayoutChangeEvent['nativeEvent'], 'layout'> }) => void
        await renderer.act(() => onLayout({ nativeEvent: { layout: {
          x: 0, y: 12, width: measured.width, height: measured.height,
        } } }))
      } else {
        const line: TextLayoutEvent['nativeEvent']['lines'][number] = { x: 0, y: 0, width: measured.width, height: measured.height / measured.lines,
          ascender: 0, descender: 0, capHeight: 0, xHeight: 0, text: element.props.children as string }
        const onTextLayout = element.props.onTextLayout as (event: { nativeEvent: Pick<TextLayoutEvent['nativeEvent'], 'lines'> }) => void
        await renderer.act(() => onTextLayout({ nativeEvent: {
          lines: Array.from({ length: measured.lines }, (_, index) => ({ ...line, y: index * line.height })),
        } }))
      }
    } finally { layout.freeRecursive() }
  }
}

it.each(allowanceCases)('retains the measured frame through allowance transitions at $width with $limit chips $withSuggestions and scale $fontScale', async ({ width, messages, limit, withSuggestions, fontScale }) => {
  translation.words = { 'nav.astra': messages.nav.astra, 'habits.form.askDate': messages.habits.form.askDate }
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  const reason = messages.shell.composer.limit.reason.replace('{allowance}', String(limit))
  const onSend = vi.fn()
  const onChangeValue = vi.fn()
  const configuration = { value: '', words: messages.shell.composer, suggestions: [], onSend, onChangeValue,
    allowanceReason: reason, renewalHint: messages.shell.composer.limit.renewal,
    onAttachFile: vi.fn(), attachWords: { ...messages.shell.composer.attach, remove: (name: string) => name },
    onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation }
  const renderState = (state: 'idle' | 'atLimit') => <Composer {...configuration}
    suggestions={withSuggestions && state === 'idle' ? dailySuggestions(messages) : []}
    {...state === 'idle' ? { state, usageMessage: messages.shell.composer.usage.replace('{used}', String(limit - 1)).replace('{limit}', String(limit)) }
      : { state, limitReason: reason }} />
  let tree!: Tree
  await renderer.act(() => { tree = renderer.create(renderState('idle')) as Tree })
  try {
    await replayTextMeasurements(tree, width, fontScale)
    const initial = readMountedFrame(tree, width, fontScale)
    await replayTextMeasurements(tree, width, fontScale)
    expect(readMountedFrame(tree, width, fontScale)).toEqual(initial)
    for (const state of ['atLimit', 'idle', 'atLimit'] as const) {
      await renderer.act(() => tree.update(renderState(state)))
      expect(readMountedFrame(tree, width, fontScale)).toEqual(initial)
      await replayTextMeasurements(tree, width, fontScale)
      expect(readMountedFrame(tree, width, fontScale)).toEqual(initial)
      expect(tree.root.findAll(node => String(node.type) === 'TextInput')[0]!.props.editable).toBe(state === 'idle')
      assertMountedActions(tree, messages, state)
    }
    expect(onSend).not.toHaveBeenCalled()
    expect(onChangeValue).not.toHaveBeenCalled()
  } finally {
    await renderer.act(() => tree.unmount())
    translation.words = {}
    __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  }
})

it.each([320, 412].flatMap(width => [en, ptBR].flatMap(messages => [1, 2].map(fontScale => ({ width, messages, fontScale })))))(
  'grows the actual typed input to five lines at $width and scale $fontScale', async ({ width, messages, fontScale }) => {
    translation.words = { 'nav.astra': messages.nav.astra, 'habits.form.askDate': messages.habits.form.askDate }
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    let tree!: Tree
    await renderer.act(() => { tree = renderer.create(<Composer state="idle" value="Draft" suggestions={[]}
      words={messages.shell.composer} onSend={vi.fn()} onChangeValue={vi.fn()} onAttachFile={vi.fn()}
      attachWords={{ ...messages.shell.composer.attach, remove: name => name }} />) as Tree })
    try {
      for (const lines of [1, 3, 5, 8, 1]) {
        const input = tree.root.findAll(node => String(node.type) === 'TextInput')[0]!
        const onContentSizeChange = input.props.onContentSizeChange as (event: { nativeEvent: { contentSize: { width: number; height: number } } }) => void
        await renderer.act(() => onContentSizeChange({ nativeEvent: { contentSize: {
          width, height: lines * 24 * fontScale + 24,
        } } }))
        expect(StyleSheet.flatten(input.props.style as TextStyle).height).toBe(Math.min(lines, 5) * 24 * fontScale + 24)
        readMountedFrame(tree, width, fontScale)
      }
    } finally {
      await renderer.act(() => tree.unmount())
      translation.words = {}
      __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
    }
  },
)

it.each([['en', en], ['pt-BR', ptBR]] as const)('keeps the 50-message counter on one line at 320 in %s', async (locale, messages) => {
  let tree!: Tree
  const usage = new IntlMessageFormat(messages.shell.composer.usage, locale).format({ used: 48, limit: 50 }) as string
  await renderer.act(() => {
    tree = renderer.create(<Composer state="idle" value="" suggestions={[]} words={messages.shell.composer}
      allowanceReason={messages.shell.composer.limit.reason.replace('{allowance}', '50')}
      renewalHint={messages.shell.composer.limit.renewal}
      usageMessage={usage} onChangeValue={vi.fn()} onSend={vi.fn()} />) as Tree
  })
  const nodes = new Map<string, YogaNode>()
  const layout = build(tree.toJSON(), nodes)
  try {
    layout.calculateLayout(320, undefined, Yoga.DIRECTION_LTR)
    const counter = nodes.get('composer-usage')!
    expect(counter.getComputedHeight()).toBeCloseTo(16.8, 0)
    expect(counter.getComputedWidth()).toBeLessThanOrEqual(288)
  } finally { layout.freeRecursive(); await renderer.act(() => tree.unmount()) }
})
