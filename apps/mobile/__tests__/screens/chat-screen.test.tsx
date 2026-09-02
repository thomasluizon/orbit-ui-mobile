import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AstraConversation } from '@/components/chat/conversation'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  useTourTarget: vi.fn(),
  router: { push: vi.fn() },
  composer: {
    flatListRef: { current: null },
    messages: [],
    isTyping: false,
    streamingMessageId: null,
    sendError: null as string | null,
    speechError: null as string | null,
    composerProps: {
      words: {
        placeholder: 'shell.composer.placeholder',
        send: 'shell.composer.send',
        suggestionsLabel: 'shell.composer.suggestionsLabel',
      },
      value: '',
      onChangeValue: vi.fn(),
      onSend: vi.fn(),
      suggestions: [],
      state: 'atLimit' as const,
      limitReason: 'limit reason',
    },
    hasProAccess: false,
    showSuggestions: true,
    sendMessage: vi.fn(),
    scrollToBottom: vi.fn(),
    handleBreakdownConfirmed: vi.fn(),
    confirmAndExecutePendingOperation: vi.fn(),
    prepareStepUpForBubble: vi.fn(),
    verifyStepUpForBubble: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('expo-router', () => ({ useRouter: () => mocks.router }))
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    Linking: { openSettings: (...arguments_: unknown[]) => mocks.openSettings(...arguments_) },
  }
})
vi.mock('@/hooks/use-tour-target', () => ({ useTourTarget: mocks.useTourTarget }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => mocks.composer }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-habits', () => ({ useHabitDetail: () => ({ data: null }) }))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))
vi.mock('@/components/shell/composer', () => ({
  Composer: (props: { limitRecovery?: React.ReactNode }) =>
    React.createElement('Composer', props, props.limitRecovery),
}))
vi.mock('@/components/chat/chat-empty-state', () => ({
  ChatEmptyState: React.forwardRef(() => React.createElement('ChatEmptyState')),
}))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: () => null }))
vi.mock('@/components/chat/typing-indicator', () => ({ TypingIndicator: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/habits/habit-detail-drawer', () => ({ HabitDetailDrawer: () => null }))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/astra-avatar', () => ({ AstraMark: () => null }))
vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))
vi.mock('@/components/ui/offline-unavailable-state', () => ({ OfflineUnavailableState: () => null }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: (props: { children: string; disabled?: boolean; onClick: () => void }) =>
    React.createElement(
      'Pressable',
      {
        accessibilityLabel: props.children,
        disabled: props.disabled,
        onPress: props.onClick,
      },
      React.createElement('Text', null, props.children),
    ),
}))
vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareFlatList: () => null,
}))
vi.mock('@/components/chat/conversation.styles', () => ({
  createStyles: () => new Proxy({}, { get: () => ({}) }),
}))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

async function renderScreen() {
  let tree!: { root: TestNode; update: (element: React.ReactElement) => void }
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<AstraConversation chat={mocks.composer as never} />)
    await Promise.resolve()
  })
  return tree
}

function findByLabel(root: TestNode, label: string): TestNode | undefined {
  return root.findAll((node) => node.props.accessibilityLabel === label)[0]
}

function press(node: TestNode | undefined) {
  if (!node || typeof node.props.onPress !== 'function') {
    throw new Error('Expected a pressable node')
  }
  node.props.onPress()
}

describe('ChatScreen composer recoveries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.composer.sendError = null
    mocks.composer.speechError = null
  })

  it('keeps the at-limit composer free of rewarded recovery', async () => {
    const tree = await renderScreen()

    expect(findByLabel(tree.root, 'ads.watchForMessages')).toBeUndefined()
  })

  it('keeps microphone permission recovery after the transient alert clears', async () => {
    mocks.composer.sendError = 'speech.micDenied'
    mocks.composer.speechError = 'speech.micDenied'
    const tree = await renderScreen()
    expect(findByLabel(tree.root, 'common.openSettings')).toBeDefined()

    mocks.composer.sendError = null
    TestRenderer.act(() => tree.update(<AstraConversation chat={mocks.composer as never} />))
    const settingsAction = findByLabel(tree.root, 'common.openSettings')
    TestRenderer.act(() => press(settingsAction))

    expect(mocks.openSettings).toHaveBeenCalledOnce()
  })

  it('keeps other speech errors on the transient path without a settings action', async () => {
    mocks.composer.sendError = 'speech.failedToStart'
    mocks.composer.speechError = 'speech.failedToStart'
    const tree = await renderScreen()

    expect(findByLabel(tree.root, 'common.openSettings')).toBeUndefined()
  })
})
