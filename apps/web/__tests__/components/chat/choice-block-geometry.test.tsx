import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeChoiceLayoutBlock, makePickListLayoutBlock } from '@orbit/shared/test-support/choice-layout-fixtures'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { CheckRow } from '@/components/ui/check-row'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(cleanup)
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [false, true].flatMap(multiSelect => [1, 2].map(scale => ({ width, locale, multiSelect, scale }))))))('fits one line per option and aligns the action at $width in $locale, multi $multiSelect scale $scale', async ({ width, locale, multiSelect, scale }) => {
  const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
    <div style={{ padding: 16, maxWidth: 740 }}><ChoiceBlock block={makeChoiceLayoutBlock(locale, multiSelect)} /><PickListBlock block={makePickListLayoutBlock(locale)} /></div>
  </NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width, height: 915 } })
  try {
    await page.setContent(`<style>${stylesheet}</style><div class="dark" style="${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')}">${container.innerHTML}</div>`)
    await loadAppFonts(page)
    if (scale > 1) await page.locator('[data-answer-block="choice"] [role="radio"] span, [data-answer-block="choice"] [role="checkbox"] span').evaluateAll(elements => {
      const texts = elements.filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())).map(element => ({ element: element as HTMLElement, size: parseFloat(getComputedStyle(element).fontSize), height: parseFloat(getComputedStyle(element).lineHeight) }))
      for (const { element, size, height } of texts) { element.style.fontSize = `${size * 2}px`; element.style.lineHeight = `${height * 2}px` }
    })
    const measured = await page.locator('[data-answer-block="choice"] [role="radio"], [data-answer-block="choice"] [role="checkbox"]').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('span')].filter(span => [...span.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())).map(span => {
      const style = getComputedStyle(span)
      const range = document.createRange(); range.selectNodeContents(span)
      return { text: span.textContent, height: span.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight), lines: range.getClientRects().length, ellipsis: style.textOverflow, clipped: span.scrollWidth > span.clientWidth || span.scrollHeight > span.clientHeight }
    })))
    expect(measured).toHaveLength(2)
    for (const texts of measured) {
      expect(texts).toHaveLength(2)
      for (const text of texts) {
        if (scale === 1) expect(text.height, JSON.stringify(text)).toBeCloseTo(text.lineHeight, 1)
        if (scale === 1) expect(text.lines, text.text).toBe(1)
        expect(text.ellipsis).not.toBe('ellipsis')
        expect(text.clipped).toBe(false)
      }
    }
    const details = await page.locator('[data-answer-block="pickList"] [data-slot="check-row-description"]').evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) })))
    for (const detail of details) expect(detail.height).toBeCloseTo(detail.lineHeight, 1)
    const names = await page.locator('[data-answer-block="pickList"] [data-personal-text]').evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight), clamp: getComputedStyle(element).webkitLineClamp })))
    for (const name of names) { expect(name.height).toBeLessThanOrEqual(name.lineHeight * 2 + 1); expect(name.clamp).toBe('2') }
    const actions = await page.locator('[data-action-row]').evaluateAll(rows => rows.map(row => ({ end: row.getBoundingClientRect().right, buttonEnd: row.querySelector('button')!.getBoundingClientRect().right })))
    for (const action of actions) expect(action.buttonEnd).toBeCloseTo(action.end, 1)
  } finally { await page.close() }
})

it('keeps selected option foreground and completed habit foreground separate', async () => {
  const context = { isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn() }
  const { container } = render(<NextIntlClientProvider locale="en" messages={en}><PickListBlock block={makePickListLayoutBlock('en')} interaction={context} /><CheckRow label="Completed habit" checked onChange={vi.fn()} /></NextIntlClientProvider>)
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${stylesheet}</style><div class="dark" style="${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')}">${container.innerHTML}</div>`)
    const colors = await page.getByRole('checkbox').evaluateAll(rows => rows.map(row => getComputedStyle((row.closest('[data-slot="list-row-body"]') ?? row).querySelector('[data-slot="check-row-label"], [data-personal-text]')!).color))
    const tokens = await page.locator('.dark').evaluate(element => { const probe = document.createElement('span'); element.append(probe); probe.style.color = 'var(--fg-2)'; const resting = getComputedStyle(probe).color; probe.style.color = 'var(--fg-3)'; const completed = getComputedStyle(probe).color; probe.remove(); return { resting, completed } })
    expect(colors).toEqual([tokens.resting, tokens.resting, tokens.completed])
    fireEvent.click(container.querySelector('[role="checkbox"]')!)
    await page.setContent(`<style>${stylesheet}</style><div class="dark" style="${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')}">${container.innerHTML}</div>`)
    const selected = await page.getByRole('checkbox').first().evaluate(row => getComputedStyle((row.closest('[data-slot="list-row-body"]') ?? row).querySelector('[data-slot="check-row-label"], [data-personal-text]')!).color)
    const foreground = await page.locator('.dark').evaluate(element => { const probe = document.createElement('span'); probe.style.color = 'var(--fg-1)'; element.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color })
    expect(selected).toBe(foreground)
  } finally { await page.close() }
})
