import type { ViewTransitionInstance } from 'react'
import {
  resolveMotionPreset,
  type MotionBezier,
  type MotionNavigationIntent,
} from '@orbit/shared/theme'

export const PRIMARY_TAB_PATHS: readonly string[] = ['/', '/calendar', '/progress', '/profile']

export const TAB_VIEW_TRANSITION_NAME = 'orbit-tab-page'

export const TAB_VIEW_TRANSITION_TYPES = {
  forward: 'orbit-tab-forward',
  back: 'orbit-tab-back',
} as const

export const TAB_VIEW_TRANSITION_CLASS = {
  [TAB_VIEW_TRANSITION_TYPES.forward]: 'orbit-tab-switch',
  [TAB_VIEW_TRANSITION_TYPES.back]: 'orbit-tab-switch',
  default: 'none',
} as const

export function isPrimaryTabSwitch(from: string, to: string): boolean {
  return from !== to && PRIMARY_TAB_PATHS.includes(from) && PRIMARY_TAB_PATHS.includes(to)
}

export function getTabTransitionTypes(
  from: string,
  to: string,
  intent: MotionNavigationIntent,
  reducedMotion: boolean,
): string[] | undefined {
  if (intent === 'instant' || reducedMotion || !isPrimaryTabSwitch(from, to)) {
    return undefined
  }

  return [
    PRIMARY_TAB_PATHS.indexOf(to) > PRIMARY_TAB_PATHS.indexOf(from)
      ? TAB_VIEW_TRANSITION_TYPES.forward
      : TAB_VIEW_TRANSITION_TYPES.back,
  ]
}

function toCssEasing(easing: MotionBezier): string {
  return `cubic-bezier(${easing.join(', ')})`
}

export function animateTabViewTransition(
  instance: ViewTransitionInstance,
  types: readonly string[],
  reducedMotion: boolean,
): () => void {
  const preset = resolveMotionPreset('tab-switch', reducedMotion)
  const direction = types.includes(TAB_VIEW_TRANSITION_TYPES.back) ? -1 : 1
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
