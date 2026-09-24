import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SaxesParser } from 'saxes'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { generatedXml } from '../../scripts/generate-widget-colors'

const repositoryRoot = resolve(process.cwd(), '../..')

function generatedColor(xml: string, name: string) {
  const value = xml.match(new RegExp(`<color name="${name}">([^<]+)</color>`))?.[1]
  if (!value) throw new Error(`Missing generated color: ${name}`)
  return value
}

const GENERATED_OUTPUTS = [
  'apps/mobile/lib/widget-colors.generated.ts',
  'apps/mobile/modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/WidgetColorFallbacks.generated.kt',
  'apps/mobile/modules/orbit-widget/android/src/main/res/values/widget_colors.xml',
  'apps/mobile/modules/orbit-widget/android/src/main/res/values-night/widget_colors.xml',
]

describe('widget color generator', () => {
  it.each(['light', 'dark'] as const)('generates parseable %s XML', mode => {
    const xml = generatedXml(mode)

    expect(xml.match(/<!-- WHY:/g)).toHaveLength(11)
    expect(xml).not.toContain('<!-- WHY: --')
    expect(() => new SaxesParser().write(xml).close()).not.toThrow()
  })

  it('runs the mobile workspace script and rewrites the checked-in outputs unchanged', () => {
    const before = GENERATED_OUTPUTS.map(file => ({
      file,
      bytes: readFileSync(resolve(repositoryRoot, file)),
    }))

    try {
      const run = spawnSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'generate:widget-colors', '-w', '@orbit/mobile'],
        { cwd: repositoryRoot, encoding: 'utf8' },
      )

      expect(run.stderr).toBe('')
      expect(run.status).toBe(0)
      for (const { file, bytes } of before) {
        expect(readFileSync(resolve(repositoryRoot, file)), file).toEqual(bytes)
      }
    } finally {
      for (const { file, bytes } of before) {
        writeFileSync(resolve(repositoryRoot, file), bytes)
      }
    }
  }, 60_000)

  it('keeps light overdue text AA on the generated widget well', () => {
    const xml = generatedXml('light')

    expect(contrastOnSurface(
      generatedColor(xml, 'widget_overdue'),
      [generatedColor(xml, 'widget_well')],
    )).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['dark', 'widget_card'],
    ['dark', 'widget_well'],
    ['light', 'widget_card'],
    ['light', 'widget_well'],
  ] as const)('keeps the %s empty track at the non-text floor on %s', (mode, surface) => {
    const xml = generatedXml(mode)

    expect(contrastOnSurface(
      generatedColor(xml, 'widget_track_empty'),
      [generatedColor(xml, surface)],
    )).toBeGreaterThanOrEqual(3)
  })

  it.each([
    ['dark', '#E16D33', 'widget_card'],
    ['dark', '#E16D33', 'widget_well'],
    ['light', '#B64900', 'widget_card'],
    ['light', '#B64900', 'widget_well'],
  ] as const)(
    'keeps the %s streak text token AA on %s',
    (mode, expectedText, surface) => {
      const xml = generatedXml(mode)
      const streakText = generatedColor(xml, 'widget_streak_text')

      expect(contrastOnSurface(
        streakText,
        [generatedColor(xml, surface)],
      )).toBeGreaterThanOrEqual(4.5)
      expect(streakText).toBe(expectedText)
    },
  )
})
