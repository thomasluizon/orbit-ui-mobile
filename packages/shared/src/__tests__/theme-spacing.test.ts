import { describe, it, expect } from 'vitest'
import { spacing, spacingScale, type Spacing, type SpacingStep } from '../theme'

const DESIGN_MD_SCALE = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64]

describe('spacing scale', () => {
  it('enumerates exactly the thirteen DESIGN.md steps, in order', () => {
    expect([...spacingScale]).toEqual(DESIGN_MD_SCALE)
  })

  it('keeps every step a non-negative multiple of four', () => {
    for (const step of spacingScale) {
      expect(step % 4).toBe(0)
      expect(step).toBeGreaterThanOrEqual(0)
    }
  })

  it('excludes the base-2 values the audit found drifting off scale', () => {
    for (const offScale of [2, 6, 7, 9, 10, 14, 18, 22, 26, 30, 36]) {
      expect(DESIGN_MD_SCALE).not.toContain(offScale)
      expect([...spacingScale]).not.toContain(offScale)
    }
  })

  it('maps each space-N token to N * 4 px', () => {
    for (const [key, value] of Object.entries(spacing)) {
      expect(value).toBe(Number(key) * 4)
    }
  })

  it('covers the whole scale with its named steps', () => {
    expect(Object.values(spacing).sort((a, b) => a - b)).toEqual(DESIGN_MD_SCALE)
  })
})

describe('spacing types', () => {
  it('accepts an on-scale value where Spacing is required', () => {
    const gap: Spacing = 12
    expect(gap).toBe(spacing[3])
  })

  it('rejects an off-scale value at compile time', () => {
    // @ts-expect-error 10 is off the base-4 scale, so this must not type-check.
    const gap: Spacing = 10
    expect(gap).toBe(10)
  })

  it('rejects a step index the scale does not define', () => {
    // @ts-expect-error there is no space-9 token; the scale jumps 8 -> 10.
    const step: SpacingStep = 9
    expect(step).toBe(9)
  })
})
