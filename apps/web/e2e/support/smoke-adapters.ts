import { expect, type Locator, type Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

function localizedRole(root: Page | Locator, role: Parameters<Page['getByRole']>[0], english: string | RegExp, portuguese: string | RegExp): Locator {
  return root.getByRole(role, { name: english, exact: true })
    .or(root.getByRole(role, { name: portuguese, exact: true }))
}

function describedTypeName(label: string, hint: string): RegExp {
  const parts = [label, hint].map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${parts.join('\\s*')}$`)
}

async function handleSmokePrompts(page: Page): Promise<void> {
  const trial = localizedRole(page, 'dialog', en.trial.expired.heading, ptBR.trial.expired.heading)
  await page.addLocatorHandler(trial, async (dialog) => {
    await localizedRole(dialog, 'button', en.trial.expired.continueFree, ptBR.trial.expired.continueFree).click()
  })
  const calendar = localizedRole(page, 'dialog', en.onboarding.wizard.calendarTitle, ptBR.onboarding.wizard.calendarTitle)
  await page.addLocatorHandler(calendar, async (dialog) => {
    await localizedRole(dialog, 'button', en.common.later, ptBR.common.later).click()
  })
}

export async function expectAppNavigation(page: Page): Promise<void> {
  await handleSmokePrompts(page)
  await expect(localizedRole(page, 'navigation', en.nav.mainNavigation, ptBR.nav.mainNavigation)).toBeVisible()
}

export async function createSmokeHabit(page: Page, title: string, itemType: 'task' | 'habit' = 'task'): Promise<void> {
  await handleSmokePrompts(page)
  const create = localizedRole(page, 'button', en.nav.createHabit, ptBR.nav.createHabit)
  const emptyCreate = localizedRole(page, 'button', en.habits.createManually, ptBR.habits.createManually)
  await expect(page.locator('[data-habit-list]')).toBeVisible({ timeout: 30_000 })
  await create.or(emptyCreate).first().click()
  await localizedRole(page, 'radio',
    describedTypeName(itemType === 'task' ? en.habits.form.typeTask : en.habits.form.typeHabit, itemType === 'task' ? en.habits.form.typeTaskHint : en.habits.form.typeHabitHint),
    describedTypeName(itemType === 'task' ? ptBR.habits.form.typeTask : ptBR.habits.form.typeHabit, itemType === 'task' ? ptBR.habits.form.typeTaskHint : ptBR.habits.form.typeHabitHint)).click()
  const titleInput = localizedRole(page, 'textbox',
    itemType === 'task' ? en.habits.form.taskDescribe : en.habits.form.describe,
    itemType === 'task' ? ptBR.habits.form.taskDescribe : ptBR.habits.form.describe)
  await expect(titleInput).toBeVisible()
  await titleInput.fill(title)
  const submit = localizedRole(page, 'button',
    itemType === 'task' ? en.habits.createTask : en.habits.createHabit,
    itemType === 'task' ? ptBR.habits.createTask : ptBR.habits.createHabit)
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(titleInput).toBeHidden()
}

export async function logSmokeHabit(page: Page, title: string): Promise<void> {
  const listOptions = localizedRole(page, 'button', en.habits.listOptions, ptBR.habits.listOptions)
  const showCompleted = localizedRole(page, 'menuitem', en.habits.showCompletedMenu, ptBR.habits.showCompletedMenu)
  await expect(async () => {
    if (!await showCompleted.isVisible()) await listOptions.click({ timeout: 1000 })
    await expect(showCompleted).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await showCompleted.click()
  const row = page.locator(`[data-habit-title="${title}"]`)
  const toggle = row.getByTestId('habit-status-toggle')
  await expect(toggle).toBeEnabled()
  await expect(row).toHaveAttribute('data-status', 'empty')
  const habitId = await row.getAttribute('data-habit-id')
  expect(habitId).toBeTruthy()
  const initialState = await toggle.getAttribute('aria-label')
  const logged = page.waitForResponse(
    (response) => response.request().method() === 'POST' &&
      'next-action' in response.request().headers() &&
      response.request().postData()?.startsWith(`[${JSON.stringify(habitId)},`) === true &&
      /^\["[^"]+",\{"date":"\d{4}-\d{2}-\d{2}"\},/.test(response.request().postData() ?? ''),
    { timeout: 30_000 },
  )
  await toggle.click()
  const logResponse = await logged
  expect(logResponse.ok()).toBeTruthy()
  await expect(toggle).not.toHaveAttribute('aria-label', initialState ?? '')
  await expect(row).toHaveAttribute('data-status', 'done')
  await page.reload()
  await expect(async () => {
    if (!await showCompleted.isVisible()) await listOptions.click({ timeout: 1000 })
    await expect(showCompleted).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await showCompleted.click()
  await expect(row).toHaveAttribute('data-status', 'done')
}

export async function expectCheckout(page: Page): Promise<void> {
  await handleSmokePrompts(page)
  const checkout = localizedRole(page.locator('[data-tier="yearly"]'), 'button',
    en.upgrade.plans.checkoutLabelRecommended.replace('{interval}', en.upgrade.plans.yearly.name),
    ptBR.upgrade.plans.checkoutLabelRecommended.replace('{interval}', ptBR.upgrade.plans.yearly.name))
  await expect(checkout).toBeVisible()
  await expect(checkout).toBeEnabled()
}
