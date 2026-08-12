import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import {
  pullRequestStateArgv,
  pullRequestStateFromGraphQl,
  readReadinessReceipt,
  readinessCiIsGreen,
  readinessReceiptPath,
  readinessReport,
  requiredChecksOf,
  writeReadinessReceipt,
} from "../lib/readiness-receipt.mjs"

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

  /**
   * Every identifier below was read off a live response on 2026-08-12, never assumed. `gh api
   * repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks` returned
   * `{"context":"Unit Tests","app_id":15368}` and `{"context":"pullfrog-approval","app_id":1768019}`,
   * and the GraphQL rollup of pull request 716 returned `pullfrog-approval` as a CheckRun whose
   * `checkSuite.app.databaseId` is 1768019 and `Unit Tests` as one whose app is 15368.
   */
  const GITHUB_ACTIONS_APP = 15368
  const PULLFROG_APP = 1768019
  const requiredUnitTests = { context: "Unit Tests", appId: GITHUB_ACTIONS_APP }
  const requiredApproval = { context: "pullfrog-approval", appId: PULLFROG_APP }
  const greenRun = { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z", appId: GITHUB_ACTIONS_APP }
  T(`${TOOL}: readiness CI accepts a complete current green rollup`, readinessCiIsGreen([greenRun], [requiredUnitTests]) === true)
  T(`${TOOL}: readiness CI rejects a missing required context`, readinessCiIsGreen([], [requiredUnitTests]) === false)
  const failedRerun = { ...greenRun, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  T(`${TOOL}: newest failed rerun invalidates same-SHA cached green CI`, readinessCiIsGreen([greenRun, failedRerun], [requiredUnitTests]) === false)
  /** The old context-only list carried no producer. It must not be readable as a required check. */
  T(`${TOOL}: a bare context-string list is refused rather than read as a required check`, readinessCiIsGreen([greenRun], ["Unit Tests"]) === false)

  /**
   * The review gate, and the whole reason this receipt carries no review axis. Pullfrog publishes
   * `pullfrog-approval` and branch protection requires it, so an unreviewed pull request reaches
   * this function as a required check the rollup does not carry. Absent must read as red, or a
   * pull request no reviewer ever approved would clear readiness.
   */
  const approval = { __typename: "CheckRun", name: "pullfrog-approval", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:30:00Z", appId: PULLFROG_APP }
  T(
    `${TOOL}: an absent pullfrog-approval check is not green, so a missing review blocks readiness`,
    readinessCiIsGreen([greenRun], [requiredUnitTests, requiredApproval]) === false,
  )
  T(
    `${TOOL}: a pending pullfrog-approval check is not green`,
    readinessCiIsGreen([greenRun, { ...approval, status: "IN_PROGRESS", conclusion: null }], [requiredUnitTests, requiredApproval]) === false,
  )
  T(
    `${TOOL}: a SUCCESS pullfrog-approval alongside every other required check is green`,
    readinessCiIsGreen([greenRun, approval], [requiredUnitTests, requiredApproval]) === true,
  )

  /**
   * THE case this pairing exists for. Branch protection pins `pullfrog-approval` to app 1768019, so
   * a SUCCESS of the same name from any other producer leaves the required check unsatisfied.
   * GitHub still refuses the merge, and a receipt that read only the context would say READY.
   */
  const impostor = { ...approval, appId: GITHUB_ACTIONS_APP }
  T(
    `${TOOL}: a SUCCESS pullfrog-approval from the WRONG app leaves readiness blocked`,
    readinessCiIsGreen([greenRun, impostor], [requiredUnitTests, requiredApproval]) === false,
  )
  T(
    `${TOOL}: an impostor cannot displace the pinned producer's own entry`,
    readinessCiIsGreen([greenRun, approval, { ...impostor, startedAt: "2026-08-07T12:00:00Z" }], [requiredUnitTests, requiredApproval]) === true,
  )
  /** A StatusContext carries no producing app, so it can never satisfy a check pinned to one. */
  T(
    `${TOOL}: a StatusContext cannot satisfy a required check pinned to an app`,
    readinessCiIsGreen([greenRun, { __typename: "StatusContext", context: "pullfrog-approval", state: "SUCCESS", createdAt: "2026-08-07T10:30:00Z", appId: null }], [requiredUnitTests, requiredApproval]) === false,
  )
  /** `app_id: null` is GitHub's "any app may provide this check", so any producer satisfies it. */
  const vercel = { __typename: "StatusContext", context: "Vercel", state: "SUCCESS", createdAt: "2026-08-07T10:30:00Z", appId: null }
  T(
    `${TOOL}: a required check with a null app id is satisfied by a producerless StatusContext`,
    readinessCiIsGreen([greenRun, vercel], [requiredUnitTests, { context: "Vercel", appId: null }]) === true,
  )
  T(
    `${TOOL}: a required check with a null app id is satisfied by any app`,
    readinessCiIsGreen([greenRun, approval], [{ context: "pullfrog-approval", appId: null }]) === true,
  )

  /**
   * The protection payload carries BOTH lists. `contexts` erases the producer, so only `checks` can
   * decide, and a payload that carries contexts alone is refused rather than read as unpinned.
   */
  const protection = { contexts: ["Unit Tests", "pullfrog-approval", "Vercel"], checks: [{ context: "Unit Tests", app_id: 15368 }, { context: "pullfrog-approval", app_id: 1768019 }, { context: "Vercel", app_id: null }] }
  T(
    `${TOOL}: branch protection is read from checks[] and keeps every pinned app id`,
    JSON.stringify(requiredChecksOf(protection)) === JSON.stringify([{ context: "Unit Tests", appId: 15368 }, { context: "pullfrog-approval", appId: 1768019 }, { context: "Vercel", appId: null }]),
    JSON.stringify(requiredChecksOf(protection)),
  )
  T(`${TOOL}: a protection payload carrying only contexts is refused`, requiredChecksOf({ contexts: ["Unit Tests"] }) === null)
  T(`${TOOL}: a protection check with a non-integer app id is refused`, requiredChecksOf({ checks: [{ context: "Unit Tests", app_id: "15368" }] }) === null)

  /**
   * The live envelope, copied from the 2026-08-12 response to
   * `gh api graphql` for pull request 716 rather than composed here. `workflowRun` is null on the
   * Pullfrog check run, which is exactly what GitHub returned.
   */
  const liveEnvelope = {
    data: { repository: { pullRequest: {
      number: 716,
      baseRefName: "main",
      baseRefOid: "c733116446eb5eb8b113b7ca992c833feb90e2a2",
      headRefOid: "d9390ad0ce4a7d6b7cb3b2451a28f71693a1406e",
      isDraft: false,
      statusCheckRollup: { contexts: { nodes: [
        { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-12T18:41:32Z", completedAt: "2026-08-12T18:52:40Z", detailsUrl: "https://github.com/thomasluizon/orbit-ui-mobile/actions/runs/31628715299/job/94222367459", checkSuite: { app: { databaseId: 15368 }, workflowRun: { workflow: { name: "PR Tests" } } } },
        { __typename: "CheckRun", name: "pullfrog-approval", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-08-12T18:48:59Z", completedAt: "2026-08-12T18:48:59Z", detailsUrl: "https://github.com/thomasluizon/orbit-ui-mobile/actions/runs/31628719044", checkSuite: { app: { databaseId: 1768019 }, workflowRun: null } },
        { __typename: "StatusContext", context: "Vercel", state: "SUCCESS", createdAt: "2026-08-12T18:38:39Z", targetUrl: "https://vercel.com/thomasluizons-projects/orbit-ui-mobile-web/GexwtKS5GCqc71mTkFugw6Zbnwji" },
      ] } },
    } } },
  }
  const liveState = pullRequestStateFromGraphQl(liveEnvelope)
  T(
    `${TOOL}: the live GraphQL envelope normalizes to one node shape carrying the producing app`,
    liveState?.number === 716 &&
      liveState.headRefOid === "d9390ad0ce4a7d6b7cb3b2451a28f71693a1406e" &&
      liveState.isDraft === false &&
      liveState.statusCheckRollup.length === 3 &&
      liveState.statusCheckRollup[0].appId === 15368 &&
      liveState.statusCheckRollup[0].workflowName === "PR Tests" &&
      liveState.statusCheckRollup[1].appId === 1768019 &&
      liveState.statusCheckRollup[1].workflowName === null &&
      liveState.statusCheckRollup[2].appId === null,
    JSON.stringify(liveState?.statusCheckRollup),
  )
  T(
    `${TOOL}: Pullfrog's own CHANGES_REQUESTED run keeps that pull request out of green`,
    readinessCiIsGreen(liveState.statusCheckRollup, [{ context: "Unit Tests", appId: 15368 }, { context: "pullfrog-approval", appId: 1768019 }]) === false,
  )
  /**
   * A head commit carrying no check at all returns `statusCheckRollup: null`, confirmed on
   * 2026-08-12 against this repository's root commit 1100e15b. That is an empty rollup, not a
   * broken read, and it stays not green while a required check is missing from it.
   */
  const emptyState = pullRequestStateFromGraphQl({ data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, statusCheckRollup: null } } } })
  T(`${TOOL}: a head commit with no check at all reads as an empty rollup`, Array.isArray(emptyState?.statusCheckRollup) && emptyState.statusCheckRollup.length === 0, JSON.stringify(emptyState))
  T(`${TOOL}: an empty rollup is not green while a check is required`, readinessCiIsGreen(emptyState.statusCheckRollup, [requiredApproval]) === false)
  T(`${TOOL}: a response missing the pull request is refused`, pullRequestStateFromGraphQl({ data: { repository: { pullRequest: null } } }) === null)
  T(
    `${TOOL}: a rollup node of an unknown type is refused rather than read as passing`,
    pullRequestStateFromGraphQl({ data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, statusCheckRollup: { contexts: { nodes: [{ __typename: "SomethingNew" }] } } } } } }) === null,
  )

  const argv = pullRequestStateArgv("thomasluizon/orbit-ui-mobile", 716)
  T(
    `${TOOL}: both readers send one GraphQL request naming the owner, repository and number`,
    argv[0] === "api" && argv[1] === "graphql" && argv.includes("owner=thomasluizon") && argv.includes("name=orbit-ui-mobile") && argv.includes("number=716") && argv.at(-1).includes("checkSuite { app { databaseId }"),
    argv.join(" "),
  )
  let rejectedSlug = null
  try {
    pullRequestStateArgv("orbit-ui-mobile", 716)
  } catch (error) {
    rejectedSlug = error.message
  }
  T(`${TOOL}: a repository that is not owner/name is refused`, /is not an owner\/name GitHub repository/.test(rejectedSlug ?? ""), String(rejectedSlug))
}
