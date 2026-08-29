import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import { TodayAstra } from '@/components/today/today-astra'
import { Shell412 } from '@/components/shell/shell-412'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  composerProps: null as ComposerProps | null,
  useStreakInfo: vi.fn(() => ({ data: { lastActiveDate: '2026-08-27' } })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { id: 'profile' }, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-gamification', () => ({ useStreakInfo: mocks.useStreakInfo }))
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

describe('mobile Today Astra', () => {
  beforeEach(() => {
    mocks.composerProps = null
    mocks.useStreakInfo.mockClear()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
  })

  it('hands a selected chip to the opened conversation with one aggregate request for 50 habits', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <TodayAstra
            today="2026-08-29"
            isTodaySelected
            suppressed={false}
          />
          {Array.from({ length: 50 }, (_, index) => React.createElement('HabitRow', { key: index }))}
          <ConversationComposer />
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(mocks.useStreakInfo).toHaveBeenCalledTimes(1)
    expect(mocks.useStreakInfo).toHaveBeenCalledWith(true)
    expect(mocks.composerProps?.suggestions).toHaveLength(4)
    const selectedSuggestion = mocks.composerProps?.suggestions[0]
    if (!selectedSuggestion) throw new Error('Today suggestion was not registered')

    await TestRenderer.act(async () => {
      selectedSuggestion.onSelect()
      await Promise.resolve()
    })

    const input = tree.root.find((node) => String(node.type) === 'ConversationInput')
    expect(input.props.value).toBe('todayAstra.createSentence')
  })
})
