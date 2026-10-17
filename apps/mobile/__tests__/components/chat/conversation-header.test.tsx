import { __setScrollToImpl, __resetTestHostConfig } from '../../../test-mocks/react-native'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { useChatStore } from '@/stores/chat-store'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { AstraConversation } from '@/components/chat/conversation'
import { createTokensV2 } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key === 'chat.title' ? 'Astra' : key, i18n: { language: 'pt-BR' } }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: () => React.createElement('ChatEmptyStateStub'),
}))

vi.mock('@/components/chat/proactive-action', () => ({ ProactiveAction: () => null }))

vi.mock('@/components/shell/composer', () => ({
  Composer: () => React.createElement('ComposerStub'),
}))

vi.mock('@/components/message-bubble', () => ({
  MessageBubble: () => React.createElement('MessageBubbleStub'),
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: () => React.createElement('GoalDetailDrawerStub'),
}))

const overlayBack = vi.hoisted(() => ({ handler: null as null | (() => void) }))

vi.mock('@/hooks/use-overlay-back', () => ({
  useOverlayBack: (_enabled: boolean, onBack: () => void) => {
    overlayBack.handler = onBack
  },
}))

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function buildChat(): ChatController {
  return {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null },
    messages: [],
    activeSteps: [],
    canShowFollowUps: false,
    isTyping: false,
    streamingMessageId: null,
    showSuggestions: true,
    sendMessage: vi.fn(),
    scrollToBottom: vi.fn(),
    handleBreakdownConfirmed: vi.fn(),
    revisePendingOperationForBubble: vi.fn(),
    refreshPendingOperationForBubble: vi.fn(),
    confirmAndExecutePendingOperation: vi.fn(),
    prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(),
    sendError: null,
    canRetryLastSend: false,
    retryLastSend: vi.fn(),
    speechError: null,
    composerProps: { suggestions: [] },
  } as unknown as ChatController
}

function render() {
  let tree!: ReturnType<typeof TestRenderer.create>
  void TestRenderer.act(() => {
    tree = TestRenderer.create(<AstraConversation chat={buildChat()} />)
  })
  return tree
}

function hosts(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll((node) => typeof node.type === 'string')
}

describe('AstraConversation header (mobile)', () => {
  afterEach(() => {
    useUIStore.getState().setAstraConversationOpen(false)
    overlayBack.handler = null
  })

  it('closes the conversation from one trailing control, with no back control', () => {
    useUIStore.getState().setAstraConversationOpen(true)
    const tree = render()

    expect(hosts(tree).filter((node) => node.props.testID === 'nav-header-plain')).toHaveLength(1)
    expect(hosts(tree).filter((node) => node.props.testID === 'nav-header-back')).toHaveLength(0)
    const close = hosts(tree).filter(
      (node) => node.props.accessibilityLabel === 'common.closeConversation',
    )
    expect(close).toHaveLength(1)

    void TestRenderer.act(() => (close[0]!.props.onPressIn as () => void)())
    expect(StyleSheet.flatten(close[0]!.props.style as StyleProp<ViewStyle>)).toMatchObject({
      width: 48,
      height: 48,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: createTokensV2('orange', 'dark').bgHover,
    })
    void TestRenderer.act(() => (close[0]!.props.onPressOut as () => void)())
    expect(StyleSheet.flatten(close[0]!.props.style as StyleProp<ViewStyle>).backgroundColor).toBe('transparent')

    void TestRenderer.act(() => {
      (close[0]!.props.onPress as () => void)()
    })

    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('shows one named heading containing a decorative Astra mark and receives opening focus', () => {
    const focus = vi.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    const tree = render()
    try {
      const header = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'nav-header-plain')[0]!
      expect(header.findAll((node) => node.type === AstraGlyph)).toHaveLength(1)
      const headings = hosts(tree).filter((node) => node.props.accessibilityRole === 'header')
      expect(headings).toHaveLength(1)
      expect(headings[0]!.props.accessibilityLabel).toBe('Astra')
      expect(header.findAll((node) => typeof node.type === 'string' && node.props.children === 'Astra')).toHaveLength(0)
      expect(header.findAll((node) => node.props.testID === 'astra-mark-16')[0]!.props.accessible).toBe(false)
      expect(focus).toHaveBeenCalledWith(expect.objectContaining({ __nativeTag: headings[0]!.props.__nativeTag }), 'focus')
    } finally { focus.mockRestore(); void TestRenderer.act(() => tree.update(<></>)) }
  })

  it('still closes the conversation on the Android back button', () => {
    useUIStore.getState().setAstraConversationOpen(true)
    render()

    void TestRenderer.act(() => {
      overlayBack.handler?.()
    })

    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })
})

it('opens and reopens the proactive message without following a previous streaming thread', () => {
  useChatStore.setState({ messages: [], proactiveOutcomes: {} })
  const item = createMockProactiveItem()
  for (let index = 0; index < 30; index++) useChatStore.getState().addMessage({ id: `old-${index}`, role: 'ai', content: 'Previous reply', timestamp: new Date() })
  useChatStore.getState().openProactiveItem(item)
  const chat = { ...buildChat(), showSuggestions: false, messages: useChatStore.getState().messages, streamingMessageId: 'old-29' }
  const scroll = vi.fn()
  __setScrollToImpl(scroll)
  let tree!: ReturnType<typeof TestRenderer.create>
  void TestRenderer.act(() => { tree = TestRenderer.create(<AstraConversation chat={chat} />) })
  try {
    const list = tree.root.findAll((node) => String(node.type) === 'FlatList')[0]!
    void TestRenderer.act(() => (list.props.onContentSizeChange as () => void)())
    expect(scroll).toHaveBeenCalledWith({ y: 0, animated: false })
    expect(chat.threadScroll.isFollowing()).toBe(false)
    scroll.mockClear()
    void TestRenderer.act(() => { useChatStore.getState().openProactiveItem(item) })
    void TestRenderer.act(() => (list.props.onContentSizeChange as () => void)())
    expect(scroll).toHaveBeenCalledWith({ y: 0, animated: false })
    expect(useChatStore.getState().messages.some((message) => message.id === 'old-29')).toBe(true)
  } finally { void TestRenderer.act(() => tree.update(<></>)); __resetTestHostConfig() }
})
