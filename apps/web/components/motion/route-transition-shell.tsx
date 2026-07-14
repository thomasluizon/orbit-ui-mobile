'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  useReducedMotion,
} from 'motion/react'
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
  let enterX = 0
  if (direction > 0) {
    enterX = motionPreset.shift
  } else if (direction < 0) {
    enterX = -motionPreset.shift
  }
  let exitX = 0
  if (direction > 0) {
    exitX = -Math.round(motionPreset.shift * 0.55)
  } else if (direction < 0) {
    exitX = Math.round(motionPreset.shift * 0.55)
  }

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={pathname}
          className={className}
          style={{ transformOrigin: 'center bottom' }}
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
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  )
}
