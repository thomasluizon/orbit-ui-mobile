import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { render, screen } from '@testing-library/react'

import { CalendarStats } from '@/components/calendar/calendar-stats'

describe('CalendarStats', () => {
  it('renders the three month figures in three columns', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', value: 5, label: 'Best streak' },
          { key: 'totalLogs', value: 12, label: 'Logs' },
          { key: 'missed', value: 3, label: 'Missed' },
        ] as const}
      />,
    )

    expect(screen.getByTestId('calendar-figures')).toHaveStyle({
      gap: '16px',
    })
    expect(screen.getByText('Best streak')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('uses each tile own loading state', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', value: 5, label: 'Best streak' },
          { key: 'totalLogs', value: 12, label: 'Total logs' },
          { key: 'missed', value: 3, label: 'Missed' },
        ]}
        state="loading"
        loadingLabel="Loading"
      />,
    )

    expect(screen.getByTestId('calendar-stats')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('status', { name: 'Loading', hidden: true })).toHaveLength(3)
    for (const placeholder of screen.getAllByText('0')) expect(placeholder.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('states no data instead of zero for an empty month', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', value: 0, label: 'Best streak' },
          { key: 'totalLogs', value: 0, label: 'Total logs' },
          { key: 'missed', value: 0, label: 'Missed' },
        ]}
        state="empty"
        emptyLabel="no data"
      />,
    )

    expect(screen.getAllByText('no data')).toHaveLength(3)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})


describe('CalendarStats geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([en, ptBR].flatMap((words) => [280, 311, 312, 320, 360, 384, 412, 600].map((width) => ({ words, width }))))('aligns figures and preserves state heights at $width', async ({ words, width }) => {
    const stats = [
      { key: 'bestStreak', value: 123, label: words.calendar.bestStreak },
      { key: 'totalLogs', value: 999, label: words.calendar.totalLogs },
      { key: 'missed', value: 31, label: words.calendar.missedCount },
    ] as const
    const { container } = render(<>
      <CalendarStats stats={stats} />
      <CalendarStats stats={stats} state="loading" loadingLabel={words.calendar.loading} />
      <CalendarStats stats={stats} state="empty" emptyLabel={words.calendar.emptyStat} />
    </>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const figures = await page.locator('[data-state]').evaluateAll((elements) => elements.map((figure) => {
        const value = figure.children[0]!
        const caption = figure.children[1]!
        const box = figure.getBoundingClientRect()
        const valueBox = value.getBoundingClientRect()
        const captionBox = caption.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(caption)
        const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
        return {
          left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height,
          valueLeft: valueBox.left, captionLeft: captionBox.left, gap: captionBox.top - valueBox.bottom,
          lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
          fits: fragments.every((rect) => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5),
        }
      }))
      expect(figures).toHaveLength(9)
      for (const figure of figures) {
        expect(Math.abs(figure.valueLeft - figure.left)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(figure.captionLeft - figure.left)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(figure.gap - 8)).toBeLessThanOrEqual(0.5)
        expect(figure.lines).toBe(1)
        expect(figure.fits).toBe(true)
        expect(Math.abs(figure.height - 58.8)).toBeLessThanOrEqual(0.5)
      }
      for (let offset = 0; offset < figures.length; offset += 3) {
        const group = figures.slice(offset, offset + 3)
        expect(group[0]!.left).toBe(16)
        for (let index = 1; index < group.length; index++) {
          const previous = group[index - 1]!
          const current = group[index]!
          expect(Math.abs(current.width - previous.width)).toBeLessThanOrEqual(0.5)
          if (width - 32 < 20 * 14) {
            expect(current.left).toBe(16)
            expect(Math.abs(current.top - previous.bottom - 16)).toBeLessThanOrEqual(0.5)
          } else {
            expect(Math.abs(current.left - previous.right - 16)).toBeLessThanOrEqual(0.5)
            expect(current.top).toBe(previous.top)
          }
        }
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR])('lets enlarged captions reflow within a narrow group', async (words) => {
    const { container } = render(<CalendarStats stats={[
      { key: 'bestStreak', value: 123, label: words.calendar.bestStreak },
      { key: 'totalLogs', value: 999, label: words.calendar.totalLogs },
      { key: 'missed', value: 31, label: words.calendar.missedCount },
    ]} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await page.locator('[data-testid="calendar-stats"]').evaluate((element) => {
        const group = element as HTMLElement
        group.style.width = '160px'
        group.style.fontSize = '28px'
        for (const figure of group.querySelectorAll<HTMLElement>('[data-state]')) {
          const caption = figure.lastElementChild as HTMLElement
          caption.style.lineHeight = '40px'
        }
      })
      const captions = await page.locator('[data-state] > span:last-child').evaluateAll((elements) => elements.map((caption) => {
        const bounds = caption.parentElement!.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(caption)
        const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
        return {
          lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
          fits: fragments.every((rect) => rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5),
        }
      }))
      expect(captions).toHaveLength(3)
      expect(captions.some((caption) => caption.lines > 1)).toBe(true)
      for (const caption of captions) expect(caption.fits).toBe(true)
    } finally { await page.close() }
  })

})
