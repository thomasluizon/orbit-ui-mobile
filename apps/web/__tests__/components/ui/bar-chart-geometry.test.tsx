import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { barChartPath, resolveBarChartGeometry } from '@orbit/shared/contracts/display'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { INTERACTION_FILL_CLEARANCE, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { BarChart } from '@/components/ui/bar-chart'
import { settleAnimations } from '@/e2e/layout/settle-animations'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const series = { granularity: 'day' as const, points: Array.from({ length: 30 }, (_, index) => ({
  startDate: `2026-09-${String(index + 1).padStart(2, '0')}`, endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  scheduled: index === 0 ? 0 : 4, completed: index < 2 ? 0 : index === 2 ? 4 : 2, completionRate: index === 0 ? null : index === 1 ? 0 : index === 2 ? 100 : 50,
})) }

describe('BarChart measured geometry', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string
  let chartScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    chartScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const result = await build(JSON.parse(process.argv[1]));
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify({
      stdin: { contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { NextIntlClientProvider } from 'next-intl';
        import en from '../../packages/shared/src/i18n/en.json';
        import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
        import { mapCompletionSeries } from '../../packages/shared/src/utils/completion-series';
        import { BarChart } from './components/ui/bar-chart';
        const { series, locale } = JSON.parse(document.getElementById('chart-fixture').textContent);
        createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
          <BarChart points={mapCompletionSeries(series, locale)} label="Completion" />
        </NextIntlClientProvider>);`, resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    })], { maxBuffer: 10 * 1024 * 1024 }).toString()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([{ count: 53, width: 240 }, { count: 30, width: 288 }, { count: 240, width: 240 }].flatMap((plot) => (['en', 'pt-BR'] as const).flatMap((locale) => (['none', 'active'] as const).map((forcedColors) => ({ ...plot, locale, forcedColors })))))('paints visible hover and focus feedback for $count points in $width pixels, $locale, forced colors $forcedColors', async ({ count, width, locale, forcedColors }) => {
    const compactSeries = { granularity: 'week', points: Array.from({ length: count }, (_, index) => ({
      startDate: new Date(Date.UTC(2025, 0, 1 + index * 7)).toISOString().slice(0, 10),
      endDate: new Date(Date.UTC(2025, 0, 7 + index * 7)).toISOString().slice(0, 10),
      scheduled: 4, completed: 2, completionRate: 50,
    })) }
    const page = await browser.newPage({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce', forcedColors })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><html class="dark" style="${variables}"><style>${stylesheet}</style><body><div id="root" style="width:${width}px"></div><script id="chart-fixture" type="application/json">${JSON.stringify({ series: compactSeries, locale })}</script></body></html>`)
      await page.addScriptTag({ content: chartScript })
      const pointerTarget = page.getByRole('radio').nth(Math.floor(count / 2))
      await expect.poll(() => page.locator('[data-testid="bar-chart"] path').count()).toBe(count)
      const pointer = await pointerTarget.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return { x: bounds.left + bounds.width / 4, y: bounds.top + bounds.height / 2 }
      })
      await page.mouse.move(pointer.x, pointer.y)
      await pointerTarget.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const hoveredIndex = await pointerTarget.evaluate((element) => [...element.parentElement!.querySelectorAll('[role="radio"]')].findIndex((radio) => radio.matches(':hover')))
      expect(hoveredIndex).toBeGreaterThan(0)
      expect(hoveredIndex).toBeLessThan(count - 1)
      const target = page.getByRole('radio').nth(hoveredIndex)
      const measure = () => target.evaluate((element) => {
        const chart = element.closest('[data-testid="bar-chart"]')!
        const index = [...chart.querySelectorAll('[role="radio"]')].indexOf(element)
        const paths = chart.querySelectorAll('path')
        const bar = paths[index]!.getBoundingClientRect()
        const fill = element.querySelector<HTMLElement>('[data-slot="bar-chart-fill"]')!
        const focus = element.querySelector<HTMLElement>('[data-slot="bar-chart-focus"]')!
        const bounds = fill.getBoundingClientRect()
        const ring = focus.getBoundingClientRect()
        const focusStyle = getComputedStyle(focus)
        return { plotWidth: element.parentElement!.getBoundingClientRect().width, barWidth: bar.width, fillWidth: bounds.width, focusWidth: ring.width,
          background: getComputedStyle(fill).backgroundColor, outline: focusStyle.outlineStyle, outlineWidth: Number.parseFloat(focusStyle.outlineWidth), focusClip: focusStyle.clipPath,
          left: bar.left - bounds.left, right: bounds.right - bar.right,
          previousGap: bounds.left - paths[index - 1]!.getBoundingClientRect().right, nextGap: paths[index + 1]!.getBoundingClientRect().left - bounds.right }
      })
      const hovered = await measure()
      expect(hovered.plotWidth).toBe(width)
      expect(hovered.fillWidth).toBeGreaterThan(hovered.barWidth)
      expect(hovered.background).not.toBe('rgba(0, 0, 0, 0)')
      for (const gap of [hovered.left, hovered.right, hovered.previousGap, hovered.nextGap]) expect(gap).toBeGreaterThan(0)
      await page.mouse.move(319, 639)
      await page.keyboard.press('Tab')
      await target.focus()
      const focused = await measure()
      expect(focused.focusWidth).toBeGreaterThan(focused.barWidth)
      expect(focused.outline).toBe('solid')
      expect(focused.outlineWidth).toBeGreaterThanOrEqual(2)
      expect(focused.focusClip).toBe('inset(0px)')
    } finally { await page.close() }
  })

  it.each([320, 1352].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) => (['none', 'active'] as const).map((forcedColors) => ({ width, locale, forcedColors })))))('measures painted bars and rejects touching fills at $width in $locale with forced colors $forcedColors', async ({ width, locale, forcedColors }) => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.callback([{ contentRect: { width: width - 32 } }]) }
      disconnect() {}
    })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <div style={{ padding: 16 }}><BarChart points={mapCompletionSeries(series, locale)} label="Completion" /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', forcedColors })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      const markup = `<html class="dark" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`
      const measure = async (index: number) => {
        const target = page.getByRole('radio').nth(index)
        await target.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
        await target.evaluate(settleAnimations)
        return target.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      }
      const bars = resolveBarChartGeometry(series.points.map((point) => point.completionRate), width - 32)
      for (const index of [1, 2, 3]) {
        await page.setContent(markup)
        const target = page.getByRole('radio').nth(index)
        await target.hover()
        for (const state of ['hover', 'press'] as const) {
          if (state === 'press') await page.mouse.down()
          const result = await measure(index)
          expect(result.hasFill).toBe(true)
          expect(result.violations, state).toEqual([])
          if (state === 'press') await page.mouse.up()
        }
        await page.mouse.move(0, 0)
        await page.keyboard.press('Tab')
        await target.focus()
        const focused = await measure(index)
        expect(focused.hasFill).toBe(true)
        expect(focused.violations, 'focus').toEqual([])
        const touchingMarkup = markup.replace(barChartPath(bars[index]!), barChartPath({ ...bars[index]!, y: bars[index]!.y + 4 }))
        expect(touchingMarkup).not.toBe(markup)
        await page.setContent(touchingMarkup)
        await target.hover()
        expect((await measure(index)).violations.some((violation) => violation.distance < INTERACTION_FILL_CLEARANCE)).toBe(true)
        const crowdedMarkup = markup.replace(barChartPath(bars[index + 1]!), barChartPath({ ...bars[index + 1]!, x: bars[index + 1]!.x - 1 }))
        expect(crowdedMarkup).not.toBe(markup)
        await page.setContent(crowdedMarkup)
        await target.hover()
        expect((await measure(index)).violations.some((violation) => violation.distance < INTERACTION_FILL_CLEARANCE)).toBe(true)
      }
    } finally { await page.close(); vi.unstubAllGlobals() }
  })

  it.each([320, 412].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) => [1, 2].flatMap((scale) => (['day', 'week'] as const).map((granularity) => ({ width, locale, scale, granularity }))))))('bounds $granularity targets and edge readouts at $width in $locale at scale $scale', async ({ width, locale, scale, granularity }) => {
    const plotted = granularity === 'day' ? series : { granularity, points: [
      { startDate: '2026-09-07', endDate: '2026-09-13', scheduled: 0, completed: 0, completionRate: null },
      { startDate: '2026-09-14', endDate: '2026-09-20', scheduled: 4, completed: 0, completionRate: 0 },
      { startDate: '2026-09-28', endDate: '2026-09-30', scheduled: 2, completed: 1, completionRate: 50 },
    ] }
    let measureReadout: (entries: { contentRect: { width: number } }[]) => void = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: typeof measureReadout) {}
      observe(element: HTMLElement) {
        if (element.dataset.slot === 'bar-chart-readout') measureReadout = this.callback
        else this.callback([{ contentRect: { width: width - 32 } }])
      }
      disconnect() {}
    })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <div style={{ padding: 16 }}><BarChart points={mapCompletionSeries(plotted, locale)} label="Completion" /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const paint = async () => {
      await page.setContent(`<style>${stylesheet}[data-slot="bar-chart-readout"]{font-size:${14 * scale}px}</style>${container.innerHTML}`)
      await loadAppFonts(page)
    }
    try {
      for (const index of [0, plotted.points.length - 1]) {
        fireEvent.click(screen.getAllByRole('radio')[index]!)
        await paint()
        const measured = await page.locator('[data-slot="bar-chart-readout"]').evaluate((line) => new Promise<number>((resolve) => {
          const observer = new ResizeObserver(([entry]) => {
            observer.disconnect()
            resolve(entry!.contentRect.width)
          })
          observer.observe(line)
        }))
        act(() => measureReadout([{ contentRect: { width: measured } }]))
        await paint()
        const geometry = await page.getByTestId('bar-chart').evaluate((chart) => {
          const bounds = chart.getBoundingClientRect()
          const line = chart.querySelector('[data-slot="bar-chart-readout"]')!
          const readout = line.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(line)
          const text = range.getBoundingClientRect()
          const plot = chart.querySelector('[role="radiogroup"]')!.getBoundingClientRect()
          const targets = [...chart.querySelectorAll('[role="radio"]')].map((radio) => {
            const box = radio.getBoundingClientRect()
            return { left: box.left - bounds.left, right: box.right - bounds.left, height: box.height, hit: [1, box.width / 2, box.width - 1].every((inline) => [1, box.height - 1].every((offset) => document.elementFromPoint(box.left + inline, box.top + offset) === radio)) }
          })
          const barClearances = [...chart.querySelectorAll('path')].map((path, index) => {
            const bar = path.getBoundingClientRect()
            const fill = chart.querySelectorAll('[role="radio"]')[index]!.firstElementChild!.getBoundingClientRect()
            return { top: bar.top - fill.top, bottom: fill.bottom - bar.bottom, left: bar.left - fill.left, right: fill.right - bar.right }
          })
          return { barClearances, width: bounds.width, targets, readoutLeft: readout.left - bounds.left, readoutRight: readout.right - bounds.left,
            stubs: [...chart.querySelectorAll<SVGGraphicsElement>('path[data-empty]')].map((stub) => stub.getBBox().height),
            textInside: text.left >= readout.left - 0.1 && text.right <= readout.right + 0.1 && text.bottom <= readout.bottom + 0.1,
            readoutLines: range.getClientRects().length, plotGap: plot.top - readout.bottom,
            scrollWidth: chart.scrollWidth, clientWidth: chart.clientWidth }
        })
        for (const clearance of geometry.barClearances) {
          for (const gap of [clearance.top, clearance.bottom]) expect(gap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE - 0.01)
        }
        expect(geometry.targets).toHaveLength(plotted.points.length)
        expect(geometry.targets[0]!.left).toBe(0)
        for (const [index, target] of geometry.targets.entries()) {
          expect(target.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
          expect(target.hit).toBe(true)
          if (index > 0) expect(target.left).toBeCloseTo(geometry.targets[index - 1]!.right, 1)
        }
        expect(geometry.targets.at(-1)!.right).toBeCloseTo(geometry.width, 1)
        expect(geometry.readoutLeft).toBeGreaterThanOrEqual(0)
        expect(geometry.readoutRight).toBeLessThanOrEqual(geometry.width + 0.1)
        expect(geometry.stubs).toEqual([4, 4])
        expect(geometry.textInside).toBe(true)
        expect(geometry.readoutLines).toBeGreaterThanOrEqual(1)
        expect(geometry.plotGap).toBeGreaterThanOrEqual(8)
        expect(geometry.scrollWidth).toBe(geometry.clientWidth)
      }
    } finally { await page.close(); vi.unstubAllGlobals() }
  })
})
