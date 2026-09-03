import React from 'react'
import { Animated, StyleSheet } from 'react-native'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'

const { useTourTargetMock } = vi.hoisted(() => ({
  useTourTargetMock: vi.fn(),
}))

vi.mock('@/hooks/use-tour-target', () => ({
  useTourTarget: useTourTargetMock,
}))

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

  return { ...original, Pressable }
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

describe('Composer (mobile)', () => {
  beforeEach(() => {
    useTourTargetMock.mockClear()
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

  it('renders six suggestions', async () => {
    const tree = await renderComposer(props({ suggestions: suggestions(6) }))
    expect(textValues(tree.root).filter((value: unknown) => String(value).startsWith('chip sentinel'))).toHaveLength(6)
  })

  it('selects only the pressed suggestion', async () => {
    const chips = suggestions(3)
    const tree = await renderComposer(props({ suggestions: chips }))
    const secondChip = tree.root.findAllByType('Pressable').find(
      (node: { props: { onPress?: unknown } }) => node.props.onPress === chips[1].onSelect,
    )
    if (secondChip) pressControl(secondChip)
    expect(chips[1].onSelect).toHaveBeenCalledOnce()
    expect(chips[0].onSelect).not.toHaveBeenCalled()
    expect(chips[2].onSelect).not.toHaveBeenCalled()
  })

  it('reports input changes', async () => {
    const onChangeValue = vi.fn()
    const tree = await renderComposer(props({ onChangeValue }))
    TestRenderer.act(() => byLabel(tree.root, words.placeholder)[0].props.onChangeText('oi'))
    expect(onChangeValue).toHaveBeenCalledWith('oi')
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

  it('disables input and send while keeping suggestions during sending', async () => {
    const tree = await renderComposer(props({ state: 'sending', value: 'oi' }))
    expect(byLabel(tree.root, words.placeholder)[0].props.editable).toBe(false)
    expect(byLabel(tree.root, words.send)[0].props.disabled).toBe(true)
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(1)
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

  it('registers the rendered voice control as the stable tour target', async () => {
    const tree = await renderComposer(props({ onVoice: vi.fn(), voiceWords }))
    expect(tree.root.findByProps({ testID: 'tour-chat-voice' })).toBeDefined()
    expect(useTourTargetMock).toHaveBeenCalledWith('tour-chat-voice', expect.any(Object))
  })

  it('replaces suggestions with recording status and a stop control', async () => {
    const onVoice = vi.fn()
    const tree = await renderComposer(props({ state: 'recording', onVoice, voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.recording)
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(0)
    expect(byLabel(tree.root, voiceWords.stop)).toHaveLength(1)
    pressControl(byLabel(tree.root, voiceWords.stop)[0])
    expect(onVoice).toHaveBeenCalledOnce()
  })

  it('renders transcribing status with an unusable input', async () => {
    const tree = await renderComposer(props({ state: 'transcribing', onVoice: vi.fn(), voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.transcribing)
    expect(byLabel(tree.root, words.placeholder)[0].props.editable).toBe(false)
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
    expect(input.props.placeholder).toBe(words.placeholder)
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
