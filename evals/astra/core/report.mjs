import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { attemptEvidence } from '../evidence.mjs'
import { changeList } from './change-list.mjs'
import { phrasingDigest } from './corpus.mjs'

const evidencePath = (caseId, repeat) => `attempts/${encodeURIComponent(caseId)}-r${repeat}.json`
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const rounded = (value, digits) => value === null ? null : Number(value.toFixed(digits))
const withoutEvidence = (assertion) => assertion.metadata?.unavailable === true || assertion.metadata?.graderError === true

function writePrivateJson(path, value) {
  const next = `${path}.next`
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  chmodSync(next, 0o600)
  renameSync(next, path)
}

// One attempt of one case: its verdict, the questions that came before its preview, and its measured model calls.
// An attempt that gave no evidence (a failed precondition, a stopped stream, a spend ceiling) is neither a pass nor a fail.
function attemptOf(entry, repeat) {
  const output = entry.response?.output ?? {}
  const assertions = entry.gradingResult?.componentResults ?? []
  const unavailable = output.unavailable === true || assertions.some(withoutEvidence)
  return { caseId: entry.testCase.metadata.id, repeat, pass: entry.success === true && !unavailable,
    ...(unavailable ? { unavailable: true } : {}),
    reason: output.error ?? entry.error ?? assertions.find((assertion) => assertion.pass !== true)?.reason ?? null,
    turns: output.turns ?? 0,
    questionsBeforePreview: output.previews?.length ? output.questionsBeforePreview : null,
    modelCalls: output.turns ? output.modelCalls ?? null : 0,
    assertions: assertions.map((assertion, index) => ({
      metric: assertion.assertion?.metric ?? entry.testCase.assert?.[index]?.metric ?? null,
      pass: assertion.pass === true, reason: assertion.reason ?? null })) }
}

function attemptsOf(results) {
  const repeats = new Map()
  return results.map((entry) => {
    const repeat = (repeats.get(entry.testCase.metadata.id) ?? 0) + 1
    repeats.set(entry.testCase.metadata.id, repeat)
    return { entry, attempt: attemptOf(entry, repeat) }
  })
}

// Private evidence of each attempt for the triage of a failure: the sanitized tool calls and answer of the last turn,
// the held change list and the saved state verdict. The summary files hold case identifiers and counts only.
export function writeResults(results, directory) {
  mkdirSync(`${directory}/attempts`, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  chmodSync(`${directory}/attempts`, 0o700)
  const attempts = attemptsOf(results).map(({ entry, attempt }) => {
    const output = entry.response?.output ?? {}
    const evidence = attemptEvidence(entry, { ...attempt, heldChanges: changeList(output.previews).changes
      .map(({ kind, fields }) => ({ kind, fields })), resend: output.resend ?? null })
    writePrivateJson(`${directory}/${evidencePath(attempt.caseId, attempt.repeat)}`, evidence)
    return Object.fromEntries(Object.keys(attempt).map((key) => [key, evidence[key]]))
  })
  writePrivateJson(`${directory}/results.json`, attempts)
}

// pass^k of one case: fail when an attempt failed, pass when all k attempts passed, incomplete otherwise.
export function caseOf(descriptor, attempts) {
  const failed = attempts.some((attempt) => !attempt.pass && !attempt.unavailable)
  const complete = attempts.length === descriptor.k && attempts.every((attempt) => attempt.pass)
  const { id, situation, family, defectClass, locale, mustPass, k, maxQuestions } = descriptor
  return { id, situation, family, defectClass, locale, mustPass, k, attempts: attempts.length,
    passed: attempts.filter((attempt) => attempt.pass).length,
    unavailable: attempts.filter((attempt) => attempt.unavailable).length,
    passK: failed ? 'fail' : complete ? 'pass' : 'incomplete', maxQuestions,
    questionsBeforePreview: attempts.map((attempt) => attempt.questionsBeforePreview),
    modelCalls: attempts.map((attempt) => attempt.modelCalls),
    reasons: [...new Set(attempts.filter((attempt) => !attempt.pass).map((attempt) => attempt.reason).filter(Boolean))] }
}

const statusOf = (cases) => cases.some((entry) => entry.passK === 'fail') ? 'fail'
  : !cases.length || cases.some((entry) => entry.passK === 'incomplete') ? 'incomplete' : 'pass'

export function groupsOf(cases) {
  return [...new Set(cases.map((entry) => `${entry.family}/${entry.locale}`))].map((key) => {
    const members = cases.filter((entry) => `${entry.family}/${entry.locale}` === key)
    const passed = members.filter((entry) => entry.passK === 'pass').length
    return { family: members[0].family, locale: members[0].locale, cases: members.length, passed,
      passRate: rounded(passed / members.length, 4), passK: statusOf(members) }
  })
}

// The measured figures of a set of cases: the pass^k rate, the questions that came before a preview against the count
// each case allows, and the model calls.
export function totalsOf(cases) {
  const observed = cases.flatMap((entry) => entry.questionsBeforePreview.filter((count) => count !== null)
    .map((count) => ({ count, allowed: entry.maxQuestions })))
  const calls = cases.flatMap((entry) => entry.modelCalls)
  const passed = cases.filter((entry) => entry.passK === 'pass').length
  return { cases: cases.length, passed, passRate: cases.length ? rounded(passed / cases.length, 4) : null,
    attempts: cases.reduce((sum, entry) => sum + entry.attempts, 0),
    meanQuestionsBeforePreview: rounded(mean(observed.map(({ count }) => count)), 3),
    allowedMeanQuestions: rounded(mean(observed.map(({ allowed }) => allowed)), 3),
    modelCalls: calls.every((count) => count !== null) ? calls.reduce((sum, count) => sum + count, 0) : null }
}

// The summary of one promptfoo run of the core set (the must-pass run or the other run) in one UTC-day window.
export function summarize(results, descriptors, { run, apiCommit }) {
  const attempts = attemptsOf(results).map(({ attempt }) => attempt)
  const cases = descriptors.map((descriptor) => caseOf(descriptor, attempts.filter((attempt) => attempt.caseId === descriptor.id)))
  const unexpected = attempts.some((attempt) => !descriptors.some((descriptor) => descriptor.id === attempt.caseId))
  return { gate: 'core', run, apiCommit, phrasingDigest, utcDay: new Date().toISOString().slice(0, 10),
    status: unexpected && statusOf(cases) === 'pass' ? 'incomplete' : statusOf(cases), cases, groups: groupsOf(cases), totals: totalsOf(cases) }
}

const cell = (value) => value === null || value === undefined ? 'not measured' : String(value)
const listed = (values) => values.map(cell).join(', ') || 'none'

function criteriaRows(criteria) {
  if (!criteria) return []
  const { mustPass, passRate, questions, cost } = criteria
  return ['', '| Gate criterion | Measured | Limit | Verdict |', '|---|---|---|---|',
    `| Every must-pass case passes pass^k | ${mustPass.passed}/${mustPass.cases} | ${mustPass.cases}/${mustPass.cases} | ${mustPass.status} |`,
    `| pass^k rate of the core set | ${cell(passRate.rate)} | ${passRate.baselineRate === null ? 'this run is the baseline' : `at or above ${passRate.baselineRate}`} | ${passRate.status} |`,
    `| Mean questions before a preview | ${cell(questions.mean)} | at or below ${cell(questions.allowedMean)} | ${questions.status} |`,
    `| Cost of one model call (USD) | ${cell(cost.perModelCallUsd)} | at or below ${cost.limitUsd} (D147) | ${cost.status} |`]
}

export function writeReport(summary, directory) {
  mkdirSync(directory, { recursive: true })
  const markdown = [
    `Orbit AI core gate, ${summary.run} run: ${summary.status}`,
    `API commit: ${summary.apiCommit}`,
    `Phrasing digest: ${summary.phrasingDigest}`,
    ...(summary.utcDayWindows ? [`UTC-day windows: ${summary.utcDayWindows}`] : [`UTC day: ${summary.utcDay}`]),
    ...(summary.cost ? [`Measured run cost (USD): ${cell(summary.cost.runUsd)}`, `Model calls: ${cell(summary.totals.modelCalls)}`] : []),
    ...criteriaRows(summary.criteria),
    '',
    '| Case | Family | Class | Locale | Must-pass | k | Attempts passed | pass^k | Questions before preview | Allowed | Model calls | Cost (USD) | Attempts |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...summary.cases.map((entry) => {
      const evidence = entry.passK === 'fail' ? Array.from({ length: entry.attempts }, (_, index) =>
        `[r${index + 1}](${evidencePath(entry.id, index + 1)})`).join(', ') : ''
      return `| ${entry.id} | ${entry.family} | ${entry.defectClass} | ${entry.locale} | ${entry.mustPass ? 'yes' : 'no'} | ${entry.k} | ${entry.passed}/${entry.attempts} | ${entry.passK} | ${listed(entry.questionsBeforePreview)} | ${entry.maxQuestions} | ${listed(entry.modelCalls)} | ${cell(entry.costUsd)} | ${evidence} |`
    }),
    '',
    '| Family | Locale | Cases passing pass^k | pass^k rate | pass^k |',
    '|---|---|---|---|---|',
    ...summary.groups.map((entry) => `| ${entry.family} | ${entry.locale} | ${entry.passed}/${entry.cases} | ${entry.passRate} | ${entry.passK} |`),
    '',
    ...summary.cases.flatMap((entry) => entry.reasons.map((reason) => `${entry.id}: ${reason.replace(/[\r\n|]/gu, ' ')}`)),
    '',
    'A must-pass case passes only when each of its 3 attempts passes. No rerun replaces a failed attempt.',
    'Incomplete is not a pass. A held preview proves a proposal; the saved state readback proves the write.',
  ].join('\n')
  writeFileSync(`${directory}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(`${directory}/summary.md`, `${markdown}\n`)
  return markdown
}
