import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { widgetColorPalette } from '../../lib/widget-colors.generated'

const repositoryRoot = resolve(process.cwd(), '../..')

const GENERATED_OUTPUTS = [
  'apps/mobile/lib/widget-colors.generated.ts',
]

describe('widget color generator', () => {
  it('runs the mobile workspace script and rewrites the checked-in outputs unchanged', () => {
    const before = GENERATED_OUTPUTS.map(file => ({
      file,
      bytes: readFileSync(resolve(repositoryRoot, file)),
    }))

    try {
      const npmCli = process.env.npm_execpath
      expect(npmCli, 'run this suite through npm so npm_execpath names the npm CLI').toBeDefined()
      const run = spawnSync(
        process.execPath,
        [String(npmCli), 'run', 'generate:widget-colors', '-w', '@orbit/mobile'],
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
    const palette = widgetColorPalette.light

    expect(contrastOnSurface(
      palette.overdue,
      [palette.well],
    )).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['dark', 'card'],
    ['dark', 'well'],
    ['light', 'card'],
    ['light', 'well'],
  ] as const)('keeps the %s empty track at the non-text floor on %s', (mode, surface) => {
    const palette = widgetColorPalette[mode]

    expect(contrastOnSurface(
      palette.trackEmpty,
      [palette[surface]],
    )).toBeGreaterThanOrEqual(3)
  })

  it.each([
    ['dark', '#ED773E', 'card'],
    ['dark', '#ED773E', 'well'],
    ['light', '#A63A00', 'card'],
    ['light', '#A63A00', 'well'],
  ] as const)(
    'keeps the %s streak text token AA on %s',
    (mode, expectedText, surface) => {
      const palette = widgetColorPalette[mode]
      const streakText = palette.primaryText

      expect(contrastOnSurface(
        streakText,
        [palette[surface]],
      )).toBeGreaterThanOrEqual(4.5)
      expect(streakText).toBe(expectedText)
    },
  )
})
