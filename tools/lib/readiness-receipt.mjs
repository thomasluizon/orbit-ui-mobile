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

const OID = /^[0-9a-f]{40}$/

/**
 * Where the rubric the reviewer actually read came from, and whether that binding is honest.
 *
 * The previous rule was `review.rubricBaseOid === receipt.currentBaseSha`: the rubric must come from
 * the pull request's OWN base commit. That is right for orbit-ui-mobile and orbit-api, which both
 * carry `.claude/skills/pr-review/rubric.md`. It is unsatisfiable for orbit-landing-page, which has
 * no `.claude` tree at HEAD or at any base. A landing pull request could satisfy it only by
 * asserting a base whose commit does not contain the rubric, so the field was refused four times
 * instead of fabricated and landing #56, #57, #58 and #59 all reported REVIEW_STALE while being
 * complete on every other dimension.
 *
 * So the binding is now explicit rather than assumed, and it is falsifiable either way:
 *
 *   own-base        the pull request's repository carries the rubric. Unchanged strength: this
 *                   evaluator re-derives it, so rubricCommitOid must equal the pull request's
 *                   current base. A moved base still goes stale.
 *   canonical-main  the repository carries no rubric, so the review is bound to the CANONICAL
 *                   copy in another repository. record-readiness.mjs proves, with git, that the
 *                   materialized snapshot is byte-identical to the blob at rubricCommitOid and that
 *                   the blob is the one on the canonical repository's current origin/main.
 *
 * This evaluator is pure and runs inside the Stop hook, so it cannot shell out to re-derive the
 * canonical-main case. It checks the shape, re-derives the own-base case itself, and otherwise
 * relies on rubricVerified, which only record-readiness.mjs writes. Stated plainly because a reader
 * must be able to see exactly how far this check reaches.
 */
const rubricBindingValid = (review, receipt) => {
  if (review?.rubricVerified !== true) return false
  if (typeof review?.rubricRepositoryKey !== "string" || review.rubricRepositoryKey === "") return false
  if (typeof review?.rubricArtifactPath !== "string" || review.rubricArtifactPath === "") return false
  if (typeof review?.rubricCommitOid !== "string" || !OID.test(review.rubricCommitOid)) return false
  if (typeof review?.rubricBlobOid !== "string" || !OID.test(review.rubricBlobOid)) return false
  if (review.rubricBinding === "own-base") return review.rubricCommitOid === receipt.currentBaseSha
  return review.rubricBinding === "canonical-main"
}

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
    review?.frozenFindingIdsVerified === true &&
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
    typeof review?.artifactPath !== "string" ||
    !rubricBindingValid(review, receipt)
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
  if (!currentEvidence(linear, receipt) || linear?.lastSynchronizationResult !== "SUCCESS" || linear?.lastPostedState !== "ready" || linear?.status !== "In Review") {
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
  }
}
