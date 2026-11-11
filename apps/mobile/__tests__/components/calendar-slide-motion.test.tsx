import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimingCalls } from '@/test-mocks/react-native-reanimated'
import { motionDurations, motionLayerTiming } from '@orbit/shared/theme'
import { buildCalendarMonthModel, type CalendarSlideDirection } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { CalendarGrid } from '@/app/(tabs)/calendar/_components/calendar-grid'
import { CalendarWeekView } from '@/app/(tabs)/calendar/_components/calendar-week-view'

interface RecordedSharedValue { value: number; writes: number[] }

const preference = vi.hoisted(() => ({ reduced: false }))
const sharedValues = vi.hoisted(() => [] as { value: number; writes: number[] }[])
vi.mock('react-native-reanimated', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native-reanimated')>(),
  useSharedValue: (initial: number) => {
    const [shared] = React.useState(() => {
      let current = initial
      const recorded: RecordedSharedValue = {
        get value() { return current },
        set value(next: number) { recorded.writes.push(next); current = next },
        writes: [],
      }
      sharedValues.push(recorded)
      return recorded
    })
    return shared
  },
}))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
vi.mock('@/app/(tabs)/calendar/_components/calendar-time-grid', () => ({ CalendarTimeGrid: () => null }))

const tokens = createTokensV2('purple', 'dark')
const month = buildCalendarMonthModel(new Date(2026, 8, 1), new Map(), 1, '2026-09-11')

type Surface = 'month' | 'week'

function weekColumns(firstDay: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 9, firstDay + index)
    return { date, dateStr: `2026-10-${String(firstDay + index).padStart(2, '0')}`, isToday: false, isFuture: false }
  })
}

function Surface({ surface, step, direction, isLoading = false }: Readonly<{ surface: Surface; step: number; direction: CalendarSlideDirection | null; isLoading?: boolean }>) {
  if (surface === 'month') {
    return <CalendarGrid gridDays={month.gridDays} weekdayHeaders={[]} selectedDay={null} isLoading={isLoading} monthKey={`step-${step}`}
      slideDirection={direction} onSelectDay={vi.fn()} language="en" t={(key) => key} tokens={tokens} todayKey="2026-09-11" />
  }
  return <CalendarWeekView columns={weekColumns(5 + step * 7)} dayMap={new Map()} slideDirection={direction} isLoading={isLoading}
    onSelectDay={vi.fn()} displayTime={(time) => time} language="en" allDayLabel="No set time" nowLabel="Now" timeZone="UTC"
    t={((key: string) => key) as never} tokens={tokens} />
}

async function mount(surface: Surface, isLoading = false) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<Surface surface={surface} step={0} direction={null} isLoading={isLoading} />) })
  return {
    step: (step: number, direction: CalendarSlideDirection | null) => act(() => { tree.update(<Surface surface={surface} step={step} direction={direction} isLoading={isLoading} />) }),
    tree,
  }
}

beforeEach(() => { sharedValues.length = 0; withTimingCalls.length = 0; preference.reduced = false })
afterEach(() => { preference.reduced = false })

describe.each(['month', 'week'] as const)('%s slide motion (mobile)', (surface) => {
  it('enters from the shared route distance on the route duration', async () => {
    const view = await mount(surface)
    await view.step(1, 'right')
    const slide = sharedValues[0]!
    expect(slide.writes).toEqual([motionLayerTiming.routeShift, 0])
    expect(motionLayerTiming.routeShift).toBe(12)
    expect(withTimingCalls).toHaveLength(1)
    expect(withTimingCalls[0]).toMatchObject({ value: 0, config: { duration: motionDurations.route } })
    expect(motionDurations.route).toBe(220)
  })

  it('enters from the left for a previous period', async () => {
    const view = await mount(surface)
    await view.step(1, 'left')
    expect(sharedValues[0]!.writes[0]).toBe(-motionLayerTiming.routeShift)
  })

  it('retargets a repeated step from the shown offset instead of restarting', async () => {
    const view = await mount(surface)
    await view.step(1, 'right')
    const slide = sharedValues[0]!
    slide.value = 5
    slide.writes.length = 0
    await view.step(2, 'right')
    expect(slide.writes).toEqual([5, 0])
    expect(withTimingCalls).toHaveLength(2)
  })

  it('shows the new period at once under reduced motion', async () => {
    preference.reduced = true
    const view = await mount(surface)
    await view.step(1, 'right')
    expect(sharedValues[0]!.writes).not.toContain(motionLayerTiming.routeShift)
    expect(sharedValues[0]!.value).toBe(0)
    expect(withTimingCalls).toHaveLength(0)
  })

  it('does not slide a jump without a direction', async () => {
    const view = await mount(surface)
    await view.step(1, null)
    expect(sharedValues[0]!.value).toBe(0)
    expect(withTimingCalls).toHaveLength(0)
  })

  it('keeps one slide across the loading skeleton', async () => {
    const view = await mount(surface, true)
    await view.step(1, 'right')
    expect(sharedValues).toHaveLength(1)
    expect(sharedValues[0]!.writes[0]).toBe(motionLayerTiming.routeShift)
  })
})
