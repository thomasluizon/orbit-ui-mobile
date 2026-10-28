import { chatNavigationCases } from '@orbit/shared/test-support/chat-navigation-fixtures'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { act, create } from 'react-test-renderer'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { renderedText } from '../../support/react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completedHabitTotalFixture, completedHabitComparisonFixture, focusedDatedHabitListFixture, focusedStaleRecapFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedPeriodMetricsFixture, focusedReadMetadataFixture } from '@orbit/shared/test-support/chat-fixtures'
import { gamificationCardCases, gamificationCardFixture } from '@orbit/shared/test-support/gamification-card-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getAccountDay } from '@orbit/shared/utils'
import { inPlaceDayFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { ChatBlock } from '@/components/chat/block-registry'
import { HabitCheck } from '@/components/habits/habit-check'
import { habitMonthFixture } from '@orbit/shared/test-support/habit-month-fixture'
import { apiClient } from '@/lib/api-client'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { API } from '@orbit/shared/api'
import { motionDurations } from '@orbit/shared/theme'
import { chatPartSchema, habitMonthCardSchema, readBlockResponseSchema, type ReadBlockResponse } from '@orbit/shared/types/chat'

const state = vi.hoisted(() => ({ isError: false, locale: 'en', actualCopy: false, habits: new Map<string, NormalizedHabit>(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ i18n: { language: state.locale }, t: (key: string, values?: Record<string, string | number>) => {
  if (!state.actualCopy) return key
  const message = key.split('.').reduce<unknown>((current, segment) => typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined, state.locale === 'en' ? en : pt)
  return typeof message === 'string' ? new IntlMessageFormat(message, state.locale).format(values) : key
} }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: state.isError ? undefined : { habitsById: state.habits }, isError: state.isError, isPending: false }), useLogHabit: () => ({ mutate: state.mutate, mutateAsync: state.mutate }), useHabitMetrics: () => ({}) }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isPending: false }) }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({ streakQuery: { isPending: false } }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false }) }))

const total = { kind: 'periodTotal' as const, block: focusedPeriodTotalFixture }
async function mount(part: Parameters<typeof ChatBlock>[0]['part'] = total) {
  let tree!: GeometryTree
  await act(() => { tree = create(<ChatBlock part={part} onActionChipClick={vi.fn()} />) as GeometryTree })
  return tree
}
async function press(tree: GeometryTree, label: string) {
  const button = tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]!
  await act(() => { (button.props.onPress as () => void)() })
}
beforeEach(() => { state.isError = false; vi.mocked(apiClient).mockReset(); state.locale = 'en'; state.actualCopy = false; state.habits.clear(); state.mutate.mockReset(); state.push.mockReset() })

describe('gamification reads', () => {
  it.each(gamificationCardCases.flatMap(testCase => ['en', 'pt-BR'].map(locale => ({ ...testCase, locale }))))(
    'renders only requested sections for $name in $locale', async ({ block, locale }) => {
      state.locale = locale
      state.actualCopy = true
      const tree = await mount({ kind: 'gamification', block })
      const text = renderedText(tree.toJSON())
      const messages = locale === 'en' ? en : pt
      expect(tree.root.findAll(node => node.props.testID === 'progress-xp-summary').length > 0).toBe(block.state.profile !== null)
      expect(text.includes(locale === 'en' ? 'First Orbit' : 'Primeira órbita')).toBe(Boolean(block.state.achievements?.achievements.length))
      if (block.state.achievements?.achievements.length === 0) expect(text).toContain(messages.progressScreen.achievements.empty)
      expect(text).not.toContain(messages.chat.streakCard.current)
      expect(text.includes(messages.progressScreen.streak.longest)).toBe(block.state.streak !== null)
      if (block.state.streak) {
        expect(tree.root.findAll(node => node.props.accessibilityRole === 'header' && renderedText(node).includes(messages.progressScreen.sections.streak)).length).toBeGreaterThan(0)
        expect(renderedText(tree.root.findAll(node => node.props.testID === 'progress-streak-figure')[0]!)).toContain('5')
        expect(text).toContain('9')
        if (!block.state.achievements) expect(text).not.toContain(messages.progressScreen.sections.achievements)
      }
      await act(() => tree.unmount())
    })

  it.each(gamificationCardCases)('refreshes $name using its signed query and dedicated route', async ({ block }) => {
    const next = { ...block, state: { ...block.state, streak: block.state.streak ? { ...block.state.streak, currentStreak: 6 } : null }, read: { ...block.read, revision: 'two' } }
    vi.mocked(apiClient).mockResolvedValue({ kind: 'gamification', block: next, read: next.read })
    const tree = await mount({ kind: 'gamification', block })
    await press(tree, 'blockFrame.refresh')
    expect(apiClient).toHaveBeenCalledExactlyOnceWith(API.chat.refreshGamification, expect.objectContaining({ method: 'POST', body: expect.any(String), isCurrent: expect.any(Function) }), expect.anything())
    const request = JSON.parse(vi.mocked(apiClient).mock.calls[0]![1]!.body as string)
    expect(request).toEqual({ token: 'signed-query', clientContext: expect.objectContaining({ partKinds: expect.arrayContaining(['gamification']) }) })
    if (block.state.streak) expect(renderedText(tree.root.findAll(node => node.props.testID === 'progress-streak-figure')[0]!)).toContain('6')
    await act(() => tree.unmount())
  })

  it('keeps a failed stale refresh actionable and replaces the snapshot on retry', async () => {
    state.actualCopy = true
    const stale = { ...gamificationCardFixture, read: { ...gamificationCardFixture.read, completeness: 'stale' as const } }
    const next = { ...gamificationCardFixture, state: { ...gamificationCardFixture.state, profile: { ...gamificationCardFixture.state.profile, totalXp: 600 } }, read: { ...gamificationCardFixture.read, revision: 'two' } }
    vi.mocked(apiClient).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ kind: 'gamification', block: next, read: next.read })
    const tree = await mount({ kind: 'gamification', block: stale })
    await press(tree, en.blockFrame.refresh)
    expect(renderedText(tree.toJSON())).toContain(en.chat.readBlock.error)
    await press(tree, en.blockFrame.refresh)
    const summary = tree.root.findAll(node => node.props.testID === 'progress-xp-summary')[0]!
    expect(renderedText(summary)).toContain('600')
    expect(renderedText(tree.toJSON())).not.toContain(en.chat.readBlock.error)
    await act(() => tree.unmount())
  })

  it('keeps the full catalogue with earned, unearned and supplied progress states', async () => {
    const achievements = Object.keys(en.gamification.achievements).slice(0, 8).map((id, index) => ({
      ...gamificationCardFixture.state.achievements.achievements[0]!, id,
      isEarned: index === 0, progressCurrent: index === 1 ? 2 : null, progressTarget: index === 1 ? 7 : null,
    }))
    const tree = await mount({ kind: 'gamification', block: { ...gamificationCardFixture, state: { profile: null, achievements: { achievements }, streak: null } } })
    for (const achievement of achievements) expect(tree.root.findAll(node => node.props.testID === `achievement-tile-${achievement.id}`).length).toBeGreaterThan(0)
    expect(renderedText(tree.toJSON())).toContain('progressScreen.achievements.progress')
    await act(() => tree.unmount())
  })

  it('guards duplicate refreshes and discards a response after an account change', async () => {
    state.actualCopy = true
    let resolve!: (response: unknown) => void
    vi.mocked(apiClient).mockImplementation(() => new Promise(done => { resolve = done }))
    const tree = await mount({ kind: 'gamification', block: gamificationCardFixture })
    await press(tree, en.blockFrame.refresh)
    await press(tree, en.blockFrame.refresh)
    expect(apiClient).toHaveBeenCalledTimes(1)
    await act(() => advanceAccountGeneration())
    const next = { ...gamificationCardFixture, state: { ...gamificationCardFixture.state, profile: { ...gamificationCardFixture.state.profile, totalXp: 999 } } }
    await act(() => { resolve({ kind: 'gamification', block: next, read: next.read }) })
    const summary = tree.root.findAll(node => node.props.testID === 'progress-xp-summary')[0]!
    expect(renderedText(summary)).toContain('500')
    expect(renderedText(tree.toJSON())).not.toContain('999')
    await act(() => tree.unmount())
  })
})

describe('focused Android read compositions', () => {
  it.each(['en', 'pt-BR'])('keeps figures, dates and zero baseline honest in %s', async locale => {
    state.locale = locale
    const tree = await mount()
    expect(renderedText(tree.toJSON())).toContain('12')
    expect(renderedText(tree.toJSON())).toContain('2026')
    const header = tree.root.findAll(node => String(node.type) === 'View' && node.props.accessibilityRole === 'header')[0]!
    expect(renderedText(header)).toContain('12')
    expect(renderedText(tree.toJSON())).not.toContain('chat.readBlock.metric.positiveLogRecords')
    await act(() => tree.unmount())
    const comparison = await mount({ kind: 'periodComparison', block: focusedPeriodComparisonFixture })
    const text = renderedText(comparison.toJSON())
    expect(text).toContain('12')
    expect(text).not.toContain('%')
    await act(() => comparison.unmount())
  })

  it('omits manual refresh controls from a total', async () => {
    const tree = await mount()
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'blockFrame.refresh')).toHaveLength(0)
    await act(() => tree.unmount())
  })

  it('pages dated history and retains zero and negative log values', async () => {
    vi.mocked(apiClient).mockResolvedValue({ kind: 'recordList', block: { ...focusedHistoryFixture, items: [{ id: 'log-two', title: '2026-09-02', logDate: '2026-09-02', value: -1 }], read: { ...focusedHistoryFixture.read, completeness: 'complete', nextCursor: null } }, read: { ...focusedHistoryFixture.read, completeness: 'complete', nextCursor: null } })
    const tree = await mount({ kind: 'recordList', block: focusedHistoryFixture })
    await press(tree, 'chat.recordList.more')
    const text = renderedText(tree.toJSON())
    expect(text).toContain('Sep 1, 2026')
    expect(text).toContain('Sep 2, 2026')
    expect(text).toContain('-1')
    expect(apiClient).toHaveBeenCalledWith(API.chat.refreshRead, expect.objectContaining({ body: expect.stringContaining('"page":true') }), expect.anything())
    await act(() => tree.unmount())
  })

  it.each(['READ_QUERY_STALE', 'READ_QUERY_EXPIRED', 'offline'])('keeps useful figures after %s', async code => {
    vi.mocked(apiClient).mockRejectedValue(Object.assign(new Error(code), { code }))
    const tree = await mount({ kind: 'recordList', block: focusedHistoryFixture })
    await press(tree, 'chat.recordList.more')
    expect(renderedText(tree.toJSON())).toContain('Sep 1, 2026')
    expect(renderedText(tree.toJSON())).toContain(code === 'READ_QUERY_STALE' ? 'chat.readBlock.stale' : code === 'READ_QUERY_EXPIRED' ? 'chat.readBlock.expired' : 'chat.readBlock.error')
    await act(() => tree.unmount())
  })

  it('discards the old account response', async () => {
    let resolve!: (result: ReadBlockResponse) => void
    vi.mocked(apiClient).mockImplementation(() => new Promise(done => { resolve = done }))
    const tree = await mount({ kind: 'recordList', block: focusedHistoryFixture })
    await press(tree, 'chat.recordList.more')
    await act(() => advanceAccountGeneration())
    await act(() => { resolve({ kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, value: 99 }, read: focusedReadMetadataFixture }) })
    expect(renderedText(tree.toJSON())).not.toContain('99')
    await act(() => tree.unmount())
  })

  it('keeps refresh recovery after paging detects staleness and refresh fails', async () => {
    state.actualCopy = true
    const next = readBlockResponseSchema.parse({ kind: 'recordList', block: {
      ...focusedHistoryFixture, items: [{ id: 'replacement', title: '2026-09-02', logDate: '2026-09-02', value: -1 }],
    }, read: { ...focusedHistoryFixture.read, revision: 'recovered' } })
    vi.mocked(apiClient).mockRejectedValueOnce(Object.assign(new Error('stale'), { code: 'READ_QUERY_STALE' }))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(next)
    const tree = await mount({ kind: 'recordList', block: focusedHistoryFixture })
    const buttons = (label: string) => tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === label)
    await press(tree, en.chat.recordList.more)
    expect(renderedText(tree.toJSON())).toContain(en.chat.readBlock.stale)
    expect(buttons(en.chat.recordList.more)).toHaveLength(0)
    await press(tree, en.blockFrame.refresh)
    expect(renderedText(tree.toJSON())).toContain(en.chat.readBlock.error)
    expect(buttons(en.blockFrame.refresh)).toHaveLength(1)
    expect(buttons(en.blockFrame.refresh)[0]!.props.accessibilityState).toMatchObject({ disabled: false })
    expect(buttons(en.chat.recordList.more)).toHaveLength(0)
    expect(renderedText(tree.toJSON())).toContain('Sep 1, 2026')
    vi.useFakeTimers()
    try {
      await press(tree, en.blockFrame.refresh)
      await act(() => { vi.advanceTimersByTime(motionDurations.micro) })
      const text = renderedText(tree.toJSON())
      expect(text).toContain('Sep 2, 2026')
      expect(tree.root.findAll(node => node.props.testID === 'block-frame-item-log-one-pending')).toHaveLength(0)
      expect(text).not.toContain(en.chat.readBlock.error)
      expect(buttons(en.blockFrame.refresh)).toHaveLength(0)
      expect(buttons(en.chat.recordList.more)).toHaveLength(1)
      expect(buttons(en.chat.recordList.more)[0]!.props.accessibilityState).toMatchObject({ disabled: false })
      expect(vi.mocked(apiClient).mock.calls.map(call => JSON.parse(call[1]!.body as string))).toEqual([
        { token: 'signed-page', page: true, clientContext: expect.anything() },
        { token: 'signed-query', page: false, clientContext: expect.anything() },
        { token: 'signed-query', page: false, clientContext: expect.anything() },
      ])
    } finally { await act(() => tree.unmount()); vi.useRealTimers() }
  })
})

it('shows a saved metric window only once through the owning read composition', async () => {
  const tree = await mount({ kind: 'metrics', block: { surfaceId: 'progress', period: 'month', hasData: true, completionRate: 80, totalCompletions: 12, totalScheduled: 10, activeDays: 9, currentStreak: 2, bestStreak: 4, periodMetrics: focusedPeriodMetricsFixture, read: focusedReadMetadataFixture } })
  expect(renderedText(tree.toJSON()).split('Sep 1, 2026 - Sep 30, 2026')).toHaveLength(2)
  await act(() => tree.unmount())
})

it.each(['chat', 'refresh'] as const)('retains a parsed %s historical schedule and rejects a direct press on an ineligible action', async source => {
  state.habits.set('habit-one', createMockHabit({ id: 'habit-one', frequencyUnit: 'Day', dueDate: '2026-09-01', scheduledDates: ['2026-09-01'] }))
  const parsed = source === 'chat'
    ? chatPartSchema.parse({ type: 'block', kind: 'habitList', block: focusedDatedHabitListFixture })
    : readBlockResponseSchema.parse({ kind: 'habitList', block: focusedDatedHabitListFixture, read: focusedDatedHabitListFixture.read })
  expect(parsed).not.toBeNull()
  if (!parsed || !('kind' in parsed) || parsed.kind !== 'habitList') throw new Error('Dated habit block did not parse')
  const tree = await mount(parsed)
  expect(renderedText(tree.toJSON())).not.toContain('chat.habitList.logged')
  await press(tree, 'chat.habitList.log')
  expect(state.mutate).not.toHaveBeenCalled()
  await press(tree, 'chat.habitList.open')
  expect(state.push).toHaveBeenCalledWith({ pathname: '/habits/[id]', params: { id: 'habit-one', date: '2026-09-01' } })
  await act(() => tree.unmount())
})

it('logs the eligible current occurrence on the exact requested day', async () => {
  const today = getAccountDay(new Date(), 'UTC')
  state.habits.set('habit-one', createMockHabit({ id: 'habit-one', frequencyUnit: 'Day', createdAtUtc: '2026-01-01T00:00:00Z', dueDate: today, scheduledDates: [today] }))
  const tree = await mount({ kind: 'habitList', block: { scope: 'today', date: today, items: [{ id: 'habit-one', title: 'Walk', depth: 0, isBadHabit: false, status: 'today' }], read: { ...focusedReadMetadataFixture, queryFamily: 'query_habits', scope: { date: today } } } })
  await press(tree, 'chat.habitList.log')
  expect(state.mutate).toHaveBeenCalledWith({ habitId: 'habit-one', date: today, intent: 'log' })
  await act(() => tree.unmount())
})

it('keeps stale recap disclosure and refresh recovery available', async () => {
  const tree = await mount({ kind: 'periodInsight', block: focusedStaleRecapFixture })
  expect(tree.root.findAll(node => node.props.testID === 'block-frame-stale')).not.toHaveLength(0)
  expect(renderedText(tree.toJSON())).toContain('chat.readBlock.stale')
  expect(renderedText(tree.toJSON())).not.toContain('Walked')
  await press(tree, 'chat.habitList.more')
  for (const text of ['Walked', 'Mornings', 'Start small', 'Reading', 'Walk', 'Read']) expect(renderedText(tree.toJSON())).toContain(text)
  await press(tree, 'chat.readBlock.less')
  expect(renderedText(tree.toJSON())).not.toContain('Walked')
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'chat.insight.progressLink')).toHaveLength(0)
  expect(apiClient).not.toHaveBeenCalled()
  await act(() => tree.unmount())
})

it('withholds signed paging for a stale query', async () => {
  const tree = await mount({ kind: 'recordList', block: { ...focusedHistoryFixture, read: { ...focusedHistoryFixture.read, completeness: 'stale' } } })
  expect(tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'chat.recordList.more')).toHaveLength(0)
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'blockFrame.refresh' && String(node.type) === 'Pressable')).toHaveLength(1)
  expect(apiClient).not.toHaveBeenCalled()
  await act(() => tree.unmount())
})


it.each(['en', 'pt-BR'])('renders the shared month grid and exact day navigation in %s', async locale => {
  state.locale = locale
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  const tree = await mount({ kind: 'habitMonth', block: card })
  for (const [date, outcome] of [['01', 'full'], ['02', 'none'], ['03', 'none'], ['04', 'not-scheduled']] as const) {
    const day = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.testID === `calendar-day-select-2026-09-${date}`)[0]!
    expect(day.findAll(node => String(node.type) === 'View' && node.props.testID === `day-cell-${outcome}`)).toHaveLength(1)
  }
  const today = tree.root.findAll(node => String(node.type) === 'View' && node.props.testID === 'calendar-day-slot-2026-09-11')[0]!
  expect(today.findAll(node => String(node.type) === 'View' && node.props.testID === 'day-today-ring')).toHaveLength(1)
  const skipped = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.testID === 'calendar-day-select-2026-09-03')[0]!
  await act(() => { (skipped.props.onPress as () => void)() })
  expect(state.push).toHaveBeenCalledWith({ pathname: '/calendar', params: { date: '2026-09-03' } })
  await act(() => tree.unmount())
})

it('replaces the month snapshot when a new reply revision arrives without a refresh action', async () => {
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  const tree = await mount({ kind: 'habitMonth', block: card })
  const next = { ...card, today: '2026-09-12', calendar: { ...card.calendar, logs: {} }, read: { ...card.read!, revision: 'two', refreshToken: 'month-two' } }
  await act(() => tree.update(<ChatBlock part={{ kind: 'habitMonth', block: next }} onActionChipClick={vi.fn()} />))
  const today = tree.root.findAll(node => String(node.type) === 'View' && node.props.testID === 'calendar-day-slot-2026-09-12')[0]!
  expect(today.findAll(node => String(node.type) === 'View' && node.props.testID === 'day-today-ring')).toHaveLength(1)
  const first = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.testID === 'calendar-day-select-2026-09-01')[0]!
  expect(first.findAll(node => String(node.type) === 'View' && node.props.testID === 'day-cell-none')).toHaveLength(1)
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'blockFrame.refresh')).toHaveLength(0)
  expect(apiClient).not.toHaveBeenCalled()
  await act(() => tree.unmount())
})

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['habitList', 'daySummary'] as const).flatMap(kind =>
  (['live', 'missing', 'failed'] as const).flatMap(queryState => ([
    ['done', false, 'done'], ['done', true, 'bad'], ['overdue', false, 'overdue'],
    ['overdue', true, 'overdue'], ['today', false, 'empty'], ['today', true, 'empty'],
  ] as const).map(([status, isBadHabit, expected]) => ({ locale, kind, queryState, status, isBadHabit, expected }))))))(
  'names $kind $status with bad=$isBadHabit through $queryState occurrences in $locale', async ({ locale, kind, queryState, status, isBadHabit, expected }) => {
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
    state.locale = locale
    state.actualCopy = true
    const tree = await mount(part)
    const row = tree.root.findAll(node => node.props.testID === 'habit-block-row')[0]!
    const check = row.findAll(node => node.props.testID === 'habit-check')[0]!
    expect(check.props.accessibilityLabel).toBe(statusLabel)
    expect(row.findAll(node => node.type === HabitCheck)[0]!.props.status).toBe(expected)
    const actionLabel = (status === 'done' ? messages.chat.habitList.unlog : messages.chat.habitList.log).replace('{name}', 'Walk')
    const actions = row.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === actionLabel && typeof node.props.onPress === 'function')
    if (queryState === 'live' && kind === 'habitList') {
      expect(actions.length).toBeGreaterThan(0)
      expect(actions.every(node => node.props.disabled)).toBe(true)
    } else expect(actions).toHaveLength(0)
    expect(state.mutate).not.toHaveBeenCalled()
    await act(() => tree.unmount())
})

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['chat', 'refresh'] as const).flatMap(source => (['periodTotal', 'periodComparison'] as const).map(kind => ({ locale, source, kind })))))(
  'distinguishes habit counts from completions in $locale through $source for $kind', async ({ locale, source, kind: blockKind }) => {
    state.locale = locale
    state.actualCopy = true
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
      const tree = await mount(parsed)
      const text = renderedText(tree.toJSON())
      expect(text.toLocaleLowerCase(locale)).toContain(expected.title.toLocaleLowerCase(locale))
      expect(text).toContain(expected.unit)
      const compactFigures = tree.root.findAll(node => String(node.type) === 'View' && node.props.testID === 'compact-figure')
      expect(compactFigures.map(figure => renderedText(figure).trim().split(/\s+/)[0])).toEqual(figures)
      expect(text).not.toMatch(habits ? /completions?|conclus(?:ão|ões)/i : /habits?|hábitos?/i)
      expect(text).not.toContain('chat.figure.comparison.')
      await act(() => tree.unmount())
    }
})

it.each((['en', 'pt-BR'] as const).flatMap(locale => (['chat', 'refresh'] as const).flatMap(source =>
  (['periodTotal', 'periodComparison'] as const).flatMap(kind =>
    (['distinctLoggedDates', 'metScheduledDates', 'scheduledDates'] as const).map(metric => ({ locale, source, kind, metric }))))))(
  'names $metric in $kind through $source in $locale', async ({ locale, source, kind, metric }) => {
    state.locale = locale
    state.actualCopy = true
    const block = { ...(kind === 'periodTotal' ? focusedPeriodTotalFixture : focusedPeriodComparisonFixture), metric, unit: 'days' }
    const parsed = source === 'chat'
      ? chatPartSchema.parse({ type: 'block', kind, block })
      : readBlockResponseSchema.parse({ kind, block, read: block.read })
    if (!parsed || !('kind' in parsed)) throw new Error(`${kind} ${source} did not parse`)
    const messages = locale === 'en' ? en : pt
    const tree = await mount(parsed)
    expect(renderedText(tree.toJSON()).toLocaleLowerCase(locale)).toContain(messages.chat.readBlock.metric[metric].toLocaleLowerCase(locale))
    const figures = tree.root.findAll(node => String(node.type) === 'View' && node.props.testID === 'compact-figure')
    expect(figures).toHaveLength(kind === 'periodTotal' ? 1 : 2)
    for (const figure of figures) expect(renderedText(figure)).toContain(locale === 'en' ? 'days' : 'dias')
    await act(() => tree.unmount())
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
  vi.mocked(apiClient).mockResolvedValue(next)
  const tree = await mount({ ...part, block: { ...part.block, read: staleRead } })
  expect(renderedText(tree.toJSON())).toContain('chat.readBlock.stale')
  await press(tree, 'blockFrame.refresh')
  expect(apiClient).toHaveBeenCalledExactlyOnceWith(part.kind === 'habitMonth' ? API.chat.refreshHabitMonth : API.chat.refreshRead,
    expect.objectContaining({ body: expect.stringContaining(`"token":"${initialRead.refreshToken}"`) }), expect.anything())
  if (part.kind !== 'habitMonth') expect(apiClient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: expect.stringContaining('"page":false') }), expect.anything())
  expect(renderedText(tree.toJSON())).not.toContain('chat.readBlock.stale')
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'blockFrame.refresh')).toHaveLength(0)
  await act(() => tree.unmount())
})
