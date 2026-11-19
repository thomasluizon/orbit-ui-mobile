#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const usage = `usage: plan-layout-shards.mjs --list <file> --timings <file> --shards <n> --out-dir <directory>

  Splits the layout tests into n Playwright --test-list files, shard-1.txt to shard-n.txt, with an equal
  load from the recorded test durations. --list is the JSON report of
  "playwright test --project=layout --list --reporter=json". --timings is .github/layout-shard-timings.json.
  A test with no recorded duration costs the mean duration. The split puts the slowest test first onto the
  lightest shard. Before it writes, it reads each list as Playwright 1.64 reads a --test-list file and fails
  unless every layout test of the report matches exactly one list.

exit codes: 0 lists written, 1 unreadable input or a test in no list or in two lists, 2 invalid arguments`

const PROJECT = 'layout'
const SEPARATOR = ' › '

/** Each layout test of a Playwright JSON report: its file relative to the config rootDir, its title path and its results. */
export function listedTests(report) {
  const tests = []
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.projectName === PROJECT) tests.push({ file: spec.file, titles: [...titles, spec.title], results: test.results ?? [] })
      }
    }
    // Playwright leaves an untitled describe out of a test's title path.
    for (const child of suite.suites ?? []) visit(child, child.title ? [...titles, child.title] : titles)
  }
  for (const fileSuite of report.suites ?? []) visit(fileSuite, [])
  return tests
}

export const testKey = (test) => [test.file, ...test.titles].join(SEPARATOR)
export const testListLine = (test) => [`[${PROJECT}]`, test.file, ...test.titles].join(SEPARATOR)

/** Slowest test first onto the lightest shard. Ties break on the test key and the shard index, so every shard job computes the same split. */
export function partitionTests(tests, durationMsByTest, shardCount) {
  const recorded = tests.map(testKey).filter((key) => Number.isFinite(durationMsByTest[key]))
  const meanMs = recorded.length === 0 ? 1 : recorded.reduce((total, key) => total + durationMsByTest[key], 0) / recorded.length
  const weightOf = (test) => durationMsByTest[testKey(test)] ?? meanMs
  const ordered = [...tests].sort((left, right) => weightOf(right) - weightOf(left) || testKey(left).localeCompare(testKey(right)))
  const shards = Array.from({ length: shardCount }, () => ({ tests: [], loadMs: 0 }))
  for (const test of ordered) {
    const lightest = shards.reduce((best, shard) => (shard.loadMs < best.loadMs ? shard : best))
    lightest.tests.push(test)
    lightest.loadMs += weightOf(test)
  }
  return shards.map((shard) => ({ loadMs: Math.round(shard.loadMs), tests: shard.tests.sort((left, right) => testKey(left).localeCompare(testKey(right))) }))
}

// Reads a list as loadTestList in playwright 1.64.1 lib/runner/index.js does: trimmed tokens, a [project] prefix, a file and a title prefix.
function readTestList(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const delimiter = line.includes('›') ? '›' : '>'
    const tokens = line.split(delimiter).map((token) => token.trim())
    const project = tokens[0].startsWith('[') && tokens[0].endsWith(']') ? tokens.shift().slice(1, -1) : undefined
    const location = /^(.*?):(\d+):?(\d+)?$/.exec(tokens[0])
    return { project, file: location ? location[1] : tokens[0], titles: tokens.slice(1) }
  })
}

const matches = (description, test) => (description.project === undefined || description.project === PROJECT) &&
  description.file === test.file && description.titles.length <= test.titles.length &&
  description.titles.every((title, index) => title === test.titles[index])

/** The keys of every test that no list or more than one list selects. */
export function coverageDefects(tests, listTexts) {
  const lists = listTexts.map(readTestList)
  const defects = []
  for (const test of tests) {
    const count = lists.filter((descriptions) => descriptions.some((description) => matches(description, test))).length
    if (count !== 1) defects.push(`${testKey(test)} matches ${count} lists`)
  }
  return defects
}

function main() {
  let values
  try {
    ({ values } = parseArgs({ options: { list: { type: 'string' }, timings: { type: 'string' }, shards: { type: 'string' }, 'out-dir': { type: 'string' }, help: { type: 'boolean', short: 'h' } } }))
  } catch {
    console.error(usage)
    process.exit(2)
  }
  if (values.help) {
    console.log(usage)
    process.exit(0)
  }
  const shardCount = Number(values.shards)
  if (!values.list || !values.timings || !values['out-dir'] || !Number.isInteger(shardCount) || shardCount < 1) {
    console.error(usage)
    process.exit(2)
  }
  try {
    const tests = listedTests(JSON.parse(readFileSync(values.list, 'utf8')))
    if (tests.length === 0) throw new Error(`${values.list} lists no ${PROJECT} test`)
    const { durationMsByTest } = JSON.parse(readFileSync(values.timings, 'utf8'))
    const shards = partitionTests(tests, durationMsByTest ?? {}, shardCount)
    const listTexts = shards.map((shard) => `${shard.tests.map(testListLine).join('\n')}\n`)
    const defects = coverageDefects(tests, listTexts)
    if (defects.length > 0) throw new Error(`the shard lists do not hold every test exactly once:\n${defects.slice(0, 20).join('\n')}`)
    mkdirSync(values['out-dir'], { recursive: true })
    listTexts.forEach((text, index) => writeFileSync(join(values['out-dir'], `shard-${index + 1}.txt`), text))
    const unrecorded = tests.filter((test) => !Number.isFinite(durationMsByTest?.[testKey(test)])).length
    console.log(`${tests.length} layout tests in ${shardCount} lists (${unrecorded} at the mean duration); recorded seconds per shard: ${shards.map((shard) => Math.round(shard.loadMs / 1000)).join(', ')}`)
  } catch (error) {
    console.error(`plan-layout-shards: ${error.message}`)
    process.exit(1)
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main()
