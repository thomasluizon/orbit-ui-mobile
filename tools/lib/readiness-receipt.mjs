/** Mechanical final-head readiness receipts. Evidence is retained, never silently cleared: when
 * head or base moves, readinessVerdicts names exactly which receipt became stale. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { gitDirectoryOf } from "./run-state.mjs"

const safeKey = (value) => String(value).replaceAll(/[^A-Za-z0-9_.-]/g, "-")

export const readinessReceiptPath = (repoRoot, repositoryKey, prNumber) =>
  join(gitDirectoryOf(repoRoot), "orbit-pr-readiness", `${safeKey(repositoryKey)}-${prNumber}.json`)

export const readReadinessReceipt = (repoRoot, repositoryKey, prNumber) => {
  try {
    return JSON.parse(readFileSync(readinessReceiptPath(repoRoot, repositoryKey, prNumber), "utf8"))
  } catch {
    return null
  }
}

export const writeReadinessReceipt = (repoRoot, receipt) => {
  const path = readinessReceiptPath(repoRoot, receipt.repositoryKey, receipt.prNumber)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`)
  return path
}

const currentEvidence = (evidence, receipt) =>
  evidence?.headSha === receipt.currentHeadSha && evidence?.baseSha === receipt.currentBaseSha

const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"])

/** Same newest-rerun-wins CI reading as delivery, for stop-time live revalidation. */
export const readinessCiIsGreen = (rollup, requiredContexts) => {
  if (!Array.isArray(rollup) || !Array.isArray(requiredContexts) || requiredContexts.some((name) => typeof name !== "string" || name === "")) return false
  const newest = new Map()
  for (const node of rollup) {
    const name = node?.name ?? node?.context
    if (typeof name !== "string") return false
    const startedAt = node.startedAt ?? node.createdAt ?? ""
    const previous = newest.get(name)
    if (!previous || String(startedAt) >= String(previous.startedAt ?? previous.createdAt ?? "")) newest.set(name, node)
  }
  if (requiredContexts.some((name) => !newest.has(name))) return false
  for (const node of newest.values()) {
    if (node.__typename === "StatusContext" || typeof node.state === "string") {
      if (node.state !== "SUCCESS") return false
    } else if (node.status !== "COMPLETED" || !PASSING_CONCLUSIONS.has(node.conclusion)) {
      return false
    }
  }
  return true
}

/** All verdicts are reported together, because fixing REVIEW_STALE only to discover CI_STALE on
 * the next run turns a mechanical state machine back into a serial guessing loop. */
export const readinessVerdicts = (receipt) => {
  const verdicts = []
  if (!receipt || typeof receipt !== "object") return ["RECEIPT_MISSING"]
  if (receipt.draft) verdicts.push("DRAFT")
  if (!Number.isInteger(receipt.behindBy) || receipt.behindBy > 0) verdicts.push("OUT_OF_DATE")

  const review = receipt.independentReview
  const blockersClosed = Array.isArray(review?.findings) && review.findings.every(
    (finding) => typeof finding?.blocking === "boolean" && (finding.blocking === false || finding?.status === "CLOSED"),
  )
  if (
    !currentEvidence(review, receipt) ||
    review?.reviewedHeadOid !== receipt.currentHeadSha ||
    review?.verdict !== "CLEAN" ||
    blockersClosed !== true ||
    !Number.isInteger(review?.rounds) ||
    review.rounds < 1 ||
    review.rounds > 2 ||
    review?.reviewerKind !== "independent" ||
    typeof review?.artifactPath !== "string" ||
    review?.rubricBaseOid !== receipt.currentBaseSha ||
    typeof review?.rubricArtifactPath !== "string"
  ) {
    verdicts.push("REVIEW_STALE")
  }

  if (!currentEvidence(receipt.ci, receipt) || receipt.ci?.settled !== true || receipt.ci?.green !== true) {
    verdicts.push("CI_STALE")
  }

  const bot = receipt.codexConnector
  if (!currentEvidence(bot, receipt) || bot?.reviewedCommit !== receipt.currentHeadSha || bot?.passed !== true) {
    verdicts.push("BOT_REVIEW_STALE")
  }

  const threads = receipt.threads
  if (!currentEvidence(threads, receipt)) verdicts.push("THREADS_STALE")
  else if (threads.complete !== true || !Number.isInteger(threads.unresolvedCount) || threads.unresolvedCount > 0) verdicts.push("THREADS_OPEN")

  const linear = receipt.linear
  const expectedPostedState = linear?.visibleEffect === true ? "visual" : "ready"
  const expectedLinearStatus = linear?.visibleEffect === true ? "In Progress" : "In Review"
  if (!currentEvidence(linear, receipt) || linear?.lastSynchronizationResult !== "SUCCESS" || linear?.lastPostedState !== expectedPostedState || linear?.status !== expectedLinearStatus) {
    verdicts.push("LINEAR_STALE")
  }
  return [...new Set(verdicts)]
}

/** Compare a persisted receipt with live state that the stop hook has just read. This is separate
 * from readinessReport because a cached receipt cannot prove that GitHub or Linear stayed still. */
export const readinessReceiptMatchesLive = (receipt, entry, live) =>
  receipt?.repositoryKey === entry?.repositoryKey &&
  receipt?.prNumber === entry?.prNumber &&
  live?.repositoryKey === entry?.repositoryKey &&
  live?.prNumber === entry?.prNumber &&
  live?.baseSha === receipt?.currentBaseSha &&
  live?.headSha === receipt?.currentHeadSha &&
  live?.draft === receipt?.draft &&
  live?.linearIssue === receipt?.issue &&
  live?.linearStatus === receipt?.linear?.status &&
  live?.linearVisibleEffect === receipt?.linear?.visibleEffect &&
  live?.ciGreen === true &&
  live?.connectorPassed === true &&
  live?.threadsComplete === true &&
  live?.unresolvedThreads === 0

export const readinessReport = (receipt) => {
  const verdicts = readinessVerdicts(receipt)
  return {
    verdict: verdicts.length === 0 ? "READY" : verdicts[0],
    verdicts,
    repositoryKey: receipt?.repositoryKey ?? null,
    prNumber: receipt?.prNumber ?? null,
    baseBranch: receipt?.baseBranch ?? null,
    baseSha: receipt?.currentBaseSha ?? null,
    headSha: receipt?.currentHeadSha ?? null,
    behindBy: receipt?.behindBy ?? null,
    draft: receipt?.draft ?? null,
    visualCheckOwed: receipt?.linear?.lastPostedState === "visual",
  }
}
