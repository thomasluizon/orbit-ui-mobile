import { existsSync } from "node:fs"

import { T, stageRepo } from "./_harness.mjs"
import {
  REVIEW_APP_AUTHOR_FILTER,
  REVIEW_APP_CONTEXT,
  newestChecks,
  outOfBandKey,
  pullRequestStateArgv,
  pullRequestStateFromGraphQl,
  readReadinessReceipt,
  readinessCiIsGreen,
  readinessReceiptPath,
  readinessReport,
  requiredCheckSatisfied,
  requiredChecksOf,
  reviewAppVerdictAtHead,
  reviewSatisfiedOutOfBand,
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
 * readinessCiIsGreen's required contexts. When that check is absent the same verdict is read from
 * the review it publishes instead (#440), which is what `reviewAppVerdictAtHead` resolves.
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
      reviews: { nodes: [
        { state: "COMMENTED", submittedAt: "2026-08-12T18:48:04Z", author: { __typename: "Bot", login: "pullfrog" }, commit: { oid: "d9390ad0ce4a7d6b7cb3b2451a28f71693a1406e" } },
        { state: "CHANGES_REQUESTED", submittedAt: "2026-08-12T18:48:59Z", author: { __typename: "Bot", login: "pullfrog" }, commit: { oid: "d9390ad0ce4a7d6b7cb3b2451a28f71693a1406e" } },
      ] },
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
  const emptyState = pullRequestStateFromGraphQl({ data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [] }, statusCheckRollup: null } } } })
  T(`${TOOL}: a head commit with no check at all reads as an empty rollup`, Array.isArray(emptyState?.statusCheckRollup) && emptyState.statusCheckRollup.length === 0, JSON.stringify(emptyState))
  T(`${TOOL}: an empty rollup is not green while a check is required`, readinessCiIsGreen(emptyState.statusCheckRollup, [requiredApproval]) === false)
  T(`${TOOL}: a response missing the pull request is refused`, pullRequestStateFromGraphQl({ data: { repository: { pullRequest: null } } }) === null)
  T(
    `${TOOL}: a rollup node of an unknown type is refused rather than read as passing`,
    pullRequestStateFromGraphQl({ data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [] }, statusCheckRollup: { contexts: { nodes: [{ __typename: "SomethingNew" }] } } } } } }) === null,
  )

  /**
   * `PullRequest.reviews` is NULLABLE, introspected on 2026-09-08: an OBJECT of
   * `PullRequestReviewConnection`, not NON_NULL. A null therefore reads as an empty list, exactly as a
   * null `statusCheckRollup` does. An earlier revision refused it, which would have turned a response
   * the schema permits into an environment error.
   */
  const nullReviews = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: null, statusCheckRollup: null } } },
  })
  T(`${TOOL}: a null reviews connection reads as an empty list, not a broken read`, Array.isArray(nullReviews?.reviews) && nullReviews.reviews.length === 0, JSON.stringify(nullReviews))
  /**
   * Three nullable layers, all introspected on 2026-09-08: `PullRequest.reviews` is a nullable OBJECT,
   * `PullRequestReviewConnection.nodes` is a bare `LIST(PullRequestReview)`, and its ELEMENTS are bare
   * objects. Neither the list nor its elements is NON_NULL, so both shapes below are responses the
   * schema permits, and refusing either aborted the whole read before it could use a present green
   * check. A null element is simply not the reviewing app, so it is skipped rather than fatal.
   */
  const nullNodeList = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: null }, statusCheckRollup: null } } },
  })
  T(`${TOOL}: a null nodes LIST reads as an empty list, because the schema does not make it non-null`, Array.isArray(nullNodeList?.reviews) && nullNodeList.reviews.length === 0, JSON.stringify(nullNodeList))
  const nullElement = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [null, { state: "APPROVED", submittedAt: "2026-09-08T10:00:00Z", author: { __typename: "Bot", login: "pullfrog" }, commit: { oid: HEAD_A } }] }, statusCheckRollup: null } } },
  })
  T(
    `${TOOL}: a null review ELEMENT is skipped, and the real review beside it still counts`,
    nullElement?.reviews?.length === 1 && nullElement.reviews[0].state === "APPROVED" && nullElement.reviews[0].isBot === true,
    JSON.stringify(nullElement),
  )
  T(
    `${TOOL}: a reviews object with a non-array nodes is still refused`,
    pullRequestStateFromGraphQl({
      data: { repository: { pullRequest: { number: 716, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: "nope" }, statusCheckRollup: null } } },
    }) === null,
  )

  /**
   * The review fallback (#440). Pullfrog stopped publishing the `pullfrog-approval` CHECK during the
   * night of 2026-09-06 while its reviews stayed healthy, so no receipt could reach READY. The check
   * is a publication of the review, so an APPROVED review at the exact head stands in for it.
   */
  const reviewsAtHead = (nodes) => pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 838, baseRefName: "redesign/main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes }, statusCheckRollup: null } } },
  }).reviews
  const botReview = (state, submittedAt, oid) => ({ state, submittedAt, author: { __typename: "Bot", login: "pullfrog" }, commit: { oid } })

  /**
   * The reading-order trap, kept as a case because it is the one that silently hides an approval.
   * On PR 832 Pullfrog submitted COMMENTED at 05:44:04Z and APPROVED at 05:44:39Z, 35 seconds apart.
   * A reader that returns on the first review reports COMMENTED.
   */
  T(
    `${TOOL}: the NEWEST review at the head wins, so a COMMENTED-then-APPROVED pair reads as APPROVED`,
    reviewAppVerdictAtHead(reviewsAtHead([botReview("COMMENTED", "2026-09-06T05:44:04Z", HEAD_A), botReview("APPROVED", "2026-09-06T05:44:39Z", HEAD_A)]), HEAD_A)?.state === "APPROVED",
  )
  T(
    `${TOOL}: an APPROVED review followed by a COMMENTED one at the same head reads as COMMENTED`,
    reviewAppVerdictAtHead(reviewsAtHead([botReview("APPROVED", "2026-09-06T05:44:04Z", HEAD_A), botReview("COMMENTED", "2026-09-06T05:44:39Z", HEAD_A)]), HEAD_A)?.state === "COMMENTED",
  )
  T(
    `${TOOL}: an approval of a DIFFERENT head is not a verdict for this head`,
    reviewAppVerdictAtHead(reviewsAtHead([botReview("APPROVED", "2026-09-06T05:44:39Z", HEAD_B)]), HEAD_A) === null,
  )
  /**
   * `PullRequestReview.author` is NULLABLE: a review by a since-deleted account returns `author: null`.
   * Refusing that node would return null from the whole read, so ONE unrelated deleted reviewer would
   * break every readiness read on the pull request. It is a non-app review, never a broken read.
   */
  T(
    `${TOOL}: a review whose author is null does not poison the read`,
    Array.isArray(reviewsAtHead([{ state: "APPROVED", submittedAt: "2026-09-06T05:44:39Z", author: null, commit: { oid: HEAD_A } }])),
  )
  T(
    `${TOOL}: a null-author approval at the head never satisfies the review axis`,
    reviewAppVerdictAtHead(reviewsAtHead([{ state: "APPROVED", submittedAt: "2026-09-06T05:44:39Z", author: null, commit: { oid: HEAD_A } }]), HEAD_A) === null,
  )
  T(
    `${TOOL}: a null-author review beside a real approval leaves the approval readable`,
    reviewAppVerdictAtHead(
      reviewsAtHead([
        { state: "CHANGES_REQUESTED", submittedAt: "2026-09-06T05:40:00Z", author: null, commit: { oid: HEAD_A } },
        botReview("APPROVED", "2026-09-06T05:44:39Z", HEAD_A),
      ]),
      HEAD_A,
    )?.state === "APPROVED",
  )
  T(
    `${TOOL}: a human approval at the head is not the reviewing app's verdict`,
    reviewAppVerdictAtHead(reviewsAtHead([{ state: "APPROVED", submittedAt: "2026-09-06T05:44:39Z", author: { __typename: "User", login: "thomasluizon" }, commit: { oid: HEAD_A } }]), HEAD_A) === null,
  )
  T(
    `${TOOL}: a USER account spelled pullfrog is not the app, so the Bot typename is load-bearing`,
    reviewAppVerdictAtHead(reviewsAtHead([{ state: "APPROVED", submittedAt: "2026-09-06T05:44:39Z", author: { __typename: "User", login: "pullfrog" }, commit: { oid: HEAD_A } }]), HEAD_A) === null,
  )
  T(
    `${TOOL}: the REST spelling pullfrog[bot] resolves to the same app`,
    reviewAppVerdictAtHead(reviewsAtHead([{ state: "APPROVED", submittedAt: "2026-09-06T05:44:39Z", author: { __typename: "Bot", login: "pullfrog[bot]" }, commit: { oid: HEAD_A } }]), HEAD_A)?.state === "APPROVED",
  )

  /**
   * The three shapes the fallback has to get right, against a rollup where every OTHER check is
   * green and only the approval check's presence changes.
   */
  const greenRollupWithoutApproval = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 838, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [] }, statusCheckRollup: { contexts: { nodes: [
      { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-09-06T07:00:00Z", completedAt: "2026-09-06T07:10:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 15368 }, workflowRun: { workflow: { name: "PR Tests" } } } },
    ] } } } } },
  }).statusCheckRollup
  const greenRollupWithApproval = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 838, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [] }, statusCheckRollup: { contexts: { nodes: [
      { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-09-06T07:00:00Z", completedAt: "2026-09-06T07:10:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 15368 }, workflowRun: { workflow: { name: "PR Tests" } } } },
      { __typename: "CheckRun", name: "pullfrog-approval", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-09-06T07:05:00Z", completedAt: "2026-09-06T07:05:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 1768019 }, workflowRun: null } },
    ] } } } } },
  }).statusCheckRollup
  const redApprovalRollup = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 838, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [] }, statusCheckRollup: { contexts: { nodes: [
      { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-09-06T07:00:00Z", completedAt: "2026-09-06T07:10:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 15368 }, workflowRun: { workflow: { name: "PR Tests" } } } },
      { __typename: "CheckRun", name: "pullfrog-approval", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-09-06T07:05:00Z", completedAt: "2026-09-06T07:05:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 1768019 }, workflowRun: null } },
    ] } } } } },
  }).statusCheckRollup
  const bothRequired = [{ context: "Unit Tests", appId: 15368 }, { context: REVIEW_APP_CONTEXT, appId: 1768019 }]
  /**
   * Built by the function BOTH readers call, not by hand. A hand-built set here would have kept
   * passing while verify-delivery.mjs and record-readiness.mjs disagreed about the same rule, which is
   * the defect this set now covers.
   */
  const excused = reviewSatisfiedOutOfBand({ state: "APPROVED", submittedAt: "2026-09-08T18:00:00Z", commitOid: HEAD_A })

  T(
    `${TOOL}: the check present and passing is green with no fallback needed`,
    readinessCiIsGreen(greenRollupWithApproval, bothRequired) === true,
  )
  T(
    `${TOOL}: the check absent is NOT green on its own, which is the bug that blocked every receipt`,
    readinessCiIsGreen(greenRollupWithoutApproval, bothRequired) === false,
  )
  T(
    `${TOOL}: the check absent is green when an APPROVED review at the head stands in for it`,
    readinessCiIsGreen(greenRollupWithoutApproval, bothRequired, excused) === true,
  )
  T(
    `${TOOL}: a PRESENT approval check that is red is never waived by the fallback`,
    readinessCiIsGreen(redApprovalRollup, bothRequired, excused) === false,
  )
  T(
    `${TOOL}: excusing the approval context does not excuse a different missing required check`,
    readinessCiIsGreen(greenRollupWithoutApproval, [{ context: "Build", appId: 15368 }, { context: REVIEW_APP_CONTEXT, appId: 1768019 }], excused) === false,
  )
  /**
   * The hole the first draft of this fallback opened, kept as a case. `findRegisteredCheck` returns
   * null both for a context that is missing and for one published by the WRONG app, so excusing on
   * that alone would let a `pullfrog-approval` check from GitHub Actions be waived by a review. The
   * excuse therefore asks whether the CONTEXT is absent entirely, under any producer.
   */
  const wrongAppApprovalRollup = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 838, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: [] }, statusCheckRollup: { contexts: { nodes: [
      { __typename: "CheckRun", name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-09-06T07:00:00Z", completedAt: "2026-09-06T07:10:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 15368 }, workflowRun: { workflow: { name: "PR Tests" } } } },
      { __typename: "CheckRun", name: "pullfrog-approval", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-09-06T07:05:00Z", completedAt: "2026-09-06T07:05:00Z", detailsUrl: null, checkSuite: { app: { databaseId: 15368 }, workflowRun: { workflow: { name: "PR Tests" } } } },
    ] } } } } },
  }).statusCheckRollup
  T(
    `${TOOL}: an approval context published by the WRONG app is not excused, because it is present`,
    readinessCiIsGreen(wrongAppApprovalRollup, bothRequired, excused) === false,
  )
  /**
   * The excuse is keyed by context AND app pin. Keying it by context alone excused a requirement pinned
   * to a DIFFERENT app, and a review by app 1768019 proves nothing about a check required from 15368.
   * Reproduced returning true before the fix.
   */
  T(
    `${TOOL}: an absent context required from ANOTHER app is not excused by this app's review`,
    readinessCiIsGreen(greenRollupWithoutApproval, [{ context: "Unit Tests", appId: 15368 }, { context: REVIEW_APP_CONTEXT, appId: 15368 }], excused) === false,
  )
  T(
    `${TOOL}: an absent context required from NO app is excused, because any producer satisfies it`,
    readinessCiIsGreen(greenRollupWithoutApproval, [{ context: "Unit Tests", appId: 15368 }, { context: REVIEW_APP_CONTEXT, appId: null }], excused) === true,
  )
  /**
   * Only an APPROVED verdict earns an excuse. Each of the other four review states is a real verdict
   * GitHub returns, and none of them is evidence that the missing check would have passed.
   */
  for (const state of ["PENDING", "COMMENTED", "CHANGES_REQUESTED", "DISMISSED"]) {
    T(
      `${TOOL}: a ${state} review earns no out-of-band excuse`,
      reviewSatisfiedOutOfBand({ state, submittedAt: "2026-09-08T18:00:00Z", commitOid: HEAD_A }).size === 0,
    )
  }
  T(
    `${TOOL}: an absent review verdict earns no out-of-band excuse`,
    reviewSatisfiedOutOfBand(null).size === 0 && reviewSatisfiedOutOfBand(undefined).size === 0,
  )
  T(
    `${TOOL}: an APPROVED review excuses the pinned pair and the unpinned one, and nothing else`,
    excused.size === 2 && excused.has(outOfBandKey({ context: REVIEW_APP_CONTEXT, appId: 1768019 })) && excused.has(outOfBandKey({ context: REVIEW_APP_CONTEXT, appId: null })),
    [...excused].join(" "),
  )
  /**
   * The predicate itself, because verify-delivery.mjs calls it directly rather than through
   * readinessCiIsGreen. A registered check is satisfied without consulting the excuse set at all, so
   * the delivery reader's pending bucket and the readiness reader's pass rule cannot diverge.
   */
  const newestWithoutApproval = newestChecks(greenRollupWithoutApproval)
  const newestWithApproval = newestChecks(greenRollupWithApproval)
  T(
    `${TOOL}: requiredCheckSatisfied excuses the absent pinned context under an APPROVED review`,
    requiredCheckSatisfied(newestWithoutApproval, { context: REVIEW_APP_CONTEXT, appId: 1768019 }, excused) === true,
  )
  T(
    `${TOOL}: requiredCheckSatisfied refuses the same absence with no excuse at all`,
    requiredCheckSatisfied(newestWithoutApproval, { context: REVIEW_APP_CONTEXT, appId: 1768019 }) === false,
  )
  T(
    `${TOOL}: requiredCheckSatisfied accepts a registered check without needing an excuse`,
    requiredCheckSatisfied(newestWithApproval, { context: REVIEW_APP_CONTEXT, appId: 1768019 }) === true,
  )
  T(
    `${TOOL}: requiredCheckSatisfied refuses an absence the excuse set does not speak to`,
    requiredCheckSatisfied(newestWithoutApproval, { context: "Build", appId: 15368 }, excused) === false,
  )

  /**
   * The bounded window is only safe because the query narrows to the reviewing app. Unfiltered, pull
   * request 786 carries 174 reviews against a 50-node window, so an exact-head approval was evictable
   * by unrelated reviews and read as no verdict. This fixture is that shape: fifty later reviews by
   * other authors, with the app's approval at the head still present.
   */
  const crowdedNodes = []
  for (let index = 0; index < 50; index += 1) {
    crowdedNodes.push({ state: "COMMENTED", submittedAt: `2026-09-08T1${index % 10}:00:00Z`, author: { __typename: "User", login: `human-${index}` }, commit: { oid: HEAD_A } })
  }
  crowdedNodes.push({ state: "APPROVED", submittedAt: "2026-09-08T23:00:00Z", author: { __typename: "Bot", login: "pullfrog" }, commit: { oid: HEAD_A } })
  const crowded = pullRequestStateFromGraphQl({
    data: { repository: { pullRequest: { number: 786, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { nodes: crowdedNodes }, statusCheckRollup: null } } },
  })
  T(
    `${TOOL}: an exact-head approval survives fifty later reviews by other authors`,
    reviewAppVerdictAtHead(crowded.reviews, HEAD_A)?.state === "APPROVED",
  )
  T(
    `${TOOL}: a truncated review window is reported rather than passed off as complete`,
    pullRequestStateFromGraphQl({
      data: { repository: { pullRequest: { number: 786, baseRefName: "main", baseRefOid: BASE_A, headRefOid: HEAD_A, isDraft: false, reviews: { pageInfo: { hasPreviousPage: true }, nodes: [] }, statusCheckRollup: null } } },
    })?.reviewsTruncated === true && crowded.reviewsTruncated === false,
  )

  const argv = pullRequestStateArgv("thomasluizon/orbit-ui-mobile", 716)
  T(
    `${TOOL}: both readers send one GraphQL request naming the owner, repository and number`,
    argv[0] === "api" && argv[1] === "graphql" && argv.includes("owner=thomasluizon") && argv.includes("name=orbit-ui-mobile") && argv.includes("number=716") && argv.at(-1).includes("checkSuite { app { databaseId }") && argv.at(-1).includes('reviews(last: 50, author: "' + REVIEW_APP_AUTHOR_FILTER + '")'),
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
