// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('TimeField scroll ownership in the web Sheet', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let componentScript: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const boundaries: Record<string, string> = {
      'next-intl': `export const useTranslations = () => key => key; export const useLocale = () => 'en-US';`,
      '@/hooks/use-profile': 'export const useProfile = () => ({ profile: null });',
      '@/components/ui/update-available-banner': 'export const UpdateAvailableBanner = () => null;',
      '@/components/ui/app-toast-host': 'export const AppToastHost = () => null;',
    }
    const result = await build({
      stdin: {
        contents: `import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { TimeField } from './components/ui/time-field';
          const configuration = JSON.parse(document.getElementById('configuration').textContent);
          createRoot(document.getElementById('root')).render(React.createElement(TimeField, {
            value: configuration.value, hourCycle: configuration.hourCycle,
            onChange: value => { document.getElementById('committed').textContent = value; }
          }));`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: [{
        name: 'time-field-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => args.path in boundaries ? { path: args.path, namespace: 'boundary' } : undefined)
          builder.onLoad({ filter: /.*/, namespace: 'boundary' }, (args) => ({ contents: boundaries[args.path], loader: 'js' }))
        },
      }],
    })
    componentScript = result.outputFiles[0]!.text
  }, 30_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([
    { width: 320, height: 320, hourCycle: 'h23', value: '23:59' },
    { width: 320, height: 320, hourCycle: 'h12', value: '23:59' },
    { width: 915, height: 412, hourCycle: 'h12', value: '00:00' },
    { width: 412, height: 915, hourCycle: 'h23', value: '07:15' },
  ])('opens the selected values and keeps every value reachable at $width x $height ($hourCycle)', async (configuration) => {
    const page = await browser.newPage({ viewport: { width: configuration.width, height: configuration.height }, reducedMotion: 'reduce' })
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.setDefaultTimeout(5000)
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root"></div><output id="committed"></output><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: componentScript })
      await page.getByRole('button').waitFor().catch(() => { throw new Error(runtimeErrors.join('\n')) })
      expect(runtimeErrors).toEqual([])
      await page.getByRole('button').click()
      await page.getByRole('dialog').waitFor()
      const geometry = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const footer = document.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
        return {
          bodyHeight: body.clientHeight,
          bodyContentHeight: body.scrollHeight,
          bodyOffset: body.scrollTop,
          footerBottom: footer.getBoundingClientRect().bottom,
          columns: Array.from(document.querySelectorAll<HTMLElement>('[role="radiogroup"]')).map((group) => {
            const scroller = group.parentElement!
            const selected = group.querySelector<HTMLElement>('[aria-checked="true"]')!
            const bounds = scroller.getBoundingClientRect()
            const selectedBounds = selected.getBoundingClientRect()
            return {
              height: scroller.clientHeight,
              width: scroller.clientWidth,
              selectedTop: selectedBounds.top - bounds.top,
              selectedBottom: selectedBounds.bottom - bounds.top,
              values: group.children.length,
              overscroll: getComputedStyle(scroller).overscrollBehaviorY,
            }
          }),
        }
      })
      expect(geometry.bodyContentHeight).toBeLessThanOrEqual(geometry.bodyHeight + 1)
      expect(geometry.bodyOffset).toBe(0)
      expect(geometry.footerBottom).toBeLessThanOrEqual(configuration.height)
      expect(geometry.columns).toHaveLength(configuration.hourCycle === 'h23' ? 2 : 3)
      expect(geometry.columns.map((column) => column.values)).toEqual(configuration.hourCycle === 'h23' ? [24, 60] : [12, 60, 2])
      for (const column of geometry.columns) {
        expect(column.height).toBeGreaterThanOrEqual(44)
        expect(column.height).toBeLessThanOrEqual(220)
        expect(column.width).toBeGreaterThanOrEqual(44)
        expect(column.selectedTop).toBeGreaterThanOrEqual(-1)
        expect(column.selectedBottom).toBeLessThanOrEqual(column.height + 1)
        expect(column.overscroll).toBe('contain')
      }
      const reachable = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="radiogroup"]')).every((group) => {
        const scroller = group.parentElement!
        return Array.from(group.children).every((option) => {
          const before = option.getBoundingClientRect()
          scroller.scrollTop += before.top - scroller.getBoundingClientRect().top
          const row = option.getBoundingClientRect()
          const viewport = scroller.getBoundingClientRect()
          return row.top >= viewport.top - 1 && row.bottom <= viewport.bottom + 1
        })
      }))
      expect(reachable).toBe(true)
      const minutes = page.getByRole('radiogroup', { name: 'common.minutes' })
      await minutes.getByRole('radio', { name: '59', exact: true }).hover()
      await page.mouse.wheel(0, 600)
      expect(await page.locator('[data-slot="sheet-body"]').evaluate((body) => body.scrollTop)).toBe(0)
      await page.getByRole('button', { name: 'common.close' }).click()
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      expect(await page.locator('#committed').textContent()).toBe('')
      expect(await page.getByRole('textbox').inputValue()).toBe(configuration.hourCycle === 'h23' ? configuration.value : configuration.value === '00:00' ? '12:00 am' : '11:59 pm')
      await page.getByRole('button').click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('radiogroup', { name: 'common.hours' }).getByRole('radio', { name: '01', exact: true }).click()
      await minutes.getByRole('radio', { name: '13', exact: true }).click()
      await page.getByRole('button', { name: 'common.done' }).click()
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      expect(await page.locator('#committed').textContent()).toBe(configuration.hourCycle === 'h12' && configuration.value !== '00:00' ? '13:13' : '01:13')
    } finally {
      await page.close()
    }
  })
})
