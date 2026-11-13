import type { ViewTransitionInstance } from 'react'
import {
  resolveMotionPreset,
  type MotionBezier,
  type MotionNavigationIntent,
} from '@orbit/shared/theme'
import { resolveTabSwitchDirection } from '@orbit/shared/utils'

export const TAB_VIEW_TRANSITION_NAME = 'orbit-tab-page'

export const TAB_VIEW_TRANSITION_CLASS = 'orbit-tab-switch'

export function shouldAnimateTabSwitch(
  from: string,
  to: string,
  intent: MotionNavigationIntent,
  reducedMotion: boolean,
): boolean {
  return intent !== 'instant' && !reducedMotion && resolveTabSwitchDirection(from, to) !== null
}

export function resolveTabViewTransitionDirection(
  previousPathname: string,
  pathname: string,
  intent: MotionNavigationIntent,
): -1 | 1 | null {
  if (intent !== 'tab' || previousPathname === pathname) return null
  return resolveTabSwitchDirection(previousPathname, pathname)
}

function toCssEasing(easing: MotionBezier): string {
  return `cubic-bezier(${easing.join(', ')})`
}

export function animateTabViewTransition(
  instance: ViewTransitionInstance,
  direction: -1 | 1,
  reducedMotion: boolean,
): () => void {
  const preset = resolveMotionPreset('tab-switch', reducedMotion)
  const exit = instance.old.animate(
    { opacity: [1, 0] },
    {
      duration: preset.exitDuration,
      easing: toCssEasing(preset.exitEasing),
      fill: 'both',
    },
  )
  const enter = instance.new.animate(
    {
      opacity: [0, 1],
      transform: [`translateX(${direction * preset.shift}px)`, 'translateX(0)'],
    },
    {
      duration: preset.enterDuration,
      easing: toCssEasing(preset.enterEasing),
      fill: 'both',
    },
  )

  return () => {
    exit.cancel()
    enter.cancel()
  }
}
