#!/usr/bin/env node
/** Synchronize one issue to the lifecycle state derived by the readiness loop. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { gitDirectoryOf } from "./lib/run-state.mjs"

const USAGE = `usage: sync-linear-state.mjs --issue ORB-N --repo <ui|api|landing> --pr <number> --state <working|ready|visual|blocked> --head-sha <sha> --base-sha <sha> --message-file <path|-> [--command-timeout-seconds <s>]

working, visual, blocked -> In Progress. ready -> In Review unless the live ticket carries
visible-effect, which mechanically remains In Progress. Done is never a target.
The status write is idempotent; a state comment is posted only when its stored signature changes.

exit codes: 0 synchronized, 1 Linear write failed, 2 usage or environment error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}
const known = new Set(["--issue", "--repo", "--pr", "--state", "--head-sha", "--base-sha", "--message-file", "--command-timeout-seconds", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !known.has(value))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issue = argOf("--issue")
const repoKey = argOf("--repo")
const prNumber = Number(argOf("--pr"))
const stateKey = argOf("--state")
const headSha = argOf("--head-sha")
const baseSha = argOf("--base-sha")
const messageFile = argOf("--message-file")
const commandTimeoutSeconds = Number(argOf("--command-timeout-seconds") ?? "45")
if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "") || !repoKey || !Number.isInteger(prNumber) || !["working", "ready", "visual", "blocked"].includes(stateKey) || !/^[0-9a-f]{40}$/i.test(headSha ?? "") || !/^[0-9a-f]{40}$/i.test(baseSha ?? "") || !messageFile) fail(2, USAGE)
if (!Number.isFinite(commandTimeoutSeconds) || commandTimeoutSeconds <= 0) fail(2, "--command-timeout-seconds requires a positive number")

let message
try {
  message = messageFile === "-" ? readFileSync(0, "utf8") : readFileSync(messageFile, "utf8")
} catch (error) {
  fail(2, `message could not be read: ${error.message}`)
}
message = message.trim()
if (!message) fail(2, "message must not be empty")

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const repoRoot = config.repos?.[repoKey]
if (typeof repoRoot !== "string") fail(2, `unknown repository key "${repoKey}"; known: ${Object.keys(config.repos ?? {}).join(", ")}`)
const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const invoke = async (args, input) => {
  const result = await runBounded(ORCA, args, { timeoutMs: commandTimeoutSeconds * 1000, maxBuffer: 16 * 1024 * 1024, input })
  if (result.timedOut) return { ok: false, error: `Orca command timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated` }
  if (result.overflowed) return { ok: false, error: "Orca command exceeded the 16 MiB output bound; the complete child process tree was terminated" }
  if (result.error || result.status !== 0) return { ok: false, error: (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim() }
  return { ok: true, stdout: result.stdout }
}

// --full is the exact live response shape evidenced in the PR body. Do not silently switch this to
// the smaller default envelope without first recording that complete shape.
const read = await invoke(["linear", "issue", issue, "--full", "--json"])
if (!read.ok) fail(2, `Linear issue read failed: ${read.error}`)
let current
try {
  current = JSON.parse(read.stdout)?.result?.issue
} catch {
  fail(2, "Linear issue read returned unparseable JSON")
}
if (typeof current?.state?.name !== "string" || typeof current?.state?.type !== "string" || !Array.isArray(current?.labels) || current.labels.some((label) => typeof label?.name !== "string")) fail(2, "Linear issue read carried no state name/type or labels array")
if (["completed", "canceled", "duplicate"].includes(current.state.type)) fail(1, `${issue} is ${current.state.name}; readiness synchronization never regresses a closed issue`)
const visibleEffect = current.labels.some((label) => label.name === "visible-effect")
const effectiveStateKey = stateKey === "ready" && visibleEffect ? "visual" : stateKey
const targetStatus = effectiveStateKey === "ready" ? config.linear.states.review : config.linear.states.working
if (targetStatus === config.linear.states.done) fail(2, "the readiness loop never targets Done before merge")

if (current.state.name !== targetStatus) {
  const moved = await invoke(["linear", "status", "set", issue, "--to", targetStatus, "--json"])
  if (!moved.ok) fail(1, `Linear status synchronization failed: ${moved.error}`)
}

const statePath = join(gitDirectoryOf(repoRoot), "orbit-linear-sync", `${issue}.json`)
let previous = null
try {
  previous = JSON.parse(readFileSync(statePath, "utf8"))
} catch {
  previous = null
}
const signature = JSON.stringify({ stateKey: effectiveStateKey, targetStatus, headSha, baseSha, message })
let commentPosted = false
if (previous?.signature !== signature) {
  const posted = await invoke(["linear", "comment", "add", issue, "--body-file", "-", "--json"], message)
  if (!posted.ok) fail(1, `Linear state comment failed: ${posted.error}`)
  commentPosted = true
}

const artifact = {
  issue,
  repositoryKey: repoKey,
  prNumber,
  status: targetStatus,
  lastSynchronizationResult: "SUCCESS",
  lastPostedState: effectiveStateKey,
  headSha,
  baseSha,
  commentPosted,
  signature,
}
mkdirSync(dirname(statePath), { recursive: true })
writeFileSync(statePath, `${JSON.stringify(artifact, null, 2)}\n`)
console.log(JSON.stringify(artifact, null, 2))
