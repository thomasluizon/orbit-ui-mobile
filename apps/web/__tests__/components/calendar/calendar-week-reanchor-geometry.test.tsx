import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'

vi.mock('next/navigation', () => ({ usePathname: () => '/calendar', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Person', email: 'person@example.test' } }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: vi.fn() }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

describe('Week opening through day pane shrink in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch }, { ignoreDefaultArgs: ['--hide-scrollbars'] })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = execFileSync(resolve(process.cwd(), '../../node_modules/.bin/esbuild'), [
      '--bundle', '--loader=tsx', '--jsx=automatic', '--format=iife', '--platform=browser',
      '--define:process.env.NODE_ENV="production"', '--define:process.env={}',
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, input: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import { enUS, ptBR } from 'date-fns/locale';
      import en from '../../packages/shared/src/i18n/en.json';
      import pt from '../../packages/shared/src/i18n/pt-BR.json';
      import { buildCalendarDayMap, createTimeDisplay } from '../../packages/shared/src/utils';
      import { makeHabitScheduleItem } from '../../packages/shared/src/test-support/habit-detail-fixtures';
      import { CalendarWeekView } from './components/calendar/calendar-week-view';
      const language = document.documentElement.lang;
      const messages = language === 'en' ? en : pt;
      const columns = Array.from({ length: 7 }, (_, index) => ({ date: new Date(Date.UTC(2026, 7, 31 + index)), dateStr: new Date(Date.UTC(2026, 7, 31 + index)).toISOString().slice(0, 10), isToday: index === 4, isFuture: index > 4 }));
      const dates = columns.map(({ dateStr }) => dateStr);
      const habits = [['Read', '09:00'], ['Read together', '09:30'], ['Read later', null]].map(([title, dueTime], index) =>
        makeHabitScheduleItem({ id: 'habit-' + index, title, dueTime, dueDate: dates[0], scheduledDates: dates, children: [], hasSubHabits: false }));
      const dayMap = buildCalendarDayMap({ habits, logs: {} }, { from: dates[0], to: dates[6] });
      const root = createRoot(document.getElementById('root'));
      function draw(loaded) { root.render(<NextIntlClientProvider locale={language} messages={messages} timeZone="UTC">
        <div className="flex min-h-0 flex-1 flex-col">
          <CalendarWeekView columns={columns} dayMap={loaded ? dayMap : new Map()}
            slideDirection={null} isLoading={!loaded} onSelectDay={() => {}} displayTime={createTimeDisplay(language, true).displayTime} dateFnsLocale={language === 'en' ? enUS : ptBR}
            allDayLabel={messages.calendar.timeGrid.noSetTime} nowLabel={messages.calendar.timeGrid.now} timeZone="UTC" />
        </div>
      </NextIntlClientProvider>); }
      draw(false);
      document.addEventListener('week-loaded', () => draw(true));
    ` })
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([840, 1100].flatMap(width => ['en', 'pt-BR'].flatMap(language => (['opening', 'wheel', 'keyboard', 'scrollIntoView'] as const).map(input => ({ width, language, input })))))('reanchors opening and preserves deliberate $input through pinning at $width in $language', async ({ width, language, input }) => {
    const page = await browser.newPage({ viewport: { width, height: 726 } })
    try {
      await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'))
      const view = render(<NextIntlClientProvider locale={language} messages={language === 'en' ? en : ptBR} timeZone="UTC">
        <DestinationShell onCreate={() => {}}><RouteTransitionShell className="has-[[data-page-viewport]]:h-full">
          <div data-page-viewport="" className="relative flex h-full min-h-0 flex-col">
            <div className="shrink-0" style={{ height: 128 }}>Calendar options</div>
            <div id="root" className="flex min-h-0 flex-1 flex-col" />
          </div>
        </RouteTransitionShell></DestinationShell>
      </NextIntlClientProvider>)
      await page.setContent(`<!doctype html><html lang="${language}"><style>${stylesheet}</style>${view.container.innerHTML}</html>`)
      view.unmount()
      const oversized = await page.addStyleTag({ content: '[data-testid="time-grid-all-day-band"] { min-height: 300px !important }' })
      await page.addScriptTag({ content: script })
      const scroller = page.getByTestId('time-grid-hour-scroller')
      const pane = page.getByTestId('time-grid-day-pane')
      await pane.waitFor()
      await expect.poll(() => pane.getAttribute('data-pinning')).toBe('scrolling')
      await scroller.evaluate(async () => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        document.dispatchEvent(new Event('week-loaded'))
      })
      const nowPosition = () => scroller.evaluate(element => {
        const viewport = element.getBoundingClientRect()
        const pane = element.firstElementChild!
        const hourTop = pane.getAttribute('data-pinning') === 'pinned'
          ? Math.max(viewport.top + element.clientTop, pane.getBoundingClientRect().bottom) : viewport.top + element.clientTop
        const hourBottom = viewport.top + element.clientTop + element.clientHeight
        const now = element.querySelector('[data-today="true"] > [role="img"]')!.getBoundingClientRect()
        return { offset: now.top - hourTop, upperThird: (hourBottom - hourTop) / 3, inside: now.top >= hourTop && now.top <= hourTop + (hourBottom - hourTop) / 3, top: element.scrollTop, left: element.scrollLeft }
      })
      await expect.poll(async () => {
        const position = await nowPosition()
        return position.offset >= 0 && position.offset <= position.upperThird
      }).toBe(true)
      const openingTop = await scroller.evaluate(element => element.scrollTop)
      if (input === 'wheel') {
        await scroller.hover()
        await page.mouse.wheel(0, -200)
      } else if (input === 'keyboard') {
        await page.getByTestId('time-grid-col-header').nth(4).focus()
        await page.keyboard.press('ArrowUp')
      } else if (input === 'scrollIntoView') {
        await page.getByTestId('time-grid-hour-label').first().evaluate(element => element.scrollIntoView({ block: 'start', inline: 'nearest' }))
      }
      const heldTop = input === 'opening' ? null : await scroller.evaluate(async element => {
        let previous = element.scrollTop
        let stableFrames = 0
        for (let frame = 0; frame < 120 && stableFrames < 4; frame++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          stableFrames = element.scrollTop === previous ? stableFrames + 1 : 0
          previous = element.scrollTop
        }
        return element.scrollTop
      })
      if (heldTop !== null) expect(heldTop).toBeLessThan(openingTop)
      await oversized.evaluate(element => {
        document.documentElement.style.fontSize = '17px'
        element.parentNode!.removeChild(element)
      })
      await loadAppFonts(page)
      await expect.poll(() => pane.getAttribute('data-pinning')).toBe('pinned')
      if (heldTop !== null) {
        await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBe(heldTop)
      } else {
        await expect.poll(async () => {
          const position = await nowPosition()
          return position.inside ? 'ready' : JSON.stringify(position)
        }).toBe('ready')
      }
    } finally { await page.close() }
  })
})
