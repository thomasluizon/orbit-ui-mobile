import { motionDurations, motionEasings, motionLayerTiming, type MotionBezier } from '../theme/motion'

export type CalendarSlideDirection = 'left' | 'right'

export const calendarSlideMotion = {
  distance: motionLayerTiming.routeShift,
  duration: motionDurations.route,
  easing: motionEasings.enter,
  /** Offset in px at or below which the content looks at rest: the `motion` spring `restDelta` default for a px value. */
  restDisplacementThreshold: 0.5,
} as const

interface CalendarSlide {
  readonly from: number
  readonly duration: number
  readonly easing: MotionBezier
}

/**
 * Resolves the slide for one month or week step. `liveOffset` is the offset the content shows now:
 * a step still visibly in flight keeps it, so a repeated tap retargets from where the content is.
 * An offset at or below `restDisplacementThreshold` looks at rest, so the new period slides in fresh.
 * Returns null when the new period appears at once: no direction, or reduced motion.
 */
export function resolveCalendarSlide(
  direction: CalendarSlideDirection | null,
  liveOffset: number,
  reducedMotion: boolean,
): CalendarSlide | null {
  if (direction === null || reducedMotion) return null
  const restingStart = direction === 'right' ? calendarSlideMotion.distance : -calendarSlideMotion.distance
  const atRest = Math.abs(liveOffset) <= calendarSlideMotion.restDisplacementThreshold
  return {
    from: atRest ? restingStart : liveOffset,
    duration: calendarSlideMotion.duration,
    easing: calendarSlideMotion.easing,
  }
}
