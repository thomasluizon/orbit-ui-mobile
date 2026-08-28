import React from 'react'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'

const { useTourTargetMock } = vi.hoisted(() => ({
  useTourTargetMock: vi.fn(),
}))

vi.mock('@/hooks/use-tour-target', () => ({
  useTourTarget: useTourTargetMock,
}))

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
  add: 'attach sentinel',
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
    TestRenderer.act(() => secondChip?.props.onPress())
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
    TestRenderer.act(() => byLabel(tree.root, words.send)[0].props.onPress())
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('sends an attached image when the text is blank', async () => {
    const onSend = vi.fn()
    const tree = await renderComposer(props({
      value: '   ',
      onSend,
      onAttach: vi.fn(),
      attachWords,
      attachments: [{ id: 'image-id', kind: 'image', name: 'walk.png' }],
      onAttachRemove: vi.fn(),
    }))
    const send = byLabel(tree.root, words.send)[0]
    expect(send.props.disabled).toBe(false)
    TestRenderer.act(() => send.props.onPress())
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
    TestRenderer.act(() => byLabel(tree.root, voiceWords.start)[0].props.onPress())
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
    const tree = await renderComposer(props({ state: 'recording', onVoice: vi.fn(), voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.recording)
    expect(byLabel(tree.root, words.suggestionsLabel)).toHaveLength(0)
    expect(byLabel(tree.root, voiceWords.stop)).toHaveLength(1)
  })

  it('renders transcribing status with an unusable input', async () => {
    const tree = await renderComposer(props({ state: 'transcribing', onVoice: vi.fn(), voiceWords }))
    expect(textValues(tree.root)).toContain(voiceWords.transcribing)
    expect(byLabel(tree.root, words.placeholder)[0].props.editable).toBe(false)
  })

  it('renders attachment capability without an empty tray', async () => {
    const tree = await renderComposer(props({ onAttach: vi.fn(), attachWords }))
    expect(byLabel(tree.root, attachWords.add)).toHaveLength(1)
    expect(byLabel(tree.root, attachWords.trayLabel)).toHaveLength(0)
  })

  it('names, distinguishes, and removes each attachment independently', async () => {
    const onAttachRemove = vi.fn()
    const attachments = [
      { id: 'file-id', kind: 'file' as const, name: 'notes.txt' },
      { id: 'image-id', kind: 'image' as const, name: 'walk.png' },
    ]
    const tree = await renderComposer(props({ onAttach: vi.fn(), attachWords, attachments, onAttachRemove }))
    expect(textValues(tree.root)).toEqual(expect.arrayContaining(['notes.txt', 'walk.png']))
    expect(byLabel(tree.root, attachWords.remove('notes.txt'))).toHaveLength(1)
    TestRenderer.act(() => byLabel(tree.root, attachWords.remove('walk.png'))[0].props.onPress())
    expect(onAttachRemove).toHaveBeenCalledOnce()
    expect(onAttachRemove).toHaveBeenCalledWith('image-id')
    expect(tree.root.findByProps({ testID: 'composer-attachment-file' })).toBeDefined()
    expect(tree.root.findByProps({ testID: 'composer-attachment-image' })).toBeDefined()
  })

  it('renders and invokes retry only when present', async () => {
    const onRetry = vi.fn()
    const retryWords = { ...words, retry: 'retry sentinel' }
    const tree = await renderComposer(props({ words: retryWords, onRetry }))
    TestRenderer.act(() => {
      const retry = tree.root.findAllByType('Pressable').find(
        (node: { props: { onPress?: unknown } }) => node.props.onPress === onRetry,
      )
      retry?.props.onPress()
    })
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
