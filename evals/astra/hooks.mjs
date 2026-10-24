import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { apiOrigin, readCredentials, refreshCredential } from './credentials.mjs'
import { dateOffset, resetFixture } from './fixtures/reset.mjs'
import { prepareCorrection } from './setup.mjs'
import { descriptors } from './merge-reports.mjs'
import { summarize, writeReport } from './report.mjs'

export function beforeAll({ suite }) {
  const required = ['ORBIT_EVAL_BASE_URL', 'ORBIT_EVAL_GRADER', 'ORBIT_EVAL_CREDENTIALS_FILE']
  for (const key of new Set(required)) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`)
  }
  apiOrigin()
  const credentials = readCredentials()
  for (const test of suite.tests) {
    if (!credentials[test.vars.credentialKey]?.refreshToken) throw new Error(`Missing refresh credential: ${test.vars.credentialKey}`)
  }
  if (process.env.ORBIT_EVAL_OVERDUE_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(process.env.ORBIT_EVAL_OVERDUE_DATE)) throw new Error('ORBIT_EVAL_OVERDUE_DATE must be an ISO calendar date.')
}

export async function beforeEach({ test }) {
  await refreshCredential(test.vars.credentialKey)
  const today = new Date().toISOString().slice(0, 10)
  process.env.ORBIT_EVAL_OVERDUE_DATE ??= dateOffset(today, -1)
  try {
    await resetFixture(test)
  } catch {
    throw new Error(`Fixture reset failed for ${test.metadata.id}; no chat request should run.`)
  }
  const account = readCredentials()[test.vars.credentialKey]
  const substitutions = {
    habitId: account.habitId ?? process.env.ORBIT_EVAL_HABIT_ID,
    secondHabitId: account.secondHabitId ?? process.env.ORBIT_EVAL_SECOND_HABIT_ID,
    overdueDate: process.env.ORBIT_EVAL_OVERDUE_DATE,
  }
  for (const [key, offset] of [['historyFrom', -6], ['historyTo', -4], ['comparisonFrom', -3], ['comparisonTo', -1]]) {
    substitutions[key] = dateOffset(today, offset)
    substitutions[`${key}Localized`] = new Intl.DateTimeFormat(test.metadata.locale ?? 'en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${substitutions[key]}T12:00:00Z`))
  }
  const substitute = (value) => {
    if (typeof value === 'string') return value.replace(/\{(habitId|secondHabitId|overdueDate|historyFrom|historyTo|comparisonFrom|comparisonTo|historyFromLocalized|historyToLocalized|comparisonFromLocalized|comparisonToLocalized)\}/g, (_, key) => {
      if (!substitutions[key]) throw new Error(`Missing fixture substitution: ${key}`)
      return substitutions[key]
    })
    if (Array.isArray(value)) return value.map(substitute)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, substitute(child)]))
    return value
  }
  test.vars = substitute(test.vars)
  test.vars.clientContextJson = JSON.stringify(test.vars.clientContext ?? {})
  test.vars.historyJson = JSON.stringify(test.vars.history ?? [])
  test.vars.evalRequestId = randomUUID()
  return test.vars.setup ? prepareCorrection(test) : { test }
}

export function afterAll({ results, suite }) {
  const summary = summarize(results, suite.tests.map((test) => test.metadata))
  const completeCorpus = descriptors.every(({ id }) => summary.cases.some((entry) => entry.id === id))
  summary.gateStatus = !completeCorpus && summary.status === 'pass' ? 'incomplete' : summary.status
  const markdown = writeReport(summary)
  process.stdout.write(`${markdown}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  if (summary.status !== 'pass') throw new Error(`Astra launch gate ${summary.status}; see reports/summary.md.`)
}
