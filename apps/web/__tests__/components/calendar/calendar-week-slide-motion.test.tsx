import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { enUS } from 'date-fns/locale'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { motionDurations, motionLayerTiming } from '@orbit/shared/theme'
import { calendarSlideMotion } from '@orbit/shared/utils'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'

function weekColumns(firstDay: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 9, firstDay + index)
    return { date, dateStr: `2026-10-${String(firstDay + index).padStart(2, '0')}`, isToday: false, isFuture: false }
  })
}

function week(firstDay: number, slideDirection: 'left' | 'right' | null, isLoading = false) {
  return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><CalendarWeekView columns={weekColumns(firstDay)} dayMap={new Map()} slideDirection={slideDirection} isLoading={isLoading} onSelectDay={vi.fn()}
    displayTime={(time) => time} dateFnsLocale={enUS} allDayLabel="No set time" nowLabel="Now" timeZone="UTC" /></NextIntlClientProvider>
}

function slideElement(container: HTMLElement) {
  return container.firstElementChild as HTMLElement
}

function shownOffset(element: HTMLElement) {
  const match = /translateX\((-?[\d.]+)px\)/.exec(element.style.transform)
  return match ? Number(match[1]) : 0
}

const FRAME_MILLISECONDS = 16

async function pauseFor(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME_MILLISECONDS) {
    await act(async () => { await vi.advanceTimersByTimeAsync(FRAME_MILLISECONDS) })
  }
}

const frame = () => pauseFor(FRAME_MILLISECONDS)

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }))
}

beforeAll(() => { vi.useFakeTimers() })
afterAll(() => { vi.useRealTimers() })
afterEach(() => { vi.unstubAllGlobals() })

describe('Week slide motion', () => {
  it('enters from the shared route distance and settles within the route duration', async () => {
    preferReducedMotion(false)
    const { container, rerender } = render(week(5, null))
    rerender(week(12, 'right'))
    await frame()
    const element = slideElement(container)
    expect(shownOffset(element)).toBeGreaterThan(0)
    expect(shownOffset(element)).toBeLessThanOrEqual(motionLayerTiming.routeShift)
    expect(Number(element.style.opacity)).toBeLessThan(1)
    await pauseFor(motionDurations.route + 120)
    expect(shownOffset(element)).toBe(0)
    expect(Number(element.style.opacity)).toBe(1)
  })

  it('enters from the left for a previous week', async () => {
    preferReducedMotion(false)
    const { container, rerender } = render(week(12, null))
    rerender(week(5, 'left'))
    await frame()
    expect(shownOffset(slideElement(container))).toBeLessThan(0)
  })

  it('retargets a repeated step from the shown offset instead of restarting', async () => {
    preferReducedMotion(false)
    const { container, rerender } = render(week(5, null))
    rerender(week(12, 'right'))
    await pauseFor(3 * FRAME_MILLISECONDS)
    const element = slideElement(container)
    const beforeRepeat = shownOffset(element)
    expect(beforeRepeat).toBeGreaterThan(0)
    expect(beforeRepeat).toBeLessThan(motionLayerTiming.routeShift)
    rerender(week(19, 'right'))
    await frame()
    const afterRepeat = shownOffset(slideElement(container))
    expect(afterRepeat).toBeLessThanOrEqual(beforeRepeat)
    expect(afterRepeat).toBeGreaterThan(0)
  })

  it('starts a fresh slide when a repeated step comes after the content looks at rest', async () => {
    preferReducedMotion(false)
    const { container, rerender } = render(week(5, null))
    rerender(week(12, 'right'))
    await pauseFor(9 * FRAME_MILLISECONDS)
    const beforeRepeat = shownOffset(slideElement(container))
    expect(beforeRepeat).toBeGreaterThan(0)
    expect(beforeRepeat).toBeLessThanOrEqual(calendarSlideMotion.restDisplacementThreshold)
    rerender(week(19, 'right'))
    await frame()
    expect(shownOffset(slideElement(container))).toBeGreaterThan(motionLayerTiming.routeShift / 2)
  })

  it('keeps one slide across the loading skeleton', async () => {
    preferReducedMotion(false)
    const { container, rerender } = render(week(5, null, true))
    rerender(week(12, 'right', true))
    await pauseFor(3 * FRAME_MILLISECONDS)
    const element = slideElement(container)
    const beforeData = shownOffset(element)
    expect(beforeData).toBeGreaterThan(0)
    rerender(week(12, 'right'))
    await frame()
    expect(slideElement(container)).toBe(element)
    const afterData = shownOffset(element)
    expect(afterData).toBeGreaterThan(0)
    expect(afterData).toBeLessThan(beforeData)
  })

  it('shows the new week at once under reduced motion', async () => {
    preferReducedMotion(true)
    const { container, rerender } = render(week(5, null))
    rerender(week(12, 'right'))
    await frame()
    const element = slideElement(container)
    expect(shownOffset(element)).toBe(0)
    expect(Number(element.style.opacity || 1)).toBe(1)
  })

  it('does not slide a jump to the current week', async () => {
    preferReducedMotion(false)
    const { container, rerender } = render(week(12, 'right'))
    rerender(week(5, null))
    await frame()
    expect(shownOffset(slideElement(container))).toBe(0)
  })
})
