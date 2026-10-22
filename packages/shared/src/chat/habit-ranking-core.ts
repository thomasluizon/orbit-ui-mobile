import type { HabitRankingResponse } from '../types/habit-ranking'
import { ApiClientError } from '../utils/error-utils'
import { formatAPIDate, parseAPIDate } from '../utils/dates'
import { formatLocaleDate } from '../utils/locale-format'

export type RankingAction = 'page' | 'refresh' | 'open'
export type RankingStatus = 'stale' | 'pageFailed' | 'refreshFailed' | 'removed' | 'openFailed' | null
export interface HabitRankingState {
  ranking: HabitRankingResponse
  rows: HabitRankingResponse['rows']
  pending: RankingAction | null
  status: RankingStatus
  active: boolean
  startsAtBeginning: boolean
}

export interface HabitRankingDependencies {
  load: (queryToken: string, cursor: string | null, refresh: boolean) => Promise<HabitRankingResponse>
  open: (habitId: string) => Promise<void>
  isCurrent: () => boolean
}

export interface HabitRankingController {
  getSnapshot: () => HabitRankingState
  subscribe: (listener: () => void) => () => void
  showMore: () => Promise<void>
  refresh: () => Promise<void>
  open: (habitId: string) => Promise<void>
  invalidate: () => void
  cancel: () => void
}

export function formatHabitRankingPeriod(query: HabitRankingResponse['query'], locale: string): { from: string; through: string } {
  const through = parseAPIDate(query.dateToExclusive)
  through.setDate(through.getDate() - 1)
  const options = { year: 'numeric', month: 'short', day: 'numeric' } as const
  return {
    from: formatLocaleDate(query.dateFrom, locale, options),
    through: formatLocaleDate(formatAPIDate(through), locale, options),
  }
}

function appendRankingPage(state: HabitRankingState, page: HabitRankingResponse): HabitRankingState {
  const previous = state.ranking
  if (page.queryId !== previous.queryId || page.revision !== previous.revision
    || JSON.stringify(page.query) !== JSON.stringify(previous.query)
    || page.totalCount !== previous.totalCount
    || page.offset !== previous.offset + previous.rows.length
    || page.nextCursor === previous.nextCursor) {
    throw new ApiClientError(409, 'Ranking page no longer matches the answer')
  }
  const ids = new Set(state.rows.map(row => row.habitId))
  if (page.rows.some(row => ids.has(row.habitId))) throw new ApiClientError(409, 'Ranking rows overlap')
  return { ...state, ranking: page, rows: [...state.rows, ...page.rows], status: null }
}

function rankingFailure(error: unknown, action: RankingAction): RankingStatus {
  if (error instanceof ApiClientError) {
    if (action === 'open' && (error.status === 404 || error.status === 410)) return 'removed'
    if (action !== 'open' && [400, 409, 410].includes(error.status)) return 'stale'
  }
  return action === 'open' ? 'openFailed' : action === 'refresh' ? 'refreshFailed' : 'pageFailed'
}

export function createHabitRankingController(initial: HabitRankingResponse, dependencies: HabitRankingDependencies): HabitRankingController {
  let state: HabitRankingState = {
    ranking: initial, rows: initial.rows, pending: null, status: null,
    active: true, startsAtBeginning: initial.offset === 0,
  }
  let requestVersion = 0
  const listeners = new Set<() => void>()
  function publish(next: HabitRankingState) {
    state = next
    listeners.forEach(listener => listener())
  }
  async function loadRanking(action: RankingAction) {
    const page = await dependencies.load(state.ranking.queryToken, action === 'page' ? state.ranking.nextCursor : null, action === 'refresh')
    if (action === 'page') return appendRankingPage(state, page)
    if (page.queryId !== initial.queryId || JSON.stringify(page.query) !== JSON.stringify(initial.query) || page.offset !== 0) {
      throw new ApiClientError(409, 'Refresh changed the resolved query')
    }
    return { ...state, ranking: page, rows: page.rows, startsAtBeginning: true, status: null }
  }
  async function perform(action: RankingAction, habitId?: string) {
    if (!state.active || state.pending || !dependencies.isCurrent()) return
    if (action === 'page' && (!state.ranking.nextCursor || state.status === 'stale' || state.status === 'removed')) return
    const version = ++requestVersion
    const current = () => version === requestVersion && state.active && dependencies.isCurrent()
    publish({ ...state, pending: action })
    try {
      if (action === 'open' && habitId) await dependencies.open(habitId)
      else {
        const next = await loadRanking(action)
        if (current()) publish(next)
      }
    } catch (error) {
      if (current()) publish({ ...state, status: rankingFailure(error, action) })
    } finally {
      if (current()) publish({ ...state, pending: null })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    showMore: () => perform('page'),
    refresh: () => perform('refresh'),
    open: (habitId: string) => perform('open', habitId),
    invalidate: () => { requestVersion++; publish({ ...state, rows: [], active: false, pending: null }) },
    cancel: () => { requestVersion++ },
  }
}
