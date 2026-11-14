import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { motionDurations, motionLayerTiming } from '@orbit/shared/theme'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { DayCell } from '@/components/dates/day-cell'
import { CheckRow } from '@/components/ui/check-row'
import { CalendarViewRouter } from '@/app/(app)/calendar/_components/calendar-view-router'
import type { CalendarScreenState } from '@/app/(app)/calendar/_components/use-calendar-screen-state'

const state = vi.hoisted(() => ({ reducedMotion: false, guided: true, push: vi.fn() }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => state.guided }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }), usePathname: () => '/calendar', useSearchParams: () => new URLSearchParams('view=month') }))
vi.mock('@/components/calendar/calendar-grid', () => ({ CalendarGrid: () => <div data-testid="grid" /> }))
vi.mock('@/components/calendar/calendar-slide', () => ({ CalendarSlide: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/calendar/calendar-day-detail', () => ({ CalendarDayDetail: ({ dateStr }: { dateStr: string }) => <section data-testid="day-card">{dateStr}</section> }))
vi.mock('@/components/calendar/calendar-stats', () => ({ CalendarStats: () => <div data-testid="stats" /> }))
vi.mock('@/components/calendar/calendar-week-view', () => ({ CalendarWeekView: () => <div data-testid="week" /> }))

const words: DayCellWords = { none: 'none', partial: 'partial', full: 'full', notScheduled: 'rest', of: 'of', today: 'today', readOnly: 'read only' }

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && state.reducedMotion, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })),
  })
}

const animate = vi.fn(() => ({ cancel: vi.fn() }))
beforeEach(() => {
  state.reducedMotion = false
  state.guided = true
  state.push.mockReset()
  stubMatchMedia()
  animate.mockClear()
  HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate']
})
afterEach(() => { Reflect.deleteProperty(HTMLElement.prototype, 'animate') })

describe('the cell arc after a log', () => {
  it('draws done over scheduled with stroke-dashoffset and sweeps on the slow duration', () => {
    const { container, rerender } = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={1} />)
    const arc = container.querySelector<SVGCircleElement>('[data-day-arc]')!
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(100 * (1 - 1 / 3))
    expect(arc.style.transition).toContain(`${motionDurations.slow}ms`)
    rerender(<DayCell day={13} label="November 13" words={words} scheduled={3} done={2} />)
    expect(container.querySelector('[data-day-arc]')).toBe(arc)
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(100 * (1 - 2 / 3))
  })

  it('draws the new share at once under reduced motion', () => {
    state.reducedMotion = true
    stubMatchMedia()
    const { container } = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={1} />)
    expect(container.querySelector<SVGCircleElement>('[data-day-arc]')!.style.transition).toBe('')
  })

  it('turns a full day into the neutral disc with no happy Orbit', () => {
    const { container, rerender } = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={2} />)
    rerender(<DayCell day={13} label="November 13" words={words} scheduled={3} done={3} />)
    const disc = container.querySelector<HTMLElement>('[data-day-disc]')!
    expect(container.querySelector('[data-outcome="full"]')).not.toBeNull()
    expect(disc.style.background).toBe('var(--fg-1)')
    expect(container.querySelector('[data-day-arc]')).toBeNull()
    expect(container.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })
})

describe('the check of the day card', () => {
  const row = (checked: boolean) => <CheckRow variant="calendar-day" textMode="personal" label="Read" checked={checked} onChange={vi.fn()} onOpenLabel={vi.fn()} />

  it('pops on a log and never on the first render', () => {
    const { container, rerender } = render(row(false))
    expect(container.querySelector('[data-check-settle]')).toBeNull()
    rerender(row(true))
    expect(container.querySelector('[data-check-settle]')).not.toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Read' })).toHaveAttribute('aria-checked', 'true')
  })

  it('stays still under reduced motion', () => {
    state.reducedMotion = true
    stubMatchMedia()
    const { container, rerender } = render(row(false))
    rerender(row(true))
    expect(container.querySelector('[data-check-settle]')).toBeNull()
  })
})

function monthState(overrides: Partial<CalendarScreenState>): CalendarScreenState {
  return {
    view: 'month', currentMonth: new Date(2026, 10, 1), selectedDay: '2026-11-13', todayKey: '2026-11-13', weekStartsOn: 1, isOnline: true, isWideDesktop: false,
    showCreateRefusal: false, setShowCreateRefusal: vi.fn(), openHabitCreation: vi.fn(), openImport: vi.fn(), showRecurring: true, showEventSource: false,
    calendarEventsState: 'idle', refetchCalendarEvents: vi.fn(), openOrbitPro: vi.fn(), isLoading: false, displayMonthDayMap: new Map(), openDay: vi.fn(),
    monthDayEntries: [], selectedCalendarEvents: [], selectedDayLoggable: true, pendingEntryStates: new Map(), changeSelectedEntry: vi.fn(),
    monthDisplayState: 'ready', monthStatTiles: [], monthSlide: null, handleTouchStart: vi.fn(), handleTouchEnd: vi.fn(), ...overrides,
  } as unknown as CalendarScreenState
}

describe('the month view with the guided flows on', () => {
  it('cross-fades the day card on the base duration when the person selects a day', () => {
    const { rerender } = render(<CalendarViewRouter state={monthState({})} />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<CalendarViewRouter state={monthState({ selectedDay: '2026-11-12' })} />)
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: motionDurations.base }))
  })

  it('shows the day card at once under reduced motion', () => {
    state.reducedMotion = true
    stubMatchMedia()
    const { rerender } = render(<CalendarViewRouter state={monthState({})} />)
    rerender(<CalendarViewRouter state={monthState({ selectedDay: '2026-11-12' })} />)
    expect(animate).not.toHaveBeenCalled()
  })

  it('keeps the create action of an empty month under the line and opens the create flow on the selected day', () => {
    render(<CalendarViewRouter state={monthState({ monthDisplayState: 'empty', selectedDay: '2026-11-01' })} />)
    expect(screen.queryByText('calendar.emptyMonth')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'habits.createHabit' }))
    expect(state.push).toHaveBeenCalledWith('/habits/new?date=2026-11-01&from=%2Fcalendar%3Fview%3Dmonth')
  })

  it('refuses the offline create under the action', () => {
    const setShowCreateRefusal = vi.fn()
    const { rerender } = render(<CalendarViewRouter state={monthState({ monthDisplayState: 'empty', isOnline: false, setShowCreateRefusal })} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.createHabit' }))
    expect(setShowCreateRefusal).toHaveBeenCalledWith(true)
    expect(state.push).not.toHaveBeenCalled()
    rerender(<CalendarViewRouter state={monthState({ monthDisplayState: 'empty', isOnline: false, showCreateRefusal: true })} />)
    expect(screen.getByText('offline.create.reason')).toBeInTheDocument()
  })

  it('moves the future month sentence into the line and offers no create action', () => {
    render(<CalendarViewRouter state={monthState({ monthDisplayState: 'future' })} />)
    expect(screen.queryByTestId('calendar-month-empty')).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.createHabit' })).toBeNull()
  })

  it('keeps the current month feedback with the guided flows off', () => {
    state.guided = false
    const openHabitCreation = vi.fn()
    render(<CalendarViewRouter state={monthState({ monthDisplayState: 'empty', openHabitCreation })} />)
    expect(screen.getByText('calendar.emptyMonth')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.createHabit' }))
    expect(openHabitCreation).toHaveBeenCalledTimes(1)
  })
})

describe('the view switch', () => {
  it('enters the chosen view on the tab-switch preset, shifted toward its segment', () => {
    const { rerender } = render(<CalendarViewRouter state={monthState({})} />)
    rerender(<CalendarViewRouter state={monthState({ view: 'week' })} />)
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0, transform: `translateX(${motionLayerTiming.tabShift}px)` }, { opacity: 1, transform: 'translateX(0)' }],
      expect.objectContaining({ duration: motionDurations.fast }),
    )
    expect(screen.getByTestId('week')).toBeInTheDocument()
  })

  it('swaps the view at once under reduced motion', () => {
    state.reducedMotion = true
    stubMatchMedia()
    const { rerender } = render(<CalendarViewRouter state={monthState({})} />)
    rerender(<CalendarViewRouter state={monthState({ view: 'week' })} />)
    expect(animate).not.toHaveBeenCalled()
  })
})

describe('the Calendário motion with the guided flows off', () => {
  beforeEach(() => { state.guided = false })

  it('draws the new arc share with no sweep', () => {
    const { container, rerender } = render(<DayCell day={13} label="November 13" words={words} scheduled={3} done={1} />)
    rerender(<DayCell day={13} label="November 13" words={words} scheduled={3} done={2} />)
    const arc = container.querySelector<SVGCircleElement>('[data-day-arc]')!
    expect(arc.style.transition).toBe('')
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(100 * (1 - 2 / 3))
  })

  it('keeps the check of the day card still on a log', () => {
    const row = (checked: boolean) => <CheckRow variant="calendar-day" textMode="personal" label="Read" checked={checked} onChange={vi.fn()} onOpenLabel={vi.fn()} />
    const { container, rerender } = render(row(false))
    rerender(row(true))
    expect(container.querySelector('[data-check-settle]')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Read' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows a new day card and a switched view at once', () => {
    const { rerender } = render(<CalendarViewRouter state={monthState({})} />)
    rerender(<CalendarViewRouter state={monthState({ selectedDay: '2026-11-12' })} />)
    rerender(<CalendarViewRouter state={monthState({ selectedDay: '2026-11-12', view: 'week' })} />)
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByTestId('week')).toBeInTheDocument()
  })
})
