import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import { TodayAstra } from '@/components/today/today-astra'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  composerProps: null as ComposerProps | null,
  useStreakInfo: vi.fn(() => ({ data: { lastActiveDate: '2026-08-27' } })),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))
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
    isOnline: true,
    atMessageLimit: false,
  }),
}))
vi.mock('@/components/shell/composer', () => ({
  Composer: (props: ComposerProps) => {
    mocks.composerProps = props
    return <div data-testid="today-composer" />
  },
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))

function ConversationComposer() {
  const open = useUIStore((state) => state.astraConversationOpen)
  const draft = useChatStore((state) => state.draft)
  return open ? <input aria-label="conversation draft" readOnly value={draft} /> : null
}

describe('web Today Astra', () => {
  beforeEach(() => {
    mocks.composerProps = null
    mocks.useStreakInfo.mockClear()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
    const slot = document.createElement('div')
    slot.id = 'today-composer-slot'
    document.body.append(slot)
  })

  it('hands a selected chip to the opened conversation with one aggregate request for 50 habits', () => {
    render(
      <>
        {Array.from({ length: 50 }, (_, index) => <div key={index} data-testid="habit" />)}
        <TodayAstra today="2026-08-29" isTodaySelected suppressed={false} />
        <ConversationComposer />
      </>,
    )

    expect(mocks.useStreakInfo).toHaveBeenCalledTimes(1)
    expect(mocks.useStreakInfo).toHaveBeenCalledWith(true)
    expect(mocks.composerProps?.suggestions).toHaveLength(4)
    const selectedSuggestion = mocks.composerProps?.suggestions[0]
    if (!selectedSuggestion) throw new Error('Today suggestion was not registered')

    act(() => selectedSuggestion.onSelect())

    expect(screen.getByRole('textbox', { name: 'conversation draft' })).toHaveValue(
      'todayAstra.createSentence',
    )
  })
})
