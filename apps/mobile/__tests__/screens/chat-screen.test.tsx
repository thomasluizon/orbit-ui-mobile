import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { AstraConversation } from '@/components/chat/conversation'
import { Shell412 } from '@/components/shell/shell-412'
import { dismissTopOverlay } from '@/lib/overlay-stack'
import { __emitKeyboardEvent, __resetTestHostConfig } from '../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  sendAccessibilityEvent: vi.fn(),
  openSettings: vi.fn(),
  setAstraConversationOpen: vi.fn(),
  router: { push: vi.fn() },
  composer: {
    flatListRef: { current: null },
    messages: [] as ChatMessage[],
    isTyping: false,
    activeSteps: [] as { domain: string; access: string }[],
    canShowFollowUps: false,
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
  useTranslation: () => ({ t: (key: string, values?: { count?: number }) =>
    key === 'chat.trace.steps' ? `${values?.count} steps` : key }),
}))
vi.mock('expo-router', () => ({ useRouter: () => mocks.router }))
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    AccessibilityInfo: {
      ...actual.AccessibilityInfo,
      sendAccessibilityEvent: mocks.sendAccessibilityEvent,
      announceForAccessibility: vi.fn(),
    },
    Linking: { openSettings: (...arguments_: unknown[]) => mocks.openSettings(...arguments_) },
    Platform: { ...actual.Platform, OS: 'android' },
    FlatList: React.forwardRef<unknown, {
      data: ChatMessage[]
      renderItem: (entry: { item: ChatMessage }) => React.ReactNode
    }>((props, _ref) => React.createElement(
      'FlatList',
      props,
      props.data.map((item) => React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item }))),
    )),
  }
})
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }),
}))
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
  AppBar: (props: Record<string, unknown>) => React.createElement(
    'AppBar',
    props,
    React.createElement('Text', {
      ref: props.titleRef,
      accessibilityRole: 'header',
      testID: 'conversation-title',
    }, props.title as string),
  ),
}))
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

async function renderShellScreen() {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <Shell412
        tabBar={React.createElement('TabBar')}
        conversation={<AstraConversation chat={mocks.composer as never} />}
        conversationLabel="chat.title"
      >
        {React.createElement('DestinationList')}
      </Shell412>,
    )
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
    __resetTestHostConfig()
    mocks.composer.sendError = null
    mocks.composer.canRetryLastSend = false
    mocks.composer.messages = []
    mocks.composer.activeSteps = []
    mocks.composer.canShowFollowUps = false
    mocks.composer.showSuggestions = true
    mocks.composer.speechError = null
    mocks.composer.streamingMessageId = null
    mocks.composer.flatListRef.current = null
  })

  it.each([true, false])('keeps the composer inside Android keyboard avoidance when suggestions are %s', async (showSuggestions) => {
    mocks.composer.showSuggestions = showSuggestions
    const tree = await renderShellScreen()
    const avoidingView = findByType(tree.root, 'KeyboardAvoidingView')

    expect(avoidingView).toBeDefined()
    expect(tree.root.findAll((node) => node.type === 'KeyboardAvoidingView')).toHaveLength(1)
    expect(avoidingView?.props.behavior).toBe('height')
    expect(findByType(avoidingView!, 'Composer')).toBeDefined()
    expect(findByType(avoidingView!, 'DestinationList')).toBeDefined()
    expect(findByType(avoidingView!, 'FlatList') === undefined).toBe(showSuggestions)
  })

  it('keeps the mounted conversation at the last message and restores its scroll offset', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
    const scrollToEnd = vi.fn()
    const scrollToOffset = vi.fn()
    mocks.composer.flatListRef.current = { scrollToEnd, scrollToOffset } as never
    mocks.composer.showSuggestions = false
    const tree = await renderShellScreen()
    const feed = findByType(tree.root, 'FlatList')
    const composer = findByType(tree.root, 'Composer')

    await TestRenderer.act(async () => {
      ;(feed?.props.onScroll as (event: unknown) => void)({ nativeEvent: { contentOffset: { y: 180 } } })
      ;(composer?.props.onInputFocus as () => void)()
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
      ;(feed?.props.onLayout as () => void)()
      await Promise.resolve()
    })
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false })

    await TestRenderer.act(async () => {
      __emitKeyboardEvent('keyboardDidHide')
      ;(feed?.props.onLayout as () => void)()
      await Promise.resolve()
    })
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 180, animated: false })
    vi.unstubAllGlobals()
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

    const feed = findByType(tree.root, 'FlatList')
    expect(feed?.props.accessibilityState).toEqual({ busy: true })
    TestRenderer.act(() => {
      const contentChanged = feed?.props.onContentSizeChange as (() => void)
      contentChanged()
    })
    expect(mocks.composer.scrollToBottom).toHaveBeenCalledOnce()
  })

  it('collapses two tool steps on the finished message', async () => {
    mocks.composer.showSuggestions = false
    mocks.composer.messages = [{ id: 'answer', role: 'ai', content: 'Done', timestamp: new Date(), toolSteps: [
      { domain: 'habits', access: 'read' }, { domain: 'other', access: 'read' },
    ] }]
    const tree = await renderScreen()
    const disclosure = findByLabel(tree.root, '2 steps')
    expect(disclosure?.props['aria-expanded']).toBe(false)
    TestRenderer.act(() => press(disclosure))
    expect(findByLabel(tree.root, '2 steps')?.props['aria-expanded']).toBe(true)
    expect(tree.root.findAll((node) => node.type === 'Text' && nodeText(node).includes('chat.trace.unknown'))).toHaveLength(1)
  })

  it('shows follow-ups only after the latest AI message and sends their origin', async () => {
    mocks.composer.showSuggestions = false
    mocks.composer.canShowFollowUps = true
    mocks.composer.messages = [
      { id: 'old', role: 'ai', content: 'Old', timestamp: new Date(), followUps: ['Old one', 'Old two'] },
      { id: 'new', role: 'ai', content: 'New', timestamp: new Date(), followUps: ['Check goals', 'Review habits'] },
    ]
    const tree = await renderScreen()
    expect(tree.root.findAll((node) => node.type === 'Text' && nodeText(node).includes('Old one'))).toHaveLength(0)
    const chip = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && nodeText(node).includes('Check goals'))[0]
    TestRenderer.act(() => press(chip))
    expect(mocks.composer.sendMessage).toHaveBeenCalledWith('Check goals', 'followUp')
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

  it('moves Android accessibility focus to the conversation header on open', async () => {
    const titleNode = { testID: 'conversation-title' }
    let tree!: TestTree
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AstraConversation chat={mocks.composer as never} />,
        { createNodeMock: ({ props }: { props: { testID?: string } }) =>
          props.testID === 'conversation-title' ? titleNode : null },
      )
      await Promise.resolve()
    })
    mountedTrees.push(tree)

    expect(mocks.sendAccessibilityEvent).toHaveBeenCalledWith(titleNode, 'focus')
  })

  it('keeps the composer inside Android keyboard avoidance with safe-area padding', async () => {
    const tree = await renderShellScreen()
    const avoidingView = findByType(tree.root, 'KeyboardAvoidingView')
    const composerContainer = avoidingView?.findAll((node) => {
      const style = node.props.style
      return typeof style === 'object' && style !== null && 'paddingBottom' in style
    })[0]

    expect(findByType(avoidingView!, 'Composer')).toBeDefined()
    expect(avoidingView?.props.behavior).toBe('height')
    expect(composerContainer?.props.style).toMatchObject({ paddingBottom: 20 })
    expect(composerContainer?.props.style).not.toHaveProperty('marginBottom')
    await TestRenderer.act(async () => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
      await Promise.resolve()
    })
    expect(findByType(tree.root, 'KeyboardAvoidingView')).toBeDefined()
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
