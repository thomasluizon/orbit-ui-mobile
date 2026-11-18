#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `usage: record-web-shard-timings.mjs <timings-directory> <run-id> [--output <file>]

  Writes the per-file durations of one CI run to apps/web/vitest/shard-timings.json (or --output).
  The web Vitest shards split their files by these durations. Download the reports first:
  gh run download <run-id> --name web-unit-timings --dir <directory>, then pass <directory>/timings.

exit codes: 0 snapshot written, 1 missing, doubled or invalid reports, 2 invalid arguments`

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
const output = outputValue
  ? resolve(outputValue)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web/vitest/shard-timings.json')

function sortedByKey(entries) {
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)))
}

function collectDurations(timingsDirectory) {
  const durationMsByFile = {}
  const reports = readdirSync(timingsDirectory).filter((name) => /^(chromium|jsdom)-\d+\.json$/.test(name))
  if (!reports.length) throw new Error(`no chromium or jsdom shard reports in ${timingsDirectory}`)
  for (const report of reports.sort()) {
    const project = report.slice(0, report.indexOf('-'))
    const { testResults } = JSON.parse(readFileSync(join(timingsDirectory, report), 'utf8'))
    if (!Array.isArray(testResults) || !testResults.length) throw new Error(`${report}: no test file timings`)
    durationMsByFile[project] ??= {}
    for (const { name, startTime, endTime } of testResults) {
      const marker = typeof name === 'string' ? name.lastIndexOf('/apps/web/') : -1
      if (marker < 0 || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
        throw new Error(`${report}: invalid test file timing for ${name}`)
      }
      const file = name.slice(marker + '/apps/web/'.length)
      if (file in durationMsByFile[project]) throw new Error(`${report}: ${file} ran in two ${project} shards`)
      durationMsByFile[project][file] = Math.round(endTime - startTime)
    }
  }
  return sortedByKey(Object.entries(durationMsByFile).map(([project, files]) => [project, sortedByKey(Object.entries(files))]))
}

try {
  const durationMsByFile = collectDurations(resolve(directory))
  writeFileSync(output, `${JSON.stringify({ sourceRun: runId, durationMsByFile }, null, 2)}\n`)
  const counts = Object.entries(durationMsByFile).map(([project, files]) => `${Object.keys(files).length} ${project}`)
  console.log(`Recorded ${counts.join(' and ')} file durations from run ${runId}`)
} catch (error) {
  console.error(`record-web-shard-timings: ${error.message}`)
  process.exit(1)
}
