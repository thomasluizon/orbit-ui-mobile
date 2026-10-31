import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { QuestionBlock } from '@/components/chat/question-block'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
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

interface OptionBounds {
  left: number; right: number; top: number; bottom: number; width: number
  fill?: { left: number; right: number; top: number; bottom: number; background: string }
}

function expectScaleGeometry(rows: OptionBounds[]) {
  expect(rows).toHaveLength(5)
  expect(new Set(rows.map(row => row.top)).size, 'all five scale targets share one row').toBe(1)
  for (const [index, row] of rows.entries()) {
    expect(row.width).toBeCloseTo(rows[0]!.width, 1)
    expect(row.bottom).toBeCloseTo(rows[0]!.bottom, 1)
    expect(row.fill, 'each scale target owns an inset fill').toBeDefined()
    expect(row.fill!.left - row.left).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    expect(row.right - row.fill!.right).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    expect(row.fill!.top - row.top).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    expect(row.bottom - row.fill!.bottom).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    if (index > 0) {
      expect(row.left, 'neighbouring scale targets touch').toBeCloseTo(rows[index - 1]!.right, 1)
      expect(row.fill!.left - rows[index - 1]!.fill!.right).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    }
    if (index === 1 || index === 2) expect(row.fill!.background).not.toBe('rgba(0, 0, 0, 0)')
  }
}

function expectRowClearance(rows: OptionBounds[]) {
  for (const [index, row] of rows.entries()) {
    expect(row.width).toBeCloseTo(rows[0]!.width, 1)
    for (const neighbour of rows.slice(index + 1)) {
      const horizontal = Math.max(0, neighbour.left - row.right, row.left - neighbour.right)
      const vertical = Math.max(0, neighbour.top - row.bottom, row.top - neighbour.bottom)
      expect(Math.hypot(horizontal, vertical)).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    }
  }
}

async function expectScaleInteraction(page: Page) {
  const target = page.getByRole('radio', { name: '3', exact: true })
  for (const state of ['press', 'focus']) {
    if (state === 'press') await page.mouse.down()
    else { await page.mouse.up(); await page.mouse.move(0, 0); await page.keyboard.press('Tab'); await target.focus() }
    const paint = await target.evaluate(element => {
      const fill = element.querySelector('[data-slot="question-scale-fill"]')!
      const targetStyle = getComputedStyle(element)
      const fillStyle = getComputedStyle(fill)
      const bounds = fill.getBoundingClientRect()
      const selected = element.parentElement!.querySelector('[aria-checked="true"] [data-slot="question-scale-fill"]')!.getBoundingClientRect()
      return { targetBackground: targetStyle.backgroundColor, targetShadow: targetStyle.boxShadow, targetOutlineStyle: targetStyle.outlineStyle, fillBackground: fillStyle.backgroundColor, fillOutline: fillStyle.outlineWidth, fillOutlineStyle: fillStyle.outlineStyle, fillShadow: fillStyle.boxShadow, clearance: bounds.left - selected.right }
    })
    expect(paint.targetBackground).toBe('rgba(0, 0, 0, 0)')
    expect(paint.targetShadow).toBe('none')
    expect(paint.targetOutlineStyle).toBe('none')
    expect(paint.fillBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(paint.clearance).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    if (state === 'focus') { expect(paint.fillOutlineStyle).toBe('solid'); expect(paint.fillOutline).toBe('2px'); expect(paint.fillShadow).toBe('none') }
  }
}

it.each([320, 360, 384, 412, 600, 1024, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale => [1, 2].flatMap(scale => (['dark', 'light'] as const).map(mode => ({ width, locale, scale, mode }))))))(
  'fits question controls at $width and text scale $scale in $locale and $mode', async ({ width, locale, scale, mode }) => {
    const label = locale === 'en' ? 'A longer answer about making time for a routine after work and other responsibilities' : 'Uma resposta mais longa sobre encontrar tempo para uma rotina depois do trabalho e de outros compromissos'
    const block = { ...questionBlockFixture, questions: questionBlockFixture.questions.map(question => question.type === 'singleChoice' || question.type === 'multipleChoice' ? { ...question, options: question.options.map(option => ({ ...option, label: `${option.label}: ${label}` })) } : question) }
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><div style={{ padding: 16 }}><QuestionBlock block={block} /></div></NextIntlClientProvider>)
    fireEvent.click(container.querySelector('[role="radio"][aria-label="2"]')!)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet} *, *::before, *::after { transition: none !important }</style><div class="${mode}" style="${variables}">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      await page.evaluate(scale => {
        const texts = [...document.querySelectorAll<HTMLElement>('[data-answer-block] *')].filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        for (const element of texts) {
          const computed = getComputedStyle(element)
          element.style.fontSize = `${parseFloat(computed.fontSize) * scale}px`
          element.style.lineHeight = `${parseFloat(computed.lineHeight) * scale}px`
        }
      }, scale)
      await page.getByRole('radio', { name: '3', exact: true }).hover()
      const measured = await page.evaluate(scalePrompt => {
        const texts = [...document.querySelectorAll<HTMLElement>('[data-answer-block] *')].filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          rows: [...document.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]')].map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          groups: [...document.querySelectorAll('[role="radiogroup"]')].map(group => ({ isScale: group.getAttribute('aria-label') === scalePrompt, rows: [...group.querySelectorAll('[role="radio"]')].map(element => {
            const { left, right, top, bottom, width } = element.getBoundingClientRect()
            const paint = element.querySelector('[data-slot="question-scale-fill"]')
            const fill = paint?.getBoundingClientRect()
            return { left, right, top, bottom, width, fill: fill && { left: fill.left, right: fill.right, top: fill.top, bottom: fill.bottom, background: getComputedStyle(paint!).backgroundColor } }
          }) })),
          texts: texts.map(element => { const bounds = element.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(element); const content = range.getBoundingClientRect(); return { label: element.textContent, left: content.left, right: content.right, height: bounds.height, contentHeight: content.height, clamp: getComputedStyle(element).webkitLineClamp } }),
        }
      }, block.questions.find(question => question.type === 'scale')!.prompt)
      expect(measured.scroll).toBeLessThanOrEqual(measured.width)
      for (const row of measured.rows) { expect(row.width).toBeGreaterThanOrEqual(48); expect(row.height).toBeGreaterThanOrEqual(48) }
      expect(measured.groups.filter(group => group.isScale)).toHaveLength(1)
      for (const { isScale, rows: group } of measured.groups) {
        if (isScale) expectScaleGeometry(group)
        else expectRowClearance(group)
      }
      for (const text of measured.texts) {
        expect(text.left, text.label).toBeGreaterThanOrEqual(0)
        expect(text.right, text.label).toBeLessThanOrEqual(width + 1)
        expect(text.contentHeight, text.label).toBeLessThanOrEqual(text.height + 1)
        expect(text.clamp).toBe('none')
      }
      await expectScaleInteraction(page)
    } finally { await page.close() }
  },
)
