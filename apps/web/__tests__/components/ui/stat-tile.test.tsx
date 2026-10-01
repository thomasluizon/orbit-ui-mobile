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
import { STAT_TILE_MIN_HEIGHT, StatTile } from '@/components/ui/stat-tile'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

describe('StatTile', () => {
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

    it.each([320, 344, 360, 411, 412, 1352])('fits every localized weekday at %ipx', async (width) => {
      const weekdays = [...Object.values(en.dates.daysValue), ...Object.values(ptBR.dates.daysValue)]
      const { container } = render(
        <div className="grid grid-cols-1 gap-3 min-[344px]:grid-cols-2 md:grid-cols-4" style={{ width: Math.min(width - 32, 740) }}>
          {weekdays.map((weekday) => <StatTile key={weekday} value={weekday} label="Best weekday" valueSize="lg" />)}
        </div>,
      )
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.locator('.stat-tile-large-value').evaluateAll((elements) => elements.map((element) => {
          const valueBounds = element.getBoundingClientRect()
          const tile = element.parentElement!
          const tileBounds = tile.getBoundingClientRect()
          const style = getComputedStyle(element)
          const range = document.createRange()
          range.selectNodeContents(element)
          const textWidth = range.getBoundingClientRect().width
          return {
            weekday: element.textContent,
            size: Number.parseFloat(style.fontSize),
            textWidth,
            contentWidth: tile.clientWidth - Number.parseFloat(getComputedStyle(tile).paddingLeft) - Number.parseFloat(getComputedStyle(tile).paddingRight),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            inside: valueBounds.left >= tileBounds.left && valueBounds.right <= tileBounds.right
              && valueBounds.top >= tileBounds.top && valueBounds.bottom <= tileBounds.bottom,
          }
        }))
        for (const measured of geometry) {
          expect(measured.size, measured.weekday!).toBe(width >= 344 && width < 412 ? 17 : 22)
          expect(measured.textWidth, measured.weekday!).toBeLessThanOrEqual(measured.contentWidth)
          expect(measured.scrollWidth, measured.weekday!).toBeLessThanOrEqual(measured.clientWidth)
          expect(measured.inside, measured.weekday!).toBe(true)
        }
        if (width === 344) {
          const nextSizeWidths = await page.locator('.stat-tile-large-value').evaluateAll((elements) => elements.map((element) => {
            (element as HTMLElement).style.fontSize = 'var(--fs-lg)'
            const range = document.createRange()
            range.selectNodeContents(element)
            return range.getBoundingClientRect().width
          }))
          expect(Math.max(...nextSizeWidths), 'the next canvas size cannot fit the narrowest two-column tile').toBeGreaterThan(geometry[0]!.contentWidth)
        }
      } finally {
        await page.close()
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

  it('keeps large weekday values on one line for the tile width query', () => {
    render(<StatTile value="Wednesday" label="Best weekday" valueSize="lg" />)
    const value = screen.getByText('Wednesday')
    expect(value).toHaveClass('stat-tile-large-value', 'max-w-full', 'whitespace-nowrap')
    expect(value).not.toHaveClass('overflow-hidden', 'text-ellipsis', 'break-words')
    expect(value).not.toHaveStyle({ overflowWrap: 'anywhere' })
    expect(value.parentElement).toHaveClass('stat-tile-large', 'px-6', 'py-4')
    expect(value.parentElement).toHaveStyle({ minHeight: STAT_TILE_MIN_HEIGHT })
    expect(24 + 40 + 8 + 2 * 16).toBeLessThanOrEqual(STAT_TILE_MIN_HEIGHT)
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
