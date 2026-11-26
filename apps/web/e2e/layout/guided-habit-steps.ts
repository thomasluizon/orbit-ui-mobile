import { expect, type Locator, type Page } from '@playwright/test'
import type en from '@orbit/shared/i18n/en.json'

type Messages = typeof en
type OptionalStep = 'description' | 'checklist' | 'subHabits' | 'avoid' | 'tags' | 'goals' | 'endDate' | 'parent'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The summary question group of a guided flow: the one place a create or edit flow rests. */
export function guidedSummary(scope: Page | Locator, messages: Messages): Locator {
  return scope.getByRole('group', { name: messages.habits.flow.confirm.question, exact: true })
}

/** A summary or "more" row. Its accessible name is the question followed by the current answer. */
export function guidedRow(scope: Page | Locator, question: string): Locator {
  return scope.getByRole('button', { name: new RegExp(`^${escapeRegExp(question)}`) })
}

/** Types the words on the first question of the create flow and answers each following question until the summary shows. */
export async function reachCreateSummary(page: Page, messages: Messages, title = 'Prepare coffee'): Promise<Locator> {
  const flow = messages.habits.flow
  await page.getByRole('textbox', { name: flow.what.label, exact: true }).fill(title)
  await page.getByRole('button', { name: flow.continue, exact: true }).click()
  const summary = guidedSummary(page, messages)
  const answers = [
    { group: page.getByRole('group', { name: flow.when.question, exact: true }), option: flow.when.noDate },
    { group: page.getByRole('group', { name: flow.time.question, exact: true }), option: flow.time.none },
  ]
  for (let turn = 0; turn <= answers.length + 1; turn += 1) {
    await expect(summary.or(answers[0]!.group).or(answers[1]!.group).first()).toBeVisible({ timeout: 30_000 })
    if (await summary.isVisible()) break
    for (const answer of answers) {
      if (!await answer.group.isVisible()) continue
      await answer.group.getByRole('button', { name: answer.option, exact: true }).click()
      await expect(answer.group).toBeHidden()
      break
    }
  }
  await expect(summary).toBeVisible()
  return summary
}

/** From the summary, opens "Quer mais?" and then one optional question. */
export async function openOptionalStep(page: Page, messages: Messages, step: OptionalStep): Promise<void> {
  await guidedRow(guidedSummary(page, messages), messages.habits.flow.more).click()
  await guidedRow(page.getByRole('list', { name: messages.habits.flow.more, exact: true }), messages.habits.flow.optional[step]).click()
  await expect(page.getByRole('heading', { name: messages.habits.flow.optional[step], exact: true })).toBeVisible()
}
