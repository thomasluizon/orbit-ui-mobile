#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: refresh-tier-labels.mjs

  Read the configured Linear team's labels through Orca and atomically rewrite
  .claude/linear-team-labels.json in canonical form.

  --help, -h  print this usage and exit 0

exit codes:
  0  snapshot refreshed
  2  usage error
  3  config, Linear lookup, or snapshot write error`

const argv = process.argv.slice(2)
if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (argv.length > 0) {
  console.error(`refresh-tier-labels: unknown argument: ${argv[0]}\n`)
  console.error(USAGE)
  process.exit(2)
}

const ORCA =
  process.env.ORCA_BIN ||
  (process.platform === "win32"
    ? "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
    : "orca")
const SNAPSHOT_PATH = fileURLToPath(
  new URL("../.claude/linear-team-labels.json", import.meta.url),
)

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const operationalFailure = (message) => {
  console.error(`refresh-tier-labels ERROR: ${message}`)
  process.exit(3)
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  operationalFailure(error.message)
}
if (
  !isRecord(config) ||
  !isRecord(config.linear) ||
  typeof config.linear.team !== "string" ||
  config.linear.team.trim() === ""
) {
  operationalFailure(".claude/orchestrator.json must declare a non-empty linear.team")
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
if (!isRecord(parsed) || parsed.ok !== true || !Array.isArray(parsed.result?.labels)) {
  operationalFailure(
    `Orca label lookup failed: ${parsed?.error?.message ?? "invalid response envelope"}`,
  )
}

const labels = []
for (const label of parsed.result.labels) {
  const name = typeof label === "string" ? label : label?.name
  if (typeof name !== "string" || name.trim() === "") {
    operationalFailure("Orca label lookup returned a label without a non-empty name")
  }
  labels.push(name)
}
const canonicalLabels = [...new Set(labels)].sort()
if (canonicalLabels.length === 0) {
  operationalFailure("Orca label lookup returned an empty label set")
}

const snapshot = {
  schemaVersion: 1,
  team: config.linear.team,
  capturedAt: new Date().toISOString(),
  labels: canonicalLabels,
}
const temporaryPath = join(
  dirname(SNAPSHOT_PATH),
  `.linear-team-labels.${process.pid}.${Date.now()}.tmp`,
)

let temporaryCreated = false
try {
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  })
  temporaryCreated = true
  renameSync(temporaryPath, SNAPSHOT_PATH)
  temporaryCreated = false
} catch (error) {
  let cleanupError
  if (temporaryCreated) {
    try {
      unlinkSync(temporaryPath)
    } catch (caught) {
      if (caught.code !== "ENOENT") cleanupError = caught
    }
  }
  const cleanupMessage = cleanupError ? `; temporary-file cleanup failed: ${cleanupError.message}` : ""
  operationalFailure(`snapshot could not be written atomically: ${error.message}${cleanupMessage}`)
}

console.log("tier-labels snapshot refreshed")
console.log("snapshot: .claude/linear-team-labels.json")
console.log(`captured at: ${snapshot.capturedAt}`)
console.log(`team labels: ${canonicalLabels.join(", ")}`)
