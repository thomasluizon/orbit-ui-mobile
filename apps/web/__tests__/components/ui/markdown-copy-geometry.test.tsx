import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { Markdown } from '@/components/ui/markdown'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 1352].flatMap(width => [1, 2].flatMap(scale => (['en', 'pt-BR'] as const).flatMap(locale => (['dark', 'light'] as const).map(mode => ({ width, scale, locale, mode })))))

describe('Astra code copy geometry in Chromium', () => {
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

  it.each([
    ['plain reply', 'A final paragraph.'],
    ['prose after a block', '```\nkeep me\n```\n\nA final paragraph.'],
  ])('removes the final prose margin in an Astra bubble: %s', async (_context, content) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-bubble-role="ai"><Markdown className="thread-prose" copyableBlocks content={content} /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const paragraph = await page.locator('[data-bubble-role="ai"] p').last().evaluate(element => ({
        marginBottom: getComputedStyle(element).marginBottom,
        bottom: element.getBoundingClientRect().bottom,
        bubbleBottom: element.closest('[data-bubble-role]')!.getBoundingClientRect().bottom,
      }))
      expect(paragraph.marginBottom).toBe('0px')
      expect(paragraph.bottom).toBe(paragraph.bubbleBottom)
    } finally { await page.close() }
  })

  it.each(cases)('keeps controls separate from selectable code at $width, $scale text, $locale, $mode', async ({ width, scale, locale, mode }) => {
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt} timeZone="UTC">
      <div style={{ maxWidth: 740, padding: 16, marginInline: 'auto' }}>
        <Markdown className="thread-prose" copyableBlocks content={'A reply with two blocks.\n\n```sh\nprintf "<tag> & café"\ncommand --flag=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz\n```\n\n>     indented code\n\nA final paragraph.'} />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${theme}}</style><div class="${mode}">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      if (scale === 2) await page.locator('body *').evaluateAll(elements => {
        const sizes = elements.map(element => parseFloat(getComputedStyle(element).fontSize) * 2)
        elements.forEach((element, index) => { (element as HTMLElement).style.fontSize = `${sizes[index]}px` })
      })
      const blocks = await page.locator('[data-copyable-block]').evaluateAll(elements => elements.map(frame => {
        const button = frame.querySelector('button')!
        const pre = frame.querySelector('pre')!
        const code = pre.querySelector('code')!
        const buttonBounds = button.getBoundingClientRect()
        const preBounds = pre.getBoundingClientRect()
        const label = button.querySelector('span')!
        const labelBounds = label.getBoundingClientRect()
        return { buttonTop: buttonBounds.top, buttonBottom: buttonBounds.bottom, buttonLeft: buttonBounds.left, buttonRight: buttonBounds.right, preTop: preBounds.top, preRight: preBounds.right, height: buttonBounds.height, labelHeight: labelBounds.height, labelWidth: labelBounds.width, labelScrollWidth: label.scrollWidth, selectable: getComputedStyle(code).userSelect, overflow: getComputedStyle(pre).overflowX }
      }))
      expect(blocks).toHaveLength(2)
      for (const block of blocks) {
        expect(block.buttonBottom).toBeLessThanOrEqual(block.preTop - 4)
        expect(block.buttonLeft).toBeGreaterThanOrEqual(16)
        expect(block.buttonRight).toBeLessThanOrEqual(width - 16)
        expect(block.preRight).toBeLessThanOrEqual(width - 16)
        expect(block.height).toBeGreaterThanOrEqual(44)
        expect(block.labelHeight + 8).toBeLessThanOrEqual(block.height)
        expect(block.labelScrollWidth).toBeLessThanOrEqual(block.labelWidth + 1)
        expect(block.selectable).not.toBe('none')
        expect(block.overflow).toBe('auto')
      }
      expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(width)
      const button = page.getByRole('button').first()
      await button.focus()
      const focus = await button.evaluate(element => {
        const style = getComputedStyle(element)
        return { outline: parseFloat(style.outlineWidth), shadow: style.boxShadow, radius: style.borderRadius }
      })
      expect(focus.outline).toBe(2)
      expect(focus.radius).not.toBe('0px')
    } finally { await page.close() }
  })
})
