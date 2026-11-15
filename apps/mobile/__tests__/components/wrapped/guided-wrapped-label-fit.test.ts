import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BUTTON_SIZES, PADDING, SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'

const WIDTHS = [320, 360, 384, 412] as const
const CATALOGS = { en, 'pt-BR': ptBR } as const
const FONTS = {
  title: { family: 'Space Grotesk', size: 28, file: '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf' },
  question: { family: 'Geist', size: 17, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
  line: { family: 'Geist', size: 16, file: '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf' },
  option: { family: 'Geist', size: 17, file: '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf' },
  sheetTitle: { family: 'Geist', size: 22, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
  action: { family: 'Geist', size: BUTTON_SIZES.sm.fontSize, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
} as const
const BLOCK_MAX = 592
const LINE_MAX = 360
const OPTION_SHARE = 0.48
const OPTION_INSET = 16
const OPTION_BORDER = 2
const DIALOG_MAX = 420
const SHEET_HEADER_GAP = 16

type Font = (typeof FONTS)[keyof typeof FONTS]

function textWidth(text: string, font: Font) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="100"><text y="60" font-family="${font.family}" font-size="${font.size}">${text}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [require.resolve(font.file)], loadSystemFonts: false } }).getBBox()!
  return Math.ceil(bounds.x + bounds.width)
}

/** Greedy word wrap, the way a text line breaks at a word boundary. */
function lineCount(text: string, available: number, font: Font) {
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

const optionWidth = (column: number) => column * OPTION_SHARE - (OPTION_INSET + OPTION_BORDER) * 2
const cases = WIDTHS.flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale })))

describe('the guided Wrapped and share labels on Android', () => {
  it.each(cases)('keeps the cover title, the period question and the Orbit line within two lines and each period on one line at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].wrapped
    const column = Math.min(BLOCK_MAX, width - SPACING.s16 * 2)
    for (const period of RECAP_SHARE_PERIODS) {
      expect(lineCount(copy.coverTitles[period], column, FONTS.title), copy.coverTitles[period]).toBeLessThanOrEqual(2)
      expect(textWidth(copy.periods[period], FONTS.option), copy.periods[period]).toBeLessThanOrEqual(optionWidth(column))
    }
    expect(lineCount(copy.periodQuestion, column, FONTS.question), copy.periodQuestion).toBeLessThanOrEqual(2)
    for (const line of [copy.coverSubtitle, copy.empty, copy.error]) {
      expect(lineCount(line, Math.min(LINE_MAX, column), FONTS.line), line).toBeLessThanOrEqual(2)
    }
  })

  it.each(cases)('keeps the share question within two lines as the sheet heading and each share period on one line at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].shareCard
    const column = width - PADDING.sheetInline * 2
    expect(lineCount(copy.periodQuestion, column - SHEET_HEADER_GAP - TOUCH_TARGET_MIN, FONTS.sheetTitle), copy.periodQuestion).toBeLessThanOrEqual(2)
    for (const period of RECAP_SHARE_PERIODS) {
      expect(textWidth(copy.periods[period], FONTS.option), copy.periods[period]).toBeLessThanOrEqual(optionWidth(column))
    }
  })

  it.each(cases)('keeps each milestone dialog action on one line at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].milestoneShare
    const row = Math.min(DIALOG_MAX, width - SPACING.s16 * 2) - PADDING.cardInset * 2
    for (const label of [copy.later, copy.share]) {
      expect(textWidth(label, FONTS.action) + BUTTON_SIZES.sm.paddingX * 2, label).toBeLessThanOrEqual(row)
    }
  })
})
