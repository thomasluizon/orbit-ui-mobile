import { __resetTestHostConfig } from '../../../test-mocks/react-native'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AstraConversation } from '@/components/chat/conversation'
import { useUIStore } from '@/stores/ui-store'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/chat/chat-empty-state', () => ({ ChatEmptyState: () => React.createElement('ChatEmptyStateStub') }))
vi.mock('@/components/chat/proactive-action', () => ({ ProactiveAction: () => null }))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: () => React.createElement('MessageBubbleStub') }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => React.createElement('GoalDetailDrawerStub') }))
vi.mock('@/hooks/use-overlay-back', () => ({ useOverlayBack: vi.fn() }))

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

const words = { placeholder: 'Message', send: 'Send', paste: 'Paste', nothingToPaste: 'Nothing to paste', clear: 'Clear message', actions: 'Attachments', suggestionsLabel: 'Suggestions' }
const suggestions = [
  { id: 'review', label: 'Review routine', onSelect: vi.fn() },
  { id: 'plan', label: 'Plan routine', onSelect: vi.fn() },
]

function buildChat(): ChatController {
  return {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null }, messages: [], activeSteps: [],
    canShowFollowUps: false, isTyping: false, streamingMessageId: null, showSuggestions: true,
    sendMessage: vi.fn(), scrollToBottom: vi.fn(), handleBreakdownConfirmed: vi.fn(), revisePendingOperationForBubble: vi.fn(),
    refreshPendingOperationForBubble: vi.fn(), confirmAndExecutePendingOperation: vi.fn(), prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(), sendError: null, canRetryLastSend: false, retryLastSend: vi.fn(), speechError: null,
    composerProps: { state: 'idle', words, value: '', onChangeValue: vi.fn(), onSend: vi.fn(), suggestions },
  } as unknown as ChatController
}

describe('AstraConversation composer (mobile)', () => {
  afterEach(() => { useUIStore.getState().setAstraConversationOpen(false); __resetTestHostConfig() })

  it('renders the suggestion strip with no collapse control beside it', () => {
    useUIStore.getState().setAstraConversationOpen(true)
    let tree!: ReturnType<typeof TestRenderer.create>
    void TestRenderer.act(() => { tree = TestRenderer.create(<AstraConversation chat={buildChat()} />) })
    try {
      const nodes = tree.root.findAll(node => typeof node.type === 'string')
      expect(nodes.filter(node => node.props.testID === 'composer-suggestions-layout')).toHaveLength(1)
      expect(nodes.filter(node => typeof node.props.testID === 'string' && node.props.testID.startsWith('composer-collapse'))).toHaveLength(0)
      expect(nodes.filter(node => node.props.accessibilityLabel === 'shell.composer.collapse' || node.props.accessibilityLabel === 'shell.composer.expand')).toHaveLength(0)
    } finally { void TestRenderer.act(() => tree.unmount()) }
  })
})
