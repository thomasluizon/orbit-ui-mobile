import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
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
    element.addEventListener('touchstart', () => element.setAttribute('data-test-touch-held', 'true'), { passive: true })
    for (const event of ['touchend', 'touchcancel']) element.addEventListener(event, () => element.removeAttribute('data-test-touch-held'))
  })
  const bounds = (await control.boundingBox())!
  const session = await page.context().newCDPSession(page)
  const gesture = session.send('Input.synthesizeTapGesture', {
    x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, duration: 5000, gestureSourceType: 'touch',
  })
  try {
    await expect.poll(() => control.evaluate((element) => {
      const probe = document.createElement('span')
      probe.style.background = 'var(--bg-hover)'
      probe.style.position = 'fixed'
      probe.style.pointerEvents = 'none'
      document.body.append(probe)
      const expected = getComputedStyle(probe).backgroundColor
      probe.remove()
      return { painted: getComputedStyle(element).backgroundColor === expected, held: element.hasAttribute('data-test-touch-held') }
    }), { message: 'touch press paints --bg-hover without hover media support' }).toEqual({ painted: true, held: true })
    await expectFillShape(control, 'touch press')
    if (separateBody) await expect(separateBody).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  } finally {
    await gesture
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

    test('touch press fills the separate ListRow action at its own radius', async ({ page }) => {
      await page.goto('/profile')
      const action = page.getByRole('button', { name: new RegExp(`^${ptBR.contextMenu.viewDetails},`) })
      const body = action.locator('..').getByRole('link')
      await expectTouchPressFill(action, body)
    })
  })
}
