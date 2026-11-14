import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { PADDING } from '@orbit/shared/theme'

const WIDTHS = [320, 360, 384, 412] as const
const CATALOGS = { en, 'pt-BR': ptBR } as const
const FONTS = {
  heading: { family: 'Geist', size: 20, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
  question: { family: 'Space Grotesk', size: 28, file: '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf' },
  option: { family: 'Geist', size: 17, file: '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf' },
} as const
const OPTION_SHARE = 0.48
const OPTION_INSET = 16
const QUESTION_MAX = 592

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

describe('Progresso guided labels on Android', () => {
  it.each(cases)('keeps both question headings on one line at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].progressScreen
    for (const heading of [copy.sections.windowQuestion, copy.sectionsQuestion]) {
      expect(textWidth(heading, FONTS.heading), heading).toBeLessThanOrEqual(width - PADDING.screenGutter * 2)
    }
  })

  it.each(cases)('keeps the repair question within two lines and each answer on one line at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].progressScreen.streak.repairFlow
    const column = Math.min(QUESTION_MAX, width - PADDING.screenGutter * 2)
    for (const count of [1, 2, 3]) {
      const question = String(new IntlMessageFormat(copy.question, locale).format({ count }))
      expect(lineCount(question, column, FONTS.question), question).toBeLessThanOrEqual(2)
    }
    const optionWidth = column * OPTION_SHARE - OPTION_INSET * 2
    for (const answer of [copy.repair, copy.notNow]) expect(textWidth(answer, FONTS.option), answer).toBeLessThanOrEqual(optionWidth)
  })
})
