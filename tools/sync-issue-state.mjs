#!/usr/bin/env node
/** Synchronize one issue to the lifecycle state derived by the readiness loop. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { runBounded } from "./lib/bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { addComment, assertRepositoryLabel, readTicket, resolveTicket, setStatus } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { gitDirectoryOf } from "./lib/run-state.mjs"

const USAGE = `usage: sync-issue-state.mjs --issue <ORB-N|#N|N> --repo <ui|api|landing> --pr <number> --state <working|ready|blocked> --head-sha <sha> --base-sha <sha> --message-file <path|->

working, blocked -> In Progress. ready -> In Review. Done is never a target.
The status write is idempotent; a state comment is posted only when its stored signature changes.

--issue MUST be copied from output produced in this run. Before either write, the live ticket is
asserted to carry exactly the repo:<key> label matching --repo, and the live pull request must
reference that ticket in its branch, title, or body.

exit codes: 0 synchronized, 1 ticket write failed,
            2 usage or environment error, or a ticket that is not provably this repository's`

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
const valueFlags = new Set(["--issue", "--repo", "--pr", "--state", "--head-sha", "--base-sha", "--message-file", "--command-timeout-seconds"])
const known = new Set([...valueFlags, "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !known.has(value) && !valueFlags.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issue = argOf("--issue")
const repoKey = argOf("--repo")
const prNumber = Number(argOf("--pr"))
const stateKey = argOf("--state")
const headSha = argOf("--head-sha")
const baseSha = argOf("--base-sha")
const messageFile = argOf("--message-file")
// Bounds the direct pull request read that binds this write to the intended ticket.
const commandTimeoutSeconds = Number(argOf("--command-timeout-seconds") ?? "45")
if (!issue || !repoKey || !Number.isInteger(prNumber) || !["working", "ready", "blocked"].includes(stateKey) || !/^[0-9a-f]{40}$/i.test(headSha ?? "") || !/^[0-9a-f]{40}$/i.test(baseSha ?? "") || !messageFile) fail(2, USAGE)

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
let resolved
let current
try {
  resolved = resolveTicket(issue)
  current = await readTicket(resolved.number)
} catch (error) {
  fail(2, `ticket read failed: ${error.message}`)
}
if (current.state === "CLOSED") fail(1, `${issue} is closed; readiness synchronization never regresses a closed ticket`)

/**
 * THE target assertion, the ticket half of the 2026-08-08 misdirected-write incident. `--issue` is
 * a caller-supplied identifier and this tool writes twice with it: a status change and a comment.
 * An invented or mistyped ticket reference can name live work, so the write lands
 * somewhere real and reads as deliberate.
 *
 * `repo:*` is the mechanical link between a ticket and a repository: tools/plan-queue.mjs admits a
 * ticket only when it carries EXACTLY ONE repo:* label, and derives the target repository from it
 * (plan-queue.mjs:194-212). Asserting the same label here means the ticket and --repo cannot
 * disagree.
 *
 * Fail closed on a MISSING label as well as a wrong one. A ticket with no repo:* label is one
 * plan-queue would have deferred as NO_REPO_LABEL, so writing to it proves nothing about whether it
 * is the right ticket.
 */
try {
  assertRepositoryLabel(current, repoKey)
} catch (error) {
  fail(2, `${issue} ${error.message}. Nothing was written.`)
}

let githubAuth
let expectedSlug
try {
  expectedSlug = repositorySlug(repoRoot)
  githubAuth = await githubEnvironment(repoRoot, { timeoutMs: commandTimeoutSeconds * 1000 })
} catch (error) {
  fail(2, `pull request target could not be resolved: ${redactSecrets(error.message)}`)
}

const GH = process.env.GH_BIN || "gh"
const pullRequestRead = await runBounded(
  GH,
  ["pr", "view", String(prNumber), "--repo", expectedSlug, "--json", "number,headRefName,title,body"],
  { cwd: repoRoot, env: githubAuth.environment, timeoutMs: commandTimeoutSeconds * 1000, maxBuffer: 8 * 1024 * 1024 },
)
if (pullRequestRead.timedOut) fail(2, `GitHub pull request read timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated`)
if (pullRequestRead.overflowed) fail(2, "GitHub pull request read exceeded the 8 MiB output bound; the complete child process tree was terminated")
if (pullRequestRead.error || pullRequestRead.status !== 0) {
  const detail = pullRequestRead.stderr || pullRequestRead.stdout || pullRequestRead.error?.message || `exit ${pullRequestRead.status}`
  fail(2, `GitHub pull request read failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
}

let pullRequest
try {
  pullRequest = JSON.parse(pullRequestRead.stdout)
} catch {
  fail(2, "GitHub pull request read returned unparseable JSON")
}
if (
  !Number.isInteger(pullRequest?.number) ||
  typeof pullRequest?.headRefName !== "string" ||
  typeof pullRequest?.title !== "string" ||
  typeof pullRequest?.body !== "string"
) {
  fail(2, `GitHub pull request ${prNumber} returned no number, headRefName, title, or body. Nothing was written`)
}
if (pullRequest.number !== prNumber) fail(2, `GitHub returned pull request ${pullRequest.number}, not ${prNumber}. Nothing was written`)

const issueReference = new RegExp(`(?:^|[^A-Z0-9])${issue}(?:$|[^A-Z0-9])`, "i")
if (![pullRequest.headRefName, pullRequest.title, pullRequest.body].some((value) => issueReference.test(value))) {
  fail(2, `Pull request ${expectedSlug}#${prNumber} does not reference ${issue} in its branch, title, or body. Nothing was written`)
}

const targetStatus = stateKey === "ready" ? config.tickets.states.review : config.tickets.states.working
if (targetStatus === config.tickets.states.done) fail(2, "the readiness loop never targets Done before merge")

if (current.status !== targetStatus) {
  try {
    await setStatus(resolved.number, targetStatus)
  } catch (error) {
    fail(1, `ticket status synchronization failed: ${error.message}`)
  }
}

const statePath = join(gitDirectoryOf(repoRoot), "orbit-ticket-sync", `${resolved.identifier ?? resolved.number}.json`)
let previous = null
try {
  previous = JSON.parse(readFileSync(statePath, "utf8"))
} catch {
  previous = null
}
const signature = JSON.stringify({ stateKey, targetStatus, headSha, baseSha, message })
let commentPosted = false
if (previous?.signature !== signature) {
  try {
    await addComment(resolved.number, message)
  } catch (error) {
    fail(1, `ticket state comment failed: ${error.message}`)
  }
  commentPosted = true
}

const artifact = {
  issue,
  repositoryKey: repoKey,
  prNumber,
  status: targetStatus,
  lastSynchronizationResult: "SUCCESS",
  lastPostedState: stateKey,
  headSha,
  baseSha,
  commentPosted,
  signature,
}
mkdirSync(dirname(statePath), { recursive: true })
writeFileSync(statePath, `${JSON.stringify(artifact, null, 2)}\n`)
console.log(JSON.stringify(artifact, null, 2))
