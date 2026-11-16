import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { compileAppStylesheet, stubViewportMedia } from '@/__tests__/support/flow-layout'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({ ...await importOriginal<typeof import('@orbit/shared/utils')>(), getClientTimeZone: () => 'America/Argentina/Rio_Gallegos' }))
vi.mock('dompurify', () => ({ default: { sanitize: (html: string) => html } }))

import { PreferencePickerSheet } from '@/app/(app)/preferences/_components/preference-picker-sheet'

const STORED = 'America/North_Dakota/New_Salem'
const DEVICE = 'America/Argentina/Rio_Gallegos'
const MATCHES = ['America/North_Dakota/Beulah', 'America/North_Dakota/Center', STORED]

function timeZoneQuestion(copy: typeof en) {
  const picker = copy.profile.timezonePicker
  render(<PreferencePickerSheet activePicker="timeZone" mounted selectedLanguage="en" timeZone={STORED} weekStartDay={1} uses24HourClock
    weekStartOptions={[]} clockFormatOptions={[]} pickerTitles={{ language: '', timeZone: copy.profile.timezonePicker.question, weekStart: '', clock: '' }} pickerDescriptions={{}}
    timeZoneSearchLabel={picker.search} timeZoneNoResultsLabel={picker.noResults} timeZoneShowMoreLabel={picker.showMore}
    onClose={vi.fn()} onLanguageChange={vi.fn()} onTimeZoneChange={vi.fn()} onWeekStartChange={vi.fn()} onClockFormatChange={vi.fn()} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'north dakota' } })
  return document.querySelector('[data-time-zone-question]')!.outerHTML
}

describe('the time zone options in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360].flatMap((width) => [{ locale: 'en', copy: en }, { locale: 'pt-BR', copy: ptBR as unknown as typeof en }].map(({ locale, copy }) => ({ width, locale, copy }))))(
    'holds each time zone option on one line with an ellipsis, inside its card, at $width px in $locale', async ({ width, copy }) => {
      stubViewportMedia(width)
      const markup = timeZoneQuestion(copy)
      const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
      try {
        const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0"><div style="padding-inline:var(--padding-sheet-inline)">${markup}</div></body></html>`)
        await loadAppFonts(page)
        const cards = await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-option-card]')].map((card) => {
          const tops: number[] = []
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top)
          }
          tops.sort((first, second) => first - second)
          const lines = tops.filter((top, index) => index === 0 || top - tops[index - 1]! > 8).length
          const label = card.firstElementChild as HTMLElement | null
          const group = card.closest('[data-option-group]')!.getBoundingClientRect()
          const box = card.getBoundingClientRect()
          return { name: card.textContent, lines, clipped: label ? label.scrollWidth > label.clientWidth : false, inside: box.left >= group.left - 0.5 && box.right <= group.right + 0.5 }
        }))
        expect(cards.map((card) => card.name)).toEqual([STORED, DEVICE, ...MATCHES])
        for (const card of cards) {
          expect(card.lines, card.name).toBe(1)
          expect(card.inside, card.name).toBe(true)
        }
        expect(cards.find((card) => card.name === STORED)?.clipped, STORED).toBe(true)
      } finally { await page.close() }
    }, 60_000)
})
