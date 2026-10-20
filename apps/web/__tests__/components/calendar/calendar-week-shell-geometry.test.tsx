import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enUS } from 'date-fns/locale'
import en from '@orbit/shared/i18n/en.json'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const route = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Person', email: 'person@example.com' } }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: vi.fn() }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

const columns = Array.from({ length: 7 }, (_, index) => ({ date: new Date(2026, 9, 5 + index), dateStr: `2026-10-${String(5 + index).padStart(2, '0')}`, isToday: index === 3, isFuture: index > 3 }))
const dayMap = new Map(columns.map(({ dateStr }) => [dateStr, [
  { habitId: 'timed', title: 'Beber água', dueTime: '08:00', status: 'upcoming' as const, isBadHabit: false, isOneTime: false },
  ...Array.from({ length: 3 }, (_, index) => ({ habitId: `untimed-${index}`, title: `Read ${index}`, dueTime: null, status: 'upcoming' as const, isBadHabit: false, isOneTime: false })),
]]))

function renderDestination(content: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <DestinationShell onCreate={vi.fn()}>
      <RouteTransitionShell className="has-[[data-page-viewport]]:h-full">{content}</RouteTransitionShell>
    </DestinationShell>
  </NextIntlClientProvider>)
}

function weekBody() {
  return <div data-page-viewport="" className="relative flex h-full min-h-0 flex-col">
    <div className="shrink-0"><button type="button" style={{ minHeight: 48 }}>Calendar options</button></div>
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CalendarWeekView columns={columns} dayMap={dayMap} slideDirection={null} onSelectDay={vi.fn()} displayTime={(time) => time} dateFnsLocale={enUS} allDayLabel={en.calendar.timeGrid.noSetTime} nowLabel={en.calendar.timeGrid.now} timeZone="UTC" />
    </div>
  </div>
}

describe('Calendar week through the destination shell and route transition', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let weekScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    weekScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const result = await build(JSON.parse(process.argv[1]));
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify({
      stdin: { contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { NextIntlClientProvider } from 'next-intl';
        import { enUS } from 'date-fns/locale';
        import en from '../../packages/shared/src/i18n/en.json';
        import { CalendarWeekView } from './components/calendar/calendar-week-view';
        const fixture = JSON.parse(document.getElementById('week-fixture').textContent);
        const columns = fixture.columns.map(column => ({ ...column, date: new Date(column.date) }));
        const host = document.querySelector('[data-testid="calendar-time-grid"]').parentElement.parentElement;
        const root = createRoot(host);
        function draw(dayMap) {
          root.render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><div data-live-week="" className="flex min-h-0 flex-1 flex-col">
            <CalendarWeekView columns={columns} dayMap={dayMap} slideDirection={null} onSelectDay={() => {}}
              displayTime={time => time} dateFnsLocale={enUS} allDayLabel={en.calendar.timeGrid.noSetTime}
              nowLabel={en.calendar.timeGrid.now} timeZone="UTC" />
          </div></NextIntlClientProvider>);
        }
        draw(new Map(fixture.dayMap));
        document.addEventListener('week-refetch', () => draw(new Map(fixture.dayMap.map(([date, entries]) => [date, entries.slice(0, 2)]))));`,
      resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    })], { maxBuffer: 10 * 1024 * 1024 }).toString()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([
    { width: 320, scale: 1, top: 0 }, { width: 320, scale: 1, top: 123 }, { width: 320, scale: 1, top: 600 },
    { width: 320, scale: 2, top: 600 }, { width: 412, scale: 1, top: 600 },
    { width: 600, scale: 1, top: 600 }, { width: 1352, scale: 1, top: 600 },
  ].flatMap((viewport) => [2, 300, 10_000].map((offset) => ({ ...viewport, offset }))))('settles $offset horizontal pixels on a day boundary at $width, $scale text, $top vertical pixels', async ({ width, scale, top, offset }) => {
    route.pathname = '/calendar'
    const view = renderDestination(weekBody())
    const page = await browser.newPage({ viewport: { width, height: 640 } })
    try {
      await page.setContent(`<!doctype html><style>${stylesheet} :root { font-size: ${16 * scale}px }</style>${view.container.innerHTML}<script id="week-fixture" type="application/json">${JSON.stringify({ columns, dayMap: [...dayMap] })}</script>`)
      await page.addScriptTag({ content: weekScript })
      await page.locator('[data-live-week] [data-testid="time-grid-hour-scroller"]').waitFor()
      const scroller = page.getByTestId('time-grid-hour-scroller')
      const geometry = await scroller.evaluate(async (element, { top, offset }) => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        element.scrollTop = top
        element.scrollLeft = offset
        let previous = element.scrollLeft
        let stableFrames = 0
        for (let frame = 0; frame < 120 && stableFrames < 4; frame++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          stableFrames = element.scrollLeft === previous ? stableFrames + 1 : 0
          previous = element.scrollLeft
        }
        const gutter = element.querySelector('[data-testid="time-grid-any-time-label"]')!.parentElement!.getBoundingClientRect()
        const headers = [...element.querySelectorAll('[data-testid="time-grid-col-header"]')].map((header) => header.getBoundingClientRect())
        const firstVisible = headers.find((header) => header.right > gutter.right + 0.5)!
        return { left: firstVisible.left, gutterRight: gutter.right, top: element.scrollTop, stableFrames, offset: element.scrollLeft, columnWidth: firstVisible.width, lastRight: headers.at(-1)!.right }
      }, { top, offset })
      expect(geometry.stableFrames).toBe(4)
      expect(geometry.left, JSON.stringify(geometry)).toBeCloseTo(geometry.gutterRight, 1)
      expect(geometry.offset % geometry.columnWidth).toBeCloseTo(0, 1)
      if (offset === 2) expect(geometry.offset).toBe(0)
      else expect(geometry.offset).toBeGreaterThan(100)
      if (offset === 10_000) expect(geometry.lastRight).toBeGreaterThan(geometry.gutterRight)
      expect(geometry.top).toBe(top)
    } finally { await page.close(); view.unmount() }
  })

  it.each(['wheel', 'scrollIntoView', 'keyboard'] as const)('holds a settled %s position through refetch and resize', async (input) => {
    route.pathname = '/calendar'
    const view = renderDestination(weekBody())
    const page = await browser.newPage({ viewport: { width: 412, height: 640 } })
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${view.container.innerHTML}<script id="week-fixture" type="application/json">${JSON.stringify({ columns, dayMap: [...dayMap] })}</script>`)
      await page.addScriptTag({ content: weekScript })
      await page.locator('[data-live-week] [data-testid="time-grid-hour-scroller"]').waitFor()
      const scroller = page.getByTestId('time-grid-hour-scroller')
      const position = () => scroller.evaluate(async (element) => {
        let previous = element.scrollLeft
        let stableFrames = 0
        for (let frame = 0; frame < 120 && stableFrames < 4; frame++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          stableFrames = element.scrollLeft === previous ? stableFrames + 1 : 0
          previous = element.scrollLeft
        }
        return { left: element.scrollLeft, top: element.scrollTop }
      })
      const opening = await position()
      expect(opening.left).toBeGreaterThan(100)
      if (input === 'wheel') { await scroller.hover(); await page.mouse.wheel(-400, 0) }
      else if (input === 'scrollIntoView') await page.getByTestId('time-grid-col-header').first().evaluate((element) => element.scrollIntoView({ inline: 'start', block: 'nearest' }))
      else { await page.getByTestId('time-grid-col-header').nth(3).focus(); await page.keyboard.press('ArrowLeft') }
      await expect.poll(async () => (await position()).left).toBeLessThan(opening.left - 100)
      const held = await position()
      expect(held.left % 192).toBe(0)
      await page.evaluate(() => document.dispatchEvent(new Event('week-refetch')))
      await expect.poll(() => page.getByTestId('time-grid-all-day-more').count()).toBe(0)
      expect(await position()).toEqual(held)
      await page.setViewportSize({ width: 412, height: 560 })
      expect(await position()).toEqual(held)
    } finally { await page.close(); view.unmount() }
  })

  it('keeps the vertical offset when the day pane changes height', async () => {
    route.pathname = '/calendar'
    const view = renderDestination(weekBody())
    const page = await browser.newPage({ viewport: { width: 412, height: 640 } })
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${view.container.innerHTML}`)
      const scroller = page.getByTestId('time-grid-hour-scroller')
      await scroller.evaluate(async (element) => {
        const pane = element.querySelector<HTMLElement>('[data-testid="time-grid-day-pane"]')!
        pane.style.position = 'relative'
        pane.style.minHeight = '300px'
        element.scrollTop = 600
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      })
      expect(await scroller.evaluate((element) => element.scrollTop)).toBe(600)
      for (const height of [400, 200]) {
        await scroller.evaluate(async (element, height) => {
          element.querySelector<HTMLElement>('[data-testid="time-grid-day-pane"]')!.style.minHeight = `${height}px`
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }, height)
        expect(await scroller.evaluate((element) => element.scrollTop)).toBe(600)
      }
    } finally { await page.close(); view.unmount() }
  })

  it.each([412, 600, 1100, 1352].flatMap((width) => [1, 2].flatMap((scale) => (['light', 'dark'] as const).map((theme) => ({ width, scale, theme })))))('pins the week lanes with one hour scroll owner at $width, $scale text, $theme', async ({ width, scale, theme }) => {
    route.pathname = '/calendar'
    const view = renderDestination(weekBody())
    const page = await browser.newPage({ viewport: { width, height: width === 412 ? 640 : 726 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><html class="${theme}"><style>${stylesheet}\n:root{${variables};font-size:${16 * scale}px}</style>${view.container.innerHTML}</html>`)
      for (const position of ['start', 'end'] as const) {
        const geometry = await page.evaluate((position) => {
          const body = document.querySelector<HTMLElement>('[data-testid="time-grid-hour-scroller"]')!
          body.scrollTop = position === 'start' ? 0 : body.scrollHeight
          const row = document.querySelector('[data-testid="time-grid-hour-label"]')!
          const header = document.querySelector('[data-testid="time-grid-col-header"]')!.parentElement!
          const lane = document.querySelector('[data-testid="time-grid-all-day-band"]')!
          const options = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Calendar options')!
          const ancestors: HTMLElement[] = []
          for (let node = row.parentElement; node; node = node.parentElement) {
            if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) ancestors.push(node)
          }
          const rect = (node: Element) => { const bounds = node.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom } }
          const shell = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          return { owners: ancestors.filter((node) => node.scrollHeight > node.clientHeight + 1).map((node) => node.dataset.testid ?? 'shell'), header: rect(header), lane: rect(lane), options: rect(options), ancestors: ancestors.map(rect), shell: { height: shell.clientHeight, scroll: shell.scrollHeight }, body: { height: body.clientHeight, scroll: body.scrollHeight } }
        }, position)
        expect(geometry.body.height, JSON.stringify(geometry)).toBeGreaterThan(0)
        expect(geometry.owners, JSON.stringify(geometry)).toEqual(['time-grid-hour-scroller'])
        expect(geometry.shell.scroll).toBeLessThanOrEqual(geometry.shell.height + 1)
        for (const ancestor of geometry.ancestors) {
          expect(geometry.header.top).toBeGreaterThanOrEqual(ancestor.top - 1)
          expect(geometry.header.bottom).toBeLessThanOrEqual(ancestor.bottom + 1)
          expect(geometry.lane.bottom).toBeLessThanOrEqual(ancestor.bottom + 1)
        }
        expect(geometry.header.top).toBeGreaterThanOrEqual(geometry.options.bottom)
        expect(geometry.body.scroll).toBeGreaterThan(geometry.body.height)
      }
    } finally { await page.close(); view.unmount() }
  })

  it.each(['/', '/progress', '/profile', '/calendar'].flatMap((pathname) => [412, 1100, 1352].map((width) => ({ pathname, width }))))('keeps long destination content and shell bottom clearance at $pathname, $width', async ({ pathname, width }) => {
    route.pathname = pathname
    const view = renderDestination(<div style={{ height: 1600, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><span>Page start</span><div data-page-end="">Page end</div></div>)
    const page = await browser.newPage({ viewport: { width, height: 726 } })
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${view.container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        shell.scrollTop = shell.scrollHeight
        const end = document.querySelector('[data-page-end]')!.getBoundingClientRect()
        return { scroll: shell.scrollHeight, height: shell.clientHeight, bottom: shell.getBoundingClientRect().bottom, end: end.bottom, padding: Number.parseFloat(getComputedStyle(shell).paddingBottom), page: document.documentElement.scrollHeight, viewport: innerHeight }
      })
      expect(geometry.scroll).toBeGreaterThan(geometry.height)
      expect(geometry.end).toBeLessThanOrEqual(geometry.bottom - geometry.padding + 1)
      expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1)
    } finally { await page.close(); view.unmount() }
  })
})
