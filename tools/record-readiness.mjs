#!/usr/bin/env node
/** Persist and evaluate one final-head readiness receipt from artifacts produced by the harness. */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { bodyEditInvalidationPath, clearBodyEditInvalidation, pendingBodyEditGuards, persistBodyEditInvalidation, readBodyEditInvalidation } from "./lib/body-edit-invalidation.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { withDegradedReviewFirst } from "./lib/pr-body.mjs"
import { readinessCiIsGreen, readinessReport, writeReadinessReceipt } from "./lib/readiness-receipt.mjs"

const LIST_BOT_THREADS = fileURLToPath(new URL("./list-bot-threads.mjs", import.meta.url))

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
let frozenFindingIdsVerified = review.rounds === 1
if (review.rounds === 2) {
  if (typeof review.roundOneArtifactPath !== "string" || typeof review.roundOneArtifactSha256 !== "string") {
    fail("round-two review artifact carries no immutable round-one artifact path and SHA-256")
  }
  let roundOneBytes
  let roundOneReview
  try {
    roundOneBytes = readFileSync(review.roundOneArtifactPath)
    roundOneReview = JSON.parse(roundOneBytes.toString("utf8"))
  } catch (error) {
    fail(`round-one review artifact could not be read: ${error.message}`)
  }
  const actualHash = createHash("sha256").update(roundOneBytes).digest("hex")
  const originalIds = Array.isArray(roundOneReview?.findings)
    ? roundOneReview.findings.filter((finding) => finding?.blocking === true).map((finding) => finding?.id)
    : null
  frozenFindingIdsVerified =
    roundOneReview?.rounds === 1 &&
    actualHash.toLowerCase() === review.roundOneArtifactSha256.toLowerCase() &&
    Array.isArray(originalIds) &&
    JSON.stringify(originalIds) === JSON.stringify(review.frozenFindingIds)
}
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
let liveBot
let liveCiGreen = false
let bodyEditCiInvalidated = false
try {
  const repository = repositorySlug(repoRoot)
  const githubAuth = await githubEnvironment(repoRoot, { timeoutMs: 45000 })
  const result = await runBounded(
    process.env.GH_BIN || "gh",
    ["pr", "view", String(prNumber), "--repo", repository, "--json", "number,baseRefName,baseRefOid,headRefOid,isDraft,body,statusCheckRollup"],
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
    typeof live?.body !== "string" ||
    !Array.isArray(live?.statusCheckRollup)
  ) {
    fail(`gh pr view ${prNumber} did not return the confirmed number/base/head/draft shape`)
  }
  const gitCommon = await runBounded(
    "git",
    ["-C", repoRoot, "rev-parse", "--git-common-dir"],
    { cwd: repoRoot, timeoutMs: 45000 },
  )
  if (gitCommon.timedOut) fail(`git common-directory read for PR ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (gitCommon.error || gitCommon.status !== 0 || !gitCommon.stdout.trim()) {
    const detail = gitCommon.stderr || gitCommon.stdout || gitCommon.error?.message || `exit ${gitCommon.status}`
    fail(`git common-directory read for PR ${prNumber} failed: ${redactSecrets(detail.trim())}`)
  }
  const bodyEditMarkerPath = bodyEditInvalidationPath({ worktree: repoRoot, gitCommonDirectory: gitCommon.stdout.trim(), prNumber })
  const guardsWorkflowRead = await runBounded(
    process.env.GH_BIN || "gh",
    ["run", "list", "--repo", repository, "--workflow", "guards.yml", "--commit", live.headRefOid, "--limit", "100", "--json", "databaseId,createdAt,headSha,status,conclusion"],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
  )
  if (guardsWorkflowRead.timedOut) fail(`Guards workflow inventory for PR ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (guardsWorkflowRead.error || guardsWorkflowRead.status !== 0) {
    const detail = guardsWorkflowRead.stderr || guardsWorkflowRead.stdout || guardsWorkflowRead.error?.message || `exit ${guardsWorkflowRead.status}`
    fail(`Guards workflow inventory for PR ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  let guardsWorkflowRuns
  try {
    guardsWorkflowRuns = JSON.parse(guardsWorkflowRead.stdout)
  } catch {
    fail(`Guards workflow inventory for PR ${prNumber} returned unparseable JSON`)
  }
  let bodyEditMarker
  try {
    bodyEditMarker = readBodyEditInvalidation(bodyEditMarkerPath)
  } catch (error) {
    fail(error.message)
  }
  if (bodyEditMarker && bodyEditMarker.repositoryKey !== null && bodyEditMarker.repositoryKey !== repoKey) {
    fail(`persisted PR-body CI invalidation has an invalid shape: ${bodyEditMarkerPath}`)
  }
  if (bodyEditMarker && (bodyEditMarker.headSha !== live.headRefOid || bodyEditMarker.baseSha !== live.baseRefOid)) {
    clearBodyEditInvalidation(bodyEditMarkerPath)
    bodyEditMarker = null
  }
  if (bodyEditMarker) {
    bodyEditCiInvalidated = pendingBodyEditGuards(bodyEditMarker, guardsWorkflowRuns).length > 0
    if (!bodyEditCiInvalidated) clearBodyEditInvalidation(bodyEditMarkerPath)
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
  const requiredContexts = JSON.parse(requiredRead.stdout)?.contexts
  liveCiGreen = readinessCiIsGreen(live.statusCheckRollup, requiredContexts)

  const botRead = await runBounded(
    process.execPath,
    [LIST_BOT_THREADS, "--pr", String(prNumber), "--repo", repoKey, "--wait-seconds", "0", "--poll-seconds", "1", "--command-timeout-seconds", "45", "--no-request"],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 60000 },
  )
  if (botRead.timedOut) fail(`live connector read for PR ${prNumber} timed out after 60s; the complete child process tree was terminated`)
  if (botRead.error || ![0, 1].includes(botRead.status)) {
    const detail = botRead.stderr || botRead.stdout || botRead.error?.message || `exit ${botRead.status}`
    fail(`live connector read for PR ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  liveBot = JSON.parse(botRead.stdout)
  if (codexOnly) {
    const degradedBody = withDegradedReviewFirst(live.body)
    if (degradedBody !== live.body) {
      persistBodyEditInvalidation({
        path: bodyEditMarkerPath,
        repositoryKey: repoKey,
        prNumber,
        headSha: live.headRefOid,
        baseSha: live.baseRefOid,
        statusCheckRollup: live.statusCheckRollup,
        guardsWorkflowRuns,
      })
      const edited = await runBounded(
        process.env.GH_BIN || "gh",
        ["pr", "edit", String(prNumber), "--repo", repository, "--body-file", "-"],
        { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000, input: degradedBody },
      )
      if (edited.timedOut) fail(`gh pr edit ${prNumber} timed out after 45s; the complete child process tree was terminated`)
      if (edited.error || edited.status !== 0) {
        clearBodyEditInvalidation(bodyEditMarkerPath)
        const detail = edited.stderr || edited.stdout || edited.error?.message || `exit ${edited.status}`
        fail(`could not enforce degraded PR body marker on ${prNumber}: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
      }
      live.body = degradedBody
      bodyEditCiInvalidated = true
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
  const closingPrRead = await runBounded(
    process.env.GH_BIN || "gh",
    ["pr", "view", String(prNumber), "--repo", repository, "--json", "number,baseRefName,baseRefOid,headRefOid,isDraft,body,statusCheckRollup"],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
  )
  if (closingPrRead.timedOut) fail(`closing PR state read for ${prNumber} timed out after 45s; the complete child process tree was terminated`)
  if (closingPrRead.error || closingPrRead.status !== 0) {
    const detail = closingPrRead.stderr || closingPrRead.stdout || closingPrRead.error?.message || `exit ${closingPrRead.status}`
    fail(`closing PR state read for ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  const closingLive = JSON.parse(closingPrRead.stdout)
  if (
    closingLive?.number !== prNumber ||
    closingLive.baseRefOid !== live.baseRefOid ||
    closingLive.headRefOid !== live.headRefOid ||
    closingLive.isDraft !== live.isDraft ||
    closingLive.baseRefName !== live.baseRefName ||
    typeof closingLive.body !== "string" ||
    !Array.isArray(closingLive.statusCheckRollup)
  ) {
    fail(`pull request ${prNumber} changed while readiness was being aggregated; rerun every final-head receipt`)
  }
  const closingBotRead = await runBounded(
    process.execPath,
    [LIST_BOT_THREADS, "--pr", String(prNumber), "--repo", repoKey, "--wait-seconds", "0", "--poll-seconds", "1", "--command-timeout-seconds", "45", "--no-request"],
    { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 60000 },
  )
  if (closingBotRead.timedOut) fail(`closing connector read for PR ${prNumber} timed out after 60s; the complete child process tree was terminated`)
  if (closingBotRead.error || ![0, 1].includes(closingBotRead.status)) {
    const detail = closingBotRead.stderr || closingBotRead.stdout || closingBotRead.error?.message || `exit ${closingBotRead.status}`
    fail(`closing connector read for PR ${prNumber} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  live = closingLive
  liveCiGreen = readinessCiIsGreen(closingLive.statusCheckRollup, requiredContexts)
  liveBot = JSON.parse(closingBotRead.stdout)
} catch (error) {
  fail(`could not revalidate live pull request ${prNumber}: ${redactSecrets(error.message)}`)
}
if (!Number.isInteger(liveComparison?.behind_by) || liveComparison.behind_by < 0) fail(`gh compare for PR ${prNumber} did not return numeric behind_by`)
if (typeof liveLinear?.state?.name !== "string" || typeof liveLinear?.state?.type !== "string" || !Array.isArray(liveLinear?.labels) || liveLinear.labels.some((label) => typeof label?.name !== "string")) {
  fail(`Linear issue ${delivery.issue} did not return the confirmed state name/type and labels shape`)
}

const baseSha = live.baseRefOid
const headSha = live.headRefOid
const liveConnectorPassed =
  liveBot?.verdict === "REVIEWED" &&
  liveBot?.reviewedCommit === headSha &&
  liveBot?.headRefOid === headSha &&
  liveBot?.baseRefOid === baseSha
const botArtifactCurrent = bot.headRefOid === headSha && bot.baseRefOid === baseSha && bot.reviewedCommit === liveBot?.reviewedCommit
const liveUnresolvedThreads = liveBot?.counts?.unresolved ?? null
const receipt = {
  issue: delivery.issue,
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
    frozenFindingIds: review.frozenFindingIds,
    frozenFindingIdsVerified,
    headSha: review.reviewedHeadOid,
    baseSha: review.baseSha,
  },
  ci: { settled: !bodyEditCiInvalidated && ci.pending.length === 0 && liveCiGreen, green: !bodyEditCiInvalidated && ci.pass === true && liveCiGreen, invalidatedByBodyEdit: bodyEditCiInvalidated, checks: ci, headSha: state.headSha, baseSha: state.baseSha },
  codexConnector: { passed: bot.verdict === "REVIEWED" && botArtifactCurrent && liveConnectorPassed, reviewedCommit: liveBot?.reviewedCommit ?? null, headSha: liveBot?.headRefOid ?? null, baseSha: liveBot?.baseRefOid ?? null },
  threads: { complete: bot.threadsComplete === true && liveBot?.threadsComplete === true && botArtifactCurrent, unresolvedCount: liveUnresolvedThreads, headSha: liveBot?.headRefOid ?? null, baseSha: liveBot?.baseRefOid ?? null },
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
