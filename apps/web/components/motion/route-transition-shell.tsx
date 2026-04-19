'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import {
  getRouteDirectionForIntent,
  getRouteScenarioForIntent,
  resetRouteTransitionIntent,
  useRouteTransitionIntent,
} from '@/lib/motion/route-intent'

interface RouteTransitionShellProps {
  children: ReactNode
  className?: string
}

export function RouteTransitionShell({
  children,
  className,
}: Readonly<RouteTransitionShellProps>) {
  const pathname = usePathname()
  const prefersReducedMotion = useReducedMotion()
  const routeIntent = useRouteTransitionIntent()
  const [activeIntent, setActiveIntent] = useState(routeIntent.intent)
  const previousPathnameRef = useRef(pathname)

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }

    previousPathnameRef.current = pathname
    setActiveIntent(routeIntent.intent)

    const timer = globalThis.setTimeout(() => {
      resetRouteTransitionIntent()
    }, 0)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [pathname, routeIntent.intent])

  const motionPreset = useMemo(
    () => resolveMotionPreset(getRouteScenarioForIntent(activeIntent), Boolean(prefersReducedMotion)),
    [activeIntent, prefersReducedMotion],
  )
  const direction = getRouteDirectionForIntent(activeIntent)
  const enterX = direction === 0 ? 0 : direction > 0 ? motionPreset.shift : -motionPreset.shift
  const exitX =
    direction === 0
      ? 0
      : direction > 0
        ? -Math.round(motionPreset.shift * 0.55)
        : Math.round(motionPreset.shift * 0.55)

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className={className}
        initial={{
          opacity: 0,
          x: enterX,
          scale: motionPreset.scaleFrom,
        }}
        animate={{
          opacity: 1,
          x: 0,
          scale: motionPreset.scaleTo,
          transition: {
            duration: motionPreset.enterDuration / 1000,
            ease: motionPreset.enterEasing,
          },
        }}
        exit={{
          opacity: 0,
          x: exitX,
          scale: direction === 0 ? 1 : 0.998,
          transition: {
            duration: motionPreset.exitDuration / 1000,
            ease: motionPreset.exitEasing,
          },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
