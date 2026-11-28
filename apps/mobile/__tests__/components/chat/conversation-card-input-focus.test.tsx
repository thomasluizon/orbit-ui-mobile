import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { FlatList, TextInput, View, type FlatListProps, type TextInputProps } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { __emitKeyboardEvent } from '../../../test-mocks/react-native'
import { AstraConversation } from '@/components/chat/conversation'
import { KeyboardAwareFlatList } from '@/components/ui/keyboard-aware-scroll-view'

const composer = vi.hoisted(() => {
  const props: { onInputFocus?: () => void } = {}
  return { props }
})

vi.mock('expo-clipboard', () => ({ }))
vi.mock('@/lib/conversation-history', () => ({ conversationHistory: { latest: vi.fn(() => Promise.resolve(false)) } }))
vi.mock('@/hooks/use-habit-queries', () => ({}))
vi.mock('@/hooks/use-habit-logging', () => ({}))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: (props: typeof composer.props) => { composer.props = props; return null } }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/message-bubble', async () => {
  const { Input } = await import('@/components/ui/input')
  return { MessageBubble: () => <Input label="Quer responder com suas palavras?" value="" onChange={() => {}} maxLength={500} /> }
})
vi.mock('react-native', async (importOriginal) => {
  const React = await import('react')
  const original = await importOriginal<typeof import('react-native')>()
  return {
    ...original,
    FlatList: React.forwardRef<View, FlatListProps<ChatMessage>>((props, ref) => <original.View ref={ref} {...props}>
      {Array.from(props.data ?? []).map((item, index) => <original.View key={item.id}>
        {props.renderItem?.({ item, index, separators: { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} } })}
      </original.View>)}
    </original.View>),
  }
})

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
type Chat = ChatController & { scrollToBottom: ReturnType<typeof vi.fn> }
afterEach(() => vi.restoreAllMocks())

const scrollEvent = (offset: number, viewport: number) => ({ nativeEvent: {
  contentOffset: { x: 0, y: offset }, contentSize: { width: 412, height: 1400 }, layoutMeasurement: { width: 412, height: viewport },
} }) as Parameters<NonNullable<FlatListProps<ChatMessage>['onScroll']>>[0]

const focusEvent = { nativeEvent: { target: 0 } } as Parameters<NonNullable<TextInputProps['onFocus']>>[0]
const cardInput = (tree: ReactTestRenderer) => tree.root.findAll(node => node.type === TextInput)[0]!.props as TextInputProps

async function openConversation() {
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => { callback(0); return 0 })
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null as null | { scrollToEnd: () => void } },
    messages: [{ id: 'ai-question', role: 'ai', content: '', timestamp: new Date() }],
    activeSteps: [], canShowFollowUps: false, isTyping: false, streamingMessageId: null,
    showSuggestions: false, sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as Chat
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<AstraConversation chat={chat} />) })
  const list = () => tree.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
  await act(() => list().onContentSizeChange?.(412, 1400))
  await act(() => list().onScroll?.(scrollEvent(930, 470)))
  const scrollToEnd = vi.spyOn(chat.flatListRef.current!, 'scrollToEnd')
  chat.scrollToBottom.mockClear()
  const close = async () => { await act(() => tree.unmount()); vi.unstubAllGlobals() }
  return { chat, tree, list, scrollToEnd, close }
}

it('keeps a focused card input in view when the thread content grows', async () => {
  const { chat, tree, list, scrollToEnd, close } = await openConversation()
  try {
    const input = cardInput(tree)
    await act(() => input.onFocus?.(focusEvent))
    await act(() => { __emitKeyboardEvent('keyboardDidShow') })
    await act(() => list().onScroll?.(scrollEvent(1000, 170)))
    await act(() => list().onContentSizeChange?.(412, 1424))
    expect(chat.threadScroll.isFollowing()).toBe(true)
    expect(chat.scrollToBottom).not.toHaveBeenCalled()
    expect(scrollToEnd).not.toHaveBeenCalled()
  } finally {
    await close()
  }
})

it('does not scroll to the end when the keyboard hides while a card input has focus', async () => {
  const { tree, scrollToEnd, close } = await openConversation()
  try {
    const input = cardInput(tree)
    await act(() => input.onFocus?.(focusEvent))
    await act(() => { __emitKeyboardEvent('keyboardDidShow') })
    await act(() => { __emitKeyboardEvent('keyboardDidHide') })
    expect(scrollToEnd).not.toHaveBeenCalled()
  } finally {
    await close()
  }
})

it('follows the newest reply while the composer has focus', async () => {
  const { chat, list, close } = await openConversation()
  try {
    await act(() => composer.props.onInputFocus?.())
    await act(() => { __emitKeyboardEvent('keyboardDidShow') })
    await act(() => list().onContentSizeChange?.(412, 1424))
    expect(chat.scrollToBottom).toHaveBeenCalledTimes(1)
  } finally {
    await close()
  }
})

it('resumes the follow rules when the card input loses focus', async () => {
  const { chat, tree, list, scrollToEnd, close } = await openConversation()
  try {
    const input = cardInput(tree)
    await act(() => input.onFocus?.(focusEvent))
    await act(() => input.onBlur?.(focusEvent))
    await act(() => list().onContentSizeChange?.(412, 1424))
    expect(chat.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(scrollToEnd).not.toHaveBeenCalled()
  } finally {
    await close()
  }
})

it('defaults keyboardShouldPersistTaps to handled and keeps a value from the caller', async () => {
  const persistTaps = async (value?: 'always' | 'never') => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<KeyboardAwareFlatList data={[]} renderItem={() => null} keyboardShouldPersistTaps={value} />) })
    const taps = tree.root.findAll(node => node.type === FlatList)[0]!.props.keyboardShouldPersistTaps
    await act(() => tree.unmount())
    return taps
  }
  expect(await persistTaps()).toBe('handled')
  expect(await persistTaps('always')).toBe('always')
  expect(await persistTaps('never')).toBe('never')
})
