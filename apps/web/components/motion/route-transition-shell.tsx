'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
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

const PRIMARY_DESTINATIONS = new Set(['/', '/calendar', '/progress', '/profile'])

export function RouteTransitionShell({
  children,
  className,
}: Readonly<RouteTransitionShellProps>) {
  const pathname = usePathname()
  const prefersReducedMotion = useReducedMotion()
  const routeIntent = useRouteTransitionIntent()
  const previousPathnameRef = useRef(pathname)
  const isPrimaryTabSwitch =
    routeIntent.intent === 'neutral' && PRIMARY_DESTINATIONS.has(pathname)

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }

    previousPathnameRef.current = pathname
    const timer = globalThis.setTimeout(() => {
      resetRouteTransitionIntent()
    }, 0)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [pathname])

  const motionPreset = useMemo(
    () => resolveMotionPreset(
      getRouteScenarioForIntent(isPrimaryTabSwitch ? 'tab' : routeIntent.intent),
      Boolean(prefersReducedMotion),
    ),
    [isPrimaryTabSwitch, prefersReducedMotion, routeIntent.intent],
  )
  const direction = getRouteDirectionForIntent(isPrimaryTabSwitch ? 'tab' : routeIntent.intent)
  let enterX = 0
  if (direction > 0) {
    enterX = motionPreset.shift
  } else if (direction < 0) {
    enterX = -motionPreset.shift
  }
  let exitX = 0
  if (direction > 0) {
    exitX = -motionPreset.shift
  } else if (direction < 0) {
    exitX = motionPreset.shift
  }

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={pathname}
          className={className}
          initial={{
            opacity: isPrimaryTabSwitch ? 1 : 0,
            x: enterX,
          }}
          animate={{
            opacity: 1,
            x: 0,
            transition: {
              duration: motionPreset.enterDuration / 1000,
              ease: motionPreset.enterEasing,
            },
          }}
          exit={{
            opacity: isPrimaryTabSwitch ? 1 : 0,
            x: exitX,
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
