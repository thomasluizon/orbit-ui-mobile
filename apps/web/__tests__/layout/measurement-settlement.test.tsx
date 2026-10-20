import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import { calendarDayCardDate, makeCalendarDayCardEntries } from '@orbit/shared/test-support/calendar-day-card-fixtures'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { expectCalendarDayHabitRows } from '@/e2e/layout/calendar-day-habit-geometry'
import { expectCalendarDayLinkFocus } from '@/e2e/layout/calendar-day-link-focus'
import { authoredLabelSelector, expectLabelsFit } from '@/e2e/layout/label-fit-contract'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '../support/chromium'

vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let stylesheet: string
const entries = makeCalendarDayCardEntries()

registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    + `:root{${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')}}`
})
afterAll(async () => { await closeChrome(browserLaunch) })

function dayMarkup() {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <CalendarDayDetail dateStr={calendarDayCardDate} today={calendarDayCardDate} entries={entries}
      calendarEvents={[]} calendarEventsState="ready" loggable={false} showRecurring
      pendingEntryStates={new Map()} onEntryChange={() => null} onRetryCalendarEvents={() => {}}
      onReconnectCalendarEvents={() => {}} onOpenCalendarImport={() => {}} onViewPro={() => {}} />
  </NextIntlClientProvider>)
}

it('resamples every row after the root scale is replaced between setup and measurement', async () => {
  const page = await browser.newPage({ viewport: { width: 1352, height: 915 } })
  try {
    await page.setContent(`<style>${stylesheet}</style><main style="padding:24px;width:740px">${dayMarkup()}</main>`)
    const card = page.locator('section')
    const evaluate = card.evaluate.bind(card)
    const interleaving = vi.spyOn(card, 'evaluate').mockImplementationOnce(async (callback, argument) => {
      await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
      return evaluate(callback, argument)
    })
    const heights = await expectCalendarDayHabitRows(card, entries, en.calendar.timeGrid.noSetTime, 2)
    expect(heights).toHaveLength(entries.length)
    expect(interleaving.mock.calls.length).toBeGreaterThan(1)
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).fontSize)).toBe('32px')
  } finally { vi.restoreAllMocks(); await page.close() }
})

it('replays the whole keyboard traversal after its focused day link is replaced', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${stylesheet}</style><main style="padding:24px;width:600px">${dayMarkup()}</main>`)
    await page.evaluate(() => {
      const replaceFocusedLink = (event: KeyboardEvent) => {
        const link = document.activeElement
        if (event.key !== 'Tab' || event.shiftKey || !(link instanceof HTMLAnchorElement)) return
        const replacement = link.cloneNode(true) as HTMLAnchorElement
        replacement.dataset.replaced = 'true'
        link.replaceWith(replacement)
        document.removeEventListener('keyup', replaceFocusedLink)
      }
      document.addEventListener('keyup', replaceFocusedLink)
    })
    const link = page.getByRole('link', { name: en.calendar.goToDay, exact: true })
    await expectCalendarDayLinkFocus(link)
    expect(await link.getAttribute('data-replaced')).toBe('true')
    expect(await link.evaluate((element) => document.activeElement === element)).toBe(true)
  } finally { await page.close() }
}, 30_000)

it('waits for rendered authored labels in the requested surface', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<h1>Unrelated shell label</h1><main></main>')
    const surface = page.getByRole('main')
    const labels = surface.locator(`${authoredLabelSelector}, [data-layout-text-origin="user"]`)
    const evaluateAll = labels.evaluateAll.bind(labels)
    vi.spyOn(surface, 'locator').mockReturnValueOnce(labels)
    vi.spyOn(labels, 'evaluateAll').mockImplementationOnce(async (callback, argument) => {
      const sample = await evaluateAll(callback, argument)
      await page.evaluate(() => { document.querySelector('main')!.innerHTML = '<button>Alerts on this device</button>' })
      return sample
    })
    await expectLabelsFit(page, surface)
    expect(await page.getByRole('main').textContent()).toBe('Alerts on this device')
  } finally { vi.restoreAllMocks(); await page.close() }
})
