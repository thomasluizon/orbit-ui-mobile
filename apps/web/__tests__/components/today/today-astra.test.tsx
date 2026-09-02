import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { TodayAstra } from '@/components/today/today-astra'
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

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

function renderTodayAstra() {
  return render(<TodayAstra isTodaySelected suppressed={false} />)
}

describe('web Today Astra', () => {
  beforeEach(() => {
    mocks.composerProps = null
    mocks.notifications = []
    mocks.markRead.mockReset()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
    document.getElementById('today-composer-slot')?.remove()
  })

  function appendComposerSlot() {
    const slot = document.createElement('div')
    slot.id = 'today-composer-slot'
    document.body.append(slot)
    return slot
  }

  it('renders the composer into its slot after the target resolves', async () => {
    const slot = appendComposerSlot()

    renderTodayAstra()

    expect(slot).toContainElement(await screen.findByTestId('today-composer'))
  })

  it('renders no composer or stray portal when the slot is absent', async () => {
    expect(() => renderTodayAstra()).not.toThrow()
    await act(async () => Promise.resolve())

    expect(screen.queryByTestId('today-composer')).not.toBeInTheDocument()
    expect(mocks.composerProps).toBeNull()
  })

  it('renders a proactive check-in and opens its conversation', () => {
    mocks.notifications = [{
      id: 'check-in',
      title: 'Astra',
      body: 'Check in',
      url: '/chat',
      habitId: null,
      isRead: false,
      createdAtUtc: '2026-08-29T10:00:00Z',
    }]

    renderTodayAstra()

    expect(screen.getByText(/Check in/)).toBeInTheDocument()
    const action = screen.getByRole('button', { name: 'todayAstra.openConversation' })
    expect(action).toHaveClass('orbit-link-action-persistent')
    fireEvent.click(action)
    expect(mocks.markRead).toHaveBeenCalledWith('check-in')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('hands a selected chip to the conversation with 50 habits', async () => {
    appendComposerSlot()

    render(
      <>
        {Array.from({ length: 50 }, (_, index) => <div key={index} data-testid="habit" />)}
        <TodayAstra isTodaySelected suppressed={false} />
        <ConversationComposer />
      </>,
    )

    await screen.findByTestId('today-composer')
    expect(mocks.composerProps?.suggestions).toHaveLength(4)
    const selectedSuggestion = mocks.composerProps?.suggestions[0]
    if (!selectedSuggestion) throw new Error('Today suggestion was not registered')

    act(() => selectedSuggestion.onSelect())

    expect(screen.getByRole('textbox', { name: 'conversation draft' })).toHaveValue(
      'todayAstra.createSentence',
    )
  })
})
