import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import { readReadinessReceipt, readinessCiIsGreen, readinessReceiptPath, readinessReport, writeReadinessReceipt } from "../lib/readiness-receipt.mjs"

const TOOL = "lib/readiness-receipt.mjs"
const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const BASE_A = "1111111111111111111111111111111111111111"
const BASE_B = "2222222222222222222222222222222222222222"

const ready = () => ({
  issue: "ORB-701",
  repositoryKey: "ui",
  prNumber: 701,
  baseBranch: "main",
  currentBaseSha: BASE_A,
  currentHeadSha: HEAD_A,
  independentReview: {
    reviewerKind: "independent",
    verdict: "CLEAN",
    rounds: 1,
    reviewedHeadOid: HEAD_A,
    artifactPath: "C:/scratch/review.json",
    rubricSnapshotPath: "C:/scratch/rubric.md",
    frozenFindingIds: [],
    findings: [],
    headSha: HEAD_A,
    baseSha: BASE_A,
  },
  ci: { settled: true, green: true, headSha: HEAD_A, baseSha: BASE_A, checks: [] },
  codexConnector: { passed: true, reviewedCommit: HEAD_A, headSha: HEAD_A, baseSha: BASE_A },
  threads: { complete: true, unresolvedCount: 0, headSha: HEAD_A, baseSha: BASE_A },
  behindBy: 0,
  draft: false,
  ticket: { status: "In Review", targetStatus: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD_A, baseSha: BASE_A },
})

export const cases = () => {
  const fixture = stageRepo("readiness-receipt")
  if (!fixture) {
    T(`${TOOL}: a git fixture is available`, false, "could not stage repository")
    return
  }
  const receipt = ready()
  const path = writeReadinessReceipt(fixture.path, receipt)
  T(`${TOOL}: one receipt is persisted per repository and PR under git state`, existsSync(path) && path === readinessReceiptPath(fixture.path, "ui", 701), path)
  T(`${TOOL}: a simultaneous final-head receipt is READY`, readinessReport(readReadinessReceipt(fixture.path, "ui", 701)).verdict === "READY")
  const selfReviewed = { ...receipt, independentReview: { ...receipt.independentReview, reviewerKind: "self", rounds: 9 } }
  T(`${TOOL}: a self-review or more than two rounds is REVIEW_STALE`, readinessReport(selfReviewed).verdicts.includes("REVIEW_STALE"))
  const openBlocker = { ...receipt, independentReview: { ...receipt.independentReview, findings: [{ id: "F1", blocking: true, status: "OPEN" }] } }
  T(`${TOOL}: a CLEAN string cannot hide an OPEN frozen blocker`, readinessReport(openBlocker).verdicts.includes("REVIEW_STALE"))
  const malformedBlocker = { ...receipt, independentReview: { ...receipt.independentReview, findings: [{ id: "F1", blocking: "false", status: "CLOSED" }] } }
  T(`${TOOL}: a non-boolean blocker flag is REVIEW_STALE`, readinessReport(malformedBlocker).verdicts.includes("REVIEW_STALE"))
  const impossibleRoundOne = { ...receipt, independentReview: { ...receipt.independentReview, findings: [{ id: "F1", blocking: true, status: "CLOSED" }], frozenFindingIds: ["F1"] } }
  T(`${TOOL}: round one cannot claim CLEAN by marking its own blocker closed`, readinessReport(impossibleRoundOne).verdicts.includes("REVIEW_STALE"))
  const droppedRoundTwoBlockers = { ...receipt, independentReview: { ...receipt.independentReview, rounds: 2, findings: [], frozenFindingIds: [] } }
  T(`${TOOL}: round two cannot erase the frozen round-one blocker list`, readinessReport(droppedRoundTwoBlockers).verdicts.includes("REVIEW_STALE"))
  const closedRoundTwo = { ...receipt, independentReview: { ...receipt.independentReview, rounds: 2, frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }] } }
  T(`${TOOL}: round two is clean when every preserved frozen blocker is closed`, readinessReport(closedRoundTwo).verdict === "READY")
  const falselyClosedNewBlocker = { ...receipt, independentReview: { ...closedRoundTwo.independentReview, findings: [...closedRoundTwo.independentReview.findings, { id: "F2", blocking: true, status: "CLOSED" }] } }
  T(`${TOOL}: a newly admitted round-two blocker cannot be marked CLOSED when no fixer round remains`, readinessReport(falselyClosedNewBlocker).verdicts.includes("REVIEW_STALE"))
  const frozenIdWithoutFinding = { ...receipt, independentReview: { ...receipt.independentReview, rounds: 2, frozenFindingIds: ["F1", "F2"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }] } }
  T(`${TOOL}: a frozen id no longer represented by a Blocking finding is REVIEW_STALE`, readinessReport(frozenIdWithoutFinding).verdicts.includes("REVIEW_STALE"))

  /**
   * No rubric fields are required and none is verified: the rubric is single-sourced and its
   * snapshot is recorded as information only. A receipt with no rubricSnapshotPath at all is
   * still READY when the external facts hold; the old per-binding provenance proof staled every
   * in-flight review whenever the canonical rubric advanced (landing #56-59, 2026-08-08).
   */
  const noSnapshotPath = { ...receipt, independentReview: { ...receipt.independentReview, rubricSnapshotPath: undefined } }
  T(`${TOOL}: the rubric snapshot path is information, never a readiness gate`, readinessReport(noSnapshotPath).verdict === "READY", readinessReport(noSnapshotPath).verdicts.join(", "))

  const pushed = { ...receipt, currentHeadSha: HEAD_B }
  const pushedVerdicts = readinessReport(pushed).verdicts
  T(`${TOOL}: review receipt for head A plus branch head B is REVIEW_STALE`, pushedVerdicts.includes("REVIEW_STALE"), pushedVerdicts.join(", "))
  T(`${TOOL}: a later push invalidates CI, connector, and thread receipts`, ["CI_STALE", "BOT_REVIEW_STALE", "THREADS_STALE"].every((entry) => pushedVerdicts.includes(entry)), pushedVerdicts.join(", "))

  const baseAdvanced = { ...receipt, currentBaseSha: BASE_B, behindBy: 1 }
  const baseVerdicts = readinessReport(baseAdvanced).verdicts
  T(`${TOOL}: base advancement invalidates all SHA-bound receipts and is OUT_OF_DATE`, ["OUT_OF_DATE", "REVIEW_STALE", "CI_STALE", "BOT_REVIEW_STALE", "THREADS_STALE", "TICKET_STALE"].every((entry) => baseVerdicts.includes(entry)), baseVerdicts.join(", "))

  const threadsOpen = { ...receipt, threads: { ...receipt.threads, unresolvedCount: 2 } }
  T(`${TOOL}: unresolved threads block readiness explicitly`, readinessReport(threadsOpen).verdicts.includes("THREADS_OPEN"))

  const ticketStale = { ...receipt, ticket: { ...receipt.ticket, lastSynchronizationResult: "FAILED" } }
  T(`${TOOL}: final readiness cannot clear while the ticket is stale`, readinessReport(ticketStale).verdicts.includes("TICKET_STALE"))

  const greenRun = { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z" }
  T(`${TOOL}: readiness CI accepts a complete current green rollup`, readinessCiIsGreen([greenRun], ["Unit Tests"]) === true)
  T(`${TOOL}: readiness CI rejects a missing required context`, readinessCiIsGreen([], ["Unit Tests"]) === false)
  const failedRerun = { ...greenRun, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  T(`${TOOL}: newest failed rerun invalidates same-SHA cached green CI`, readinessCiIsGreen([greenRun, failedRerun], ["Unit Tests"]) === false)
}
