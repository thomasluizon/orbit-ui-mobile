import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { STAT_TILE_MIN_HEIGHT, StatTile } from '@/components/ui/stat-tile'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

describe('StatTile', () => {
  it('uses the drawn Calendar captions in both locales', () => {
    expect([en.calendar.bestStreak, en.calendar.totalLogs, en.calendar.missedCount])
      .toEqual(['Best', 'Logged', 'Not logged'])
    expect([ptBR.calendar.bestStreak, ptBR.calendar.totalLogs, ptBR.calendar.missedCount])
      .toEqual(['Recorde', 'Registros', 'Sem registro'])
  })

  describe('weekday geometry in Chromium', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string

    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await launch
    })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
      stylesheet = compiled.css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each([320, 360, 384, 412].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))('keeps captions and values on one line at $width with text scale $fontScale in both locales', async ({ width, fontScale }) => {
      for (const catalog of [en, ptBR]) {
        const { container, unmount } = render(
          <div style={{ width }}>
            <CalendarStats stats={[
              { key: 'bestStreak', value: 123, label: catalog.calendar.bestStreak },
              { key: 'totalLogs', value: 999, label: catalog.calendar.totalLogs },
              { key: 'missed', value: 31, label: catalog.calendar.missedCount },
            ]} />
            <CalendarStats state="loading" loadingLabel={catalog.calendar.loading} stats={[
              { key: 'bestStreak', value: 123, label: catalog.calendar.bestStreak },
              { key: 'totalLogs', value: 999, label: catalog.calendar.totalLogs },
              { key: 'missed', value: 31, label: catalog.calendar.missedCount },
            ]} />
            <CalendarStats state="empty" emptyLabel={catalog.calendar.emptyStat} stats={[
              { key: 'bestStreak', value: 0, label: catalog.calendar.bestStreak },
              { key: 'totalLogs', value: 0, label: catalog.calendar.totalLogs },
              { key: 'missed', value: 0, label: catalog.calendar.missedCount },
            ]} />
            <div className="flex flex-wrap gap-3" style={{ padding: 16 }}>
              <StatTile value="100%" label={catalog.progressScreen.window.completionRate} />
              <StatTile value={30} label={catalog.progressScreen.window.activeDays} />
              {Object.values(catalog.dates.daysAbbreviated).map((weekday) => <StatTile key={weekday} value={weekday} label={catalog.progressScreen.window.bestWeekday} />)}
              <StatTile state="empty" emptyLabel={catalog.progressScreen.window.bestWeekdayEmpty} label={catalog.progressScreen.window.bestWeekday} />
            </div>
          </div>,
        )
        const page = await browser.newPage({ viewport: { width, height: 1400 } })
        try {
          await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
          await loadAppFonts(page)
          await page.evaluate((scale) => {
            const elements = Array.from(document.querySelectorAll<HTMLElement>('div, span'))
            const sizes = elements.map((element) => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }))
            for (const { element, size, line } of sizes) { element.style.fontSize = `${size * scale}px`; if (Number.isFinite(line)) element.style.lineHeight = `${line * scale}px` }
          }, fontScale)
          const calendarHeights = await page.locator('[data-testid="calendar-stats"]').evaluateAll((rows) => rows.slice(0, 2).map((row) => Array.from(row.children, (figure) => figure.getBoundingClientRect().height)))
          expect(calendarHeights[0]).toEqual(calendarHeights[1])
          const geometry = await page.locator('[data-state="default"] > span, [data-state="empty"] > span').evaluateAll((elements) => elements.map((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const bounds = range.getBoundingClientRect()
            const parent = element.parentElement!
            const tile = parent.getBoundingClientRect()
            return { text: element.textContent, lines: range.getClientRects().length,
              clipped: getComputedStyle(element).overflow === 'hidden',
              inside: bounds.left >= tile.left - 0.5 && bounds.right <= tile.right + 0.5 }
          }))
          expect(geometry.length).toBeGreaterThan(20)
          for (const measured of geometry) {
            expect(measured.lines, measured.text!).toBe(1)
            expect(measured.clipped, measured.text!).toBe(false)
            expect(measured.inside, measured.text!).toBe(true)
          }
        } finally { await page.close(); unmount() }
      }
    })
  })

  it('renders value and label', () => {
    render(<StatTile  value="7 dias" label="Sequência" />)
    expect(screen.getByText('7 dias')).toBeInTheDocument()
    expect(screen.getByText('Sequência')).toBeInTheDocument()
  })

  it('renders numeric values', () => {
    render(<StatTile  value={12} label="Total" />)
    expect(screen.getByText('12')).toHaveStyle({ fontVariantNumeric: 'tabular-nums' })
  })

  it('renders short values at the compact value size', () => {
    render(<StatTile value="Wed" label="Best weekday" />)
    const value = screen.getByText('Wed')
    expect(value).toHaveStyle({ fontSize: 22, whiteSpace: 'nowrap' })
    expect(value.parentElement).toHaveStyle({ minHeight: STAT_TILE_MIN_HEIGHT })
  })

  it.each(['dark', 'light'] as const)('keeps empty text above the normal-text contrast floor in %s', (mode) => {
    render(<StatTile state="empty" emptyLabel="No data" label="Top habit" />)
    const renderedColor = screen.getByText('No data').style.color
    const theme = resolveWebThemeVariables('purple', mode)
    const foreground = theme[renderedColor.slice(4, -1) as `--${string}`]!

    expect(contrastOnSurface(foreground, [theme['--bg']!, theme['--bg-card']!]))
      .toBeGreaterThanOrEqual(4.5)
  })
})
