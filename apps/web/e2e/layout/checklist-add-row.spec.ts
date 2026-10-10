import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema } from '@orbit/shared/types/habit'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'

async function expectAddGeometry(scope: Locator, messages: typeof en | typeof ptBR) {
  const input = scope.getByRole('textbox', { name: messages.habits.form.checklistPlaceholder, exact: true })
  const add = scope.getByRole('button', { name: messages.common.add, exact: true })
  await expect(input).toBeVisible()
  await expect(add).toBeVisible()
  const field = await input.evaluate((element) => {
    const perimeter = element.closest('[data-focus-perimeter]')!
    const bounds = perimeter.getBoundingClientRect()
    const style = getComputedStyle(perimeter)
    return { right: bounds.right, center: bounds.y + bounds.height / 2, radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius] }
  })
  const pill = await add.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return { left: bounds.left, center: bounds.y + bounds.height / 2, width: bounds.width, height: bounds.height, radius: Number.parseFloat(style.borderTopLeftRadius), fill: style.backgroundColor }
  })
  expect(pill.left - field.right).toBe(8)
  expect(field.radii).toEqual(['12px', '12px', '12px', '12px'])
  expect(pill.width).toBe(44)
  expect(pill.height).toBe(44)
  expect(pill.center).toBe(field.center)
  expect(pill.radius).toBeGreaterThanOrEqual(22)
  expect(pill.fill).toBe('rgba(0, 0, 0, 0)')
  await expect(add).toHaveAttribute('data-variant', 'ghost')
  await expect(add).toHaveAttribute('data-size', 'sm')
}

for (const width of [320, 412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const mode of ['dark', 'light'] as const) {
      test.describe(`checklist add row at ${width}px in ${locale} ${mode}`, () => {
        test.use({ viewport: { width, height: 915 }, appLocale: locale, layoutProfile: { themePreference: mode } })
        const messages = locale === 'en' ? en : ptBR

        test('keeps the create field separate before and after keyboard additions', async ({ page }) => {
          await page.goto('/habits/new')
          const screen = page.locator('[data-habit-create-screen]')
          await screen.getByRole('button', { name: messages.habits.form.moreDetails }).click()
          const disclosure = screen.locator('.habit-form-disclosure[data-open="true"]')
          const input = disclosure.getByPlaceholder(messages.habits.form.checklistPlaceholder)
          const add = disclosure.getByRole('button', { name: messages.common.add, exact: true })
          await expect(add).toBeDisabled()
          await expectAddGeometry(disclosure, messages)
          await input.fill('Prepare coffee')
          await expect(add).toBeEnabled()
          await expectAddGeometry(disclosure, messages)
          await input.press('Enter')
          await expect(disclosure.getByRole('textbox', { name: messages.habits.form.checklistItemLabel.replace('{n}', '1'), exact: true })).toHaveValue('Prepare coffee')
          await expect(input).toHaveValue('')
          await expect(add).toBeDisabled()
          await expectAddGeometry(disclosure, messages)
        })

        test('keeps the populated detail field separate with disabled and enabled add states', async ({ page, context }) => {
          const habit = habitDetailSchema.parse({ ...makeHabitDetail(), checklistItems: [
            { text: 'Prepare coffee', isChecked: false }, { text: 'Wash cup', isChecked: true },
          ] })
          await setLayoutFixtureSession(context, [{ path: API.habits.get(habit.id), body: habit }])
          await page.goto(`/habits/${habit.id}`)
          await page.getByRole('button', { name: messages.habits.detail.moreDetails }).click()
          const disclosure = page.locator('#habit-detail-fields')
          const input = disclosure.getByPlaceholder(messages.habits.form.checklistPlaceholder)
          const add = disclosure.getByRole('button', { name: messages.common.add, exact: true })
          await expect(disclosure.getByRole('textbox', { name: messages.habits.form.checklistItemLabel.replace('{n}', '1'), exact: true })).toHaveValue('Prepare coffee')
          await expect(disclosure.getByRole('textbox', { name: messages.habits.form.checklistItemLabel.replace('{n}', '2'), exact: true })).toHaveValue('Wash cup')
          await expect(add).toBeDisabled()
          await expectAddGeometry(disclosure, messages)
          await input.fill('Next step')
          await expect(add).toBeEnabled()
          await expectAddGeometry(disclosure, messages)
        })
      })
    }
  }
}
