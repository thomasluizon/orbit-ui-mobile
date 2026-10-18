import { createChatThreadScroll } from '@orbit/shared/hooks'
import React, { Profiler } from 'react'
import { Animated, FlatList, StyleSheet, Text, View, type FlatListProps, type ViewStyle } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { act, create } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { AstraConversation } from '@/components/chat/conversation'
import { MessageBubble } from '@/components/message-bubble'
import * as motion from '@/lib/motion'
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
afterEach(() => vi.restoreAllMocks())

function expectPendingDotsVisible(tree: GeometryTree) {
  const pending = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-pending')[0]!
  const hosts = pending.findAll(node => typeof node.type === 'string')
  expect(hosts.filter(node => StyleSheet.flatten<ViewStyle>(node.props.style ?? {}).width === 4)).toHaveLength(3)
  for (const host of hosts) {
    const opacity = StyleSheet.flatten<ViewStyle>(host.props.style ?? {}).opacity
    if (opacity instanceof Animated.Value) {
      const observed = vi.fn()
      opacity.stopAnimation(observed)
      expect(observed).toHaveBeenCalledWith(1)
    } else if (opacity !== undefined) expect(opacity).toBe(1)
  }
}

it.each([412, 1352].flatMap(width => [false, true].map(reduced => ({ width, reduced }))))('keeps pending dots visible after a layout-only reveal at $width, reduced motion $reduced', async ({ width, reduced }) => {
  vi.spyOn(motion, 'usePrefersReducedMotion').mockReturnValue(reduced)
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null },
    messages: [{ id: 'question', role: 'user', content: 'Plan my morning', timestamp: new Date() }],
    activeSteps: [], canShowFollowUps: false, isTyping: true, streamingMessageId: null,
    showSuggestions: false, sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as ChatController
  const onRender = vi.fn()
  let tree!: GeometryTree
  await act(() => { tree = create(<Profiler id="conversation" onRender={onRender}><AstraConversation chat={chat} /></Profiler>) as GeometryTree })
  try {
    const list = tree.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
    for (const offset of [900, 600]) await act(() => list.onScroll?.({ nativeEvent: {
      contentOffset: { x: 0, y: offset }, contentSize: { width, height: 1400 },
      layoutMeasurement: { width, height: 500 },
    } } as Parameters<NonNullable<FlatListProps<ChatMessage>['onScroll']>>[0]))
    expect(chat.threadScroll.isFollowing()).toBe(false)
    onRender.mockClear()
    await act(() => list.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width, height: 780 } } } as Parameters<NonNullable<FlatListProps<ChatMessage>['onLayout']>>[0]))
    expectPendingDotsVisible(tree)
    expect(chat.threadScroll.isFollowing()).toBe(false)
    expect(chat.scrollToBottom).not.toHaveBeenCalled()
    expect(onRender).not.toHaveBeenCalled()
  } finally { await act(() => tree.unmount()) }
})

it('does not render the conversation while scrolling across the pending visibility boundary', async () => {
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null },
    messages: [{ id: 'question', role: 'user', content: 'Plan my morning', timestamp: new Date() }],
    activeSteps: [], canShowFollowUps: false, isTyping: true, streamingMessageId: null,
    showSuggestions: false, sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as ChatController
  const onRender = vi.fn()
  let tree!: GeometryTree
  await act(() => { tree = create(<Profiler id="conversation" onRender={onRender}><AstraConversation chat={chat} /></Profiler>) as GeometryTree })
  try {
    const cancel = vi.spyOn(Reanimated, 'cancelAnimation')
    const repeat = vi.spyOn(Reanimated, 'withRepeat')
    let previouslyVisible = true
    expectPendingDotsVisible(tree)
    onRender.mockClear()
    for (const offset of [900, 100, 101, 860, 861, 899, 900]) {
      cancel.mockClear()
      repeat.mockClear()
      await act(() => {
        const list = tree.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
        list.onScroll?.({ nativeEvent: {
          contentOffset: { x: 0, y: offset }, contentSize: { width: 412, height: 1400 },
          layoutMeasurement: { width: 412, height: 500 },
        } } as Parameters<NonNullable<FlatListProps<ChatMessage>['onScroll']>>[0])
      })
      expect(onRender).not.toHaveBeenCalled()
      expectPendingDotsVisible(tree)
      const visible = 900 - offset < 40
      expect(cancel).toHaveBeenCalledTimes(visible === previouslyVisible ? 0 : 1)
      expect(repeat).toHaveBeenCalledTimes(visible && !previouslyVisible ? 1 : 0)
      previouslyVisible = visible
    }
    expect(chat.threadScroll.isFollowing()).toBe(true)
  } finally { await act(() => tree.unmount()) }
})

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
    const avatars = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-avatar')
    expect(avatars).toHaveLength(1)
    expect(avatars[0]!.props.accessibilityElementsHidden).toBe(true)
    const markPosition = measureSafeArea(tree.toJSON(), host => host.props.testID === 'astra-avatar' ? 'avatar' : undefined, { width, height: 915 }).get('avatar')!
    expect(markPosition.width).toBe(24)
    expect(markPosition.bottom - markPosition.top).toBe(24)
    expect(markPosition.left).toBe(pending!.left)
    expect(pending!.top - markPosition.bottom).toBe(8)
    chat.isTyping = false
    chat.streamingMessageId = 'reply'
    chat.messages = [...chat.messages, { id: 'reply', role: 'ai', content: 'Start with water', timestamp: new Date() }]
    await act(() => tree.update(<AstraConversation chat={chat} />))
    const reply = measureSafeArea(tree.toJSON(), host => host.props.accessibilityLabel === 'chat.senderOrbit' ? 'reply' : undefined, { width, height: 915 }).get('reply')
    expect(reply).toBeDefined()
    expect(reply!.left).toBe(pending!.left)
    expect(reply!.top).toBe(pending!.top)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-avatar')).toHaveLength(1)
    expect(measureSafeArea(tree.toJSON(), host => host.props.testID === 'astra-avatar' ? 'avatar' : undefined, { width, height: 915 }).get('avatar')).toEqual(markPosition)
    const bubble = tree.root.findAll(node => node.type === MessageBubble).at(-1)!
    expect(bubble.props.animateEntry).toBe(false)
  } finally { await act(() => tree.unmount()) }
})
