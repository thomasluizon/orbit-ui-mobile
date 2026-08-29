import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { TodayAstra } from '@/components/today/today-astra'
import { Shell412 } from '@/components/shell/shell-412'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  composerProps: ComposerProps | null
  notifications: NotificationItem[]
  markRead: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  composerProps: null,
  notifications: [],
  markRead: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { id: 'profile' }, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: mocks.notifications }),
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
}))
vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({
    composerProps: {
      state: 'idle',
      value: '',
      onChangeValue: vi.fn(),
      onSend: vi.fn(),
      words: {
        placeholder: 'placeholder',
        send: 'send',
        suggestionsLabel: 'suggestions',
        retry: 'retry',
      },
      suggestions: [],
    },
    starterChips: ['Plan a walk', 'Plan reading', 'Plan sleep'],
    atMessageLimit: false,
  }),
}))
vi.mock('@/components/shell/composer', () => ({
  Composer: (props: ComposerProps) => {
    mocks.composerProps = props
    return React.createElement('TodayComposer')
  },
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bg: '#111111', hairline: '#222222', fg2: '#eeeeee', fg3: '#aaaaaa' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer

function ConversationComposer() {
  const open = useUIStore((state) => state.astraConversationOpen)
  const draft = useChatStore((state) => state.draft)
  return open ? React.createElement('ConversationInput', { value: draft }) : null
}

async function renderTodayAstra(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <Shell412 tabBar={React.createElement('TabBar')}>
        <TodayAstra isTodaySelected suppressed={false} />
      </Shell412>,
    )
    await Promise.resolve()
  })
  return tree
}

function hasText(tree: ReactTestRenderer, text: string): boolean {
  return tree.root.findAll((node) =>
    Array.isArray(node.props.children) && node.props.children.includes(text),
  ).length > 0
}

describe('mobile Today Astra', () => {
  beforeEach(() => {
    mocks.composerProps = null
    mocks.notifications = []
    mocks.markRead.mockReset()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
  })

  it('renders a proactive check-in and opens its conversation', async () => {
    mocks.notifications = [{
      id: 'check-in',
      title: 'Astra',
      body: 'Check in',
      url: '/chat',
      habitId: null,
      isRead: false,
      createdAtUtc: '2026-08-29T10:00:00Z',
    }]

    const tree = await renderTodayAstra()

    expect(hasText(tree, 'Check in')).toBe(true)
    const action = tree.root.findAll((node) =>
      node.props.onPress && node.props.children === 'todayAstra.openConversation',
    )[0]
    if (!action) throw new Error('Proactive conversation action did not render')
    await TestRenderer.act(async () => {
      action.props.onPress()
      await Promise.resolve()
    })
    expect(mocks.markRead).toHaveBeenCalledWith('check-in')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('hands a selected chip to the conversation with 50 habits', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <TodayAstra isTodaySelected suppressed={false} />
          {Array.from({ length: 50 }, (_, index) => React.createElement('HabitRow', { key: index }))}
          <ConversationComposer />
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(mocks.composerProps?.suggestions).toHaveLength(4)
    const selectedSuggestion = mocks.composerProps?.suggestions[0]
    if (!selectedSuggestion) throw new Error('Today suggestion was not registered')

    await TestRenderer.act(async () => {
      selectedSuggestion.onSelect()
      await Promise.resolve()
    })

    const input = tree.root.findAll((node) => String(node.type) === 'ConversationInput')[0]
    if (!input) throw new Error('Conversation composer did not open')
    expect(input.props.value).toBe('todayAstra.createSentence')
  })
})
