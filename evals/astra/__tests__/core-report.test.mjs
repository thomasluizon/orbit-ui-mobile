import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { coreDescriptors, corpusDigest } from '../core/corpus.mjs'
import { COST_PER_MODEL_CALL_LIMIT_USD, mergeRunFiles, mergeRuns } from '../core/merge.mjs'
import { noEvidenceKinds, summarize, writeReport, writeResults } from '../core/report.mjs'
import { changeList } from '../core/change-list.mjs'

const descriptor = (id, overrides = {}) => ({ id, situation: id, family: 'owner-turns', defectClass: 'b', locale: 'en',
  mustPass: true, k: 3, maxQuestions: 1, ...overrides })
const required = descriptor('required')
const optional = descriptor('optional', { family: 'same-title', locale: 'pt-BR', mustPass: false, k: 1, maxQuestions: 0 })
const descriptors = [required, optional]
const meta = { run: 'must-pass', apiCommit: 'a'.repeat(40) }
const fixedBuild = 'b'.repeat(40)
const classify = 'The grader cannot classify a held preview: moveHabit.'
const scratch = []
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'core-report-')); scratch.push(path); return path }

// One promptfoo result of the core provider: a graded attempt, an attempt that the grader could not read, or an attempt
// without evidence.
// An attempt that asks more often than its case allows ends before any preview, as runCase stops it.
function result(target, { pass = true, questions = 0, modelCalls = 2, unavailable = false, graderLimit = false, seconds = 3.2 } = {}) {
  const previews = questions > target.maxQuestions ? [] : [{ id: 'preview', actionKey: 'deleteHabits', items: [] }]
  const output = unavailable ? { unavailable: true, error: 'The chat turn failed with HTTP 429 (AI_DAILY_BUDGET_EXCEEDED): budget' }
    : { turns: questions + 1, questionsBeforePreview: questions, previews, modelCalls, seconds,
      ...(graderLimit ? { graderLimit: true } : {}) }
  const passed = pass && !graderLimit
  return { testCase: { metadata: target, vars: { clientContext: { supportsParts: true } } }, success: passed && !unavailable,
    response: { output, ...(unavailable ? { error: output.error } : {}) },
    ...(unavailable ? { error: output.error } : { gradingResult: { componentResults: [{ pass: passed, assertion: { metric: 'outcome' },
      reason: passed ? 'The saved state matches the approved changes.' : graderLimit ? classify : 'The preview holds a change outside the request.' }] } }) }
}
const attempts = (target, count, options) => Array.from({ length: count }, () => result(target, options))
const run = (results, selected = descriptors, name = 'must-pass', apiCommit = meta.apiCommit) => summarize(results, selected, { run: name, apiCommit })

describe('pass^k of one run', () => {
  it('passes a must-pass case only when each of its 3 attempts passes', () => {
    const summary = run([...attempts(required, 3, { questions: 1 }), result(optional)])
    expect(summary).toMatchObject({ gate: 'core', status: 'pass', corpusDigest, apiCommit: meta.apiCommit })
    expect(summary.cases).toMatchObject([
      { id: 'required', mustPass: true, k: 3, attempts: 3, passed: 3, passK: 'pass', questionsBeforePreview: [1, 1, 1], modelCalls: [2, 2, 2], seconds: [3.2, 3.2, 3.2] },
      { id: 'optional', mustPass: false, k: 1, attempts: 1, passed: 1, passK: 'pass', questionsBeforePreview: [0], modelCalls: [2], seconds: [3.2] },
    ])
  })

  it('fails a must-pass case when one of its 3 attempts fails', () => {
    const summary = run([...attempts(required, 2), result(required, { pass: false })], [required])
    expect(summary.status).toBe('fail')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: 2, passK: 'fail', reasons: ['The preview holds a change outside the request.'] })
  })

  it.each([2, 0])('keeps a must-pass case with %i attempts incomplete', (count) => {
    expect(run([...attempts(required, count), result(optional)]).cases[0]).toMatchObject({ attempts: count, passK: 'incomplete' })
  })

  it('keeps an attempt without evidence incomplete, never a pass and never a fail', () => {
    const summary = run([...attempts(required, 2), result(required, { unavailable: true }), result(optional)])
    expect(summary.status).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: 2, unavailable: 1, passK: 'incomplete', modelCalls: [2, 2, 0], reasons: [],
      unavailableReasons: ['The chat turn failed with HTTP 429 (AI_DAILY_BUDGET_EXCEEDED): budget'] })
  })

  it('keeps an attempt that the grader could not read incomplete, apart from a behavior failure', () => {
    const summary = run([...attempts(required, 2), result(required, { graderLimit: true })], [required])
    expect(summary.status).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: 2, graderLimits: 1, passK: 'incomplete', reasons: [], graderLimitReasons: [classify] })
  })

  it('fails a case that holds a behavior failure beside a grader limit', () => {
    const summary = run([result(required), result(required, { graderLimit: true }), result(required, { pass: false })], [required])
    expect(summary.cases[0]).toMatchObject({ graderLimits: 1, passK: 'fail', reasons: ['The preview holds a change outside the request.'],
      graderLimitReasons: [classify] })
  })

  it('reports pass^k for each family and locale, and the questions against the allowed count', () => {
    const summary = run([...attempts(required, 3, { questions: 1 }), result(optional, { pass: false })])
    expect(summary.groups).toEqual([
      { family: 'owner-turns', locale: 'en', cases: 1, passed: 1, passRate: 1, passK: 'pass' },
      { family: 'same-title', locale: 'pt-BR', cases: 1, passed: 0, passRate: 0, passK: 'fail' },
    ])
    expect(summary.totals).toMatchObject({ cases: 2, passed: 1, passRate: 0.5, attempts: 4,
      meanQuestionsBeforePreview: 0.75, allowedMeanQuestions: 0.75, modelCalls: 8 })
  })
})

describe('the gate report of the two runs', () => {
  const requiredRun = (results, apiCommit) => run(results, [required], 'must-pass', apiCommit)
  const otherRun = (results, apiCommit) => run(results, [optional], 'other', apiCommit)
  const merged = (windows, options) => mergeRuns(windows, { descriptors, asBaseline: true, ...options })
  const passing = () => [requiredRun(attempts(required, 3)), otherRun([result(optional)])]

  it('joins the must-pass run and the other run, and keeps k for each case', () => {
    const summary = merged(passing(), { runCostUsd: 0.006 })
    expect(summary).toMatchObject({ run: 'merged', status: 'pass', utcDayWindows: 1, corpusDigest })
    expect(summary.cases.map(({ id, k, passK, sourceWindow }) => ({ id, k, passK, sourceWindow }))).toEqual([
      { id: 'required', k: 3, passK: 'pass', sourceWindow: 1 }, { id: 'optional', k: 1, passK: 'pass', sourceWindow: 2 }])
    expect(summary.criteria.mustPass).toEqual({ cases: 1, passed: 1, status: 'pass' })
  })

  it('gives each case its share of the measured run cost by its measured model calls', () => {
    const summary = merged(passing(), { runCostUsd: 0.006 })
    expect(summary.cost).toEqual({ runUsd: 0.006, modelCalls: 8, perModelCallUsd: 0.00075, limitUsd: COST_PER_MODEL_CALL_LIMIT_USD, status: 'pass' })
    expect(summary.cases.map(({ costUsd }) => costUsd)).toEqual([0.0045, 0.0015])
  })

  it('fails the gate when one model call costs more than the D147 limit', () => {
    const summary = merged(passing(), { runCostUsd: 0.0116 })
    expect(summary.cost).toMatchObject({ perModelCallUsd: 0.00145, status: 'fail' })
    expect(summary.status).toBe('fail')
  })

  it('stays incomplete until the measured run cost is supplied', () => {
    const summary = merged(passing())
    expect(summary.cost).toMatchObject({ runUsd: null, perModelCallUsd: null, status: 'incomplete' })
    expect(summary.status).toBe('incomplete')
  })

  it('fails the gate when a must-pass case fails, and when one attempt asks more often than its case allows', () => {
    const failed = merged([requiredRun([...attempts(required, 2), result(required, { pass: false })]), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(failed).toMatchObject({ status: 'fail', criteria: { mustPass: { passed: 0, status: 'fail' } } })
    const within = merged([requiredRun(attempts(required, 3, { questions: 1 })), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(within.criteria.questions).toEqual({ mean: 0.75, allowedMean: 0.75, attemptsOverLimit: 0, status: 'pass' })
    // The mean of the counts stays under the allowed mean, and the attempt past its own limit still fails the criterion.
    const over = merged([requiredRun(attempts(required, 3)), otherRun([result(optional, { questions: 1, pass: false })])], { runCostUsd: 0.006 })
    expect(over.cases[1]).toMatchObject({ questionsBeforePreview: [1], maxQuestions: 0 })
    expect(over.criteria.questions).toEqual({ mean: 0.25, allowedMean: 0.75, attemptsOverLimit: 1, status: 'fail' })
    expect(over.status).toBe('fail')
  })

  it('keeps the gate incomplete while the grader cannot read an attempt', () => {
    const summary = merged([requiredRun([...attempts(required, 2), result(required, { graderLimit: true })]), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(summary).toMatchObject({ status: 'incomplete', criteria: { mustPass: { passed: 0, status: 'incomplete' } } })
    expect(summary.cases[0]).toMatchObject({ passK: 'incomplete', graderLimits: 1, graderLimitReasons: [classify] })
  })

  it('never lets a later window of the same build replace a case that holds a grader limit', () => {
    const limited = requiredRun([result(required), result(required, { graderLimit: true }), result(required, { unavailable: true })])
    expect(() => merged([limited, requiredRun(attempts(required, 3))]))
      .toThrow('Case required holds a grader limit, which is final on its build; no rerun on the same build replaces it.')
  })

  it('continues an incomplete case in a later window, and counts the UTC-day windows', () => {
    const stopped = requiredRun([...attempts(required, 2), result(required, { unavailable: true })])
    const continued = { ...requiredRun(attempts(required, 3)), utcDay: '2099-01-02' }
    const summary = merged([stopped, continued, otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(summary).toMatchObject({ status: 'pass', utcDayWindows: 2 })
    expect(summary.cases[0]).toMatchObject({ passK: 'pass', attempts: 3, sourceWindow: 2, modelCalls: [2, 2, 2], supersededModelCalls: [2, 2, 0] })
  })

  it('keeps the model calls of a replaced window, and counts them once in the totals and the cost', () => {
    const stopped = requiredRun([...attempts(required, 2), result(required, { unavailable: true })])
    const summary = merged([stopped, requiredRun(attempts(required, 3)), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(summary.cost).toMatchObject({ modelCalls: 12, perModelCallUsd: 0.0005 })
    expect(summary.totals.modelCalls).toBe(summary.cost.modelCalls)
    expect(summary.cases.map(({ costUsd }) => costUsd)).toEqual([0.005, 0.001])
  })

  it.each(['fail', 'pass'])('never lets a later window of the same build replace a case with the verdict %s', (verdict) => {
    const first = requiredRun(verdict === 'pass' ? attempts(required, 3) : [...attempts(required, 2), result(required, { pass: false })])
    expect(() => merged([first, requiredRun(attempts(required, 3))])).toThrow(`Case required already has the verdict ${verdict}; no rerun on the same build replaces it.`)
  })

  it('rejects a window of another corpus, of another build, or with a wrong k', () => {
    const window = requiredRun(attempts(required, 3))
    expect(() => merged([{ ...window, corpusDigest: 'other' }])).toThrow(/another corpus/u)
    expect(() => merged([window, otherRun([result(optional)], fixedBuild)])).toThrow(/another API commit/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], k: 1 }] }])).toThrow(/k policy/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], attempts: 2, passed: 2 }] }])).toThrow(/claims a pass/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], passed: 4 }] }])).toThrow(/invalid attempt counts/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], graderLimits: 4 }] }])).toThrow(/invalid attempt counts/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], graderLimits: undefined }] }])).toThrow(/invalid attempt counts/u)
  })

  // Producer: the runner records the commit of the API health check, held to 40 lowercase hexadecimal characters.
  const withCommit = (window, apiCommit) => {
    const { apiCommit: _recorded, ...rest } = window
    return apiCommit === 'missing' ? rest : { ...rest, apiCommit }
  }
  const noCommit = (input) => `Input ${input} names no API commit of 40 lowercase hexadecimal characters.`
  it.each([['missing', 'missing'], ['null', null], ['a number', 12345], ['a short commit', 'a'.repeat(7)]])('refuses an ordinary window whose API commit is %s', (_label, apiCommit) => {
    const [mustPassWindow, otherWindow] = passing()
    expect(() => merged([withCommit(mustPassWindow, apiCommit), withCommit(otherWindow, apiCommit)])).toThrow(noCommit(1))
    expect(() => merged([mustPassWindow, withCommit(otherWindow, apiCommit)])).toThrow(noCommit(2))
  })
  it.each([['missing', 'missing'], ['null', null], ['a number', 12345], ['a short commit', 'b'.repeat(7)]])('refuses a --rerun window whose API commit is %s', (_label, apiCommit) => {
    const failed = [requiredRun([...attempts(required, 2), result(required, { pass: false })]), otherRun([result(optional)])]
    expect(() => merged(failed, { reruns: [withCommit(requiredRun(attempts(required, 3), fixedBuild), apiCommit)] })).toThrow(noCommit(3))
  })

  // Producer: each window directory holds `results.json`, an array of attempts, beside its `summary.json`.
  it('refuses the results.json of a window as an ordinary window and as a --rerun window, before it reads an API commit', () => {
    const target = directory()
    writeResults(attempts(required, 3), target)
    const resultsPath = join(target, 'results.json')
    const results = JSON.parse(readFileSync(resultsPath, 'utf8'))
    expect(Array.isArray(results)).toBe(true)
    const notSummary = (input) => `Input ${input} is not a core set run summary.`
    const [mustPassWindow, otherWindow] = passing()
    expect(() => merged([mustPassWindow, results])).toThrow(notSummary(2))
    expect(() => merged([mustPassWindow, otherWindow], { reruns: [results] })).toThrow(notSummary(3))
    const summaryPath = join(target, 'window.json')
    writeFileSync(summaryPath, JSON.stringify(mustPassWindow))
    expect(() => mergeRunFiles([summaryPath, resultsPath, '--as-baseline'])).toThrow(notSummary(2))
    expect(() => mergeRunFiles([summaryPath, '--as-baseline', '--rerun', resultsPath])).toThrow(notSummary(2))
  })

  // Producer: the merged report (`run: 'merged'`) lives in `reports/core/` beside the window directories
  // `reports/core-must-pass/` and `reports/core-other/`, so a glob over the summaries also gives it to the merge.
  it('refuses a merged report as an ordinary window and as a --rerun window', () => {
    const report = merged(passing(), { runCostUsd: 0.006 })
    expect(report).toMatchObject({ gate: 'core', run: 'merged' })
    expect(Array.isArray(report.cases)).toBe(true)
    const notSummary = (input) => `Input ${input} is not a core set run summary.`
    const [mustPassWindow, otherWindow] = passing()
    expect(() => merged([mustPassWindow, report])).toThrow(notSummary(2))
    expect(() => merged([mustPassWindow, otherWindow], { reruns: [report] })).toThrow(notSummary(3))
    const target = directory()
    const windowPath = join(target, 'window.json')
    const reportPath = join(target, 'summary.json')
    writeFileSync(windowPath, JSON.stringify(mustPassWindow))
    writeFileSync(reportPath, JSON.stringify(report))
    expect(() => mergeRunFiles([windowPath, reportPath, '--as-baseline'])).toThrow(notSummary(2))
  })

  it('reports a case that no window holds as incomplete', () => {
    expect(merged([requiredRun(attempts(required, 3))], { runCostUsd: 0.0045 })).toMatchObject({ status: 'incomplete',
      cases: [{ id: 'required', passK: 'pass' }, { id: 'optional', attempts: 0, passK: 'incomplete' }] })
  })
})

describe('the baseline of the pass^k rate', () => {
  const requiredRun = (results) => run(results, [required], 'must-pass')
  const otherRun = (results) => run(results, [optional], 'other')
  const half = () => [requiredRun(attempts(required, 3)), otherRun([result(optional, { pass: false })])]
  const baselineOf = (windows) => mergeRuns(windows, { descriptors, asBaseline: true, runCostUsd: 0.006 })
  const against = (windows, baseline) => mergeRuns(windows, { descriptors, baseline, runCostUsd: 0.006 })

  it('compares the pass^k rate with the complete baseline report', () => {
    const baseline = baselineOf(half())
    expect(baseline.criteria.passRate).toEqual({ rate: 0.5, baselineRate: null, status: 'baseline' })
    expect(against(half(), baseline).criteria.passRate).toEqual({ rate: 0.5, baselineRate: 0.5, status: 'pass' })
    const better = baselineOf([requiredRun(attempts(required, 3)), otherRun([result(optional)])])
    expect(against(half(), better)).toMatchObject({ status: 'fail', criteria: { passRate: { baselineRate: 1, status: 'fail' } } })
  })

  it('refuses a run that names no baseline and is not declared the baseline of main', () => {
    expect(() => mergeRuns(half(), { descriptors, runCostUsd: 0.006 }))
      .toThrow('Supply the baseline report with --baseline, or declare the baseline run of main with --as-baseline.')
    expect(() => mergeRuns(half(), { descriptors, asBaseline: true, baseline: baselineOf(half()) })).toThrow('A baseline run takes no --baseline.')
  })

  it('refuses a baseline that is one run window, not a merged report', () => {
    expect(() => against(half(), requiredRun(attempts(required, 3)))).toThrow('The baseline is not a merged report of the core set.')
  })

  it('refuses a baseline that holds a case without a verdict', () => {
    const partial = baselineOf([requiredRun(attempts(required, 3))])
    expect(partial.cases[1].passK).toBe('incomplete')
    expect(() => against(half(), partial)).toThrow('The baseline holds a case without a verdict: optional.')
  })

  it('refuses a baseline that lacks a case, or that measured another corpus', () => {
    const baseline = baselineOf(half())
    expect(() => against(half(), { ...baseline, cases: baseline.cases.slice(0, 1) })).toThrow('The baseline does not hold exactly the cases of the core set.')
    expect(() => against(half(), { ...baseline, corpusDigest: 'other' })).toThrow('The baseline measured another corpus than this core set.')
  })

  it('reads the baseline rate from the baseline cases, never from a stated total', () => {
    const baseline = baselineOf(half())
    const stated = { ...baseline, totals: { ...baseline.totals, passRate: 0 } }
    expect(against(half(), stated).criteria.passRate.baselineRate).toBe(0.5)
  })
})

describe('the rerun of the failed cases after a fix', () => {
  const failedFirst = () => [run([...attempts(required, 2), result(required, { pass: false })], [required], 'must-pass'), run([result(optional)], [optional], 'other')]
  const fixed = (results = attempts(required, 3)) => run(results, [required], 'must-pass', fixedBuild)
  const merged = (windows, reruns, options) => mergeRuns(windows, { descriptors, asBaseline: true, runCostUsd: 0.0105, reruns, ...options })

  it('takes the rerun of a failed case from the fixed build, and names both builds', () => {
    const summary = merged(failedFirst(), [fixed()])
    expect(summary).toMatchObject({ status: 'pass', apiCommit: meta.apiCommit, laterApiCommits: [fixedBuild], utcDayWindows: 1 })
    expect(summary.cases).toMatchObject([
      { id: 'required', passK: 'pass', rerun: true, apiCommit: fixedBuild, supersededModelCalls: [2, 2, 2] },
      { id: 'optional', passK: 'pass', apiCommit: meta.apiCommit }])
    expect(summary.cases[1].rerun).toBeUndefined()
    expect(summary.criteria.mustPass).toEqual({ cases: 1, passed: 1, status: 'pass' })
  })

  it('shares the measured cost over the model calls of both builds', () => {
    const summary = merged(failedFirst(), [fixed()])
    expect(summary.cost).toMatchObject({ runUsd: 0.0105, modelCalls: 14, perModelCallUsd: 0.00075, status: 'pass' })
    expect(summary.totals.modelCalls).toBe(14)
    expect(summary.cases.map(({ costUsd }) => costUsd)).toEqual([0.009, 0.0015])
  })

  it('takes the rerun of a case with a grader limit from the fixed build', () => {
    const limited = [run([result(required), result(required, { graderLimit: true }), result(required)], [required], 'must-pass'),
      run([result(optional)], [optional], 'other')]
    const summary = merged(limited, [fixed()])
    expect(summary).toMatchObject({ status: 'pass', laterApiCommits: [fixedBuild] })
    expect(summary.cases[0]).toMatchObject({ id: 'required', passK: 'pass', rerun: true, graderLimits: 0, supersededModelCalls: [2, 2, 2] })
  })

  it('keeps the failure when the rerun fails again', () => {
    const summary = merged(failedFirst(), [fixed([...attempts(required, 2), result(required, { pass: false })])])
    expect(summary).toMatchObject({ status: 'fail', cases: [{ id: 'required', passK: 'fail', rerun: true }, { id: 'optional' }] })
  })

  it('never lets a rerun on the same build replace a failure', () => {
    expect(() => merged(failedFirst(), [run(attempts(required, 3), [required], 'must-pass')]))
      .toThrow('A rerun on the same build never replaces a failure; the rerun runs on the fixed build.')
  })

  it('refuses a later build for a case that passed, and a second result on the fixed build', () => {
    expect(() => merged(failedFirst(), [run([result(optional)], [optional], 'other', fixedBuild)]))
      .toThrow('Case optional passed on an earlier build; a later build measures only a case without a pass.')
    expect(() => merged(failedFirst(), [fixed([...attempts(required, 2), result(required, { pass: false })]), fixed()]))
      .toThrow('Case required already has the verdict fail; no rerun on the same build replaces it.')
    expect(() => merged(failedFirst(), [fixed(), run(attempts(required, 3), [required], 'must-pass', 'c'.repeat(40))]))
      .toThrow('Case required passed on an earlier build; a later build measures only a case without a pass.')
  })
})

describe('a case without a verdict on an earlier build', () => {
  const thirdBuild = 'c'.repeat(40)
  const stopped = (apiCommit) => run([...attempts(required, 2), result(required, { unavailable: true })], [required], 'must-pass', apiCommit)
  const requiredOn = (apiCommit, results = attempts(required, 3)) => run(results, [required], 'must-pass', apiCommit)
  const optionalOn = (apiCommit, options) => run([result(optional, options)], [optional], 'other', apiCommit)
  const merged = (windows, reruns) => mergeRuns(windows, { descriptors, asBaseline: true, runCostUsd: 0.006, reruns })
  const reported = (summary) => {
    const target = mkdtempSync(join(tmpdir(), 'core-report-'))
    scratch.push(target)
    return writeReport(summary, target)
  }
  const laterBuildLine = (reruns, firstVerdicts, withoutVerdict) => `Later build, API commit: ${fixedBuild} (${reruns} of a failed case or of a grader limit; ${firstVerdicts}; ${withoutVerdict} with no verdict and no rerun)`

  // Day 1 on the first build: one case fails and the spend ceiling stops the other case after 2 attempts. Day 2: staging
  // serves the fix.
  const cutShort = () => [stopped(meta.apiCommit), optionalOn(meta.apiCommit, { pass: false })]

  it('refuses a window of the later build among the windows of the first build, and names --rerun', () => {
    expect(() => merged([...cutShort(), requiredOn(fixedBuild)]))
      .toThrow('Input 3 measured another API commit (bbbbbbb) than input 1 (aaaaaaa); the summaries do not tell which build is later, so give the windows in build order: the windows of the first build without --rerun, then the windows of each later build with --rerun, in the order of the builds.')
  })

  it('measures the case on the later build, beside the rerun of the failed case', () => {
    const summary = merged(cutShort(), [requiredOn(fixedBuild), optionalOn(fixedBuild)])
    expect(summary).toMatchObject({ status: 'pass', apiCommit: meta.apiCommit, laterApiCommits: [fixedBuild] })
    expect(summary.cases).toMatchObject([
      { id: 'required', passK: 'pass', attempts: 3, passed: 3, apiCommit: fixedBuild, supersededModelCalls: [2, 2, 0] },
      { id: 'optional', passK: 'pass', rerun: true, apiCommit: fixedBuild, supersededModelCalls: [2] }])
    expect(summary.cases[0].rerun).toBeUndefined()
    expect(summary.criteria.mustPass).toEqual({ cases: 1, passed: 1, status: 'pass' })
  })

  it('measures on the later build a case that no window of the first build ran', () => {
    const summary = merged([optionalOn(meta.apiCommit)], [requiredOn(fixedBuild)])
    expect(summary).toMatchObject({ status: 'pass', cases: [{ id: 'required', passK: 'pass', apiCommit: fixedBuild },
      { id: 'optional', passK: 'pass', apiCommit: meta.apiCommit }] })
    expect(summary.cases[0].rerun).toBeUndefined()
    expect(summary.cases[0].supersededModelCalls).toBeUndefined()
  })

  it('never joins the attempts of two builds into one verdict', () => {
    const summary = merged([stopped(meta.apiCommit), optionalOn(meta.apiCommit)], [stopped(fixedBuild)])
    expect(summary.status).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ passK: 'incomplete', attempts: 3, passed: 2, apiCommit: fixedBuild, supersededModelCalls: [2, 2, 0] })
  })

  it('gives its one rerun to a case that fails on the build that first measured it', () => {
    const failedLater = requiredOn(fixedBuild, [...attempts(required, 2), result(required, { pass: false })])
    const first = merged([stopped(meta.apiCommit), optionalOn(meta.apiCommit)], [failedLater])
    expect(first).toMatchObject({ status: 'fail', cases: [{ id: 'required', passK: 'fail', apiCommit: fixedBuild }, { id: 'optional' }] })
    expect(first.cases[0].rerun).toBeUndefined()
    const summary = merged([stopped(meta.apiCommit), optionalOn(meta.apiCommit)], [failedLater, requiredOn(thirdBuild)])
    expect(summary).toMatchObject({ status: 'pass', laterApiCommits: [fixedBuild, thirdBuild],
      cases: [{ id: 'required', passK: 'pass', rerun: true, apiCommit: thirdBuild, supersededModelCalls: [2, 2, 2, 2, 2, 0] }, { id: 'optional' }] })
  })

  it('continues on a third build a case that the second build left without a verdict, and a rerun that it left open', () => {
    const summary = merged(cutShort(), [stopped(fixedBuild), optionalOn(fixedBuild, { unavailable: true }), requiredOn(thirdBuild), optionalOn(thirdBuild)])
    expect(summary).toMatchObject({ status: 'pass', laterApiCommits: [fixedBuild, thirdBuild] })
    expect(summary.cases).toMatchObject([{ id: 'required', passK: 'pass', apiCommit: thirdBuild, supersededModelCalls: [2, 2, 0, 2, 2, 0] },
      { id: 'optional', passK: 'pass', rerun: true, apiCommit: thirdBuild, supersededModelCalls: [0, 2] }])
    expect(summary.cases[0].rerun).toBeUndefined()
  })

  it('refuses a second rerun of a case, a case that passed on an earlier build, and a return to an earlier build', () => {
    const failed = [...attempts(required, 2), result(required, { pass: false })]
    expect(() => merged([requiredOn(meta.apiCommit, failed), optionalOn(meta.apiCommit)], [requiredOn(fixedBuild, failed), requiredOn(thirdBuild)]))
      .toThrow('Case required already had its rerun; a case has one rerun.')
    expect(() => merged(cutShort(), [requiredOn(fixedBuild), requiredOn(thirdBuild)]))
      .toThrow('Case required passed on an earlier build; a later build measures only a case without a pass.')
    expect(() => merged(cutShort(), [stopped(fixedBuild), optionalOn(thirdBuild), requiredOn(fixedBuild)]))
      .toThrow('Input 5 returns to the API commit of an earlier build; give the windows of one build together, in the order of the builds.')
  })

  it('names each later build in the report, and marks each case that it measured', () => {
    const markdown = reported(merged(cutShort(), [requiredOn(fixedBuild), optionalOn(fixedBuild)]))
    expect(markdown).toContain(laterBuildLine('1 rerun', '1 first verdict', '0 cases'))
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 3/3 | pass (first verdict on bbbbbbb) |')
    expect(markdown).toContain('| optional | same-title | b | pt-BR | no | 1 | 1/1 | pass (rerun on bbbbbbb) |')
    expect(markdown).toContain('The attempts of one case come from one build.')
  })

  it('marks a fail without a rerun as a first verdict, and a rerun without evidence as a rerun', () => {
    const failedLater = requiredOn(fixedBuild, [...attempts(required, 2), result(required, { pass: false })])
    const markdown = reported(merged(cutShort(), [failedLater, optionalOn(fixedBuild, { unavailable: true })]))
    expect(markdown).toContain(laterBuildLine('1 rerun', '1 first verdict', '0 cases'))
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 2/3 | fail (first verdict on bbbbbbb) |')
    expect(markdown).toContain('| optional | same-title | b | pt-BR | no | 1 | 0/1 | incomplete (rerun on bbbbbbb) |')
  })

  // A later build can leave a case incomplete: its attempts gave no evidence again, or the grader could not read a
  // reply. The merge holds no verdict for that case, so the report must not name one.
  it.each([
    ['gave no evidence', (apiCommit) => stopped(apiCommit)],
    ['holds a grader limit', (apiCommit) => requiredOn(apiCommit, [...attempts(required, 2), result(required, { graderLimit: true })])],
  ])('never reports a first verdict for a case that %s on the later build', (_, laterWindow) => {
    const summary = merged([stopped(meta.apiCommit), optionalOn(meta.apiCommit)], [laterWindow(fixedBuild)])
    expect(summary.cases[0]).toMatchObject({ passK: 'incomplete', apiCommit: fixedBuild })
    expect(summary.cases[0].rerun).toBeUndefined()
    const markdown = reported(summary)
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 2/3 | incomplete (no verdict on bbbbbbb) |')
    expect(markdown).toContain(laterBuildLine('0 reruns', '0 first verdicts', '1 case'))
    expect(markdown).not.toContain('first verdict on')
  })

  // Producer: the marks of a real merged report. The skill and TESTING.md name each mark as the report prints it.
  it('names each mark of a later build in the skill and in TESTING.md', () => {
    const markdown = [merged(cutShort(), [requiredOn(fixedBuild), optionalOn(fixedBuild)]),
      merged([stopped(meta.apiCommit), optionalOn(meta.apiCommit)], [stopped(fixedBuild)])].map(reported).join('\n')
    const marks = [...new Set([...markdown.matchAll(/\(([a-z ]+) on bbbbbbb\)/gu)].map(([, mark]) => mark))]
    expect(marks.sort()).toEqual(['first verdict', 'no verdict', 'rerun'])
    for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
      const text = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
      for (const mark of marks) expect(text, `${path}: ${mark}`).toContain(`\`${mark} on <commit>\``)
    }
  })
})

// The operator declares each window of a later build with `--rerun`, at any position on the command line. Without that
// declaration the first summary would name the first build, and a later build given first would change the verdicts
// with no refusal. Each line below gets the correct verdict or a refusal that names the API commit of both inputs and
// the build order of the windows. The summaries hold no time finer than the UTC day, so the refusal does not guess
// which build is later.
describe('the declaration of a later build on the command line', () => {
  const mustPass = coreDescriptors().find((entry) => entry.mustPass)
  const other = coreDescriptors().find((entry) => !entry.mustPass)
  const refusal = (input, apiCommit, firstApiCommit, firstInput = 1) => `Input ${input} measured another API commit (${apiCommit.slice(0, 7)}) than input ${firstInput} (${firstApiCommit.slice(0, 7)}); the summaries do not tell which build is later, so give the windows in build order: the windows of the first build without --rerun, then the windows of each later build with --rerun, in the order of the builds.`
  const files = (...windows) => {
    const target = directory()
    return windows.map((summary, index) => {
      const path = join(target, `window-${index}.json`)
      writeFileSync(path, JSON.stringify(summary))
      return path
    })
  }
  const mustPassOn = (apiCommit, last) => run([...attempts(mustPass, 2), result(mustPass, last)], [mustPass], 'must-pass', apiCommit)
  const otherOn = (apiCommit, options) => run([result(other, options)], [other], 'other', apiCommit)
  // The result of one command line: the refusal, or the builds and the verdict of each of the two measured cases.
  const outcome = (argumentsList) => {
    try {
      const summary = mergeRunFiles([...argumentsList, '--as-baseline'])
      return { status: summary.status, firstBuild: summary.apiCommit, laterBuilds: summary.laterApiCommits ?? [],
        cases: [mustPass, other].map(({ id }) => summary.cases.find((entry) => entry.id === id))
          .map(({ passK, apiCommit, rerun = false }) => ({ passK, apiCommit, rerun })) }
    } catch (error) { return error.message }
  }
  // The operator follows the refusal: the operator knows the order of the builds, so gives the windows of the first
  // build without `--rerun`, then the windows of each later build with `--rerun`, in the order of the builds.
  const followed = (argumentsList, builds) => {
    const refused = outcome(argumentsList)
    const named = /^Input \d+ measured another API commit \(([0-9a-f]{7})\) than input 1 \(([0-9a-f]{7})\); the summaries do not tell which build is later, so give the windows in build order: the windows of the first build without --rerun, then the windows of each later build with --rerun, in the order of the builds\.$/u.exec(refused)
    expect(named, refused).not.toBeNull()
    for (const apiCommit of named.slice(1)) expect(builds.map((build) => build.slice(0, 7))).toContain(apiCommit)
    const ofBuild = (build) => argumentsList.filter((path) => JSON.parse(readFileSync(path, 'utf8')).apiCommit === build)
    return outcome([...ofBuild(builds[0]), ...builds.slice(1).flatMap((build) => ofBuild(build).flatMap((path) => ['--rerun', path]))])
  }
  const twoBuilds = [meta.apiCommit, fixedBuild]

  // First build: the spend ceiling stops the must-pass case without evidence. Later build: the case fails.
  describe('a must-pass case with its first verdict, a fail, on the later build', () => {
    const windows = () => files(mustPassOn(fixedBuild, { pass: false }), mustPassOn(meta.apiCommit, { unavailable: true }), otherOn(meta.apiCommit))
    const firstVerdict = { status: 'fail', firstBuild: meta.apiCommit, laterBuilds: [fixedBuild],
      cases: [{ passK: 'fail', apiCommit: fixedBuild, rerun: false }, { passK: 'pass', apiCommit: meta.apiCommit, rerun: false }] }

    it('keeps the fail when the later build stands first or last with --rerun', () => {
      const [later, firstMustPass, firstOther] = windows()
      expect(outcome(['--rerun', later, firstMustPass, firstOther])).toEqual(firstVerdict)
      expect(outcome([firstMustPass, firstOther, '--rerun', later])).toEqual(firstVerdict)
    })

    it('refuses the same summaries without --rerun, and never reports the case as incomplete', () => {
      const [later, firstMustPass, firstOther] = windows()
      expect(outcome([later, firstMustPass, firstOther])).toBe(refusal(2, meta.apiCommit, fixedBuild))
      expect(outcome([firstMustPass, firstOther, later])).toBe(refusal(3, fixedBuild, meta.apiCommit))
    })

    it('keeps the fail when the operator follows the refusal and flags the windows of the later build it names', () => {
      const [later, firstMustPass, firstOther] = windows()
      expect(followed([later, firstMustPass, firstOther], twoBuilds)).toEqual(firstVerdict)
      expect(followed([firstMustPass, firstOther, later], twoBuilds)).toEqual(firstVerdict)
    })
  })

  // First build: both cases pass. A later build fails both. A case that passed keeps its build, so no line merges.
  describe('a later build that fails the cases which passed on the first build', () => {
    const windows = () => files(mustPassOn(fixedBuild, { pass: false }), otherOn(fixedBuild, { pass: false }), mustPassOn(meta.apiCommit), otherOn(meta.apiCommit))
    const passedEarlier = `Case ${mustPass.id} passed on an earlier build; a later build measures only a case without a pass.`

    it('refuses the later build when it stands first or last with --rerun', () => {
      const [laterMustPass, laterOther, firstMustPass, firstOther] = windows()
      expect(outcome(['--rerun', laterMustPass, '--rerun', laterOther, firstMustPass, firstOther])).toBe(passedEarlier)
      expect(outcome([firstMustPass, firstOther, '--rerun', laterMustPass, '--rerun', laterOther])).toBe(passedEarlier)
    })

    it('refuses the same summaries without --rerun, and never reports the failed cases as passed', () => {
      const [laterMustPass, laterOther, firstMustPass, firstOther] = windows()
      expect(outcome([laterMustPass, laterOther, firstMustPass, firstOther])).toBe(refusal(3, meta.apiCommit, fixedBuild))
      expect(outcome([firstMustPass, firstOther, laterMustPass, laterOther])).toBe(refusal(3, fixedBuild, meta.apiCommit))
    })

    it('refuses the later build when the operator follows the refusal and flags the windows of the later build it names', () => {
      const [laterMustPass, laterOther, firstMustPass, firstOther] = windows()
      expect(followed([laterMustPass, laterOther, firstMustPass, firstOther], twoBuilds)).toBe(passedEarlier)
      expect(followed([firstMustPass, firstOther, laterMustPass, laterOther], twoBuilds)).toBe(passedEarlier)
    })
  })

  // Three builds A, B, C, in that order: the spend ceiling stops the must-pass case on A, the case passes on B, and
  // fails on C. A case that passed keeps its build, so the later build C is refused.
  describe('three builds given in the reverse order', () => {
    const thirdBuild = 'c'.repeat(40)
    const passedEarlier = `Case ${mustPass.id} passed on an earlier build; a later build measures only a case without a pass.`

    it('refuses the third build when the operator follows the refusal and gives the builds in their order', () => {
      const [onC, onB, onA, otherOnA] = files(mustPassOn(thirdBuild, { pass: false }), mustPassOn(fixedBuild),
        mustPassOn(meta.apiCommit, { unavailable: true }), otherOn(meta.apiCommit))
      expect(outcome([onC, onB, onA, otherOnA])).toBe(refusal(2, fixedBuild, thirdBuild))
      expect(followed([onC, onB, onA, otherOnA], [meta.apiCommit, fixedBuild, thirdBuild])).toBe(passedEarlier)
    })
  })

  // An input has one number: its one-based position among the summary paths on the command line, wherever `--rerun`
  // stands and without `--rerun` itself, as `sourceWindow` in merge-reports.mjs. Each `Input N` refusal and `sourceWindow` read it.
  describe('the number of each input', () => {
    const thirdBuild = 'c'.repeat(40)
    const notSummary = (input) => `Input ${input} is not a core set run summary.`
    const noCommit = (input) => `Input ${input} names no API commit of 40 lowercase hexadecimal characters.`
    const sourceWindows = (argumentsList) => Object.fromEntries(mergeRunFiles([...argumentsList, '--as-baseline']).cases
      .filter(({ id }) => id === mustPass.id || id === other.id).map(({ id, sourceWindow }) => [id, sourceWindow]))

    it('names a bad --rerun input that stands before the ordinary windows by its own position', () => {
      const [firstMustPass, firstOther] = files(mustPassOn(meta.apiCommit, { unavailable: true }), otherOn(meta.apiCommit))
      const [notWindow, withoutCommit] = files([], { ...mustPassOn(fixedBuild), apiCommit: 'b'.repeat(7) })
      expect(outcome(['--rerun', notWindow, firstMustPass, firstOther])).toBe(notSummary(1))
      expect(outcome(['--rerun', withoutCommit, firstMustPass, firstOther])).toBe(noCommit(1))
      expect(outcome(['--rerun', withoutCommit, firstMustPass, notWindow])).toBe(noCommit(1))
    })

    it('names a bad ordinary input that stands after a --rerun input by its own position', () => {
      const [later, firstMustPass] = files(mustPassOn(fixedBuild), mustPassOn(meta.apiCommit, { unavailable: true }))
      const [notWindow, withoutCommit, onThird] = files([], { ...otherOn(meta.apiCommit), apiCommit: null }, otherOn(thirdBuild))
      expect(outcome(['--rerun', later, firstMustPass, notWindow])).toBe(notSummary(3))
      expect(outcome(['--rerun', later, firstMustPass, withoutCommit])).toBe(noCommit(3))
      expect(outcome(['--rerun', later, firstMustPass, onThird])).toBe(refusal(3, thirdBuild, meta.apiCommit, 2))
    })

    it('names a --rerun window that returns to an earlier build by its own position', () => {
      const [onB, onC, onBAgain, onA] = files(mustPassOn(fixedBuild, { unavailable: true }), mustPassOn(thirdBuild, { unavailable: true }),
        mustPassOn(fixedBuild, { unavailable: true }), mustPassOn(meta.apiCommit, { unavailable: true }))
      expect(outcome(['--rerun', onB, '--rerun', onC, '--rerun', onBAgain, onA]))
        .toBe('Input 3 returns to the API commit of an earlier build; give the windows of one build together, in the order of the builds.')
    })

    it('records in sourceWindow the position of the summary path that measured each case', () => {
      const [later, firstMustPass, firstOther] = files(mustPassOn(fixedBuild), mustPassOn(meta.apiCommit, { unavailable: true }), otherOn(meta.apiCommit))
      expect(sourceWindows(['--rerun', later, firstMustPass, firstOther])).toEqual({ [mustPass.id]: 1, [other.id]: 3 })
      expect(sourceWindows([firstMustPass, '--rerun', later, firstOther])).toEqual({ [mustPass.id]: 2, [other.id]: 3 })
      expect(sourceWindows([firstMustPass, firstOther, '--rerun', later])).toEqual({ [mustPass.id]: 3, [other.id]: 2 })
    })
  })
})

describe('the report files', () => {
  it('writes the summary with k, pass^k, the questions, the model calls, the seconds and the cost of each case', () => {
    const target = directory()
    const summary = mergeRuns([run(attempts(required, 3, { questions: 1 }), [required]),
      { ...run([result(optional, { pass: false })], [optional], 'other'), evidenceDirectory: '../core-other' }],
    { descriptors, asBaseline: true, runCostUsd: 0.006 })
    const markdown = writeReport(summary, target)
    expect(JSON.parse(readFileSync(join(target, 'summary.json'), 'utf8'))).toEqual(summary)
    expect(readFileSync(join(target, 'summary.md'), 'utf8')).toBe(`${markdown}\n`)
    expect(markdown).toContain('Orbit AI core gate, merged run: pass')
    expect(markdown).toContain(`Corpus digest: ${corpusDigest}`)
    expect(markdown).toContain('| pass^k rate of the core set | 0.5 | this run is the baseline | baseline |')
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 3/3 | pass | 1, 1, 1 | 1 | 2, 2, 2 | 3.2, 3.2, 3.2 | 0.0045 |  |')
    expect(markdown).toContain('| optional | same-title | b | pt-BR | no | 1 | 0/1 | fail | 0 | 0 | 2 | 3.2 | 0.0015 | [r1](../core-other/attempts/optional-r1.json) |')
    expect(markdown).toContain('| Every must-pass case passes pass^k | 1/1 | 1/1 | pass |')
    expect(markdown).toContain('| Cost of one model call (USD) | 0.00075 | at or below 0.0009 (D147) | pass |')
    expect(markdown).toContain('Behavior failures:\noptional: The preview holds a change outside the request.')
    expect(markdown).toContain('A turn that fails, a card turn that returns no trace, and a preview turn without the trace that shows a `stored` field add no counted model calls, so the cost of one model call reads a little high.')
    expect(markdown).not.toContain('Grader limits')
  })

  it('shows a grader limit and an attempt without evidence apart from a behavior failure', () => {
    const summary = run([result(required), result(required, { graderLimit: true }), result(required, { unavailable: true })], [required])
    const markdown = writeReport(summary, directory())
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 1/3 | incomplete |')
    expect(markdown).toContain(`Grader limits (the grader could not read the reply; no verdict on the assistant):\nrequired: ${classify}`)
    expect(markdown).toContain('No evidence (a throttle, a spend ceiling, a failed precondition, a failed rubric grader, a card turn without the '
      + 'trace that its answer needs, or a preview turn without the trace that shows a `stored` field):\n'
      + 'required: The chat turn failed with HTTP 429 (AI_DAILY_BUDGET_EXCEEDED): budget')
    expect(markdown).not.toContain('Behavior failures')
  })

  // Producer: noEvidenceKinds, the one list behind the heading above. The skill and TESTING.md state the same kinds.
  it('names every kind of attempt without evidence in the skill and in TESTING.md', () => {
    for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
      const text = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8').replace(/\s+/gu, ' ')
      const kinds = text.match(/Only ([^.]+?) (?:is|are) no evidence/u)?.[1]
      expect(kinds, path).toBeDefined()
      for (const kind of noEvidenceKinds) expect(kinds, `${path}: ${kind}`).toContain(kind)
    }
  })

  it('names the fixed build and each rerun case in the report', () => {
    const first = [run([...attempts(required, 2), result(required, { pass: false })], [required]), run([result(optional)], [optional], 'other')]
    const summary = mergeRuns(first, { descriptors, asBaseline: true, runCostUsd: 0.0105, reruns: [run(attempts(required, 3), [required], 'must-pass', fixedBuild)] })
    const markdown = writeReport(summary, directory())
    expect(markdown).toContain(`Later build, API commit: ${fixedBuild} (1 rerun of a failed case or of a grader limit; 0 first verdicts; 0 cases with no verdict and no rerun)`)
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 3/3 | pass (rerun on bbbbbbb) |')
    expect(markdown).toContain('| optional | same-title | b | pt-BR | no | 1 | 1/1 | pass |')
  })

  it('writes the private evidence of each attempt with owner-only access', () => {
    const target = directory()
    writeResults([...attempts(required, 2), result(required, { unavailable: true })], target)
    const stored = JSON.parse(readFileSync(join(target, 'results.json'), 'utf8'))
    expect(stored.map(({ caseId, repeat, pass, unavailable }) => ({ caseId, repeat, pass, unavailable }))).toEqual([
      { caseId: 'required', repeat: 1, pass: true, unavailable: undefined }, { caseId: 'required', repeat: 2, pass: true, unavailable: undefined },
      { caseId: 'required', repeat: 3, pass: false, unavailable: true }])
    for (const path of ['results.json', 'attempts/required-r1.json', 'attempts/required-r3.json']) {
      expect(statSync(join(target, path)).mode & 0o777).toBe(0o600)
    }
  })

  it('keeps the held previews of an attempt with the names of their records, and no record id', () => {
    const target = directory()
    const [first, second, preview] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444']
    const empty = '00000000-0000-0000-0000-000000000000'
    const entry = result(required)
    Object.assign(entry.testCase.vars, { accountDate: '2026-11-13', core: { records: { water: first, walk: second, first, second } } })
    const row = (id, index, title) => ({ itemId: `${index}/${id}`, entityId: id, entityName: title, fields: [{ entityId: id, entityName: title,
      field: 'title', valueType: 'text', oldValue: id === empty ? null : title, newValue: `${title} 2` }] })
    entry.response.output.previews = [{ id: preview, actionKey: 'applyAccountChanges', items: [row(second, 0, 'Walk'), row(empty, 1, 'Read')] }]
    writeResults([entry], target)
    const { heldPreviews } = JSON.parse(readFileSync(join(target, 'attempts/required-r1.json'), 'utf8'))
    expect(heldPreviews).toEqual({ accountDate: '2026-11-13', records: { water: 'water', walk: 'walk', first: 'water', second: 'walk' },
      previews: [{ id: 'id-1', actionKey: 'applyAccountChanges', items: [
        { itemId: '0/walk', entityId: 'walk', entityName: 'Walk', fields: [{ entityId: 'walk', entityName: 'Walk', field: 'title', valueType: 'text', oldValue: 'Walk', newValue: 'Walk 2' }] },
        { itemId: '1/no-record', entityId: null, entityName: 'Read', fields: [{ entityId: null, entityName: 'Read', field: 'title', valueType: 'text', oldValue: null, newValue: 'Read 2' }] }] }],
      written: null })
    expect(changeList(heldPreviews.previews).changes.map(({ kind, target: record, fields }) => ({ kind, record, fields }))).toEqual([
      { kind: 'update', record: 'walk', fields: { title: 'Walk 2' } }, { kind: 'create', record: null, fields: { title: 'Read 2' } }])
  })

  // Producer: core/hooks.mjs writes each window and its attempts to reports/core-<run>; a reader keeps an earlier window
  // in another directory before the next run overwrites it.
  it('links each attempt of a failed case in the merged report to the window that measured it', () => {
    const root = directory()
    const mustPass = coreDescriptors().find((entry) => entry.mustPass)
    const other = coreDescriptors().find((entry) => !entry.mustPass)
    const windowAt = (path, results, target, name, apiCommit) => {
      writeResults(results, join(root, path))
      writeReport(summarize(results, [target], { run: name, apiCommit }), join(root, path))
      return join(root, path, 'summary.json')
    }
    const first = windowAt('kept/core-must-pass-day-1', [...attempts(mustPass, 2), result(mustPass, { pass: false })], mustPass, 'must-pass', meta.apiCommit)
    const others = windowAt('kept/core-other-day-1', [result(other, { pass: false })], other, 'other', meta.apiCommit)
    const rerun = windowAt('reports/core-must-pass', [result(mustPass), result(mustPass, { pass: false }), result(mustPass)], mustPass, 'must-pass', fixedBuild)
    const report = join(root, 'reports/core')
    writeReport(mergeRunFiles([first, others, '--rerun', rerun, '--as-baseline'], report), report)
    const links = [...readFileSync(join(report, 'summary.md'), 'utf8').matchAll(/\]\(([^)]+)\)/gu)].map(([, link]) => link)
    expect(links.toSorted()).toEqual([`../../kept/core-other-day-1/attempts/${other.id}-r1.json`,
      ...[1, 2, 3].map((repeat) => `../core-must-pass/attempts/${mustPass.id}-r${repeat}.json`)].toSorted())
    for (const link of links) expect(existsSync(join(report, link)), link).toBe(true)
  })

  it('merges summary files from the command line arguments', () => {
    const target = directory()
    const paths = [run(attempts(required, 3), [required]), run([result(optional)], [optional], 'other')].map((summary, index) => {
      const path = join(target, `window-${index}.json`)
      writeFileSync(path, JSON.stringify(summary))
      return path
    })
    expect(() => mergeRunFiles([...paths, '--run-cost-usd', 'much'])).toThrow(/measured run cost/u)
    expect(() => mergeRunFiles([...paths, '--replace'])).toThrow('Unsupported option --replace.')
    expect(() => mergeRunFiles([...paths, '--rerun'])).toThrow('Supply a summary path after --rerun.')
    expect(() => mergeRunFiles([join(target, 'missing.json'), '--as-baseline'])).toThrow(/Cannot read the summary/u)
    expect(() => mergeRunFiles(paths)).toThrow('Supply the baseline report with --baseline, or declare the baseline run of main with --as-baseline.')
    expect(() => mergeRunFiles([...paths, '--as-baseline', '--rerun', paths[0]])).toThrow('Case required is not in the core set.')
    expect(() => mergeRunFiles([...paths, '--as-baseline'])).toThrow('Case required is not in the core set.')
  })
})
