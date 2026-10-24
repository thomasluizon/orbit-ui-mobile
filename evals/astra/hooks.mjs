import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { prepareCorrection } from './setup.mjs'
import { summarize, writeReport } from './report.mjs'

export function beforeAll({ suite }) {
  const required = ['ORBIT_EVAL_BASE_URL', 'ORBIT_EVAL_GRADER', 'ORBIT_EVAL_RESET_SCRIPT',
    'ORBIT_EVAL_HABIT_ID', 'ORBIT_EVAL_SECOND_HABIT_ID', 'ORBIT_EVAL_OVERDUE_DATE',
    ...suite.tests.map((test) => test.vars.credentialKey)]
  for (const key of new Set(required)) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`)
  }
  const endpoint = new URL(process.env.ORBIT_EVAL_BASE_URL)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || endpoint.pathname !== '/') throw new Error('ORBIT_EVAL_BASE_URL must be an HTTPS origin without credentials or a path.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(process.env.ORBIT_EVAL_OVERDUE_DATE)) throw new Error('ORBIT_EVAL_OVERDUE_DATE must be an ISO calendar date.')
}

export function beforeEach({ test }) {
  try {
    execFileSync(process.env.ORBIT_EVAL_RESET_SCRIPT, [test.metadata.id], { stdio: 'ignore', timeout: 60000 })
  } catch {
    throw new Error(`Fixture reset failed for ${test.metadata.id}; no chat request should run.`)
  }
  const substitutions = {
    habitId: process.env.ORBIT_EVAL_HABIT_ID,
    secondHabitId: process.env.ORBIT_EVAL_SECOND_HABIT_ID,
    overdueDate: process.env.ORBIT_EVAL_OVERDUE_DATE,
  }
  const substitute = (value) => {
    if (typeof value === 'string') return value.replace(/\{(habitId|secondHabitId|overdueDate)\}/g, (_, key) => substitutions[key])
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
  const markdown = writeReport(summary)
  process.stdout.write(`${markdown}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  if (summary.status !== 'pass') throw new Error(`Astra launch gate ${summary.status}; see reports/summary.md.`)
}
