import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { FlatList, View, type FlatListProps } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { chatBlockLayoutCases, makeChatBlockLayoutMessage } from '@orbit/shared/test-support/chat-block-layout'
import { AstraConversation } from '@/components/chat/conversation'
import { i18n } from '@/lib/i18n'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }),
  useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
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
    let copyIndex = 0
    const geometry = measureSafeArea(feed.toJSON(), host => {
      if (host.props.testID && /^block-frame-(resting|preview|partiallyFailed|confirm|stale|done|executing)/.test(host.props.testID)) return `block-${frameIndex++}`
      if (host.props.accessibilityLabel === i18n.t('chat.copy')) return `copy-${copyIndex++}`
    }, { width, height: 30000 })
    expect(frameIndex).toBe(scenario.count)
    const previousCopy = geometry.get('copy-0')!
    const currentCopy = prose ? geometry.get('copy-1')! : previousCopy
    expect(geometry.get('block-0')!.top - currentCopy.bottom).toBeCloseTo(16, 1)
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
