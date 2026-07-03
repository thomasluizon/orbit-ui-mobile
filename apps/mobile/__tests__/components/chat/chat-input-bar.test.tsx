import { describe, expect, it, vi } from 'vitest'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('lucide-react-native', () => {
  const React = require('react')
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)
  return {
    Image: icon('Image'),
    Lock: icon('Lock'),
    Mic: icon('Mic'),
    Paperclip: icon('Paperclip'),
    Square: icon('Square'),
    ArrowUp: icon('ArrowUp'),
  }
})

vi.mock('@/components/chat/chat-animations', () => {
  const React = require('react')
  return {
    RecordingVisualizer: () => React.createElement('RecordingVisualizer'),
    RecordingPulseDot: () => React.createElement('RecordingPulseDot'),
  }
})

import { createTokensV2 } from '@/lib/theme'
import { createStyles } from '@/app/chat.styles'
import { ChatInputBar } from '@/components/chat/chat-input-bar'

const tokens = createTokensV2('purple', 'dark')
const styles = createStyles(tokens)

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    tokens,
    styles,
    isRecording: false,
    isTranscribing: false,
    isTyping: false,
    isOnline: true,
    atMessageLimit: false,
    limitLocked: false,
    selectedImagePresent: false,
    selectedTextFilePresent: false,
    transcript: '',
    composerResetSignal: 0,
    recordingTime: '0:00',
    speechSupported: true,
    onSend: vi.fn(),
    onToggleRecording: vi.fn(),
    onOpenFilePicker: vi.fn(),
    onOpenTextFilePicker: vi.fn(),
    ...overrides,
  }
}

function findInputValue(root: { findAll: (predicate: (node: { props?: Record<string, unknown> }) => boolean) => Array<{ props: Record<string, unknown> }> }) {
  const matches = root.findAll(
    (node) =>
      !!node.props &&
      typeof node.props.onChangeText === 'function' &&
      typeof node.props.value === 'string',
  )
  return matches[0]?.props.value as string | undefined
}

describe('ChatInputBar voice transcript (mobile)', () => {
  it('commits the transcript into the input after recording stops', async () => {
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ChatInputBar {...buildProps()} />)
      await Promise.resolve()
    })
    expect(findInputValue(tree!.root)).toBe('')

    await TestRenderer.act(async () => {
      tree!.update(<ChatInputBar {...buildProps({ isRecording: true })} />)
    })

    await TestRenderer.act(async () => {
      tree!.update(
        <ChatInputBar {...buildProps({ isRecording: false, transcript: 'buy milk' })} />,
      )
      await Promise.resolve()
    })

    expect(findInputValue(tree!.root)).toBe('buy milk')
  })
})

describe('ChatInputBar text-file attachment (mobile)', () => {
  it('invokes the text-file picker from the attach-file control', async () => {
    const onOpenTextFilePicker = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ChatInputBar {...buildProps({ onOpenTextFilePicker })} />,
      )
      await Promise.resolve()
    })

    const attachButton = tree!.root.findAll(
      (node: { props?: Record<string, unknown> }) =>
        !!node.props &&
        node.props.accessibilityLabel === 'chat.attachFile' &&
        typeof node.props.onPress === 'function',
    )[0] as { props: { onPress: () => void } } | undefined

    TestRenderer.act(() => {
      attachButton?.props.onPress()
    })

    expect(onOpenTextFilePicker).toHaveBeenCalled()
  })

  it('allows sending when only a text file is attached', async () => {
    const onSend = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ChatInputBar
          {...buildProps({ selectedTextFilePresent: true, onSend })}
        />,
      )
      await Promise.resolve()
    })

    const sendButton = tree!.root.findAll(
      (node: { props?: Record<string, unknown> }) =>
        !!node.props &&
        node.props.accessibilityLabel === 'chat.send' &&
        typeof node.props.onPress === 'function',
    )[0] as { props: { onPress: () => void } } | undefined

    TestRenderer.act(() => {
      sendButton?.props.onPress()
    })

    expect(onSend).toHaveBeenCalled()
  })
})
