import { describe, expect, it } from 'vitest'
import { flattenColor } from '../../scripts/generate-widget-colors'

describe('widget color generator', () => {
  it('flattens a known alpha-over-surface pair', () => {
    expect(flattenColor('rgba(255,255,255,0.10)', '#131315')).toBe('#2B2B2C')
  })
})
