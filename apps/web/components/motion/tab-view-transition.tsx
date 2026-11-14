'use client'

import { useLayoutEffect, useState, ViewTransition, type ReactNode, type ViewTransitionInstance } from 'react'
import { usePathname } from 'next/navigation'
import { mediaQueryMatches } from '@/lib/media-query'
import { resetRouteTransitionIntent, useRouteTransitionIntent } from '@/lib/motion/route-intent'
import {
  animateTabViewTransition,
  resolveTabViewTransitionDirection,
  TAB_VIEW_TRANSITION_CLASS,
  TAB_VIEW_TRANSITION_NAME,
} from '@/lib/motion/tab-view-transition'

/**
 * Reads the tab switch from the commit that changes the pathname, not from Transition Types: React resets them
 * at every commit (https://react.dev/reference/react/addTransitionType#caveats), and a suspended tab push commits
 * Next's deferred segment value first.
 */
export function TabViewTransition({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const routeIntent = useRouteTransitionIntent()
  const [route, setRoute] = useState({ previous: pathname, current: pathname, intentVersion: routeIntent.version })
  if (route.current !== pathname) {
    setRoute({ previous: route.current, current: pathname, intentVersion: routeIntent.version })
  }
  const direction = route.intentVersion === routeIntent.version
    ? resolveTabViewTransitionDirection(route.previous, route.current, routeIntent.intent)
    : null
  useLayoutEffect(() => {
    if (direction !== null) resetRouteTransitionIntent()
  }, [direction])

  return (
    <ViewTransition
      name={TAB_VIEW_TRANSITION_NAME}
      default="none"
      update={direction === null ? 'none' : TAB_VIEW_TRANSITION_CLASS}
      onUpdate={direction === null ? undefined : (instance: ViewTransitionInstance) => animateTabViewTransition(
        instance,
        direction,
        mediaQueryMatches('(prefers-reduced-motion: reduce)', true),
      )}
    >
      {children}
    </ViewTransition>
  )
}
