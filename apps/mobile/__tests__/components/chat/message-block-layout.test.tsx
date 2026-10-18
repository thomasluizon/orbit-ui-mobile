import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { FlatList, Text, View, type FlatListProps } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { chatBlockLayoutCases, makeChatBlockLayoutMessage, chatPartsLayoutCases, makeChatPartsLayoutMessage } from '@orbit/shared/test-support/chat-block-layout'
import { MessageBubble } from '@/components/message-bubble'
import { AstraConversation } from '@/components/chat/conversation'
import { BlockFrame } from '@/components/ui/block-frame'
import { Markdown } from '@/components/ui/markdown'
import { i18n } from '@/lib/i18n'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }),
  useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value, displayClock: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <Text style={{ fontSize: 16, lineHeight: 24 }}>{children}</Text> }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const cases = [412, 600, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale =>
  chatBlockLayoutCases.flatMap(scenario => [true, false].map(prose => ({ width, locale, scenario, prose, kind: scenario.kind })))))

afterEach(async () => {
  __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  await i18n.changeLanguage('en')
})

it.each([412, 1352])('aligns Android first Astra avatars and continuation blocks at %s', async width => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  const messages = [
    makeHeldHabitMessage({ id: 'first', content: 'First paragraph.\n\nSecond paragraph.', pendingOperations: [] }),
    makeChatBlockLayoutMessage(chatBlockLayoutCases[0]!, false),
    makeHeldHabitMessage({ id: 'person', role: 'user', content: 'My reply.', pendingOperations: [] }),
    { ...makeChatBlockLayoutMessage(chatBlockLayoutCases[0]!, false), id: 'next-turn' },
    makeHeldHabitMessage({ id: 'continuation', content: 'Another reply.', pendingOperations: [] }),
  ]
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null }, messages,
    activeSteps: [], showSuggestions: false, isTyping: false, streamingMessageId: null, canShowFollowUps: false,
    confirmAndExecutePendingOperation: vi.fn(), prepareStepUpForBubble: vi.fn(), verifyStepUpForBubble: vi.fn(),
    scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as ChatController
  let conversation!: GeometryTree
  let feed!: GeometryTree
  await renderer.act(() => { conversation = renderer.create(<AstraConversation chat={chat} />) as GeometryTree })
  try {
    const list = conversation.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
    const items = Array.from(list.data!)
    await renderer.act(() => { feed = renderer.create(<View style={list.contentContainerStyle}>
      {items.map((item, index) => <View key={item.id} testID={`turn-${index}`}>
        {list.renderItem!({ item, index, separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() } })}
      </View>)}
    </View>) as GeometryTree })
    const turns = items.map((_, index) => feed.root.findAll(node => typeof node.type === 'string' && node.props.testID === `turn-${index}`)[0]!)
    expect(turns.map(turn => turn.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-avatar').length)).toEqual([1, 0, 0, 1, 0])
    let avatarIndex = 0
    let proseIndex = 0
    let blockIndex = 0
    const geometry = measureSafeArea(feed.toJSON(), host => {
      if (host.props.testID?.startsWith('turn-')) return host.props.testID
      if (host.props.testID === 'astra-avatar') return `avatar-${avatarIndex++}`
      if (host.props.testID === 'message-prose') return `prose-${proseIndex++}`
      if (host.props.testID === 'block-frame-resting') return `block-${blockIndex++}`
    }, { width, height: 30000 })
    for (const [avatar, turn] of [[0, 0], [1, 3]]) {
      const mark = geometry.get(`avatar-${avatar}`)!
      expect(mark.left).toBe(geometry.get(`turn-${turn}`)!.left)
      expect(mark.width).toBe(24)
      expect(mark.bottom - mark.top).toBe(24)
    }
    for (const key of ['prose-0', 'prose-2', 'block-0', 'block-1', 'block-2', 'block-3']) {
      expect(geometry.get(key)!.left).toBe(16)
    }
    expect(geometry.get('prose-0')!.top - geometry.get('avatar-0')!.bottom).toBe(8)
    expect(geometry.get('block-2')!.top - geometry.get('avatar-1')!.bottom).toBe(8)
    expect(geometry.get('block-0')!.width).toBe(width - 32)
  } finally {
    await renderer.act(() => { feed.unmount(); conversation.unmount() })
  }
})

it.each([412, 1352].flatMap(width => ['empty', 'user', 'ai'].map(previous => ({ width, previous }))))(
  'aligns Android activeSteps with the completed trace at $width after $previous', async ({ width, previous }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    const messages = previous === 'empty' ? [] : [makeHeldHabitMessage({
      id: 'previous', role: previous === 'user' ? 'user' : 'ai', content: 'Previous message.', pendingOperations: [],
    })]
    const steps = [{ domain: 'habits', access: 'read' }]
    const chat = {
      threadScroll: createChatThreadScroll(), flatListRef: { current: null }, messages,
      activeSteps: steps, showSuggestions: false, isTyping: false, streamingMessageId: null, canShowFollowUps: false,
      scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
    } as unknown as ChatController
    let conversation!: GeometryTree
    let feed!: GeometryTree
    await renderer.act(() => { conversation = renderer.create(<AstraConversation chat={chat} />) as GeometryTree })
    const renderFeed = () => {
      const list = conversation.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
      return <View style={list.contentContainerStyle}>
        {Array.from(list.data!).map((item, index) => <React.Fragment key={item.id}>
          {list.renderItem!({ item, index, separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() } })}
        </React.Fragment>)}
        {list.ListFooterComponent as React.ReactElement}
      </View>
    }
    try {
      await renderer.act(() => { feed = renderer.create(renderFeed()) as GeometryTree })
      const runningMarks = feed.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-avatar').length
      const measure = () => measureSafeArea(feed.toJSON(), host => {
        if (host.props.testID?.startsWith('thinking-trace-')) return host.props.testID
        if (host.props.testID === 'message-prose') return host.props.testID
      }, { width, height: 30000 })
      const running = measure().get('thinking-trace-running')!
      await renderer.act(() => { conversation.update(<AstraConversation chat={{ ...chat, activeSteps: [], messages: [
        ...messages, makeHeldHabitMessage({ id: 'completed', content: 'Completed reply.', toolSteps: steps, pendingOperations: [] }),
      ] }} />) })
      await renderer.act(() => { feed.update(renderFeed()) })
      const completed = measure()
      expect(running.left).toBe(completed.get('thinking-trace-completed')!.left)
      expect(running.left).toBe(completed.get('message-prose')!.left)
      expect(runningMarks).toBe(1)
      expect(feed.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-avatar')).toHaveLength(1)
    } finally { await renderer.act(() => { feed.unmount(); conversation.unmount() }) }
  },
)

it.each(cases)('spaces Android $kind at $width in $locale with prose=$prose', async ({ width, locale, scenario, prose }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  await i18n.changeLanguage(locale)
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null },
    messages: [makeHeldHabitMessage({ id: 'previous', content: 'Review the routine.', pendingOperations: [] }), makeChatBlockLayoutMessage(scenario, prose)],
    activeSteps: [], showSuggestions: false, isTyping: false, streamingMessageId: null, canShowFollowUps: false,
    scrollToBottom: vi.fn(), sendMessage: vi.fn(), composerProps: { suggestions: [] },
    confirmAndExecutePendingOperation: vi.fn(), prepareStepUpForBubble: vi.fn(), verifyStepUpForBubble: vi.fn(),
  } as unknown as ChatController
  let conversation!: GeometryTree
  let feed!: GeometryTree
  await renderer.act(() => { conversation = renderer.create(<AstraConversation chat={chat} />) as GeometryTree })
  try {
    const list = conversation.root.findAll(node => node.type === FlatList)[0]!.props as unknown as FlatListProps<ChatMessage>
    await renderer.act(() => { feed = renderer.create(<View style={list.contentContainerStyle}>
      {Array.from(list.data!).map((item, index) => <React.Fragment key={item.id}>
        {list.renderItem!({ item, index, separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() } })}
      </React.Fragment>)}
    </View>) as GeometryTree })
    let frameIndex = 0
    let proseIndex = 0
    const geometry = measureSafeArea(feed.toJSON(), host => {
      if (host.props.testID && /^block-frame-(resting|preview|partiallyFailed|confirm|stale|done|executing)/.test(host.props.testID)) return `block-${frameIndex++}`
      if (host.props.testID === 'message-prose') return `prose-${proseIndex++}`
    }, { width, height: 30000 })
    expect(frameIndex).toBe(scenario.count)
    const previousProse = geometry.get('prose-0')!
    const currentProse = prose ? geometry.get('prose-1')! : previousProse
    expect(geometry.get('block-0')!.top - currentProse.bottom).toBeCloseTo(16, 1)
    for (let index = 0; index < scenario.count; index++) {
      const block = geometry.get(`block-${index}`)!
      expect(block.left).toBeCloseTo(16, 1)
      expect(block.width).toBeCloseTo(width - 32, 1)
      if (index > 0) expect(block.top - geometry.get(`block-${index - 1}`)!.bottom).toBeCloseTo(16, 1)
    }
  } finally {
    await renderer.act(() => { feed.unmount(); conversation.unmount() })
  }
})


it.each(chatPartsLayoutCases)('renders $kind parts in server order on Android', async scenario => {
  const message = makeChatPartsLayoutMessage(scenario)
  let tree!: GeometryTree
  await renderer.act(() => { tree = renderer.create(<MessageBubble message={message} isStreaming />) as GeometryTree })
  try {
    expect(tree.root.findAll(node => node.type === BlockFrame)).toHaveLength(0)
    await renderer.act(() => { tree.update(<MessageBubble message={message} />) })
    const parts = tree.root.findAll(node => node.type === BlockFrame || (node.type === View && node.props.testID === 'message-prose'))
    expect(parts.map(part => part.type === BlockFrame ? part.props.title === i18n.t('chat.habitList.title') ? 'habitList' : 'metrics' : 'text')).toEqual(scenario.order)
    const prose = parts.filter(part => part.type !== BlockFrame).map(part => part.findAll(node => node.type === Markdown)[0]!.props.children)
    expect(prose).toEqual(scenario.kind === 'all skipped'
      ? [message.content] : ['Here is what is left today.', 'And your week so far:'])
  } finally { await renderer.act(() => { tree.unmount() }) }
})
