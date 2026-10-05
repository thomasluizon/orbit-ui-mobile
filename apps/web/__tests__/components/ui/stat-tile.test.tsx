import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { skeletonPulseIterations } from '@orbit/shared/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { StatTile } from '@/components/ui/stat-tile'
import { Skeleton } from '@/components/ui/skeleton'
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

    it('settles both loading bars and suppresses their pulse under reduced motion', async () => {
      const { container, unmount } = render(<StatTile state="loading" loadingLabel="Loading" label="Logs" />)
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await page.evaluate((iterations) => document.documentElement.style.setProperty('--skeleton-pulse-iterations', String(iterations)), skeletonPulseIterations)
        const bars = page.locator('[aria-hidden="true"] > span:last-child, [data-state="loading"] > span > span:last-child[aria-hidden="true"]')
        const normal = await bars.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationIterationCount))
        expect(normal).toEqual([String(skeletonPulseIterations), String(skeletonPulseIterations)])
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const reduced = await bars.evaluateAll((elements) => elements.map((element) => ({
          duration: getComputedStyle(element).animationDuration, iterations: getComputedStyle(element).animationIterationCount,
        })))
        expect(reduced).toEqual([{ duration: '1e-05s', iterations: '1' }, { duration: '1e-05s', iterations: '1' }])
      } finally { await page.close(); unmount() }
    })

    it.each([320, 412, 1280].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))('holds the drawn start edge and exact height across states at $width and text scale $fontScale', async ({ width, fontScale }) => {
      for (const catalog of [en, ptBR]) {
        const labels = [catalog.progressScreen.streak.longest, catalog.streakDisplay.detail.tierTileLabel,
          catalog.progressScreen.window.completionRate, catalog.progressScreen.window.activeDays, catalog.progressScreen.window.bestWeekday]
        const { container, unmount } = render(
          <div style={{ padding: 16 }}>
            {labels.map((label) => <div key={label}>
              <StatTile value={21} label={label} />
              <StatTile state="loading" loadingLabel={catalog.calendar.loading} label={label} />
              <StatTile state="empty" emptyLabel={catalog.progressScreen.window.bestWeekdayEmpty} label={label} />
            </div>)}
            <Skeleton variant="stat-tile" label={catalog.calendar.loading} />
          </div>,
        )
        const page = await browser.newPage({ viewport: { width, height: 1400 } })
        try {
          await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
          await loadAppFonts(page)
          await page.evaluate((scale) => {
            const sizes = Array.from(document.querySelectorAll<HTMLElement>('span')).map((element) => ({ element,
              size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }))
            for (const { element, size, line } of sizes) {
              element.style.fontSize = `${size * scale}px`
              if (Number.isFinite(line)) element.style.lineHeight = `${line * scale}px`
            }
          }, fontScale)
          const geometry = await page.locator('[data-state], [data-variant="stat-tile"] > div').evaluateAll((tiles) => tiles.map((tile) => {
            const bounds = tile.getBoundingClientRect()
            const style = getComputedStyle(tile)
            const value = tile.children[0]!.getBoundingClientRect()
            const label = tile.children[1]!.getBoundingClientRect()
            const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
            return { height: bounds.height, expectedHeight: padding + value.height + label.height + 8,
              valueStart: value.left - bounds.left - parseFloat(style.paddingLeft),
              labelStart: label.left - bounds.left - parseFloat(style.paddingLeft),
              gap: label.top - value.bottom, padding }
          }))
          expect(geometry).toHaveLength(16)
          for (const tile of geometry) {
            expect(Math.abs(tile.valueStart)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(tile.labelStart)).toBeLessThanOrEqual(0.5)
            expect(tile.padding).toBe(32)
            expect(tile.gap).toBe(8)
            expect(tile.height).toBeCloseTo(tile.expectedHeight, 1)
            expect(tile.height).toBeCloseTo(32 + (22 * 1.4 + 20) * fontScale + 8, 1)
          }
        } finally { await page.close(); unmount() }
      }
    })

    it.each([320, 360, 412].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))('contains loading placeholders inside compact tile content at $width with root text scale $fontScale', async ({ width, fontScale }) => {
      for (const catalog of [en, ptBR]) {
        const { container, unmount } = render(
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fontScale === 1 ? 3 : 2}, minmax(0, 1fr))`, gap: 12, padding: '1rem' }}>
            {[1, 2, 3].map((key) => <StatTile key={key} state="loading" loadingLabel={catalog.calendar.loading} label={catalog.calendar.bestStreak} />)}
          </div>,
        )
        expect(screen.getAllByRole('status', { name: catalog.calendar.loading })).toHaveLength(3)
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
          await loadAppFonts(page)
          await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
          const geometry = await page.evaluate(() => ({
            pageWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            tiles: [...document.querySelectorAll<HTMLElement>('[data-state="loading"]')].map((tile) => {
              const bounds = tile.getBoundingClientRect()
              const style = getComputedStyle(tile)
              const value = tile.querySelector<HTMLElement>('[aria-hidden="true"]')!
              const placeholder = value.lastElementChild!.getBoundingClientRect()
              const label = tile.lastElementChild!.getBoundingClientRect()
              return { left: bounds.left, right: bounds.right, height: bounds.height,
                contentLeft: bounds.left + parseFloat(style.paddingLeft), contentRight: bounds.right - parseFloat(style.paddingRight),
                placeholderLeft: placeholder.left, placeholderRight: placeholder.right, placeholderWidth: placeholder.width,
                valueHeight: value.getBoundingClientRect().height, gap: label.top - value.getBoundingClientRect().bottom,
                busy: tile.getAttribute('aria-busy'), hidden: value.getAttribute('aria-hidden') }
            }),
          }))
          expect(geometry.scrollWidth, JSON.stringify(geometry)).toBe(geometry.pageWidth)
          expect(geometry.tiles).toHaveLength(3)
          for (const tile of geometry.tiles) {
            expect(tile.left).toBeGreaterThanOrEqual(16 * fontScale)
            expect(tile.right).toBeLessThanOrEqual(width - 16 * fontScale + 0.5)
            expect(tile.placeholderLeft).toBeGreaterThanOrEqual(tile.contentLeft - 0.5)
            expect(tile.placeholderRight).toBeLessThanOrEqual(tile.contentRight + 0.5)
            expect(tile.placeholderWidth).toBeGreaterThan(0)
            expect(tile.placeholderWidth).toBeLessThanOrEqual(64)
            expect(tile.height).toBeCloseTo(32 * fontScale + 22 * 1.4 + 20 + 8 * fontScale, 1)
            expect(tile.valueHeight).toBeCloseTo(22 * 1.4, 1)
            expect(tile.gap).toBe(8 * fontScale)
            expect(tile.busy).toBe('true')
            expect(tile.hidden).toBe('true')
          }
        } finally { await page.close(); unmount() }
      }
    })

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
            <div data-testid="loading-stat-tiles" className="flex flex-wrap gap-3" style={{ padding: 16 }}>
              {(['completionRate', 'activeDays', 'bestWeekday'] as const).map((key) => <StatTile key={key} state="loading" loadingLabel={catalog.calendar.loading} label={catalog.progressScreen.window[key]} />)}
            </div>
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
          const loadingGeometry = await page.locator('[data-testid="loading-stat-tiles"] > [data-state="loading"]').evaluateAll((tiles) => tiles.map((tile) => {
            const bounds = tile.getBoundingClientRect()
            const style = getComputedStyle(tile)
            const value = tile.querySelector<HTMLElement>('[aria-hidden="true"]')!
            const placeholder = value.lastElementChild!.getBoundingClientRect()
            const label = tile.lastElementChild!
            const text = document.createRange()
            text.selectNodeContents(label)
            const labelBounds = text.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, height: bounds.height,
              contentLeft: bounds.left + parseFloat(style.paddingLeft), contentRight: bounds.right - parseFloat(style.paddingRight),
              placeholderLeft: placeholder.left, placeholderRight: placeholder.right,
              labelLeft: labelBounds.left, labelRight: labelBounds.right,
              valueFontSize: parseFloat(getComputedStyle(value).fontSize), labelFontSize: parseFloat(getComputedStyle(label).fontSize) }
          }))
          expect(loadingGeometry).toHaveLength(3)
          for (const tile of loadingGeometry) {
            expect(tile.left).toBeGreaterThanOrEqual(16)
            expect(tile.right).toBeLessThanOrEqual(width - 16 + 0.5)
            expect(tile.placeholderLeft).toBeGreaterThanOrEqual(tile.contentLeft - 0.5)
            expect(tile.placeholderRight).toBeLessThanOrEqual(tile.contentRight + 0.5)
            expect(tile.labelLeft).toBeGreaterThanOrEqual(tile.contentLeft - 0.5)
            expect(tile.labelRight).toBeLessThanOrEqual(tile.contentRight + 0.5)
            expect(tile.valueFontSize).toBe(22 * fontScale)
            expect(tile.labelFontSize).toBe(14 * fontScale)
            expect(tile.height).toBeCloseTo(32 + (22 * 1.4 + 20) * fontScale + 8, 1)
          }
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
    expect(value.parentElement!.style.minHeight).toBe('')
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
