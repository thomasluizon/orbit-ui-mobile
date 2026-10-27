import { personalText } from '@/__tests__/support/personal-text'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { completedHabitTotalFixture, completedHabitComparisonFixture, focusedDatedHabitListFixture, focusedStaleRecapFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedPeriodMetricsFixture, focusedReadMetadataFixture } from '@orbit/shared/test-support/chat-fixtures'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getAccountDay } from '@orbit/shared/utils'
import { inPlaceDayFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { ChatBlock } from '@/components/chat/block-registry'
import { habitMonthFixture } from '@orbit/shared/test-support/habit-month-fixture'
import { refreshHabitMonth, refreshReadBlock } from '@/app/actions/chat'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { chatPartSchema, habitMonthCardSchema, readBlockResponseSchema, type ReadBlockResponse } from '@orbit/shared/types/chat'

const state = vi.hoisted(() => ({ isError: false, habits: new Map<string, NormalizedHabit>(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('@/app/actions/chat', () => ({ refreshReadBlock: vi.fn(), refreshHabitMonth: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: state.isError ? undefined : { habitsById: state.habits }, isError: state.isError, isPending: false }), useLogHabit: () => ({ mutate: state.mutate, mutateAsync: state.mutate }), useHabitMetrics: () => ({}) }))
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
beforeEach(() => { state.isError = false; vi.mocked(refreshReadBlock).mockReset(); vi.mocked(refreshHabitMonth).mockReset(); state.habits.clear(); state.mutate.mockReset(); state.push.mockReset() })

describe('focused read compositions', () => {
  it.each(['en', 'pt-BR'] as const)('renders compact totals and scaled comparison bars in %s', locale => {
    const view = mount(total, locale)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
    expect(view.container.querySelector('[data-compact-figure]')).toHaveTextContent(locale === 'en' ? '12completions' : '12conclusões')
    expect(screen.getByRole('heading')).toContainElement(view.container.querySelector('[data-compact-figure]'))
    expect(screen.queryByText((locale === 'en' ? en : pt).chat.readBlock.metric.positiveLogRecords)).not.toBeInTheDocument()
    view.unmount()
    const comparison = mount({ kind: 'periodComparison', block: focusedPeriodComparisonFixture }, locale)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(comparison.container.querySelector('[data-comparison-bar="current"]')).toHaveStyle({ width: '100%' })
    expect(comparison.container.querySelector('[data-comparison-bar="baseline"]')).toHaveStyle({ width: '0%' })
    expect(comparison.container.textContent).not.toContain('%')
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

  it.each(['READ_QUERY_STALE', 'READ_QUERY_EXPIRED', 'offline'])('retains history and reports a failed page for %s', async code => {
    vi.mocked(refreshReadBlock).mockResolvedValue({ ok: false, error: 'failure', code, status: 409, sessionRefreshFailed: false })
    const view = mount({ kind: 'recordList', block: focusedHistoryFixture })
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(view.container.querySelector('section')).toHaveAttribute('data-state', code === 'READ_QUERY_STALE' ? 'stale' : 'partiallyFailed'))
    expect(screen.getByText(personalText('Sep 1, 2026'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
  })

  it('discards a late page after the account changes', async () => {
    let resolve!: (result: { ok: true; data: ReadBlockResponse }) => void
    vi.mocked(refreshReadBlock).mockImplementation(() => new Promise(done => { resolve = done }))
    mount({ kind: 'recordList', block: focusedHistoryFixture })
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    act(() => advanceAccountGeneration())
    await act(async () => { resolve({ ok: true, data: { kind: 'recordList', block: { ...focusedHistoryFixture, items: [{ id: 'late', title: 'Other account' }] }, read: focusedHistoryFixture.read } }) })
    expect(screen.queryByText('Other account')).not.toBeInTheDocument()
  })
})

it('shows a saved metric window only once through the owning read composition', () => {
  mount({ kind: 'metrics', block: { surfaceId: 'progress', period: 'month', hasData: true, completionRate: 80, totalCompletions: 12, totalScheduled: 10, activeDays: 9, currentStreak: 2, bestStreak: 4, periodMetrics: focusedPeriodMetricsFixture, read: focusedReadMetadataFixture } })
  expect(screen.getAllByText('Sep 1, 2026 - Sep 30, 2026')).toHaveLength(1)
})

it.each(['chat', 'refresh'] as const)('keeps a parsed %s historical schedule read-only and navigates with its original date', source => {
  state.habits.set('habit-one', createMockHabit({ id: 'habit-one', frequencyUnit: 'Day', dueDate: '2026-09-01', scheduledDates: ['2026-09-01'] }))
  const parsed = source === 'chat'
    ? chatPartSchema.parse({ type: 'block', kind: 'habitList', block: focusedDatedHabitListFixture })
    : readBlockResponseSchema.parse({ kind: 'habitList', block: focusedDatedHabitListFixture, read: focusedDatedHabitListFixture.read })
  expect(parsed).not.toBeNull()
  if (!parsed || !('kind' in parsed) || parsed.kind !== 'habitList') throw new Error('Dated habit block did not parse')
  mount(parsed)
  expect(screen.queryByText('Done')).not.toBeInTheDocument()
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
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: en.chat.insight.progressLink })).not.toBeInTheDocument()
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
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
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
  expect(screen.queryByRole('button', { name: locale === 'en' ? 'Refresh' : 'Atualizar' })).not.toBeInTheDocument()
})

it('replaces the month snapshot when a new reply revision arrives without a refresh action', () => {
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  const view = mount({ kind: 'habitMonth', block: card })
  const next = { ...card, today: '2026-09-12', calendar: { ...card.calendar, logs: {} }, read: { ...card.read!, revision: 'two', refreshToken: 'month-two' } }
  view.rerender(<NextIntlClientProvider locale="en" messages={en}><ChatBlock part={{ kind: 'habitMonth', block: next }} onActionChipClick={vi.fn()} /></NextIntlClientProvider>)
  expect(screen.getByTestId('calendar-day-select-2026-09-12')).toHaveAttribute('aria-current', 'date')
  expect(screen.getByTestId('calendar-day-select-2026-09-01').querySelector('[data-outcome]')).toHaveAttribute('data-outcome', 'none')
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
  expect(refreshReadBlock).not.toHaveBeenCalled()
  expect(refreshHabitMonth).not.toHaveBeenCalled()
})

it.each((['habitList', 'daySummary'] as const).flatMap(kind => [true, false].flatMap(isError => ([
  ['done', false, 'done'], ['done', true, 'bad'], ['overdue', false, 'overdue'],
  ['overdue', true, 'overdue'], ['today', false, 'empty'], ['today', true, 'empty'],
] as const).map(([status, isBadHabit, expected]) => ({ kind, isError, status, isBadHabit, expected })))))(
  'keeps $kind snapshot $status with bad=$isBadHabit read-only and query error=$isError', ({ kind, isError, status, isBadHabit, expected }) => {
    state.isError = isError
    const items = focusedDatedHabitListFixture.items.map(item => ({ ...item, status, isBadHabit }))
    const part = kind === 'habitList'
      ? { kind, block: { ...focusedDatedHabitListFixture, items } }
      : { kind, block: { ...inPlaceDayFixture, rows: items, totalRows: 1 } }
    const view = mount(part)
    const row = view.container.querySelector('[data-habit-block-row]')!
    const check = row.querySelector('[data-habit-check]')!
    expect(check).toHaveAttribute('data-status', expected)
    expect(check.closest('button')).toBeNull()
    expect(row.querySelector('[data-habit-block-meta]')).toBeNull()
    expect(state.mutate).not.toHaveBeenCalled()
    view.unmount()
})

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['chat', 'refresh'] as const).flatMap(source => (['periodTotal', 'periodComparison'] as const).map(kind => ({ locale, source, kind })))))(
  'distinguishes habit counts from completions in $locale through $source for $kind', async ({ locale, source, kind: blockKind }) => {
    const labels = locale === 'en'
      ? { habits: 'Habits completed', unit: 'habits', completions: 'Completions', completionUnit: 'completions' }
      : { habits: 'Hábitos concluídos', unit: 'hábitos', completions: 'Conclusões', completionUnit: 'conclusões' }
    const cases = [
      { kind: 'periodTotal', block: completedHabitTotalFixture, figures: ['3'], habits: true },
      { kind: 'periodComparison', block: completedHabitComparisonFixture, figures: ['3', '1'], habits: true },
      { kind: 'periodTotal', block: focusedPeriodTotalFixture, figures: ['12'], habits: false },
      { kind: 'periodComparison', block: focusedPeriodComparisonFixture, figures: ['12', '0'], habits: false },
      { kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, metrics: completedHabitTotalFixture.metrics }, figures: ['12'], habits: false },
      { kind: 'periodComparison', block: { ...focusedPeriodComparisonFixture, current: completedHabitComparisonFixture.current, baseline: completedHabitComparisonFixture.baseline }, figures: ['12', '0'], habits: false },
    ]
    for (const { kind, block, figures, habits } of cases.filter(candidate => candidate.kind === blockKind)) {
      const expected = habits
        ? { title: labels.habits, unit: labels.unit }
        : { title: labels.completions, unit: labels.completionUnit }
      const parsed = source === 'chat'
        ? chatPartSchema.parse({ type: 'block', kind, block })
        : readBlockResponseSchema.parse({ kind, block, read: block.read })
      if (!parsed || !('kind' in parsed)) throw new Error(`${kind} ${source} did not parse`)
      const view = mount(parsed, locale)
      expect(screen.getByRole('heading')).toHaveTextContent(new RegExp(expected.title, 'i'))
      const compactFigures = [...view.container.querySelectorAll('[data-compact-figure]')]
      expect(compactFigures.map(figure => figure.firstElementChild?.textContent)).toEqual(figures)
      expect(compactFigures[0]).toHaveTextContent(expected.unit)
      expect(view.container.textContent).not.toMatch(habits ? /completions?|conclus(?:ão|ões)/i : /habits?|hábitos?/i)
      expect(view.container.textContent).not.toContain('chat.figure.comparison.')
      view.unmount()
    }
})

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['chat', 'refresh'] as const).flatMap(source =>
  (['periodTotal', 'periodComparison'] as const).flatMap(kind =>
    (['distinctLoggedDates', 'metScheduledDates', 'scheduledDates'] as const).map(metric => ({ locale, source, kind, metric }))))))(
  'names $metric in $kind through $source in $locale', async ({ locale, source, kind, metric }) => {
    const block = { ...(kind === 'periodTotal' ? focusedPeriodTotalFixture : focusedPeriodComparisonFixture), metric, unit: 'days' }
    const parsed = source === 'chat'
      ? chatPartSchema.parse({ type: 'block', kind, block })
      : readBlockResponseSchema.parse({ kind, block, read: block.read })
    if (!parsed || !('kind' in parsed)) throw new Error(`${kind} ${source} did not parse`)
    const messages = locale === 'en' ? en : pt
    const view = mount(parsed, locale)
    if (kind === 'periodTotal') expect(screen.getByRole('heading')).toHaveTextContent(new RegExp(messages.chat.readBlock.metric[metric], 'i'))
    else expect(screen.getByText(messages.chat.readBlock.metric[metric])).toBeVisible()
    expect(view.container.querySelectorAll('[data-compact-figure]')).toHaveLength(kind === 'periodTotal' ? 1 : 2)
    for (const figure of view.container.querySelectorAll('[data-compact-figure]')) expect(figure).toHaveTextContent(locale === 'en' ? 'days' : 'dias')
    view.unmount()
})
