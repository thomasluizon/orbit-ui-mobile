'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  AnimatePresence,
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
  exit: ({ direction, isPrimaryTabSwitch, motionPreset }: RouteTransitionMotion) => ({
    opacity: isPrimaryTabSwitch ? 1 : 0,
    x: direction === 0 ? 0 : -direction * motionPreset.shift,
    transition: {
      duration: motionPreset.exitDuration / 1000,
      ease: motionPreset.exitEasing,
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
    intent: routeIntent.intent,
    previous: pathname,
  }))
  if (routePaths.current !== pathname) {
    setRoutePaths({
      current: pathname,
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
      <AnimatePresence
        mode="popLayout"
        initial={false}
        custom={transitionMotion}
      >
        <m.div
          key={pathname}
          className={className}
          custom={transitionMotion}
          variants={routeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  )
}
