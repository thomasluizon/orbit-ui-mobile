import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { SPACING } from '@orbit/shared/theme'

const WIDTHS = [320, 360, 384, 412] as const
const CATALOGS = { en, 'pt-BR': ptBR } as const
const FONTS = {
  question: { family: 'Space Grotesk', size: 28, file: '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf' },
  line: { family: 'Geist', size: 16, file: '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf' },
} as const
const COLUMN_MAX = 620
const LINE_MASCOT = 48
const LINE_GAP = 12

function textWidth(text: string, font: (typeof FONTS)[keyof typeof FONTS]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="100"><text y="60" font-family="${font.family}" font-size="${font.size}">${text}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [require.resolve(font.file)], loadSystemFonts: false } }).getBBox()!
  return Math.ceil(bounds.x + bounds.width)
}

/** Greedy word wrap, the way a text line breaks at a word boundary. */
function lineCount(text: string, available: number, font: (typeof FONTS)[keyof typeof FONTS]) {
  let lines = 1
  let current = ''
  for (const word of text.split(' ')) {
    const next = current ? `${current} ${word}` : word
    if (current && textWidth(next, font) > available) {
      lines += 1
      current = word
    } else current = next
  }
  return lines
}

const cases = WIDTHS.flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale })))

describe('the guided search copy on Android', () => {
  it.each(cases)('keeps the search question within two lines at $width in $locale', ({ width, locale }) => {
    const column = Math.min(COLUMN_MAX, width) - SPACING.s16 * 2
    const question = CATALOGS[locale].habits.search.question
    expect(lineCount(question, column, FONTS.question), question).toBeLessThanOrEqual(2)
  })

  it.each(cases)('keeps the Orbit line within two lines beside Orbit at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].habits.search
    const available = Math.min(COLUMN_MAX, width) - SPACING.s16 * 2 - SPACING.s4 * 2 - LINE_MASCOT - LINE_GAP
    for (const count of [1, 2, 9999]) {
      const sentence = String(new IntlMessageFormat(copy.line.count, locale).format({ count }))
      expect(lineCount(sentence, available, FONTS.line), sentence).toBe(1)
    }
    const miss = String(new IntlMessageFormat(copy.emptyTitle, locale, undefined, { ignoreTag: true }).format({ query: 'alongamento' })).replace(/<\/?queryText>/g, '')
    expect(lineCount(miss, available, FONTS.line), miss).toBeLessThanOrEqual(2)
  })
})
