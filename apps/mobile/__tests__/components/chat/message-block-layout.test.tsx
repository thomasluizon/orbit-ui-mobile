import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { FlatList, View, type FlatListProps } from 'react-native'
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
  useHabitMetrics: () => ({ isPending: false, isError: false, isRefetchError: false }),
  useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }),
  useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: false } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value, displayClock: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <View>{children}</View> }))
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

vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({ streakInfo: null, streakQuery: { isPending: false, isError: false, isRefetchError: false } }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
