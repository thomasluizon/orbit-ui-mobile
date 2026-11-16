#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { coreDescriptors, corpusDigest } from './corpus.mjs'
import { callsOf, caseOf, groupsOf, totalsOf, writeReport } from './report.mjs'

// D147 limit: the warm mean cost of one model call (orbit-api tests/Orbit.Infrastructure.Tests/AI/AiInputBudgetTests).
export const COST_PER_MODEL_CALL_LIMIT_USD = 0.0009

// The directory of the merged report of the command line.
export const MERGED_REPORT_DIRECTORY = 'reports/core'

const verdicts = ['pass', 'fail', 'incomplete']
const overall = (statuses) => statuses.includes('fail') ? 'fail' : statuses.includes('incomplete') ? 'incomplete' : 'pass'
const count = (value, limit) => Number.isInteger(value) && value >= 0 && value <= limit

function windowCase(entry, descriptor) {
  if (!descriptor) throw new Error(`Case ${entry.id} is not in the core set.`)
  if (entry.k !== descriptor.k || entry.mustPass !== descriptor.mustPass) throw new Error(`Case ${entry.id} disagrees with the k policy of the core set.`)
  if (!verdicts.includes(entry.passK) || !count(entry.attempts, entry.k) || !count(entry.passed, entry.attempts)
    || !count(entry.graderLimits, entry.attempts)) throw new Error(`Case ${entry.id} holds invalid attempt counts.`)
  if (entry.passK === 'pass' && (entry.attempts !== entry.k || entry.passed !== entry.k)) throw new Error(`Case ${entry.id} claims a pass without ${entry.k} passed attempts.`)
  return entry
}

// A case is open while no build gave it a verdict or a grader limit: no window held it, or its attempts gave no evidence.
// A grader limit is no verdict on the assistant, but its attempt was measured: it is final on its build.
const open = (entry) => !entry || (entry.passK === 'incomplete' && entry.graderLimits === 0)

// The cases of the windows of one build: the must-pass run and the other run, each continued across UTC-day windows.
// A later window may hold a case again only while the case is open. No rerun on the same build replaces a passed or
// failed case or a grader limit. A later window keeps the model calls of the window it replaces, for the cost. Each
// case keeps the API commit and the evidence directory of the window that measured it. A window of another API commit
// is refused: the windows of one call measure one build, and a summary holds no time finer than its UTC day, so the
// refusal names both commits and leaves the operator to give the builds in their order.
function casesOfBuild(windows, descriptors, firstInput) {
  const collected = new Map()
  for (const [index, window] of windows.entries()) {
    const input = firstInput + index
    if (window.corpusDigest !== corpusDigest) throw new Error(`Input ${input} measured another corpus than this core set.`)
    if (window.apiCommit !== windows[0].apiCommit) {
      throw new Error(`Input ${input} measured another API commit (${window.apiCommit.slice(0, 7)}) than input ${firstInput} (${windows[0].apiCommit.slice(0, 7)}); the summaries do not tell which build is later, so give the windows in build order: the windows of the first build without --rerun, then the windows of each later build with --rerun, in the order of the builds.`)
    }
    for (const entry of window.cases) {
      const previous = collected.get(entry.id)
      if (previous?.passK === 'incomplete' && previous.graderLimits > 0) {
        throw new Error(`Case ${entry.id} holds a grader limit, which is final on its build; no rerun on the same build replaces it.`)
      }
      if (previous && previous.passK !== 'incomplete') throw new Error(`Case ${entry.id} already has the verdict ${previous.passK}; no rerun on the same build replaces it.`)
      collected.set(entry.id, { ...windowCase(entry, descriptors.find(({ id }) => id === entry.id)), sourceWindow: input,
        apiCommit: window.apiCommit, ...(window.evidenceDirectory ? { evidenceDirectory: window.evidenceDirectory } : {}),
        ...(previous ? { supersededModelCalls: callsOf(previous) } : {}) })
    }
  }
  return collected
}

// The `--rerun` windows, one group for each later build, in the order of the command line.
function laterBuildsOf(windows) {
  const builds = []
  for (const window of windows) {
    if (builds.at(-1)?.[0].apiCommit === window.apiCommit) builds.at(-1).push(window)
    else builds.push([window])
  }
  return builds
}

// The entry of a case on a later build takes the place of its entry of the earlier builds, whole: the attempts of one
// case come from one build, so two builds never share one verdict. A case that failed or holds a grader limit has one
// rerun, after a fix. An open case is measured for the first time, or continues its rerun, and uses no rerun. A case
// that passed keeps its build. Each entry keeps the model calls of the entries it replaces, for the cost.
function onLaterBuild(id, entry, earlier) {
  if (earlier?.passK === 'pass') throw new Error(`Case ${id} passed on an earlier build; a later build measures only a case without a pass.`)
  if (!open(earlier) && earlier.rerun) throw new Error(`Case ${id} already had its rerun; a case has one rerun.`)
  const superseded = [...(earlier ? callsOf(earlier) : []), ...(entry.supersededModelCalls ?? [])]
  return { ...entry, ...(!open(earlier) || earlier?.rerun ? { rerun: true } : {}),
    ...(superseded.length ? { supersededModelCalls: superseded } : {}) }
}

// Joins the run summaries of one gate run. The first build holds the ordinary windows. Staging can serve another API
// commit before each case has a verdict: after a fix, or after a release of another commit. Each later build then
// measures only the cases without a pass: the single rerun of a failed case or of a grader limit, and the open cases.
function joinRuns(windows, laterWindows, descriptors) {
  const cases = casesOfBuild(windows, descriptors, 1)
  const builds = [windows[0].apiCommit]
  let firstInput = windows.length + 1
  for (const build of laterBuildsOf(laterWindows)) {
    const { apiCommit } = build[0]
    if (apiCommit === builds[0]) throw new Error('A rerun on the same build never replaces a failure; the rerun runs on the fixed build.')
    if (builds.includes(apiCommit)) {
      throw new Error(`Input ${firstInput} returns to the API commit of an earlier build; give the windows of one build together, in the order of the builds.`)
    }
    builds.push(apiCommit)
    for (const [id, entry] of casesOfBuild(build, descriptors, firstInput)) cases.set(id, onLaterBuild(id, entry, cases.get(id)))
    firstInput += build.length
  }
  return { cases: descriptors.map((descriptor) => cases.get(descriptor.id) ?? caseOf(descriptor, [])), laterApiCommits: builds.slice(1) }
}

// The measured cost of the run comes from the API's daily `AI cost` line for the eval purpose. The API returns no cost
// for one turn, so each case takes the share of the run cost that its measured model calls hold, with the calls of the
// attempts that a later window or a rerun replaced.
function costOf(cases, runCostUsd, modelCalls) {
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

// The gate: every must-pass case passes pass^k, the pass^k rate of the core set is at or above the baseline, no attempt
// asks more often than its case allows, and one model call costs at most the D147 limit.
function criteriaOf(cases, totals, cost, baselineRate) {
  const required = cases.filter((entry) => entry.mustPass)
  const complete = cases.every((entry) => entry.passK !== 'incomplete')
  return {
    mustPass: { cases: required.length, passed: required.filter((entry) => entry.passK === 'pass').length,
      status: overall(required.map((entry) => entry.passK)) },
    passRate: { rate: totals.passRate, baselineRate,
      status: !complete ? 'incomplete' : baselineRate === null ? 'baseline' : totals.passRate >= baselineRate ? 'pass' : 'fail' },
    questions: { mean: totals.meanQuestionsBeforePreview, allowedMean: totals.allowedMeanQuestions,
      attemptsOverLimit: totals.attemptsOverQuestionLimit,
      status: totals.attemptsOverQuestionLimit ? 'fail' : totals.meanQuestionsBeforePreview === null ? 'incomplete' : 'pass' },
    cost,
  }
}

const WINDOW_RUNS = ['must-pass', 'other']

// A gate run names its baseline report, or is declared the baseline run of `main`: a run without either would pass
// the rate criterion against nothing. `reruns` holds the windows of the later builds. A window names its
// `evidenceDirectory` relative to the merged report, so that the report links the private evidence of each failed case
// to the window that holds it.
export function mergeRuns(windows, { baseline, asBaseline = false, reruns = [], runCostUsd, descriptors = coreDescriptors() } = {}) {
  if (!windows.length) throw new Error('Supply the run summaries of the core set.')
  if (asBaseline && baseline) throw new Error('A baseline run takes no --baseline.')
  if (!asBaseline && !baseline) throw new Error('Supply the baseline report with --baseline, or declare the baseline run of main with --as-baseline.')
  // Each input is a window summary before its API commit is read: a window directory also holds `results.json`, an
  // array, and the merged report (`run: 'merged'`) also has `gate` and `cases`. core/hooks.mjs names each window run.
  // The runner records the API commit of the health check only after requireCatalogCommit holds it to 40 lowercase
  // hexadecimal characters (core/hooks.mjs), and each build check compares these commits. A window without one would merge with no build or stop the merge with a TypeError.
  for (const [index, window] of [...windows, ...reruns].entries()) {
    if (window.gate !== 'core' || !WINDOW_RUNS.includes(window.run) || !Array.isArray(window.cases)) throw new Error(`Input ${index + 1} is not a core set run summary.`)
    if (typeof window.apiCommit !== 'string' || !/^[0-9a-f]{40}$/u.test(window.apiCommit)) {
      throw new Error(`Input ${index + 1} names no API commit of 40 lowercase hexadecimal characters.`)
    }
  }
  const baselineRate = baseline ? baselineRateOf(baseline, descriptors) : null
  const joined = joinRuns(windows, reruns, descriptors)
  const totals = totalsOf(joined.cases)
  const { cases, cost } = costOf(joined.cases, runCostUsd, totals.modelCalls)
  const criteria = criteriaOf(cases, totals, cost, baselineRate)
  return { gate: 'core', run: 'merged', apiCommit: windows[0].apiCommit,
    ...(joined.laterApiCommits.length ? { laterApiCommits: joined.laterApiCommits } : {}),
    corpusDigest, utcDayWindows: new Set([...windows, ...reruns].map((window) => window.utcDay)).size,
    status: overall(Object.values(criteria).map(({ status }) => status === 'baseline' ? 'pass' : status)),
    criteria, cost, cases, groups: groupsOf(cases), totals }
}

function readSummary(path, option) {
  if (!path || path.startsWith('--')) throw new Error(`Supply a summary path after ${option}.`)
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`Cannot read the summary at ${path}.`) }
}

// Each window keeps its `attempts/` evidence beside its summary file, wherever the reader keeps that window.
export function mergeRunFiles(argumentsList, reportDirectory = MERGED_REPORT_DIRECTORY) {
  const options = { reruns: [] }
  const windows = []
  const readWindow = (path, option) => ({ ...readSummary(path, option), evidenceDirectory: relative(reportDirectory, dirname(path)) || '.' })
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    if (argument === '--baseline') options.baseline = readSummary(argumentsList[++index], argument)
    else if (argument === '--rerun') options.reruns.push(readWindow(argumentsList[++index], argument))
    else if (argument === '--as-baseline') options.asBaseline = true
    else if (argument === '--run-cost-usd') {
      options.runCostUsd = Number(argumentsList[++index])
      if (!Number.isFinite(options.runCostUsd) || options.runCostUsd < 0) throw new Error('Supply the measured run cost in USD after --run-cost-usd.')
    } else if (argument.startsWith('--')) throw new Error(`Unsupported option ${argument}.`)
    else windows.push(readWindow(argument))
  }
  return mergeRuns(windows, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = mergeRunFiles(process.argv.slice(2))
    process.stdout.write(`${writeReport(summary, MERGED_REPORT_DIRECTORY)}\n`)
    process.exitCode = summary.status === 'pass' ? 0 : 1
  } catch (error) {
    process.stderr.write(`Cannot merge the core set runs: ${error.message}\n`)
    process.exitCode = 1
  }
}
