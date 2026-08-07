import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import { readReadinessReceipt, readinessCiIsGreen, readinessReceiptMatchesLive, readinessReceiptPath, readinessReport, writeReadinessReceipt } from "../lib/readiness-receipt.mjs"

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
  independentReview: { reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD_A, artifactPath: "C:/scratch/review.json", rubricBaseOid: BASE_A, rubricArtifactPath: "C:/scratch/rubric.md", findings: [], headSha: HEAD_A, baseSha: BASE_A },
  ci: { settled: true, green: true, headSha: HEAD_A, baseSha: BASE_A, checks: [] },
  codexConnector: { passed: true, reviewedCommit: HEAD_A, headSha: HEAD_A, baseSha: BASE_A },
  threads: { complete: true, unresolvedCount: 0, headSha: HEAD_A, baseSha: BASE_A },
  behindBy: 0,
  draft: false,
  linear: { status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", visibleEffect: false, headSha: HEAD_A, baseSha: BASE_A },
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
  const staleRubric = { ...receipt, independentReview: { ...receipt.independentReview, rubricBaseOid: BASE_B } }
  T(`${TOOL}: a rubric snapshot from another base is REVIEW_STALE`, readinessReport(staleRubric).verdicts.includes("REVIEW_STALE"))

  const pushed = { ...receipt, currentHeadSha: HEAD_B }
  const pushedVerdicts = readinessReport(pushed).verdicts
  T(`${TOOL}: review receipt for head A plus branch head B is REVIEW_STALE`, pushedVerdicts.includes("REVIEW_STALE"), pushedVerdicts.join(", "))
  T(`${TOOL}: a later push invalidates CI, connector, and thread receipts`, ["CI_STALE", "BOT_REVIEW_STALE", "THREADS_STALE"].every((entry) => pushedVerdicts.includes(entry)), pushedVerdicts.join(", "))

  const baseAdvanced = { ...receipt, currentBaseSha: BASE_B, behindBy: 1 }
  const baseVerdicts = readinessReport(baseAdvanced).verdicts
  T(`${TOOL}: base advancement invalidates all SHA-bound receipts and is OUT_OF_DATE`, ["OUT_OF_DATE", "REVIEW_STALE", "CI_STALE", "BOT_REVIEW_STALE", "THREADS_STALE", "LINEAR_STALE"].every((entry) => baseVerdicts.includes(entry)), baseVerdicts.join(", "))

  const threadsOpen = { ...receipt, threads: { ...receipt.threads, unresolvedCount: 2 } }
  T(`${TOOL}: unresolved threads block readiness explicitly`, readinessReport(threadsOpen).verdicts.includes("THREADS_OPEN"))

  const linearStale = { ...receipt, linear: { ...receipt.linear, lastSynchronizationResult: "FAILED" } }
  T(`${TOOL}: final readiness cannot clear while Linear is stale`, readinessReport(linearStale).verdicts.includes("LINEAR_STALE"))

  const visual = { ...receipt, linear: { ...receipt.linear, status: "In Progress", lastPostedState: "visual", visibleEffect: true } }
  const visualReport = readinessReport(visual)
  T(`${TOOL}: a synchronized visible ticket reaches technical READY while remaining In Progress`, visualReport.verdict === "READY" && visualReport.visualCheckOwed === true, JSON.stringify(visualReport))
  const visualWrongStatus = { ...visual, linear: { ...visual.linear, status: "In Review" } }
  T(`${TOOL}: a visible ticket moved to In Review before acceptance is LINEAR_STALE`, readinessReport(visualWrongStatus).verdicts.includes("LINEAR_STALE"))

  const entry = { repositoryKey: "ui", prNumber: 701, receiptPath: path }
  const live = { repositoryKey: "ui", prNumber: 701, baseSha: BASE_A, headSha: HEAD_A, draft: false, linearIssue: "ORB-701", linearStatus: "In Review", linearVisibleEffect: false, ciGreen: true, connectorPassed: true, threadsComplete: true, unresolvedThreads: 0 }
  T(`${TOOL}: a READY receipt matches the exact live PR and Linear identity`, readinessReceiptMatchesLive(receipt, entry, live) === true)
  T(`${TOOL}: a later live push invalidates an offline READY receipt`, readinessReceiptMatchesLive(receipt, entry, { ...live, headSha: HEAD_B }) === false)
  T(`${TOOL}: a receipt for another numbered PR cannot satisfy a ledger entry`, readinessReceiptMatchesLive(receipt, { ...entry, prNumber: 700 }, live) === false)
  T(`${TOOL}: live Linear drift invalidates an offline READY receipt`, readinessReceiptMatchesLive(receipt, entry, { ...live, linearStatus: "In Progress" }) === false)
  T(`${TOOL}: a same-SHA failed CI rerun invalidates an offline READY receipt`, readinessReceiptMatchesLive(receipt, entry, { ...live, ciGreen: false }) === false)
  T(`${TOOL}: a dismissed connector review invalidates an offline READY receipt`, readinessReceiptMatchesLive(receipt, entry, { ...live, connectorPassed: false }) === false)
  T(`${TOOL}: a reopened thread invalidates an offline READY receipt`, readinessReceiptMatchesLive(receipt, entry, { ...live, unresolvedThreads: 1 }) === false)

  const greenRun = { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z" }
  T(`${TOOL}: stop-time CI accepts a complete current green rollup`, readinessCiIsGreen([greenRun], ["Unit Tests"]) === true)
  T(`${TOOL}: stop-time CI rejects a missing required context`, readinessCiIsGreen([], ["Unit Tests"]) === false)
  const failedRerun = { ...greenRun, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  T(`${TOOL}: newest failed rerun invalidates same-SHA cached green CI`, readinessCiIsGreen([greenRun, failedRerun], ["Unit Tests"]) === false)
}
