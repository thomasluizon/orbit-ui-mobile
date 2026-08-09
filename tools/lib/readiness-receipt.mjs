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

/**
 * No rubric binding is verified here. The rubric is single-sourced in orbit-ui-mobile and its
 * snapshot is materialized from ui origin/main ONCE, at review-launch time; the receipt records
 * the snapshot path as information. Verifying "currency" against the rubric repository's CURRENT
 * origin/main at readiness time was tried and it races by construction: a rubric edit merging
 * mid-run staled every in-flight review of every repository (landing #56-59, 2026-08-08). A bar
 * raised after a review launched is a follow-up ticket against the rubric, never a reason to
 * refuse the review. Staleness is judged only against the pull request's own head and base, which
 * is the external fact that matters.
 */

const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"])

/** Same newest-rerun-wins CI reading as delivery, used by record-readiness's live evaluation. */
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
  const findingIds = Array.isArray(review?.findings) ? review.findings.map((finding) => finding?.id) : []
  const findingsValid = Array.isArray(review?.findings) && findingIds.every((id) => typeof id === "string" && id !== "") && new Set(findingIds).size === findingIds.length
  const blockersClosed = findingsValid && review.findings.every(
    (finding) => typeof finding?.blocking === "boolean" && (finding.blocking === false || finding?.status === "CLOSED"),
  )
  const roundOneShapeValid = review?.rounds !== 1 || (
    Array.isArray(review?.frozenFindingIds) &&
    review.frozenFindingIds.length === 0 &&
    review.findings.every((finding) => finding.blocking === false)
  )
  const frozenFindingIdsValid = review?.rounds !== 2 || (
    Array.isArray(review?.frozenFindingIds) &&
    review.frozenFindingIds.length > 0 &&
    review.frozenFindingIds.every((id) => typeof id === "string" && id !== "") &&
    new Set(review.frozenFindingIds).size === review.frozenFindingIds.length &&
    review.frozenFindingIds.every((id) => review.findings.some((finding) => finding.id === id && finding.blocking === true)) &&
    review.findings.every((finding) => finding.blocking !== true || review.frozenFindingIds.includes(finding.id) || finding.status === "OPEN")
  )
  if (
    !currentEvidence(review, receipt) ||
    review?.reviewedHeadOid !== receipt.currentHeadSha ||
    review?.verdict !== "CLEAN" ||
    blockersClosed !== true ||
    roundOneShapeValid !== true ||
    frozenFindingIdsValid !== true ||
    !Number.isInteger(review?.rounds) ||
    review.rounds < 1 ||
    review.rounds > 2 ||
    review?.reviewerKind !== "independent" ||
    typeof review?.artifactPath !== "string"
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

  const ticket = receipt.ticket
  if (!currentEvidence(ticket, receipt) || ticket?.lastSynchronizationResult !== "SUCCESS" || ticket?.lastPostedState !== "ready" || typeof ticket?.targetStatus !== "string" || ticket.targetStatus === "" || ticket?.status !== ticket.targetStatus) {
    verdicts.push("TICKET_STALE")
  }
  return [...new Set(verdicts)]
}

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
  }
}
