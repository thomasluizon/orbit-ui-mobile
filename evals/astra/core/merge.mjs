#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { coreDescriptors, corpusDigest } from './corpus.mjs'
import { caseOf, groupsOf, totalsOf, writeReport } from './report.mjs'

// D147 limit: the warm mean cost of one model call (orbit-api tests/Orbit.Infrastructure.Tests/AI/AiInputBudgetTests).
export const COST_PER_MODEL_CALL_LIMIT_USD = 0.0009

const verdicts = ['pass', 'fail', 'incomplete']
const overall = (statuses) => statuses.includes('fail') ? 'fail' : statuses.includes('incomplete') ? 'incomplete' : 'pass'

function windowCase(entry, descriptor) {
  if (!descriptor) throw new Error(`Case ${entry.id} is not in the core set.`)
  if (entry.k !== descriptor.k || entry.mustPass !== descriptor.mustPass) throw new Error(`Case ${entry.id} disagrees with the k policy of the core set.`)
  if (!verdicts.includes(entry.passK) || !Number.isInteger(entry.attempts) || entry.attempts < 0 || entry.attempts > entry.k
    || !Number.isInteger(entry.passed) || entry.passed > entry.attempts) throw new Error(`Case ${entry.id} holds invalid attempt counts.`)
  if (entry.passK === 'pass' && (entry.attempts !== entry.k || entry.passed !== entry.k)) throw new Error(`Case ${entry.id} claims a pass without ${entry.k} passed attempts.`)
  return entry
}

// The cases of the windows of one build: the must-pass run and the other run, each continued across UTC-day windows.
// A later window may hold a case again only while its earlier entry is incomplete. A passed or failed case is final on
// its build: no rerun on the same build replaces it.
function casesOfBuild(windows, descriptors, { firstInput, anotherBuild }) {
  const collected = new Map()
  for (const [index, window] of windows.entries()) {
    const input = firstInput + index
    if (window.gate !== 'core' || !Array.isArray(window.cases)) throw new Error(`Input ${input} is not a core set run summary.`)
    if (window.corpusDigest !== corpusDigest) throw new Error(`Input ${input} measured another corpus than this core set.`)
    if (window.apiCommit !== windows[0].apiCommit) throw new Error(anotherBuild(input))
    for (const entry of window.cases) {
      const previous = collected.get(entry.id)
      if (previous && previous.passK !== 'incomplete') throw new Error(`Case ${entry.id} already has the verdict ${previous.passK}; no rerun on the same build replaces it.`)
      collected.set(entry.id, { ...windowCase(entry, descriptors.find(({ id }) => id === entry.id)), sourceWindow: input })
    }
  }
  return collected
}

// Joins the run summaries of one gate run. After a fix, the failed cases run once more on the fixed build: that rerun
// takes the place of the failure, keeps the model calls of the failed attempts for the cost, and is marked in the
// report. Each other case keeps its verdict of the first build.
function joinRuns(windows, reruns, descriptors) {
  const cases = casesOfBuild(windows, descriptors, { firstInput: 1,
    anotherBuild: (input) => `Input ${input} measured another API commit; one gate run measures one build.` })
  if (reruns.some((window) => window.apiCommit === windows[0].apiCommit)) {
    throw new Error('A rerun on the same build never replaces a failure; the rerun runs on the fixed build.')
  }
  const fixed = casesOfBuild(reruns, descriptors, { firstInput: windows.length + 1,
    anotherBuild: () => 'The rerun measured more than one build; a failed case has one rerun.' })
  for (const [id, entry] of fixed) {
    const failed = cases.get(id)
    if (failed?.passK !== 'fail') throw new Error(`Case ${id} did not fail; only a failed case has a rerun.`)
    cases.set(id, { ...entry, rerun: true, supersededModelCalls: failed.modelCalls })
  }
  return descriptors.map((descriptor) => cases.get(descriptor.id) ?? caseOf(descriptor, []))
}

// The measured cost of the run comes from the API's daily `AI cost` line for the eval purpose. The API returns no cost
// for one turn, so each case takes the share of the run cost that its measured model calls hold, with the calls of the
// failed attempts that a rerun replaced.
function costOf(cases, runCostUsd) {
  const callsOf = (entry) => [...entry.modelCalls, ...(entry.supersededModelCalls ?? [])]
  const counted = cases.flatMap(callsOf)
  const modelCalls = counted.every((count) => count !== null) ? counted.reduce((sum, count) => sum + count, 0) : null
  const measured = runCostUsd !== undefined && modelCalls
  const perModelCallUsd = measured ? Number((runCostUsd / modelCalls).toFixed(6)) : null
  return { cases: cases.map((entry) => ({ ...entry,
    costUsd: measured ? Number((perModelCallUsd * callsOf(entry).reduce((sum, count) => sum + count, 0)).toFixed(6)) : null })),
  cost: { runUsd: runCostUsd ?? null, modelCalls, perModelCallUsd, limitUsd: COST_PER_MODEL_CALL_LIMIT_USD,
    status: !measured ? 'incomplete' : perModelCallUsd <= COST_PER_MODEL_CALL_LIMIT_USD ? 'pass' : 'fail' } }
}

// The pass^k rate of the baseline: a merged report of this corpus in which every case has a verdict. A window summary
// or a report with an incomplete case counts that case as not passed, so its low rate would pass any later run.
function baselineRateOf(baseline, descriptors) {
  if (baseline.gate !== 'core' || baseline.run !== 'merged' || !Array.isArray(baseline.cases)) throw new Error('The baseline is not a merged report of the core set.')
  if (baseline.corpusDigest !== corpusDigest) throw new Error('The baseline measured another corpus than this core set.')
  if (baseline.cases.length !== descriptors.length || descriptors.some(({ id }) => !baseline.cases.some((entry) => entry.id === id))) {
    throw new Error('The baseline does not hold exactly the cases of the core set.')
  }
  const open = baseline.cases.find((entry) => entry.passK !== 'pass' && entry.passK !== 'fail')
  if (open) throw new Error(`The baseline holds a case without a verdict: ${open.id}.`)
  return Number((baseline.cases.filter((entry) => entry.passK === 'pass').length / baseline.cases.length).toFixed(4))
}

// The gate: every must-pass case passes pass^k, the pass^k rate of the core set is at or above the baseline, the mean
// number of questions before a preview is at or below the allowed mean, and one model call costs at most the D147 limit.
function criteriaOf(cases, totals, cost, baselineRate) {
  const required = cases.filter((entry) => entry.mustPass)
  const complete = cases.every((entry) => entry.passK !== 'incomplete')
  return {
    mustPass: { cases: required.length, passed: required.filter((entry) => entry.passK === 'pass').length,
      status: overall(required.map((entry) => entry.passK)) },
    passRate: { rate: totals.passRate, baselineRate,
      status: !complete ? 'incomplete' : baselineRate === null ? 'baseline' : totals.passRate >= baselineRate ? 'pass' : 'fail' },
    questions: { mean: totals.meanQuestionsBeforePreview, allowedMean: totals.allowedMeanQuestions,
      status: totals.meanQuestionsBeforePreview === null ? 'incomplete'
        : totals.meanQuestionsBeforePreview <= totals.allowedMeanQuestions ? 'pass' : 'fail' },
    cost,
  }
}

// A gate run names its baseline report, or is declared the baseline run of `main`: a run without either would pass
// the rate criterion against nothing.
export function mergeRuns(windows, { baseline, asBaseline = false, reruns = [], runCostUsd, descriptors = coreDescriptors() } = {}) {
  if (!windows.length) throw new Error('Supply the run summaries of the core set.')
  if (asBaseline && baseline) throw new Error('A baseline run takes no --baseline.')
  if (!asBaseline && !baseline) throw new Error('Supply the baseline report with --baseline, or declare the baseline run of main with --as-baseline.')
  const baselineRate = baseline ? baselineRateOf(baseline, descriptors) : null
  const joined = joinRuns(windows, reruns, descriptors)
  const totals = totalsOf(joined)
  const { cases, cost } = costOf(joined, runCostUsd)
  const criteria = criteriaOf(cases, totals, cost, baselineRate)
  return { gate: 'core', run: 'merged', apiCommit: windows[0].apiCommit, ...(reruns.length ? { rerunApiCommit: reruns[0].apiCommit } : {}),
    corpusDigest, utcDayWindows: new Set([...windows, ...reruns].map((window) => window.utcDay)).size,
    status: overall(Object.values(criteria).map(({ status }) => status === 'baseline' ? 'pass' : status)),
    criteria, cost, cases, groups: groupsOf(cases), totals }
}

function readSummary(path, option) {
  if (!path || path.startsWith('--')) throw new Error(`Supply a summary path after ${option}.`)
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`Cannot read the summary at ${path}.`) }
}

export function mergeRunFiles(argumentsList) {
  const options = { reruns: [] }
  const windows = []
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    if (argument === '--baseline') options.baseline = readSummary(argumentsList[++index], argument)
    else if (argument === '--rerun') options.reruns.push(readSummary(argumentsList[++index], argument))
    else if (argument === '--as-baseline') options.asBaseline = true
    else if (argument === '--run-cost-usd') {
      options.runCostUsd = Number(argumentsList[++index])
      if (!Number.isFinite(options.runCostUsd) || options.runCostUsd < 0) throw new Error('Supply the measured run cost in USD after --run-cost-usd.')
    } else if (argument.startsWith('--')) throw new Error(`Unsupported option ${argument}.`)
    else windows.push(readSummary(argument))
  }
  return mergeRuns(windows, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = mergeRunFiles(process.argv.slice(2))
    process.stdout.write(`${writeReport(summary, 'reports/core')}\n`)
    process.exitCode = summary.status === 'pass' ? 0 : 1
  } catch (error) {
    process.stderr.write(`Cannot merge the core set runs: ${error.message}\n`)
    process.exitCode = 1
  }
}
