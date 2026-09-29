import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'pt-BR' } }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: () => React.createElement('ChatEmptyStateStub'),
}))

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

import { AstraConversation } from '@/components/chat/conversation'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function buildChat(): ChatController {
  return {
    flatListRef: { current: null },
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
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<AstraConversation chat={buildChat()} />)
  })
  return tree
}

function hosts(tree: any) {
  return tree.root.findAll((node: any) => typeof node.type === 'string')
}

describe('AstraConversation header (mobile)', () => {
  afterEach(() => {
    useUIStore.getState().setAstraConversationOpen(false)
    overlayBack.handler = null
  })

  it('closes the conversation from one trailing control, with no back control', () => {
    useUIStore.getState().setAstraConversationOpen(true)
    const tree = render()

    expect(hosts(tree).filter((node: any) => node.props.testID === 'nav-header-plain')).toHaveLength(1)
    expect(hosts(tree).filter((node: any) => node.props.testID === 'nav-header-back')).toHaveLength(0)
    const close = hosts(tree).filter(
      (node: any) => node.props.accessibilityLabel === 'common.closeConversation',
    )
    expect(close).toHaveLength(1)

    TestRenderer.act(() => {
      close[0].props.onPress()
    })

    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('still closes the conversation on the Android back button', () => {
    useUIStore.getState().setAstraConversationOpen(true)
    render()

    TestRenderer.act(() => {
      overlayBack.handler?.()
    })

    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })
})
