import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import { readReadinessReceipt, readinessCiIsGreen, readinessReceiptPath, readinessReport, writeReadinessReceipt } from "../lib/readiness-receipt.mjs"

const TOOL = "lib/readiness-receipt.mjs"
const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const BASE_A = "1111111111111111111111111111111111111111"
const BASE_B = "2222222222222222222222222222222222222222"

/**
 * The receipt carries exactly four axes: draft, behindBy, ci and ticket. Pullfrog reviews every
 * pull request in GitHub Actions and publishes `pullfrog-approval`, which is a required status
 * check on both `main` branches, so the review verdict arrives inside the CI axis through
 * readinessCiIsGreen's required contexts.
 */
const ready = () => ({
  issue: "ORB-701",
  repositoryKey: "ui",
  prNumber: 701,
  baseBranch: "main",
  currentBaseSha: BASE_A,
  currentHeadSha: HEAD_A,
  ci: { settled: true, green: true, headSha: HEAD_A, baseSha: BASE_A, checks: [] },
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
  T(`${TOOL}: a checkout with no receipt at all is RECEIPT_MISSING`, readinessReport(readReadinessReceipt(fixture.path, "ui", 999)).verdict === "RECEIPT_MISSING")

  const draft = { ...receipt, draft: true }
  T(`${TOOL}: a draft pull request is DRAFT`, readinessReport(draft).verdicts.includes("DRAFT"), readinessReport(draft).verdicts.join(", "))

  const unsettled = { ...receipt, ci: { ...receipt.ci, settled: false } }
  T(`${TOOL}: CI that has not settled is CI_STALE`, readinessReport(unsettled).verdicts.includes("CI_STALE"), readinessReport(unsettled).verdicts.join(", "))
  const red = { ...receipt, ci: { ...receipt.ci, green: false } }
  T(`${TOOL}: settled but red CI is CI_STALE`, readinessReport(red).verdicts.includes("CI_STALE"), readinessReport(red).verdicts.join(", "))

  const pushed = { ...receipt, currentHeadSha: HEAD_B }
  const pushedVerdicts = readinessReport(pushed).verdicts
  T(`${TOOL}: a later push invalidates the CI and ticket receipts`, ["CI_STALE", "TICKET_STALE"].every((entry) => pushedVerdicts.includes(entry)), pushedVerdicts.join(", "))

  const baseAdvanced = { ...receipt, currentBaseSha: BASE_B, behindBy: 1 }
  const baseVerdicts = readinessReport(baseAdvanced).verdicts
  T(`${TOOL}: base advancement invalidates all SHA-bound receipts and is OUT_OF_DATE`, ["OUT_OF_DATE", "CI_STALE", "TICKET_STALE"].every((entry) => baseVerdicts.includes(entry)), baseVerdicts.join(", "))

  const ticketStale = { ...receipt, ticket: { ...receipt.ticket, lastSynchronizationResult: "FAILED" } }
  T(`${TOOL}: final readiness cannot clear while the ticket is stale`, readinessReport(ticketStale).verdicts.includes("TICKET_STALE"))
  const ticketOffTarget = { ...receipt, ticket: { ...receipt.ticket, status: "In Progress" } }
  T(`${TOOL}: a board status away from the target status is TICKET_STALE`, readinessReport(ticketOffTarget).verdicts.includes("TICKET_STALE"))

  const greenRun = { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z" }
  T(`${TOOL}: readiness CI accepts a complete current green rollup`, readinessCiIsGreen([greenRun], ["Unit Tests"]) === true)
  T(`${TOOL}: readiness CI rejects a missing required context`, readinessCiIsGreen([], ["Unit Tests"]) === false)
  const failedRerun = { ...greenRun, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  T(`${TOOL}: newest failed rerun invalidates same-SHA cached green CI`, readinessCiIsGreen([greenRun, failedRerun], ["Unit Tests"]) === false)

  /**
   * The review gate, and the whole reason this receipt carries no review axis. Pullfrog publishes
   * `pullfrog-approval` and branch protection requires it, so an unreviewed pull request reaches
   * this function as a required context the rollup does not carry. Absent must read as red, or a
   * pull request no reviewer ever approved would clear readiness.
   */
  const approval = { __typename: "StatusContext", context: "pullfrog-approval", state: "SUCCESS", createdAt: "2026-08-07T10:30:00Z" }
  T(
    `${TOOL}: an absent pullfrog-approval context is not green, so a missing review blocks readiness`,
    readinessCiIsGreen([greenRun], ["Unit Tests", "pullfrog-approval"]) === false,
  )
  T(
    `${TOOL}: a pending pullfrog-approval context is not green`,
    readinessCiIsGreen([greenRun, { ...approval, state: "PENDING" }], ["Unit Tests", "pullfrog-approval"]) === false,
  )
  T(
    `${TOOL}: a SUCCESS pullfrog-approval alongside every other required context is green`,
    readinessCiIsGreen([greenRun, approval], ["Unit Tests", "pullfrog-approval"]) === true,
  )
}
