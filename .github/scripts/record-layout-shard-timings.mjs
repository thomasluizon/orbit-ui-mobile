#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { listedTests, testKey } from './plan-layout-shards.mjs'

const usage = `usage: record-layout-shard-timings.mjs <reports-directory> <run-id> [--output <file>]

  Writes the duration of each layout test in one CI run to .github/layout-shard-timings.json (or --output).
  plan-layout-shards.mjs splits the layout shards by these durations. Download the reports first:
  gh run download <run-id> --pattern 'layout-timings-*' --dir <directory>. Each shard uploads one
  Playwright JSON report, layout-report.json.

exit codes: 0 snapshot written, 1 no report, a test in two reports or a test with no result, 2 invalid arguments`

const argumentsList = process.argv.slice(2)
if (argumentsList.length === 1 && ['--help', '-h'].includes(argumentsList[0])) {
  console.log(usage)
  process.exit(0)
}
const [directory, runId, outputFlag, outputValue] = argumentsList
const validOutput = argumentsList.length === 2 || (argumentsList.length === 4 && outputFlag === '--output' && outputValue)
if (!validOutput || !directory || directory.startsWith('-') || !/^\d+$/.test(runId ?? '')) {
  console.error(usage)
  process.exit(2)
}
const output = outputValue ? resolve(outputValue) : resolve(dirname(fileURLToPath(import.meta.url)), '../layout-shard-timings.json')

const reportPaths = (root) => readdirSync(root, { recursive: true }).filter((name) => /(^|[\\/])layout-report\.json$/.test(name)).map((name) => join(root, name))

/** Keeps the last result of each test, so a retried test records the attempt that ran last. */
function collectDurations(root) {
  const reports = reportPaths(root)
  if (reports.length === 0) throw new Error(`no layout-report.json under ${root}`)
  const durationMsByTest = {}
  for (const path of reports.sort()) {
    const tests = listedTests(JSON.parse(readFileSync(path, 'utf8')))
    if (tests.length === 0) throw new Error(`${path}: no layout test`)
    for (const test of tests) {
      const key = testKey(test)
      const duration = test.results.at(-1)?.duration
      if (!Number.isFinite(duration)) throw new Error(`${path}: ${key} has no result`)
      if (key in durationMsByTest) throw new Error(`${path}: ${key} ran in two shards`)
      durationMsByTest[key] = Math.round(duration)
    }
  }
  return Object.fromEntries(Object.entries(durationMsByTest).sort(([left], [right]) => left.localeCompare(right)))
}

try {
  const durationMsByTest = collectDurations(resolve(directory))
  writeFileSync(output, `${JSON.stringify({ sourceRun: runId, durationMsByTest }, null, 2)}\n`)
  console.log(`Recorded ${Object.keys(durationMsByTest).length} layout test durations from run ${runId}`)
} catch (error) {
  console.error(`record-layout-shard-timings: ${error.message}`)
  process.exit(1)
}
