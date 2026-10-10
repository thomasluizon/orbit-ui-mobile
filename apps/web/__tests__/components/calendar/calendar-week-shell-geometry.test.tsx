import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
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
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1100, 1352].flatMap((width) => [1, 2].flatMap((scale) => (['light', 'dark'] as const).map((theme) => ({ width, scale, theme })))))('pins the week lanes with one hour scroll owner at $width, $scale text, $theme', async ({ width, scale, theme }) => {
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
