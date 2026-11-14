import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import type { CompletionSeries } from '../types/gamification'
import { createApiClientError } from '../utils/error-utils'
import {
  hasReturnedAfterGap,
  resolveProgressOrbitLine,
  resolveProgressWindowStatus,
  resolveStreakOrbitLine,
  type ProgressOrbitLine,
  type StreakOrbitLine,
} from '../utils/progress-orbit-line'
import { getReturningIntervalBetween } from '../utils/returning-interval'
import type { StreakRepairState } from '../utils/progress'

const catalogs = { en, 'pt-BR': ptBR } as const
const WINDOW_END = '2026-11-13'

function render(locale: keyof typeof catalogs, line: ProgressOrbitLine | StreakOrbitLine): string {
  const source = line.key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogs[locale])
  return String(new IntlMessageFormat(source as string, locale).format(line.values ?? {}))
}

/** A daily 30-day window whose last point is `WINDOW_END`, with the completions given per date. */
function dailySeries(completedOn: Record<string, number>, days = 30): CompletionSeries {
  const end = Date.parse(`${WINDOW_END}T00:00:00Z`)
  return {
    granularity: 'day',
    points: Array.from({ length: days }, (_, index) => {
      const date = new Date(end - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10)
      const completed = completedOn[date] ?? 0
      return { startDate: date, endDate: date, scheduled: date === '2026-11-01' ? 0 : 2, completed, completionRate: completed * 50 }
    }),
  }
}

const steady = dailySeries({ '2026-11-10': 1, '2026-11-11': 2, '2026-11-12': 1, '2026-11-13': 2 })
const metrics = { activeDays: 4, completionSeries: steady }
const payGate = createApiClientError(403, { errorCode: 'PAY_GATE' }, 'Pro')
const noHabits = createApiClientError(400, { errorCode: 'NO_HABITS_FOR_PERIOD' }, 'Empty')
const serverError = createApiClientError(500, { errorCode: 'INTERNAL_SERVER_ERROR' }, 'Server')

describe('resolveProgressWindowStatus', () => {
  it.each([
    [{ isLoading: true, isError: false, error: null }, 'loading'],
    [{ isLoading: false, isError: true, error: payGate }, 'locked'],
    [{ isLoading: false, isError: true, error: noHabits }, 'empty'],
    [{ isLoading: false, isError: true, error: serverError }, 'error'],
    [{ isLoading: false, isError: false, error: null }, 'loading'],
  ] as const)('reads a query as %#', (query, expected) => {
    expect(resolveProgressWindowStatus(query)).toBe(expected)
  })
})

describe('resolveProgressOrbitLine', () => {
  it('states the active days by default, with plural forms in both locales', () => {
    const line = resolveProgressOrbitLine('ready', metrics, null, 'en')!
    expect(line).toEqual({ key: 'progressScreen.orbit.activeDays', values: { days: 4 } })
    expect(render('en', line)).toBe('You showed up on 4 of the last 30 days.')
    expect(render('pt-BR', line)).toBe('Você apareceu em 4 dos últimos 30 dias.')
    const single = resolveProgressOrbitLine('ready', { activeDays: 1, completionSeries: dailySeries({ '2026-11-13': 1 }) }, null, 'en')!
    expect(render('pt-BR', single)).toBe('Você apareceu em 1 dos últimos 30 dias.')
    const none = resolveProgressOrbitLine('ready', { activeDays: 0, completionSeries: dailySeries({}) }, null, 'en')!
    expect(render('en', none)).toBe('Nothing is logged in the last 30 days yet.')
    expect(render('pt-BR', none)).toBe('Ainda não tem registro nos últimos 30 dias.')
  })

  it('states the selected day with Intl formatting in each locale', () => {
    expect(render('en', resolveProgressOrbitLine('ready', metrics, '2026-11-11', 'en')!)).toBe('Wednesday, November 11: 2 of 2.')
    expect(render('pt-BR', resolveProgressOrbitLine('ready', metrics, '2026-11-11', 'pt-BR')!)).toBe('Quarta-feira, 11 de novembro: 2 de 2.')
  })

  it('states an unscheduled selected day without a count', () => {
    expect(render('en', resolveProgressOrbitLine('ready', metrics, '2026-11-01', 'en')!)).toBe('Sunday, November 1: nothing was scheduled.')
    expect(render('pt-BR', resolveProgressOrbitLine('ready', metrics, '2026-11-01', 'pt-BR')!)).toBe('Domingo, 1 de novembro: nada estava agendado.')
  })

  it('returns the default line for a date outside the window', () => {
    expect(resolveProgressOrbitLine('ready', metrics, '2025-01-01', 'en')!.key).toBe('progressScreen.orbit.activeDays')
  })

  it('states the return after a gap, never the gap', () => {
    const returned = { activeDays: 3, completionSeries: dailySeries({ '2026-11-02': 1, '2026-11-03': 1, '2026-11-13': 1 }) }
    const line = resolveProgressOrbitLine('ready', returned, null, 'en')!
    expect(line.key).toBe('progressScreen.orbit.returned')
    expect(render('en', line)).toBe('You are back. We go on from here.')
    expect(render('pt-BR', line)).toBe('Você voltou. Daqui a gente continua.')
  })

  it('states that there is nothing to measure for a window with no habit', () => {
    const line = resolveProgressOrbitLine('empty', null, null, 'en')!
    expect(render('en', line)).toBe('There is nothing to measure yet.')
    expect(render('pt-BR', line)).toBe('Ainda não tem nada para medir.')
  })

  it.each(['locked', 'loading', 'error'] as const)('is absent while the window is %s', (status) => {
    expect(resolveProgressOrbitLine(status, metrics, '2026-11-11', 'en')).toBeNull()
  })

  it('never counts misses in any case and locale', () => {
    const lines = [
      resolveProgressOrbitLine('ready', metrics, null, 'en')!,
      resolveProgressOrbitLine('ready', { activeDays: 0, completionSeries: dailySeries({}) }, null, 'en')!,
      resolveProgressOrbitLine('ready', metrics, '2026-11-11', 'en')!,
      resolveProgressOrbitLine('ready', { activeDays: 2, completionSeries: dailySeries({ '2026-11-01': 1, '2026-11-12': 1 }) }, null, 'en')!,
      resolveProgressOrbitLine('empty', null, null, 'en')!,
    ]
    for (const line of lines) {
      expect(render('en', line)).not.toMatch(/miss|skipp|fail|lost|broke/i)
      expect(render('pt-BR', line)).not.toMatch(/perd|falh|faltou|quebr/i)
    }
  })
})

describe('hasReturnedAfterGap', () => {
  it('uses the gap that makes Hoje show its returning line', () => {
    expect(getReturningIntervalBetween('2026-11-10', WINDOW_END)).toEqual({ kind: 'elapsed', days: 3 })
    expect(hasReturnedAfterGap(dailySeries({ '2026-11-10': 1, '2026-11-13': 1 }))).toBe(true)
    expect(getReturningIntervalBetween('2026-11-11', WINDOW_END)).toBeNull()
    expect(hasReturnedAfterGap(dailySeries({ '2026-11-11': 1, '2026-11-13': 1 }))).toBe(false)
  })

  it('counts a return yesterday, also when today is active as well', () => {
    expect(hasReturnedAfterGap(dailySeries({ '2026-11-05': 1, '2026-11-12': 1 }))).toBe(true)
    expect(hasReturnedAfterGap(dailySeries({ '2026-11-05': 1, '2026-11-12': 1, '2026-11-13': 1 }))).toBe(true)
  })

  it('is not a return when the last activity is older than yesterday', () => {
    expect(hasReturnedAfterGap(dailySeries({ '2026-11-01': 1, '2026-11-11': 1 }))).toBe(false)
  })

  it('is not a return for a window with no earlier activity, such as a new account', () => {
    expect(hasReturnedAfterGap(dailySeries({ '2026-11-13': 1 }))).toBe(false)
  })

  it('is not a return for a weekly window or no window', () => {
    expect(hasReturnedAfterGap({ ...dailySeries({ '2026-11-05': 1, '2026-11-13': 1 }), granularity: 'week' })).toBe(false)
    expect(hasReturnedAfterGap(null)).toBe(false)
  })
})

describe('resolveStreakOrbitLine', () => {
  const quiet: StreakRepairState = { dates: [], count: 0, banked: 2, canRepair: false, showGap: false, gapUnavailable: false, bankFull: false }
  const base = { repair: quiet, currentStreak: 4, banked: 2, ceiling: 3, daysUntilNextFreeze: 3 }

  it('states the streak and the days to the next freeze, with plural forms', () => {
    const line = resolveStreakOrbitLine(base)
    expect(render('en', line)).toBe('4 days in a row. 3 more days for the next freeze.')
    expect(render('pt-BR', line)).toBe('4 dias seguidos. Faltam 3 dias para o próximo congelamento.')
    const single = resolveStreakOrbitLine({ ...base, currentStreak: 1, daysUntilNextFreeze: 1 })
    expect(render('en', single)).toBe('1 day in a row. 1 more day for the next freeze.')
    expect(render('pt-BR', single)).toBe('1 dia seguido. Falta 1 dia para o próximo congelamento.')
  })

  it('states only the streak when the bank is full', () => {
    expect(render('en', resolveStreakOrbitLine({ ...base, banked: 3 }))).toBe('4 days in a row.')
    expect(render('pt-BR', resolveStreakOrbitLine({ ...base, banked: 3, currentStreak: 0 }))).toBe('0 dias seguidos.')
  })

  it('says the gap sentence that exists in the gap state', () => {
    const line = resolveStreakOrbitLine({ ...base, repair: { ...quiet, showGap: true, canRepair: true, count: 2, dates: ['2026-11-11', '2026-11-12'] } })
    expect(line).toEqual({ key: 'progressScreen.streak.gapBody', values: { count: 2 } })
    expect(resolveStreakOrbitLine({ ...base, repair: { ...quiet, gapUnavailable: true } }).key).toBe('progressScreen.streak.gapUnavailable')
  })
})
