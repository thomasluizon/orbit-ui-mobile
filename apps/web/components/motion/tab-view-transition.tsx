'use client'

import { ViewTransition, type ReactNode, type ViewTransitionInstance } from 'react'
import { mediaQueryMatches } from '@/lib/media-query'
import {
  animateTabViewTransition,
  TAB_VIEW_TRANSITION_CLASS,
  TAB_VIEW_TRANSITION_NAME,
} from '@/lib/motion/tab-view-transition'

function handleTabUpdate(instance: ViewTransitionInstance, types: string[]) {
  return animateTabViewTransition(
    instance,
    types,
    mediaQueryMatches('(prefers-reduced-motion: reduce)', true),
  )
}

export function TabViewTransition({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ViewTransition
      name={TAB_VIEW_TRANSITION_NAME}
      default="none"
      update={TAB_VIEW_TRANSITION_CLASS}
      onUpdate={handleTabUpdate}
    >
      {children}
    </ViewTransition>
  )
}
