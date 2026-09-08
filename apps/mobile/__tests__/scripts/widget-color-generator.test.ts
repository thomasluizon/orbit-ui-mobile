import { describe, expect, it } from 'vitest'
import { SaxesParser } from 'saxes'
import { flattenColor, generatedXml } from '../../scripts/generate-widget-colors'

describe('widget color generator', () => {
  it('flattens a known alpha-over-surface pair', () => {
    expect(flattenColor('rgba(255,255,255,0.10)', '#131315')).toBe('#2B2B2C')
  })

  it.each(['light', 'dark'] as const)('generates parseable %s XML', mode => {
    const xml = generatedXml(mode)

    expect(xml.match(/<!-- WHY:/g)).toHaveLength(10)
    expect(xml).not.toContain('<!-- WHY: --')
    expect(() => new SaxesParser().write(xml).close()).not.toThrow()
  })
})
