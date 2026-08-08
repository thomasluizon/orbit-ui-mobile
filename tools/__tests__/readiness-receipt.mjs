import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import { readReadinessReceipt, readinessCiIsGreen, readinessReceiptMatchesLive, readinessReceiptPath, readinessReport, writeReadinessReceipt } from "../lib/readiness-receipt.mjs"

const TOOL = "lib/readiness-receipt.mjs"
const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const BASE_A = "1111111111111111111111111111111111111111"
const BASE_B = "2222222222222222222222222222222222222222"
const BLOB_A = "3333333333333333333333333333333333333333"

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
    rubricRepositoryKey: "ui",
    rubricCommitOid: BASE_A,
    rubricBlobOid: BLOB_A,
    rubricArtifactPath: "C:/scratch/rubric.md",
    rubricBinding: "own-base",
    rubricVerified: true,
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
  const openBlocker = { ...receipt, independentReview: { ...receipt.independentReview, findings: [{ id: "F1", blocking: true, status: "OPEN" }] } }
  T(`${TOOL}: a CLEAN string cannot hide an OPEN frozen blocker`, readinessReport(openBlocker).verdicts.includes("REVIEW_STALE"))
  const malformedBlocker = { ...receipt, independentReview: { ...receipt.independentReview, findings: [{ id: "F1", blocking: "false", status: "CLOSED" }] } }
  T(`${TOOL}: a non-boolean blocker flag is REVIEW_STALE`, readinessReport(malformedBlocker).verdicts.includes("REVIEW_STALE"))
  const impossibleRoundOne = { ...receipt, independentReview: { ...receipt.independentReview, findings: [{ id: "F1", blocking: true, status: "CLOSED" }], frozenFindingIds: ["F1"] } }
  T(`${TOOL}: round one cannot claim CLEAN by marking its own blocker closed`, readinessReport(impossibleRoundOne).verdicts.includes("REVIEW_STALE"))
  const droppedRoundTwoBlockers = { ...receipt, independentReview: { ...receipt.independentReview, rounds: 2, findings: [], frozenFindingIds: [] } }
  T(`${TOOL}: round two cannot erase the frozen round-one blocker list`, readinessReport(droppedRoundTwoBlockers).verdicts.includes("REVIEW_STALE"))
  const closedRoundTwo = { ...receipt, independentReview: { ...receipt.independentReview, rounds: 2, frozenFindingIds: ["F1"], frozenFindingIdsVerified: true, findings: [{ id: "F1", blocking: true, status: "CLOSED" }] } }
  T(`${TOOL}: round two is clean when every preserved frozen blocker is closed`, readinessReport(closedRoundTwo).verdict === "READY")
  const falselyClosedNewBlocker = { ...receipt, independentReview: { ...closedRoundTwo.independentReview, findings: [...closedRoundTwo.independentReview.findings, { id: "F2", blocking: true, status: "CLOSED" }] } }
  T(`${TOOL}: a newly admitted round-two blocker cannot be marked CLOSED when no fixer round remains`, readinessReport(falselyClosedNewBlocker).verdicts.includes("REVIEW_STALE"))
  /**
   * Rubric provenance. The receipt must stay falsifiable in BOTH bindings: making a landing pull
   * request mintable may not become a way for any review to skip the rubric check.
   */
  const staleRubric = { ...receipt, independentReview: { ...receipt.independentReview, rubricCommitOid: BASE_B } }
  T(`${TOOL}: an own-base review citing another commit is REVIEW_STALE`, readinessReport(staleRubric).verdicts.includes("REVIEW_STALE"))
  const unverified = { ...receipt, independentReview: { ...receipt.independentReview, rubricVerified: false } }
  T(`${TOOL}: a review whose rubric was not verified with git is REVIEW_STALE`, readinessReport(unverified).verdicts.includes("REVIEW_STALE"))
  const noBinding = { ...receipt, independentReview: { ...receipt.independentReview, rubricBinding: null } }
  T(`${TOOL}: a review naming no rubric binding at all is REVIEW_STALE`, readinessReport(noBinding).verdicts.includes("REVIEW_STALE"))
  const inventedBinding = { ...receipt, independentReview: { ...receipt.independentReview, rubricBinding: "trust-me" } }
  T(`${TOOL}: an unknown rubric binding is REVIEW_STALE, never accepted`, readinessReport(inventedBinding).verdicts.includes("REVIEW_STALE"))
  for (const field of ["rubricRepositoryKey", "rubricCommitOid", "rubricBlobOid", "rubricArtifactPath"]) {
    const missing = { ...receipt, independentReview: { ...receipt.independentReview, [field]: undefined } }
    T(`${TOOL}: a review missing ${field} is REVIEW_STALE`, readinessReport(missing).verdicts.includes("REVIEW_STALE"))
  }
  const shortOid = { ...receipt, independentReview: { ...receipt.independentReview, rubricBlobOid: "abc1234" } }
  T(`${TOOL}: an abbreviated rubric blob oid is REVIEW_STALE`, readinessReport(shortOid).verdicts.includes("REVIEW_STALE"))

  /**
   * THE landing case: orbit-landing-page has no .claude tree at any commit, so a canonical-main
   * binding is the only honest one it can carry, and it must reach READY. Four complete landing
   * pull requests reported REVIEW_STALE on 2026-08-08 because this was impossible.
   */
  const landing = {
    ...receipt,
    repositoryKey: "landing",
    independentReview: { ...receipt.independentReview, rubricBinding: "canonical-main", rubricRepositoryKey: "ui", rubricCommitOid: BASE_B },
  }
  T(`${TOOL}: a canonical-main binding reaches READY even though its commit is not the PR base`, readinessReport(landing).verdict === "READY", readinessReport(landing).verdicts.join(", "))
  const landingUnverified = { ...landing, independentReview: { ...landing.independentReview, rubricVerified: false } }
  T(`${TOOL}: a canonical-main binding still needs its git proof`, readinessReport(landingUnverified).verdicts.includes("REVIEW_STALE"))

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

  const entry = { repositoryKey: "ui", prNumber: 701, receiptPath: path }
  const live = { repositoryKey: "ui", prNumber: 701, baseSha: BASE_A, headSha: HEAD_A, draft: false, linearIssue: "ORB-701", linearStatus: "In Review", ciGreen: true, connectorPassed: true, threadsComplete: true, unresolvedThreads: 0 }
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
