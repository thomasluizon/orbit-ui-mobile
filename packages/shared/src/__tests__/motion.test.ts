import { describe, expect, it } from 'vitest'
import {
  motionDurations,
  orbitalMotion,
  motionPresets,
  motionScenarios,
  motionSprings,
  resolveMotionPreset,
} from '../theme/motion'

describe('motion theme contract', () => {
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
    expect(orbitalMotion.press.scale).toBeLessThan(1)
    expect(orbitalMotion.elevatedPress.translateY).toBeLessThan(0)
    expect(orbitalMotion.list.maxStaggerItems).toBeGreaterThan(0)
    expect(orbitalMotion.completion.peakScale).toBeGreaterThan(orbitalMotion.completion.reducedPeakScale)
  })
})
