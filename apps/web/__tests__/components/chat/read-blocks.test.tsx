import { personalText } from '@/__tests__/support/personal-text'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { completedHabitTotalFixture, completedHabitComparisonFixture, focusedDatedHabitListFixture, focusedStaleRecapFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedReadMetadataFixture } from '@orbit/shared/test-support/chat-fixtures'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getAccountDay } from '@orbit/shared/utils'
import { ChatBlock } from '@/components/chat/block-registry'
import { habitMonthFixture } from '@orbit/shared/test-support/habit-month-fixture'
import { refreshHabitMonth, refreshReadBlock } from '@/app/actions/chat'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { chatPartSchema, habitMonthCardSchema, readBlockResponseSchema, type ReadBlockResponse } from '@orbit/shared/types/chat'

const state = vi.hoisted(() => ({ habits: new Map<string, NormalizedHabit>(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('@/app/actions/chat', () => ({ refreshReadBlock: vi.fn(), refreshHabitMonth: vi.fn() }))
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
beforeEach(() => { vi.mocked(refreshReadBlock).mockReset(); vi.mocked(refreshHabitMonth).mockReset(); state.habits.clear(); state.mutate.mockReset(); state.push.mockReset() })

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
    expect(screen.getByText(personalText('Sep 1, 2026'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await screen.findByText(personalText('Sep 2, 2026'))
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
  expect(screen.getByText(personalText(`${en.chat.insight.topHabit}: Walk`))).toBeInTheDocument()
  expect(screen.getByText(personalText(`${en.chat.insight.needsAttention}: Read`))).toBeInTheDocument()
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


it.each(['en', 'pt-BR'] as const)('renders the calendar month with done, missed, skipped, future and today states in %s', locale => {
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  mount({ kind: 'habitMonth', block: card }, locale)
  for (const [date, outcome] of [['01', 'full'], ['02', 'none'], ['03', 'none'], ['04', 'not-scheduled']] as const) {
    expect(screen.getByTestId(`calendar-day-select-2026-09-${date}`).querySelector('[data-outcome]')).toHaveAttribute('data-outcome', outcome)
  }
  expect(screen.getByTestId('calendar-day-select-2026-09-11')).toHaveAttribute('aria-current', 'date')
  expect(screen.getByTestId('calendar-day-select-2026-09-12')).toHaveAccessibleName(new RegExp((locale === 'en' ? en : pt).calendar.dayCell.future, 'i'))
  expect(screen.getByTestId('month-grid-days').children.length % 7).toBe(0)
  fireEvent.click(screen.getByTestId('calendar-day-select-2026-09-03'))
  expect(state.push).toHaveBeenCalledWith('/calendar?date=2026-09-03')
  expect(screen.getByRole('button', { name: locale === 'en' ? 'Refresh' : 'Atualizar' }).textContent).toBe('')
})

it('refreshes a habit month through its dedicated action and replaces the full snapshot', async () => {
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  vi.mocked(refreshHabitMonth).mockResolvedValue({ ok: true, data: {
    kind: 'habitMonth', block: { ...card, today: '2026-09-12', calendar: { ...card.calendar, logs: {} } },
    read: { ...card.read!, revision: 'two', refreshToken: 'month-two' },
  } })
  mount({ kind: 'habitMonth', block: card })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(screen.getByTestId('calendar-day-select-2026-09-12')).toHaveAttribute('aria-current', 'date'))
  expect(screen.getByTestId('calendar-day-select-2026-09-01').querySelector('[data-outcome]')).toHaveAttribute('data-outcome', 'none')
  expect(refreshReadBlock).not.toHaveBeenCalled()
  expect(refreshHabitMonth).toHaveBeenCalledWith('signed-month', expect.objectContaining({ platform: 'web', partKinds: expect.arrayContaining(['habitMonth']) }), null)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(refreshHabitMonth).toHaveBeenLastCalledWith('month-two', expect.anything(), null))
})

it.each([['en', 'chat'], ['en', 'refresh'], ['pt-BR', 'chat'], ['pt-BR', 'refresh']] as const)('distinguishes habit counts from completions in %s through %s', async (locale, source) => {
  const labels = locale === 'en'
    ? { habits: 'Habits', unit: 'habits', completions: 'Completions', completionUnit: 'completions' }
    : { habits: 'Hábitos', unit: 'hábitos', completions: 'Conclusões', completionUnit: 'conclusões' }
  const cases = [
    { kind: 'periodTotal', block: completedHabitTotalFixture, figures: ['3'], habits: true },
    { kind: 'periodComparison', block: completedHabitComparisonFixture, figures: ['3', '1', '+2 (+200%)'], habits: true },
    { kind: 'periodTotal', block: focusedPeriodTotalFixture, figures: ['12'], habits: false },
    { kind: 'periodComparison', block: focusedPeriodComparisonFixture, figures: ['12', '0', '+12'], habits: false },
    { kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, metrics: completedHabitTotalFixture.metrics }, figures: ['12'], habits: false },
    { kind: 'periodComparison', block: { ...focusedPeriodComparisonFixture, current: completedHabitComparisonFixture.current, baseline: completedHabitComparisonFixture.baseline }, figures: ['12', '0', '+12'], habits: false },
  ]
  for (const { kind, block, figures, habits } of cases) {
    const expected = habits
      ? { title: labels.habits, unit: labels.unit, other: labels.completions }
      : { title: labels.completions, unit: labels.completionUnit, other: labels.habits }
    const parsed = source === 'chat'
      ? chatPartSchema.parse({ type: 'block', kind, block })
      : readBlockResponseSchema.parse({ kind, block, read: block.read })
    if (!parsed || !('kind' in parsed)) throw new Error(`${kind} ${source} did not parse`)
    const view = mount(parsed, locale)
    expect(screen.getByRole('heading', { name: expected.title })).toBeInTheDocument()
    expect(screen.getByText(expected.unit)).toBeInTheDocument()
    for (const figure of figures) expect(screen.getByText(figure)).toBeInTheDocument()
    expect(view.container.textContent).not.toContain(expected.other)
    view.unmount()
  }
})
