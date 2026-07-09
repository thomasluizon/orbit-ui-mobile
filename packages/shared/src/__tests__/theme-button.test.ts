import { describe, it, expect } from 'vitest'
import { BUTTON_SIZES, type ButtonSize } from '../theme'

const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

describe('button geometry', () => {
  it('exposes the sm/md/lg size scale', () => {
    expect(Object.keys(BUTTON_SIZES).sort()).toEqual(['lg', 'md', 'sm'])
  })

  it('keeps md at the historical pill look', () => {
    expect(BUTTON_SIZES.md).toEqual({
      height: 50,
      paddingX: 26,
      fontSize: 16,
      iconSize: 18,
      gap: 9,
    })
  })

  it('scales height, padding, font, icon, and gap monotonically sm < md < lg', () => {
    const keys = ['height', 'paddingX', 'fontSize', 'iconSize', 'gap'] as const
    for (const key of keys) {
      expect(BUTTON_SIZES.sm[key]).toBeLessThan(BUTTON_SIZES.md[key])
      expect(BUTTON_SIZES.md[key]).toBeLessThan(BUTTON_SIZES.lg[key])
    }
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
