#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { medianDurations } from './shard-timing-runs.mjs'

const usage = `usage: record-vitest-shard-timings.mjs <web|mobile> (<durations-directory> <run-id>)... [--output <file>]

  Writes the times of each test file to apps/<web|mobile>/vitest/shard-timings.json (or --output): the median of the
  given CI runs, because one slow runner moves every file that it ran. The Vitest shards split their files by
  durationMsByFile, and testSpanMsByFile holds the first-test to last-test time that the web file budget limits.
  Download the reports of each run first: gh run download <run-id> --name <web|mobile>-unit-timings --dir <directory>,
  then pass <directory>/durations. packages/shared/vitest/duration-reporter.mjs writes one report for each shard.

exit codes: 0 snapshot written, 1 missing, doubled or invalid reports, 2 invalid arguments`

const argumentsList = process.argv.slice(2)
if (argumentsList.length === 1 && ['--help', '-h'].includes(argumentsList[0])) {
  console.log(usage)
  process.exit(0)
}
const outputAt = argumentsList.indexOf('--output')
const outputValue = outputAt < 0 ? undefined : argumentsList[outputAt + 1]
const [app, ...pairs] = outputAt < 0 ? argumentsList : argumentsList.slice(0, outputAt)
const runs = []
for (let index = 0; index < pairs.length; index += 2) runs.push({ directory: pairs[index], runId: pairs[index + 1] })
const validOutput = outputAt < 0 || (outputValue && argumentsList.length === outputAt + 2)
const validRuns = runs.length > 0 && runs.every(({ directory, runId }) => !directory.startsWith('-') && /^\d+$/.test(runId ?? ''))
if (!['web', 'mobile'].includes(app) || !validOutput || !validRuns) {
  console.error(usage)
  process.exit(2)
}
const output = outputValue
  ? resolve(outputValue)
  : resolve(dirname(fileURLToPath(import.meta.url)), `../../apps/${app}/vitest/shard-timings.json`)

/** The reported files of one run, keyed by project and then by file. */
function collectDurations(durationsDirectory) {
  const byProject = {}
  const reports = readdirSync(durationsDirectory).filter((name) => /^(chromium|jsdom|mobile)-\d+\.json$/.test(name))
  if (!reports.length) throw new Error(`no shard reports in ${durationsDirectory}`)
  for (const report of reports.sort()) {
    const { files } = JSON.parse(readFileSync(join(durationsDirectory, report), 'utf8'))
    if (!Array.isArray(files) || !files.length) throw new Error(`${report}: no test file durations`)
    for (const { project, file, milliseconds, testSpanMilliseconds } of files) {
      if (typeof project !== 'string' || !project || typeof file !== 'string' || !file ||
          ![milliseconds, testSpanMilliseconds].every((value) => Number.isFinite(value) && value >= 0)) {
        throw new Error(`${report}: invalid test file duration for ${file}`)
      }
      byProject[project] ??= {}
      if (file in byProject[project]) throw new Error(`${report}: ${file} ran in two ${project} shards`)
      byProject[project][file] = { milliseconds, testSpanMilliseconds }
    }
  }
  return byProject
}

try {
  const collected = runs.map(({ directory }) => collectDurations(resolve(directory)))
  const projects = [...new Set(collected.flatMap((durations) => Object.keys(durations)))].sort()
  const medians = (field) => Object.fromEntries(projects.map((project) => [project,
    medianDurations(collected.map((files) => Object.fromEntries(Object.entries(files[project] ?? {}).map(([file, times]) => [file, times[field]]))))]))
  const durationMsByFile = medians('milliseconds')
  const testSpanMsByFile = medians('testSpanMilliseconds')
  writeFileSync(output, `${JSON.stringify({ sourceRuns: runs.map(({ runId }) => runId), durationMsByFile, testSpanMsByFile }, null, 2)}\n`)
  const counts = projects.map((project) => `${Object.keys(durationMsByFile[project]).length} ${project}`)
  console.log(`Recorded ${counts.join(' and ')} file durations from ${runs.length} runs`)
} catch (error) {
  console.error(`record-vitest-shard-timings: ${error.message}`)
  process.exit(1)
}
