import { describe, expect, it, vi } from 'vitest'
import { createHabitRankingController, formatHabitRankingPeriod, type HabitRankingState } from '../chat/habit-ranking-core'
import { habitRankingCardSchema, habitRankingResponseSchema } from '../types/habit-ranking'
import { habitRankingCardFixture, habitRankingNextPageFixture } from '../test-support/habit-ranking-fixtures'
import { ApiClientError } from '../utils/error-utils'

const initial = habitRankingCardSchema.parse(habitRankingCardFixture).ranking
const next = habitRankingResponseSchema.parse(habitRankingNextPageFixture)
function setup() {
  const load = vi.fn(async () => next)
  const open = vi.fn(async () => {})
  const isCurrent = vi.fn(() => true)
  return { load, open, isCurrent, controller: createHabitRankingController(habitRankingResponseSchema.parse(initial), { load, open, isCurrent, accountGeneration: 0 }) }
}

describe('habit ranking boundary', () => {
  it('retains every producer field and rejects incorrect metrics, dates and page coverage', () => {
    expect(habitRankingCardSchema.parse(habitRankingCardFixture)).toEqual(habitRankingCardFixture)
    for (const changed of [
      { query: { ...initial.query, metric: 'completion_rate' } },
      { query: { ...initial.query, dateToExclusive: '2026-02-30' } },
      { query: { ...initial.query, dateToExclusive: initial.query.dateFrom } },
      { totalCount: 1 }, { isComplete: true }, { nextCursor: null },
      { rows: [{ ...initial.rows[0], rank: 3 }] },
      { rows: [{ ...initial.rows[0], completedCount: 0 }] },
      { rows: [initial.rows[0], { ...initial.rows[0], rank: 2 }] },
    ]) expect(habitRankingResponseSchema.safeParse({ ...initial, ...changed }).success).toBe(false)
  })
  it.each(['en', 'pt-BR'])('formats the inclusive last date in %s without shifting the window', locale => {
    const dates = formatHabitRankingPeriod(initial.query, locale)
    expect(dates.from).toContain('2026')
    expect(dates.through).toContain('30')
    expect(dates.through).toContain('2026')
  })
})

describe('habit ranking action ownership', () => {
  it('notifies subscribers through paging, completion and refresh, and releases subscriptions', async () => {
    const { controller, load } = setup()
    const snapshots: HabitRankingState[] = []
    const unsubscribe = controller.subscribe(() => snapshots.push(controller.getSnapshot()))
    await controller.showMore()
    expect(snapshots[0]).toMatchObject({ rows: initial.rows, pending: 'page' })
    expect(snapshots.at(-1)).toMatchObject({ rows: [...initial.rows, ...next.rows], pending: null })
    expect(snapshots.at(-1)?.ranking).toMatchObject({ isComplete: true, nextCursor: null })

    load.mockResolvedValueOnce(initial)
    await controller.refresh()
    expect(snapshots.at(-1)).toMatchObject({ rows: initial.rows, pending: null, status: null })
    expect(snapshots.at(-1)?.ranking).toMatchObject({ isComplete: false, nextCursor: initial.nextCursor })
    unsubscribe()
    const notificationCount = snapshots.length
    await controller.showMore()
    expect(controller.getSnapshot().rows).toEqual([...initial.rows, ...next.rows])
    expect(snapshots).toHaveLength(notificationCount)
  })
  it('follows each server cursor through a partial page and preserves ties across page boundaries', async () => {
    const { controller, load } = setup()
    const middlePage = habitRankingResponseSchema.parse({
      ...next, rows: [next.rows[0]], isComplete: false, nextCursor: 'signed-page-three',
    })
    const lastPage = habitRankingResponseSchema.parse({ ...next, offset: 3, rows: [next.rows[1]] })
    load.mockResolvedValueOnce(middlePage).mockResolvedValueOnce(lastPage)
    await controller.showMore()
    expect(controller.getSnapshot()).toMatchObject({ rows: [...initial.rows, ...middlePage.rows], status: null })
    expect(controller.getSnapshot().ranking).toMatchObject({ isComplete: false, nextCursor: middlePage.nextCursor })
    await controller.showMore()
    expect(load).toHaveBeenLastCalledWith(middlePage.queryToken, middlePage.nextCursor, false)
    expect(controller.getSnapshot().rows.map(row => [row.habitId, row.rank, row.completedCount])).toEqual(
      [...initial.rows, ...next.rows].map(row => [row.habitId, row.rank, row.completedCount]),
    )
    expect(controller.getSnapshot().ranking).toMatchObject({ isComplete: true, nextCursor: null })
  })
  it('refreshes an empty ranking using the same resolved query without attempting to page it', async () => {
    const empty = habitRankingResponseSchema.parse({ ...initial, rows: [], totalCount: 0, isComplete: true, nextCursor: null })
    const load = vi.fn(async () => initial)
    const controller = createHabitRankingController(empty, { load, open: vi.fn(), isCurrent: () => true, accountGeneration: 0 })
    expect(controller.getSnapshot()).toMatchObject({ rows: [], startsAtBeginning: true, status: null })
    await controller.showMore()
    expect(load).not.toHaveBeenCalled()
    await controller.refresh()
    expect(load).toHaveBeenCalledExactlyOnceWith(empty.queryToken, null, true)
    expect(controller.getSnapshot()).toMatchObject({ rows: initial.rows, status: null, requiresRefresh: false })
  })
  it('restores the beginning and new revision when refreshing an answer that started on a later page', async () => {
    const refreshed = habitRankingResponseSchema.parse({ ...initial, revision: 'revision-two', queryToken: 'renewed-query' })
    const load = vi.fn(async () => refreshed)
    const controller = createHabitRankingController(next, { load, open: vi.fn(), isCurrent: () => true, accountGeneration: 0 })
    expect(controller.getSnapshot()).toMatchObject({ rows: next.rows, startsAtBeginning: false })
    await controller.refresh()
    expect(load).toHaveBeenCalledExactlyOnceWith(next.queryToken, null, true)
    expect(controller.getSnapshot()).toMatchObject({ ranking: refreshed, rows: initial.rows, startsAtBeginning: true })
    load.mockResolvedValueOnce({ ...next, revision: refreshed.revision, queryToken: refreshed.queryToken })
    await controller.showMore()
    expect(load).toHaveBeenLastCalledWith(refreshed.queryToken, refreshed.nextCursor, false)
    expect(controller.getSnapshot().rows).toEqual([...initial.rows, ...next.rows])
  })
  it('restores only the same answer in the same account after unmounting', async () => {
    const dependencies = { load: vi.fn(async () => next), open: vi.fn(async () => {}), isCurrent: () => true, accountGeneration: 3 }
    const answer = habitRankingResponseSchema.parse(initial)
    const first = createHabitRankingController(answer, dependencies)
    await first.showMore()
    first.cancel()
    expect(createHabitRankingController(answer, dependencies).getSnapshot().rows).toHaveLength(4)
    expect(createHabitRankingController(habitRankingResponseSchema.parse(initial), dependencies).getSnapshot().rows).toHaveLength(2)
    expect(createHabitRankingController(answer, { ...dependencies, accountGeneration: 4 }).getSnapshot().rows).toHaveLength(2)
  })
  it('appends server ranks and ties, ignores repeated presses and stops at completion', async () => {
    const { controller, load } = setup()
    await Promise.all([controller.showMore(), controller.showMore()])
    expect(load).toHaveBeenCalledExactlyOnceWith(initial.queryToken, initial.nextCursor, false)
    expect(controller.getSnapshot().rows.map(row => [row.rank, row.completedCount])).toEqual([[1, 1200], [2, 20], [3, 20], [4, 1]])
    await controller.showMore()
    expect(load).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().ranking.isComplete).toBe(true)
  })
  it.each([
    { ...next, queryId: 'other-query' }, { ...next, revision: 'changed' },
    { ...next, offset: 1 }, { ...next, nextCursor: initial.nextCursor },
    { ...next, rows: [{ ...next.rows[0]!, habitId: initial.rows[0]!.habitId }, next.rows[1]!] },
  ])('keeps earlier rows and offers refresh for an inconsistent page', async page => {
    const { controller, load } = setup()
    load.mockResolvedValue(page)
    await controller.showMore()
    expect(controller.getSnapshot()).toMatchObject({ rows: initial.rows, status: 'stale', pending: null })
  })
  it.each([400, 409, 410])('recovers an expired or stale page (%s) with the original signed query', async status => {
    const { controller, load } = setup()
    load.mockRejectedValueOnce(new ApiClientError(status, 'Unavailable')).mockResolvedValueOnce(initial)
    await controller.showMore()
    await controller.showMore()
    expect(load).toHaveBeenCalledTimes(1)
    await controller.refresh()
    expect(load).toHaveBeenLastCalledWith(initial.queryToken, null, true)
    expect(controller.getSnapshot()).toMatchObject({ ranking: initial, rows: initial.rows, status: null })
  })
  it('preserves all rows on failed refresh and rejects a changed refresh window', async () => {
    const { controller, load } = setup()
    await controller.showMore()
    load.mockRejectedValueOnce(new TypeError('Offline'))
    await controller.refresh()
    expect(controller.getSnapshot()).toMatchObject({ rows: [...initial.rows, ...next.rows], status: 'refreshFailed' })
    load.mockResolvedValue({ ...initial, query: { ...initial.query, dateFrom: '2026-08-01' } })
    await controller.refresh()
    expect(controller.getSnapshot().status).toBe('stale')
    expect(controller.getSnapshot().rows).toHaveLength(4)
  })
  it('keeps a stale cursor blocked when its recovery refresh fails', async () => {
    const { controller, load } = setup()
    load.mockRejectedValueOnce(new ApiClientError(409, 'Stale')).mockRejectedValueOnce(new TypeError('Offline'))
    await controller.showMore()
    await controller.refresh()
    await controller.showMore()
    expect(load).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().rows).toEqual(initial.rows)
  })
  it('keeps the page cursor after an offline request so retry can append the same page', async () => {
    const { controller, load } = setup()
    load.mockRejectedValueOnce(new TypeError('Offline'))
    await controller.showMore()
    expect(controller.getSnapshot()).toMatchObject({ rows: initial.rows, status: 'pageFailed' })
    await controller.showMore()
    expect(controller.getSnapshot().rows).toHaveLength(4)
    expect(load.mock.calls[0]).toEqual(load.mock.calls[1])
  })
  it('ignores late responses and hides old rows after account replacement', async () => {
    const { controller, load, isCurrent } = setup()
    let resolvePage: (page: typeof next) => void = () => {}
    load.mockImplementation(() => new Promise(resolve => { resolvePage = resolve }))
    const pending = controller.showMore()
    isCurrent.mockReturnValue(false)
    controller.invalidate()
    resolvePage(next)
    await pending
    expect(controller.getSnapshot()).toMatchObject({ active: false, rows: [], pending: null })
    await controller.refresh()
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('opens the actual habit and keeps query scope, with recovery for a removed target', async () => {
    const { controller, open } = setup()
    await controller.open(initial.rows[0]!.habitId)
    expect(open).toHaveBeenCalledWith(initial.rows[0]!.habitId)
    expect(controller.getSnapshot().ranking.query).toEqual(initial.query)
    open.mockRejectedValueOnce(new ApiClientError(404, 'Removed'))
    await controller.open(initial.rows[1]!.habitId)
    expect(controller.getSnapshot().status).toBe('removed')
  })
  it('retains a readable ranking when habit navigation fails and permits retry', async () => {
    const { controller, open } = setup()
    open.mockRejectedValueOnce(new TypeError('Offline'))
    await controller.open(initial.rows[0]!.habitId)
    expect(controller.getSnapshot()).toMatchObject({ rows: initial.rows, status: 'openFailed', pending: null, requiresRefresh: false })
    await controller.open(initial.rows[0]!.habitId)
    expect(open).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().ranking.query).toEqual(initial.query)
  })
})
