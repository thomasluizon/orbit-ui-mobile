import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { phrasingDigest } from '../core/corpus.mjs'
import { COST_PER_MODEL_CALL_LIMIT_USD, mergeRunFiles, mergeRuns } from '../core/merge.mjs'
import { summarize, writeReport, writeResults } from '../core/report.mjs'

const descriptor = (id, overrides = {}) => ({ id, situation: id, family: 'owner-turns', defectClass: 'b', locale: 'en',
  mustPass: true, k: 3, maxQuestions: 1, ...overrides })
const required = descriptor('required')
const optional = descriptor('optional', { family: 'same-title', locale: 'pt-BR', mustPass: false, k: 1, maxQuestions: 0 })
const descriptors = [required, optional]
const meta = { run: 'must-pass', apiCommit: 'a'.repeat(40) }
const scratch = []
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })

// One promptfoo result of the core provider: a graded attempt, or an attempt without evidence.
function result(target, { pass = true, questions = 0, modelCalls = 2, unavailable = false } = {}) {
  const output = unavailable ? { unavailable: true, error: 'The chat turn failed with HTTP 429 (AI_DAILY_BUDGET_EXCEEDED): budget' }
    : { turns: questions + 1, questionsBeforePreview: questions, previews: [{ id: 'preview', actionKey: 'deleteHabits', items: [] }], modelCalls }
  return { testCase: { metadata: target, vars: { clientContext: { supportsParts: true } } }, success: pass && !unavailable,
    response: { output, ...(unavailable ? { error: output.error } : {}) },
    ...(unavailable ? { error: output.error } : { gradingResult: { componentResults: [{ pass, assertion: { metric: 'outcome' },
      reason: pass ? 'The saved state matches the approved changes.' : 'The preview holds a change outside the request.' }] } }) }
}
const attempts = (target, count, options) => Array.from({ length: count }, () => result(target, options))
const run = (results, selected = descriptors, name = 'must-pass') => summarize(results, selected, { ...meta, run: name })

describe('pass^k of one run', () => {
  it('passes a must-pass case only when each of its 3 attempts passes', () => {
    const summary = run([...attempts(required, 3, { questions: 1 }), result(optional)])
    expect(summary).toMatchObject({ gate: 'core', status: 'pass', phrasingDigest, apiCommit: meta.apiCommit })
    expect(summary.cases).toMatchObject([
      { id: 'required', mustPass: true, k: 3, attempts: 3, passed: 3, passK: 'pass', questionsBeforePreview: [1, 1, 1], modelCalls: [2, 2, 2] },
      { id: 'optional', mustPass: false, k: 1, attempts: 1, passed: 1, passK: 'pass', questionsBeforePreview: [0], modelCalls: [2] },
    ])
  })

  it('fails a must-pass case when one of its 3 attempts fails', () => {
    const summary = run([...attempts(required, 2), result(required, { pass: false }), result(optional)])
    expect(summary.status).toBe('fail')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: 2, passK: 'fail', reasons: ['The preview holds a change outside the request.'] })
  })

  it.each([2, 0])('keeps a must-pass case with %i attempts incomplete', (count) => {
    expect(run([...attempts(required, count), result(optional)]).cases[0]).toMatchObject({ attempts: count, passK: 'incomplete' })
  })

  it('keeps an attempt without evidence incomplete, never a pass and never a fail', () => {
    const summary = run([...attempts(required, 2), result(required, { unavailable: true }), result(optional)])
    expect(summary.status).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: 2, unavailable: 1, passK: 'incomplete', modelCalls: [2, 2, 0] })
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
  const requiredRun = (results) => run(results, [required], 'must-pass')
  const otherRun = (results) => run(results, [optional], 'other')
  const merged = (windows, options) => mergeRuns(windows, { descriptors, ...options })

  it('joins the must-pass run and the other run, and keeps k for each case', () => {
    const summary = merged([requiredRun(attempts(required, 3)), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(summary).toMatchObject({ run: 'merged', status: 'pass', utcDayWindows: 1 })
    expect(summary.cases.map(({ id, k, passK, sourceWindow }) => ({ id, k, passK, sourceWindow }))).toEqual([
      { id: 'required', k: 3, passK: 'pass', sourceWindow: 1 }, { id: 'optional', k: 1, passK: 'pass', sourceWindow: 2 }])
    expect(summary.criteria.mustPass).toEqual({ cases: 1, passed: 1, status: 'pass' })
  })

  it('gives each case its share of the measured run cost by its measured model calls', () => {
    const summary = merged([requiredRun(attempts(required, 3)), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(summary.cost).toEqual({ runUsd: 0.006, perModelCallUsd: 0.00075, limitUsd: COST_PER_MODEL_CALL_LIMIT_USD, status: 'pass' })
    expect(summary.cases.map(({ costUsd }) => costUsd)).toEqual([0.0045, 0.0015])
  })

  it('fails the gate when one model call costs more than the D147 limit', () => {
    const summary = merged([requiredRun(attempts(required, 3)), otherRun([result(optional)])], { runCostUsd: 0.0116 })
    expect(summary.cost).toMatchObject({ perModelCallUsd: 0.00145, status: 'fail' })
    expect(summary.status).toBe('fail')
  })

  it('stays incomplete until the measured run cost is supplied', () => {
    const summary = merged([requiredRun(attempts(required, 3)), otherRun([result(optional)])])
    expect(summary.cost).toMatchObject({ runUsd: null, perModelCallUsd: null, status: 'incomplete' })
    expect(summary.status).toBe('incomplete')
  })

  it('fails the gate when a must-pass case fails, and when the questions exceed the allowed mean', () => {
    const failed = merged([requiredRun([...attempts(required, 2), result(required, { pass: false })]), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(failed).toMatchObject({ status: 'fail', criteria: { mustPass: { passed: 0, status: 'fail' } } })
    const asked = merged([requiredRun(attempts(required, 3)), otherRun([result(optional, { questions: 1, pass: false })])], { runCostUsd: 0.006 })
    expect(asked.criteria.questions).toEqual({ mean: 0.25, allowedMean: 0.75, status: 'pass' })
    const many = merged([requiredRun(attempts(required, 3, { questions: 2, pass: false })), otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(many.criteria.questions).toMatchObject({ mean: 1.5, allowedMean: 0.75, status: 'fail' })
  })

  it('compares the pass^k rate with the baseline report', () => {
    const windows = [requiredRun(attempts(required, 3)), otherRun([result(optional, { pass: false })])]
    const baseline = merged(windows, { runCostUsd: 0.006 })
    expect(baseline.criteria.passRate).toEqual({ rate: 0.5, baselineRate: null, status: 'baseline' })
    expect(merged(windows, { runCostUsd: 0.006, baseline }).criteria.passRate).toMatchObject({ baselineRate: 0.5, status: 'pass' })
    const better = { ...baseline, totals: { ...baseline.totals, passRate: 1 } }
    expect(merged(windows, { runCostUsd: 0.006, baseline: better })).toMatchObject({ status: 'fail', criteria: { passRate: { status: 'fail' } } })
  })

  it('continues an incomplete case in a later window, and counts the UTC-day windows', () => {
    const stopped = requiredRun([...attempts(required, 2), result(required, { unavailable: true })])
    const continued = { ...requiredRun(attempts(required, 3)), utcDay: '2099-01-02' }
    const summary = merged([stopped, continued, otherRun([result(optional)])], { runCostUsd: 0.006 })
    expect(summary).toMatchObject({ status: 'pass', utcDayWindows: 2 })
    expect(summary.cases[0]).toMatchObject({ passK: 'pass', attempts: 3, sourceWindow: 2 })
  })

  it.each(['fail', 'pass'])('never lets a rerun replace a case with the verdict %s', (verdict) => {
    const first = requiredRun(verdict === 'pass' ? attempts(required, 3) : [...attempts(required, 2), result(required, { pass: false })])
    expect(() => merged([first, requiredRun(attempts(required, 3))])).toThrow(`Case required already has the verdict ${verdict}; no rerun replaces it.`)
  })

  it('rejects a window of other phrasings, of another build, or with a wrong k', () => {
    const window = requiredRun(attempts(required, 3))
    expect(() => merged([{ ...window, phrasingDigest: 'other' }])).toThrow(/other phrasings/u)
    expect(() => merged([window, { ...otherRun([result(optional)]), apiCommit: 'b'.repeat(40) }])).toThrow(/another API commit/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], k: 1 }] }])).toThrow(/k policy/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], attempts: 2, passed: 2 }] }])).toThrow(/claims a pass/u)
    expect(() => merged([{ ...window, cases: [{ ...window.cases[0], passed: 4 }] }])).toThrow(/invalid attempt counts/u)
    expect(() => merged([window], { baseline: { phrasingDigest: 'other' } })).toThrow(/baseline measured other phrasings/u)
  })

  it('reports a case that no window holds as incomplete', () => {
    expect(merged([requiredRun(attempts(required, 3))], { runCostUsd: 0.0045 })).toMatchObject({ status: 'incomplete',
      cases: [{ id: 'required', passK: 'pass' }, { id: 'optional', attempts: 0, passK: 'incomplete' }] })
  })
})

describe('the report files', () => {
  const directory = () => { const path = mkdtempSync(join(tmpdir(), 'core-report-')); scratch.push(path); return path }

  it('writes the summary with k, pass^k, the questions, the model calls and the cost of each case', () => {
    const target = directory()
    const summary = mergeRuns([run(attempts(required, 3, { questions: 1 }), [required]), run([result(optional, { pass: false })], [optional], 'other')],
      { descriptors, runCostUsd: 0.006 })
    const markdown = writeReport(summary, target)
    expect(JSON.parse(readFileSync(join(target, 'summary.json'), 'utf8'))).toEqual(summary)
    expect(readFileSync(join(target, 'summary.md'), 'utf8')).toBe(`${markdown}\n`)
    expect(markdown).toContain('Orbit AI core gate, merged run: pass')
    expect(markdown).toContain('| pass^k rate of the core set | 0.5 | this run is the baseline | baseline |')
    expect(markdown).toContain('| required | owner-turns | b | en | yes | 3 | 3/3 | pass | 1, 1, 1 | 1 | 2, 2, 2 | 0.0045 |  |')
    expect(markdown).toContain('| optional | same-title | b | pt-BR | no | 1 | 0/1 | fail | 0 | 0 | 2 | 0.0015 | [r1](attempts/optional-r1.json) |')
    expect(markdown).toContain('| Every must-pass case passes pass^k | 1/1 | 1/1 | pass |')
    expect(markdown).toContain('| Cost of one model call (USD) | 0.00075 | at or below 0.0009 (D147) | pass |')
    expect(markdown).toContain('optional: The preview holds a change outside the request.')
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

  it('merges summary files from the command line arguments', () => {
    const target = directory()
    const paths = [run(attempts(required, 3), [required]), run([result(optional)], [optional], 'other')].map((summary, index) => {
      const path = join(target, `window-${index}.json`)
      writeFileSync(path, JSON.stringify(summary))
      return path
    })
    expect(() => mergeRunFiles([...paths, '--run-cost-usd', 'much'])).toThrow(/measured run cost/u)
    expect(() => mergeRunFiles([...paths, '--rerun'])).toThrow('Unsupported option --rerun.')
    expect(() => mergeRunFiles([join(target, 'missing.json')])).toThrow(/Cannot read the summary/u)
    expect(() => mergeRunFiles(paths)).toThrow('Case required is not in the core set.')
  })
})
