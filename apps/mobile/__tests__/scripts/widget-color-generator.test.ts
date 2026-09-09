import { describe, expect, it } from 'vitest'
import { SaxesParser } from 'saxes'
import { generatedXml } from '../../scripts/generate-widget-colors'

describe('widget color generator', () => {
  it.each(['light', 'dark'] as const)('generates parseable %s XML', mode => {
    const xml = generatedXml(mode)

    expect(xml.match(/<!-- WHY:/g)).toHaveLength(11)
    expect(xml).not.toContain('<!-- WHY: --')
    expect(() => new SaxesParser().write(xml).close()).not.toThrow()
  })
})
