import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { AstraConversation } from '@/components/chat/conversation'
import { dismissTopOverlay } from '@/lib/overlay-stack'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  useTourTarget: vi.fn(),
  setAstraConversationOpen: vi.fn(),
  router: { push: vi.fn() },
  composer: {
    flatListRef: { current: null },
    messages: [] as ChatMessage[],
    isTyping: false,
    streamingMessageId: null as string | null,
    sendError: null as string | null,
    canRetryLastSend: false,
    retryLastSend: vi.fn(),
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
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setAstraConversationOpen: typeof mocks.setAstraConversationOpen }) => unknown) =>
    selector({ setAstraConversationOpen: mocks.setAstraConversationOpen }),
}))
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
  ChatEmptyState: React.forwardRef((props) => React.createElement('ChatEmptyState', props)),
}))
vi.mock('@/components/message-bubble', () => ({
  MessageBubble: (props: Record<string, unknown>) => React.createElement('MessageBubble', props),
}))
vi.mock('@/components/chat/typing-indicator', () => ({ TypingIndicator: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: (props: Record<string, unknown>) => React.createElement('GoalDetailDrawer', props),
}))
vi.mock('@/components/habits/habit-detail-drawer', () => ({ HabitDetailDrawer: () => null }))
vi.mock('@/components/ui/app-bar', () => ({
  AppBar: (props: Record<string, unknown>) => React.createElement('AppBar', props),
}))
vi.mock('@/components/ui/astra-avatar', () => ({ AstraMark: () => null }))
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
  KeyboardAwareFlatList: (props: {
    data: ChatMessage[]
    renderItem: (entry: { item: ChatMessage }) => React.ReactNode
  }) => React.createElement(
    'KeyboardAwareFlatList',
    props,
    props.data.map((item) => React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item }))),
  ),
}))
vi.mock('@/components/chat/conversation.styles', () => ({
  createStyles: () => new Proxy({}, { get: () => ({}) }),
}))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

type TestTree = {
  root: TestNode
  update: (element: React.ReactElement) => void
  unmount: () => void
}

const mountedTrees: TestTree[] = []

async function renderScreen() {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<AstraConversation chat={mocks.composer as never} />)
    await Promise.resolve()
  })
  mountedTrees.push(tree)
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

function findByType(root: TestNode, type: string): TestNode | undefined {
  return root.findAll((node) => node.type === type)[0]
}

function nodeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join(' ')
  if (typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

describe('ChatScreen composer recoveries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.composer.sendError = null
    mocks.composer.canRetryLastSend = false
    mocks.composer.messages = []
    mocks.composer.showSuggestions = true
    mocks.composer.speechError = null
    mocks.composer.streamingMessageId = null
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

  it('sends the selected empty-state suggestion', async () => {
    const tree = await renderScreen()
    const emptyState = findByType(tree.root, 'ChatEmptyState')

    TestRenderer.act(() => {
      const selectSuggestion = emptyState?.props.onSelectSuggestion as ((value: string) => void)
      selectSuggestion('Plan my morning')
    })

    expect(mocks.composer.sendMessage).toHaveBeenCalledWith('Plan my morning')
  })

  it('renders the feed and routes goal and habit actions', async () => {
    mocks.composer.showSuggestions = false
    mocks.composer.streamingMessageId = 'message-1'
    mocks.composer.messages = [{
      id: 'message-1',
      role: 'ai',
      content: 'Choose an action',
      timestamp: new Date('2026-09-02T08:00:00Z'),
    }]
    const tree = await renderScreen()
    const bubble = findByType(tree.root, 'MessageBubble')

    expect(bubble?.props.animateEntry).toBe(false)
    expect(bubble?.props.isStreaming).toBe(true)
    TestRenderer.act(() => {
      const selectAction = bubble?.props.onActionChipClick as ((id: string, type: string) => void)
      selectAction('goal-1', 'CreateGoal')
    })

    const goalDrawer = findByType(tree.root, 'GoalDetailDrawer')
    expect(goalDrawer?.props).toMatchObject({ goalId: 'goal-1', open: true })
    TestRenderer.act(() => {
      const closeDrawer = goalDrawer?.props.onClose as (() => void)
      closeDrawer()
    })
    expect(findByType(tree.root, 'GoalDetailDrawer')?.props.open).toBe(false)

    TestRenderer.act(() => {
      const selectAction = bubble?.props.onActionChipClick as ((id: string, type: string) => void)
      selectAction('habit-1', 'LogHabit')
    })
    expect(mocks.router.push).toHaveBeenCalledWith({
      pathname: '/habits/[id]',
      params: { id: 'habit-1' },
    })

    const feed = findByType(tree.root, 'KeyboardAwareFlatList')
    expect(feed?.props.accessibilityState).toEqual({ busy: false })
    TestRenderer.act(() => {
      const contentChanged = feed?.props.onContentSizeChange as (() => void)
      contentChanged()
    })
    expect(mocks.composer.scrollToBottom).toHaveBeenCalledOnce()
  })

  it('retries a failed send inline', async () => {
    mocks.composer.sendError = 'chat.sendError'
    mocks.composer.canRetryLastSend = true
    const tree = await renderScreen()
    const retry = tree.root.findAll((node) =>
      typeof node.props.onPress === 'function' && nodeText(node).includes('shell.composer.retry'),
    )[0]

    TestRenderer.act(() => press(retry))

    expect(mocks.composer.retryLastSend).toHaveBeenCalledOnce()
  })

  it('closes from the conversation header', async () => {
    const tree = await renderScreen()
    const appBar = findByType(tree.root, 'AppBar')

    TestRenderer.act(() => {
      const close = appBar?.props.onBack as (() => void)
      close()
    })

    expect(mocks.setAstraConversationOpen).toHaveBeenCalledWith(false)
  })

  afterEach(async () => {
    await TestRenderer.act(async () => {
      while (mountedTrees.length > 0) mountedTrees.pop()?.unmount()
      await Promise.resolve()
    })
  })

  it('consumes hardware Back and unregisters when the conversation closes', async () => {
    const tree = await renderScreen()

    expect(dismissTopOverlay('system-back')).toBe(true)
    expect(mocks.setAstraConversationOpen).toHaveBeenCalledWith(false)

    await TestRenderer.act(async () => {
      tree.unmount()
      mountedTrees.splice(mountedTrees.indexOf(tree), 1)
      await Promise.resolve()
    })
    expect(dismissTopOverlay('system-back')).toBe(false)
  })
})
