import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { act, create } from 'react-test-renderer'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { renderedText } from '../../support/react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completedHabitTotalFixture, completedHabitComparisonFixture, focusedDatedHabitListFixture, focusedStaleRecapFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedReadMetadataFixture } from '@orbit/shared/test-support/chat-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getAccountDay } from '@orbit/shared/utils'
import { ChatBlock } from '@/components/chat/block-registry'
import { habitMonthFixture } from '@orbit/shared/test-support/habit-month-fixture'
import { apiClient } from '@/lib/api-client'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { API } from '@orbit/shared/api'
import { chatPartSchema, habitMonthCardSchema, readBlockResponseSchema, type ReadBlockResponse } from '@orbit/shared/types/chat'

const state = vi.hoisted(() => ({ locale: 'en', actualCopy: false, habits: new Map<string, NormalizedHabit>(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ i18n: { language: state.locale }, t: (key: string, values?: Record<string, string | number>) => {
  if (!state.actualCopy) return key
  const message = key.split('.').reduce<unknown>((current, segment) => typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined, state.locale === 'en' ? en : pt)
  return typeof message === 'string' ? new IntlMessageFormat(message, state.locale).format(values) : key
} }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: state.habits }, isPending: false }), useLogHabit: () => ({ mutate: state.mutate }), useHabitMetrics: () => ({}) }))
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
beforeEach(() => { vi.mocked(apiClient).mockReset(); state.locale = 'en'; state.actualCopy = false; state.habits.clear(); state.mutate.mockReset(); state.push.mockReset() })

describe('focused Android read compositions', () => {
  it.each(['en', 'pt-BR'])('keeps figures, dates and zero baseline honest in %s', async locale => {
    state.locale = locale
    const tree = await mount()
    expect(renderedText(tree.toJSON())).toContain('12')
    expect(renderedText(tree.toJSON())).toContain('2026')
    await act(() => tree.unmount())
    const comparison = await mount({ kind: 'periodComparison', block: focusedPeriodComparisonFixture })
    const text = renderedText(comparison.toJSON())
    expect(text).toContain('+12')
    expect(text).not.toContain('%')
    await act(() => comparison.unmount())
  })

  it('uses the exact refresh token and validates the resulting period card', async () => {
    vi.mocked(apiClient).mockResolvedValue({ kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, value: 18 }, read: { ...focusedReadMetadataFixture, revision: 'two' } })
    const tree = await mount()
    await press(tree, 'blockFrame.refresh')
    expect(renderedText(tree.toJSON())).toContain('18')
    expect(apiClient).toHaveBeenCalledWith(API.chat.refreshRead, expect.objectContaining({ method: 'POST', body: expect.stringContaining('signed-query') }), expect.anything())
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
    const tree = await mount()
    await press(tree, 'blockFrame.refresh')
    expect(renderedText(tree.toJSON())).toContain('12')
    expect(renderedText(tree.toJSON())).toContain(code === 'READ_QUERY_STALE' ? 'chat.readBlock.stale' : code === 'READ_QUERY_EXPIRED' ? 'chat.readBlock.expired' : 'chat.readBlock.error')
    await act(() => tree.unmount())
  })

  it('discards the old account response', async () => {
    let resolve!: (result: ReadBlockResponse) => void
    vi.mocked(apiClient).mockImplementation(() => new Promise(done => { resolve = done }))
    const tree = await mount()
    await press(tree, 'blockFrame.refresh')
    await act(() => advanceAccountGeneration())
    await act(() => { resolve({ kind: 'periodTotal', block: { ...focusedPeriodTotalFixture, value: 99 }, read: focusedReadMetadataFixture }) })
    expect(renderedText(tree.toJSON())).not.toContain('99')
    await act(() => tree.unmount())
  })
})

it.each(['chat', 'refresh'] as const)('retains a parsed %s historical schedule and rejects a direct press on an ineligible action', async source => {
  state.habits.set('habit-one', createMockHabit({ id: 'habit-one', frequencyUnit: 'Day', dueDate: '2026-09-01', scheduledDates: ['2026-09-01'] }))
  const parsed = source === 'chat'
    ? chatPartSchema.parse({ type: 'block', kind: 'habitList', block: focusedDatedHabitListFixture })
    : readBlockResponseSchema.parse({ kind: 'habitList', block: focusedDatedHabitListFixture, read: focusedDatedHabitListFixture.read })
  expect(parsed).not.toBeNull()
  if (!parsed || !('kind' in parsed) || parsed.kind !== 'habitList') throw new Error('Dated habit block did not parse')
  const tree = await mount(parsed)
  expect(renderedText(tree.toJSON())).toContain('chat.habitList.logged')
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

it('keeps stale recap disclosure and Progress available without refreshing', async () => {
  const tree = await mount({ kind: 'periodInsight', block: focusedStaleRecapFixture })
  expect(tree.root.findAll(node => node.props.testID === 'block-frame-stale')).not.toHaveLength(0)
  expect(renderedText(tree.toJSON())).toContain('chat.readBlock.stale')
  expect(renderedText(tree.toJSON())).not.toContain('Walked')
  await press(tree, 'chat.habitList.more')
  for (const text of ['Walked', 'Mornings', 'Start small', 'Reading', 'Walk', 'Read']) expect(renderedText(tree.toJSON())).toContain(text)
  await press(tree, 'chat.readBlock.less')
  expect(renderedText(tree.toJSON())).not.toContain('Walked')
  const progress = tree.root.findAll(node => node.props.accessibilityRole === 'link' && node.props.accessibilityLabel === 'chat.insight.progressLink' && typeof node.props.onPress === 'function')[0]!
  await act(() => { (progress.props.onPress as () => void)() })
  expect(state.push).toHaveBeenCalledWith('/progress')
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

it('refreshes the month through its dedicated route without sending a page parameter', async () => {
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  const refreshed = { kind: 'habitMonth', block: { ...card, today: '2026-09-12' }, read: { ...card.read!, revision: 'two', refreshToken: 'month-two' } }
  vi.mocked(apiClient).mockResolvedValue(refreshed)
  const tree = await mount({ kind: 'habitMonth', block: card })
  await press(tree, 'blockFrame.refresh')
  expect(apiClient).toHaveBeenCalledWith(API.chat.refreshHabitMonth, expect.objectContaining({ method: 'POST',
    body: expect.stringContaining('signed-month'),
  }), expect.anything())
  expect(JSON.parse(vi.mocked(apiClient).mock.calls[0]![1]!.body as string)).toMatchObject({ token: 'signed-month', clientContext: { platform: 'mobile', partKinds: expect.arrayContaining(['habitMonth']) } })
  expect(JSON.parse(vi.mocked(apiClient).mock.calls[0]![1]!.body as string)).not.toHaveProperty('page')
  await press(tree, 'blockFrame.refresh')
  expect(JSON.parse(vi.mocked(apiClient).mock.calls[1]![1]!.body as string).token).toBe('month-two')
  await act(() => tree.unmount())
})

it.each([['en', 'chat'], ['en', 'refresh'], ['pt-BR', 'chat'], ['pt-BR', 'refresh']] as const)('distinguishes habit counts from completions in %s through %s', async (locale, source) => {
  state.locale = locale
  state.actualCopy = true
  const labels = locale === 'en'
    ? { habits: 'Habits completed', unit: 'habits', completions: 'Completions', completionUnit: 'completions' }
    : { habits: 'Hábitos concluídos', unit: 'hábitos', completions: 'Conclusões', completionUnit: 'conclusões' }
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
    const tree = await mount(parsed)
    const text = renderedText(tree.toJSON())
    expect(text).toContain(expected.title)
    expect(text).toContain(expected.unit)
    for (const figure of figures) expect(text).toContain(figure)
    expect(text).not.toContain(expected.other)
    await act(() => tree.unmount())
  }
})
