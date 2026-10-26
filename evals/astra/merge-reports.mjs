#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { describeCase, validateLatencySummary } from './latency.mjs'
import { aggregate, writeReport } from './report.mjs'

export const descriptors = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((path) =>
  parse(readFileSync(new URL(path, import.meta.url), 'utf8')).map(describeCase))

export function mergeReports(windows, expected = descriptors) {
  const collected = new Map()
  for (const window of windows) {
    if (window.k !== 3 || !Array.isArray(window.cases)) throw new Error('Window must contain a pass^3 summary.')
    for (const entry of window.cases) {
      const descriptor = expected.find(({ id }) => id === entry.id)
      if (!descriptor || collected.has(entry.id)) throw new Error('Unexpected or duplicate case across windows.')
      if (entry.family !== (descriptor.family ?? 'legacy') || entry.locale !== (descriptor.locale ?? 'unspecified')) throw new Error('Window labels disagree with the corpus.')
      for (const field of ['attempts', 'passed', 'skipped', 'unavailable', 'missingComposition']) {
        if (!Number.isInteger(entry[field]) || entry[field] < 0 || entry[field] > 3) throw new Error('Invalid window attempt counts.')
      }
      if (entry.passed > entry.attempts || !['pass', 'fail', 'incomplete'].includes(entry.pass3)) throw new Error('Invalid window verdict.')
      const complete = entry.attempts === 3 && entry.passed === 3 && !entry.skipped && !entry.unavailable && !entry.missingComposition
      if (entry.pass3 === 'pass' && !complete) throw new Error('Window claims a pass without complete evidence.')
      if (entry.unavailableReasons != null && (!Array.isArray(entry.unavailableReasons)
        || entry.unavailableReasons.some((reason) => typeof reason !== 'string'))) throw new Error('Invalid window precondition reasons.')
      if (descriptor.readLatency) {
        validateLatencySummary(entry.latency)
        if (entry.latency.status === 'fail' && entry.pass3 === 'pass') throw new Error('Window claims a pass despite a failed latency budget.')
      }
      collected.set(entry.id, { id: entry.id, family: entry.family, locale: entry.locale, attempts: entry.attempts,
        passed: entry.passed, ...(descriptor.readLatency ? { latency: entry.latency } : {}), unavailableReasons: entry.unavailableReasons ?? [], skipped: entry.skipped, unavailable: entry.unavailable, missingComposition: entry.missingComposition, pass3: entry.pass3 })
    }
  }
  return aggregate(expected.map(({ id, family = 'legacy', locale = 'unspecified' }) => collected.get(id)
    ?? { id, family, locale, attempts: 0, passed: 0, skipped: 0, unavailable: 0, missingComposition: 0, pass3: 'incomplete' }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = process.argv.slice(2)
    if (!paths.length) throw new Error('Supply sanitized window summary paths.')
    const summary = mergeReports(paths.map((path) => JSON.parse(readFileSync(path, 'utf8'))))
    process.stdout.write(`${writeReport(summary)}\n`)
    process.exitCode = summary.status === 'pass' ? 0 : 1
  } catch {
    process.stderr.write('Cannot merge Astra windows: check paths, corpus IDs, duplicate cases and evidence counts.\n')
    process.exitCode = 1
  }
}
