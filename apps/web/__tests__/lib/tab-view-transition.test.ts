import type { ViewTransitionInstance } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { motionPresets } from '@orbit/shared/theme'
import {
  animateTabViewTransition,
  resolveTabViewTransitionDirection,
  shouldAnimateTabSwitch,
} from '@/lib/motion/tab-view-transition'

const tabSwitch = motionPresets['tab-switch']

type AnimateCall = [PropertyIndexedKeyframes, KeyframeAnimationOptions]

function createInstance() {
  const cancel = vi.fn()
  const old = vi.fn(() => ({ cancel }))
  const enter = vi.fn(() => ({ cancel }))
  const instance = { name: 'orbit-tab-page', old: { animate: old }, new: { animate: enter } } as unknown as ViewTransitionInstance
  const leg = (spy: typeof old) => {
    expect(spy).toHaveBeenCalledOnce()
    const [keyframes, options] = (spy.mock.calls as unknown as AnimateCall[])[0]!
    return { keyframes, options }
  }
  return { instance, cancel, exitLeg: () => leg(old), enterLeg: () => leg(enter) }
}

describe('shouldAnimateTabSwitch', () => {
  it.each([
    ['/', '/calendar'],
    ['/calendar', '/profile'],
    ['/profile', '/progress'],
    ['/progress', '/'],
  ])('animates the switch from %s to %s', (from, to) => {
    expect(shouldAnimateTabSwitch(from, to, 'neutral', false)).toBe(true)
  })

  it('keeps keyboard and palette navigation instant', () => {
    expect(shouldAnimateTabSwitch('/', '/progress', 'instant', false)).toBe(false)
  })

  it('switches at once under reduced motion', () => {
    expect(shouldAnimateTabSwitch('/', '/progress', 'neutral', true)).toBe(false)
  })

  it('leaves pushes and same-tab selections to the route motion', () => {
    expect(shouldAnimateTabSwitch('/', '/habits/h1', 'neutral', false)).toBe(false)
    expect(shouldAnimateTabSwitch('/calendar', '/calendar', 'neutral', false)).toBe(false)
  })
})

describe('resolveTabViewTransitionDirection', () => {
  it.each([
    ['/', '/calendar', 1],
    ['/calendar', '/profile', 1],
    ['/profile', '/progress', -1],
    ['/progress', '/', -1],
  ])('names the direction of the tab commit from %s to %s', (from, to, direction) => {
    expect(resolveTabViewTransitionDirection(from, to, 'tab')).toBe(direction)
  })

  it('runs no transition once the pathname is committed', () => {
    expect(resolveTabViewTransitionDirection('/', '/', 'tab')).toBeNull()
  })

  it('runs no transition for a pathname change that no tab press started', () => {
    expect(resolveTabViewTransitionDirection('/', '/calendar', 'neutral')).toBeNull()
    expect(resolveTabViewTransitionDirection('/', '/calendar', 'instant')).toBeNull()
  })

  it('runs no transition from a tab press that lands outside the tab roots', () => {
    expect(resolveTabViewTransitionDirection('/', '/habits/h1', 'tab')).toBeNull()
  })
})

describe('animateTabViewTransition', () => {
  it('runs an opacity-only exit leg on the shared exit duration and easing', () => {
    const { instance, exitLeg } = createInstance()

    animateTabViewTransition(instance, 1, false)

    const exit = exitLeg()
    expect(exit.keyframes).toEqual({ opacity: [1, 0] })
    expect(exit.options).toMatchObject({
      duration: tabSwitch.exitDuration,
      easing: `cubic-bezier(${tabSwitch.exitEasing.join(', ')})`,
    })
  })

  it.each([
    [1, tabSwitch.shift],
    [-1, -tabSwitch.shift],
  ] as const)('enters in direction %s with the tab shift and the shared enter timing', (direction, shift) => {
    const { instance, enterLeg } = createInstance()

    animateTabViewTransition(instance, direction, false)

    const enter = enterLeg()
    expect(enter.keyframes).toEqual({
      opacity: [0, 1],
      transform: [`translateX(${shift}px)`, 'translateX(0)'],
    })
    expect(enter.options).toMatchObject({
      duration: tabSwitch.enterDuration,
      easing: `cubic-bezier(${tabSwitch.enterEasing.join(', ')})`,
    })
  })

  it('collapses both legs to an instant change under reduced motion', () => {
    const { instance, exitLeg, enterLeg } = createInstance()

    animateTabViewTransition(instance, 1, true)

    expect(exitLeg().options.duration).toBe(0)
    const enter = enterLeg()
    expect(enter.options.duration).toBe(0)
    expect(enter.keyframes.transform).toEqual(['translateX(0px)', 'translateX(0)'])
  })

  it('cancels both legs when React finishes the transition', () => {
    const { instance, cancel } = createInstance()

    animateTabViewTransition(instance, 1, false)()

    expect(cancel).toHaveBeenCalledTimes(2)
  })
})
