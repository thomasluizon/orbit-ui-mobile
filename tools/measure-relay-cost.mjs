#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PRICE_WEIGHTS, buildModel, costPerWorkCall, mergedDelta, parseCalls, percentile, recommendThresholds, splitSession } from "./lib/relay-cost.mjs"

const USAGE = `usage: measure-relay-cost.mjs [--ledger <path>] [--since <ISO date>] [--json]

  Measures the fixed cost of a coordinator relay from the session transcripts that the session
  ledger names, then computes the context threshold with the lowest weighted cost per work call.
  Each assistant call costs input + 1.25 x cache creation + 0.05 x cache read + 5 x output.
  --ledger <path>   session chain ledger; default: orbit-session-chain.json in the git common directory
  --since <ISO>     fit the model on sessions that started at or after this time; default: all
  --json            print the full result as JSON
  --help, -h        print usage and exit 0

exit codes: 0 report printed, 1 ledger unreadable or no usable session, 2 usage error`

const fail = (message, status) => {
  process.stderr.write(`measure-relay-cost: ${message}\n`)
  process.exit(status)
}

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
const options = { ledger: null, since: null, json: false }
for (let index = 0; index < args.length; index++) {
  const flag = args[index]
  if (flag === "--json") options.json = true
  else if (flag === "--ledger" || flag === "--since") {
    const value = args[++index]
    if (!value) fail(`${flag} needs a value\n${USAGE}`, 2)
    options[flag.slice(2)] = value
  } else fail(`unknown argument ${flag}\n${USAGE}`, 2)
}
if (options.since !== null && !Number.isFinite(Date.parse(options.since))) fail(`--since is not a date: ${options.since}`, 2)

const defaultLedger = () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const common = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })
  return join(common.status === 0 ? common.stdout.trim() : join(root, ".git"), "orbit-session-chain.json")
}

const ledgerPath = options.ledger ?? defaultLedger()
let ledger
try { ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) } catch (error) { fail(`ledger ${ledgerPath} is unreadable: ${error.message}`, 1) }

const sessions = []
for (const chain of ledger.chains ?? []) {
  let previousShipped = []
  for (const entry of chain.entries ?? []) {
    const shipped = entry.shipped ?? []
    const merged = mergedDelta(shipped, previousShipped)
    previousShipped = shipped
    if (!entry.transcriptPath || !existsSync(entry.transcriptPath)) continue
    if (options.since !== null && Date.parse(entry.startedAt) < Date.parse(options.since)) continue
    const calls = parseCalls(readFileSync(entry.transcriptPath, "utf8"))
    if (calls.length === 0) continue
    sessions.push({ sessionId: entry.sessionId, startedAt: entry.startedAt, merged, calls: calls.length, split: splitSession(calls, entry.triggeredAt) })
  }
}

const model = buildModel(sessions.map((session) => session.split))
if (model.sessions === 0) fail("no session has an entry, ten work calls and a positive growth", 1)
const recommendation = recommendThresholds(model)
const totalCost = sessions.reduce((sum, { split }) => sum + split.entryCost + split.workCost + split.windDownCost, 0)
const totalMerged = sessions.reduce((sum, session) => sum + session.merged, 0)
const sweep = [200_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000]
  .map((threshold) => ({ threshold, relativeCost: costPerWorkCall(threshold, model) / recommendation.optimum.costPerWorkCall }))
const result = {
  weights: PRICE_WEIGHTS,
  sessions: sessions.length,
  model,
  recommendation: { soft: recommendation.soft, hard: recommendation.hard, optimum: recommendation.optimum.threshold, bandLow: recommendation.optimum.bandLow, bandHigh: recommendation.optimum.bandHigh },
  sweep,
  observed: { weightedCostPerMergedPullRequest: totalMerged > 0 ? totalCost / totalMerged : null, mergedPullRequests: totalMerged, p90PeakContext: percentile(sessions.map((session) => session.split.peakContext), 0.9) },
}

if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  const rounded = Object.fromEntries(Object.entries(model).map(([key, value]) => [key, Math.round(value)]))
  process.stdout.write([
    `sessions read: ${sessions.length}, usable for the model: ${model.sessions}`,
    `model: ${JSON.stringify(rounded)}`,
    `cheapest threshold: ${result.recommendation.optimum} tokens; within 2%: ${result.recommendation.bandLow} to ${result.recommendation.bandHigh}`,
    `recommended soft ${result.recommendation.soft}, hard ${result.recommendation.hard}`,
    ...sweep.map((point) => `  threshold ${point.threshold}: ${point.relativeCost.toFixed(3)} x the minimum cost per work call`),
    `observed: ${totalMerged} merged pull requests, ${result.observed.weightedCostPerMergedPullRequest === null ? "n/a" : Math.round(result.observed.weightedCostPerMergedPullRequest)} weighted cost units per merged pull request`,
    "",
  ].join("\n"))
}
