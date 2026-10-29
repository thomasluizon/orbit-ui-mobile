import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CheckRow } from '@/components/ui/check-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('personal checkbox glyph centring', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 412, 840, 1352].flatMap(width => [false, true].flatMap(checked =>
    ([undefined, 'calendar-day'] as const).map(variant => ({ width, checked, variant })),
  )))('centres $variant feedback at $width, checked $checked', async ({ width, checked, variant }) => {
    const markup = renderToStaticMarkup(<CheckRow label="Family calendar" textMode="personal" variant={variant}
      checked={checked} onChange={vi.fn()} onOpenLabel={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${variables}}body{padding:32px}</style>${markup}`)
      const control = page.getByRole('checkbox', { name: 'Family calendar' })
      for (const state of ['hover', 'press', 'focus']) {
        await control.hover()
        if (state === 'press') await page.mouse.down()
        if (state === 'focus') { await page.keyboard.press('Tab'); await control.focus() }
        const offset = await control.evaluate(button => {
          const fill = button.querySelector('[data-press-fill]')!.getBoundingClientRect()
          const graphic = button.querySelector('[data-slot="checkbox-box"], [data-slot="calendar-day-circle"]')!.getBoundingClientRect()
          return { x: Math.abs(graphic.left + graphic.right - fill.left - fill.right) / 2,
            y: Math.abs(graphic.top + graphic.bottom - fill.top - fill.bottom) / 2 }
        })
        expect(offset.x, state).toBeLessThanOrEqual(0.5)
        expect(offset.y, state).toBeLessThanOrEqual(0.5)
        await page.mouse.up()
      }
    } finally { await page.close() }
  })
})
