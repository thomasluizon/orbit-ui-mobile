import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import ChatScreen from '@/app/chat'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  showSuggestions: true,
}))

vi.mock('@/hooks/use-tour-target', () => ({ useTourTarget: () => {} }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => () => {} }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabitDetail: () => ({ data: null }) }))
vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({
    flatListRef: React.createRef(),
    messages: [],
    showSuggestions: mocks.showSuggestions,
    starterChips: [],
    hasProAccess: false,
    atMessageLimit: true,
  }),
}))
vi.mock('@orbit/shared/hooks', () => ({ CHAT_GOAL_ACTION_TYPES: new Set() }))
vi.mock('@orbit/shared/utils', () => ({ habitDetailToNormalized: () => null }))
vi.mock('@/lib/theme', () => ({ createTokensV2: () => ({ bg: '#000000' }) }))
vi.mock('@/app/chat.styles', () => ({
  createStyles: () => ({ safeArea: {}, keyboardAvoid: {}, messageList: {} }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/chat/chat-input-area', () => ({
  ChatInputArea: React.forwardRef((props) => React.createElement('ChatInputArea', props)),
}))
vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: React.forwardRef(() => React.createElement('ChatEmptyState')),
}))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: () => null }))
vi.mock('@/components/chat/typing-indicator', () => ({ TypingIndicator: () => null }))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/astra-avatar', () => ({ AstraMark: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/habits/habit-detail-drawer', () => ({ HabitDetailDrawer: () => null }))

describe('ChatScreen keyboard avoidance', () => {
  it.each([true, false])('keeps its composer inside active Android avoidance when suggestions are %s', (showSuggestions) => {
    mocks.showSuggestions = showSuggestions
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<ChatScreen />)
    })

    const avoidingView = tree!.root.findByType('KeyboardAvoidingView')
    const composer = avoidingView.findByType('ChatInputArea')
    expect(avoidingView.props.behavior).toBe('height')
    expect(composer.props.marginBottom).toBe(0)
  })

  it('passes no ad reward flow to the composer at the free message limit', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<ChatScreen />)
    })

    const composer = tree!.root.findByType('ChatInputArea')
    expect(composer.props.atMessageLimit).toBe(true)
    expect(composer.props.reward).toBeUndefined()
  })
})
