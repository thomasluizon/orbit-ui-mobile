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

  // Day 1 on the first build: one case fails and the spend ceiling stops the other case after 2 attempts. Day 2: staging
  // serves the fix.
  const cutShort = () => [stopped(meta.apiCommit), optionalOn(meta.apiCommit, { pass: false })]

  it('refuses a window of the later build among the windows of the first build, and names --rerun', () => {
    expect(() => merged([...cutShort(), requiredOn(fixedBuild)]))
      .toThrow('Input 3 measured another API commit; give each window of a later build to the merge with --rerun.')
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
    const target = mkdtempSync(join(tmpdir(), 'core-report-'))
    scratch.push(target)
    const markdown = writeReport(merged(cutShort(), [requiredOn(fixedBuild), optionalOn(fixedBuild)]), target)
    expect(markdown).toContain(`Later build, API commit: ${fixedBuild} (1 rerun of a failed case or of a grader limit; 1 case without a verdict on an earlier build)`)
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 3/3 | pass (first verdict on bbbbbbb) |')
    expect(markdown).toContain('| optional | same-title | b | pt-BR | no | 1 | 1/1 | pass (rerun on bbbbbbb) |')
    expect(markdown).toContain('The attempts of one case come from one build.')
  })
})

describe('the report files', () => {
  const directory = () => { const path = mkdtempSync(join(tmpdir(), 'core-report-')); scratch.push(path); return path }

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
    expect(markdown).toContain(`Later build, API commit: ${fixedBuild} (1 rerun of a failed case or of a grader limit; 0 cases without a verdict on an earlier build)`)
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
