'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  domMax,
  LazyMotion,
  m,
  type Variants,
  useReducedMotion,
} from 'motion/react'
import {
  resolveMotionPreset,
  type MotionNavigationIntent,
} from '@orbit/shared/theme'
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

type RouteTransitionMotion = Readonly<{
  direction: -1 | 0 | 1
  isPrimaryTabSwitch: boolean
  motionPreset: ReturnType<typeof resolveMotionPreset>
}>

interface RoutePathState {
  current: string
  hasNavigated: boolean
  intent: MotionNavigationIntent
  previous: string
}

const routeVariants: Variants = {
  initial: ({ direction, isPrimaryTabSwitch, motionPreset }: RouteTransitionMotion) => ({
    opacity: isPrimaryTabSwitch ? 1 : 0,
    x: direction * motionPreset.shift,
  }),
  animate: ({ motionPreset }: RouteTransitionMotion) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: motionPreset.enterDuration / 1000,
      ease: motionPreset.enterEasing,
    },
  }),
}

export function RouteTransitionShell({
  children,
  className,
}: Readonly<RouteTransitionShellProps>) {
  const pathname = usePathname()
  const prefersReducedMotion = useReducedMotion()
  const routeIntent = useRouteTransitionIntent()
  const committedPathnameRef = useRef(pathname)
  const [routePaths, setRoutePaths] = useState<RoutePathState>(() => ({
    current: pathname,
    hasNavigated: false,
    intent: routeIntent.intent,
    previous: pathname,
  }))
  if (routePaths.current !== pathname) {
    setRoutePaths({
      current: pathname,
      hasNavigated: true,
      intent: routeIntent.intent,
      previous: routePaths.current,
    })
  }
  const isPrimaryTabSwitch =
    routePaths.previous !== pathname &&
    PRIMARY_DESTINATIONS.has(routePaths.previous) &&
    PRIMARY_DESTINATIONS.has(pathname)

  useEffect(() => {
    if (committedPathnameRef.current === pathname) {
      return
    }

    committedPathnameRef.current = pathname
    const timer = globalThis.setTimeout(() => {
      resetRouteTransitionIntent()
    }, 0)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [pathname])

  const transitionMotion = useMemo<RouteTransitionMotion>(
    () => {
      const transitionIntent = isPrimaryTabSwitch ? 'tab' : routePaths.intent
      return {
        direction: getRouteDirectionForIntent(transitionIntent),
        isPrimaryTabSwitch,
        motionPreset: resolveMotionPreset(
          getRouteScenarioForIntent(transitionIntent),
          Boolean(prefersReducedMotion),
        ),
      }
    },
    [isPrimaryTabSwitch, prefersReducedMotion, routePaths.intent],
  )

  return (
    <LazyMotion features={domMax}>
      <m.div
        key={pathname}
        className={className}
        custom={transitionMotion}
        variants={routeVariants}
        initial={routePaths.hasNavigated ? 'initial' : false}
        animate="animate"
      >
        {children}
      </m.div>
    </LazyMotion>
  )
}
