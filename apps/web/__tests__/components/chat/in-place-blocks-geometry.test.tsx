import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { inPlaceDayFixture, inPlaceCalendarFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ isPending: false, isError: false, isRefetchError: false, data: { habitsById: new Map((inPlaceDayFixture.rows ?? []).map(item => [item.id, createMockHabit({ id: item.id, title: item.title })])) } }),
  useLogHabit: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true } }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false, isError: false, isRefetchError: false }) }))

const cases = [320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [1, 2].map(scale => ({ width, locale, scale }))))

describe('in-place Astra block geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps targets and full-width event titles at $width in $locale at $scale text', async ({ width, locale, scale }) => {
    const messages = locale === 'en' ? en : pt
    const calendar = { ...inPlaceCalendarFixture, events: inPlaceCalendarFixture.events.map(event => ({ ...event, title: 'Walk with the team before the very long neighborhood planning meeting' })) }
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <DaySummaryCard daySummary={inPlaceDayFixture} /><CalendarCard calendarCard={calendar} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:${scale * 16}px}</style><main style="width:calc(100% - 32px);max-width:740px;margin:16px auto;display:flex;flex-direction:column;gap:16px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const main = document.querySelector('main')!
        const buttons = [...main.querySelectorAll('button')].map(button => {
          const rect = button.getBoundingClientRect()
          const pseudo = getComputedStyle(button, '::after')
          const inset = pseudo.content === 'none' ? 0 : Math.min(0, Number.parseFloat(pseudo.top) || 0)
          return { label: button.getAttribute('aria-label') ?? button.textContent, width: rect.width - inset * 2, height: rect.height - inset * 2, right: rect.right, left: rect.left }
        })
        const event = main.querySelector('[role="group"][aria-label*="Walk with the team"]')!
        const title = event.querySelector('[data-personal-text]')!
        return { scroll: main.scrollWidth, width: main.clientWidth, buttons, event: event.getBoundingClientRect().width, title: title.getBoundingClientRect().width }
      })
      expect(geometry.buttons.length).toBeGreaterThan(40)
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1)
      for (const target of geometry.buttons) {
        expect(target.width, target.label).toBeGreaterThanOrEqual(48)
        expect(target.height, target.label).toBeGreaterThanOrEqual(48)
        expect(target.left).toBeGreaterThanOrEqual(0)
        expect(target.right).toBeLessThanOrEqual(width)
      }
      expect(geometry.title).toBeCloseTo(geometry.event, 1)
    } finally { await page.close(); view.unmount() }
  })
})
