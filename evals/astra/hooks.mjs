import { appendFileSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { apiOrigin, healthyApi, readCredentials, refreshCredential, safeFailureMessage } from './credentials.mjs'
import { dateOffset, resetFixture } from './fixtures/reset.mjs'
import { requireEvalAccess } from './fixtures/api.mjs'
import { prepareCorrection } from './setup.mjs'
import { descriptors } from './merge-reports.mjs'
import { summarize, writeReport, writeResults } from './report.mjs'

const { buildChatClientContext } = await tsImport('../../packages/shared/src/chat/client-context.ts', import.meta.url)

let completedResults = []
let selectedCases = []
const accountAccess = new Map()

function persistResults(results, expectedCases) {
  writeResults(results)
  const summary = summarize(results, expectedCases)
  const completeCorpus = descriptors.every(({ id }) => summary.cases.some((entry) => entry.id === id))
  summary.gateStatus = !completeCorpus && summary.status === 'pass' ? 'incomplete' : summary.status
  return { summary, markdown: writeReport(summary) }
}

export async function beforeAll({ suite }) {
  completedResults = []
  selectedCases = suite.tests.map((test) => test.metadata)
  accountAccess.clear()
  persistResults(completedResults, selectedCases)
  const required = ['ORBIT_EVAL_BASE_URL', 'ORBIT_EVAL_GRADER', 'ORBIT_EVAL_CREDENTIALS_FILE']
  for (const key of new Set(required)) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`)
  }
  apiOrigin()
  if (process.env.ORBIT_EVAL_OVERDUE_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(process.env.ORBIT_EVAL_OVERDUE_DATE)) throw new Error('ORBIT_EVAL_OVERDUE_DATE must be an ISO calendar date.')
  const { apiCommit } = parse(readFileSync(new URL('./catalog.yaml', import.meta.url), 'utf8'))
  const health = await healthyApi({ fresh: true })
  if (!/^[a-f0-9]{40}$/.test(apiCommit) || apiCommit !== health.commit) {
    throw new Error(`Astra catalog ${apiCommit} differs from API ${health.commit}. Regenerate from a clean API checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.`)
  }
  readCredentials()
  await requireAccountPolicies(suite.tests)
}

async function requireAccountPolicies(tests) {
  for (const key of new Set(tests.map((test) => test.vars.credentialKey))) {
    await refreshCredential(key)
    accountAccess.set(key, await requireEvalAccess(key))
  }
}

export async function beforeEach({ test }) {
  delete test.vars.preconditionFailure
  try { return await prepareAttempt(test) } catch (error) {
    test.vars.preconditionFailure = safeFailureMessage(error)
    process.stderr.write(`Astra precondition unavailable for ${test.metadata.id}: ${test.vars.preconditionFailure}\n`)
    return { test }
  }
}

async function prepareAttempt(test) {
  await refreshCredential(test.vars.credentialKey)
  const today = new Date().toISOString().slice(0, 10)
  test.vars.accountDate = today
  process.env.ORBIT_EVAL_OVERDUE_DATE ??= dateOffset(today, -1)
  await resetFixture(test, today, accountAccess.get(test.vars.credentialKey) === true)
  const account = readCredentials()[test.vars.credentialKey]
  const substitutions = {
    accountDate: today,
    habitId: account.habitId ?? process.env.ORBIT_EVAL_HABIT_ID,
    secondHabitId: account.secondHabitId ?? process.env.ORBIT_EVAL_SECOND_HABIT_ID,
    overdueDate: process.env.ORBIT_EVAL_OVERDUE_DATE,
  }
  for (const [key, offset] of [['historyFrom', -6], ['historyTo', -4], ['comparisonFrom', -3], ['comparisonTo', -1]]) {
    substitutions[key] = dateOffset(today, offset)
    substitutions[`${key}Localized`] = new Intl.DateTimeFormat(test.metadata.locale ?? 'en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${substitutions[key]}T12:00:00Z`))
  }
  const substitute = (value) => {
    if (typeof value === 'string') return value.replace(/\{(accountDate|habitId|secondHabitId|overdueDate|historyFrom|historyTo|comparisonFrom|comparisonTo|historyFromLocalized|historyToLocalized|comparisonFromLocalized|comparisonToLocalized)\}/g, (_, key) => {
      if (!substitutions[key]) throw new Error(`Missing fixture substitution: ${key}`)
      return substitutions[key]
    })
    if (Array.isArray(value)) return value.map(substitute)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, substitute(child)]))
    return value
  }
  test.vars = substitute(test.vars)
  test.vars.clientContext ??= buildChatClientContext({ platform: test.metadata.platform ?? 'web', locale: test.metadata.locale ?? 'en' })
  test.vars.clientContextJson = JSON.stringify(test.vars.clientContext)
  test.vars.historyJson = JSON.stringify(test.vars.history ?? [])
  test.vars.evalRequestId = randomUUID()
  return test.vars.setup ? prepareCorrection(test) : { test }
}

export function afterEach({ result }) {
  completedResults.push(result)
  persistResults(completedResults, selectedCases)
}

export function afterAll({ results, suite }) {
  const { summary, markdown } = persistResults(results, suite.tests.map((test) => test.metadata))
  process.stdout.write(`${markdown}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  if (summary.status !== 'pass') throw new Error(`Astra launch gate ${summary.status}; see reports/summary.md and reports/results.json.`)
}
