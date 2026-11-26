#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `usage: record-web-shard-timings.mjs <durations-directory> <run-id> [--output <file>]

  Writes the per-file durations of one CI run to apps/web/vitest/shard-timings.json (or --output).
  The web Vitest shards split their files by these durations. Download the reports first:
  gh run download <run-id> --name web-unit-timings --dir <directory>, then pass <directory>/durations.
  apps/web/vitest/duration-reporter.mjs writes one report for each shard.

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

function collectDurations(durationsDirectory) {
  const durationMsByFile = {}
  const reports = readdirSync(durationsDirectory).filter((name) => /^(chromium|jsdom)-\d+\.json$/.test(name))
  if (!reports.length) throw new Error(`no chromium or jsdom shard reports in ${durationsDirectory}`)
  for (const report of reports.sort()) {
    const { files } = JSON.parse(readFileSync(join(durationsDirectory, report), 'utf8'))
    if (!Array.isArray(files) || !files.length) throw new Error(`${report}: no test file durations`)
    for (const { project, file, milliseconds } of files) {
      if (!['chromium', 'jsdom'].includes(project) || typeof file !== 'string' || !file || !Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new Error(`${report}: invalid test file duration for ${file}`)
      }
      durationMsByFile[project] ??= {}
      if (file in durationMsByFile[project]) throw new Error(`${report}: ${file} ran in two ${project} shards`)
      durationMsByFile[project][file] = Math.round(milliseconds)
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
