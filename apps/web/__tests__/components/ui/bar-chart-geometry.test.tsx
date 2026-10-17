import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { BarChart } from '@/components/ui/bar-chart'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const series = { granularity: 'day' as const, points: Array.from({ length: 30 }, (_, index) => ({
  startDate: `2026-09-${String(index + 1).padStart(2, '0')}`, endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  scheduled: index === 0 ? 0 : 4, completed: index < 2 ? 0 : 2, completionRate: index === 0 ? null : index === 1 ? 0 : 50,
})) }

describe('BarChart measured geometry', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

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
            return { left: box.left - bounds.left, right: box.right - bounds.left, height: box.height, hit: [1, box.height - 1].every((offset) => document.elementFromPoint(box.left + box.width / 2, box.top + offset) === radio) }
          })
          return { width: bounds.width, targets, readoutLeft: readout.left - bounds.left, readoutRight: readout.right - bounds.left,
            stubs: [...chart.querySelectorAll<SVGGraphicsElement>('path[data-empty]')].map((stub) => stub.getBBox().height),
            textInside: text.left >= readout.left - 0.1 && text.right <= readout.right + 0.1 && text.bottom <= readout.bottom + 0.1,
            readoutLines: range.getClientRects().length, plotGap: plot.top - readout.bottom,
            scrollWidth: chart.scrollWidth, clientWidth: chart.clientWidth }
        })
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
