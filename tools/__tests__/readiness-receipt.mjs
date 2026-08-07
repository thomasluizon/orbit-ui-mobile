import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import { readReadinessReceipt, readinessReceiptPath, readinessReport, writeReadinessReceipt } from "../lib/readiness-receipt.mjs"

const TOOL = "lib/readiness-receipt.mjs"
const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const BASE_A = "1111111111111111111111111111111111111111"
const BASE_B = "2222222222222222222222222222222222222222"

const ready = () => ({
  repositoryKey: "ui",
  prNumber: 701,
  baseBranch: "main",
  currentBaseSha: BASE_A,
  currentHeadSha: HEAD_A,
  independentReview: { reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD_A, artifactPath: "C:/scratch/review.json", headSha: HEAD_A, baseSha: BASE_A },
  ci: { settled: true, green: true, headSha: HEAD_A, baseSha: BASE_A, checks: [] },
  codexConnector: { passed: true, reviewedCommit: HEAD_A, headSha: HEAD_A, baseSha: BASE_A },
  threads: { unresolvedCount: 0, headSha: HEAD_A, baseSha: BASE_A },
  behindBy: 0,
  draft: false,
  linear: { status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD_A, baseSha: BASE_A },
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

  const visual = { ...receipt, linear: { ...receipt.linear, status: "In Progress", lastPostedState: "visual" } }
  const visualReport = readinessReport(visual)
  T(`${TOOL}: a synchronized visible ticket reaches technical READY while remaining In Progress`, visualReport.verdict === "READY" && visualReport.visualCheckOwed === true, JSON.stringify(visualReport))
  const visualWrongStatus = { ...visual, linear: { ...visual.linear, status: "In Review" } }
  T(`${TOOL}: a visible ticket moved to In Review before acceptance is LINEAR_STALE`, readinessReport(visualWrongStatus).verdicts.includes("LINEAR_STALE"))
}
