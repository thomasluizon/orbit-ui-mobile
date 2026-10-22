import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { focusedDatedHabitListFixture, focusedStaleRecapFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedReadMetadataFixture } from '@orbit/shared/test-support/chat-fixtures'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getAccountDay } from '@orbit/shared/utils'
import { ChatBlock } from '@/components/chat/block-registry'
import { refreshReadBlock } from '@/app/actions/chat'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { chatPartSchema, readBlockResponseSchema, type ReadBlockResponse } from '@orbit/shared/types/chat'

const state = vi.hoisted(() => ({ habits: new Map<string, NormalizedHabit>(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('@/app/actions/chat', () => ({ refreshReadBlock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: state.habits }, isPending: false }), useLogHabit: () => ({ mutate: state.mutate }), useHabitMetrics: () => ({}) }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isPending: false }) }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({ streakQuery: { isPending: false } }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false }) }))

const total = { type: 'block' as const, kind: 'periodTotal' as const, block: focusedPeriodTotalFixture }
function mount(part: Parameters<typeof ChatBlock>[0]['part'] = total, locale: 'en' | 'pt-BR' = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><ChatBlock part={part} onActionChipClick={vi.fn()} /></NextIntlClientProvider>)
}
beforeEach(() => { vi.mocked(refreshReadBlock).mockReset(); state.habits.clear(); state.mutate.mockReset(); state.push.mockReset() })

describe('focused read compositions', () => {
  it.each(['en', 'pt-BR'] as const)('renders the exact total and zero-baseline comparison in %s', locale => {
    const view = mount(total, locale)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(view.container.textContent).toContain('2026')
    expect(view.container.textContent).not.toContain('%')
    view.unmount()
    const comparison = mount({ kind: 'periodComparison', block: focusedPeriodComparisonFixture }, locale)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('+12')).toBeInTheDocument()
    expect(comparison.container.textContent).not.toContain('%')
  })

  it('refreshes only the signed query and replaces its snapshot', async () => {
    vi.mocked(refreshReadBlock).mockResolvedValue({ ok: true, data: { kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, value: 18 }, read: { ...focusedReadMetadataFixture, revision: 'two' } } })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('18')
    expect(refreshReadBlock).toHaveBeenCalledWith('signed-query', expect.objectContaining({ platform: 'web', partKinds: expect.arrayContaining(['periodTotal', 'periodComparison']) }), false, null)
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })

  it('pages history with the signed cursor and preserves dated zero-valued logs', async () => {
    vi.mocked(refreshReadBlock).mockResolvedValue({ ok: true, data: { kind: 'recordList', block: { ...focusedHistoryFixture, items: [{ id: 'log-two', title: '2026-09-02', logDate: '2026-09-02', value: -1 }], read: { ...focusedHistoryFixture.read, completeness: 'complete', nextCursor: null } }, read: { ...focusedHistoryFixture.read, completeness: 'complete', nextCursor: null } } })
    mount({ kind: 'recordList', block: focusedHistoryFixture })
    expect(screen.getByRole('button', { name: 'Sep 1, 2026' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await screen.findByRole('button', { name: 'Sep 2, 2026' })
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
    expect(refreshReadBlock).toHaveBeenCalledWith('signed-page', expect.anything(), true, null)
  })

  it.each(['READ_QUERY_STALE', 'READ_QUERY_EXPIRED', 'offline'])('retains figures and offers compact recovery for %s', async code => {
    vi.mocked(refreshReadBlock).mockResolvedValue({ ok: false, error: 'failure', code, status: 409, sessionRefreshFailed: false })
    const view = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(view.container.querySelector('section')).toHaveAttribute('data-state', code === 'READ_QUERY_STALE' ? 'stale' : 'partiallyFailed'))
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    expect(view.container.querySelectorAll('[role="status"]:not(.sr-only)')).toHaveLength(1)
  })

  it('discards a late response after the account changes', async () => {
    let resolve!: (result: { ok: true; data: ReadBlockResponse }) => void
    vi.mocked(refreshReadBlock).mockImplementation(() => new Promise(done => { resolve = done }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    act(() => advanceAccountGeneration())
    await act(async () => { resolve({ ok: true, data: { kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, value: 99 }, read: focusedReadMetadataFixture } }) })
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.queryByText('99')).not.toBeInTheDocument()
  })
})

it.each(['chat', 'refresh'] as const)('keeps a parsed %s historical schedule read-only and navigates with its original date', source => {
  state.habits.set('habit-one', createMockHabit({ id: 'habit-one', frequencyUnit: 'Day', dueDate: '2026-09-01', scheduledDates: ['2026-09-01'] }))
  const parsed = source === 'chat'
    ? chatPartSchema.parse({ type: 'block', kind: 'habitList', block: focusedDatedHabitListFixture })
    : readBlockResponseSchema.parse({ kind: 'habitList', block: focusedDatedHabitListFixture, read: focusedDatedHabitListFixture.read })
  expect(parsed).not.toBeNull()
  if (!parsed || !('kind' in parsed) || parsed.kind !== 'habitList') throw new Error('Dated habit block did not parse')
  mount(parsed)
  expect(screen.getByText('Done')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log Walk' }))
  expect(state.mutate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open Walk' }))
  expect(state.push).toHaveBeenCalledWith('/habits/habit-one?date=2026-09-01')
})

it('allows only a currently eligible occurrence while retaining the query rows', () => {
  const today = getAccountDay(new Date(), 'UTC')
  state.habits.set('habit-one', createMockHabit({ id: 'habit-one', frequencyUnit: 'Day', createdAtUtc: '2026-01-01T00:00:00Z', dueDate: today, scheduledDates: [today] }))
  mount({ kind: 'habitList', block: { scope: 'today', date: today, items: [{ id: 'habit-one', title: 'Walk', depth: 0, isBadHabit: false, status: 'today' }], read: { ...focusedReadMetadataFixture, queryFamily: 'query_habits', scope: { date: today } } } })
  fireEvent.click(screen.getByRole('button', { name: 'Log Walk' }))
  expect(state.mutate).toHaveBeenCalledWith({ habitId: 'habit-one', date: today, intent: 'log' })
})

it('keeps stale recap disclosure and Progress available without refreshing', () => {
  const view = mount({ kind: 'periodInsight', block: focusedStaleRecapFixture })
  expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'stale')
  expect(screen.getByRole('status')).toHaveTextContent(en.chat.readBlock.stale)
  expect(screen.queryByText('Walked')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  expect(screen.getByRole('link', { name: en.chat.insight.progressLink })).toHaveAttribute('href', '/progress')
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  for (const text of ['Walked', 'Mornings', 'Start small', 'Reading']) expect(screen.getByText(text)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: `${en.chat.insight.topHabit}: Walk` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: `${en.chat.insight.needsAttention}: Read` })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: en.chat.readBlock.less }))
  expect(screen.queryByText('Walked')).not.toBeInTheDocument()
  expect(refreshReadBlock).not.toHaveBeenCalled()
})

it('withholds signed paging for a stale query', () => {
  mount({ kind: 'recordList', block: { ...focusedHistoryFixture, read: { ...focusedHistoryFixture.read, completeness: 'stale' } } })
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  expect(refreshReadBlock).not.toHaveBeenCalled()
})
