import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { inspectControlAccentRings } from './focus-indicators'
import { completeInstallOnboarding } from './install-onboarding'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

async function expectRings(control: Locator, count: number) {
  await expect(control).toBeVisible()
  await expect.poll(async () => (await inspectControlAccentRings(control)).length).toBe(count)
}

async function keyboardFocus(page: Page, control: Locator) {
  await control.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(control).toBeFocused()
  await expect.poll(() => control.evaluate((element) => element === document.activeElement && element.matches(':focus-visible'))).toBe(true)
}

async function checkChoice(page: Page, control: Locator, alternative: Locator) {
  const selectionAttribute = await control.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed'
  await alternative.click()
  await expect(alternative).toHaveAttribute(selectionAttribute, 'true')
  await expect(control).toHaveAttribute(selectionAttribute, 'false')
  await expectRings(control, 0)
  await control.hover()
  await expectRings(control, 0)
  if (await control.evaluate((element) => (element as HTMLElement).tabIndex >= 0)) {
    await keyboardFocus(page, control)
    await expectRings(control, 1)
    await alternative.click()
  }
  await control.click()
  await expect(control).toHaveAttribute(selectionAttribute, 'true')
  await expectRings(control, 1)
  await control.hover()
  await expectRings(control, 1)
  await keyboardFocus(page, control)
  await expectRings(control, 1)
}

async function checkToggle(page: Page, control: Locator) {
  if (await control.getAttribute('aria-pressed') === 'true') await control.click()
  await expect(control).toHaveAttribute('aria-pressed', 'false')
  await expectRings(control, 0)
  await control.hover()
  await expectRings(control, 0)
  await keyboardFocus(page, control)
  await expectRings(control, 1)
  await page.keyboard.press('Space')
  await expect(control).toHaveAttribute('aria-pressed', 'true')
  await expectRings(control, 1)
  await page.keyboard.press('Tab')
  await expectRings(control, 1)
  await control.hover()
  await expectRings(control, 1)
  await keyboardFocus(page, control)
  await expectRings(control, 1)
}

async function checkEmoji(page: Page, words: typeof en) {
  const opener = page.getByRole('button', { name: words.habits.form.emojiOpenPicker, exact: true })
  await opener.click()
  const picker = page.getByRole('dialog', { name: words.habits.form.emojiPickerTitle, exact: true })
  await checkToggle(page, picker.locator('button.chip').first())
  const option = picker.getByRole('option').first()
  await expect(option).toHaveAttribute('aria-selected', 'false')
  await expectRings(option, 0)
  await option.hover()
  await expectRings(option, 0)
  await picker.getByRole('textbox').click()
  await keyboardFocus(page, option)
  await expectRings(option, 1)
  await page.keyboard.press('Space')
  await expect(picker).toHaveCount(0)
  await opener.click()
  const selected = picker.getByRole('option', { selected: true }).first()
  await expectRings(selected, 1)
  await selected.hover()
  await expectRings(selected, 1)
  await keyboardFocus(page, selected)
  await expectRings(selected, 1)
  await page.keyboard.press('Escape')
}

for (const width of [412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const theme of ['dark', 'light'] as const) {
      const words = locale === 'en' ? en : ptBR
      test.describe(`one selection and focus indicator at ${width}, ${locale}, ${theme}`, () => {
        test.use({ appLocale: locale, subscriptionState: 'free', layoutProfile: { themePreference: theme }, viewport: { width, height: 915 } })

        test('calendar segments keep one ring through every arrow-key selection', async ({ page, context }) => {
          await completeInstallOnboarding(page)
          await context.route(`${LAYOUT_ORIGIN}${API.habits.calendarMonth}*`, (route) => route.fulfill({ json: calendarMonthResponseSchema.parse({ habits: [], logs: {} }) }))
          await page.goto('/calendar')
          await expect(page.getByTestId('calendar-grid-card')).toBeVisible()
          const month = page.getByRole('radio', { name: words.calendar.view.month, exact: true })
          const labels = [words.calendar.view.month, words.calendar.view.week, words.calendar.view.range, words.calendar.view.agenda]
          for (let index = 0; index < labels.length; index += 1) {
            await checkChoice(page, page.getByRole('radio', { name: labels[index], exact: true }), page.getByRole('radio', { name: labels[(index + 1) % labels.length], exact: true }))
          }
          await month.click()
          await keyboardFocus(page, month)
          for (const label of [words.calendar.view.week, words.calendar.view.range, words.calendar.view.agenda, words.calendar.view.month]) {
            await page.keyboard.press('ArrowRight')
            const segment = page.getByRole('radio', { name: label, exact: true })
            await expect(segment).toBeFocused()
            await expect(segment).toHaveAttribute('aria-checked', 'true')
            await expectRings(segment, 1)
          }
        })

        test('theme pills and timezone radios yield selection to focus', async ({ page }) => {
          await completeInstallOnboarding(page)
          await page.goto('/profile/preferences')
          const selected = page.getByRole('button', { name: theme === 'dark' ? words.preferences.themeModeDark : words.preferences.themeModeLight, exact: true })
          const other = page.getByRole('button', { name: theme === 'dark' ? words.preferences.themeModeLight : words.preferences.themeModeDark, exact: true })
          await expectRings(other, 0)
          await other.hover()
          await expectRings(other, 0)
          await keyboardFocus(page, other)
          await expectRings(other, 1)
          await selected.click()
          await expectRings(selected, 1)
          await selected.hover()
          await expectRings(selected, 1)
          await keyboardFocus(page, selected)
          await expectRings(selected, 1)
          await page.getByRole('button', { name: words.profile.settingsRows.timezone, exact: false }).click()
          const sheet = page.getByRole('dialog')
          const radios = sheet.getByRole('radio')
          await expectRings(radios.nth(1), 0)
          await radios.nth(1).hover()
          await expectRings(radios.nth(1), 0)
          await expectRings(radios.first(), 1)
          await radios.first().hover()
          await expectRings(radios.first(), 1)
          await sheet.getByRole('textbox').click()
          await keyboardFocus(page, radios.first())
          await expectRings(radios.first(), 1)
          await page.keyboard.press('ArrowDown')
          await expect(radios.nth(1)).toBeFocused()
          await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
          await expectRings(radios.nth(1), 1)
          await page.keyboard.press('Shift+Tab')
          await expectRings(radios.nth(1), 1)
        })

        test('upgrade interval switch yields its selected ring', async ({ page }) => {
          await completeInstallOnboarding(page)
          await page.goto('/upgrade')
          const radios = page.getByRole('radiogroup').getByRole('radio')
          await checkChoice(page, radios.nth(0), radios.nth(1))
        })

        test('habit form days, emoji choices, reminders and time options keep one ring', async ({ page }) => {
          await completeInstallOnboarding(page)
          await page.goto('/habits/new')
          await page.getByRole('textbox', { name: words.habits.form.describe, exact: true }).fill(locale === 'en' ? 'Read every Monday' : 'Ler toda segunda-feira')
          await checkToggle(page, page.getByRole('button', { name: words.dates.daysLong.monday, exact: true }))
          await page.getByRole('button', { name: words.habits.form.moreDetails, exact: true }).click()
          await checkEmoji(page, words)
          const disclosure = page.locator('.habit-form-disclosure[data-open="true"]')
          await disclosure.getByRole('switch', { name: words.habits.form.scheduledReminder, exact: true }).click()
          await disclosure.getByRole('button', { name: words.habits.form.scheduledReminderAdd, exact: true }).click()
          const reminders = disclosure.getByRole('radiogroup', { name: words.habits.form.scheduledReminder, exact: true }).getByRole('radio')
          await checkChoice(page, reminders.nth(0), reminders.nth(1))
          await disclosure.getByRole('button', { name: `${words.habits.form.scheduledReminderTimePlaceholder}: ${words.common.selectTime}`, exact: true }).click()
          const times = page.getByRole('dialog', { name: words.common.selectTime, exact: true }).getByRole('radiogroup', { name: words.common.hours, exact: true }).getByRole('radio')
          await checkChoice(page, times.nth(0), times.nth(1))
        })

        test('habit detail frequency units and both day pill presentations keep one ring', async ({ page, context }) => {
          await completeInstallOnboarding(page)
          const habit = habitDetailSchema.parse({ ...makeHabitDetail(), days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
          const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))
          await page.goto(`/habits/${habit.id}`)
          const fields = page.getByRole('main')
          const monday = fields.getByRole('button', { name: words.dates.daysLong.monday, exact: true })
          const tuesday = fields.getByRole('button', { name: words.dates.daysLong.tuesday, exact: true })
          await expectRings(monday, 1)
          await monday.hover()
          await expectRings(monday, 1)
          await keyboardFocus(page, monday)
          await expectRings(monday, 1)
          await expectRings(tuesday, 0)
          await tuesday.hover()
          await expectRings(tuesday, 0)
          await keyboardFocus(page, tuesday)
          await expectRings(tuesday, 1)
          await fields.getByRole('button', { name: words.habits.detail.schedule, exact: false }).click()
          const editor = fields.locator('#habit-detail-schedule-editor')
          const units = editor.getByRole('radio')
          await checkChoice(page, units.nth(0), units.nth(1))
          await checkToggle(page, editor.getByRole('button', { name: words.dates.daysLong.tuesday, exact: true }))
        })

        test('onboarding starters, schedule modes and days share the focus rule', async ({ page, context }) => {
          await context.clearCookies()
          await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }, { name: 'orbit_theme_mode', value: theme, url: LAYOUT_ORIGIN }])
          await page.emulateMedia({ colorScheme: theme })
          await page.goto('/onboarding')
          await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
          const popup = page.getByRole('dialog')
          const starters = popup.locator('button.chip')
          await checkChoice(page, starters.nth(0), starters.nth(1))
          await popup.getByRole('button', { name: words.onboarding.flow.continue, exact: true }).click()
          const modes = popup.getByRole('radiogroup', { name: words.onboarding.flow.when.scheduleMode, exact: true }).getByRole('radio')
          await checkChoice(page, modes.nth(0), modes.nth(1))
          await checkToggle(page, popup.getByRole('button', { name: words.onboarding.flow.when.daysLong.monday, exact: true }))
        })

        test('goal type switch and DateField today keep one indicator', async ({ page }) => {
          await completeInstallOnboarding(page)
          await page.goto('/habits/new')
          await page.getByRole('button', { name: words.habits.form.moreDetails, exact: true }).click()
          await page.getByRole('button', { name: words.habits.form.goals, exact: false }).click()
          await page.getByRole('button', { name: words.habits.form.createGoal, exact: true }).click()
          const goal = page.getByRole('dialog', { name: words.goals.create, exact: true })
          const types = goal.getByRole('radiogroup', { name: words.goals.form.type, exact: true }).getByRole('radio')
          await checkChoice(page, types.nth(0), types.nth(1))
          await goal.getByRole('button', { name: words.goals.form.addDeadline, exact: true }).click()
          await goal.locator('button[aria-haspopup="dialog"]').click()
          const datePicker = page.getByRole('dialog', { name: words.common.selectDate, exact: true })
          const today = datePicker.locator('button[data-day="2026-09-04"]')
          await expectRings(today, 0)
          await keyboardFocus(page, today)
          await expectRings(today, 1)
          await page.keyboard.press('ArrowRight')
          const tomorrow = datePicker.locator('button[data-day="2026-09-05"]')
          await expect(tomorrow).toBeFocused()
          await expectRings(tomorrow, 1)
          await expectRings(today, 0)
          await tomorrow.click()
          await goal.locator('button[aria-haspopup="dialog"]').click()
          await expectRings(today, 1)
          await today.hover()
          await expectRings(today, 1)
          await keyboardFocus(page, tomorrow)
          await page.keyboard.press('ArrowLeft')
          await expect(today).toBeFocused()
          await expectRings(today, 1)
        })
      })
    }
  }
}

test.describe('compact calendar track geometry', () => {
  test.use({ appLocale: 'pt-BR', viewport: { width: 320, height: 915 } })
  test('follows the inset geometry and keeps every pt-BR label whole', async ({ page, context }) => {
    await completeInstallOnboarding(page)
    await context.route(`${LAYOUT_ORIGIN}${API.habits.calendarMonth}*`, (route) => route.fulfill({ json: calendarMonthResponseSchema.parse({ habits: [], logs: {} }) }))
    await page.goto('/calendar')
    await expect(page.getByTestId('calendar-grid-card')).toBeVisible()
    const track = page.getByRole('radiogroup', { name: ptBR.calendar.view.switchLabel, exact: true })
    await expect(async () => {
      const geometry = await track.evaluate((element) => {
        const style = getComputedStyle(element)
        const probe = document.createElement('span')
        probe.style.backgroundColor = 'var(--bg-well)'
        element.appendChild(probe)
        const well = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { padding: style.padding, gap: style.gap, radius: style.borderRadius, fill: style.backgroundColor, well, shadow: style.boxShadow, segments: [...element.querySelectorAll('button')].map((button) => {
          const label = button.querySelector('span')!
          const range = document.createRange(); range.selectNodeContents(label)
          return { top: button.getBoundingClientRect().top, radius: getComputedStyle(button).borderRadius, height: button.getBoundingClientRect().height, width: label.getBoundingClientRect().width, labelWidth: range.getBoundingClientRect().width, lines: range.getClientRects().length }
        }) }
      })
      expect(geometry).toMatchObject({ padding: '4px', gap: '4px', radius: '12px', shadow: 'none' })
      expect(geometry.fill).toBe(geometry.well)
      expect(geometry.segments).toHaveLength(4)
      expect(new Set(geometry.segments.map((segment) => segment.top)).size).toBe(1)
      for (const segment of geometry.segments) {
        expect(segment.radius).toBe('8px')
        expect(segment.height).toBeGreaterThanOrEqual(48)
        expect(segment.lines).toBe(1)
        expect(segment.labelWidth).toBeLessThanOrEqual(segment.width)
      }
    }).toPass({ timeout: 15_000 })
  })
})
