#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: check-tier-labels.mjs

  Verify that every non-default worker model tier declared in
  .claude/orchestrator.json has its tier:<name> selector in the configured
  Linear team.

  --help, -h  print this usage and exit 0

exit codes:
  0  every declared tier label exists
  1  labels are missing, the team returned no labels, or no tiers are declared
  2  usage error
  3  config or Linear lookup error`

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

const ORCA =
  process.env.ORCA_BIN ||
  "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const formatLabels = (labels) => (labels.length > 0 ? labels.join(", ") : "(none)")

const printInventory = (lookedFor, actual, missing) => {
  console.log(`looked for: ${formatLabels(lookedFor)}`)
  console.log(`team labels: ${formatLabels(actual)}`)
  if (missing !== undefined) console.log(`missing: ${formatLabels(missing)}`)
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
if (!isRecord(config.linear) || typeof config.linear.team !== "string" || config.linear.team.trim() === "") {
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

let raw
try {
  raw = execFileSync(
    ORCA,
    ["linear", "team", "labels", "--team", config.linear.team, "--json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    },
  )
} catch (error) {
  const reason = String(error.stderr || error.stdout || error.message).trim()
  operationalFailure(`Orca label lookup failed: ${reason || "unknown error"}`)
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch (error) {
  operationalFailure(`Orca label lookup returned unparseable JSON: ${error.message}`)
}

if (!isRecord(parsed) || parsed.ok === false) {
  operationalFailure(
    `Orca label lookup failed: ${parsed?.error?.message ?? "invalid response envelope"}`,
  )
}

const labels = parsed.result?.labels
if (!Array.isArray(labels)) {
  operationalFailure("Orca label lookup returned no labels array")
}

const actual = []
for (const label of labels) {
  const name = typeof label === "string" ? label : label?.name
  if (typeof name !== "string" || name.trim() === "") {
    operationalFailure("Orca label lookup returned a label without a non-empty name")
  }
  actual.push(name)
}

const actualLabels = [...new Set(actual)].sort()
const actualSet = new Set(actualLabels)
const missing = lookedFor.filter((label) => !actualSet.has(label))

if (actualLabels.length === 0) {
  console.log("tier-labels FAIL: Linear returned an empty label set")
  printInventory(lookedFor, actualLabels, missing)
  process.exit(1)
}
if (missing.length > 0) {
  console.log("tier-labels FAIL: missing declared tier labels")
  printInventory(lookedFor, actualLabels, missing)
  process.exit(1)
}

console.log("tier-labels PASS")
printInventory(lookedFor, actualLabels)
