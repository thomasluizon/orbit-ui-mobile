import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { formatBillingDate } from '../../components/upgrade/styles'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { billingDetailsFixture } from '../../test-support/hermetic/mock-api/fixtures/subscriptions'
import { LAYOUT_ORIGIN } from '../support/env'
import { readOutlineVisibility } from './focus-indicators'
import { expectFillShape, expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const selectedDate = '2026-09-04'
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ children: [], hasSubHabits: false, dueDate: selectedDate, scheduledDates: [selectedDate] })],
  logs: {},
})

async function expectTouchPressFill(control: Locator, separateBody?: Locator) {
  await expect(control).toBeVisible()
  await control.scrollIntoViewIfNeeded()
  const page = control.page()
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  await control.evaluate((element) => {
    element.setAttribute('data-test-touch-control', 'true')
    element.addEventListener('touchstart', () => element.setAttribute('data-test-touch-held', 'true'), { passive: true })
    for (const event of ['touchend', 'touchcancel']) element.addEventListener(event, (touch) => {
      touch.preventDefault()
      element.removeAttribute('data-test-touch-held')
    }, { passive: false })
  })
  const bounds = (await control.boundingBox())!
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument', { depth: 0 })
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-test-touch-control]' })
  try {
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
      })
      await expect(control).toHaveAttribute('data-test-touch-held', 'true')
    } finally {
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    await expect(control).not.toHaveAttribute('data-test-touch-held')
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] })
    await expect.poll(() => control.evaluate((element) => {
      const probe = document.createElement('span')
      probe.style.background = 'var(--bg-hover)'
      probe.style.position = 'fixed'
      probe.style.pointerEvents = 'none'
      document.body.append(probe)
      const expected = getComputedStyle(probe).backgroundColor
      probe.remove()
      return getComputedStyle(element).backgroundColor === expected
    }), { message: 'touch press paints --bg-hover without hover media support' }).toBe(true)
    await expectFillShape(control, 'touch press')
    if (separateBody) await expect(separateBody).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  } finally {
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    await session.detach()
  }
}

for (const width of [412, 1280]) {
  for (const themePreference of ['light', 'dark'] as const) {
    test.describe(`pt-BR calendar day link at ${width}px in ${themePreference}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', themePreference })
      test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 }, layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('hover and press fill the rounded row with content clearance', async ({ page }) => {
        await page.goto('/calendar')
        const link = page.getByRole('link', { name: ptBR.calendar.goToDay, exact: true })
        await expect(link).toHaveAttribute('href', `/?date=${selectedDate}`)
        await expectInteractionFill(link)
        await expect(link).toHaveCSS('border-top-left-radius', '12px')
      })

      test('keyboard focus follows the row radius without clipping', async ({ page }) => {
        await page.goto('/calendar')
        const link = page.getByRole('link', { name: ptBR.calendar.goToDay, exact: true })
        await expect(link).toBeVisible()
        await link.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        await expect(link).toBeFocused()
        await expect(link).toHaveCSS('border-top-left-radius', '12px')
        const outline = await readOutlineVisibility(link)
        expect(outline.visible).toBe(true)
        expect(outline.clippedBy).toEqual([])
      })
    })
  }
}

for (const themePreference of ['light', 'dark'] as const) {
  test.describe(`pt-BR touch ListRow fills in ${themePreference}`, () => {
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', themePreference })
    test.use({ appLocale: 'pt-BR', viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, layoutProfile: profile })
    test.beforeEach(async ({ context }) => {
      await setLayoutProfileSession(context, profile)
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
        (route) => route.fulfill({ json: calendarMonth }))
    })

    test('touch press fills the routed calendar day row at radius 12', async ({ page }) => {
      await page.goto('/calendar')
      const link = page.getByRole('link', { name: ptBR.calendar.goToDay, exact: true })
      await expect(link).toHaveAttribute('href', `/?date=${selectedDate}`)
      await expect(link).toHaveCSS('border-top-left-radius', '12px')
      await expectTouchPressFill(link)
    })

    test.describe('invoice download action', () => {
      test.use({ subscriptionState: 'stripe' })

      test('touch press fills the separate ListRow action at its own radius', async ({ page }) => {
        await page.goto('/upgrade')
        const invoice = billingDetailsFixture.recentInvoices![0]!
        const label = ptBR.upgrade.billing.invoices.downloadDated.replace('{date}', formatBillingDate(invoice.date, 'pt-BR'))
        const action = page.getByRole('button', { name: label, exact: true })
        const body = action.locator('..').locator('[data-slot="list-row-body"]')
        await expect(body).toBeVisible()
        await expectTouchPressFill(action, body)
      })
    })
  })
}
