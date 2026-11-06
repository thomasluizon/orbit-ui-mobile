#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { validateToolArguments } from './tool-validation.mjs'
import { tools, legacyTools, offerTools, observableSchema } from './trace-policy.mjs'
import { configureOffers } from './offer-context.mjs'
import { toolBehavior } from './assertions.mjs'
import { historicalReadExpectations } from './offer-lifecycle.mjs'
import parseResponse from './response.mjs'
import { tsImport } from 'tsx/esm/api'

const { buildChatClientContext } = await tsImport('../../packages/shared/src/chat/client-context.ts', import.meta.url)

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((path) =>
  parse(readFileSync(new URL(path, import.meta.url), 'utf8'), { merge: true }))
const observable = (catalog) => catalog.map((tool) => ({ ...tool, function: { ...tool.function,
  description: tool.function.description ?? undefined,
  parameters: observableSchema(tool.function.parameters, new Set(tool.sensitiveFields)),
} }))

function declarations(vars) {
  if (vars.clientContext?.supportsParts !== true) return [observable(legacyTools)]
  const offers = vars.clientContext.supportsProactiveOffers === true
  return [observable(offers ? offerTools : tools)]
}

function restartPopulation(attempt, vars) {
  if (!vars.restart) return
  const seeded = attempt.groundingEvidence?.fixture?.habits
  const reads = attempt.groundingEvidence?.successfulTools?.filter((call) => call.name === 'query_habits')
  if (seeded?.length === 6 && reads?.length && reads.some((call) => call.result?.totalCount !== seeded.length)) {
    return 'Recorded restart fixture returned fewer than six unfinished habits; the reset precondition needs a new attempt.'
  }
}

function historicalScope(attempt, vars, assertions) {
  const offers = assertions.find((assertion) => assertion.metric === 'proactiveOffers')
  const turns = attempt.offerReadback?.turns
  const accountDate = attempt.groundingEvidence?.fixture?.loggedState?.date
  if (vars.offerFamily !== 'due-log' || offers?.pass !== false || turns?.length !== 1
    || turns[0].assertions?.find((assertion) => assertion.metric === 'behavior')?.pass !== false
    || !/^\d{4}-\d{2}-\d{2}$/u.test(accountDate ?? '')) return
  const date = new Date(Date.parse(`${accountDate}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const verdict = toolBehavior(turns[0].toolCalls, historicalReadExpectations(date))
  if (!verdict.pass) return `Historical read scope: ${verdict.reason}`
  Object.assign(offers, { reason: 'Historical read scope matched; its offer check and the partial-scope turn were never recorded.' })
  return 'incomplete'
}

// Ajv stops at the first error, so each saved "[redacted]" field value becomes null and the call is validated again.
// Producer schemas make every optional field nullable; a redacted array item or non-nullable field still fails.
function withoutRedactedFields(value) {
  if (Array.isArray(value)) return value.map((item) => item === '[redacted]' ? item : withoutRedactedFields(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, child === '[redacted]' ? null : withoutRedactedFields(child)]))
}

async function schemaVerdict(call, validate) {
  const verdict = { name: call.name, ...await validate(call) }
  if (verdict.pass) return verdict
  const projected = withoutRedactedFields(call.arguments)
  if (JSON.stringify(projected) === JSON.stringify(call.arguments)) return verdict
  return (await validate({ ...call, arguments: projected })).pass ? { ...verdict, redacted: true } : verdict
}

export async function replayAttempt(attempt, descriptor, recorded) {
  const before = recorded.allAttemptsPass
  const test = structuredClone(descriptor)
  configureOffers(test)
  test.vars.clientContext ??= buildChatClientContext({ platform: test.metadata.platform ?? 'web', locale: test.metadata.locale ?? 'en' })
  const assertions = structuredClone(attempt.assertions)
  const notes = []
  const validate = (call) => validateToolArguments(call, declarations(test.vars), { test, vars: test.vars })
  const schemas = await Promise.all(attempt.toolCalls.map((call) => schemaVerdict(call, validate)))
  if (schemas.some((verdict) => verdict.redacted)) notes.push('A recorded argument holds a redacted value, so its schema cannot be replayed.')
  const structure = assertions.find((assertion) => assertion.metric === 'toolStructure')
  if (structure?.pass === false && /Call to "ask" does not match schema/u.test(structure.reason)
    && schemas.length && schemas.every((verdict) => verdict.pass)) {
    Object.assign(structure, { pass: true, reason: 'Recorded arguments match the producer request declaration.' })
    notes.push('The API keeps the cacheable ask request schema; continuation updates are instruction constraints.')
  }
  const behavior = assertions.find((assertion) => assertion.metric === 'toolBehavior')
  const completedGoal = test.vars.offerFamily === 'goal-on-track' && test.vars.offerState === 'completed'
  if (behavior && (completedGoal || behavior.pass === false && behavior.reason.startsWith('Mutation outside the declared operation scope:'))) {
    const verdict = toolBehavior(attempt.toolCalls, test.vars.expectations)
    Object.assign(behavior, { pass: verdict.pass, reason: verdict.reason })
    notes.push(completedGoal
      ? `Completed-goal coverage: ${verdict.reason} An active-only query cannot prove completed-goal exclusion; the revised case needs fresh evidence.`
      : `Outcome scope: ${verdict.reason}`)
  }
  const historical = historicalScope(attempt, test.vars, assertions)
  let after = before
  if (historical === 'incomplete') { after = 'incomplete'; notes.push('The historical read now matches its requested day; the unrecorded offer and partial-scope checks need a new attempt.') }
  else if (historical) notes.push(historical)
  if (completedGoal && behavior?.pass === false) after = 'fail'
  if (before === 'fail' && assertions.length && assertions.every((assertion) => assertion.pass)) after = 'pass'
  if (recorded.latency?.status === 'fail') { after = 'fail'; notes.push('The recorded read latency still exceeds its budget.') }
  const population = restartPopulation(attempt, test.vars)
  if (population) { after = 'incomplete'; notes.push(population) }
  if (attempt.httpError) {
    const parsed = parseResponse(attempt.httpError, '', { response: { status: attempt.httpStatus,
      headers: { 'x-orbit-request-id': attempt.httpError.responseRequestId } } })
    if (parsed.output?.unavailable) { after = 'incomplete'; notes.push('AI_UNAVAILABLE is unavailable evidence, not a refusal.') }
  }
  if (attempt.setup?.toolCalls?.length) {
    const verdict = toolBehavior(attempt.setup.toolCalls, test.vars.setup.expectations)
    notes.push(`Setup outcome scope: ${verdict.reason} Preview evidence remains unavailable.`)
  }
  if (attempt.offerReadback?.reason?.includes('HTTP 409')) notes.push('The saved conflict keeps only its route and typed reason, when the API sent one; no retry or success can be inferred.')
  if (attempt.offerReadback?.reason?.startsWith('ask requires')) notes.push('The failing continuation trace was not recorded; its grade cannot be replayed.')
  return { caseId: attempt.caseId, repeat: attempt.repeat, recordedAttemptPassed: attempt.pass,
    before, after, assertions, schemas, notes,
    retained: 'Identity, prerequisites, composition, lifecycle readbacks and semantic rubric verdicts retain their recorded grades.' }
}

export async function replayWindow(source, destination) {
  const input = realpathSync(source)
  const suffix = []
  let parent = resolve(destination)
  while (!existsSync(parent)) { suffix.unshift(basename(parent)); parent = dirname(parent) }
  const output = resolve(realpathSync(parent), ...suffix)
  if (output === input || output.startsWith(`${input}${sep}`) || input.startsWith(`${output}${sep}`)) {
    throw new Error('Replay output must be separate from the read-only source window.')
  }
  const original = JSON.parse(readFileSync(`${input}/summary.json`, 'utf8'))
  const files = readdirSync(`${input}/attempts`).filter((name) => name.endsWith('.json')).sort()
  const results = []
  for (const file of files) {
    const attempt = JSON.parse(readFileSync(`${input}/attempts/${file}`, 'utf8'))
    const descriptor = corpus.find((entry) => entry.metadata.id === attempt.caseId)
    const recorded = original.cases.find((entry) => entry.id === attempt.caseId)
    if (!descriptor || !recorded) throw new Error('Replay case is missing its corpus policy or original verdict.')
    results.push(await replayAttempt(attempt, descriptor, recorded))
  }
  if (results.length !== original.cases.length || new Set(results.map((entry) => entry.caseId)).size !== original.cases.length) {
    throw new Error('Replay requires the complete window with one recorded attempt per case.')
  }
  const regressions = results.filter((entry) => entry.before === 'pass' && entry.after !== 'pass'
    || entry.recordedAttemptPassed === true && entry.schemas.some((verdict) => !verdict.pass && !verdict.redacted))
  const counts = (key) => Object.fromEntries(['pass', 'fail', 'incomplete'].map((status) =>
    [status, results.filter((entry) => entry[key] === status).length]))
  const markdown = [
    'Offline assertion replay', '',
    `Recorded cases: ${results.length}. Previously passing cases regressed: ${regressions.length}.`,
    `Before: ${JSON.stringify(counts('before'))}. After: ${JSON.stringify(counts('after'))}.`, '',
    'This replays available argument schemas and changed outcome scopes. It makes no provider or judge calls.',
    'The saved projections omit request/call identities, full compositions, some tool results and failed continuation traces.',
    'All other assertion verdicts are retained, not re-executed. This audit cannot approve a launch or supply missing evidence.', '',
    '| Case | Before | After | Argument schemas | Change or evidence limit |',
    '|---|---|---|---|---|',
    ...results.map((entry) => `| ${entry.caseId} | ${entry.before} | ${entry.after} | ${entry.schemas.every((verdict) => verdict.pass) ? 'pass' : 'unreplayable projection'} | ${entry.notes.join(' ').replaceAll('|', '\\|')} |`), '',
  ].join('\n')
  mkdirSync(output, { recursive: true, mode: 0o700 })
  writeFileSync(`${output}/replay.json`, `${JSON.stringify({ results, regressions, before: counts('before'), after: counts('after') }, null, 2)}\n`, { mode: 0o600 })
  writeFileSync(`${output}/summary.md`, markdown, { mode: 0o600 })
  if (regressions.length) throw new Error('Offline replay changed a previously passing case; inspect the audit.')
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  globalThis.fetch = async () => { throw new Error('Network calls are forbidden during recorded replay.') }
  try { await replayWindow(process.argv[2], process.argv[3]) } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
