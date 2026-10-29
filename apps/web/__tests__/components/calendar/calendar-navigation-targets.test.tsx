import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { CalendarOptions } from '@/app/(app)/calendar/_components/calendar-options'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { DestinationHeaderRow } from '@/components/navigation/root-notification-header'
import { NotificationBellDisplay } from '@/components/navigation/notification-bell'
import { readExpandedControlGeometry } from '@/e2e/layout/expanded-control-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 480, 840, 1100, 1440].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale })))

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 12 }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))

const todayProps = {
  dayName: 'Friday', numericDate: '4 Sep', isTodaySelected: true, nextDisabled: false,
  previousLabel: 'Previous day', goToTodayLabel: 'Today', nextLabel: 'Next day', moreLabel: 'Options', searchLabel: 'Search',
  selectLabel: 'Select', collapseLabel: 'Collapse', refreshLabel: 'Refresh', completedLabel: 'Completed',
  allCollapsed: false, showCompleted: false, isFetching: false,
  onGoToPreviousDay: vi.fn(), onGoToToday: vi.fn(), onGoToNextDay: vi.fn(), onSearch: vi.fn(),
  onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(), onRefresh: vi.fn(), onToggleCompleted: vi.fn(),
}

describe('calendar navigation and root bell targets in Chromium', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async pending => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each(cases)('reserves every view target and whole period label at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      for (const view of ['month', 'week', 'range', 'agenda'] as const) {
        const label = locale === 'en' ? 'Aug 31 to Sep 6' : '31 ago a 6 set'
        const markup = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
          <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-04"
            previousMonthLabel={messages.common.previousMonth} nextMonthLabel={messages.common.nextMonth}
            onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
            period={view === 'month' ? undefined : { view, label, previousLabel: 'Previous', nextLabel: 'Next', onPrevious: vi.fn(), onNext: vi.fn(), onCurrent: vi.fn() }} />
        </NextIntlClientProvider>)
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await loadAppFonts(page)
        const navigation = page.locator('[data-testid$="-navigation"]')
        const controls = navigation.getByRole('button')
        for (const control of [controls.first(), controls.last()]) {
          const target = await control.evaluate(readExpandedControlGeometry)
          expect(target.width).toBeGreaterThanOrEqual(48)
          expect(target.height).toBeGreaterThanOrEqual(48)
          expect(target.edgeHits).toEqual([true, true, true, true])
        }
        if (view !== 'month') {
          const geometry = await page.locator('[data-calendar-period-title] span').evaluate(label => {
            const range = document.createRange(); range.selectNodeContents(label)
            return { lines: range.getClientRects().length, text: range.getBoundingClientRect().width, width: label.getBoundingClientRect().width, ellipsis: getComputedStyle(label).textOverflow }
          })
          expect(geometry.lines).toBe(1)
          expect(geometry.text).toBeLessThanOrEqual(geometry.width)
          expect(geometry.ellipsis).not.toBe('ellipsis')
        }
      }
    } finally { await page.close() }
  })

  it('rejects a calendar chevron whose transparent target has been removed', async () => {
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-04"
        previousMonthLabel="Previous" nextMonthLabel="Next" onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet} .orbit-pill-action.touch-target::after { inset: 0; }</style>${markup}`)
      const target = await page.getByRole('button', { name: 'Previous', exact: true }).evaluate(readExpandedControlGeometry)
      expect(() => expect(target.width).toBeGreaterThanOrEqual(48)).toThrow()
      expect(() => expect(target.height).toBeGreaterThanOrEqual(48)).toThrow()
    } finally { await page.close() }
  })

  it.each(cases)('measures the root bell transparent target at $width in $locale', async ({ width, locale }) => {
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <DestinationHeaderRow><NotificationBellDisplay count={12} onClick={vi.fn()} /></DestinationHeaderRow>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      const target = await page.getByRole('button').evaluate(readExpandedControlGeometry)
      expect(target.width).toBeGreaterThanOrEqual(48)
      expect(target.height).toBeGreaterThanOrEqual(48)
      expect(target.edgeHits).toEqual([true, true, true, true])
    } finally { await page.close() }
  })

  it.each(cases.filter(({ width }) => width < 1024))('aligns the owning root bell rows at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    const positions = []
    try {
      for (const root of ['today', 'calendar', 'progress', 'profile']) {
        const markup = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
          {root === 'today' ? <TodayDateControl {...todayProps} /> : root === 'calendar' ? <CalendarOptions /> : <RootNotificationHeader />}
        </NextIntlClientProvider>)
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        const geometry = await page.getByRole('button', { name: new RegExp(`^${messages.notifications.bell}`) }).evaluate(bell => {
          const bounds = bell.getBoundingClientRect()
          const row = bell.parentElement!.getBoundingClientRect()
          return { right: bounds.right, center: bounds.top + bounds.height / 2, rowHeight: row.height }
        })
        expect(geometry.rowHeight, root).toBeGreaterThanOrEqual(48)
        if (root === 'today') {
          const gaps = await page.locator('[data-today-header-actions] button').evaluateAll(buttons => buttons.slice(1).map((button, index) => button.getBoundingClientRect().left - buttons[index]!.getBoundingClientRect().right))
          for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
        }
        positions.push({ right: geometry.right, center: geometry.center })
      }
      for (const position of positions) expect(position).toEqual(positions[0])
    } finally { await page.close() }
  })
})
