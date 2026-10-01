import React from 'react'
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Square } from '@/components/ui/icons'
import { Composer } from '@/components/shell/composer'
import { createTokensV2 } from '@/lib/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import Yoga, { type Config, type Node as YogaNode } from 'yoga-layout'

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-native')>()
  const ReactModule = await import('react')
  type PressableMockProps = Record<string, unknown> & {
    children?: React.ReactNode
    style?: React.ComponentProps<typeof original.Pressable>['style']
    onPressIn?: unknown
    onPressOut?: unknown
  }

  const Pressable = ReactModule.forwardRef<unknown, PressableMockProps>(
    function PressableMock({ children, style, onPressIn, onPressOut, ...rest }, ref) {
      const [pressed, setPressed] = ReactModule.useState(false)
      const renderedStyle = typeof style === 'function' ? style({ pressed }) : style
      return ReactModule.createElement(
        'Pressable',
        {
          ...rest,
          ref,
          style: renderedStyle,
          onPressIn: () => {
            setPressed(true)
            if (typeof onPressIn === 'function') onPressIn()
          },
          onPressOut: () => {
            setPressed(false)
            if (typeof onPressOut === 'function') onPressOut()
          },
        },
        children as React.ReactNode,
      )
    },
  )

  return { ...original, Pressable, AccessibilityInfo: { ...original.AccessibilityInfo, sendAccessibilityEvent: vi.fn() } }
})

const TestRenderer = require('react-test-renderer')

const words = {
  placeholder: 'placeholder sentinel',
  send: 'send sentinel',
  suggestionsLabel: 'suggestions sentinel',
}
const voiceWords = {
  start: 'voice start sentinel',
  stop: 'voice stop sentinel',
  recording: 'recording sentinel',
  transcribing: 'transcribing sentinel',
}
const attachWords = {
  file: 'attach file sentinel',
  image: 'attach image sentinel',
  trayLabel: 'tray sentinel',
  remove: (name: string) => `remove sentinel ${name}`,
}

function suggestions(count: 3 | 6): ComposerSuggestions {
  return Array.from({ length: count }, (_, index) => ({
    id: `chip-${index}`,
    label: `chip sentinel ${index}`,
    onSelect: vi.fn(),
  })) as unknown as ComposerSuggestions
}

function props(overrides: Record<string, unknown> = {}): ComposerProps {
  return {
    words,
    value: '',
    onChangeValue: vi.fn(),
    onSend: vi.fn(),
    suggestions: suggestions(3),
    state: 'idle',
    ...overrides,
  }
}

function renderComposer(composerProps: ComposerProps) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<Composer {...composerProps} />)
  })
  return tree
}

it('keeps one complete suggestion focus outline inside the scroller without resizing chips', () => {
  const tree = renderComposer(props())
  const chip = () => byLabel(tree.root, 'chip sentinel 0')[0]
  const resting = StyleSheet.flatten(chip().props.style)
  const target = {}
  const event = { nativeEvent: { target: 1 }, target, currentTarget: target }
  TestRenderer.act(() => chip().props.onFocus?.(event))
  const focused = StyleSheet.flatten(chip().props.style)
  expect(focused.outlineWidth).toBe(2)
  expect(focused.outlineOffset + focused.outlineWidth).toBeLessThanOrEqual(0)
  expect(focused.minHeight).toBe(resting.minHeight)
  expect(focused.paddingHorizontal).toBe(resting.paddingHorizontal)
  TestRenderer.act(() => chip().props.onBlur?.(event))
  expect(StyleSheet.flatten(chip().props.style).outlineWidth ?? 0).toBe(0)
})

function byLabel(root: ReturnType<typeof TestRenderer.create>['root'], label: string) {
  return root.findAll(
    (node: { type?: unknown; props?: Record<string, unknown> }) =>
      typeof node.type === 'string' && node.props?.accessibilityLabel === label,
  )
}

function textValues(root: ReturnType<typeof TestRenderer.create>['root']) {
  return root.findAllByType('Text').map((node: { props: { children: unknown } }) => node.props.children)
}

function pressControl(control: { props: Record<string, (() => void) | undefined> }) {
  TestRenderer.act(() => control.props.onPressIn?.())
  TestRenderer.act(() => control.props.onPress?.())
  TestRenderer.act(() => control.props.onPressOut?.())
}

interface ComposerHost {
  type: string
  props: Record<string, unknown>
  children: (ComposerHost | string)[] | null
}

function applyComposerLayoutStyle(node: YogaNode, style: Record<string, unknown>) {
  const dimensions = ['Width', 'Height', 'MinWidth', 'MinHeight', 'MaxHeight', 'Flex', 'FlexGrow', 'FlexShrink', 'FlexBasis'] as const
  for (const dimension of dimensions) {
    const key = `${dimension.charAt(0).toLowerCase()}${dimension.slice(1)}`
    const value = style[key]
    if (typeof value === 'number') node[`set${dimension}`](value)
  }
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignItems === 'flex-end') node.setAlignItems(Yoga.ALIGN_FLEX_END)
  if (style.justifyContent === 'flex-end') node.setJustifyContent(Yoga.JUSTIFY_FLEX_END)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.borderWidth === 'number') node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
}

function applyComposerLayoutInsets(node: YogaNode, style: Record<string, unknown>) {
  for (const [suffix, edge] of [['', Yoga.EDGE_ALL], ['Horizontal', Yoga.EDGE_HORIZONTAL], ['Vertical', Yoga.EDGE_VERTICAL]] as const) {
    const value = style[`padding${suffix}`]
    if (typeof value === 'number') node.setPadding(edge, value)
  }
  if (style.position === 'absolute') {
    node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
    for (const [key, edge] of [['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT], ['top', Yoga.EDGE_TOP]] as const) {
      const value = style[key]
      if (typeof value === 'number') node.setPosition(edge, value)
    }
  }
}

function composerLayout(host: ComposerHost, config: Config, nodes: Map<string, YogaNode>, lineCount: number): YogaNode {
  const node = Yoga.Node.create(config)
  const style = (StyleSheet.flatten(host.props.style as never) as Record<string, unknown> | undefined) ?? {}
  if (typeof host.props.testID === 'string') nodes.set(host.props.testID, node)
  applyComposerLayoutStyle(node, style)
  applyComposerLayoutInsets(node, style)
  if (host.type === 'TextInput') {
    nodes.set('input', node)
    node.setMeasureFunc(() => ({ width: 80, height: 24 * lineCount }))
  } else if (host.type === 'Text') {
    node.setMeasureFunc(() => ({ width: 80, height: 24 }))
  } else if (host.type !== 'Pressable') {
    const children = (host.children ?? []).filter((child): child is ComposerHost => typeof child !== 'string')
    children.forEach((child, index) => node.insertChild(composerLayout(child, config, nodes, lineCount), index))
  }
  return node
}

describe('Composer (mobile)', () => {
  it.each([320, 360, 412, 600])('contains content-sized input and grouped controls at %ipx with native Yoga errata', (width) => {
    const config = Yoga.Config.create()
    config.setErrata(Yoga.ERRATA_ALL)
    try {
      for (const locale of [en, ptBR]) for (const withOpener of [false, true]) for (const value of ['', 'A single line', 'First\nSecond\nThird', 'One\nTwo\nThree\nFour\nFive']) {
        const lineCount = value.split('\n').length
        const tree = renderComposer(props({
          value, suggestions: [], words: { ...words, placeholder: locale.shell.composer.placeholder },
          onAttachFile: vi.fn(), onAttachImage: vi.fn(), attachWords, onVoice: vi.fn(), voiceWords,
          ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: 'Open conversation' } : {}),
        }))
        const nodes = new Map<string, YogaNode>()
        let layout = composerLayout(tree.toJSON(), config, nodes, lineCount)
        try {
          layout.calculateLayout(width, undefined)
          TestRenderer.act(() => tree.root.findByProps({ testID: 'composer-field' }).props.onLayout({ nativeEvent: { layout: { width: nodes.get('composer-field')!.getComputedWidth() } } }))
          layout.freeRecursive()
          nodes.clear()
          layout = composerLayout(tree.toJSON(), config, nodes, lineCount)
          layout.calculateLayout(width, undefined)
          const input = nodes.get('input')!
          const slot = nodes.get('composer-text-slot')!
          const field = nodes.get('composer-field')!
          const controls = nodes.get('composer-controls')!
          const row = field.getParent()!
          expect(input.getComputedHeight()).toBe(Math.min(96, 24 * lineCount + 24))
          expect(field.getComputedTop()).toBeGreaterThanOrEqual(0)
          expect(field.getComputedTop() + field.getComputedHeight()).toBeLessThanOrEqual(row.getComputedHeight())
          expect(slot.getComputedTop() + input.getComputedTop()).toBeGreaterThanOrEqual(0)
          expect(slot.getComputedTop() + input.getComputedTop() + input.getComputedHeight()).toBeLessThanOrEqual(field.getComputedHeight())
          expect(controls.getComputedHeight()).toBe(44)
          expect(controls.getComputedTop() + controls.getComputedHeight()).toBeLessThanOrEqual(field.getComputedHeight())
          expect(controls.getComputedWidth()).toBe(140)
          expect(input.getComputedWidth() - input.getComputedPadding(Yoga.EDGE_LEFT) - input.getComputedPadding(Yoga.EDGE_RIGHT)).toBeGreaterThanOrEqual(width === 320 && withOpener ? 140 : 160)
        } finally {
          layout.freeRecursive()
          TestRenderer.act(() => tree.unmount())
        }
      }
    } finally {
      config.free()
    }
  })

  it('gives text a flexible word-sized minimum and lets the controls wrap together', () => {
    const tree = renderComposer(props({ onAttachFile: vi.fn(), onAttachImage: vi.fn(), attachWords, onVoice: vi.fn(), voiceWords }))
    const input = tree.root.findByType('TextInput')
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ minWidth: 0 })
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'composer-text-slot' }).props.style)).toMatchObject({ flexGrow: 1, flexShrink: 1, flexBasis: 176, minWidth: 176 })
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'composer-field' }).props.style)).toMatchObject({ flexWrap: 'wrap' })
    const placeholder = tree.root.findByProps({ testID: 'composer-placeholder' })
    expect(placeholder.props.numberOfLines).toBe(1)
    expect(placeholder.props.ellipsizeMode).toBe('tail')
  })

  it('keeps the text minimum inside the field when focus thickens its border without another layout event', () => {
    const tree = renderComposer(props())
    const field = tree.root.findByProps({ testID: 'composer-field' })
    TestRenderer.act(() => field.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 176, height: 96 } } }))
    const textMinimum = () => StyleSheet.flatten(tree.root.findByProps({ testID: 'composer-text-slot' }).props.style).minWidth
    expect(textMinimum()).toBe(158)
    TestRenderer.act(() => tree.root.findByType('TextInput').props.onFocus())
    expect(textMinimum()).toBe(156)
    TestRenderer.act(() => tree.root.findByType('TextInput').props.onBlur())
    expect(textMinimum()).toBe(158)
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['recording', 'transcribing'] as const)('replaces the field while %s and returns the transcript to composing', (state) => {
    const capability = { onVoice: vi.fn(), voiceWords }
    const tree = renderComposer(props({ ...capability, state, value: 'existing draft' }))
    expect(tree.root.findAllByType('TextInput')).toHaveLength(0)
    const stop = byLabel(tree.root, voiceWords.stop)[0]
    expect(stop.props.disabled).toBe(state === 'transcribing')
    TestRenderer.act(() => tree.update(<Composer {...props({ ...capability, value: 'voice transcript' })} />))
    expect(tree.root.findByType('TextInput').props.value).toBe('voice transcript')
    expect(tree.root.findByType('TextInput').props.editable).toBe(true)
  })

  it('runs a mono tabular clock only while recording and resets for the next recording', () => {
    vi.useFakeTimers()
    const capability = { onVoice: vi.fn(), voiceWords }
    const tree = renderComposer(props({ ...capability, state: 'recording' }))
    try {
      expect(textValues(tree.root)).toContain('00:00')
      TestRenderer.act(() => vi.advanceTimersByTime(65000))
      expect(textValues(tree.root)).toContain('01:05')
      const clock = tree.root.findAllByType('Text').find((node: { props: { children: unknown } }) => node.props.children === '01:05')
      expect(StyleSheet.flatten(clock.props.style)).toMatchObject({ fontFamily: 'GeistMono_400Regular', fontVariant: ['tabular-nums'] })
      TestRenderer.act(() => tree.update(<Composer {...props({ ...capability, state: 'transcribing' })} />))
      expect(textValues(tree.root)).not.toContain('01:05')
      TestRenderer.act(() => tree.update(<Composer {...props({ ...capability })} />))
      TestRenderer.act(() => tree.update(<Composer {...props({ ...capability, state: 'recording' })} />))
      expect(textValues(tree.root)).toContain('00:00')
    } finally {
      TestRenderer.act(() => tree.update(<></>))
      vi.useRealTimers()
    }
  })

  it('renders three suggestions in their named group', async () => {
    const tree = await renderComposer(props())
    const group = byLabel(tree.root, words.suggestionsLabel)[0]
    expect(group).toBeDefined()
    expect(textValues(tree.root).filter((value: unknown) => String(value).startsWith('chip sentinel'))).toHaveLength(3)
  })

  it('lays out the composer root with native styles', async () => {
    const tree = await renderComposer(props())
    const root = tree.root.findByProps({ testID: 'composer-idle' })
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({
      flexDirection: 'column',
      gap: 12,
      padding: 16,
    })
  })

  it('animates the Astra conversation control on press', async () => {
    const timing = vi.spyOn(Animated, 'timing')
    const onOpenConversation = vi.fn()
    const conversationLabel = 'open conversation sentinel'
    const tree = await renderComposer(props({ onOpenConversation, conversationLabel }))
    const control = byLabel(tree.root, conversationLabel)[0]

    TestRenderer.act(() => control.props.onPressIn())
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 150, toValue: 0.96, useNativeDriver: true }),
    )

    TestRenderer.act(() => control.props.onPressOut())
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 150, toValue: 1, useNativeDriver: true }),
    )
    timing.mockRestore()
  })

  it('renders no chip row for an empty suggestion list', async () => {
    const tree = await renderComposer(props({ suggestions: [] }))
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(0)
  })

  it('renders six suggestions', async () => {
    const tree = await renderComposer(props({ suggestions: suggestions(6) }))
    expect(textValues(tree.root).filter((value: unknown) => String(value).startsWith('chip sentinel'))).toHaveLength(6)
  })

  it('moves accessibility focus to the persistent input when a chip sends', async () => {
    const chips = suggestions(3)
    const tree = await renderComposer(props({ suggestions: chips }))
    const chip = tree.root.findAllByType('Pressable').find(
      (node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === chips[0]!.label,
    )
    if (!chip) throw new Error('Expected first chip')
    pressControl(chip)
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.objectContaining({ __nativeTag: expect.any(Number) }), 'focus')
  })

  it('selects only the pressed suggestion', async () => {
    const chips = suggestions(3)
    const tree = await renderComposer(props({ suggestions: chips }))
    const secondChip = tree.root.findAllByType('Pressable').find(
      (node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === chips[1]!.label,
    )
    if (secondChip) pressControl(secondChip)
    expect(chips[1]!.onSelect).toHaveBeenCalledOnce()
    expect(chips[0]!.onSelect).not.toHaveBeenCalled()
    expect(chips[2]!.onSelect).not.toHaveBeenCalled()
  })

  it('reports input changes', async () => {
    const onChangeValue = vi.fn()
    const tree = await renderComposer(props({ onChangeValue }))
    TestRenderer.act(() => byLabel(tree.root, words.placeholder)[0].props.onChangeText('oi'))
    expect(onChangeValue).toHaveBeenCalledWith('oi')
  })

  it('reports input focus and blur to the conversation scroll owner', async () => {
    const onInputFocus = vi.fn()
    const onInputBlur = vi.fn()
    const tree = await renderComposer(props({ onInputFocus, onInputBlur }))
    const input = byLabel(tree.root, words.placeholder)[0]
    TestRenderer.act(() => input.props.onFocus())
    TestRenderer.act(() => input.props.onBlur())
    expect(onInputFocus).toHaveBeenCalledOnce()
    expect(onInputBlur).toHaveBeenCalledOnce()
  })

  it('replaces its resting field border with one focused border', async () => {
    const tree = await renderComposer(props())
    const input = byLabel(tree.root, words.placeholder)[0]
    const field = () => {
      let ancestor = input.parent
      while (ancestor && StyleSheet.flatten(ancestor.props.style)?.borderWidth === undefined) ancestor = ancestor.parent
      if (!ancestor) throw new Error('Expected a bordered field')
      return ancestor
    }
    expect(StyleSheet.flatten(field().props.style).borderWidth).toBe(1)
    TestRenderer.act(() => input.props.onFocus())
    expect(StyleSheet.flatten(field().props.style).borderWidth).toBe(2)
    expect(StyleSheet.flatten(input.props.style).borderWidth).toBeUndefined()
    TestRenderer.act(() => input.props.onBlur())
    expect(StyleSheet.flatten(field().props.style).borderWidth).toBe(1)
  })

  it.each(['', '   '])('does not send a blank value %j', async (value) => {
    const onSend = vi.fn()
    const tree = await renderComposer(props({ value, onSend }))
    TestRenderer.act(() => byLabel(tree.root, words.send)[0].props.onPress())
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends a nonblank value once', async () => {
    const onSend = vi.fn()
    const tree = await renderComposer(props({ value: 'oi', onSend }))
    pressControl(byLabel(tree.root, words.send)[0])
    expect(onSend).toHaveBeenCalledOnce()
  })

  it.each([
    ['idle with an empty field', { state: 'idle', value: '' }, false, true],
    ['idle with text', { state: 'idle', value: 'oi' }, true, false],
    ['idle with an image only', { state: 'idle', attachments: [{ id: 'image-id', kind: 'image', name: 'walk.png' }] }, false, true],
    ['idle with a file only', { state: 'idle', attachments: [{ id: 'file-id', kind: 'file', name: 'notes.txt' }] }, true, false],
    ['sending', { state: 'sending', value: 'oi' }, true, true],
    ['atLimit', { state: 'atLimit', value: 'oi', limitReason: 'limit sentinel' }, false, true],
    ['offline', { state: 'offline', value: 'oi', limitReason: 'offline sentinel' }, false, true],
    ['recording', { state: 'recording', value: 'oi', onVoice: vi.fn(), voiceWords }, false, true],
    ['transcribing', { state: 'transcribing', value: 'oi', onVoice: vi.fn(), voiceWords }, false, true],
  ] as const)('styles the send control for %s', async (_case, overrides, accented, disabled) => {
    const tree = await renderComposer(props(overrides))
    const send = byLabel(tree.root, words.send)[0]
    expect(send.props.testID).toBe(accented ? 'composer-send-accent' : 'composer-send-neutral')
    if (_case === 'sending') expect(StyleSheet.flatten(send.props.style).opacity).toBeUndefined()
    else if (disabled) expect(StyleSheet.flatten(send.props.style).opacity).toBeCloseTo(0.4)
    expect(send.props.disabled).toBe(disabled)
  })

  it('submits nonblank text and ignores a blank keyboard submit', async () => {
    const onSend = vi.fn()
    const tree = await renderComposer(props({ value: 'oi', onSend }))
    const input = byLabel(tree.root, words.placeholder)[0]

    TestRenderer.act(() => input.props.onSubmitEditing())
    expect(onSend).toHaveBeenCalledOnce()

    TestRenderer.act(() => tree.update(<Composer {...props({ value: '  ', onSend })} />))
    TestRenderer.act(() => byLabel(tree.root, words.placeholder)[0].props.onSubmitEditing())
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('requires nonblank text when an image is attached', async () => {
    const onSend = vi.fn()
    const attachedImage = {
      onSend,
      onAttachImage: vi.fn(),
      attachWords,
      attachments: [{ id: 'image-id', kind: 'image' as const, name: 'walk.png' }],
      onAttachRemove: vi.fn(),
    }
    const tree = await renderComposer(props({
      value: '   ',
      ...attachedImage,
    }))
    const send = byLabel(tree.root, words.send)[0]
    expect(send.props.disabled).toBe(true)
    TestRenderer.act(() => send.props.onPress())
    expect(onSend).not.toHaveBeenCalled()

    TestRenderer.act(() => tree.update(<Composer {...props({ value: 'log my walk', ...attachedImage })} />))
    expect(byLabel(tree.root, words.send)[0].props.disabled).toBe(false)
    TestRenderer.act(() => byLabel(tree.root, words.send)[0].props.onPress())
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('disables input and send and hides suggestions during sending', async () => {
    const tree = await renderComposer(props({ state: 'sending', value: 'oi' }))
    expect(byLabel(tree.root, words.placeholder)[0].props.editable).toBe(false)
    expect(byLabel(tree.root, words.send)[0].props.disabled).toBe(true)
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(0)
  })

  it('renders only the limit reason above disabled neutral controls', async () => {
    const tree = await renderComposer(props({ state: 'atLimit', limitReason: 'limit sentinel' }))
    expect(textValues(tree.root)).toContain('limit sentinel')
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(0)
    expect(byLabel(tree.root, words.placeholder)[0].props.editable).toBe(false)
    expect(tree.root.findByProps({ testID: 'composer-send-neutral' })).toBeDefined()
  })

  it('renders the optional at-limit recovery action', async () => {
    const tree = await renderComposer(
      props({
        state: 'atLimit',
        limitReason: 'limit sentinel',
        limitRecovery: React.createElement('Text', null, 'recovery sentinel'),
      }),
    )
    expect(textValues(tree.root)).toContain('recovery sentinel')
  })

  it('renders and invokes voice only when the capability is present', async () => {
    const onVoice = vi.fn()
    const tree = await renderComposer(props({ onVoice, voiceWords }))
    pressControl(byLabel(tree.root, voiceWords.start)[0])
    expect(onVoice).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.update(<Composer {...props()} />))
    expect(byLabel(tree.root, voiceWords.start)).toHaveLength(0)
  })

  it('replaces suggestions with recording status and a stop control', async () => {
    const onVoice = vi.fn()
    const tree = await renderComposer(props({ state: 'recording', onVoice, voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.recording)
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(0)
    expect(byLabel(tree.root, voiceWords.stop)).toHaveLength(1)
    expect(StyleSheet.flatten(byLabel(tree.root, voiceWords.stop)[0].props.style)).toMatchObject({
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: createTokensV2('purple', 'dark').primary,
    })
    pressControl(byLabel(tree.root, voiceWords.stop)[0])
    expect(onVoice).toHaveBeenCalledOnce()
  })

  it('clips every composer icon hit area to a circle', async () => {
    const tree = await renderComposer(props({ onAttachFile: vi.fn(), onAttachImage: vi.fn(), onVoice: vi.fn(), attachWords, voiceWords }))
    for (const label of [attachWords.file, attachWords.image, voiceWords.start]) {
      expect(StyleSheet.flatten(byLabel(tree.root, label)[0].props.style)).toMatchObject({ borderRadius: 999, overflow: 'hidden' })
    }
  })

  it('keeps the stop control and shows the connection reason during an offline recording', async () => {
    const onVoice = vi.fn()
    const tree = await renderComposer(props({ state: 'recording', words: { ...words, placeholder: en.shell.composer.offline.placeholder, offlineReason: en.shell.composer.offline.reason }, onVoice, voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.recording)
    expect(textValues(tree.root)).toContain(en.shell.composer.offline.reason)
    pressControl(byLabel(tree.root, voiceWords.stop)[0])
    expect(onVoice).toHaveBeenCalledOnce()
  })

  it('replaces the input with transcribing status and an inactive stop', async () => {
    const tree = await renderComposer(props({ state: 'transcribing', onVoice: vi.fn(), voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.transcribing)
    expect(tree.root.findAllByType('TextInput')).toHaveLength(0)
    expect(byLabel(tree.root, voiceWords.stop)[0].props.disabled).toBe(true)
    const icon = byLabel(tree.root, voiceWords.stop)[0].findByType(Square)
    expect(icon.props.fill).toBe(createTokensV2('purple', 'dark').fg3)
    expect(icon.props.color).toBe(createTokensV2('purple', 'dark').fg3)
  })

  it('renders attachment capability without an empty tray', async () => {
    const onAttachFile = vi.fn()
    const onAttachImage = vi.fn()
    const tree = await renderComposer(props({ onAttachFile, onAttachImage, attachWords }))
    expect(byLabel(tree.root, attachWords.file)).toHaveLength(1)
    expect(byLabel(tree.root, attachWords.image)).toHaveLength(1)
    expect(byLabel(tree.root, attachWords.trayLabel)).toHaveLength(0)
    pressControl(byLabel(tree.root, attachWords.file)[0])
    pressControl(byLabel(tree.root, attachWords.image)[0])
    expect(onAttachFile).toHaveBeenCalledOnce()
    expect(onAttachImage).toHaveBeenCalledOnce()
  })

  it('allows a text file to send without typed text', async () => {
    const onSend = vi.fn()
    const tree = await renderComposer(props({
      value: '   ',
      onSend,
      onAttachFile: vi.fn(),
      attachWords,
      attachments: [{ id: 'file-id', kind: 'file' as const, name: 'notes.txt' }],
      onAttachRemove: vi.fn(),
    }))
    const send = byLabel(tree.root, words.send)[0]
    expect(send.props.disabled).toBe(false)
    pressControl(send)
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('names, distinguishes, and removes each attachment independently', async () => {
    const onAttachRemove = vi.fn()
    const attachments = [
      { id: 'file-id', kind: 'file' as const, name: 'notes.txt' },
      { id: 'image-id', kind: 'image' as const, name: 'walk.png' },
    ]
    const tree = await renderComposer(props({ onAttachFile: vi.fn(), attachWords, attachments, onAttachRemove }))
    expect(tree.root.findByProps({ testID: 'composer-attachment-tray' }).props.accessible).toBe(false)
    expect(textValues(tree.root)).toEqual(expect.arrayContaining(['notes.txt', 'walk.png']))
    expect(byLabel(tree.root, attachWords.remove('notes.txt'))).toHaveLength(1)
    pressControl(byLabel(tree.root, attachWords.remove('walk.png'))[0])
    expect(onAttachRemove).toHaveBeenCalledOnce()
    expect(onAttachRemove).toHaveBeenCalledWith('image-id')
    expect(tree.root.findByProps({ testID: 'composer-attachment-file' })).toBeDefined()
    expect(tree.root.findByProps({ testID: 'composer-attachment-image' })).toBeDefined()
  })

  it('renders and invokes retry only when present', async () => {
    const onRetry = vi.fn()
    const retryWords = { ...words, retry: 'retry sentinel' }
    const tree = await renderComposer(props({ words: retryWords, onRetry }))
    const retry = tree.root.findAllByType('Pressable').find(
      (node: { props: { onPress?: unknown } }) => node.props.onPress === onRetry,
    )
    if (retry) pressControl(retry)
    expect(onRetry).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.update(<Composer {...props()} />))
    expect(textValues(tree.root)).not.toContain(retryWords.retry)
  })

  it('uses the placeholder word as both placeholder and accessible name', async () => {
    const tree = await renderComposer(props())
    const input = byLabel(tree.root, words.placeholder)[0]
    expect(tree.root.findByProps({ testID: 'composer-placeholder' }).props.children).toBe(words.placeholder)
  })

  it.each([
    ['pt-BR', ptBR.shell.composer.placeholder, 'Peça algo à Astra'],
    ['en', en.shell.composer.placeholder, 'Ask Astra for something'],
  ])('shows the %s composer placeholder', async (_locale, placeholder, expected) => {
    const tree = await renderComposer(props({ words: { ...words, placeholder } }))
    expect(placeholder).toBe(expected)
    expect(byLabel(tree.root, placeholder)[0]).toBeDefined()
    expect(tree.root.findByProps({ testID: 'composer-placeholder' }).props.children).toBe(expected)
  })

  it.each([
    ['pt-BR', ptBR.shell.composer.offline, 'Sem conexão', 'Sem conexão. A Astra volta quando a conexão voltar.'],
    ['en', en.shell.composer.offline, 'No connection', 'No connection. Astra comes back when the connection does.'],
  ])('shows the %s offline composer copy', async (_locale, offline, placeholder, reason) => {
    const tree = await renderComposer(props({ state: 'offline', words: { ...words, placeholder: offline.placeholder, inputLabel: 'Ask Astra for something' }, limitReason: offline.reason }))
    expect(byLabel(tree.root, 'Ask Astra for something')[0]).toBeDefined()
    expect(tree.root.findByProps({ testID: 'composer-placeholder' }).props.children).toBe(placeholder)
    expect(textValues(tree.root)).toContain(reason)
  })

  it.each(['idle', 'sending', 'recording', 'transcribing', 'atLimit'] as const)(
    'exposes the %s state through test id and accessibility state',
    async (state) => {
      const stateProps = state === 'atLimit'
        ? { state, limitReason: 'limit sentinel' }
        : state === 'recording' || state === 'transcribing'
          ? { state, onVoice: vi.fn(), voiceWords }
          : { state }
      const tree = await renderComposer(props(stateProps))
      const root = tree.root.findByProps({ testID: `composer-${state}` })
      expect(root.props.accessibilityState.busy).toBe(state === 'sending')
      expect(root.props.testID).not.toContain('attachments')
      expect(root.props.testID).not.toContain('retry')
    },
  )
})
