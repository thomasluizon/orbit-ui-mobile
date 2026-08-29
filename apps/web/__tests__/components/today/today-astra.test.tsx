import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import { TodayAstra } from '@/components/today/today-astra'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  composerProps: ComposerProps | null
  calendarMonth: CalendarMonthResponse
  useCalendarDateRange: ReturnType<typeof vi.fn>
  useStreakInfo: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  composerProps: null,
  calendarMonth: { habits: [], logs: {} },
  useCalendarDateRange: vi.fn(),
  useStreakInfo: vi.fn(() => ({ data: { lastActiveDate: '2026-08-27' } })),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { days?: number }) =>
    values?.days === undefined ? key : `${key}:${values.days}`,
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
vi.mock('@/hooks/use-calendar-data', () => ({ useCalendarDateRange: mocks.useCalendarDateRange }))
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

function calendarWithLogs(
  logs: CalendarMonthResponse['logs'],
): CalendarMonthResponse {
  return { habits: [], logs }
}

function renderTodayAstra() {
  return render(<TodayAstra today="2026-08-29" isTodaySelected suppressed={false} />)
}

describe('web Today Astra', () => {
  beforeEach(() => {
    mocks.composerProps = null
    mocks.calendarMonth = calendarWithLogs({
      habit: [
        { id: 'completion', date: '2026-08-25', value: 1, createdAtUtc: '2026-08-25T10:00:00Z' },
      ],
    })
    mocks.useCalendarDateRange.mockReset()
    mocks.useCalendarDateRange.mockImplementation(() => ({ calendarMonth: mocks.calendarMonth }))
    mocks.useStreakInfo.mockClear()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
    const slot = document.createElement('div')
    slot.id = 'today-composer-slot'
    document.body.append(slot)
  })

  it('keeps the completion interval after at least three missed days', () => {
    const { container } = renderTodayAstra()

    expect(container.textContent).toContain('todayAstra.returning:4')
  })

  it('does not let a newer streak freeze move the completion date', () => {
    mocks.calendarMonth = calendarWithLogs({
      habit: [
        { id: 'completion', date: '2026-08-23', value: 1, createdAtUtc: '2026-08-23T10:00:00Z' },
      ],
    })
    mocks.useStreakInfo.mockReturnValue({ data: { lastActiveDate: '2026-08-28' } })

    const { container } = renderTodayAstra()

    expect(container.textContent).toContain('todayAstra.returning:6')
    expect(mocks.useStreakInfo).not.toHaveBeenCalled()
  })

  it('shows bounded copy when the window has no positive completion', () => {
    mocks.calendarMonth = calendarWithLogs({
      habit: [
        { id: 'skip', date: '2026-08-28', value: 0, createdAtUtc: '2026-08-28T10:00:00Z' },
      ],
    })

    const { container } = renderTodayAstra()

    expect(container.textContent).toContain('todayAstra.returningOverWindow')
  })

  it('hands a selected chip to the conversation with one logs request for 50 habits', () => {
    render(
      <>
        {Array.from({ length: 50 }, (_, index) => <div key={index} data-testid="habit" />)}
        <TodayAstra today="2026-08-29" isTodaySelected suppressed={false} />
        <ConversationComposer />
      </>,
    )

    expect(mocks.useCalendarDateRange).toHaveBeenCalledTimes(1)
    expect(mocks.useCalendarDateRange).toHaveBeenCalledWith('2026-07-30', '2026-08-29', true)
    expect(mocks.composerProps?.suggestions).toHaveLength(4)
    const selectedSuggestion = mocks.composerProps?.suggestions[0]
    if (!selectedSuggestion) throw new Error('Today suggestion was not registered')

    act(() => selectedSuggestion.onSelect())

    expect(screen.getByRole('textbox', { name: 'conversation draft' })).toHaveValue(
      'todayAstra.createSentence',
    )
  })
})
