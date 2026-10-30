import { describe, expect, it } from 'vitest'
import { acceptReadBlockResponse, formatReadWindow, readBlockPresentation, readBlockFailureKey, readBlockWindow } from '../chat/read-block-core'
import { chatClientContextSchema, chatPartSchema, readBlockResponseSchema } from '../types/chat'
import { buildChatClientContext } from '../chat/client-context'
import { completedHabitTotalFixture, completedHabitComparisonFixture, focusedDatedHabitListFixture, focusedHistoryFixture, focusedPeriodComparisonFixture, focusedPeriodTotalFixture, focusedReadMetadataFixture } from '../test-support/chat-fixtures'

const total = readBlockResponseSchema.parse({ kind: 'periodTotal', block: focusedPeriodTotalFixture, read: focusedReadMetadataFixture })

describe('query-bound read contracts', () => {
  it.each(['web', 'mobile'] as const)('negotiates the paired period and history surfaces on %s', platform => {
    const context = buildChatClientContext({ platform, locale: 'en' })
    expect(context.partKinds).toEqual(expect.arrayContaining(['periodTotal', 'periodComparison', 'recordList']))
    expect(context.supportsDatedHabitListCard).toBe(true)
    expect(context.supportsHabitHistoryCard).toBe(true)
    expect(chatClientContextSchema.parse(context)).toHaveProperty('supportsCompletedHabitsMetric', true)
    expect(chatPartSchema.parse({ type: 'block', ...total })).toMatchObject({ kind: 'periodTotal', block: focusedPeriodTotalFixture })
    expect(chatPartSchema.parse({ type: 'block', kind: 'periodComparison', block: focusedPeriodComparisonFixture })).toMatchObject({ block: { baselineValue: 0, relativeDelta: null } })
    expect(chatPartSchema.parse({ type: 'block', kind: 'recordList', block: focusedHistoryFixture })).toMatchObject({ block: { items: [{ logDate: '2026-09-01', value: 0 }] } })
  })

  it.each([
    { kind: 'periodTotal', block: completedHabitTotalFixture },
    { kind: 'periodComparison', block: completedHabitComparisonFixture },
  ])('preserves the completed habit contract on $kind in chat and refresh', part => {
    expect(chatPartSchema.parse({ type: 'block', ...part })).toMatchObject(part)
    expect(readBlockResponseSchema.parse({ ...part, read: part.block.read })).toMatchObject(part)
  })

  it.each([undefined, null, 0])('preserves an optional completed habit count of %s on legacy totals', completedHabits => {
    const block = { ...focusedPeriodTotalFixture, metrics: { ...focusedPeriodTotalFixture.metrics, completedHabits } }
    expect(chatPartSchema.parse({ type: 'block', kind: 'periodTotal', block })).toMatchObject({ block })
  })

  it('rejects a malformed completed habit count and unknown metric or unit', () => {
    for (const block of [
      { ...completedHabitTotalFixture, metrics: { ...completedHabitTotalFixture.metrics, completedHabits: 'three' } },
      { ...completedHabitTotalFixture, metric: 'unknown' },
      { ...completedHabitTotalFixture, unit: 'unknown' },
    ]) expect(chatPartSchema.parse({ type: 'block', kind: 'periodTotal', block })).toBeNull()
  })

  it('accepts the producer dated schedule through chat parsing', () => {
    expect(chatPartSchema.parse({ type: 'block', kind: 'habitList', block: focusedDatedHabitListFixture })).toMatchObject({
      kind: 'habitList', block: focusedDatedHabitListFixture,
    })
  })

  it('accepts the producer dated schedule through refresh parsing', () => {
    expect(readBlockResponseSchema.parse({ kind: 'habitList', block: focusedDatedHabitListFixture, read: focusedDatedHabitListFixture.read })).toMatchObject({
      kind: 'habitList', block: focusedDatedHabitListFixture, read: focusedDatedHabitListFixture.read,
    })
  })

  it('replaces a snapshot only with the same exact query and rejects changed page revisions', () => {
    const refreshed = { ...total, read: { ...total.read, revision: 'new-revision' } }
    expect(acceptReadBlockResponse(total, refreshed, false)).toBe(refreshed)
    expect(() => acceptReadBlockResponse(total, { ...total, read: { ...total.read, queryId: 'other' } }, false)).toThrow('READ_QUERY_MISMATCH')
    expect(() => acceptReadBlockResponse(total, { ...total, read: { ...total.read, queryFamily: 'other' } }, false)).toThrow('READ_QUERY_MISMATCH')
    expect(() => acceptReadBlockResponse(total, refreshed, true)).toThrow('READ_QUERY_STALE')
    expect(() => acceptReadBlockResponse(total, total, true)).toThrow('READ_QUERY_PAGE_INVALID')
  })

  it.each([
    ['habitList', { scope: 'all', items: [] }],
    ['goalList', { items: [] }],
    ['recordList', focusedHistoryFixture],
    ['calendar', { events: [], surfaceId: 'calendar' }],
  ])('pages %s using the signed identity and revision', (kind, block) => {
    const previous = readBlockResponseSchema.parse({ kind, block, read: focusedReadMetadataFixture })
    const next = readBlockResponseSchema.parse({ kind, block, read: { ...focusedReadMetadataFixture, nextCursor: null } })
    const result = acceptReadBlockResponse(previous, next, true)
    expect(result.read.nextCursor).toBeNull()
    if (result.kind === 'recordList') expect(result.block.items).toHaveLength(2)
    const other = { ...total, read: { ...total.read, queryFamily: previous.read.queryFamily } }
    expect(() => acceptReadBlockResponse(previous, other, false)).toThrow('READ_QUERY_MISMATCH')
  })

  it('keeps date-only windows stable in both locales', () => {
    expect(formatReadWindow({ from: '2026-09-01', to: '2026-09-01' }, 'en')).toBe('Sep 1, 2026')
    expect(formatReadWindow({ from: '2026-09-01', to: '2026-09-30' }, 'pt-BR')).toBe('1 de set. de 2026 - 30 de set. de 2026')
    expect(readBlockWindow({ date_from: '2026-09-01', date_to: '2026-09-30' })).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(readBlockWindow({ date: '2026-09-01' })).toEqual({ from: '2026-09-01', to: '2026-09-01' })
    expect(readBlockWindow({ as_of: '2026-09-01' })).toEqual({ from: '2026-09-01', to: '2026-09-01' })
    expect(readBlockWindow({})).toBeNull()
    expect(readBlockWindow({ date: 'today' })).toBeNull()
    expect(readBlockWindow({ date_from: '2026-09-01', date_to: null })).toEqual({ from: '2026-09-01', to: '2026-09-01' })
  })

  it('uses fixed compact recovery messages', () => {
    expect(readBlockFailureKey(new Error('READ_QUERY_EXPIRED'))).toBe('chat.readBlock.expired')
    expect(readBlockFailureKey(new Error('READ_QUERY_STALE'))).toBe('chat.readBlock.stale')
    expect(readBlockFailureKey(new Error('offline'))).toBe('chat.readBlock.error')
    expect(readBlockFailureKey(null)).toBe('chat.readBlock.error')
  })
})

it('keeps query recovery distinct from live action eligibility', () => {
  expect(readBlockPresentation(total, 'loading', false, null)).toMatchObject({ state: 'resting', message: null, window: null })
  expect(readBlockPresentation(total, 'stale', false, null)).toMatchObject({ state: 'resting', message: 'chat.readBlock.actionsUnavailable' })
  expect(readBlockPresentation(total, 'resting', true, null).state).toBe('acting')
  expect(readBlockPresentation(total, 'resting', false, 'chat.readBlock.error').state).toBe('partiallyFailed')
  expect(readBlockPresentation(total, 'resting', false, 'chat.readBlock.stale').state).toBe('stale')
  const stale = { ...total, read: { ...total.read, completeness: 'stale' as const } }
  expect(readBlockPresentation(stale, 'resting', false, null)).toMatchObject({ state: 'stale', message: 'chat.readBlock.stale' })
  const partial = { ...total, read: { ...total.read, completeness: 'partial' as const, recovery: 'refresh' } }
  expect(readBlockPresentation(partial, 'resting', false, null)).toMatchObject({ state: 'partiallyFailed', message: 'chat.readBlock.partial' })
  expect(readBlockPresentation({ ...partial, read: { ...partial.read, recovery: null } }, 'resting', false, null).message).toBe('chat.readBlock.partial')
  const history = readBlockResponseSchema.parse({ kind: 'recordList', block: focusedHistoryFixture, read: focusedHistoryFixture.read })
  expect(readBlockPresentation(history, 'resting', false, null)).toMatchObject({ state: 'resting', message: null, window: { from: '2026-09-01', to: '2026-09-30' } })
})
