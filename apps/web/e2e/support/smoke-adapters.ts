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
    .or(localizedRole(page, 'dialog', en.onboarding.wizard.calendarQuestion, ptBR.onboarding.wizard.calendarQuestion))
  await page.addLocatorHandler(calendar, async (dialog) => {
    await localizedRole(dialog, 'button', en.common.later, ptBR.common.later).click()
  })
  const consent = localizedRole(page, 'dialog', en.marketingConsent.prompt.title, ptBR.marketingConsent.prompt.title)
  await page.addLocatorHandler(consent, async (dialog) => {
    await localizedRole(dialog, 'button', en.marketingConsent.prompt.decline, ptBR.marketingConsent.prompt.decline).click()
  })
  const habitImport = localizedRole(page, 'dialog', en.onboarding.wizard.importTitle, ptBR.onboarding.wizard.importTitle)
  await page.addLocatorHandler(habitImport, async (dialog) => {
    await localizedRole(dialog, 'button', en.onboarding.wizard.importNotNow, ptBR.onboarding.wizard.importNotNow).click()
  })
  const referral = page.getByRole('dialog').filter({
    has: localizedRole(page, 'button', en.referral.prompt.cta, ptBR.referral.prompt.cta),
  })
  await page.addLocatorHandler(referral, async (dialog) => {
    await localizedRole(dialog, 'button', en.referral.prompt.later, ptBR.referral.prompt.later).click()
  })
  const milestoneShare = localizedRole(page, 'dialog', en.milestoneShare.title, ptBR.milestoneShare.title)
  await page.addLocatorHandler(milestoneShare, async (dialog) => {
    await localizedRole(dialog, 'button', en.milestoneShare.later, ptBR.milestoneShare.later).click()
  })
}

export async function expectAppNavigation(page: Page): Promise<void> {
  await handleSmokePrompts(page)
  await expect(localizedRole(page, 'navigation', en.nav.mainNavigation, ptBR.nav.mainNavigation)).toBeVisible()
}

type SmokeItemType = 'task' | 'habit'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function questionWithValue(template: string): RegExp {
  return new RegExp(`^${template.split('{time}').map(escapeRegExp).join('.+')}$`)
}

function guidedAnswers(page: Page, itemType: SmokeItemType) {
  const when = itemType === 'task'
    ? { en: en.habits.flow.when.today, pt: ptBR.habits.flow.when.today }
    : { en: en.habits.flow.when.everyDay, pt: ptBR.habits.flow.when.everyDay }
  const question = (english: string | RegExp, portuguese: string | RegExp, answerEnglish: string, answerPortuguese: string) => {
    const group = localizedRole(page, 'group', english, portuguese)
    return { group, option: localizedRole(group, 'button', answerEnglish, answerPortuguese) }
  }
  return [
    question(en.habits.flow.when.question, ptBR.habits.flow.when.question, when.en, when.pt),
    question(en.habits.flow.time.question, ptBR.habits.flow.time.question, en.habits.flow.time.none, ptBR.habits.flow.time.none),
    question(questionWithValue(en.habits.flow.reminder.question), questionWithValue(ptBR.habits.flow.reminder.question),
      en.habits.flow.reminder.no, ptBR.habits.flow.reminder.no),
  ]
}

function typeRadio(page: Page, itemType: SmokeItemType): Locator {
  const label = itemType === 'task' ? 'typeTask' : 'typeHabit'
  const hint = itemType === 'task' ? 'typeTaskHint' : 'typeHabitHint'
  return localizedRole(page, 'radio',
    describedTypeName(en.habits.form[label], en.habits.form[hint]),
    describedTypeName(ptBR.habits.form[label], ptBR.habits.form[hint]))
}

function createLabel(page: Page, itemType: SmokeItemType): Locator {
  return localizedRole(page, 'button',
    itemType === 'task' ? en.habits.createTask : en.habits.createHabit,
    itemType === 'task' ? ptBR.habits.createTask : ptBR.habits.createHabit)
}

function summaryRow(page: Page, english: string, portuguese: string): Locator {
  return localizedRole(page, 'button', new RegExp(`^${escapeRegExp(english)}`), new RegExp(`^${escapeRegExp(portuguese)}`))
}

async function restoreRequestedType(page: Page, itemType: SmokeItemType): Promise<void> {
  await summaryRow(page, en.habits.flow.summary.type, ptBR.habits.flow.summary.type).click()
  await typeRadio(page, itemType).click()
  if (itemType === 'task') await summaryRow(page, en.habits.flow.summary.when, ptBR.habits.flow.summary.when).click()
}

async function expectLeftCreateRoute(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/habits\/new(?:[?#]|$)/)
}

async function createGuidedHabit(page: Page, title: string, itemType: SmokeItemType, titleInput: Locator): Promise<void> {
  await titleInput.fill(title)
  await localizedRole(page, 'button', en.habits.flow.continue, ptBR.habits.flow.continue).click()
  const submit = createLabel(page, itemType)
  const otherSubmit = createLabel(page, itemType === 'task' ? 'habit' : 'task')
  const answers = guidedAnswers(page, itemType)
  const anyStep = answers.reduce((steps, answer) => steps.or(answer.group), submit.or(otherSubmit))
  for (let turn = 0; turn <= answers.length + 2; turn += 1) {
    await expect(anyStep.first()).toBeVisible({ timeout: 30_000 })
    if (await submit.isVisible()) break
    if (await otherSubmit.isVisible()) { await restoreRequestedType(page, itemType); continue }
    for (const answer of answers) {
      if (!await answer.group.isVisible()) continue
      await answer.option.click()
      await expect(answer.group).toBeHidden()
      break
    }
  }
  await expect(submit).toBeEnabled()
  await submit.click()
  const result = localizedRole(page, 'dialog', en.result.title, ptBR.result.title)
  await expect(result).toBeVisible({ timeout: 30_000 })
  await localizedRole(result, 'button', en.result.seeToday, ptBR.result.seeToday)
    .or(localizedRole(result, 'button', en.result.seeCalendar, ptBR.result.seeCalendar)).first().click()
  await expect(result).toBeHidden()
  await expectLeftCreateRoute(page)
}

async function createClassicHabit(page: Page, title: string, itemType: SmokeItemType, titleInput: Locator): Promise<void> {
  await titleInput.fill(title)
  const submit = localizedRole(page, 'button',
    itemType === 'task' ? en.habits.createTask : en.habits.createHabit,
    itemType === 'task' ? ptBR.habits.createTask : ptBR.habits.createHabit)
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(titleInput).toBeHidden()
  await expectLeftCreateRoute(page)
}

/** Creates one habit through the create flow the account sees. The page tells the flow: the guided flow asks for the words first, the classic form asks for the type first. */
export async function createSmokeHabit(page: Page, title: string, itemType: SmokeItemType = 'task'): Promise<void> {
  await handleSmokePrompts(page)
  const create = localizedRole(page, 'button', en.nav.createHabit, ptBR.nav.createHabit)
  const emptyCreate = localizedRole(page, 'button', en.habits.createManually, ptBR.habits.createManually)
  await expect(page.locator('[data-habit-list]')).toBeVisible({ timeout: 30_000 })
  await create.or(emptyCreate).first().click()
  const type = typeRadio(page, itemType)
  const guidedTitle = localizedRole(page, 'textbox', en.habits.flow.what.label, ptBR.habits.flow.what.label)
  await expect(type.or(guidedTitle)).toBeVisible({ timeout: 30_000 })
  if (await guidedTitle.isVisible()) {
    await createGuidedHabit(page, title, itemType, guidedTitle)
    return
  }
  await type.click()
  const titleInput = localizedRole(page, 'textbox',
    itemType === 'task' ? en.habits.form.taskDescribe : en.habits.form.describe,
    itemType === 'task' ? ptBR.habits.form.taskDescribe : ptBR.habits.form.describe)
  await expect(titleInput).toBeVisible()
  await createClassicHabit(page, title, itemType, titleInput)
}

export async function logSmokeHabit(page: Page, title: string): Promise<void> {
  await handleSmokePrompts(page)
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
  const checkout = localizedRole(page, 'button',
    en.upgrade.plans.checkoutLabelRecommended.replace('{interval}', en.upgrade.plans.yearly.name),
    ptBR.upgrade.plans.checkoutLabelRecommended.replace('{interval}', ptBR.upgrade.plans.yearly.name))
  await expect(checkout).toBeVisible()
  await expect(checkout).toBeEnabled()
}
