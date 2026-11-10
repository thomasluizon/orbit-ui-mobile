import { describe, expect, it } from 'vitest'
import { calendarSlideMotion, resolveCalendarSlide } from '../utils/calendar-slide-motion'
import { motionDurations, motionEasings, motionLayerTiming } from '../theme/motion'

describe('calendar slide motion', () => {
  it('travels the route token distance for the route token duration', () => {
    expect(calendarSlideMotion).toEqual({
      distance: motionLayerTiming.routeShift,
      duration: motionDurations.route,
      easing: motionEasings.enter,
    })
    expect(calendarSlideMotion.distance).toBe(12)
    expect(calendarSlideMotion.duration).toBe(220)
  })

  it('starts a step from the side the new period comes from', () => {
    expect(resolveCalendarSlide('right', 0, false)?.from).toBe(12)
    expect(resolveCalendarSlide('left', 0, false)?.from).toBe(-12)
  })

  it('retargets from the live offset instead of restarting a step in flight', () => {
    expect(resolveCalendarSlide('right', 5, false)?.from).toBe(5)
    expect(resolveCalendarSlide('right', -7, false)?.from).toBe(-7)
  })

  it('does not slide under reduced motion or without a direction', () => {
    expect(resolveCalendarSlide('right', 0, true)).toBeNull()
    expect(resolveCalendarSlide('left', 5, true)).toBeNull()
    expect(resolveCalendarSlide(null, 0, false)).toBeNull()
  })
})
