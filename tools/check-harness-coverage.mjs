#!/usr/bin/env node
/**
 * The CLI half of the harness coverage ratchet. tools/test-tools.mjs enforces the same
 * comparison inline from its own live tally, which is the enforcement that matters; this exists
 * so the ratchet can be exercised without running the 25 minute suite, and so a deliberate
 * reseed is one recorded command rather than a hand edit of the baseline.
 *
 * A tally is `{ "<tool>": <assertion count> }`, produced by EXECUTING the suite. Never count by
 * regex over the source: a static count cannot see an unreachable `return`, which is precisely
 * how about 60 assertions went missing on this ticket's own PR1 while the harness exited 0.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildBaseline, compareCoverage, formatCoverage, formatDrops, readBaselineShape } from "./lib/harness-coverage.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_BASELINE = join(REPO_ROOT, "tools", "harness-coverage-baseline.json")

const USAGE = `usage: check-harness-coverage.mjs --tally <path> [options]

  Compares an executed per-tool assertion tally with the committed baseline and
  exits non-zero when any tool's count DROPPED, naming the tool and both numbers.
  Growth is free and is printed.

  --tally <path>     JSON object of { "<tool>": <assertion count> } (required)
  --baseline <path>  default: tools/harness-coverage-baseline.json
  --reseed           accept the drops and rewrite the baseline (the coverage:reseed label)
  --json             print the result as machine-readable JSON
  --help, -h         print this usage and exit 0

exit codes: 0 no tool lost coverage (or reseeded), 1 a drop, 2 usage or malformed input`

const fail = (message) => {
  console.error(`check-harness-coverage: ${message}`)
  process.exit(2)
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const argumentList = process.argv.slice(2)
const parsed = { reseed: false, json: false }
for (let index = 0; index < argumentList.length; index++) {
  const argument = argumentList[index]
  if (argument === "--reseed" || argument === "--json") {
    parsed[argument.slice(2)] = true
    continue
  }
  if (argument !== "--tally" && argument !== "--baseline") fail(`unknown argument: ${argument}\n\n${USAGE}`)
  const value = argumentList[++index]
  if (value === undefined || value.startsWith("--")) fail(`${argument} requires a value\n\n${USAGE}`)
  parsed[argument.slice(2)] = value
}

if (!parsed.tally) fail(`--tally <path> is required\n\n${USAGE}`)
const baselinePath = parsed.baseline ?? DEFAULT_BASELINE

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(`could not read ${label} at ${path}: ${error.message}`)
  }
}

const tally = readJson(parsed.tally, "the tally")
if (!tally || typeof tally !== "object" || Array.isArray(tally)) fail("the tally must be an object of tool to assertion count")
const malformed = Object.entries(tally).filter(([, count]) => !Number.isInteger(count) || count < 0)
if (malformed.length > 0) fail(`tally counts must be non-negative integers: ${malformed.map(([tool]) => tool).join(", ")}`)
if (Object.keys(tally).length === 0) fail("the tally is empty, so this comparison would prove nothing")

const baseline = readJson(baselinePath, "the baseline")
const shapeProblem = readBaselineShape(baseline)
if (shapeProblem) fail(`${baselinePath}: ${shapeProblem}`)

const comparison = compareCoverage(baseline, tally)

if (parsed.json) {
  console.log(JSON.stringify({ ...comparison, reseed: parsed.reseed, baselinePath }, null, 2))
} else {
  console.log("harness assertion coverage")
  console.log(formatCoverage(tally, comparison))
  if (comparison.growth.length > 0) {
    console.log(`\n${comparison.growth.length} tool(s) gained coverage; the highest count is what the next baseline records.`)
  }
  if (comparison.drops.length > 0) {
    console.log(`\n${parsed.reseed ? "RESEEDING over" : "COVERAGE DROPPED for"} ${comparison.drops.length} tool(s):`)
    console.log(formatDrops(comparison.drops))
    if (!parsed.reseed) {
      console.log("\nAn assertion that stops running still prints nothing. Restore the cases, or apply the")
      console.log("coverage:reseed label if the loss is deliberate, which reseeds this baseline.")
    }
  }
}

if (parsed.reseed) {
  writeFileSync(baselinePath, `${JSON.stringify(buildBaseline(tally), null, 2)}\n`)
  if (!parsed.json) console.log(`\nbaseline written: ${baselinePath} (${comparison.observedTotal} assertions)`)
  process.exit(0)
}

process.exit(comparison.drops.length > 0 ? 1 : 0)
