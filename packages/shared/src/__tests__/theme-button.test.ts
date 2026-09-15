import { describe, it, expect } from 'vitest'
import { BUTTON_SIZES, type ButtonSize } from '../theme'

const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

describe('button geometry', () => {
  it('exposes the sm/md/lg size scale', () => {
    expect(Object.keys(BUTTON_SIZES).sort()).toEqual(['lg', 'md', 'sm'])
  })

  it('keeps the medium pill geometry with an allowed icon size', () => {
    expect(BUTTON_SIZES.md).toEqual({
      height: 50,
      paddingX: 26,
      fontSize: 16,
      iconSize: 20,
      gap: 9,
    })
  })

  it('scales height, padding, font, and gap monotonically sm < md < lg', () => {
    const keys = ['height', 'paddingX', 'fontSize', 'gap'] as const
    for (const key of keys) {
      expect(BUTTON_SIZES.sm[key]).toBeLessThan(BUTTON_SIZES.md[key])
      expect(BUTTON_SIZES.md[key]).toBeLessThan(BUTTON_SIZES.lg[key])
    }
    expect(BUTTON_SIZES.sm.iconSize).toBeLessThan(BUTTON_SIZES.md.iconSize)
    expect(BUTTON_SIZES.md.iconSize).toBeLessThanOrEqual(BUTTON_SIZES.lg.iconSize)
  })

  it('gives every size a complete, positive spec', () => {
    for (const size of SIZES) {
      const spec = BUTTON_SIZES[size]
      for (const value of Object.values(spec)) {
        expect(value).toBeGreaterThan(0)
      }
    }
  })
})
