import React from 'react'
import { TextInput } from 'react-native'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { expect, it, vi } from 'vitest'
import { AstraConversation } from '@/components/chat/conversation'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __getFocusedInputSelection, __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const prompt = ptBR.habits.detail.askAstraSeedDefault.replace('{title}', 'Ler 10 minutos')

it('places the caret after the prefilled prompt only on conversation entry', async () => {
  const chat = createChat(false)
  let tree!: GeometryTree
  await renderer.act(() => { tree = renderer.create(<AstraConversation chat={chat} />) as GeometryTree })
  try {
    expect(__getFocusedInputSelection()).toEqual({ start: prompt.length, end: prompt.length })
    const selection = __getFocusedInputSelection()!
    selection.start = 3
    selection.end = 3
    await renderer.act(() => tree.update(<AstraConversation chat={{ ...chat, composerProps: { ...chat.composerProps, value: `${prompt}!` } }} />))
    expect(__getFocusedInputSelection()).toEqual({ start: 3, end: 3 })
  } finally { await renderer.act(() => tree.unmount()) }
})

function createChat(withMessages: boolean): ChatController {
  return {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null },
    messages: withMessages ? [{ id: 'previous', role: 'user', content: prompt, timestamp: new Date(0) }] : [],
    activeSteps: [], canShowFollowUps: false, isTyping: false, streamingMessageId: null,
    showSuggestions: !withMessages, sendMessage: vi.fn(), scrollToBottom: vi.fn(),
    composerProps: {
      state: 'idle', value: prompt, suggestions: [], words: ptBR.shell.composer,
      onChangeValue: vi.fn(), onSend: vi.fn(), onAttachFile: vi.fn(),
      attachWords: { ...ptBR.shell.composer.attach, remove: (name: string) => name },
    },
  } as unknown as ChatController
}

it.each([360, 412, 1200, 1600].flatMap(width => [false, true].map(withMessages => ({ width, withMessages }))))(
  'contains the prefilled input in the conversation at $width with messages $withMessages', async ({ width, withMessages }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: GeometryTree
    await renderer.act(() => { tree = renderer.create(<AstraConversation chat={createChat(withMessages)} />) as GeometryTree })
    try {
      for (const lines of [2, 5, 8, 1]) {
        const input = tree.root.findAll(node => node.type === TextInput)[0]!
        const reportSize = input.props.onContentSizeChange as (event: { nativeEvent: { target: number; contentSize: { width: number; height: number } } }) => void
        await renderer.act(() => reportSize({
          nativeEvent: { target: 1, contentSize: { width: width - 136, height: lines * 24 + 24 } },
        }))
        const geometry = measureSafeArea(tree.toJSON(), host => {
          if (host.props.testID === 'composer-field') return 'field'
          if (host.type === 'TextInput') return 'input'
          if (host.props.testID === 'composer-send-accent') return 'send'
        }, { width, height: 915 })
        const field = geometry.get('field')!
        const text = geometry.get('input')!
        const send = geometry.get('send')!
        expect(text.bottom - text.top).toBe(Math.min(lines, 5) * 24 + 24)
        expect(text.top).toBeGreaterThanOrEqual(field.top + 4)
        expect(text.bottom).toBe(field.bottom - 4)
        expect(send.bottom).toBe(text.bottom)
        expect(field.bottom - field.top).toBe(text.bottom - text.top + 8)
      }
    } finally { await renderer.act(() => tree.unmount()) }
  },
)
