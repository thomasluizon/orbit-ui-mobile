import { describe, expect, it, vi } from 'vitest'
import { buildCalendarHeaderState, calendarDayLoadingLabel, calendarStatState, resolveCalendarProfileSettings } from '../utils/calendar-navigation'
import { createMockProfile } from './factories'

const makeInput = () => ({
  view: 'month' as const,
  selectedDay: '2026-04-07', todayKey: '2026-04-08', weekStart: new Date(2026, 3, 6), weekStartsOn: 1 as const,
  rangeOffset: -1, agendaOffset: -1, weekLabel: 'Week', rangeLabel: 'Range',
  agendaStart: new Date(2026, 2, 30), agendaEnd: new Date(2026, 3, 5), locale: 'en',
  translate: (key: string, values?: { start: string; end: string }) => values ? `${values.start} to ${values.end}` : key,
  prevWeek: vi.fn(), nextWeek: vi.fn(), goToCurrentWeek: vi.fn(), previousRange: vi.fn(), nextRange: vi.fn(),
  setRangeOffset: vi.fn(), setAgendaOffset: vi.fn<(offset: number | ((previous: number) => number)) => void>(),
})

describe('calendar navigation', () => {
  it('uses the selected day rather than the displayed month for the month return state', () => {
    const input = makeInput()
    expect(buildCalendarHeaderState(input)).toEqual({ isTodaySelected: false })
    expect(buildCalendarHeaderState({ ...input, selectedDay: input.todayKey })).toEqual({ isTodaySelected: true })
  })

  it.each([0, 1] as const)('recognizes the current week with week start %s', (weekStartsOn) => {
    const input = { ...makeInput(), view: 'week' as const, weekStartsOn }
    expect(buildCalendarHeaderState({ ...input, weekStart: new Date(2026, 3, weekStartsOn === 0 ? 5 : 6) }).isTodaySelected).toBe(true)
    const state = buildCalendarHeaderState({ ...input, weekStart: new Date(2026, 2, 30) })
    expect(state.isTodaySelected).toBe(false)
    expect(state.period).toMatchObject({ view: 'week', label: 'Week', previousLabel: 'common.previousWeek', nextLabel: 'common.nextWeek' })
    state.period?.onPrevious(); state.period?.onNext(); state.period?.onCurrent()
    expect(input.prevWeek).toHaveBeenCalledOnce()
    expect(input.nextWeek).toHaveBeenCalledOnce()
    expect(input.goToCurrentWeek).toHaveBeenCalledOnce()
  })

  it('disables the next range only at the current range and resets through its label', () => {
    const input = { ...makeInput(), view: 'range' as const }
    const state = buildCalendarHeaderState(input)
    expect(state).toMatchObject({ isTodaySelected: false, period: { nextDisabled: false, label: 'Range', previousLabel: 'calendar.range.previous', nextLabel: 'calendar.range.next' } })
    state.period?.onPrevious(); state.period?.onNext(); state.period?.onCurrent()
    expect(input.previousRange).toHaveBeenCalledOnce()
    expect(input.nextRange).toHaveBeenCalledOnce()
    expect(input.setRangeOffset).toHaveBeenCalledWith(0)
    expect(buildCalendarHeaderState({ ...input, rangeOffset: 0 })).toMatchObject({ isTodaySelected: true, period: { nextDisabled: true } })
  })

  it.each(['en', 'pt-BR'])('formats and pages Agenda independently of its selected day in %s', (locale) => {
    const input = { ...makeInput(), view: 'agenda' as const, locale }
    const state = buildCalendarHeaderState(input)
    expect(state.isTodaySelected).toBe(false)
    expect(state.period?.label).toBe(locale === 'en' ? 'Mar 30 to Apr 5' : '30 mar to 5 abr')
    state.period?.onPrevious(); state.period?.onNext(); state.period?.onCurrent()
    const [previous, next, current] = input.setAgendaOffset.mock.calls.map(([offset]) => typeof offset === 'function' ? offset(-1) : offset)
    expect([previous, next, current]).toEqual([-2, 0, 0])
    expect(buildCalendarHeaderState({ ...input, agendaOffset: 0 }).isTodaySelected).toBe(true)
  })

  it('keeps the loading label and statistic states aligned', () => {
    for (const state of ['loading', 'ready', 'empty', 'future'] as const) {
      expect(calendarDayLoadingLabel(state, 'Loading')).toBe(state === 'loading' ? 'Loading' : undefined)
      expect(calendarStatState(state)).toBe(state === 'loading' ? 'loading' : state === 'ready' ? 'default' : 'empty')
    }
  })

  it('resolves profile readiness and sync settings', () => {
    expect(resolveCalendarProfileSettings(undefined)).toEqual({ weekStartsOn: 1, hasProAccess: false, timeZone: null, autoSyncState: undefined })
    const profile = createMockProfile({ weekStartDay: 0, timeZone: 'America/Sao_Paulo', hasProAccess: true, hasGoogleConnection: true, googleCalendarAutoSyncEnabled: true })
    expect(resolveCalendarProfileSettings(profile)).toEqual({ weekStartsOn: 0, hasProAccess: true, timeZone: 'America/Sao_Paulo', autoSyncState: {
      enabled: true, hasGoogleConnection: true, status: profile.googleCalendarAutoSyncStatus, lastSyncedAt: profile.googleCalendarLastSyncedAt,
    } })
  })
})
