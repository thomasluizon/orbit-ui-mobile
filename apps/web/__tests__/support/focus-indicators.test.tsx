import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Input } from '@/components/ui/input'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectControlAccentRings, inspectFocusedControlRings as inspectFocusedRing, readFieldIndicators } from '@/e2e/layout/focus-indicators'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

describe('field indicator readers in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await browserLaunch
    process.stdout.write(`Field indicator checks: Chrome ${browser.version()}\n`)
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('preserves the neutral outline on the real Today Astra control class', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}
        :root { ${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([property, value]) => `${property}: ${value};`).join(' ')} }
      </style><button class="today-astra-line">Astra</button>`)
      await page.keyboard.press('Tab')
      expect((await inspectFocusedRing(page))?.indicators).toEqual(['button:outline'])
      expect(await inspectControlAccentRings(page.locator('button'))).toEqual(['button:outline'])
    } finally {
      await page.close()
    }
  })

  it('preserves a focused field perimeter on a wider owning wrapper', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        :root { --primary: rgb(196, 83, 15); }
        .field { width: 320px; padding: 16px; }
        .field:focus-within { box-shadow: inset 0 0 0 2px var(--primary); }
        textarea { width: 240px; border: 0; outline: none; }
      </style><div class="field"><textarea name="message"></textarea></div>`)
      await page.keyboard.press('Tab')
      expect((await inspectFocusedRing(page))?.indicators).toEqual(['div:shadow'])
      expect(await inspectControlAccentRings(page.locator('textarea'))).toHaveLength(0)
    } finally {
      await page.close()
    }
  })

  it.each([false, true])('reads the Input perimeter above an opaque fill, multiline %s', async (multiline) => {
    const properties = { label: 'Email', name: 'email', value: 'focus@example.com', onChange: () => {} }
    const { container } = render(multiline ? <Input {...properties} multiline /> : <Input {...properties} />)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}
        :root { ${Object.entries(resolveWebThemeVariables('orange', 'light')).map(([property, value]) => `${property}: ${value};`).join(' ')} }
        input, textarea { background: white !important; }
        [data-focus-perimeter] { width: 320px; }
      </style>${container.innerHTML}`)
      await loadAppFonts(page)
      const field = page.locator('input, textarea')
      expect(await readFieldIndicators(field, '[data-input-root]')).toEqual(['div::after:shadow'])
      await page.keyboard.press('Tab')
      expect((await inspectFocusedRing(page))?.indicators).toEqual(['div::after:shadow'])
      expect(await readFieldIndicators(field, '[data-input-root]')).toEqual(['div::after:shadow'])
      await page.emulateMedia({ forcedColors: 'active' })
      expect(await readFieldIndicators(field, '[data-input-root]', { forcedColors: true })).toEqual(['div:border'])
    } finally {
      await page.close()
    }
  })

  it.each([
    { label: 'outline and shadow on one element', rules: '.field { outline: 2px solid rgb(196, 83, 15); box-shadow: inset 0 0 0 2px rgb(196, 83, 15); }', count: 2 },
    { label: 'two alpha shadows', rules: '.field { box-shadow: inset 0 0 0 2px rgba(196, 83, 15, 0.45), inset 0 0 0 1px rgba(196, 83, 15, 0.2); }', count: 2 },
    { label: 'accent border', rules: '.field { border: 2px solid rgba(196, 83, 15, 0.45); }', count: 1 },
    { label: 'element shadow', rules: '.field { box-shadow: inset 0 0 0 2px rgb(196, 83, 15); }', count: 1 },
    { label: 'after shadow', rules: '.field::after { content: ""; box-shadow: inset 0 0 0 2px rgb(196, 83, 15); }', count: 1 },
    { label: 'before shadow', rules: '.field::before { content: ""; box-shadow: inset 0 0 0 2px rgb(196, 83, 15); }', count: 1 },
    { label: 'after outline', rules: '.field::after { content: ""; outline: 2px solid rgb(196, 83, 15); }', count: 1 },
    { label: 'before outline', rules: '.field::before { content: ""; outline: 2px solid rgb(196, 83, 15); }', count: 1 },
    { label: 'duplicate element and after shadows', rules: '.field, .field::after { box-shadow: inset 0 0 0 2px rgb(196, 83, 15); } .field::after { content: ""; }', count: 2 },
    { label: 'duplicate before and after shadows', rules: '.field::before, .field::after { content: ""; box-shadow: inset 0 0 0 2px rgb(196, 83, 15); }', count: 2 },
    { label: 'ungenerated after shadow', rules: '.field::after { content: none; box-shadow: inset 0 0 0 2px rgb(196, 83, 15); }', count: 0 },
    { label: 'ungenerated before outline', rules: '.field::before { content: none; outline: 2px solid rgb(196, 83, 15); }', count: 0 },
    { label: 'normal content on an ungenerated pseudo-element', rules: '.field::after { content: normal; outline: 2px solid rgb(196, 83, 15); }', count: 0 },
  ])('counts $label independently in both readers', async ({ rules, count }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        :root { --primary: rgb(196, 83, 15); }
        .field { position: relative; width: 320px; height: 54px; }
        .field::before, .field::after { position: absolute; inset: 0; pointer-events: none; }
        input { width: 100%; height: 100%; box-sizing: border-box; background: transparent; border: 0; outline: none; }
        ${rules}
      </style><div class="field"><input name="email"></div>`)
      await loadAppFonts(page)
      await page.keyboard.press('Tab')
      expect((await inspectFocusedRing(page))?.indicators).toHaveLength(count)
      expect(await readFieldIndicators(page.locator('input'), '.field')).toHaveLength(count)
    } finally {
      await page.close()
    }
  })

  it.each([
    { label: 'covered element ring', rules: '.field { box-shadow: inset 0 0 0 2px orange; }', indicators: [] },
    { label: 'after ring above fill', rules: '.field::after { content: ""; box-shadow: inset 0 0 0 2px orange; }', indicators: ['div::after:shadow'] },
    { label: 'before ring above fill', rules: '.field::before { content: ""; box-shadow: inset 0 0 0 2px orange; }', indicators: ['div::before:shadow'] },
    { label: 'hidden after ring', rules: '.field::after { content: ""; opacity: 0; box-shadow: inset 0 0 0 2px orange; }', indicators: [] },
    { label: 'ring in a hidden ancestor', rules: '.field { opacity: 0; } .field::after { content: ""; box-shadow: inset 0 0 0 2px orange; }', indicators: [] },
  ])('preserves visibility for $label', async ({ rules, indicators }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        :root { --primary: rgb(196, 83, 15); }
        .field { position: relative; width: 320px; height: 54px; }
        .field::before, .field::after { position: absolute; inset: 0; z-index: 1; }
        input { width: 100%; height: 100%; box-sizing: border-box; background: white; border: 0; outline: none; }
        ${rules}
      </style><div class="field"><input></div>`)
      await loadAppFonts(page)
      expect(await readFieldIndicators(page.locator('input'), '.field')).toEqual(indicators)
    } finally {
      await page.close()
    }
  })
})
