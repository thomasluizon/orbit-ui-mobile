import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { QuestionBlock } from '@/components/chat/question-block'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(cleanup)
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([320, 360, 384, 412, 600, 1024, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale => [1, 2].flatMap(scale => ['dark', 'light'].map(mode => ({ width, locale, scale, mode }))))))(
  'fits question controls at $width and text scale $scale in $locale and $mode', async ({ width, locale, scale, mode }) => {
    const label = locale === 'en' ? 'A longer answer about making time for a routine after work and other responsibilities' : 'Uma resposta mais longa sobre encontrar tempo para uma rotina depois do trabalho e de outros compromissos'
    const block = { ...questionBlockFixture, questions: questionBlockFixture.questions.map(question => question.type === 'singleChoice' || question.type === 'multipleChoice' ? { ...question, options: question.options.map(option => ({ ...option, label: `${option.label}: ${label}` })) } : question) }
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><div style={{ padding: 16 }}><QuestionBlock block={block} /></div></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="${mode}">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      const measured = await page.evaluate(scale => {
        const texts = [...document.querySelectorAll<HTMLElement>('[data-answer-block] *')].filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        for (const element of texts) {
          const computed = getComputedStyle(element)
          element.style.fontSize = `${parseFloat(computed.fontSize) * scale}px`
          element.style.lineHeight = `${parseFloat(computed.lineHeight) * scale}px`
        }
        return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          rows: [...document.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]')].map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          groups: [...document.querySelectorAll('[role="radiogroup"]')].map(group => [...group.querySelectorAll('[role="radio"]')].map(element => {
            const { left, right, top, bottom, width } = element.getBoundingClientRect()
            return { left, right, top, bottom, width }
          })),
          texts: texts.map(element => { const bounds = element.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(element); const content = range.getBoundingClientRect(); return { label: element.textContent, left: content.left, right: content.right, height: bounds.height, contentHeight: content.height, clamp: getComputedStyle(element).webkitLineClamp } }),
        }
      }, scale)
      expect(measured.scroll).toBeLessThanOrEqual(measured.width)
      for (const row of measured.rows) { expect(row.width).toBeGreaterThanOrEqual(48); expect(row.height).toBeGreaterThanOrEqual(48) }
      for (const group of measured.groups) {
        for (const [index, row] of group.entries()) {
          expect(row.width).toBeCloseTo(group[0]!.width, 1)
          for (const neighbour of group.slice(index + 1)) {
            const horizontal = Math.max(0, neighbour.left - row.right, row.left - neighbour.right)
            const vertical = Math.max(0, neighbour.top - row.bottom, row.top - neighbour.bottom)
            expect(Math.hypot(horizontal, vertical)).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
          }
        }
      }
      for (const text of measured.texts) {
        expect(text.left, text.label).toBeGreaterThanOrEqual(0)
        expect(text.right, text.label).toBeLessThanOrEqual(width + 1)
        expect(text.contentHeight, text.label).toBeLessThanOrEqual(text.height + 1)
        expect(text.clamp).toBe('none')
      }
    } finally { await page.close() }
  },
)
