import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { calendarSlideMotion, getOrbitPageTurns } from '@orbit/shared/utils'
import { TodayDaySlide } from '@/components/today/today-day-slide'

const slide = vi.hoisted(() => ({ reduced: false, animate: vi.fn() }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => slide.reduced }))
vi.mock('motion/react', async (importOriginal) => ({ ...await importOriginal<typeof import('motion/react')>(), animate: slide.animate }))

afterEach(() => { cleanup(); slide.reduced = false; slide.animate.mockReset() })

const day = (dateStr: string, enabled = true) => <TodayDaySlide dateStr={dateStr} enabled={enabled}><p>list</p></TodayDaySlide>

describe('web Hoje day change', () => {
  it('slides the list of the new day with the calendar tokens and turns the ring of Orbit once', () => {
    enableTestFlags('orbit_guided_flows')
    const turns = getOrbitPageTurns()
    const view = render(day('2026-11-14'))
    expect(slide.animate).not.toHaveBeenCalled()
    expect(getOrbitPageTurns()).toBe(turns)
    view.rerender(day('2026-11-15'))
    expect(slide.animate).toHaveBeenCalledOnce()
    expect(slide.animate.mock.calls[0]![2]).toEqual({ duration: calendarSlideMotion.duration / 1000, ease: calendarSlideMotion.easing })
    expect(getOrbitPageTurns()).toBe(turns + 1)
    view.rerender(day('2026-11-13'))
    expect(slide.animate).toHaveBeenCalledTimes(2)
    expect(getOrbitPageTurns()).toBe(turns + 2)
    expect(screen.getByText('list')).toBeInTheDocument()
  })

  it('shows the new day at once under reduced motion', () => {
    enableTestFlags('orbit_guided_flows')
    slide.reduced = true
    const view = render(day('2026-11-14'))
    view.rerender(day('2026-11-15'))
    expect(slide.animate).not.toHaveBeenCalled()
    expect(screen.getByText('list')).toBeInTheDocument()
  })

  it('adds no slide and no turn with the flag off, or outside the Today view', () => {
    const turns = getOrbitPageTurns()
    const off = render(day('2026-11-14'))
    off.rerender(day('2026-11-15'))
    off.unmount()
    enableTestFlags('orbit_guided_flows')
    const other = render(day('2026-11-14', false))
    other.rerender(day('2026-11-15', false))
    expect(slide.animate).not.toHaveBeenCalled()
    expect(getOrbitPageTurns()).toBe(turns)
  })
})
