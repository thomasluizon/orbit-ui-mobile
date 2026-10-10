// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('inline label row centres in preferences', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let componentScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const boundaries: Record<string, string> = {
      '@/app/(app)/preferences/_components/use-preference-controls': `import { useLocale } from 'next-intl'; export const usePreferenceControls = () => ({ selectedLanguage: useLocale(), currentTheme: 'dark', activePicker: null, setActivePicker: () => {}, handleThemeModeChange: () => {}, showGeneralOnToday: true, toggleShowGeneral: () => {}, timeZoneMutation: { mutate: () => {} }, weekStartMutation: { mutate: () => {} }, clockFormatMutation: { mutate: () => {} } });`,
      '@/app/(app)/preferences/_components/preference-picker-sheet': 'export const PreferencePickerSheet = () => null;',
    }
    const result = await build({
      stdin: { contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { NextIntlClientProvider } from 'next-intl';
        import en from '../../packages/shared/src/i18n/en.json';
        import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
        import { createMockProfile } from '../../packages/shared/src/__tests__/factories';
        import { ProfilePreferencesContent } from './app/(app)/profile/_components/profile-preferences-content';
        const locale = document.getElementById('root').dataset.locale;
        createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><ProfilePreferencesContent profile={createMockProfile()} patchProfile={() => {}} /></NextIntlClientProvider>);`, resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: [{ name: 'preference-boundaries', setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => args.path in boundaries ? { path: args.path, namespace: 'boundary' } : undefined)
        builder.onLoad({ filter: /.*/, namespace: 'boundary' }, (args) => ({ contents: boundaries[args.path], loader: 'js', resolveDir: process.cwd() }))
      } }],
    })
    componentScript = result.outputFiles[0]!.text
  }, 30_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1352].flatMap((width) => [1, 2].flatMap((scale) => (['en', 'pt-BR'] as const).map((locale) => ({ width, scale, locale })))))('centres theme choices in $locale at $width and scale $scale', async ({ width, scale, locale }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}:root { font-size: ${16 * scale}px; }</style><main id="root" data-locale="${locale}" style="padding:16px;max-width:740px"></main>`)
      await page.addScriptTag({ content: componentScript })
      await page.getByRole('group').waitFor()
      await loadAppFonts(page)
      const measured = await page.getByRole('group').evaluate((control) => {
        const row = control.closest('.orbit-list-row-shell')!
        const label = row.querySelector('[data-slot="list-row-title"]')!
        const title = label.getBoundingClientRect()
        const choices = control.getBoundingClientRect()
        return { offset: title.top + Math.min(title.height, parseFloat(getComputedStyle(label).lineHeight)) / 2 - choices.top - choices.height / 2, labelHeight: title.height, lineHeight: parseFloat(getComputedStyle(label).lineHeight), height: row.getBoundingClientRect().height }
      })
      if (scale === 1) expect(measured.labelHeight).toBeCloseTo(measured.lineHeight, 0)
      else expect(measured.labelHeight).toBeGreaterThanOrEqual(measured.lineHeight - 1)
      await expect.poll(async () => page.getByRole('group').evaluate((control) => {
        const label = control.closest('.orbit-list-row-shell')!.querySelector('[data-slot="list-row-title"]')!
        const bounds = label.getBoundingClientRect()
        const choices = control.getBoundingClientRect()
        return Math.abs(bounds.top + Math.min(bounds.height, parseFloat(getComputedStyle(label).lineHeight)) / 2 - choices.top - choices.height / 2)
      })).toBeLessThanOrEqual(1)
      expect(measured.height).toBeGreaterThanOrEqual(72)
      const rows = await page.locator('.orbit-list-row-shell').evaluateAll((rows) => rows.map((row) => {
        const title = row.querySelector('[data-slot="list-row-title"]')!
        const control = row.querySelector('[data-slot="switch-track"], [role="group"], [data-slot="list-row-value"]')!
        const label = title.getBoundingClientRect()
        const accessory = control.getBoundingClientRect()
        const lineHeight = parseFloat(getComputedStyle(title).lineHeight)
        return { title: title.textContent, labelHeight: label.height, lineHeight, controlTop: accessory.top, labelBottom: label.bottom,
          offset: label.top + Math.min(label.height, lineHeight) / 2 - accessory.top - accessory.height / 2 }
      }))
      expect(rows).toHaveLength(6)
      for (const row of rows) {
        if (scale === 1 || row.controlTop < row.labelBottom) expect(Math.abs(row.offset), row.title!).toBeLessThanOrEqual(1)
      }
    } finally { await page.close() }
  })
})
