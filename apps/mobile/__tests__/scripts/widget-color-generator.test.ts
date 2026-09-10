import { describe, expect, it } from 'vitest'
import { SaxesParser } from 'saxes'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { generatedXml } from '../../scripts/generate-widget-colors'

function generatedColor(xml: string, name: string) {
  const value = xml.match(new RegExp(`<color name="${name}">([^<]+)</color>`))?.[1]
  if (!value) throw new Error(`Missing generated color: ${name}`)
  return value
}

describe('widget color generator', () => {
  it.each(['light', 'dark'] as const)('generates parseable %s XML', mode => {
    const xml = generatedXml(mode)

    expect(xml.match(/<!-- WHY:/g)).toHaveLength(11)
    expect(xml).not.toContain('<!-- WHY: --')
    expect(() => new SaxesParser().write(xml).close()).not.toThrow()
  })

  it('keeps light overdue text AA on the generated widget well', () => {
    const xml = generatedXml('light')

    expect(contrastOnSurface(
      generatedColor(xml, 'widget_overdue'),
      [generatedColor(xml, 'widget_well')],
    )).toBeGreaterThanOrEqual(4.5)
  })
})
