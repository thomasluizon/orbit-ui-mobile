import { describe, expect, it } from 'vitest'
import {
  getCurrentRouteTransitionIntent,
  getRouteDirectionForIntent,
  getRouteScenarioForIntent,
  resetRouteTransitionIntent,
  setRouteTransitionIntent,
} from '@/lib/motion/route-intent'

describe('route intent helpers', () => {
  it('maps intents to the correct shared motion scenarios', () => {
    expect(getRouteScenarioForIntent('tab')).toBe('tab-switch')
    expect(getRouteScenarioForIntent('replace')).toBe('route-replace')
    expect(getRouteScenarioForIntent('forward')).toBe('route-push')
  })

  it('maps directions consistently for push and back navigation', () => {
    expect(getRouteDirectionForIntent('forward')).toBe(1)
    expect(getRouteDirectionForIntent('back')).toBe(-1)
    expect(getRouteDirectionForIntent('tab')).toBe(0)
  })

  it('resets the live snapshot back to neutral', () => {
    setRouteTransitionIntent('forward')
    expect(getCurrentRouteTransitionIntent()).toBe('forward')

    resetRouteTransitionIntent()

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })
})
