#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import { closeSync, openSync, readFileSync, writeSync } from "node:fs"
import { isAbsolute } from "node:path"

const REPORT_MARKER = "WORKER_REPORT:"
const GATE_RESULTS = new Set(["passed", "failed", "not-run"])
const FALLBACK_BLOCKER = "missing or malformed WORKER_REPORT marker"

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

const fail = (message) => {
  process.stderr.write(`worker report hook: ${message}\n`)
  process.exit(1)
}

const reportsFile = valueAfter("--reports-file")
const ticket = valueAfter("--ticket")

if (!reportsFile || !isAbsolute(reportsFile)) fail("--reports-file must be an absolute path")
if (!/^ORB-\d+$/.test(ticket ?? "")) fail("--ticket must be a Linear identifier such as ORB-136")

const hookInput = (() => {
  try {
    return JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return {}
  }
})()

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const declaredReport = (() => {
  if (typeof hookInput.last_assistant_message !== "string") return null
  const markerLine = hookInput.last_assistant_message
    .split(/\r?\n/)
    .filter((line) => line.startsWith(REPORT_MARKER))
    .at(-1)
  if (!markerLine) return null

  try {
    const parsed = JSON.parse(markerLine.slice(REPORT_MARKER.length).trim())
    if (!isRecord(parsed) || !isRecord(parsed.gates)) return null
    if (!Object.values(parsed.gates).every((result) => GATE_RESULTS.has(result))) return null
    if (!Array.isArray(parsed.contractItems) || !parsed.contractItems.every((item) => typeof item === "string")) return null
    if (parsed.blockedOn !== null && typeof parsed.blockedOn !== "string") return null
    if (typeof parsed.needsHuman !== "boolean") return null
    return parsed
  } catch {
    return null
  }
})()

const worktree = typeof hookInput.cwd === "string" ? hookInput.cwd : process.cwd()

const gitOutput = (args) => {
  try {
    return execFileSync("git", ["-C", worktree, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

const headSha = gitOutput(["rev-parse", "--verify", "HEAD"])
const upstream = gitOutput(["rev-parse", "--symbolic-full-name", "@{upstream}"])
const pushed =
  Boolean(headSha && upstream?.startsWith("refs/remotes/")) &&
  spawnSync("git", ["-C", worktree, "merge-base", "--is-ancestor", headSha, upstream], {
    stdio: "ignore",
  }).status === 0

const record = {
  reportedAt: new Date().toISOString(),
  ticket,
  headSha,
  pushed,
  gates: declaredReport?.gates ?? {},
  contractItems: declaredReport?.contractItems ?? [],
  blockedOn: declaredReport ? declaredReport.blockedOn : FALLBACK_BLOCKER,
  needsHuman: declaredReport?.needsHuman ?? true,
}

const line = Buffer.from(`${JSON.stringify(record)}\n`, "utf8")
let handle
try {
  handle = openSync(reportsFile, "a")
  const written = writeSync(handle, line)
  if (written !== line.length) throw new Error(`wrote ${written} of ${line.length} bytes`)
} catch (error) {
  fail(`could not append ${reportsFile}: ${error.message}`)
} finally {
  if (handle !== undefined) closeSync(handle)
}
