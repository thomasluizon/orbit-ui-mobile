#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { coreDescriptors, phrasingDigest } from './corpus.mjs'
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

// Joins the run summaries of one gate run: the must-pass run and the other run, each continued across UTC-day windows.
// A later window may hold a case again only while its earlier entry is incomplete. A passed or failed case is final on
// this build: no rerun replaces it.
function joinWindows(windows, descriptors) {
  const collected = new Map()
  for (const [index, window] of windows.entries()) {
    if (window.gate !== 'core' || !Array.isArray(window.cases)) throw new Error(`Input ${index + 1} is not a core set run summary.`)
    if (window.phrasingDigest !== phrasingDigest) throw new Error(`Input ${index + 1} measured other phrasings than this core set.`)
    if (window.apiCommit !== windows[0].apiCommit) throw new Error(`Input ${index + 1} measured another API commit; one gate run measures one build.`)
    for (const entry of window.cases) {
      const previous = collected.get(entry.id)
      if (previous && previous.passK !== 'incomplete') throw new Error(`Case ${entry.id} already has the verdict ${previous.passK}; no rerun replaces it.`)
      collected.set(entry.id, { ...windowCase(entry, descriptors.find(({ id }) => id === entry.id)), sourceWindow: index + 1 })
    }
  }
  return descriptors.map((descriptor) => collected.get(descriptor.id) ?? caseOf(descriptor, []))
}

// The measured cost of the run comes from the API's daily `AI cost` line for the eval purpose. The API returns no cost
// for one turn, so each case takes the share of the run cost that its measured model calls hold.
function costOf(cases, totals, runCostUsd) {
  const measured = runCostUsd !== undefined && totals.modelCalls
  const perModelCallUsd = measured ? Number((runCostUsd / totals.modelCalls).toFixed(6)) : null
  return { cases: cases.map((entry) => ({ ...entry,
    costUsd: measured ? Number((perModelCallUsd * entry.modelCalls.reduce((sum, count) => sum + count, 0)).toFixed(6)) : null })),
  cost: { runUsd: runCostUsd ?? null, perModelCallUsd, limitUsd: COST_PER_MODEL_CALL_LIMIT_USD,
    status: !measured ? 'incomplete' : perModelCallUsd <= COST_PER_MODEL_CALL_LIMIT_USD ? 'pass' : 'fail' } }
}

// The gate: every must-pass case passes pass^k, the pass^k rate of the core set is at or above the baseline, the mean
// number of questions before a preview is at or below the allowed mean, and one model call costs at most the D147 limit.
function criteriaOf(cases, totals, cost, baseline) {
  const required = cases.filter((entry) => entry.mustPass)
  const complete = cases.every((entry) => entry.passK !== 'incomplete')
  const baselineRate = baseline?.totals?.passRate ?? null
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

export function mergeRuns(windows, { baseline, runCostUsd, descriptors = coreDescriptors() } = {}) {
  if (!windows.length) throw new Error('Supply the run summaries of the core set.')
  if (baseline && baseline.phrasingDigest !== phrasingDigest) throw new Error('The baseline measured other phrasings than this core set.')
  const joined = joinWindows(windows, descriptors)
  const totals = totalsOf(joined)
  const { cases, cost } = costOf(joined, totals, runCostUsd)
  const criteria = criteriaOf(cases, totals, cost, baseline)
  return { gate: 'core', run: 'merged', apiCommit: windows[0].apiCommit, phrasingDigest,
    utcDayWindows: new Set(windows.map((window) => window.utcDay)).size,
    status: overall(Object.values(criteria).map(({ status }) => status === 'baseline' ? 'pass' : status)),
    criteria, cost, cases, groups: groupsOf(cases), totals }
}

function readSummary(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`Cannot read the summary at ${path}.`) }
}

export function mergeRunFiles(argumentsList) {
  const options = {}
  const paths = []
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    if (argument === '--baseline') options.baseline = readSummary(argumentsList[++index])
    else if (argument === '--run-cost-usd') {
      options.runCostUsd = Number(argumentsList[++index])
      if (!Number.isFinite(options.runCostUsd) || options.runCostUsd < 0) throw new Error('Supply the measured run cost in USD after --run-cost-usd.')
    } else if (argument.startsWith('--')) throw new Error(`Unsupported option ${argument}.`)
    else paths.push(argument)
  }
  return mergeRuns(paths.map(readSummary), options)
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
