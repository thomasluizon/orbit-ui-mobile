#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { listedTests, testKey } from './plan-layout-shards.mjs'
import { medianDurations } from './shard-timing-runs.mjs'

const usage = `usage: record-layout-shard-timings.mjs (<reports-directory> <run-id>)... [--output <file>]

  Writes the duration of each layout test to .github/layout-shard-timings.json (or --output): the median of the given
  CI runs, because one slow runner moves every test that it ran. plan-layout-shards.mjs splits the layout shards by
  these durations. Download the reports of each run first:
  gh run download <run-id> --pattern 'layout-timings-*' --dir <directory>. Each shard uploads one Playwright JSON
  report, layout-report.json.

exit codes: 0 snapshot written, 1 no report, a test in two reports of a run or a test with no result, 2 invalid arguments`

const argumentsList = process.argv.slice(2)
if (argumentsList.length === 1 && ['--help', '-h'].includes(argumentsList[0])) {
  console.log(usage)
  process.exit(0)
}
const outputAt = argumentsList.indexOf('--output')
const outputValue = outputAt < 0 ? undefined : argumentsList[outputAt + 1]
const pairs = outputAt < 0 ? argumentsList : argumentsList.slice(0, outputAt)
const runs = []
for (let index = 0; index < pairs.length; index += 2) runs.push({ directory: pairs[index], runId: pairs[index + 1] })
const validOutput = outputAt < 0 || (outputValue && argumentsList.length === outputAt + 2)
const validRuns = runs.length > 0 && runs.every(({ directory, runId }) => !directory.startsWith('-') && /^\d+$/.test(runId ?? ''))
if (!validOutput || !validRuns) {
  console.error(usage)
  process.exit(2)
}
const output = outputValue ? resolve(outputValue) : resolve(dirname(fileURLToPath(import.meta.url)), '../layout-shard-timings.json')

const reportPaths = (root) => readdirSync(root, { recursive: true }).filter((name) => /(^|[\\/])layout-report\.json$/.test(name)).map((name) => join(root, name))

/** The durations of one run. It keeps the last result of each test, so a retried test records the attempt that ran last. */
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
      durationMsByTest[key] = duration
    }
  }
  return durationMsByTest
}

try {
  const durationMsByTest = medianDurations(runs.map(({ directory }) => collectDurations(resolve(directory))))
  writeFileSync(output, `${JSON.stringify({ sourceRuns: runs.map(({ runId }) => runId), durationMsByTest }, null, 2)}\n`)
  console.log(`Recorded ${Object.keys(durationMsByTest).length} layout test durations from ${runs.length} runs`)
} catch (error) {
  console.error(`record-layout-shard-timings: ${error.message}`)
  process.exit(1)
}
