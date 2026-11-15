import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BUTTON_SIZES, PADDING, SPACING } from '@orbit/shared/theme'
import { formatPrice } from '@orbit/shared/utils/subscription-pricing'

const WIDTHS = [320, 360, 384, 412] as const
const CATALOGS = { en, 'pt-BR': ptBR } as const
const FONTS = {
  question: { family: 'Space Grotesk', size: 28, file: '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf' },
  line: { family: 'Geist', size: 16, file: '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf' },
  tierName: { family: 'Geist', size: 17, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
  badge: { family: 'Geist Mono', size: 12, file: '@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf' },
  segment: { family: 'Geist', size: 14, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
  action: { family: 'Geist', size: BUTTON_SIZES.md.fontSize, file: '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf' },
  price: { family: 'Space Grotesk', size: 28, file: '@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf' },
  period: { family: 'Geist', size: 16, file: '@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf' },
} as const
/** The block cap and the plan card frame of `guided-pricing-section.tsx`: padding 16 and a 2 px ring on each side. */
const BLOCK_MAX = 592
const CARD_INSET = 16 + 2
/** The recommended badge of `ui/badge.tsx`: padding 8 on each side and 0.72 letter spacing. */
const BADGE_PADDING = SPACING.s8 * 2
const BADGE_TRACKING = 0.72
const TIER_GAP = 8
const SEGMENT_INSET = SPACING.s8 * 2
/** Fixture prices in the shape the plans read returns, in the currency each locale is billed in. */
const FIXTURE_PLANS = { brl: { monthly: 2990, yearly: 19900 }, usd: { monthly: 999, yearly: 6999 } } as const

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

/** The usage line of the catalog at the widest figures a plan reads: the weekly Pro allowance, all of it used, in the plural branch. */
function widestUsageLine(locale: keyof typeof CATALOGS) {
  const figure = '250'
  return CATALOGS[locale].upgrade.orbitLine.usage
    .replace('{used}', figure)
    .replace(/\{limit, plural,.*\bother \{([^}]*)\}\}/, (_match, branch: string) => branch.replace('#', figure))
}

/** The column of the route: the screen gutter of `useContentFrameStyle` on each side, under the block cap. */
const columnAt = (width: number) => Math.min(BLOCK_MAX, width - PADDING.screenGutter * 2)

const cases = WIDTHS.flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale })))

describe('the plan question labels on Android', () => {
  it('builds the widest usage line from the plural branch of each catalog', () => {
    expect(widestUsageLine('en')).toBe('You used 250 of 250 AI messages.')
    expect(widestUsageLine('pt-BR')).toBe('Você usou 250 de 250 mensagens de IA.')
  })

  it.each(cases)('keeps the question and each Orbit line within two lines at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].upgrade
    const column = columnAt(width)
    expect(lineCount(copy.question, column, FONTS.question), copy.question).toBeLessThanOrEqual(2)
    for (const line of [widestUsageLine(locale), copy.orbitLine.loading, copy.orbitLine.plansError, copy.orbitLine.billingError, copy.orbitLine.offline]) {
      expect(lineCount(line, column, FONTS.line), line).toBeLessThanOrEqual(2)
    }
  })

  it.each(cases)('keeps each plan name beside the recommended badge, each interval and each action on one line at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].upgrade
    const column = columnAt(width)
    const badge = textWidth(copy.plans.recommended.toUpperCase(), FONTS.badge) + Math.ceil(BADGE_TRACKING * copy.plans.recommended.length) + BADGE_PADDING
    const nameSpace = column - CARD_INSET * 2 - badge - TIER_GAP
    for (const name of [copy.plans.monthly.name, copy.plans.yearly.name]) expect(textWidth(name, FONTS.tierName), name).toBeLessThanOrEqual(nameSpace)
    for (const interval of [copy.plans.interval.monthly, copy.plans.interval.annual]) {
      expect(textWidth(interval, FONTS.segment), interval).toBeLessThanOrEqual((column - SPACING.s8) / 2 - SEGMENT_INSET)
    }
    for (const action of [copy.plans.cta, copy.convert.stayFree]) {
      expect(textWidth(action, FONTS.action), action).toBeLessThanOrEqual(column - BUTTON_SIZES.md.paddingX * 2)
    }
  })

  it.each(cases)('keeps the price and its period on one line inside the plan card at $width in $locale', ({ width, locale }) => {
    const copy = CATALOGS[locale].upgrade
    const currency = locale === 'pt-BR' ? 'brl' : 'usd'
    const inner = columnAt(width) - CARD_INSET * 2
    for (const [unitAmount, period] of [[FIXTURE_PLANS[currency].yearly, copy.plans.yearly.period], [FIXTURE_PLANS[currency].monthly, copy.plans.monthly.period]] as const) {
      const price = formatPrice(unitAmount, currency)
      expect(textWidth(price, FONTS.price) + textWidth(period.trim(), FONTS.period) + textWidth('x', FONTS.period), `${price}${period}`).toBeLessThanOrEqual(inner)
    }
  })
})
