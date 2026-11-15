import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { apiOrigin, healthyApi, readCredentials, refreshCredential, safeFailureMessage } from '../credentials.mjs'
import { requireEvalOrigin, resetFixture } from '../fixtures/reset.mjs'
import { fixtureHabitTitles } from '../fixtures/names.mjs'
import { requireEvalAccess } from '../fixtures/api.mjs'
import { apiCommit } from '../trace-policy.mjs'
import { summarize, writeReport, writeResults } from './report.mjs'

const { buildChatClientContext } = await tsImport('../../../packages/shared/src/chat/client-context.ts', import.meta.url)

let run = null

function persist(results) {
  writeResults(results, run.directory)
  const summary = summarize(results, run.descriptors, { run: run.name, apiCommit: run.apiCommit })
  return { summary, markdown: writeReport(summary, run.directory) }
}

export async function beforeAll({ suite }) {
  const descriptors = suite.tests.map((test) => test.metadata)
  const name = descriptors.every((descriptor) => descriptor.mustPass) ? 'must-pass'
    : descriptors.every((descriptor) => !descriptor.mustPass) ? 'other' : null
  if (!name) throw new Error('One run of the core set holds must-pass cases or other cases, never both.')
  const graded = suite.tests.some((test) => test.vars.rubric)
  for (const key of ['ORBIT_EVAL_BASE_URL', 'ORBIT_EVAL_CREDENTIALS_FILE', ...(graded ? ['ORBIT_EVAL_GRADER'] : [])]) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`)
  }
  apiOrigin()
  requireEvalOrigin()
  const health = await healthyApi({ fresh: true })
  if (!/^[a-f0-9]{40}$/u.test(apiCommit) || apiCommit !== health.commit) {
    throw new Error(`Astra catalog ${apiCommit} differs from API ${health.commit}. Regenerate from a clean API checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.`)
  }
  readCredentials()
  const unmetered = new Map()
  for (const key of new Set(suite.tests.map((test) => test.vars.credentialKey))) {
    await refreshCredential(key)
    unmetered.set(key, await requireEvalAccess(key))
  }
  run = { name, directory: `reports/core-${name}`, descriptors, apiCommit: health.commit, unmetered, results: [] }
  persist(run.results)
}

// The records a case names, from the fixture the reset left in the account.
function fixtureRecords(vars, account) {
  const set = vars.sameTitleBaseline
  return set ? { parent: set.parent.id, children: set.children.map((child) => child.id), walk: account.secondHabitId }
    : { water: account.habitId, walk: account.secondHabitId, first: account.habitId, second: account.secondHabitId }
}

export async function beforeEach({ test }) {
  const vars = test.vars
  delete vars.preconditionFailure
  delete vars.fixtureEvidence
  delete vars.sameTitleBaseline
  try {
    requireEvalOrigin()
    await refreshCredential(vars.credentialKey)
    vars.accountDate = new Date().toISOString().slice(0, 10)
    await resetFixture(test, vars.accountDate, run.unmetered.get(vars.credentialKey) === true)
    vars.fixtureHabitTitles = fixtureHabitTitles(test.metadata.fixture, test.metadata.locale)
    vars.clientContext = buildChatClientContext({ platform: test.metadata.platform, locale: test.metadata.locale,
      uses24HourClock: vars.uses24HourClock })
    vars.evalRequestId = randomUUID()
    vars.core.baseline = vars.fixtureEvidence.habits
    vars.core.records = fixtureRecords(vars, readCredentials()[vars.credentialKey])
  } catch (error) {
    vars.preconditionFailure = safeFailureMessage(error)
    process.stderr.write(`Core set precondition unavailable for ${test.metadata.id}: ${vars.preconditionFailure}\n`)
  }
  return { test }
}

export function afterEach({ result }) {
  run.results.push(result)
  persist(run.results)
}

export function afterAll({ results }) {
  const { summary, markdown } = persist(results)
  process.stdout.write(`${markdown}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  if (summary.status !== 'pass') process.exitCode = 1
}
