import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const LONG_SERVER_SENTENCE = 'Sua rotina mudou. Vamos conversar sobre os hábitos que você quer retomar e organizar os próximos passos desta semana?'

const RECENT_DAY_COUNTS = [1, 2, 3, 4, 5, 6, 7]

function orbitLineSentences(words: typeof en, locale: string): string[] {
  return [
    words.todayAstra.guided.offline, words.conversation.restLimit, words.todayAstra.guided.returning,
    words.summary.guided.freePrompt, words.summary.error, words.habits.detail.askAstra,
    ...RECENT_DAY_COUNTS.map((done) => String(new IntlMessageFormat(words.habits.detail.orbit.lastSevenDays, locale).format({ done }))),
  ]
}

describe('the Orbit line row type role', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async next => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(() => { cleanup(); resetTestFlags() })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  async function measure(sentence: string, guided: boolean) {
    if (guided) enableTestFlags('orbit_guided_flows')
    const { container } = render(<TodayAstraLine text={sentence} destination="Abrir conversa" />)
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main>${container.innerHTML}</main>`)
      await loadAppFonts(page)
      return await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('.today-astra-line')!
        const sentence = row.querySelector<HTMLElement>('.today-astra-sentence')!
        const style = getComputedStyle(row)
        return {
          fontSize: style.fontSize, lineHeight: parseFloat(style.lineHeight), fontWeight: style.fontWeight,
          rowWidth: row.getBoundingClientRect().width, rowHeight: row.getBoundingClientRect().height,
          sentenceHeight: sentence.getBoundingClientRect().height, whole: sentence.scrollHeight <= sentence.clientHeight + 1,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        }
      })
    } finally { await page.close() }
  }

  it.each([['en', en], ['pt-BR', pt]] as const)('shows each %s Orbit line sentence of Hoje and habit detail whole in the orbit-line role, in two lines or fewer at 320', async (locale, words) => {
    const cut: string[] = []
    for (const sentence of orbitLineSentences(words, locale)) {
      const row = await measure(sentence, true)
      expect(row, sentence).toMatchObject({ fontSize: '16px', fontWeight: '400', rowWidth: 288, overflow: false })
      expect(row.lineHeight, sentence).toBeCloseTo(22.4, 1)
      expect(row.sentenceHeight, sentence).toBeLessThanOrEqual(row.lineHeight * 2 + 0.5)
      expect(row.rowHeight, sentence).toBeGreaterThanOrEqual(48)
      if (!row.whole || /(?:…|\.\.\.)$/u.test(sentence)) cut.push(sentence)
      cleanup()
      resetTestFlags()
    }
    expect(cut).toEqual([])
  })

  it('holds a long server sentence to two lines at 320', async () => {
    const row = await measure(LONG_SERVER_SENTENCE, true)
    expect(row.sentenceHeight).toBeCloseTo(row.lineHeight * 2, 0)
    expect(row.rowHeight).toBeCloseTo(row.lineHeight * 2 + 16, 0)
    expect(row.overflow).toBe(false)
  })

  it('keeps the current 14px line with the guided flows off', async () => {
    const row = await measure(pt.todayAstra.returningBounded, false)
    expect(row.fontSize).toBe('14px')
    expect(row.lineHeight).toBeCloseTo(21.7, 1)
  })
})
