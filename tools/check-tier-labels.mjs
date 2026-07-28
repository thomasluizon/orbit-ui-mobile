#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: check-tier-labels.mjs

  Verify that the fresh, committed Linear team-label snapshot contains every
  tier:<name> selector implied by non-default worker model tiers in
  .claude/orchestrator.json.

  --help, -h  print this usage and exit 0

exit codes:
  0  the snapshot is fresh and every declared tier label exists
  1  labels are missing, the snapshot is stale, or no tiers are declared
  2  usage error
  3  config or snapshot error`

const argv = process.argv.slice(2)
if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (argv.length > 0) {
  console.error(`check-tier-labels: unknown argument: ${argv[0]}\n`)
  console.error(USAGE)
  process.exit(2)
}

const SNAPSHOT_URL = new URL("../.claude/linear-team-labels.json", import.meta.url)
const MAX_SNAPSHOT_AGE_MILLISECONDS = 30 * 24 * 60 * 60 * 1000

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const formatLabels = (labels) => (labels.length > 0 ? labels.join(", ") : "(none)")

const printInventory = (lookedFor, snapshotLabels, missing) => {
  console.log(`looked for: ${formatLabels(lookedFor)}`)
  console.log(`snapshot labels: ${formatLabels(snapshotLabels)}`)
  console.log(`missing: ${formatLabels(missing)}`)
}

const operationalFailure = (message) => {
  console.error(`tier-labels ERROR: ${message}`)
  process.exit(3)
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  operationalFailure(error.message)
}

if (!isRecord(config) || !isRecord(config.workers)) {
  operationalFailure(".claude/orchestrator.json must declare a workers object")
}
if (
  !isRecord(config.linear) ||
  typeof config.linear.team !== "string" ||
  config.linear.team.trim() === ""
) {
  operationalFailure(".claude/orchestrator.json must declare a non-empty linear.team")
}

const tierNames = new Set()
for (const [engineName, engine] of Object.entries(config.workers)) {
  if (!isRecord(engine) || !isRecord(engine.models)) {
    operationalFailure(`worker engine "${engineName}" must declare a models object`)
  }
  for (const tierName of Object.keys(engine.models)) {
    if (tierName === "default") continue
    if (tierName.trim() === "") {
      operationalFailure(`worker engine "${engineName}" declares an empty tier name`)
    }
    tierNames.add(tierName)
  }
}

const lookedFor = [...tierNames].map((tierName) => `tier:${tierName}`).sort()
if (lookedFor.length === 0) {
  console.log("tier-labels FAIL: no non-default worker tiers are declared")
  process.exit(1)
}

let snapshot
try {
  snapshot = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8"))
} catch (error) {
  operationalFailure(`.claude/linear-team-labels.json could not be read as JSON: ${error.message}`)
}

const expectedKeys = ["capturedAt", "labels", "schemaVersion", "team"]
if (
  !isRecord(snapshot) ||
  Object.keys(snapshot).sort().join("\n") !== expectedKeys.join("\n") ||
  snapshot.schemaVersion !== 1 ||
  typeof snapshot.team !== "string" ||
  typeof snapshot.capturedAt !== "string" ||
  !Array.isArray(snapshot.labels)
) {
  operationalFailure(
    ".claude/linear-team-labels.json must have exactly schemaVersion 1, team, capturedAt, and labels",
  )
}
if (snapshot.team !== config.linear.team) {
  operationalFailure(
    `.claude/linear-team-labels.json is for team ${JSON.stringify(snapshot.team)}, expected ${JSON.stringify(config.linear.team)}`,
  )
}

const canonicalCapturedAt = new Date(snapshot.capturedAt)
if (
  !Number.isFinite(canonicalCapturedAt.getTime()) ||
  canonicalCapturedAt.toISOString() !== snapshot.capturedAt
) {
  operationalFailure(".claude/linear-team-labels.json capturedAt must be a canonical ISO instant")
}
if (
  snapshot.labels.some((label) => typeof label !== "string" || label.trim() === "") ||
  JSON.stringify(snapshot.labels) !== JSON.stringify([...new Set(snapshot.labels)].sort())
) {
  operationalFailure(
    ".claude/linear-team-labels.json labels must be sorted, unique, non-empty strings",
  )
}

const missing = lookedFor.filter((label) => !snapshot.labels.includes(label))
const ageMilliseconds = Date.now() - canonicalCapturedAt.getTime()
const problems = []
if (ageMilliseconds < 0) {
  problems.push(`snapshot capturedAt is in the future: ${snapshot.capturedAt}`)
} else if (ageMilliseconds >= MAX_SNAPSHOT_AGE_MILLISECONDS) {
  const ageDays = Math.floor(ageMilliseconds / (24 * 60 * 60 * 1000))
  problems.push(`snapshot is ${ageDays} days old; refresh it before 30 days`)
}
if (missing.length > 0) problems.push("declared tier labels are missing from the snapshot")

if (problems.length > 0) {
  console.log("tier-labels FAIL")
  printInventory(lookedFor, snapshot.labels, missing)
  for (const problem of problems) console.log(`problem: ${problem}`)
  process.exit(1)
}

console.log("tier-labels PASS")
printInventory(lookedFor, snapshot.labels, missing)
