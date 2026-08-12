#!/usr/bin/env node
/**
 * Persist and evaluate one final-head readiness receipt from artifacts produced by the harness.
 *
 * One live read, not two. This tool reads the pull request, its required checks, the compare,
 * and the ticket ONCE, evaluates everything against that snapshot, and writes the receipt. The
 * previous revision read the pull request twice per invocation (an opening read and a closing
 * revalidation) to catch a seconds-wide race; measured 2026-08-09, that doubling was one of the
 * consumers that exhausted the per-user GraphQL budget and stalled the entire run. The race it
 * guarded self-corrects: the readiness loop re-records after every artifact update and always ends
 * by recording, so a receipt is at most minutes old, and the final verifier of live state is
 * Thomas, who tests and merges every pull request by hand.
 *
 * The code review is NOT an axis here. Pullfrog reviews every pull request in GitHub Actions and
 * publishes `pullfrog-approval`, a required status check on both `main` branches, so the review
 * verdict arrives through the required checks this tool already reads. A separate review axis
 * would be a second, weaker copy of a fact branch protection enforces.
 *
 * The pull request read is one `gh api graphql` call because branch protection pins a required
 * check to a producing app and `gh pr view --json statusCheckRollup` drops that identity. Both
 * commands send exactly one GraphQL request, so the budget above is unchanged. See
 * PULL_REQUEST_STATE_QUERY.
 */

import { readFileSync } from "node:fs"

import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { assertRepositoryLabel, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { pullRequestStateArgv, pullRequestStateFromGraphQl, readinessCiIsGreen, readinessReport, requiredChecksOf, writeReadinessReceipt } from "./lib/readiness-receipt.mjs"

const USAGE = `usage: record-readiness.mjs --repo <ui|api|landing> --pr <number> --delivery <file> --ticket <file>

Reads harness-produced artifacts, persists one SHA-bound receipt under the repository git state,
and prints READY or every stale/blocking verdict. It never trusts a caller-authored status flag.

exit codes: 0 READY, 1 not ready, 2 usage or artifact error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (message) => {
  console.error(message)
  process.exit(2)
}
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}
const known = new Set(["--repo", "--pr", "--delivery", "--ticket", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !known.has(value))
if (unknown.length > 0) fail(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const repoKey = argOf("--repo")
const prRaw = argOf("--pr")
const prNumber = Number(prRaw)
const artifactPath = Object.fromEntries(["delivery", "ticket"].map((name) => [name, argOf(`--${name}`)]))
if (
  !repoKey ||
  !Number.isInteger(prNumber) ||
  prNumber < 1 ||
  Object.values(artifactPath).some((value) => !value || value.startsWith("-"))
) fail(USAGE)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(error.message)
}
const repoRoot = config.repos?.[repoKey]
if (typeof repoRoot !== "string") fail(`unknown repository key "${repoKey}"; known: ${Object.keys(config.repos ?? {}).join(", ")}`)

const artifact = {}
for (const [name, path] of Object.entries(artifactPath)) {
  try {
    artifact[name] = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(`${name} artifact ${path} could not be read as JSON: ${error.message}`)
  }
}

const delivery = artifact.delivery
const state = delivery?.checks?.pullRequestState
const upToDate = delivery?.checks?.upToDate
const ci = delivery?.checks?.ci
if (delivery?.checks?.prCount?.number !== prNumber || !state || !upToDate || !ci) fail("delivery artifact does not carry this PR's base, head, compare, and CI evidence")

const ticketSync = artifact.ticket
if (typeof ticketSync?.status !== "string" || typeof ticketSync?.lastSynchronizationResult !== "string") fail("ticket artifact carries no status or synchronization result")
if (ticketSync.issue !== delivery.issue || ticketSync.repositoryKey !== repoKey || ticketSync.prNumber !== prNumber) {
  fail("ticket artifact does not name this delivery issue, repository, and pull request")
}

let live
let liveComparison
let liveTicket
let liveCiGreen = false
try {
  const repository = repositorySlug(repoRoot)
  const githubAuth = await githubEnvironment(repoRoot, { timeoutMs: 45000 })
  const result = await runBounded(
    process.env.GH_BIN || "gh",
    pullRequestStateArgv(repository, prNumber),
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
  )
  if (result.timedOut) fail(`the pull request read for ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
    fail(`the pull request read for ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  live = pullRequestStateFromGraphQl(JSON.parse(result.stdout))
  if (live === null || live.number !== prNumber) {
    fail(`the pull request read for ${prNumber} did not return the confirmed number/base/head/draft/rollup shape`)
  }
  const requiredRead = await runBounded(
    process.env.GH_BIN || "gh",
    ["api", `repos/${repository}/branches/${encodeURIComponent(live.baseRefName)}/protection/required_status_checks`],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
  )
  if (requiredRead.timedOut) fail(`required checks for PR ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (requiredRead.error || requiredRead.status !== 0) {
    const detail = requiredRead.stderr || requiredRead.stdout || requiredRead.error?.message || `exit ${requiredRead.status}`
    fail(`required checks for PR ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  const requiredChecks = requiredChecksOf(JSON.parse(requiredRead.stdout))
  if (requiredChecks === null) fail(`required checks for PR ${prNumber} returned no { context, app_id } checks array`)
  liveCiGreen = readinessCiIsGreen(live.statusCheckRollup, requiredChecks)

  const comparison = await runBounded(
    process.env.GH_BIN || "gh",
    ["api", `repos/${repository}/compare/${live.baseRefOid}...${live.headRefOid}`],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
  )
  if (comparison.timedOut) fail(`gh compare for PR ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (comparison.error || comparison.status !== 0) {
    const detail = comparison.stderr || comparison.stdout || comparison.error?.message || `exit ${comparison.status}`
    fail(`gh compare for PR ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  liveComparison = JSON.parse(comparison.stdout)

  liveTicket = await readTicket(resolveTicket(delivery.issue).number)
  assertRepositoryLabel(liveTicket, repoKey)
} catch (error) {
  fail(`could not revalidate live pull request ${prNumber}: ${redactSecrets(error.message)}`)
}
if (!Number.isInteger(liveComparison?.behind_by) || liveComparison.behind_by < 0) fail(`gh compare for PR ${prNumber} did not return numeric behind_by`)
if (typeof liveTicket?.status !== "string" || !Array.isArray(liveTicket?.labels) || liveTicket.labels.some((label) => typeof label?.name !== "string")) {
  fail(`ticket ${delivery.issue} did not return the confirmed board status and labels shape`)
}

const receipt = {
  issue: delivery.issue,
  repositoryKey: repoKey,
  prNumber,
  baseBranch: live.baseRefName,
  currentBaseSha: live.baseRefOid,
  currentHeadSha: live.headRefOid,
  ci: { settled: ci.pending.length === 0 && liveCiGreen, green: ci.pass === true && liveCiGreen, checks: ci, headSha: state.headSha, baseSha: state.baseSha },
  behindBy: liveComparison.behind_by,
  draft: live.isDraft,
  ticket: {
    status: liveTicket.status,
    targetStatus: config.tickets.states.review,
    state: liveTicket.state,
    stateReason: liveTicket.stateReason,
    lastSynchronizationResult: ticketSync.status === config.tickets.states.review && ticketSync.status === liveTicket.status ? ticketSync.lastSynchronizationResult : "STALE",
    lastPostedState: ticketSync.lastPostedState ?? null,
    headSha: ticketSync.headSha,
    baseSha: ticketSync.baseSha,
  },
}

const receiptPath = writeReadinessReceipt(repoRoot, receipt)
const report = { ...readinessReport(receipt), receiptPath }
console.log(JSON.stringify(report, null, 2))
process.exit(report.verdict === "READY" ? 0 : 1)
