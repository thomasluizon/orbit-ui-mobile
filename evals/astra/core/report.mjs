import { mkdirSync, writeFileSync } from 'node:fs'
import { attemptEvidence, evidencePath, openPrivateEvidence, unavailableAssertion, writePrivateJson } from '../evidence.mjs'
import { guid, guidPattern } from '../fixtures/api.mjs'
import { changeList, recordId } from './change-list.mjs'
import { EQUAL_MODEL_INPUT_ATTEMPTS, MUST_PASS_ATTEMPTS, corpusDigestFor } from './corpus.mjs'

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const rounded = (value, digits) => value === null ? null : Number(value.toFixed(digits))

// The kinds of attempt that give no evidence of the build. Each `unavailable` verdict of the core set comes from one of
// them, and the report heading of their reasons names each one.
export const noEvidenceKinds = ['a throttle', 'a spend ceiling', 'a failed precondition', 'a failed rubric grader',
  'a card turn without the trace that its answer needs', 'a preview turn without the trace that shows a `stored` field']

// One attempt of one case: its verdict, the questions that came before its preview, its measured model calls and the
// seconds that the person waited. Two kinds of attempt are neither a pass nor a fail: an attempt that gave no evidence
// (one of `noEvidenceKinds`) and an attempt that the grader could not read.
function attemptOf(entry, repeat) {
  const output = entry.response?.output ?? {}
  const questions = output.questionsBeforePreview
  const assertions = entry.gradingResult?.componentResults ?? []
  const unavailable = output.unavailable === true || assertions.some(unavailableAssertion)
  const graderLimit = !unavailable && output.graderLimit === true
  return { caseId: entry.testCase.metadata.id, repeat, pass: entry.success === true && !unavailable && !graderLimit,
    ...(unavailable ? { unavailable: true } : {}), ...(graderLimit ? { graderLimit: true } : {}),
    reason: output.error ?? entry.error ?? assertions.find((assertion) => assertion.pass !== true)?.reason ?? null,
    turns: output.turns ?? 0,
    // The questions before the preview. runCase stops an attempt one question past the count its case allows, before
    // any preview, and that attempt keeps its count. Any other attempt without a preview counts no question.
    questionsBeforePreview: output.previews?.length || questions > entry.testCase.metadata.maxQuestions ? questions : null,
    modelCalls: output.turns ? output.modelCalls ?? null : 0,
    seconds: output.turns ? output.seconds ?? null : null,
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

// The record ids inside a longer text: the eval's one GUID rule without its anchors.
const recordIds = new RegExp(guidPattern, 'giu')

// The held previews of an attempt, kept so that an extended grader regrades the attempt offline with gradePreview, the
// records of the case under the same names, and the fields that the held writes name (`written`, which gradePreview
// reads in place of the trace). The evidence holds no record id: the id of a fixture record becomes
// the name that the case gives it (`children[4]`, `walk`), the empty id of a row without a stored record becomes null
// (`no-record` inside a longer text; the change list reads both as no record), and each other id becomes `id-<n>`.
function heldPreviewsOf(previews, written, vars) {
  const names = new Map()
  for (const [name, value] of Object.entries(vars?.core?.records ?? {})) {
    for (const [index, id] of [value].flat().entries()) if (!names.has(id)) names.set(id, Array.isArray(value) ? `${name}[${index}]` : name)
  }
  let others = 0
  const nameOf = (id) => {
    if (!recordId(id)) return null
    if (!names.has(id)) names.set(id, `id-${++others}`)
    return names.get(id)
  }
  const named = (value) => {
    if (typeof value === 'string') {
      return guid.test(value) ? nameOf(value) : value.replace(recordIds, (id) => nameOf(id) ?? 'no-record')
    }
    if (Array.isArray(value)) return value.map(named)
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, named(child)])) : value
  }
  return { accountDate: vars?.accountDate ?? null, records: named(vars?.core?.records ?? {}), previews: named(previews), written }
}

// Private evidence of each attempt for the triage of a failure: the sanitized tool calls and answer of the last turn,
// the held change list, the held previews and the saved state verdict. The summary files hold case identifiers, counts,
// measurements, the failure reasons and the paths of this evidence, never the evidence itself.
export function writeResults(results, directory) {
  openPrivateEvidence(directory)
  const attempts = attemptsOf(results).map(({ entry, attempt }) => {
    const output = entry.response?.output ?? {}
    const evidence = attemptEvidence(entry, { ...attempt,
      heldChanges: changeList(output.previews, output.written ?? null).changes.map(({ kind, fields }) => ({ kind, fields })),
      heldPreviews: output.previews?.length ? heldPreviewsOf(output.previews, output.written ?? null, entry.testCase.vars) : null,
      resend: output.resend ?? null })
    writePrivateJson(`${directory}/${evidencePath(attempt.caseId, attempt.repeat)}`, evidence)
    return Object.fromEntries(Object.keys(attempt).map((key) => [key, evidence[key]]))
  })
  writePrivateJson(`${directory}/results.json`, attempts)
}

// pass^k of one case: fail when an attempt failed, pass when all k attempts passed, incomplete otherwise. The reasons
// of a behavior failure, of a grader limit and of an attempt without evidence stay apart.
export function caseOf(descriptor, attempts) {
  const withoutVerdict = (attempt) => attempt.unavailable === true || attempt.graderLimit === true
  const failed = (attempt) => !attempt.pass && !withoutVerdict(attempt)
  const complete = attempts.length === descriptor.k && attempts.every((attempt) => attempt.pass)
  const reasonsOf = (selected) => [...new Set(attempts.filter(selected).map((attempt) => attempt.reason).filter(Boolean))]
  const { id, situation, family, defectClass, locale, mustPass, k, maxQuestions } = descriptor
  return { id, situation, family, defectClass, locale, mustPass, k, attempts: attempts.length,
    passed: attempts.filter((attempt) => attempt.pass).length,
    unavailable: attempts.filter((attempt) => attempt.unavailable).length,
    graderLimits: attempts.filter((attempt) => attempt.graderLimit).length,
    passK: attempts.some(failed) ? 'fail' : complete ? 'pass' : 'incomplete', maxQuestions,
    questionsBeforePreview: attempts.map((attempt) => attempt.questionsBeforePreview),
    modelCalls: attempts.map((attempt) => attempt.modelCalls),
    seconds: attempts.map((attempt) => attempt.seconds),
    reasons: reasonsOf(failed), graderLimitReasons: reasonsOf((attempt) => attempt.graderLimit === true),
    unavailableReasons: reasonsOf((attempt) => attempt.unavailable === true) }
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

// The model calls of a case: those of its attempts, and those of the attempts that a later window or a rerun replaced.
export const callsOf = (entry) => [...entry.modelCalls, ...(entry.supersededModelCalls ?? [])]

// The measured figures of a set of cases: the pass^k rate, the questions that came before a preview against the count
// each case allows (with the attempts that asked past it), and the model calls.
export function totalsOf(cases) {
  const observed = cases.flatMap((entry) => entry.questionsBeforePreview.filter((count) => count !== null)
    .map((count) => ({ count, allowed: entry.maxQuestions })))
  const calls = cases.flatMap(callsOf)
  const passed = cases.filter((entry) => entry.passK === 'pass').length
  return { cases: cases.length, passed, passRate: cases.length ? rounded(passed / cases.length, 4) : null,
    attempts: cases.reduce((sum, entry) => sum + entry.attempts, 0),
    meanQuestionsBeforePreview: rounded(mean(observed.map(({ count }) => count)), 3),
    allowedMeanQuestions: rounded(mean(observed.map(({ allowed }) => allowed)), 3),
    attemptsOverQuestionLimit: observed.filter(({ count, allowed }) => count > allowed).length,
    modelCalls: calls.every((count) => count !== null) ? calls.reduce((sum, count) => sum + count, 0) : null }
}

// The summary of one promptfoo run of the core set (the must-pass run or the other run) in one UTC-day window. `k` is the
// k of the must-pass cases of the gate run that the window belongs to, also in the window of the other cases.
export function summarize(results, descriptors, { run, apiCommit, k = MUST_PASS_ATTEMPTS }) {
  const attempts = attemptsOf(results).map(({ attempt }) => attempt)
  const cases = descriptors.map((descriptor) => caseOf(descriptor, attempts.filter((attempt) => attempt.caseId === descriptor.id)))
  const unexpected = attempts.some((attempt) => !descriptors.some((descriptor) => descriptor.id === attempt.caseId))
  return { gate: 'core', run, k, apiCommit, corpusDigest: corpusDigestFor(k), utcDay: new Date().toISOString().slice(0, 10),
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
    `| Attempts that ask more often than their case allows | ${questions.attemptsOverLimit} (mean questions ${cell(questions.mean)}, allowed mean ${cell(questions.allowedMean)}) | 0 | ${questions.status} |`,
    `| Cost of one model call (USD) | ${cell(cost.perModelCallUsd)} | at or below ${cost.limitUsd} (D147) | ${cost.status} |`]
}

// The mark of a case that a later build measured. A rerun keeps its mark with each result. Without a rerun, only a pass
// or a fail is a first verdict: a case that stays incomplete (no evidence, or a grader limit) has no verdict there.
const laterBuildMark = (entry) => entry.rerun ? 'rerun' : entry.passK === 'incomplete' ? 'no verdict' : 'first verdict'

// The evidence of a failed case: the attempt files of the window that measured it. A window report lies beside its own
// `attempts/`; a merged case names the directory of its window relative to the merged report.
// A case of a merged report that a later build measured names that build, with its mark.
function caseRow(entry, firstApiCommit) {
  const directory = entry.evidenceDirectory ? `${entry.evidenceDirectory}/` : ''
  const evidence = entry.passK === 'fail' ? Array.from({ length: entry.attempts }, (_, index) =>
    `[r${index + 1}](${directory}${evidencePath(entry.id, index + 1)})`).join(', ') : ''
  const laterBuild = entry.apiCommit && entry.apiCommit !== firstApiCommit
    ? ` (${laterBuildMark(entry)} on ${entry.apiCommit.slice(0, 7)})` : ''
  return `| ${entry.id} | ${entry.family} | ${entry.defectClass} | ${entry.locale} | ${entry.mustPass ? 'yes' : 'no'} | ${entry.k} | ${entry.passed}/${entry.attempts} | ${entry.passK}${laterBuild} | ${listed(entry.questionsBeforePreview)} | ${entry.maxQuestions} | ${listed(entry.modelCalls)} | ${listed(entry.seconds)} | ${cell(entry.costUsd)} | ${evidence} |`
}

// The reasons of one kind, under their own heading, so a reader never takes a grader limit for a behavior failure.
function reasonLines(title, cases, field) {
  const lines = cases.flatMap((entry) => entry[field].map((reason) => `${entry.id}: ${reason.replace(/[\r\n|]/gu, ' ')}`))
  return lines.length ? ['', title, ...lines] : []
}

const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`

// One line for each later build of a merged report, with the count of each mark. Each other case was measured on the
// first build.
function laterBuildLines(summary) {
  return (summary.laterApiCommits ?? []).map((apiCommit) => {
    const marks = summary.cases.filter((entry) => entry.apiCommit === apiCommit).map(laterBuildMark)
    const marked = (mark) => marks.filter((candidate) => candidate === mark).length
    return `Later build, API commit: ${apiCommit} (${counted(marked('rerun'), 'rerun', 'reruns')} of a failed case or of a grader limit; ${counted(marked('first verdict'), 'first verdict', 'first verdicts')}; ${counted(marked('no verdict'), 'case', 'cases')} with no verdict and no rerun)`
  })
}

// The k of the must-pass cases, and the one condition under which a gate run holds k=1.
const kLines = (k) => k === EQUAL_MODEL_INPUT_ATTEMPTS
  ? ['A must-pass case runs at k=1 and passes only when its one attempt passes.',
    'k=1 holds only for a change whose model input equals the model input of main, and the pull request body of that change says why.']
  : [`A must-pass case passes only when each of its ${k} attempts passes.`]

export function writeReport(summary, directory) {
  mkdirSync(directory, { recursive: true })
  const markdown = [
    `Orbit AI core gate, ${summary.run} run, k=${summary.k}: ${summary.status}`,
    `API commit: ${summary.apiCommit}`,
    ...laterBuildLines(summary),
    `Corpus digest: ${summary.corpusDigest}`,
    ...(summary.utcDayWindows ? [`UTC-day windows: ${summary.utcDayWindows}`] : [`UTC day: ${summary.utcDay}`]),
    ...(summary.cost ? [`Measured run cost (USD): ${cell(summary.cost.runUsd)}`, `Model calls: ${cell(summary.cost.modelCalls)}`] : []),
    ...criteriaRows(summary.criteria),
    '',
    '| Case | Family | Class | Locale | Must-pass | k | Attempts passed | pass^k | Questions before preview | Allowed | Model calls | Seconds | Cost (USD) | Attempts |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...summary.cases.map((entry) => caseRow(entry, summary.apiCommit)),
    '',
    '| Family | Locale | Cases passing pass^k | pass^k rate | pass^k |',
    '|---|---|---|---|---|',
    ...summary.groups.map((entry) => `| ${entry.family} | ${entry.locale} | ${entry.passed}/${entry.cases} | ${entry.passRate} | ${entry.passK} |`),
    ...reasonLines('Behavior failures:', summary.cases, 'reasons'),
    ...reasonLines('Grader limits (the grader could not read the reply; no verdict on the assistant):', summary.cases, 'graderLimitReasons'),
    ...reasonLines(`No evidence (${noEvidenceKinds.slice(0, -1).join(', ')}, or ${noEvidenceKinds.at(-1)}):`, summary.cases, 'unavailableReasons'),
    '',
    ...kLines(summary.k),
    'No rerun on the same build replaces a failed attempt or a grader limit.',
    'The attempts of one case come from one build.',
    'Incomplete is not a pass. A held preview proves a proposal; the saved state readback proves the write.',
    'Seconds are the time that the person waits for the turns of one attempt.',
    'A turn that fails, a card turn that returns no trace, and a preview turn without the trace that shows a `stored` field add no counted model calls, so the cost of one model call reads a little high.',
  ].join('\n')
  writeFileSync(`${directory}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(`${directory}/summary.md`, `${markdown}\n`)
  return markdown
}
