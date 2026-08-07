#!/usr/bin/env node
/** Persist and evaluate one final-head readiness receipt from artifacts produced by the harness. */

import { readFileSync } from "node:fs"

import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { withDegradedReviewFirst } from "./lib/pr-body.mjs"
import { readinessReport, writeReadinessReceipt } from "./lib/readiness-receipt.mjs"

const USAGE = `usage: record-readiness.mjs --repo <ui|api|landing> --pr <number> --delivery <file> --review <file> --bot <file> --linear <file> [--codex-only]

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
const known = new Set(["--repo", "--pr", "--delivery", "--review", "--bot", "--linear", "--codex-only", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !known.has(value))
if (unknown.length > 0) fail(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const repoKey = argOf("--repo")
const prRaw = argOf("--pr")
const prNumber = Number(prRaw)
const codexOnly = process.argv.includes("--codex-only")
const artifactPath = Object.fromEntries(["delivery", "review", "bot", "linear"].map((name) => [name, argOf(`--${name}`)]))
if (!repoKey || !Number.isInteger(prNumber) || prNumber < 1 || Object.values(artifactPath).some((value) => !value || value.startsWith("-"))) fail(USAGE)

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

const review = artifact.review?.review ?? artifact.review
if (
  typeof review?.reviewedHeadOid !== "string" ||
  typeof review?.artifactPath !== "string" ||
  typeof review?.rubricBaseOid !== "string" ||
  typeof review?.rubricArtifactPath !== "string" ||
  !Array.isArray(review?.findings)
) fail("review artifact carries no reviewedHeadOid, findings, or frozen-rubric evidence")
const bot = artifact.bot
if (bot?.pr !== prNumber) fail("bot artifact does not name this pull request")
const linear = artifact.linear
if (typeof linear?.status !== "string" || typeof linear?.lastSynchronizationResult !== "string") fail("Linear artifact carries no status or synchronization result")
if (linear.issue !== delivery.issue || linear.repositoryKey !== repoKey || linear.prNumber !== prNumber) {
  fail("Linear artifact does not name this delivery issue, repository, and pull request")
}

let live
let liveComparison
let liveLinear
let bodyMutated = false
try {
  const repository = repositorySlug(repoRoot)
  const githubAuth = await githubEnvironment(repoRoot, { timeoutMs: 45000 })
  const result = await runBounded(
    process.env.GH_BIN || "gh",
    ["pr", "view", String(prNumber), "--repo", repository, "--json", "number,baseRefName,baseRefOid,headRefOid,isDraft,body"],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
  )
  if (result.timedOut) fail(`gh pr view ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
    fail(`gh pr view ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  live = JSON.parse(result.stdout)
  if (
    live?.number !== prNumber ||
    typeof live?.baseRefName !== "string" ||
    typeof live?.baseRefOid !== "string" ||
    typeof live?.headRefOid !== "string" ||
    typeof live?.isDraft !== "boolean" ||
    typeof live?.body !== "string"
  ) {
    fail(`gh pr view ${prNumber} did not return the confirmed number/base/head/draft shape`)
  }
  if (codexOnly) {
    const degradedBody = withDegradedReviewFirst(live.body)
    if (degradedBody !== live.body) {
      const edited = await runBounded(
        process.env.GH_BIN || "gh",
        ["pr", "edit", String(prNumber), "--repo", repository, "--body-file", "-"],
        { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000, input: degradedBody },
      )
      if (edited.timedOut) fail(`gh pr edit ${prNumber} timed out after 45s; the complete child process tree was terminated`)
      if (edited.error || edited.status !== 0) {
        const detail = edited.stderr || edited.stdout || edited.error?.message || `exit ${edited.status}`
        fail(`could not enforce degraded PR body marker on ${prNumber}: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
      }
      live.body = degradedBody
      bodyMutated = true
    }
  }
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

  const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
  const linearRead = await runBounded(
    ORCA,
    ["linear", "issue", delivery.issue, "--full", "--json"],
    { timeoutMs: 45000, maxBuffer: 16 * 1024 * 1024 },
  )
  if (linearRead.timedOut) fail(`Linear issue ${delivery.issue} timed out after 45s; the complete child process tree was terminated`)
  if (linearRead.error || linearRead.status !== 0) {
    const detail = linearRead.stderr || linearRead.stdout || linearRead.error?.message || `exit ${linearRead.status}`
    fail(`Linear issue ${delivery.issue} failed: ${redactSecrets(detail.trim())}`)
  }
  liveLinear = JSON.parse(linearRead.stdout)?.result?.issue
} catch (error) {
  fail(`could not revalidate live pull request ${prNumber}: ${redactSecrets(error.message)}`)
}
if (!Number.isInteger(liveComparison?.behind_by) || liveComparison.behind_by < 0) fail(`gh compare for PR ${prNumber} did not return numeric behind_by`)
if (typeof liveLinear?.state?.name !== "string" || typeof liveLinear?.state?.type !== "string" || !Array.isArray(liveLinear?.labels) || liveLinear.labels.some((label) => typeof label?.name !== "string")) {
  fail(`Linear issue ${delivery.issue} did not return the confirmed state name/type and labels shape`)
}

const baseSha = live.baseRefOid
const headSha = live.headRefOid
const receipt = {
  repositoryKey: repoKey,
  prNumber,
  baseBranch: live.baseRefName,
  currentBaseSha: baseSha,
  currentHeadSha: headSha,
  independentReview: {
    reviewerKind: review.reviewerKind,
    verdict: review.verdict,
    rounds: review.rounds,
    reviewedHeadOid: review.reviewedHeadOid,
    artifactPath: review.artifactPath,
    rubricBaseOid: review.rubricBaseOid,
    rubricArtifactPath: review.rubricArtifactPath,
    findings: review.findings,
    headSha: review.reviewedHeadOid,
    baseSha: review.baseSha,
  },
  ci: { settled: !bodyMutated && ci.pending.length === 0, green: !bodyMutated && ci.pass === true, invalidatedByBodyEdit: bodyMutated, checks: ci, headSha: state.headSha, baseSha: state.baseSha },
  codexConnector: { passed: bot.verdict === "REVIEWED", reviewedCommit: bot.reviewedCommit ?? null, headSha: bot.headRefOid, baseSha: bot.baseRefOid },
  threads: { complete: bot.threadsComplete === true, unresolvedCount: bot.counts?.unresolved ?? bot.threads?.filter((thread) => !thread.isResolved).length ?? null, headSha: bot.headRefOid, baseSha: bot.baseRefOid },
  behindBy: liveComparison.behind_by,
  draft: live.isDraft,
  linear: {
    status: liveLinear.state.name,
    stateType: liveLinear.state.type,
    visibleEffect: liveLinear.labels.some((label) => label.name === "visible-effect"),
    lastSynchronizationResult: linear.status === liveLinear.state.name ? linear.lastSynchronizationResult : "STALE",
    lastPostedState: linear.lastPostedState ?? null,
    headSha: linear.headSha,
    baseSha: linear.baseSha,
  },
}

const receiptPath = writeReadinessReceipt(repoRoot, receipt)
const report = { ...readinessReport(receipt), receiptPath }
console.log(JSON.stringify(report, null, 2))
process.exit(report.verdict === "READY" ? 0 : 1)
