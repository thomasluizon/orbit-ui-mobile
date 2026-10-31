#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { describeCase, validateLatencySummary } from './latency.mjs'
import { aggregate, writeReport } from './report.mjs'

export const descriptors = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((path) =>
  parse(readFileSync(new URL(path, import.meta.url), 'utf8')).map(describeCase))

function windowEntry(entry, descriptor) {
  if (!descriptor) throw new Error('Unexpected case across windows.')
  if (entry.family !== (descriptor.family ?? 'legacy') || entry.locale !== (descriptor.locale ?? 'unspecified')) throw new Error('Window labels disagree with the corpus.')
  for (const field of ['attempts', 'passed', 'skipped', 'unavailable', 'missingComposition']) {
    if (!Number.isInteger(entry[field]) || entry[field] < 0 || entry[field] > 3) throw new Error('Invalid window attempt counts.')
  }
  if (entry.passed > entry.attempts || !['pass', 'fail', 'incomplete'].includes(entry.pass3)) throw new Error('Invalid window verdict.')
  const complete = entry.attempts === 3 && !entry.skipped && !entry.unavailable && !entry.missingComposition
  if (entry.pass3 === 'pass' && (!complete || entry.passed !== 3)) throw new Error('Window claims a pass without complete evidence.')
  if (entry.unavailableReasons != null && (!Array.isArray(entry.unavailableReasons)
    || entry.unavailableReasons.some((reason) => typeof reason !== 'string'))) throw new Error('Invalid window precondition reasons.')
  if (descriptor.readLatency) {
    validateLatencySummary(entry.latency)
    if (entry.latency.status !== 'pass' && entry.pass3 === 'pass') throw new Error('Window claims a pass without passing latency evidence.')
  }
  const pass3 = entry.pass3 === 'fail' ? 'fail'
    : !complete || (descriptor.readLatency && entry.latency.status === 'incomplete') ? 'incomplete' : entry.pass3
  return { id: entry.id, family: entry.family, locale: entry.locale, attempts: entry.attempts,
    passed: entry.passed, ...(descriptor.readLatency ? { latency: entry.latency } : {}), unavailableReasons: entry.unavailableReasons ?? [],
    skipped: entry.skipped, unavailable: entry.unavailable, missingComposition: entry.missingComposition,
    pass3 }
}

export function mergeReports(windows, expected = descriptors, { rerunWindows = [] } = {}) {
  if (new Set(rerunWindows).size !== rerunWindows.length || rerunWindows.some((index) => !Number.isInteger(index) || index < 1 || index > windows.length)) {
    throw new Error('Rerun windows must be distinct one-based input positions.')
  }
  const collected = new Map()
  for (const [index, window] of windows.entries()) {
    if (window.k !== 3 || !Array.isArray(window.cases)) throw new Error('Window must contain a pass^3 summary.')
    const seen = new Set()
    const rerun = rerunWindows.includes(index + 1)
    for (const entry of window.cases) {
      if (seen.has(entry.id)) throw new Error(`Duplicate case within window ${index + 1}: ${entry.id}.`)
      seen.add(entry.id)
      const current = windowEntry(entry, expected.find(({ id }) => id === entry.id))
      const previous = collected.get(entry.id)
      if (previous?.pass3 === 'pass') throw new Error(`Case ${entry.id} already passed in window ${previous.sourceWindow}.`)
      if (rerun && previous?.rerun) throw new Error(`Case ${entry.id} already used its permitted rerun.`)
      if (rerun && previous?.pass3 !== 'fail') throw new Error(`Declared rerun requires a previous failed case: ${entry.id}.`)
      if (previous?.pass3 === 'fail' && !rerun) throw new Error(`Case ${entry.id} failed; declare its permitted rerun with --rerun.`)
      const { superseded = [], ...previousEvidence } = previous ?? {}
      collected.set(entry.id, { ...current, sourceWindow: index + 1,
        ...(rerun || previous?.rerun ? { rerun: true } : {}),
        ...(previous ? { superseded: [...superseded, previousEvidence] } : {}) })
    }
  }
  return aggregate(expected.map(({ id, family = 'legacy', locale = 'unspecified' }) => collected.get(id)
    ?? { id, family, locale, attempts: 0, passed: 0, skipped: 0, unavailable: 0, missingComposition: 0, pass3: 'incomplete' }))
}

export function mergeReportFiles(argumentsList, expected = descriptors) {
  const windows = []
  const rerunWindows = []
  for (let index = 0; index < argumentsList.length; index++) {
    const rerun = argumentsList[index] === '--rerun'
    const path = argumentsList[rerun ? ++index : index]
    if (!path || path.startsWith('--')) throw new Error('Supply a summary path after --rerun; other options are unsupported.')
    try { windows.push(JSON.parse(readFileSync(path, 'utf8'))) } catch {
      throw new Error(`Cannot read sanitized window summary at input position ${windows.length + 1}.`)
    }
    if (rerun) rerunWindows.push(windows.length)
  }
  if (!windows.length) throw new Error('Supply sanitized window summary paths.')
  return mergeReports(windows, expected, { rerunWindows })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = mergeReportFiles(process.argv.slice(2))
    process.stdout.write(`${writeReport(summary)}\n`)
    process.exitCode = summary.status === 'pass' ? 0 : 1
  } catch (error) {
    process.stderr.write(`Cannot merge Astra windows: ${error.message}\n`)
    process.exitCode = 1
  }
}
