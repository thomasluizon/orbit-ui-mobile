import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('measured sheet titles in Chromium', () => {
  let browser: Browser
  let launch: BrowserLaunch | undefined
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      import { readFileSync } from 'node:fs';
      const result = await build({
        stdin: { contents: readFileSync(0, 'utf8'), resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        alias: { '@sentry/nextjs': '@sentry/browser' },
        define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      });
      process.stdout.write(result.outputFiles[0].text);
    `], { input: `import React, { useEffect, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import en from '@orbit/shared/i18n/en.json';
      import pt from '@orbit/shared/i18n/pt-BR.json';
      import { Sheet } from './components/ui/sheet';
      const configuration = JSON.parse(document.getElementById('configuration').textContent);
      function App() {
        const [title, setTitle] = useState(configuration.title);
        useEffect(() => {
          const replace = event => setTitle(event.detail);
          document.addEventListener('replace-sheet-title', replace);
          return () => document.removeEventListener('replace-sheet-title', replace);
        }, []);
        return <NextIntlClientProvider locale={configuration.locale} messages={configuration.locale === 'en' ? en : pt} timeZone="UTC">
          <Sheet title={title} titleMode="typed" onClose={() => {}}><input aria-label="Draft" defaultValue="Keep this" /></Sheet>
        </NextIntlClientProvider>;
      }
      createRoot(document.getElementById('root')).render(<App />);`, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
  })
  afterAll(async () => { await closeChrome(launch) })

  it.each([320, 412, 1024].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
    [1, 2].map((scale) => ({ width, locale, scale })),
  )))('keeps fitting headings plain and truncated feedback inside its text box at $width in $locale at scale $scale', async ({ width, locale, scale }) => {
    const title = locale === 'en' ? 'Calendar event' : 'Novo evento'
    const longTitle = width === 412 ? 'Notification'.repeat(30)
      : (locale === 'en' ? 'Read a chapter before bed and take notes ' : 'Ler um capítulo antes de dormir e anotar as ideias ').repeat(8).trim()
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('purple', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" style="${variables};font-size:${16 * scale}px"><style>${stylesheet}</style><body><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ locale, title })}</script></body></html>`)
      await loadAppFonts(page)
      await page.addScriptTag({ content: script })
      await page.getByRole('heading', { name: title }).waitFor()
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
      expect(await page.getByRole('button', { name: title, exact: true }).count()).toBe(0)
      expect(await page.locator('.orbit-sheet-title [title], .orbit-sheet-full-title').count()).toBe(0)
      await page.evaluate((replacement) => document.dispatchEvent(new CustomEvent('replace-sheet-title', { detail: replacement })), longTitle)
      const control = page.getByRole('button', { name: longTitle, exact: true })
      await control.waitFor()
      expect(await control.getAttribute('title')).toBeNull()
      expect(await control.getAttribute('aria-expanded')).toBe('false')
      const targetId = await control.getAttribute('aria-controls')
      expect(targetId).toBeTruthy()
      for (const state of ['hover', 'press', 'focus']) {
        await control.hover()
        if (state === 'press') await page.mouse.down()
        if (state === 'focus') { await page.keyboard.press('Tab'); await control.focus() }
        await control.evaluate((element) => { for (const animation of element.getAnimations()) animation.finish() })
        const geometry = await control.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const text = element.querySelector('[data-personal-text]')!
          const textBounds = text.getBoundingClientRect()
          const close = element.closest('header')!.querySelector('.orbit-sheet-close')!.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { left: textBounds.left - bounds.left, right: bounds.right - textBounds.right,
            top: textBounds.top - bounds.top, bottom: bounds.bottom - textBounds.bottom,
            gap: close.left - bounds.right, height: bounds.height,
            overflow: text.scrollHeight > text.clientHeight || text.scrollWidth > text.clientWidth,
            radius: style.borderRadius, background: style.backgroundColor, outline: style.outlineStyle,
            outlineOffset: style.outlineOffset, focus: element.matches(':focus-visible') }
        })
        expect(geometry.overflow).toBe(true)
        expect(geometry.left).toBe(8)
        expect(geometry.right).toBe(8)
        expect(geometry.top).toBeGreaterThanOrEqual(8)
        expect(geometry.bottom).toBeGreaterThanOrEqual(8)
        expect(geometry.gap).toBeGreaterThanOrEqual(16)
        expect(geometry.height).toBeGreaterThanOrEqual(48)
        expect(geometry.radius).toBe('12px')
        expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)')
        if (state === 'focus') {
          expect(geometry.focus).toBe(true)
          expect(geometry.outline).toBe('solid')
          expect(geometry.outlineOffset).toBe('-4px')
        }
        if (state === 'press') { await page.mouse.move(0, 0); await page.mouse.up() }
        await control.blur()
      }
      await control.click()
      expect(await control.getAttribute('aria-expanded')).toBe('true')
      expect(await page.locator('.orbit-sheet-full-title').isVisible()).toBe(true)
      await control.click()
      expect(await control.getAttribute('aria-expanded')).toBe('false')
      await control.click()
      await page.evaluate((replacement) => document.dispatchEvent(new CustomEvent('replace-sheet-title', { detail: replacement })), title)
      await page.getByRole('heading', { name: title, exact: true }).waitFor()
      expect(await page.getByRole('button', { name: title, exact: true }).count()).toBe(0)
      expect(await page.locator('.orbit-sheet-full-title').count()).toBe(0)
      expect(await page.getByRole('textbox', { name: 'Draft' }).inputValue()).toBe('Keep this')
    } finally { await page.close() }
  })

  it('removes an expanded disclosure when resizing makes the collapsed title fit', async () => {
    const title = 'Read a chapter before bed and take notes about the ideas to discuss tomorrow'
    const page = await browser.newPage({ viewport: { width: 320, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ locale: 'en', title })}</script>`)
      await loadAppFonts(page)
      await page.addScriptTag({ content: script })
      const control = page.getByRole('button', { name: title, exact: true })
      await control.click()
      expect(await page.locator('.orbit-sheet-full-title').isVisible()).toBe(true)
      await page.setViewportSize({ width: 1024, height: 915 })
      await page.waitForFunction(() => document.querySelector('.orbit-sheet-title button') === null)
      expect(await page.locator('.orbit-sheet-full-title').count()).toBe(0)
      await page.setViewportSize({ width: 320, height: 915 })
      await control.waitFor()
      expect(await control.getAttribute('aria-expanded')).toBe('false')
    } finally { await page.close() }
  })
})
