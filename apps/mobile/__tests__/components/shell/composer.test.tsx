import React from 'react'
import { AccessibilityInfo, Animated, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { buildComposerChips } from '@orbit/shared/chat'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArrowUp, Square } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { advanceAccountGeneration, advanceSessionEpoch } from '@/lib/session-epoch'
import { Composer } from '@/components/shell/composer'
import * as Menu from '@/components/ui/dropdown-menu'
import { createTokensV2 } from '@/lib/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { IntlMessageFormat } from 'intl-messageformat'
import { __getFocusedInputSelection, __getFocusedNativeTag, __setFocusImpl, __setWindowDimensions } from '@/test-mocks/react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { expectPressPaint } from '@/__tests__/support/press-feedback'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

const authSession = vi.hoisted(() => ({ isAuthenticated: true, user: { userId: 'account-a' } }))
const astraCopy = vi.hoisted(() => ({ name: 'nav.astra', request: 'habits.form.suggestDate' }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key === 'nav.astra' ? astraCopy.name : key === 'habits.form.suggestDate' ? astraCopy.request : key, i18n: { language: 'en' } }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => authSession } }))

const clipboard = vi.hoisted(() => ({ getStringAsync: vi.fn().mockResolvedValue(''), hasStringAsync: vi.fn().mockResolvedValue(true) }))
vi.mock('expo-clipboard', () => ({ ...clipboard }))

const motionState = vi.hoisted(() => ({ reducedMotion: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  usePrefersReducedMotion: () => motionState.reducedMotion,
}))

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-native')>()
  const ReactModule = await import('react')
  type PressableMockProps = Record<string, unknown> & {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
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
        typeof children === 'function' ? children({ pressed }) : children,
      )
    },
  )

  return { ...original, Pressable, AccessibilityInfo: { ...original.AccessibilityInfo, sendAccessibilityEvent: vi.fn() } }
})

const TestRenderer = require('react-test-renderer')

const words = {
  placeholder: 'placeholder sentinel',
  send: 'send sentinel',
  clear: 'clear sentinel',
  paste: 'paste sentinel',
  nothingToPaste: 'empty clipboard sentinel',
  actions: 'actions sentinel',
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

it.each([en, ptBR])('shows each suggestion action with only the decorative mark', messages => {
  astraCopy.name = messages.nav.astra
  const chips = suggestions(3)
  const tree = renderComposer(props({ suggestions: chips }))
  try {
    const controls = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && chips.some(chip => node.props.accessibilityLabel === chip.label))
    expect(controls).toHaveLength(chips.length)
    for (const [index, control] of controls.entries()) {
      expect(control.props.accessibilityLabel).toBe(chips[index]!.label)
      expect(textValues(control)).toEqual([chips[index]!.label])
      const marks = control.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
        typeof node.type === 'string' && node.props.testID === 'astra-mark')
      expect(marks).toHaveLength(1)
      expect(marks[0]!.props.accessible).toBe(false)
    }
    pressControl(controls[1])
    expect(chips[1]!.onSelect).toHaveBeenCalledOnce()
    expect(chips[0]!.onSelect).not.toHaveBeenCalled()
    expect(chips[2]!.onSelect).not.toHaveBeenCalled()
  } finally { astraCopy.name = 'nav.astra'; TestRenderer.act(() => tree.unmount()) }
})

describe('clipboard composer control', () => {
  beforeEach(() => { authSession.isAuthenticated = true; authSession.user = { userId: 'account-a' } })
  afterEach(() => { clipboard.hasStringAsync.mockReset().mockResolvedValue(true); clipboard.getStringAsync.mockReset().mockResolvedValue(''); useAppToastStore.getState().dismissAllToasts() })

  it.each([en, ptBR])('keeps the actual input minimum and action reservation through fit and availability changes', async messages => {
    clipboard.hasStringAsync.mockResolvedValue(false)
    const configuration = props({ suggestions: [], words: messages.shell.composer, onAttachFile: vi.fn(), attachWords })
    const tree = renderComposer(configuration)
    try {
      await TestRenderer.act(async () => { await Promise.resolve() })
      const slot = tree.root.findByProps({ testID: 'composer-text-action-slot' })
      expect(slot.findAllByType('Pressable')).toHaveLength(1)
      for (const fontScale of [1, 1.5, 2, 1]) {
        __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale })
        for (const state of ['idle', 'atLimit', 'sending', 'idle'] as const) {
          await TestRenderer.act(() => tree.update(<Composer {...props({ ...configuration, state, limitReason: 'reason', value: state === 'sending' ? 'Draft' : '' })} />))
          expect(tree.root.findByProps({ testID: 'composer-text-action-slot' })).toBe(slot)
          const minimum = tree.root.findByProps({ testID: 'composer-input-minimum' })
          expect(minimum.props.children).toBe(messages.shell.composer.inputLabel)
          expect(minimum.props.accessible).toBe(false)
          expect(minimum.props.importantForAccessibility).toBe('no-hide-descendants')
          const parts = measureInteractionFills(tree.toJSON(), 412, false, fontScale)
          const textSlot = parts.find(part => part.host.props.testID === 'composer-text-slot')!
          const intrinsic = measureProfileRow({ type: 'View', props: { style: { alignItems: 'flex-start' } }, children: [
            { type: 'Text', props: { style: StyleSheet.flatten(minimum.props.style) }, children: [messages.shell.composer.inputLabel] },
          ] }, 412, fontScale).texts[0]!
          const field = parts.find(part => part.host.props.testID === 'composer-field')!
          expect(textSlot.width).toBeGreaterThanOrEqual(Math.min(intrinsic.width, field.width - 8))
          expect(parts.find(part => part.host.props.testID === 'composer-text-action-slot')!.width).toBe(48)
        }
        const measurement = tree.root.findByProps({ testID: 'composer-paste-measure' })
        const line = { x: 0, y: 0, width: 40, height: 24, ascender: 16, capHeight: 12, descender: 4, xHeight: 8, text: messages.shell.composer.placeholder }
        for (const lines of [[line, { ...line, y: 24 }], [line]]) {
          await TestRenderer.act(() => measurement.props.onTextLayout({ nativeEvent: { lines } }))
          expect(tree.root.findByProps({ testID: 'composer-text-action-slot' })).toBe(slot)
          expect(StyleSheet.flatten(measurement.props.style).end).toBe(8)
          expect(slot.findAllByType('Pressable')).toHaveLength(lines.length > 1 ? 0 : 1)
        }
      }
    } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
  })

  it.each([320, 412].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
    'moves text actions only when the whole placeholder needs their slot at $width', ({ width, messages }) => {
      astraCopy.name = messages.nav.astra
      astraCopy.request = messages.habits.form.suggestDate
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
      const configuration = props({ suggestions: [], words: messages.shell.composer,
        onAttachFile: vi.fn(), attachWords, onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation })
      const tree = renderComposer(configuration)
      let layoutWidth = width
      function measure() {
        const parts = measureInteractionFills(tree.toJSON(), layoutWidth, false)
        const slot = parts.find(part => part.host.props.testID === 'composer-text-slot')!
        const field = parts.find(part => part.host.props.testID === 'composer-field')!
        return { contentWidth: slot.width - 16, height: field.height, parts }
      }
      function reportWidths() {
        for (const part of measure().parts) {
          const onLayout = 'onLayout' in part.host.props ? part.host.props.onLayout : undefined
          if (typeof onLayout === 'function') TestRenderer.act(() => onLayout({ nativeEvent: {
            layout: { x: part.left, y: part.top, width: part.width, height: part.height },
          } }))
        }
      }
      try {
        const placeholderStyle: TextStyle = { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 }
        const measurePlaceholder = (available: number) => measureProfileRow({ type: 'Text', props: {
          style: placeholderStyle,
        }, children: [messages.shell.composer.placeholder] }, available, 1).texts[0]!
        for (layoutWidth of [width, 600, width]) {
          __setWindowDimensions({ width: layoutWidth, height: 915, scale: 1, fontScale: 1 })
          TestRenderer.act(() => tree.update(<Composer {...configuration} />))
          for (let replay = 0; replay < 2; replay++) {
            reportWidths()
            const measurement = tree.root.findByProps({ testID: 'composer-paste-measure' })
            const inset = StyleSheet.flatten(measurement.props.style)
            const candidate = measurePlaceholder(inset.width)
            const line = { x: 0, y: 0, width: candidate.width, height: 24, ascender: 16, capHeight: 12, descender: 4, xHeight: 8, text: messages.shell.composer.placeholder }
            TestRenderer.act(() => measurement.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: candidate.lines }, () => line) } }))
            expect(byLabel(tree.root, messages.shell.composer.paste)).toHaveLength(layoutWidth < 600 ? 0 : 1)
          }
          const menu = tree.root.findByType(Menu.Content)
          expect(menu.props.items.some((item: { id: string }) => item.id === 'paste')).toBe(layoutWidth < 600)
          if (layoutWidth < 600) expect(menu.props.items[0]).toMatchObject({ id: 'paste', label: messages.shell.composer.paste, icon: 'clipboard' })
          const empty = measure()
          expect(empty.height).toBeGreaterThanOrEqual(56)
          if (layoutWidth === 600) expect(empty.height).toBe(56)
          expect(measurePlaceholder(empty.contentWidth).lines).toBe(1)
          const placeholder = tree.root.findByProps({ testID: 'composer-placeholder' })
          expect(placeholder.props.children).toBe(messages.shell.composer.placeholder)
          expect(placeholder.props.numberOfLines).toBe(1)
          TestRenderer.act(() => tree.update(<Composer {...configuration} value="Draft" />))
          const typed = measure()
          expect(typed.contentWidth).toBe(empty.contentWidth)
          expect(byLabel(tree.root, messages.shell.composer.clear)).toHaveLength(layoutWidth < 600 ? 0 : 1)
          const typedMenu = tree.root.findByType(Menu.Content)
          expect(typedMenu.props.items.some((item: { id: string }) => item.id === 'clear')).toBe(layoutWidth < 600)
          if (layoutWidth < 600) expect(typedMenu.props.items[0]).toMatchObject({ id: 'clear', label: messages.shell.composer.clear, icon: 'x' })
          const measurement = tree.root.findByProps({ testID: 'composer-paste-measure' })
          const inset = StyleSheet.flatten(measurement.props.style)
          const candidate = measurePlaceholder(inset.width)
          const line = { x: 0, y: 0, width: candidate.width, height: 24, ascender: 16, capHeight: 12, descender: 4, xHeight: 8, text: messages.shell.composer.placeholder }
          TestRenderer.act(() => measurement.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: candidate.lines }, () => line) } }))
          expect(measure().contentWidth).toBe(empty.contentWidth)
        }
      } finally { TestRenderer.act(() => tree.unmount()); astraCopy.name = 'nav.astra'; astraCopy.request = 'habits.form.suggestDate'; __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
    },
  )

  it.each([en, ptBR].flatMap(messages => [false, true].map(inMenu => ({ messages, inMenu }))))('pastes text, preserves attachments and focuses the end with menu $inMenu', async ({ messages, inMenu }) => {
    clipboard.getStringAsync.mockResolvedValue('Pasted\nmessage')
    const onChangeValue = vi.fn()
    const onAttachRemove = vi.fn()
    function ControlledComposer() {
      const [value, setValue] = React.useState('')
      return <Composer {...props({ value, words: messages.shell.composer,
        onChangeValue: (next: string) => { onChangeValue(next); setValue(next) },
        attachments: [{ id: 'image', kind: 'image', name: 'walk.png' }], attachWords, onAttachRemove, onAttachFile: vi.fn() })} />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<ControlledComposer />) })
    try {
      expect(clipboard.getStringAsync).not.toHaveBeenCalled()
      expect(byLabel(tree.root, messages.shell.composer.clear)).toHaveLength(0)
      if (inMenu) {
        const line = { x: 0, y: 0, width: 80, height: 24, ascender: 16, capHeight: 12, descender: 4, xHeight: 8, text: messages.shell.composer.placeholder }
        await TestRenderer.act(() => tree.root.findByProps({ testID: 'composer-paste-measure' }).props.onTextLayout({ nativeEvent: { lines: [line, line] } }))
        expect(byLabel(tree.root, messages.shell.composer.paste)).toHaveLength(0)
        pressControl(byLabel(tree.root, messages.shell.composer.actions)[0])
        await TestRenderer.act(async () => { pressControl(menuItem(tree, messages.shell.composer.paste)); await Promise.resolve() })
      } else {
        expect(byLabel(tree.root, messages.shell.composer.paste)).toHaveLength(1)
        await TestRenderer.act(async () => { byLabel(tree.root, messages.shell.composer.paste)[0]!.props.onPress(); await Promise.resolve() })
      }
      const input = tree.root.findByType('TextInput')
      expect(input.props.value).toBe('Pasted\nmessage')
      expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('Pasted\nmessage')
      expect(__getFocusedNativeTag()).toBe(input.props.__nativeTag)
      expect(__getFocusedInputSelection()).toEqual({ start: 14, end: 14 })
      expect(byLabel(tree.root, messages.shell.composer.paste)).toHaveLength(0)
      if (inMenu) {
        pressControl(byLabel(tree.root, messages.shell.composer.actions)[0])
        const menu = tree.root.findByType(Menu.Content)
        expect(menu.props.items[0]).toMatchObject({ id: 'clear', label: messages.shell.composer.clear, icon: 'x' })
        await TestRenderer.act(() => pressControl(menuItem(tree, messages.shell.composer.clear)))
      } else await TestRenderer.act(() => byLabel(tree.root, messages.shell.composer.clear)[0]!.props.onPress())
      expect(byLabel(tree.root, messages.shell.composer.paste)).toHaveLength(inMenu ? 0 : 1)
      expect(input.props.value).toBe('')
      expect(__getFocusedNativeTag()).toBe(input.props.__nativeTag)
      expect(onAttachRemove).not.toHaveBeenCalled()
      expect(tree.root.findAllByProps({ testID: 'composer-attachment-image' }).length).toBeGreaterThan(0)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each([en, ptBR])('shows the localized information toast for an empty clipboard', async messages => {
    const onChangeValue = vi.fn()
    const tree = renderComposer(props({ words: messages.shell.composer, onChangeValue }))
    try {
      expect(byLabel(tree.root, messages.shell.composer.paste)).toHaveLength(1)
      await TestRenderer.act(async () => { byLabel(tree.root, messages.shell.composer.paste)[0]!.props.onPress(); await Promise.resolve() })
      expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({ kind: 'neutral', message: messages.shell.composer.nothingToPaste })
      expect(onChangeValue).not.toHaveBeenCalled()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('rejects a URI-only Android clipboard item without changing the draft', async () => {
    clipboard.hasStringAsync.mockResolvedValue(false)
    clipboard.getStringAsync.mockResolvedValue('null')
    const onChangeValue = vi.fn()
    const tree = renderComposer(props({ onChangeValue }))
    try {
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      expect(onChangeValue).not.toHaveBeenCalled()
      expect(tree.root.findByType('TextInput').props.value).toBe('')
      expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({ kind: 'neutral', message: words.nothingToPaste })
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('pastes the literal plain-text null and focuses the end', async () => {
    clipboard.getStringAsync.mockResolvedValue('null')
    function ControlledComposer() {
      const [value, setValue] = React.useState('')
      return <Composer {...props({ value, onChangeValue: setValue })} />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ControlledComposer />) })
    try {
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      expect(tree.root.findByType('TextInput').props.value).toBe('null')
      expect(__getFocusedInputSelection()).toEqual({ start: 4, end: 4 })
      expect(useAppToastStore.getState().currentToast).toBeNull()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('allows a fresh paste after clearing a draft while an older read is pending', async () => {
    let resolveFirst!: (text: string) => void
    clipboard.getStringAsync.mockImplementationOnce(() => new Promise<string>(resolve => { resolveFirst = resolve })).mockResolvedValue('New clipboard')
    function ControlledComposer() {
      const [value, setValue] = React.useState('')
      return <Composer {...props({ value, onChangeValue: setValue })} />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ControlledComposer />) })
    try {
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      TestRenderer.act(() => tree.root.findByType('TextInput').props.onChangeText('New draft'))
      TestRenderer.act(() => byLabel(tree.root, words.clear)[0].props.onPress())
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      expect(tree.root.findByType('TextInput').props.value).toBe('New clipboard')
      expect(clipboard.getStringAsync).toHaveBeenCalledTimes(2)
      await TestRenderer.act(async () => { resolveFirst('Old clipboard'); await Promise.resolve() })
      expect(tree.root.findByType('TextInput').props.value).toBe('New clipboard')
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each(['recording', 'transcribing', 'sending', 'offline', 'atLimit'])('omits paste while %s', state => {
    const tree = renderComposer(props({ state, limitReason: 'reason', onVoice: vi.fn(), voiceWords }))
    expect(byLabel(tree.root, words.paste)).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['text', 'empty'])('discards a pending %s read across account transitions and permits a fresh paste', async result => {
    let resolve!: (text: string) => void
    clipboard.getStringAsync.mockImplementationOnce(() => new Promise<string>(complete => { resolve = complete })).mockResolvedValue('New account text')
    const onChangeValue = vi.fn()
    const tree = renderComposer(props({ onChangeValue }))
    try {
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      TestRenderer.act(() => { advanceAccountGeneration(); advanceAccountGeneration() })
      await TestRenderer.act(async () => { resolve(result === 'text' ? 'Previous account text' : ''); await Promise.resolve() })
      expect(onChangeValue).not.toHaveBeenCalled()
      expect(useAppToastStore.getState().currentToast).toBeNull()
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('New account text')
      expect(clipboard.getStringAsync).toHaveBeenCalledTimes(2)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each(['signed-out', 'account-b'].flatMap(account => ['text', 'empty'].map(result => ({ account, result }))))(
    'discards pending $result when auth becomes $account before account cleanup', async ({ account, result }) => {
      let resolve!: (text: string) => void
      clipboard.getStringAsync.mockImplementationOnce(() => new Promise<string>(complete => { resolve = complete }))
      const onChangeValue = vi.fn()
      const tree = renderComposer(props({ onChangeValue }))
      try {
        await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
        authSession.isAuthenticated = account !== 'signed-out'
        authSession.user = { userId: account === 'signed-out' ? 'account-a' : account }
        await TestRenderer.act(async () => { resolve(result === 'text' ? 'Previous account text' : ''); await Promise.resolve() })
        expect(onChangeValue).not.toHaveBeenCalled()
        expect(useAppToastStore.getState().currentToast).toBeNull()
      } finally { await TestRenderer.act(() => tree.unmount()) }
    },
  )

  it('keeps a pending paste through a credential refresh in the same account', async () => {
    let resolve!: (text: string) => void
    clipboard.getStringAsync.mockImplementationOnce(() => new Promise<string>(complete => { resolve = complete }))
    const onChangeValue = vi.fn()
    const tree = renderComposer(props({ onChangeValue }))
    try {
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0].props.onPress(); await Promise.resolve() })
      TestRenderer.act(() => advanceSessionEpoch())
      await TestRenderer.act(async () => { resolve('Same account text'); await Promise.resolve() })
      expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('Same account text')
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('does not replace a newer draft with a pending clipboard read', async () => {
    let resolve!: (text: string) => void
    clipboard.getStringAsync.mockImplementationOnce(() => new Promise<string>(complete => { resolve = complete }))
    const onChangeValue = vi.fn()
    const tree = renderComposer(props({ onChangeValue }))
    try {
      await TestRenderer.act(async () => { byLabel(tree.root, words.paste)[0]!.props.onPress(); await Promise.resolve() })
      TestRenderer.act(() => tree.update(<Composer {...props({ value: 'new draft', onChangeValue })} />))
      await TestRenderer.act(async () => { resolve('old clipboard'); await Promise.resolve() })
      expect(onChangeValue).not.toHaveBeenCalled()
      expect(tree.root.findByType('TextInput').props.value).toBe('new draft')
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })
})

it.each([{ messages: en, label: 'Clear message' }, { messages: ptBR, label: 'Limpar mensagem' }])('localizes the clear name to $label', ({ messages, label }) => {
  const tree = renderComposer(props({ value: 'draft', words: messages.shell.composer }))
  expect(byLabel(tree.root, label)).toHaveLength(1)
  TestRenderer.act(() => tree.unmount())
})

it.each(['oi', '   ', '\n'])('shows clear for typed text %j', value => {
  const tree = renderComposer(props({ value }))
  expect(byLabel(tree.root, words.clear)).toHaveLength(1)
  TestRenderer.act(() => tree.unmount())
})

it.each(['idle', 'recording', 'transcribing', 'sending', 'offline', 'atLimit'])('hides clear when empty or unavailable in %s', state => {
  const tree = renderComposer(props({ state, value: state === 'idle' ? '' : 'draft', onVoice: vi.fn(), voiceWords }))
  expect(byLabel(tree.root, words.clear)).toHaveLength(0)
  TestRenderer.act(() => tree.unmount())
})

it.each([false, true])('clears through value changes and focuses the input with an attachment: %s', attached => {
  const onChangeValue = vi.fn()
  const onAttachRemove = vi.fn()
  const focus = vi.fn()
  __setFocusImpl(focus)
  function ControlledComposer() {
    const [value, setValue] = React.useState('')
    return <Composer {...props({ value, onChangeValue: (next: string) => { onChangeValue(next); setValue(next) },
      ...(attached ? { attachments: [{ id: 'image', kind: 'image', name: 'walk.png' }], attachWords, onAttachRemove } : {}) })} />
  }
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ControlledComposer />) })
  try {
    TestRenderer.act(() => tree.root.findByType('TextInput').props.onChangeText('First\nSecond'))
    expect(byLabel(tree.root, words.send)[0].props.disabled).toBe(false)
    TestRenderer.act(() => byLabel(tree.root, words.clear)[0].props.onPress())
    expect(onChangeValue).toHaveBeenLastCalledWith('')
    const input = tree.root.findByType('TextInput')
    expect(input.props.value).toBe('')
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ accessibilityLabel: words.placeholder }))
    expect(__getFocusedNativeTag()).toBe(input.props.__nativeTag)
    expect(byLabel(tree.root, words.send)[0].props.disabled).toBe(true)
    expect(byLabel(tree.root, words.clear)).toHaveLength(0)
    expect(onAttachRemove).not.toHaveBeenCalled()
    if (attached) expect(textValues(tree.root)).toContain('walk.png')
  } finally { TestRenderer.act(() => tree.unmount()) }
})

it('keeps one complete suggestion focus outline inside the scroller without resizing chips', () => {
  const tree = renderComposer(props())
  const chip = () => byLabel(tree.root, 'chip sentinel 0')[0]
  const resting = StyleSheet.flatten(chip().props.style)
  const target = {}
  const event = { nativeEvent: { target: 1 }, target, currentTarget: target }
  TestRenderer.act(() => chip().props.onFocus?.(event))
  const focused = StyleSheet.flatten(chip().findAllByType('View').at(-1).props.style)
  expect(focused.outlineWidth).toBe(2)
  expect(focused.outlineOffset + focused.outlineWidth).toBeLessThanOrEqual(0)
  expect(StyleSheet.flatten(chip().props.style)).toEqual(resting)
  TestRenderer.act(() => chip().props.onBlur?.(event))
  expect(StyleSheet.flatten(chip().props.style).outlineWidth ?? 0).toBe(0)
})

function byLabel(root: ReturnType<typeof TestRenderer.create>['root'], label: string) {
  return root.findAll(
    (node: { type?: unknown; props?: Record<string, unknown> }) =>
      typeof node.type === 'string' && [label, label, label].includes(String(node.props?.accessibilityLabel)),
  )
}

function textValues(root: ReturnType<typeof TestRenderer.create>['root']) {
  return root.findAllByType('Text').map((node: { props: { children: unknown } }) => node.props.children)
}

function pressControl(control: { props: Record<string, (() => void) | undefined> }) {
  const { onPressIn, onPress, onPressOut } = control.props
  TestRenderer.act(() => onPressIn?.())
  TestRenderer.act(() => onPress?.())
  TestRenderer.act(() => onPressOut?.())
}

function menuItem(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAllByType('Pressable').find(
    (node: { props: { accessibilityRole?: string }; findAllByType: (type: string) => { props: { children: string } }[] }) => node.props.accessibilityRole === 'menuitem' && node.findAllByType('Text')[0]!.props.children === label,
  )
}

function applyComposerLayoutStyle(node: YogaNode, style: Record<string, unknown>) {
  const dimensions = ['Width', 'Height', 'MinWidth', 'MinHeight', 'MaxWidth', 'MaxHeight', 'Flex', 'FlexGrow', 'FlexShrink', 'FlexBasis'] as const
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

describe('Composer (mobile)', () => {
  it.each([320, 480, 800].flatMap(width => [en, ptBR].flatMap(messages => [1, 2].flatMap(fontScale =>
    ['empty', 'draft', 'sending'].flatMap(state => [false, true].map(collapsible => ({ width, messages, state, fontScale, collapsible })))))))(
    'keeps equal fill clearance between 48px targets at $width in $state with text $fontScale and disclosure=$collapsible', ({ width, messages, state, fontScale, collapsible }) => {
      useUIStore.setState({ habitComposerCollapsed: false })
      __setWindowDimensions({ width, height: 640, scale: 1, fontScale })
      const tree = renderComposer(props({ collapsible, state: state === 'sending' ? 'sending' : 'idle', value: state === 'empty' ? '' : 'Draft',
        suggestions: [], words: messages.shell.composer, onAttachFile: vi.fn(), attachWords }))
      try {
        const parts = measureInteractionFills(tree.toJSON(), width, false, fontScale)
        const textActions = state === 'sending' && !collapsible ? []
          : [collapsible ? 'shell.composer.collapse' : state === 'empty' ? messages.shell.composer.paste : messages.shell.composer.clear]
        const names = [...textActions, messages.shell.composer.actions, messages.shell.composer.send]
        const targets = names.map(name => parts.find(part => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === name)!)
        for (const [index, target] of targets.entries()) {
          expect(target.width).toBe(48)
          expect(target.height).toBe(48)
          if (index > 0) expect(target.left - targets[index - 1]!.right).toBe(INTERACTION_FILL_CLEARANCE)
        }
      } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
    },
  )

  it.each([false, true].flatMap(withOpener => ['idle', 'sending'].map(state => ({ withOpener, state }))))('uses one send icon with opener=$withOpener in $state', ({ withOpener, state }) => {
    const tree = renderComposer(props({ state, value: 'Draft', suggestions: [], ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: 'Open conversation' } : {}) }))
    const send = tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === words.send)[0]!
    expect(send.findAllByType(ArrowUp)).toHaveLength(1)
    expect(send.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)
    expect(send.findAllByType(AstraGlyph)).toHaveLength(0)
    expect(send.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'Text')).toHaveLength(0)
    expect(StyleSheet.flatten(send.props.style).width).toBe(48)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([
    { locale: 'pt-BR', messages: ptBR, name: 'Abrir conversa' },
    { locale: 'en', messages: en, name: 'Open the conversation' },
  ])('names the conversation glyph in $locale', ({ messages, name }) => {
    const onOpenConversation = vi.fn()
    const tree = renderComposer(props({
      words: messages.shell.composer,
      onOpenConversation,
      conversationLabel: messages.todayAstra.openConversation,
    }))
    try {
      const controls = byLabel(tree.root, name)
      expect(controls).toHaveLength(1)
      expect(controls[0].props.accessibilityRole).toBe('button')
      pressControl(controls[0])
      expect(onOpenConversation).toHaveBeenCalledOnce()
      expect(byLabel(tree.root, 'Abrir a conversa')).toHaveLength(0)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it.each([false, true])('paints both recovery controls and invokes their actions (reduced motion: %s)', (reducedMotion) => {
    motionState.reducedMotion = reducedMotion
    const tokens = createTokensV2('purple', 'dark')
    const onSelect = vi.fn()
    const onRetry = vi.fn()
    const recovery = renderComposer(props({ errorRecovery: { label: 'Recover', onSelect } }))
    const recoveryControl = byLabel(recovery.root, 'Recover')[0]
    expectPressPaint(recoveryControl, { fill: tokens.bgHover, borderRadius: 999, scale: reducedMotion ? 1 : 0.96 })
    pressControl(recoveryControl)
    expect(onSelect).toHaveBeenCalledOnce()

    const retry = renderComposer(props({ words: { ...words, retry: 'Retry' }, onRetry }))
    const retryControl = byLabel(retry.root, 'Retry')[0]!
    expectPressPaint(retryControl, { fill: tokens.bgHover, borderRadius: 999, scale: reducedMotion ? 1 : 0.96 })
    pressControl(retryControl)
    expect(onRetry).toHaveBeenCalledOnce()
    TestRenderer.act(() => { recovery.unmount(); retry.unmount() })
    motionState.reducedMotion = false
  })
  it.each(['idle', 'offline', 'atLimit'] as const)('aligns the %s placeholder with the padded caret', state => {
    const tree = renderComposer(props({ state, limitReason: 'limit sentinel' }))
    try {
      const input = StyleSheet.flatten(tree.root.findByType('TextInput').props.style)
      const placeholder = StyleSheet.flatten(tree.root.findByProps({ testID: 'composer-placeholder' }).props.style)
      expect.soft(input.paddingHorizontal).toBe(8)
      expect.soft(placeholder.start).toBe(8)
      expect.soft(placeholder.end).toBe(8)
      expect(tree.root.findByProps({ testID: 'composer-placeholder' }).props.pointerEvents).toBe('none')
      if (state !== 'idle') {
        expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'composer-placeholder-measure' }).props.style)).toMatchObject({ start: 8, end: 8 })
      }
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it.each([1, 1.3, 1.5, 2].flatMap(fontScale => [false, true].flatMap(withOpener =>
    (['idle', 'offline', 'atLimit'] as const).map(state => ({ fontScale, withOpener, state })),
  )))('keeps the placeholder whole at $fontScale text while $state with opener $withOpener', ({ fontScale, withOpener, state }) => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
    const catalog = ptBR.shell.composer
    const placeholder = state === 'idle' ? catalog.placeholder : state === 'offline' ? catalog.offline.placeholder : catalog.limit.placeholder
    const configuration = props({ state, words: { ...catalog, placeholder }, suggestions: [],
      ...(state !== 'idle' ? { limitReason: state === 'offline' ? catalog.offline.reason : catalog.limit.reason } : {}),
      onAttachFile: vi.fn(), attachWords,
      ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: ptBR.todayAstra.openConversation } : {}),
    })
    const tree = renderComposer(configuration)
    try {
      const visible = () => tree.root.findByProps({ testID: 'composer-placeholder' })
      if (fontScale <= 1.3) {
        expect(visible().props.numberOfLines).toBe(1)
        return
      }
      expect(visible().props.numberOfLines).toBeUndefined()
      const height = 2 * 24 * fontScale
      TestRenderer.act(() => visible().props.onLayout({ nativeEvent: { layout: { x: 0, y: 12, width: 136, height } } }))
      expect(StyleSheet.flatten(tree.root.findByType('TextInput').props.style).height).toBe(height + 24)
      expect(visible().props.children).toBe(placeholder)
      if (state !== 'idle') {
        const measure = tree.root.findByProps({ testID: 'composer-placeholder-measure' })
        const line = { x: 0, y: 0, width: 136, height: 24 * fontScale, ascender: 16, capHeight: 12, descender: 4, xHeight: 8, text: placeholder }
        TestRenderer.act(() => measure.props.onTextLayout({ nativeEvent: { lines: [line, { ...line, y: line.height }] } }))
        expect(visible().props.children).toBe(placeholder)
      } else {
        TestRenderer.act(() => tree.update(<Composer {...configuration} value="Oi" />))
        expect(tree.root.findAllByProps({ testID: 'composer-placeholder' })).toHaveLength(0)
        TestRenderer.act(() => tree.root.findByType('TextInput').props.onContentSizeChange({ nativeEvent: { contentSize: { width: 136, height: 24 * fontScale + 24 } } }))
        expect(StyleSheet.flatten(tree.root.findByType('TextInput').props.style).height).toBe(24 * fontScale + 24)
        TestRenderer.act(() => tree.update(<Composer {...configuration} />))
        expect(visible().props.children).toBe(placeholder)
        expect(StyleSheet.flatten(tree.root.findByType('TextInput').props.style).height).toBe(height + 24)
      }
    } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
  })

  it.each([en, ptBR])('reserves wrapped height across mounted placeholder copy changes without another layout event', messages => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
    const catalog = messages.shell.composer
    const configuration = props({ words: catalog, suggestions: [], onAttachFile: vi.fn(), attachWords,
      onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation })
    const tree = renderComposer(configuration)
    try {
      const input = tree.root.findByType('TextInput')
      const placeholder = tree.root.findByProps({ testID: 'composer-placeholder' })
      TestRenderer.act(() => placeholder.props.onLayout({ nativeEvent: { layout: { x: 0, y: 12, width: 136, height: 96 } } }))
      expect(StyleSheet.flatten(input.props.style).height).toBe(120)
      let previousPlaceholder = placeholder
      for (const state of ['offline', 'atLimit'] as const) {
        const nextCopy = state === 'offline' ? catalog.offline : catalog.limit
        TestRenderer.act(() => tree.update(<Composer {...props({ ...configuration, state, limitReason: nextCopy.reason,
          words: { ...catalog, placeholder: nextCopy.placeholder } })} />))
        expect(tree.root.findByType('TextInput')).toBe(input)
        const nextPlaceholder = tree.root.findByProps({ testID: 'composer-placeholder' })
        expect(nextPlaceholder.props.children).toBe(nextCopy.placeholder)
        expect(StyleSheet.flatten(input.props.style).height).toBe(120)
        expect(nextPlaceholder).not.toBe(previousPlaceholder)
        previousPlaceholder = nextPlaceholder
      }
      TestRenderer.act(() => tree.root.findByProps({ testID: 'composer-placeholder' }).props.onLayout({
        nativeEvent: { layout: { x: 0, y: 12, width: 136, height: 48 } },
      }))
      expect(StyleSheet.flatten(input.props.style).height).toBe(72)
      TestRenderer.act(() => tree.update(<Composer {...configuration} value="Oi" />))
      TestRenderer.act(() => input.props.onContentSizeChange({ nativeEvent: { contentSize: { width: 136, height: 72 } } }))
      expect(StyleSheet.flatten(input.props.style).height).toBe(72)
    } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
  })

  it('reserves a scaled text line before the first native content-size event', () => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
    const tree = renderComposer(props())
    try { expect(StyleSheet.flatten(tree.root.findByType('TextInput').props.style).height).toBe(72) }
    finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
  })

  it('opens the full attachment name without removing it or changing the draft', () => {
    const name = 'A long document name '.repeat(15) + '.txt'
    const onAttachRemove = vi.fn()
    const tree = renderComposer(props({ value: 'Keep this draft', attachWords, onAttachFile: vi.fn(), onAttachRemove,
      attachments: [{ id: 'file', kind: 'file', name }] }))
    expect(byLabel(tree.root, name)[0].findAllByType('Text').find((node: { props: { importantForAccessibility?: string } }) => node.props.importantForAccessibility !== 'no-hide-descendants')!.props.numberOfLines).toBe(1)
    pressControl(byLabel(tree.root, name)[0])
    const sheet = tree.root.findByType('Sheet')
    expect(sheet.props.title).toBe(attachWords.trayLabel)
    expect(textValues(sheet)).toContain(name)
    pressControl(byLabel(sheet, 'attempt-dismiss')[0])
    expect(tree.root.findByType('TextInput').props.value).toBe('Keep this draft')
    expect(onAttachRemove).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it('keeps whole suggestion labels in one horizontally scrolling row', () => {
    const chips = suggestions(3)
    const tree = renderComposer(props({ suggestions: chips, value: 'Keep this draft' }))
    TestRenderer.act(() => tree.root.findAllByType('View').find((node: { props: Record<string, unknown> }) => node.props.testID === 'composer-suggestions-layout')!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 48 } } }))
    const firstChip = byLabel(tree.root, chips[0]!.label)[0]
    const scroller = byLabel(tree.root, words.suggestionsLabel)[0]
    expect(scroller.props.horizontal).toBe(true)
    expect(firstChip.findAllByType('Text')[0]!.props.numberOfLines).toBeUndefined()
    expect(StyleSheet.flatten(firstChip.props.style).maxWidth).toBeLessThanOrEqual(348)
    const config = Yoga.Config.create()
    const target = Yoga.Node.create(config)
    const label = Yoga.Node.create(config)
    try {
      applyComposerLayoutStyle(target, StyleSheet.flatten(firstChip.props.style))
      applyComposerLayoutInsets(target, StyleSheet.flatten(firstChip.props.style))
      label.setMeasureFunc(width => ({ width: Math.min(1600, width), height: 40 * Math.ceil(1600 / width) }))
      applyComposerLayoutStyle(label, StyleSheet.flatten(firstChip.findAllByType('Text')[0]!.props.style))
      target.insertChild(label, 0)
      target.calculateLayout(undefined, undefined)
      expect(target.getComputedWidth()).toBeLessThanOrEqual(348)
      expect(target.getComputedHeight()).toBeGreaterThan(48)
      expect(target.getComputedHeight()).toBeGreaterThanOrEqual(48)
      expect(label.getComputedLeft() + label.getComputedWidth()).toBeLessThanOrEqual(target.getComputedWidth())
      expect(label.getComputedTop() + label.getComputedHeight()).toBeLessThanOrEqual(target.getComputedHeight() - 12)
      pressControl(firstChip)
      expect(chips[0]!.onSelect).toHaveBeenCalledOnce()
      expect(tree.root.findByType('TextInput').props.value).toBe('Keep this draft')
    } finally { target.freeRecursive(); config.free(); TestRenderer.act(() => tree.unmount()) }
  })

  it.each([en, ptBR].flatMap(messages => [1, 2].flatMap(fontScale =>
    (['pending', 'returning', 'completed', 'progress', 'habitDetail'] as const).map(scenario => ({ messages, fontScale, scenario })))))(
    'bounds live $scenario labels and aligns icons with the first line at $fontScale text', ({ messages, fontScale, scenario }) => {
      __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
      const title = 'Ler um capítulo com acentos e detalhes '.repeat(5)
      const surface = scenario === 'habitDetail' ? 'habitDetail' : scenario === 'progress' ? 'progress' : 'today'
      const habit = createMockHabit({ title, hasSubHabits: true, isOverdue: true, isCompleted: scenario === 'completed' })
      const chips = buildComposerChips({ surface, status: 'success', habits: [habit], totalHabitCount: 1,
        profile: createMockProfile({ lastCompletionDate: scenario === 'returning' ? '2026-09-01' : null }),
        now: new Date('2026-09-10T12:00:00Z'), detailHabit: { title, checklistItems: [] } })
      const suggestions = toComposerSuggestions(chips.map(({ id, params }) => {
        const [group, name] = id.split('.')
        const labels: Record<string, string> = messages.shell.composer.chips[group as keyof typeof messages.shell.composer.chips]
        return { id, label: labels[name!]!.replace('{title}', params?.title ?? ''), icon: <Square size={20} />, onSelect: vi.fn() }
      }))
      const tree = renderComposer(props({ suggestions, words: messages.shell.composer }))
      try {
        const host = tree.root.findAllByType('View').find((node: { props: Record<string, unknown> }) => node.props.testID === 'composer-suggestions-layout')!
        TestRenderer.act(() => host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 48 } } }))
        for (const suggestion of suggestions) {
          const chip = byLabel(tree.root, suggestion.label)[0]
          const text = chip.findAllByType('Text')[0]!
          const style = StyleSheet.flatten(chip.props.style)
          expect(style.maxWidth).toBe(256)
          expect(style.minHeight).toBe(48)
          expect(style.height).toBeUndefined()
          expect(style.alignItems).toBe('flex-start')
          expect(text.props.children).toBe(suggestion.label)
          expect(suggestion.label).not.toContain(title)
          expect(text.props.numberOfLines).toBeUndefined()
          expect(StyleSheet.flatten(text.props.style)).toMatchObject({ flexShrink: 1, lineHeight: 20 })
          const icon = chip.findAllByType('View').find((node: { props: Record<string, unknown> }) => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).justifyContent === 'center')!
          expect(StyleSheet.flatten(icon.props.style).height).toBe(20 * fontScale)
        }
      } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
    },
  )

  it.each([en, ptBR])('hugs every returning suggestion across supported native widths', messages => {
    const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [createMockHabit()], totalHabitCount: 1,
      profile: createMockProfile({ lastCompletionDate: '2026-09-01' }), now: new Date('2026-09-10T12:00:00Z') })
    const labels = messages.shell.composer.chips.today
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('today.', '') as keyof typeof labels], onSelect: vi.fn() })))
    const tree = renderComposer(props({ suggestions, words: messages.shell.composer }))
    const config = Yoga.Config.create()
    try {
      for (const width of [320, 412, 600, 840, 1100, 1352, 320]) {
        const host = tree.root.findByProps({ testID: 'composer-suggestions-layout' })
        TestRenderer.act(() => host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: width - 32, height: 48 } } }))
        for (const [index, suggestion] of suggestions.entries()) {
          const chip = byLabel(tree.root, suggestion.label)[0]
          const contentWidth = [111, 154, 105, 160, 180, 120][index]!
          TestRenderer.act(() => chip.findByProps({ testID: 'composer-suggestion-content' }).props.onLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: contentWidth, height: 20 } },
          }))
          const target = Yoga.Node.create(config)
          const content = Yoga.Node.create(config)
          try {
            const style = StyleSheet.flatten(chip.props.style)
            applyComposerLayoutStyle(target, style)
            applyComposerLayoutInsets(target, style)
            content.setMeasureFunc(() => ({ width: contentWidth, height: 20 }))
            target.insertChild(content, 0)
            target.calculateLayout(undefined, undefined)
            expect(Math.abs(target.getComputedWidth() - content.getComputedWidth() - 24 - 2 * StyleSheet.hairlineWidth)).toBeLessThanOrEqual(1)
          } finally { target.freeRecursive() }
        }
      }
    } finally { config.free(); TestRenderer.act(() => tree.unmount()) }
  })

  it('keeps content widths through narrow wide narrow layout callbacks', () => {
    const chips = buildComposerChips({ surface: 'habitDetail', status: 'success', habits: [], totalHabitCount: 1,
      detailHabit: { title: 'Reading', checklistItems: [] }, profile: createMockProfile() })
    expect(chips.map(chip => chip.id)).toEqual(['habitDetail.pauseThisWeek', 'habitDetail.rename'])
    const labels = en.shell.composer.chips.habitDetail
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('habitDetail.', '') as keyof typeof labels], icon: <Square size={20} />, onSelect: vi.fn() })))
    const tree = renderComposer(props({ suggestions, words: en.shell.composer }))
    const naturalWidths = [154, 105]
    const layoutAt = (mounted: typeof tree, width: number) => {
      const host = mounted.root.findAllByType('View').find((node: { props: Record<string, unknown> }) => node.props.testID === 'composer-suggestions-layout')!
      TestRenderer.act(() => host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } } }))
      for (const [index, suggestion] of suggestions.entries()) {
        const chip = byLabel(mounted.root, suggestion.label)[0]
        const content = chip.findByProps({ testID: 'composer-suggestion-content' })
        const renderedWidth = Math.min(naturalWidths[index]!, width - 32) - 24 - 2 * StyleSheet.hairlineWidth
        TestRenderer.act(() => content.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: renderedWidth, height: 24 } } }))
        expect(StyleSheet.flatten(chip.props.style).minWidth).toBeUndefined()
      }
      return StyleSheet.flatten(byLabel(mounted.root, en.shell.composer.suggestionsLabel)[0].props.contentContainerStyle).gap
    }
    try {
      for (const width of [176, 427, 176, 427]) {
        const gap = layoutAt(tree, width)
        const fresh = renderComposer(props({ suggestions, words: en.shell.composer }))
        try { expect(gap).toBe(layoutAt(fresh, width)) }
        finally { TestRenderer.act(() => fresh.unmount()) }
        expect(gap).toBe(8)
      }
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it.each([320, 360, 384, 412, 600, 840, 1100, 1352].flatMap(width => [1, 2].map(fontScale => ({ width, fontScale })) ))(
    'keeps a readable peek after content-hugging chips at $width and $fontScale text', ({ width, fontScale }) => {
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
      const tree = renderComposer(props())
      try {
        const available = width - 32
        const host = tree.root.findAllByType('View').find((node: { props: Record<string, unknown> }) => node.props.testID === 'composer-suggestions-layout')!
        expect(host).toBeDefined()
        TestRenderer.act(() => host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: available, height: 48 } } }))
        const chipWidths = [180, 200, 160].map(natural => Math.min(natural * fontScale, available - 32))
        for (const [index, chipWidth] of chipWidths.entries()) {
          const chip = byLabel(tree.root, `chip sentinel ${index}`)[0]
          const style = StyleSheet.flatten(chip.props.style)
          expect(style.maxWidth).toBe(available - 32)
          expect(style.minHeight).toBe(48)
          const config = Yoga.Config.create()
          const target = Yoga.Node.create(config)
          const content = Yoga.Node.create(config)
          try {
            applyComposerLayoutStyle(target, style)
            applyComposerLayoutInsets(target, style)
            const contentWidth = chipWidth - 24 - 2 * StyleSheet.hairlineWidth
            content.setMeasureFunc(() => ({ width: contentWidth, height: 20 * fontScale }))
            target.insertChild(content, 0)
            target.calculateLayout(undefined, undefined)
            expect(Math.abs(target.getComputedWidth() - content.getComputedWidth() - 24 - 2 * StyleSheet.hairlineWidth)).toBeLessThanOrEqual(1)
          } finally { target.freeRecursive(); config.free() }
          expect(style.alignItems).toBe('flex-start')
          expect(StyleSheet.flatten(chip.findAllByType('Text')[0]!.props.style).flexShrink).toBe(1)
          expect(chip.findAllByType('Text')[0]!.props.numberOfLines).toBeUndefined()
          TestRenderer.act(() => chip.findByProps({ testID: 'composer-suggestion-content' }).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: chipWidth - 24 - 2 * StyleSheet.hairlineWidth, height: 24 } } }))
        }
        const scroller = byLabel(tree.root, words.suggestionsLabel)[0]
        const visible = StyleSheet.flatten(scroller.props.style).width ?? available
        expect(visible).toBe(available)
        const gap = StyleSheet.flatten(scroller.props.contentContainerStyle).gap
        const starts = chipWidths.map((_, index) => chipWidths.slice(0, index).reduce((sum, size) => sum + size + gap, 0))
        const partial = starts.findIndex((start, index) => start < visible && start + chipWidths[index]! > visible)
        if (chipWidths.reduce((sum, size) => sum + size, 16) > available) {
          expect(partial).toBeGreaterThan(0)
          expect(visible - starts[partial]!).toBeGreaterThanOrEqual(16)
          expect(starts[partial]! + chipWidths[partial]! - visible).toBeGreaterThanOrEqual(16)
        } else expect(visible).toBe(available)
        expect(chipWidths.every(size => size <= visible)).toBe(true)
        TestRenderer.act(() => host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 48 } } }))
        const resizedWidths = chipWidths.map(size => Math.min(size, 256))
        const resizedScroller = byLabel(tree.root, words.suggestionsLabel)[0]
        const resizedVisible = StyleSheet.flatten(resizedScroller.props.style).width ?? 288
        const resizedGap = StyleSheet.flatten(resizedScroller.props.contentContainerStyle).gap
        const resizedStarts = resizedWidths.map((_, index) => resizedWidths.slice(0, index).reduce((sum, size) => sum + size + resizedGap, 0))
        const resizedPartial = resizedStarts.findIndex((start, index) => start < resizedVisible && start + resizedWidths[index]! > resizedVisible)
        expect(resizedPartial).toBeGreaterThan(0)
        expect(resizedVisible - resizedStarts[resizedPartial]!).toBeGreaterThanOrEqual(16)
        expect(resizedStarts[resizedPartial]! + resizedWidths[resizedPartial]! - resizedVisible).toBeGreaterThanOrEqual(16)
      } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
    },
  )

  it.each([320, 360, 384, 412].flatMap((width) => [1, 2].flatMap((fontScale) => [false, true].flatMap((withOpener) =>
    [en, ptBR].flatMap((locale) => ['idle', 'sending', 'offline', 'atLimit', 'recording', 'transcribing'].map((state) => ({ width, fontScale, withOpener, locale, state }))),
  ))))('keeps every control inside the pill at $width and $fontScale text while $state', ({ width, fontScale, withOpener, locale, state }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    const statePlaceholders: Readonly<Record<string, string>> = {
      offline: locale.shell.composer.offline.placeholder,
      atLimit: locale.shell.composer.limit.placeholder,
    }
    const configuration = props({
      state, ...(state === 'offline' || state === 'atLimit' ? { limitReason: 'persistent reason' } : {}),
      suggestions: [], words: { ...locale.shell.composer, placeholder: statePlaceholders[state] ?? locale.shell.composer.placeholder },
      onAttachFile: vi.fn(), onAttachImage: vi.fn(), attachWords, onVoice: vi.fn(), voiceWords,
      ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: 'Open conversation' } : {}),
    })
    const tree = renderComposer(configuration)
        try {
          for (const lineCount of state === 'recording' || state === 'transcribing' ? [1] : [1, 3, 5, 8]) {
            TestRenderer.act(() => tree.update(<Composer {...configuration} value={Array.from({ length: lineCount }, () => 'Typed line').join('\n')} />))
            const nativeInput = tree.root.findAllByType('TextInput')[0]
            if (nativeInput) TestRenderer.act(() => nativeInput.props.onContentSizeChange({ nativeEvent: { target: 1, contentSize: { width: 136, height: 24 * fontScale * lineCount + 24 } } }))
            const parts = measureInteractionFills(tree.toJSON(), width, false, fontScale)
            const field = parts.find(part => part.host.props.testID === 'composer-field')!
            const fieldIndex = field.slot
            const controls = parts.filter(part => part.host.type === 'Pressable' && part.ancestors.includes(fieldIndex))
            expect(field.width).toBe(width - 32)
            expect(controls.length).toBeGreaterThanOrEqual(2)
            for (const control of controls) {
              expect(control.width).toBeGreaterThanOrEqual(48)
              expect(control.height).toBeGreaterThanOrEqual(48)
              expect(control.left).toBeGreaterThanOrEqual(field.left + 4)
              expect(control.right).toBeLessThanOrEqual(field.right - 4)
              expect(Math.round((field.bottom - control.bottom) * 1000) / 1000).toBeGreaterThanOrEqual(4)
            }
            for (let index = 1; index < controls.length; index++) {
              const previous = controls[index - 1]!
              const current = controls[index]!
              expect(current.left >= previous.right || current.top >= previous.bottom).toBe(true)
            }
            if (nativeInput) {
              const slot = parts.find(part => part.host.props.testID === 'composer-text-slot')!
              expect(slot.width).toBeGreaterThanOrEqual(48 * fontScale)
              expect(field.height).toBeGreaterThanOrEqual(24 * fontScale * Math.min(5, lineCount) + 32)
            }

          }
        } finally { TestRenderer.act(() => tree.unmount()); __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
  })

  it('keeps field geometry unchanged when focus thickens its inset outline', () => {
    const tree = renderComposer(props())
    const field = tree.root.findByProps({ testID: 'composer-field' })
    const resting = StyleSheet.flatten(field.props.style)
    TestRenderer.act(() => tree.root.findByType('TextInput').props.onFocus())
    expect(StyleSheet.flatten(field.props.style)).toEqual(resting)
    TestRenderer.act(() => tree.root.findByType('TextInput').props.onBlur())
    expect(StyleSheet.flatten(field.props.style)).toEqual(resting)
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
    const field = () => tree.root.findByProps({ testID: 'composer-field' }).findAllByType('View').find(
      (node: { props: { pointerEvents?: string } }) => node.props.pointerEvents === 'none',
    )
    expect(StyleSheet.flatten(field().props.style).borderWidth).toBe(1)
    TestRenderer.act(() => input.props.onFocus())
    expect(StyleSheet.flatten(field().props.style).borderWidth).toBe(2)
    expect(StyleSheet.flatten(input.props.style).borderWidth).toBeUndefined()
    TestRenderer.act(() => input.props.onBlur())
    expect(StyleSheet.flatten(field().props.style).borderWidth).toBe(1)
  })

  it('keeps each action focus ring primary and separates it from an accent fill', async () => {
    const tree = await renderComposer(props({ value: 'Draft', onAttachFile: vi.fn(), attachWords }))
    const tokens = createTokensV2('purple', 'dark')
    for (const name of [words.actions, words.send]) {
      const control = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Pressable' && [name, name, name].includes(String(node.props.accessibilityLabel)))[0]
      const target = {}
      TestRenderer.act(() => control.props.onFocus({ target, currentTarget: target }))
      const ring = control.findAllByType('View').at(-1)
      const style = StyleSheet.flatten(ring.props.style)
      expect(style).toMatchObject({ outlineWidth: 2, outlineColor: tokens.primary })
      expect(style.outlineOffset + style.outlineWidth).toBeLessThanOrEqual(0)
      if (name === words.send) expect(style).toMatchObject({ borderWidth: 4, borderColor: tokens.bg })
      expect(contrastOnSurface(tokens.primary, [tokens.bg])).toBeGreaterThanOrEqual(3)
      TestRenderer.act(() => control.props.onBlur({ target, currentTarget: target }))
    }
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
    ['sending', { state: 'sending', value: 'oi' }, true, false],
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

  it('keeps input and send enabled and hides suggestions during sending', async () => {
    const tree = await renderComposer(props({ state: 'sending', value: 'oi' }))
    expect(byLabel(tree.root, words.placeholder)[0].props.editable).toBe(true)
    const send = byLabel(tree.root, words.send)[0]
    expect(send.props.disabled).toBe(false)
    expect(send.props.accessibilityState.busy).toBeUndefined()
    expect(send.findAll((node: { type: unknown }) => node.type === 'ActivityIndicator')).toHaveLength(0)
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
    pressControl(byLabel(tree.root, words.actions)[0])
    pressControl(menuItem(tree, voiceWords.start))
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
    for (const label of [words.actions]) {
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
    expect(byLabel(tree.root, words.actions)).toHaveLength(1)
    expect(byLabel(tree.root, attachWords.trayLabel)).toHaveLength(0)
    pressControl(byLabel(tree.root, words.actions)[0])
    expect(tree.root.findByType('Sheet').props.title).toBe(words.actions)
    pressControl(menuItem(tree, attachWords.file))
    pressControl(byLabel(tree.root, words.actions)[0])
    pressControl(menuItem(tree, attachWords.image))
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
    ['pt-BR', ptBR.shell.composer.placeholder, 'O que você quer fazer?'],
    ['en', en.shell.composer.placeholder, 'What would you like to do?'],
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

  it.each([en, ptBR])('shows the daily limit words and omits them when native text wraps', (catalog) => {
    const placeholder = catalog.shell.composer.limit.placeholder
    const tree = renderComposer(props({ state: 'atLimit', words: { ...catalog.shell.composer, placeholder }, limitReason: catalog.shell.composer.limit.reason }))
    expect(tree.root.findByProps({ testID: 'composer-placeholder' }).props.children).toBe(placeholder)
    const measure = tree.root.findByProps({ testID: 'composer-placeholder-measure' })
    const line = { x: 0, y: 0, width: 136, height: 24, ascender: 16, capHeight: 12, descender: 4, xHeight: 8, text: placeholder }
    TestRenderer.act(() => measure.props.onTextLayout({ nativeEvent: { lines: [line, { ...line, y: 24 }] } }))
    expect(tree.root.findAllByProps({ testID: 'composer-placeholder' })).toHaveLength(0)
    expect(textValues(tree.root)).toContain(catalog.shell.composer.limit.reason)
    TestRenderer.act(() => measure.props.onTextLayout({ nativeEvent: { lines: [line] } }))
    expect(tree.root.findByProps({ testID: 'composer-placeholder' }).props.children).toBe(placeholder)
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


describe('daily allowance and habit capacity styles', () => {
  it('keeps live suggestions available near the daily limit', () => {
    const tree = renderComposer(props({ allowanceReason: 'Daily allowance used', renewalHint: 'Returns tonight', usageMessage: '3 of 5' }))
    expect(tree.root.findAll((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === words.suggestionsLabel).length).toBeGreaterThan(0)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([en, ptBR])('fills the daily notice with neutral tabular usage or the exhausted reason', (messages) => {
    for (const state of ['idle', 'atLimit'] as const) {
      const tree = renderComposer(props({ state, suggestions: [], renewalHint: messages.shell.composer.limit.renewal,
        allowanceReason: String(new IntlMessageFormat(messages.shell.composer.limit.reason, messages === ptBR ? 'pt-BR' : 'en').format({ allowance: 5 })),
        usageMessage: state === 'idle' ? messages.shell.composer.usage.replace('{used}', '3').replace('{limit}', '5') : undefined,
        ...(state === 'atLimit' ? { limitReason: String(new IntlMessageFormat(messages.shell.composer.limit.reason, messages === ptBR ? 'pt-BR' : 'en').format({ allowance: 5 })) } : {}) }))
      const slot = tree.root.findByProps({ testID: 'composer-status-slot' })
      expect(StyleSheet.flatten(slot.props.style).minHeight).toBe(96)
      expect(slot.findAllByType('Text').map((text: { props: { children: string } }) => text.props.children)).toContain(messages.shell.composer.limit.renewal)
      if (state === 'idle') {
        const usage = StyleSheet.flatten(tree.root.findByProps({ testID: 'composer-usage' }).props.style)
        expect(usage).toMatchObject({ fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] })
        expect(usage.color).toBe(createTokensV2('orange', 'dark').fg3)
      } else expect(tree.root.findAllByProps({ testID: 'composer-usage' })).toHaveLength(0)
      TestRenderer.act(() => tree.unmount())
    }
  })

  it.each([['en', en], ['pt-BR', ptBR]] as const)('formats a neutral habit boundary in %s without an upgrade control', (locale, messages) => {
    let tree!: ReturnType<typeof TestRenderer.create>
    const body = new IntlMessageFormat(messages.habits.form.capacityBody, locale).format({ limit: 1000 }) as string
    TestRenderer.act(() => { tree = TestRenderer.create(<CapacityNotice message={messages.habits.form.capacityTitle} body={body} />) })
    const notice = tree.root.findByProps({ testID: 'capacity-notice' })
    expect(StyleSheet.flatten(notice.props.style).backgroundColor).toBe(createTokensV2('orange', 'dark').bgWell)
    expect(notice.findAllByType('Text').map((node: { props: { children: string } }) => node.props.children)).toContain(body)
    expect(body).toContain(locale === 'pt-BR' ? '1.000' : '1,000')
    expect(notice.findAllByType('Pressable')).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })
})


  it.each([en, ptBR])('shows removable queued rows, manual sends and a separate stop control in both languages', async (messages) => {
    const onRemove = vi.fn()
    const onQueuedSend = vi.fn()
    const onStop = vi.fn()
    const copy = messages.shell.composer.queue
    const queue = {
      label: copy.label, items: [{ id: 'first', content: 'First request' }, { id: 'second', content: 'Second request' }],
      pausedReason: copy.paused, canSend: true,
      removeLabel: (message: string) => copy.remove.replace('{message}', message),
      sendLabel: (message: string) => copy.send.replace('{message}', message),
      onRemove, onSend: onQueuedSend,
    }
    const tree = await renderComposer(props({ queue, replyControl: { label: copy.stop, onStop }, value: 'New draft' }))
    TestRenderer.act(() => byLabel(tree.root, queue.removeLabel('Second request'))[0].props.onPress())
    TestRenderer.act(() => byLabel(tree.root, queue.sendLabel('First request'))[0].props.onPress())
    TestRenderer.act(() => byLabel(tree.root, copy.stop)[0].props.onPress())
    expect(onRemove).toHaveBeenCalledWith('second')
    expect(onQueuedSend).toHaveBeenCalledWith('first')
    expect(onStop).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })
