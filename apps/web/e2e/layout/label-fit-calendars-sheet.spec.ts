import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const calendarName = 'Calendário compartilhado dos compromissos e encontros de toda a minha família'
const calendars = userCalendarsSchema.parse([
  { id: 'family', name: calendarName, accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true },
])
const events = calendarEventsResponseSchema.parse([
  createMockCalendarSyncEvent({ id: 'walk', title: 'Caminhar', calendarName: '', startDate: '2026-10-16', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
  createMockCalendarSyncEvent({ id: 'read', title: 'Ler', calendarName: '', startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
])

async function expectAtBodyEdge(heading: Locator, body: Locator) {
  const contentLeft = await body.evaluate((element) => {
    const style = getComputedStyle(element)
    return element.getBoundingClientRect().left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft)
  })
  const bounds = await heading.boundingBox()
  expect(bounds).not.toBeNull()
  expect(Math.abs(bounds!.x - contentLeft)).toBeLessThanOrEqual(1)
}

async function doubleSheetText(sheet: Locator) {
  await sheet.evaluate((surface) => {
    const measurements = [...surface.querySelectorAll<HTMLElement>('*')]
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
      .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize), line: Number.parseFloat(getComputedStyle(element).lineHeight) }))
    for (const { element, size, line } of measurements) {
      element.style.fontSize = `${size * 2}px`
      if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px`
    }
  })
}

async function expectWholeText(label: Locator) {
  await label.scrollIntoViewIfNeeded()
  await expect(label).toBeVisible()
  expect(await label.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
    const bounds = element.getBoundingClientRect()
    if (!fragments.length || fragments.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) return false
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      const clip = ancestor.getBoundingClientRect()
      if (fragments.some((rect) => (['hidden', 'clip'].includes(style.overflowX) && (rect.left < clip.left - 1 || rect.right > clip.right + 1))
        || (['hidden', 'clip'].includes(style.overflowY) && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1)))) return false
    }
    return true
  }), 'enlarged text stays whole, allowing multiline layout').toBe(true)
}

for (const width of [320, 360, 384, 412, 600]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    test.describe(`Calendars sheet at ${width}px in ${locale}`, () => {
      const words = locale === 'pt-BR' ? ptBR : en
      const profile = profileSchema.parse({ ...profileFixture, language: locale, plan: 'pro', hasProAccess: true, hasGoogleConnection: true })
      test.use({ viewport: { width, height: 915 }, appLocale: locale, subscriptionState: 'trial', layoutProfile: profile, layoutCalendars: calendars })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile, calendars)
        const responses: ReadonlyArray<readonly [string, unknown]> = [
          [API.profile.get, profile],
          [API.calendar.events, events],
          [API.calendar.calendars, calendars],
          [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
          [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: [], logs: {} })],
        ]
        for (const [path, response] of responses) {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
        }
      })

      test('aligns the calendar title and events heading with the body and preserves dates', async ({ page }) => {
        await page.goto('/calendar?import=1')
        const sheet = page.getByRole('dialog', { name: words.calendar.calendars.title, exact: true })
        const body = sheet.locator('[data-slot="sheet-body"]')
        const calendarHeading = sheet.getByRole('heading', { name: words.calendar.calendars.title, exact: true })
        const eventsHeading = sheet.getByTestId('section-heading-row').getByRole('heading')
        await expect(calendarHeading).toHaveCount(1)
        await expect(eventsHeading).toBeVisible()
        await expectAtBodyEdge(calendarHeading, body)
        await expectAtBodyEdge(eventsHeading, body)
        const date = sheet.getByText(locale === 'pt-BR' ? 'sex., 16 de out.' : 'Fri, Oct 16', { exact: true })
        await expect(date).toBeVisible()
        await expect(sheet.getByText('2026-10-16', { exact: true })).toHaveCount(0)
        await markRequiredLabels(calendarHeading)
        await markRequiredLabels(eventsHeading)
        await markRequiredLabels(date)
        await expect(sheet.getByRole('checkbox', { name: calendarName, exact: true })).toBeVisible()
        await markUserText(page, [calendarName, 'Caminhar', 'Ler'])
        await expectLabelsFit(page, sheet, [calendarName, 'Caminhar', 'Ler'])
        const openName = sheet.getByRole('button', { name: calendarName, exact: true })
        await expectInteractionFill(sheet.getByRole('checkbox', { name: calendarName, exact: true }))
        await openName.click()
        const fullName = sheet.locator('p').getByText(calendarName, { exact: true })
        await expect(fullName).toBeVisible()
        await expect(openName).toHaveAttribute('aria-expanded', 'true')
        await expect(page.getByRole('dialog')).toHaveCount(1)
        await openName.click()
        await expect(fullName).toHaveCount(0)
        await expect(sheet.getByRole('checkbox', { name: calendarName, exact: true })).toBeChecked()
        if (width === 320 && locale === 'pt-BR') {
          const headingSize = Number.parseFloat(await eventsHeading.evaluate((element) => getComputedStyle(element).fontSize))
          const dateSize = Number.parseFloat(await date.evaluate((element) => getComputedStyle(element).fontSize))
          await doubleSheetText(sheet)
          await expect(eventsHeading).toHaveCSS('font-size', `${headingSize * 2}px`)
          await expect(date).toHaveCSS('font-size', `${dateSize * 2}px`)
          for (const label of [calendarHeading, eventsHeading, date]) await expectWholeText(label)
          await expectAtBodyEdge(calendarHeading, body)
          await expectAtBodyEdge(eventsHeading, body)
        }
      })
    })
  }
}
