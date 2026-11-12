'use client'

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type TouchEventHandler } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { calendarSlideMotion, resolveCalendarSlide, type CalendarSlideDirection } from '@orbit/shared/utils'
import { useViewportMatch } from '@/hooks/use-viewport-match'

const { distance } = calendarSlideMotion

interface CalendarSlideProps {
  direction: CalendarSlideDirection | null
  /** Identity of the shown month or week. A change starts one slide. */
  stepKey: string
  className?: string
  style?: CSSProperties
  onTouchStart?: TouchEventHandler<HTMLDivElement>
  onTouchEnd?: TouchEventHandler<HTMLDivElement>
  children: ReactNode
}

/** Slides the shown month or week in from the step direction, and retargets a step in flight. */
export function CalendarSlide({ direction, stepKey, className, style, onTouchStart, onTouchEnd, children }: Readonly<CalendarSlideProps>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const offset = useMotionValue(0)
  const opacity = useTransform(offset, [-distance, 0, distance], [0, 1, 0])
  const shownKey = useRef(stepKey)

  useLayoutEffect(() => {
    if (shownKey.current === stepKey) return
    shownKey.current = stepKey
    const slide = resolveCalendarSlide(direction, offset.get(), reduced)
    if (!slide) {
      offset.stop()
      offset.set(0)
      return
    }
    offset.set(slide.from)
    animate(offset, 0, { duration: slide.duration / 1000, ease: slide.easing })
  }, [direction, offset, reduced, stepKey])

  useLayoutEffect(() => {
    if (!reduced) return
    offset.stop()
    offset.set(0)
  }, [offset, reduced])

  useLayoutEffect(() => () => offset.stop(), [offset])

  return (
    <motion.div className={className} style={{ ...style, x: offset, opacity }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </motion.div>
  )
}
