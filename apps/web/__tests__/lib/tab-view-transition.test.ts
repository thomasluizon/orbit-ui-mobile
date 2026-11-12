import type { ViewTransitionInstance } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { motionPresets } from '@orbit/shared/theme'
import {
  animateTabViewTransition,
  getTabTransitionTypes,
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

describe('getTabTransitionTypes', () => {
  it.each([
    ['/', '/calendar', 'orbit-tab-forward'],
    ['/calendar', '/profile', 'orbit-tab-forward'],
    ['/profile', '/progress', 'orbit-tab-back'],
    ['/progress', '/', 'orbit-tab-back'],
  ])('names the direction from %s to %s', (from, to, type) => {
    expect(getTabTransitionTypes(from, to, 'neutral', false)).toEqual([type])
  })

  it('keeps keyboard and palette navigation instant', () => {
    expect(getTabTransitionTypes('/', '/progress', 'instant', false)).toBeUndefined()
  })

  it('switches at once under reduced motion', () => {
    expect(getTabTransitionTypes('/', '/progress', 'neutral', true)).toBeUndefined()
  })

  it('leaves pushes and same-tab selections to the route motion', () => {
    expect(getTabTransitionTypes('/', '/habits/h1', 'neutral', false)).toBeUndefined()
    expect(getTabTransitionTypes('/calendar', '/calendar', 'neutral', false)).toBeUndefined()
  })
})

describe('animateTabViewTransition', () => {
  it('runs an opacity-only exit leg on the shared exit duration and easing', () => {
    const { instance, exitLeg } = createInstance()

    animateTabViewTransition(instance, ['orbit-tab-forward'], false)

    const exit = exitLeg()
    expect(exit.keyframes).toEqual({ opacity: [1, 0] })
    expect(exit.options).toMatchObject({
      duration: tabSwitch.exitDuration,
      easing: `cubic-bezier(${tabSwitch.exitEasing.join(', ')})`,
    })
  })

  it.each([
    ['orbit-tab-forward', tabSwitch.shift],
    ['orbit-tab-back', -tabSwitch.shift],
  ])('enters %s with the tab shift and the shared enter timing', (type, shift) => {
    const { instance, enterLeg } = createInstance()

    animateTabViewTransition(instance, [type], false)

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

    animateTabViewTransition(instance, ['orbit-tab-forward'], true)

    expect(exitLeg().options.duration).toBe(0)
    const enter = enterLeg()
    expect(enter.options.duration).toBe(0)
    expect(enter.keyframes.transform).toEqual(['translateX(0px)', 'translateX(0)'])
  })

  it('cancels both legs when React finishes the transition', () => {
    const { instance, cancel } = createInstance()

    animateTabViewTransition(instance, ['orbit-tab-forward'], false)()

    expect(cancel).toHaveBeenCalledTimes(2)
  })
})
