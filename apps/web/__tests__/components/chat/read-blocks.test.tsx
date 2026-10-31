import { astraOfferFixture, offeredReadFixture, offerConversationId } from '@orbit/shared/test-support/astra-offer-fixtures'
import { useChatStore } from '@/stores/chat-store'
import { dismissChatOffers } from '@/app/actions/chat'
import { chatNavigationCases } from '@orbit/shared/test-support/chat-navigation-fixtures'
import { personalText } from '@/__tests__/support/personal-text'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { completedHabitTotalFixture, completedHabitComparisonFixture, focusedDatedHabitListFixture, skippedDatedHabitListFixture, focusedStaleRecapFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedPeriodMetricsFixture, focusedReadMetadataFixture } from '@orbit/shared/test-support/chat-fixtures'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { gamificationCardCases, gamificationCardFixture } from '@orbit/shared/test-support/gamification-card-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getAccountDay } from '@orbit/shared/utils'
import { inPlaceDayFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { ChatBlock } from '@/components/chat/block-registry'
import { habitMonthFixture } from '@orbit/shared/test-support/habit-month-fixture'
import { refreshGamification, refreshHabitMonth, refreshReadBlock } from '@/app/actions/chat'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { chatPartSchema, habitMonthCardSchema, habitMonthReadBlockResponseSchema, readBlockResponseSchema, type ReadBlockResponse } from '@orbit/shared/types/chat'

const state = vi.hoisted(() => ({ isError: false, aiMessagesPeriod: 'day' as 'day' | 'week', habits: new Map<string, NormalizedHabit>(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('@/app/actions/chat', () => ({ dismissChatOffers: vi.fn(), refreshReadBlock: vi.fn(), refreshHabitMonth: vi.fn(), refreshGamification: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: state.isError ? undefined : { habitsById: state.habits }, isError: state.isError, isPending: false }), useLogHabit: () => ({ mutate: state.mutate, mutateAsync: state.mutate }), useHabitMetrics: () => ({}) }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isPending: false }) }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, timeZone: 'UTC', aiMessagesPeriod: state.aiMessagesPeriod } }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({ streakQuery: { isPending: false } }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false }) }))

const total = { type: 'block' as const, kind: 'periodTotal' as const, block: focusedPeriodTotalFixture }
function mount(part: Parameters<typeof ChatBlock>[0]['part'] = total, locale: 'en' | 'pt-BR' = 'en', onSendMessage?: Parameters<typeof ChatBlock>[0]['onSendMessage'], interaction?: Parameters<typeof ChatBlock>[0]['interaction']) {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><ChatBlock part={part} onSendMessage={onSendMessage} interaction={interaction} onActionChipClick={vi.fn()} /></NextIntlClientProvider>)
}
beforeEach(() => { state.isError = false; vi.mocked(refreshReadBlock).mockReset(); vi.mocked(refreshGamification).mockReset(); vi.mocked(refreshHabitMonth).mockReset(); state.habits.clear(); state.mutate.mockReset(); state.push.mockReset() })

describe('gamification reads', () => {
  it.each(gamificationCardCases.flatMap(testCase => (['en', 'pt-BR'] as const).map(locale => ({ ...testCase, locale }))))(
    'renders only requested sections for $name in $locale', ({ block, locale }) => {
      const messages = locale === 'en' ? en : pt
      mount({ kind: 'gamification', block }, locale)
      expect(screen.queryByTestId('progress-xp-summary') !== null).toBe(block.state.profile !== null)
      expect(screen.queryByRole('img', { name: /First Orbit|Primeira órbita/ }) !== null).toBe(Boolean(block.state.achievements?.achievements.length))
      if (block.state.achievements?.achievements.length === 0) expect(screen.getByText(messages.progressScreen.achievements.empty)).toBeVisible()
      expect(screen.queryByText(messages.chat.streakCard.current)).not.toBeInTheDocument()
      expect(screen.queryByText(messages.progressScreen.streak.longest) !== null).toBe(block.state.streak !== null)
      if (block.state.streak) {
        expect(screen.getByRole('heading', { name: messages.progressScreen.sections.streak })).toBeVisible()
        expect(screen.getByTestId('progress-streak-figure')).toHaveTextContent('5')
        expect(screen.getByText(messages.progressScreen.streak.longest).parentElement).toHaveTextContent('9')
        if (!block.state.achievements) expect(screen.queryByRole('heading', { name: messages.progressScreen.sections.achievements })).not.toBeInTheDocument()
      }
      expect(screen.getByRole('button', { name: messages.blockFrame.refresh })).toBeEnabled()
    })

  it.each(gamificationCardCases)('refreshes $name using its signed query and dedicated route', async ({ block }) => {
    const next = { ...block, state: { ...block.state, streak: block.state.streak ? { ...block.state.streak, currentStreak: 6 } : null }, read: { ...block.read, revision: 'two' } }
    vi.mocked(refreshGamification).mockResolvedValue({ ok: true, data: { kind: 'gamification', block: next, read: next.read } })
    mount({ kind: 'gamification', block })
    fireEvent.click(screen.getByRole('button', { name: en.blockFrame.refresh }))
    await waitFor(() => expect(screen.getByRole('button', { name: en.blockFrame.refresh })).toBeEnabled())
    expect(refreshGamification).toHaveBeenCalledExactlyOnceWith('signed-query', expect.objectContaining({ partKinds: expect.arrayContaining(['gamification']) }), null)
    expect(refreshReadBlock).not.toHaveBeenCalled()
    if (block.state.streak) {
      const currentFrame = screen.getByRole('button', { name: en.blockFrame.refresh }).closest('section')!
      expect(within(currentFrame).getByTestId('progress-streak-figure')).toHaveTextContent('6')
      await waitFor(() => expect(screen.getAllByTestId('progress-streak-figure')).toHaveLength(1))
    }
  })

  it('keeps a failed stale refresh actionable and replaces the snapshot on retry', async () => {
    const stale = { ...gamificationCardFixture, read: { ...gamificationCardFixture.read, completeness: 'stale' as const } }
    const next = { ...gamificationCardFixture, state: { ...gamificationCardFixture.state, profile: { ...gamificationCardFixture.state.profile, totalXp: 600 } }, read: { ...gamificationCardFixture.read, revision: 'two' } }
    vi.mocked(refreshGamification).mockResolvedValueOnce({ ok: false, error: 'offline', code: 'offline', status: 0, sessionRefreshFailed: false })
      .mockResolvedValueOnce({ ok: true, data: { kind: 'gamification', block: next, read: next.read } })
    mount({ kind: 'gamification', block: stale })
    fireEvent.click(screen.getByRole('button', { name: en.blockFrame.refresh }))
    await screen.findByText(en.chat.readBlock.error)
    expect(screen.getByTestId('progress-xp-summary')).toHaveTextContent('500')
    fireEvent.click(screen.getByRole('button', { name: en.blockFrame.refresh }))
    await waitFor(() => expect(screen.getByTestId('progress-xp-summary')).toHaveTextContent('600'))
    expect(screen.queryByText(en.chat.readBlock.error)).not.toBeInTheDocument()
  })

  it('keeps the full catalogue with earned, unearned and supplied progress states', () => {
    const achievements = Object.keys(en.gamification.achievements).slice(0, 8).map((id, index) => ({
      ...gamificationCardFixture.state.achievements.achievements[0]!, id,
      isEarned: index === 0, progressCurrent: index === 1 ? 2 : null, progressTarget: index === 1 ? 7 : null,
    }))
    mount({ kind: 'gamification', block: { ...gamificationCardFixture, state: { profile: null, achievements: { achievements }, streak: null } } })
    expect(screen.getAllByRole('img')).toHaveLength(8)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
  })

  it('guards duplicate refreshes and discards a response after an account change', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof refreshGamification>>) => void
    vi.mocked(refreshGamification).mockImplementation(() => new Promise(done => { resolve = done }))
    mount({ kind: 'gamification', block: gamificationCardFixture })
    const button = screen.getByRole('button', { name: en.blockFrame.refresh })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(refreshGamification).toHaveBeenCalledTimes(1)
    act(() => advanceAccountGeneration())
    const next = { ...gamificationCardFixture, state: { ...gamificationCardFixture.state, profile: { ...gamificationCardFixture.state.profile, totalXp: 999 } } }
    await act(async () => { resolve({ ok: true, data: { kind: 'gamification', block: next, read: next.read } }); await Promise.resolve() })
    expect(screen.getByTestId('progress-xp-summary')).not.toHaveTextContent('999')
  })
})

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
    expect(screen.queryByRole('button', { name: 'Refresh' }) !== null).toBe(code === 'READ_QUERY_STALE')
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

  it('keeps refresh recovery after paging detects staleness and refresh fails', async () => {
    const next = readBlockResponseSchema.parse({ kind: 'recordList', block: {
      ...focusedHistoryFixture, items: [{ id: 'replacement', title: '2026-09-02', logDate: '2026-09-02', value: -1 }],
    }, read: { ...focusedHistoryFixture.read, revision: 'recovered' } })
    vi.mocked(refreshReadBlock)
      .mockResolvedValueOnce({ ok: false, error: 'stale', code: 'READ_QUERY_STALE', status: 409, sessionRefreshFailed: false })
      .mockResolvedValueOnce({ ok: false, error: 'offline', code: 'offline', status: 0, sessionRefreshFailed: false })
      .mockResolvedValueOnce({ ok: true, data: next })
    const view = mount({ kind: 'recordList', block: focusedHistoryFixture })
    fireEvent.click(screen.getByRole('button', { name: en.chat.recordList.more }))
    await screen.findByText(en.chat.readBlock.stale)
    expect(screen.queryByRole('button', { name: en.chat.recordList.more })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.blockFrame.refresh }))
    await screen.findByText(en.chat.readBlock.error)
    expect(screen.getByRole('button', { name: en.blockFrame.refresh })).toBeEnabled()
    expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'stale')
    expect(screen.queryByRole('button', { name: en.chat.recordList.more })).not.toBeInTheDocument()
    expect(screen.getByText(personalText('Sep 1, 2026'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.blockFrame.refresh }))
    await screen.findByText(personalText('Sep 2, 2026'))
    await waitFor(() => expect(screen.queryByText(personalText('Sep 1, 2026'))).not.toBeInTheDocument())
    expect(screen.queryByText(en.chat.readBlock.error)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.blockFrame.refresh })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.chat.recordList.more })).toBeEnabled()
    expect(refreshReadBlock).toHaveBeenNthCalledWith(1, 'signed-page', expect.anything(), true, null)
    expect(refreshReadBlock).toHaveBeenNthCalledWith(2, 'signed-query', expect.anything(), false, null)
    expect(refreshReadBlock).toHaveBeenNthCalledWith(3, 'signed-query', expect.anything(), false, null)
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

it('keeps stale recap disclosure and refresh recovery available', () => {
  const view = mount({ kind: 'periodInsight', block: focusedStaleRecapFixture })
  expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'stale')
  expect(screen.getByRole('status')).toHaveTextContent(en.chat.readBlock.stale)
  expect(screen.queryByText('Walked')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
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

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['habitList', 'daySummary'] as const).flatMap(kind =>
  (['live', 'missing', 'failed'] as const).flatMap(queryState => ([
    ['done', false, 'done'], ['done', true, 'bad'], ['overdue', false, 'overdue'],
    ['overdue', true, 'overdue'], ['today', false, 'empty'], ['today', true, 'empty'],
  ] as const).map(([status, isBadHabit, expected]) => ({ locale, kind, queryState, status, isBadHabit, expected }))))))(
  'names $kind $status with bad=$isBadHabit through $queryState occurrences in $locale', ({ locale, kind, queryState, status, isBadHabit, expected }) => {
    state.isError = queryState === 'failed'
    const messages = locale === 'en' ? en : pt
    const statusLabel = status === 'done' ? isBadHabit ? messages.habits.statusDot.bad : messages.chat.habitList.logged
      : status === 'overdue' ? messages.chat.habitList.overdue : messages.chat.habitList.pending
    if (queryState === 'live') state.habits.set('habit-one', createMockHabit({
      id: 'habit-one', frequencyUnit: 'Day', dueDate: focusedDatedHabitListFixture.date,
      scheduledDates: [focusedDatedHabitListFixture.date], isBadHabit, isLoggedInRange: status === 'done',
    }))
    const items = focusedDatedHabitListFixture.items.map(item => ({ ...item, status, isBadHabit }))
    const part = kind === 'habitList'
      ? { kind, block: { ...focusedDatedHabitListFixture, items } }
      : { kind, block: { ...inPlaceDayFixture, date: focusedDatedHabitListFixture.date, rows: items, totalRows: 1, read: focusedDatedHabitListFixture.read } }
    const view = mount(part, locale)
    const row = view.container.querySelector('[data-habit-block-row]')!
    const check = within(row as HTMLElement).getByRole('img', { name: statusLabel })
    expect(check).toHaveAttribute('data-status', expected)
    const action = queryState === 'live' && kind === 'habitList'
      ? within(row as HTMLElement).getByRole('button', { name: (status === 'done' ? messages.chat.habitList.unlog : messages.chat.habitList.log).replace('{name}', 'Walk') })
      : null
    if (action) expect(action).toBeDisabled()
    expect(check.closest('button')).toBe(action)
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


const staleReadCases = [
  ...chatNavigationCases.filter((testCase, index, cases) => cases.findIndex(other => other.part.kind === testCase.part.kind) === index).map(testCase => testCase.part),
  { kind: 'periodTotal', block: focusedPeriodTotalFixture },
  { kind: 'periodComparison', block: focusedPeriodComparisonFixture },
  { kind: 'habitMonth', block: habitMonthCardSchema.parse(habitMonthFixture) },
] as const

it.each(staleReadCases)('refreshes a stale $kind through its owning composition', async part => {
  const initialRead = 'read' in part.block && part.block.read ? part.block.read : focusedReadMetadataFixture
  const staleRead = { ...initialRead, completeness: 'stale' as const }
  const read = { ...initialRead, completeness: 'complete' as const, recovery: null, revision: 'refreshed' }
  const next = { ...part, block: { ...part.block, read }, read }
  const refresh = part.kind === 'habitMonth' ? refreshHabitMonth : refreshReadBlock
  if (part.kind === 'habitMonth') vi.mocked(refreshHabitMonth).mockResolvedValue({ ok: true, data: habitMonthReadBlockResponseSchema.parse(next) })
  else vi.mocked(refreshReadBlock).mockResolvedValue({ ok: true, data: readBlockResponseSchema.parse(next) })
  const view = mount({ ...part, block: { ...part.block, read: staleRead } } as Parameters<typeof mount>[0])
  expect(screen.getByText(en.chat.readBlock.stale)).toHaveAttribute('role', 'status')
  fireEvent.click(screen.getByRole('button', { name: en.blockFrame.refresh }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(refresh).toHaveBeenCalledWith(initialRead.refreshToken, expect.anything(), ...(part.kind === 'habitMonth' ? [null] : [false, null]))
  await waitFor(() => expect(view.container.querySelector('section[data-state="stale"]')).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: en.blockFrame.refresh })).not.toBeInTheDocument()
})

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['chat', 'refresh'] as const).flatMap(source =>
  (['missing', 'live', 'error'] as const).map(occurrences => ({ locale, source, occurrences })))))(
  'shows only the skipped row status in $locale through $source with $occurrences occurrences', ({ locale, source, occurrences }) => {
    state.isError = occurrences === 'error'
    if (occurrences === 'live') for (const item of skippedDatedHabitListFixture.items) {
      state.habits.set(item.id, createMockHabit({ id: item.id, isBadHabit: item.isBadHabit, isLoggedInRange: item.status === 'done' }))
    }
    const parsed = source === 'chat'
      ? chatPartSchema.parse({ type: 'block', kind: 'habitList', block: skippedDatedHabitListFixture })
      : readBlockResponseSchema.parse({ kind: 'habitList', block: skippedDatedHabitListFixture, read: skippedDatedHabitListFixture.read })
    if (!parsed || !('kind' in parsed) || parsed.kind !== 'habitList') throw new Error('Skipped habit block did not parse')
    const messages = locale === 'en' ? en : pt
    const view = mount(parsed, locale)
    const rows = [...view.container.querySelectorAll('[data-habit-block-row]')]
    const names = [messages.habits.statusDot.skip, messages.chat.habitList.logged, messages.chat.habitList.overdue, messages.chat.habitList.pending, messages.habits.statusDot.bad]
    expect(rows).toHaveLength(5)
    rows.forEach((row, index) => {
      expect(within(row as HTMLElement).getByRole('img', { name: names[index] })).toHaveAttribute('data-status', ['empty', 'done', 'overdue', 'empty', 'bad'][index])
      expect(row.querySelector('[data-habit-block-meta]')?.textContent).toBe(index === 0 ? messages.habits.statusDot.skip : undefined)
    })
    fireEvent.click(within(rows[0]! as HTMLElement).getByRole('button', { name: locale === 'en' ? 'Open Walk' : 'Abrir Walk' }))
    expect(state.push).toHaveBeenCalledWith(`/habits/skipped?date=${skippedDatedHabitListFixture.date}`)
    expect(state.mutate).not.toHaveBeenCalled()
    view.unmount()
})

it.each(['en', 'pt-BR'] as const)('lets a live completion supersede the saved skipped status in %s', (locale) => {
  for (const item of skippedDatedHabitListFixture.items) {
    state.habits.set(item.id, createMockHabit({ id: item.id, isBadHabit: item.isBadHabit, isLoggedInRange: item.id === 'skipped' || item.status === 'done' }))
  }
  const parsed = chatPartSchema.parse({ type: 'block', kind: 'habitList', block: skippedDatedHabitListFixture })
  if (!parsed || !('kind' in parsed) || parsed.kind !== 'habitList') throw new Error('Skipped habit block did not parse')
  const messages = locale === 'en' ? en : pt
  const view = mount(parsed, locale)
  const row = view.container.querySelector('[data-habit-block-row]') as HTMLElement
  expect(within(row).getByRole('img', { name: messages.chat.habitList.logged })).toHaveAttribute('data-status', 'done')
  expect(row.querySelector('[data-habit-block-meta]')).toBeNull()
  view.unmount()
})


describe('read offers', () => {
  beforeEach(() => { state.aiMessagesPeriod = 'day'; useChatStore.setState({ conversationId: offerConversationId, dismissedOfferKeys: [] }); vi.mocked(dismissChatOffers).mockReset().mockResolvedValue({ ok: true, data: null }) })
  afterEach(() => { useChatStore.setState({ conversationId: null, dismissedOfferKeys: [] }) })
  it.each((['en', 'pt-BR'] as const).flatMap(locale => (['day', 'week'] as const).flatMap(period => [false, true].map(dailyBudgetReached => ({ locale, period, dailyBudgetReached })))))(
    'shows the existing $period limit copy in $locale with daily budget $dailyBudgetReached', async ({ locale, period, dailyBudgetReached }) => {
      state.aiMessagesPeriod = period
      const messages = locale === 'en' ? en : pt
      const send = vi.fn(async () => {})
      mount({ kind: 'periodTotal', block: offeredReadFixture }, locale, send, { isOnline: true, isSending: false, atMessageLimit: true, dailyBudgetReached, allowance: 5, send: vi.fn() })
      const reason = dailyBudgetReached ? messages.chat.dailyBudgetReached : period === 'week' ? messages.shell.composer.limit.exhaustedWeekly : messages.shell.composer.limit.exhausted
      expect(screen.getByText(reason)).toHaveAttribute('role', 'status')
      expect(screen.getByRole('button', { name: astraOfferFixture.label })).toBeDisabled()
      expect(send).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: messages.chat.offers.dismiss }))
      await waitFor(() => expect(screen.queryByRole('button', { name: astraOfferFixture.label })).not.toBeInTheDocument())
    })
  it.each(['en', 'pt-BR'] as const)('renders and dismisses the supplied offer in %s', async locale => {
    const messages = locale === 'en' ? en : pt
    mount({ kind: 'periodTotal', block: offeredReadFixture }, locale, vi.fn())
    expect(screen.getByRole('button', { name: astraOfferFixture.label })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: messages.chat.offers.dismiss }))
    await waitFor(() => expect(screen.queryByRole('button', { name: astraOfferFixture.label })).not.toBeInTheDocument())
    expect(dismissChatOffers).toHaveBeenCalledExactlyOnceWith(offerConversationId, [astraOfferFixture.offerKey], null)
  })
  it.each(['preparePreview', 'continueChat'] as const)('sends %s through chat once without approval', async kind => {
    const send = vi.fn(async () => {})
    mount({ kind: 'periodTotal', block: { ...offeredReadFixture, read: { ...offeredReadFixture.read, nextAction: { ...astraOfferFixture, kind } } } }, 'en', send)
    fireEvent.click(screen.getByRole('button', { name: astraOfferFixture.label }))
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(astraOfferFixture.prompt, { selectedOfferKey: astraOfferFixture.offerKey }))
    expect(dismissChatOffers).not.toHaveBeenCalled()
  })
  it('opens the supplied surface and never treats its string as a route', async () => {
    mount({ kind: 'periodTotal', block: { ...offeredReadFixture, read: { ...offeredReadFixture.read, nextAction: { ...astraOfferFixture, kind: 'openSurface', surface: 'calendar-sync' } } } })
    fireEvent.click(screen.getByRole('button', { name: astraOfferFixture.label }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/calendar?import=1'))
  })
  it('withholds offers without a negotiated conversation', () => {
    useChatStore.setState({ conversationId: null })
    mount({ kind: 'periodTotal', block: offeredReadFixture })
    expect(screen.queryByRole('button', { name: astraOfferFixture.label })).not.toBeInTheDocument()
  })
  it('retains a failed dismissal for retry', async () => {
    vi.mocked(dismissChatOffers).mockResolvedValueOnce({ ok: false, error: 'offline', code: 'offline', status: 0, sessionRefreshFailed: false })
    mount({ kind: 'periodTotal', block: offeredReadFixture }, 'en', vi.fn())
    fireEvent.click(screen.getByRole('button', { name: en.chat.offers.dismiss }))
    await screen.findByText(en.chat.offers.failed)
    expect(screen.getByRole('button', { name: en.chat.offers.dismiss })).toBeEnabled()
  })
})


it('keeps dismissal available when the conversation action cannot send', async () => {
  useChatStore.setState({ conversationId: offerConversationId, dismissedOfferKeys: [] })
  vi.mocked(dismissChatOffers).mockReset().mockResolvedValue({ ok: true, data: null })
  mount({ kind: 'periodTotal', block: offeredReadFixture })
  try {
    expect(screen.getByRole('button', { name: astraOfferFixture.label })).toBeDisabled()
    const dismiss = screen.getByRole('button', { name: en.chat.offers.dismiss })
    expect(dismiss).toBeEnabled()
    fireEvent.click(dismiss)
    await waitFor(() => expect(dismissChatOffers).toHaveBeenCalledExactlyOnceWith(offerConversationId, [astraOfferFixture.offerKey], null))
  } finally { useChatStore.setState({ conversationId: null, dismissedOfferKeys: [] }) }
})
