import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { breakdownSubHabits } from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
  const fonts = [400, 500].map(weight => {
    const folder = weight === 400 ? '400Regular/Geist_400Regular.ttf' : '500Medium/Geist_500Medium.ttf'
    const font = readFileSync(require.resolve(`@expo-google-fonts/geist/${folder}`)).toString('base64')
    return `@font-face { font-family: TestGeist; font-weight: ${weight}; src: url(data:font/ttf;base64,${font}); }`
  }).join('\n')
  stylesheet = `${compiled.css}\n${fonts}`
})
afterEach(cleanup)
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([320, 412, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale => ['light', 'dark'].flatMap(theme => [1, 2].map(textScale => ({ width, locale, theme, textScale }))))))('keeps the grouping choice readable and focusable at $width in $locale, $theme, text scale $textScale', async ({ width, locale, theme, textScale }) => {
  const messages = locale === 'en' ? en : pt
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <div style={{ width: Math.min(width, 740), padding: 16 }}><BreakdownSuggestion parentName="House routine" subHabits={breakdownSubHabits} onConfirmed={vi.fn()} onCancelled={vi.fn()} /></div>
  </NextIntlClientProvider>)
  const variables = Object.entries(resolveWebThemeVariables('orange', theme as 'light' | 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
  const page = await browser.newPage({ viewport: { width, height: 915 } })
  try {
    await page.setContent(`<style>${stylesheet}\n:root { ${variables}; --font-sans: TestGeist; font-size: ${16 * textScale}px; }</style>${container.innerHTML}`)
    await page.evaluate(() => document.fonts.ready)
    const checkbox = page.getByRole('checkbox', { name: messages.habits.breakdown.createAsParent })
    const geometry = await checkbox.evaluate(input => {
      const row = input.closest('label')!
      const words = row.lastElementChild as HTMLElement
      const rowBounds = row.getBoundingClientRect()
      const wordsBounds = words.getBoundingClientRect()
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      context.font = getComputedStyle(words).font
      const naturalWidth = context.measureText(words.textContent).width
      return { naturalWidth, wordsWidth: wordsBounds.width, rowHeight: rowBounds.height, rowLeft: rowBounds.left, rowRight: rowBounds.right, wordsRight: wordsBounds.right, wordsBottom: wordsBounds.bottom, rowBottom: rowBounds.bottom, wordsHeight: wordsBounds.height, lineHeight: parseFloat(getComputedStyle(words).lineHeight), overflow: words.scrollWidth - words.clientWidth }
    })
    expect(geometry.rowHeight).toBeGreaterThanOrEqual(48)
    expect(geometry.rowLeft).toBeGreaterThanOrEqual(0)
    expect(geometry.rowRight).toBeLessThanOrEqual(width)
    expect(geometry.wordsRight).toBeLessThanOrEqual(geometry.rowRight)
    expect(geometry.wordsBottom).toBeLessThanOrEqual(geometry.rowBottom)
    expect(geometry.overflow).toBeLessThanOrEqual(1)
    if (textScale === 1) expect(geometry.wordsHeight, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.lineHeight + 0.5)
    await checkbox.focus()
    expect(await checkbox.evaluate(input => parseFloat(getComputedStyle(input.closest('label')!).outlineWidth))).toBeGreaterThanOrEqual(2)
  } finally { await page.close() }
})
