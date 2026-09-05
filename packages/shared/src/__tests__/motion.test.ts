import { describe, expect, it } from 'vitest'
import {
  motionDurations,
  motionEasings,
  orbitalMotion,
  motionPresets,
  motionScenarios,
  motionSprings,
  resolveMotionPreset,
} from '../theme/motion'

describe('motion theme contract', () => {
  it('keeps every shared easing within the no-overshoot control bounds', () => {
    for (const easing of Object.values(motionEasings)) {
      for (const control of [easing[1], easing[3]]) {
        expect(control).toBeGreaterThanOrEqual(0)
        expect(control).toBeLessThanOrEqual(1)
      }
    }
  })

  it('uses the entrance easing for success feedback', () => {
    expect(resolveMotionPreset('success-feedback').enterEasing).toEqual(motionEasings.enter)
    expect(resolveMotionPreset('success-feedback', true).enterEasing).toEqual(motionEasings.linear)
  })

  it('defines the full shared scenario vocabulary', () => {
    expect(motionScenarios).toEqual([
      'tab-switch',
      'route-push',
      'route-replace',
      'sheet',
      'dialog',
      'menu',
      'toast',
      'list-enter',
      'list-exit',
      'selection',
      'success-feedback',
      'theme-change',
    ])
  })

  it('keeps exit timings faster than or equal to enter timings', () => {
    for (const scenario of motionScenarios) {
      const preset = motionPresets[scenario]
      expect(preset.exitDuration).toBeLessThanOrEqual(preset.enterDuration)
    }
  })

  it('keeps destination switches completely still', () => {
    const tabSwitch = resolveMotionPreset('tab-switch')

    expect(tabSwitch.enterDuration).toBe(0)
    expect(tabSwitch.exitDuration).toBe(0)
    expect(tabSwitch.shift).toBe(0)
    expect(tabSwitch.scaleFrom).toBe(1)
  })

  it('uses the exact hierarchical route timing and distance', () => {
    const routePush = resolveMotionPreset('route-push')

    expect(routePush.enterDuration).toBe(220)
    expect(routePush.exitDuration).toBe(165)
    expect(routePush.shift).toBe(12)
    expect(routePush.scaleFrom).toBe(1)
  })

  it('exports stable spring presets for motion consumers', () => {
    expect(motionSprings.sheet.stiffness).toBeGreaterThan(motionSprings.soft.stiffness)
    expect(motionSprings.completion.damping).toBeLessThan(motionSprings.sheet.damping)
  })

  it('resolves reduced motion presets without spatial shift', () => {
    const reduced = resolveMotionPreset('route-push', true)

    expect(reduced.reducedMotionEnabled).toBe(true)
    expect(reduced.shift).toBe(0)
    expect(reduced.scaleFrom).toBe(1)
    expect(reduced.enterDuration).toBeLessThan(motionDurations.route)
  })

  it('keeps celebratory feedback longer than core micro-interactions', () => {
    expect(motionDurations.completePop).toBeGreaterThan(motionDurations.fast)
    expect(motionDurations.completeSpark).toBeGreaterThan(motionDurations.micro)
  })

  it('exports orbital interaction tokens for cross-platform UI polish', () => {
    expect(orbitalMotion.press.scale).toBe(0.96)
    expect(orbitalMotion.press.duration).toBe(150)
    expect(orbitalMotion.elevatedPress.translateY).toBeLessThan(0)
    expect(orbitalMotion.list.maxStaggerItems).toBeGreaterThan(0)
    expect(orbitalMotion.completion.peakScale).toBeGreaterThan(orbitalMotion.completion.reducedPeakScale)
  })
})
