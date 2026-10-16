import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { Text, View, type FlatListProps } from 'react-native'
import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { AstraConversation } from '@/components/chat/conversation'
import { MessageBubble } from '@/components/message-bubble'
import { measureSafeArea, type GeometryTree } from '../../support/safe-area-geometry'

vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <Text>{children}</Text> }))
vi.mock('@/hooks/use-habits', () => ({}))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('react-native', async (importOriginal) => {
  const React = await import('react')
  const original = await importOriginal<typeof import('react-native')>()
  return {
    ...original,
    FlatList: React.forwardRef<View, FlatListProps<ChatMessage>>((props, ref) => <original.View ref={ref} {...props}>
      {Array.from(props.data ?? []).map((item, index) => <original.View key={item.id}>
        {props.renderItem?.({ item, index, separators: { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} } })}
      </original.View>)}
      {React.isValidElement(props.ListFooterComponent) ? <original.View>{props.ListFooterComponent}</original.View> : null}
    </original.View>),
  }
})

await vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module')
  const load = createRequire(import.meta.url)
  const nativePath = load.resolve('react-native')
  const nativeModule = new Module(nativePath)
  nativeModule.exports = await import('react-native')
  load.cache[nativePath] = nativeModule
  const svgPath = load.resolve('react-native-svg')
  const svgModule = new Module(svgPath)
  svgModule.exports = await import('react-native-svg')
  load.cache[svgPath] = svgModule
})

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
it.each([412, 1352])('replaces the native pending line at the same reply origin at %s', async (width) => {
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null },
    messages: [{ id: 'question', role: 'user', content: 'Plan my morning', timestamp: new Date() }],
    activeSteps: [], canShowFollowUps: false, isTyping: true, streamingMessageId: null,
    showSuggestions: false, sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as ChatController
  let tree!: GeometryTree
  await act(() => { tree = create(<AstraConversation chat={chat} />) as GeometryTree })
  try {
    const pending = measureSafeArea(tree.toJSON(), host => host.props.testID === 'astra-pending' ? 'pending' : undefined, { width, height: 915 }).get('pending')
    expect(pending).toBeDefined()
    expect(pending!.bottom - pending!.top).toBe(24)
    chat.isTyping = false
    chat.streamingMessageId = 'reply'
    chat.messages = [...chat.messages, { id: 'reply', role: 'ai', content: 'Start with water', timestamp: new Date() }]
    await act(() => tree.update(<AstraConversation chat={chat} />))
    const reply = measureSafeArea(tree.toJSON(), host => host.props.accessibilityLabel === 'chat.senderOrbit' ? 'reply' : undefined, { width, height: 915 }).get('reply')
    expect(reply).toBeDefined()
    expect(reply!.left).toBe(pending!.left)
    expect(reply!.top).toBe(pending!.top)
    const bubble = tree.root.findAll(node => node.type === MessageBubble).at(-1)!
    expect(bubble.props.animateEntry).toBe(false)
  } finally { await act(() => tree.unmount()) }
})
