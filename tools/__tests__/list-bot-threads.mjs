import { spawn } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import { readObservedIdentifiers } from "../lib/identifier-ledger.mjs"
import { gitDirectoryOf } from "../lib/run-state.mjs"
import { REPO_ROOT, processIsRunning, T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "list-bot-threads.mjs"
const BOT = "pullfrog"
const RUN_IDENTIFIER = "list-bot-threads-current-run"
let testedToolPath = null

const THREAD_BODY = "**Honor the configured timeout for every GitHub child**\n\nWhen the poller runs, this still uses the default bound.\n\n<!-- Pullfrog review metadata -->"

const thread = ({ id = "PRRT_kwDOR5Siws6Wfy_V", reviewId = "PRR_kwDOR5Siws8AAAABNo7WdA", isResolved = false, isOutdated = false, path = "tools/launch-worker.mjs", line = 42, body = THREAD_BODY, login = BOT } = {}) => ({
  id,
  isResolved,
  isOutdated,
  path,
  line,
  comments: { nodes: [{ author: { login }, body, pullRequestReview: { id: reviewId } }] },
})

const HEAD = "0f4abca78a0f4c487a98ab642508c06c6634f36f"
const OLD_HEAD = "b5cd7394a8a687126eaaec32c02978ad6575c01c"
const BASE = "c5cd7394a8a687126eaaec32c02978ad6575c01d"
const REPOINTED_HEAD = "4cc1f620dae30df23b09cdbfb7ceb69a45fe35cf"
/** Keep the activity response shape for review freshness checks. */
const activity = (after = HEAD, timestamp = "2026-08-04T22:01:00Z", activity_type = "push") => [{
  activity_type, actor: { login: "<actor>" }, after, before: OLD_HEAD, id: 1,
  node_id: "<activity-id>", ref: "refs/heads/fix/example", timestamp,
}]

const approvalCheck = (status = "COMPLETED", conclusion = "SUCCESS", startedAt = "2026-08-12T20:36:00Z") => ({
  __typename: "CheckRun", name: "pullfrog-approval", status, conclusion, startedAt,
  completedAt: status === "COMPLETED" ? startedAt : null,
  checkSuite: { app: { databaseId: 1768019 } },
})

const payload = ({ isDraft = false, reviews = [], comments = [], threads = [], checks = [approvalCheck()], headRefOid = HEAD, repositoryName = "thomasluizon/orbit-ui-mobile", headRepositoryName = repositoryName, pageInfo = { hasNextPage: false, endCursor: null } } = {}) =>
  JSON.stringify({
    data: {
      repository: {
        nameWithOwner: repositoryName,
        pullRequest: {
          number: 681,
          isDraft,
          baseRefName: "main",
          baseRefOid: BASE,
          headRefOid,
          headRefName: "fix/example",
          headRepository: { nameWithOwner: headRepositoryName },
          commits: { nodes: [{ commit: { oid: headRefOid } }] },
          statusCheckRollup: { contexts: { nodes: checks } },
          reviews: { nodes: reviews },
          comments: { nodes: comments },
          reviewThreads: { pageInfo, nodes: threads },
        },
      },
    },
  })

const ciCheck = (conclusion = "SUCCESS", status = "COMPLETED", name = "Unit Tests") => ({
  __typename: "CheckRun", name, status, conclusion, startedAt: "2026-08-04T22:05:00Z",
  completedAt: status === "COMPLETED" ? "2026-08-04T22:15:00Z" : null,
  checkSuite: { app: { databaseId: 15368 } },
})

const botReview = (state = "APPROVED", submittedAt = "2026-08-04T23:16:35Z", oid = HEAD, body = "", id = "PRR_kwDOR5Siws8AAAABNo7WdA") => ({ id, author: { login: BOT }, state, submittedAt, body, commit: { oid } })
const ghPlan = (stdout, exit = 0, activities) => {
  let headRefOid = HEAD
  try { headRefOid = JSON.parse(stdout).data.repository.pullRequest.headRefOid } catch { /* The malformed-response case fails in the tool. */ }
  return {
  ...orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "api graphql", stdout, exit },
    { match: "/activity?", stdout: JSON.stringify(activities ?? activity(
      headRefOid,
      headRefOid === REPOINTED_HEAD ? "2026-09-26T02:48:44Z" : "2026-08-04T22:01:00Z",
    )) },
  ]),
  CLAUDE_CODE_SESSION_ID: RUN_IDENTIFIER,
  CODEX_THREAD_ID: "",
  }
}
const parsed = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const readPr = (stdout, exit = 0, argv = [], activities) => run(TOOL, ["--pr", "https://github.com/thomasluizon/orbit-ui-mobile/pull/681", "--wait-seconds", "0", ...argv], { path: testedToolPath, env: ghPlan(stdout, exit, activities) })

export const cases = async () => {
  check(TOOL, "refuses a missing pull request", ["--wait-seconds", "0"], { status: 2, stderr: /--pr must be a pull request number or full GitHub/ })
  check(TOOL, "refuses a non-numeric pull request number", ["--pr", "abc"], { status: 2, stderr: /--pr must be a pull request number or full GitHub/ })
  check(TOOL, "a bare pull request number requires an explicit repository", ["--pr", "681"], { status: 2, stderr: /bare pull request number requires --repo/ })
  check(TOOL, "refuses an unknown repository", ["--pr", "681", "--repo", "ghost"], { status: 2, stderr: /--repo must name a configured repository/ })
  check(TOOL, "refuses a negative wait budget", ["--pr", "681", "--repo", "ui", "--wait-seconds", "-5"], { status: 2, stderr: /--wait-seconds must be an integer/ })
  check(TOOL, "refuses a zero poll interval", ["--pr", "681", "--repo", "ui", "--poll-seconds", "0"], { status: 2, stderr: /--poll-seconds must be an integer >= 1/ })
  check(TOOL, "refuses a zero command timeout", ["--pr", "681", "--repo", "ui", "--command-timeout-seconds", "0"], { status: 2, stderr: /--command-timeout-seconds must be an integer >= 1/ })

  const uiContext = stageRepo("list-bot-threads-ui-context")
  const apiContext = stageRepo("list-bot-threads-api-context")
  if (!uiContext || !apiContext || uiContext.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"]).status !== 0 || apiContext.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-api.git"]).status !== 0) {
    T(`${TOOL}: repository-qualified GitHub context fixtures are available`, false, "could not stage GitHub contexts")
    return
  }
  const hermeticConfig = realOrchestratorConfig()
  hermeticConfig.repos = { ...hermeticConfig.repos, ui: uiContext.path, api: apiContext.path }
  testedToolPath = stageWithConfig("list-bot-threads-hermetic", TOOL, hermeticConfig).path

  const clean = readPr(payload({ reviews: [botReview()] }))
  const cleanPlan = parsed(clean)
  T(
    `${TOOL}: an approving review with zero threads is REVIEWED and exits 0`,
    clean.status === 0 && cleanPlan?.verdict === "REVIEWED" && cleanPlan.reviewState === "APPROVED" && cleanPlan.counts.total === 0 && cleanPlan.reviewedAt === "2026-08-04T23:16:35Z",
    clean.stdout || clean.stderr,
  )
  T(`${TOOL}: every read emits structured progress on stderr`, /"event":"REVIEW_STATE_READ"/.test(clean.stderr), clean.stderr)

  const apiNumber = run(TOOL, ["--pr", "681", "--repo", "api", "--wait-seconds", "0"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "repo=orbit-api", stdout: payload({ reviews: [botReview()], repositoryName: "thomasluizon/orbit-api", headRepositoryName: "thomasluizon/orbit-api" }) },
    { match: "/activity?", stdout: JSON.stringify(activity()) },
  ]) })
  T(`${TOOL}: the same numbered API PR is queried through API, never UI cwd inference`, apiNumber.status === 0 && parsed(apiNumber)?.verdict === "REVIEWED", apiNumber.stdout || apiNumber.stderr)

  const absent = readPr(payload({ reviews: [] }))
  const absentPlan = parsed(absent)
  T(
    `${TOOL}: zero threads with NO review is NO_REVIEW and exits 1, never a clean verdict`,
    absent.status === 1 && absentPlan?.verdict === "NO_REVIEW" && absentPlan.reviewedAt === null,
    absent.stdout || absent.stderr,
  )

  /**
   * The reviewer's identity is proven by a REVIEW, never by an issue comment. Reading a comment as
   * a verdict is what let a reviewer that had posted nothing look clean, so a comment claiming a
   * clean pass must leave the verdict at NO_REVIEW.
   */
  const commentOnly = readPr(payload({ comments: [{ author: { login: BOT }, body: "No new issues found.", createdAt: "2026-08-05T11:00:00Z", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/681#issuecomment-123" }] }))
  T(
    `${TOOL}: an issue comment claiming a clean pass is NOT a review and stays NO_REVIEW`,
    commentOnly.status === 1 && parsed(commentOnly)?.verdict === "NO_REVIEW",
    commentOnly.stdout || commentOnly.stderr,
  )

  /**
   * REST and GraphQL spell the same reviewer differently, so a caller who copied the login out of a
   * REST response passes `pullfrog[bot]` and is right about the identity. The suffix is stripped at
   * the boundary; without that, this run would report NO_REVIEW on a pull request that was reviewed.
   */
  const restSpelling = readPr(payload({ reviews: [botReview()] }), 0, ["--bot", "pullfrog[bot]"])
  T(`${TOOL}: the REST bot-login spelling matches the GraphQL login`, restSpelling.status === 0 && parsed(restSpelling)?.verdict === "REVIEWED", restSpelling.stdout || restSpelling.stderr)

  /** A body-level CHANGES_REQUESTED opens no thread at all, so a thread count of 0 is not clean. */
  const changes = readPr(payload({ reviews: [botReview("CHANGES_REQUESTED", "2026-08-04T23:16:35Z", HEAD, "The migration drops a column old clients still read.")] }))
  const changesPlan = parsed(changes)
  T(
    `${TOOL}: CHANGES_REQUESTED with zero threads is reported as blocked, not clean`,
    changes.status === 0 && changesPlan?.verdict === "CHANGES_REQUESTED" && changesPlan.counts.total === 0,
    changes.stdout || changes.stderr,
  )
  T(
    `${TOOL}: CHANGES_REQUESTED carries the review body, which is its only statement of the problem`,
    changesPlan?.reviewBody === "The migration drops a column old clients still read.",
    changes.stdout,
  )
  T(
    `${TOOL}: an approving review carries no body, because a clean pass states no complaint`,
    parsed(clean)?.reviewBody === null,
    clean.stdout,
  )
  const approvedWithBody = readPr(payload({ reviews: [botReview("APPROVED", "2026-08-12T16:04:16Z", HEAD, "> No new issues found.\n\n**Reviewed changes** Reviewed the pinned action update.\n\n<!-- Pullfrog review metadata -->")] }))
  const approvedPlan = parsed(approvedWithBody)
  T(
    `${TOOL}: an approving review with a real non-empty body is still a clean pass with no findings`,
    approvedWithBody.status === 0 && approvedPlan?.verdict === "REVIEWED" && approvedPlan.reviewState === "APPROVED" && approvedPlan.counts.total === 0 && approvedPlan.reviewBody === null,
    approvedWithBody.stdout || approvedWithBody.stderr,
  )
  const COMMENTED_BODY = "> [!IMPORTANT]\n> The readiness path drops the app identity of a required check.\n\n**Reviewed changes** Reviewed the readiness receipt and the thread reader.\n\n<!-- Pullfrog review metadata -->"
  const commentedWithBody = readPr(payload({ reviews: [botReview("COMMENTED", "2026-08-12T18:48:24Z", HEAD, COMMENTED_BODY)] }))
  const commentedPlan = parsed(commentedWithBody)
  T(
    `${TOOL}: a COMMENTED review with a body and no thread hands the caller that body, never silence`,
    commentedWithBody.status === 0 && commentedPlan?.verdict === "REVIEWED" && commentedPlan.reviewState === "COMMENTED" && commentedPlan.counts.total === 0 && commentedPlan.reviewBody === COMMENTED_BODY,
    commentedWithBody.stdout || commentedWithBody.stderr,
  )
  const commented = readPr(payload({ reviews: [botReview("COMMENTED")], checks: [approvalCheck("IN_PROGRESS", null)] }))
  T(
    `${TOOL}: an empty COMMENTED review is a progress marker, never a verdict`,
    commented.status === 1 && parsed(commented)?.verdict === "NO_REVIEW" && parsed(commented)?.progressMarkers === 1,
    commented.stdout || commented.stderr,
  )

  const markerSequence = stage("list-bot-threads/marker-sequence", "0")
  const markerThenBody = run(TOOL, ["--pr", "681", "--repo", "ui", "--wait-seconds", "3", "--poll-seconds", "1", "--no-request"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "/activity?", stdout: JSON.stringify(activity()) },
    { match: "api graphql", stdoutSequence: [
      payload({ reviews: [botReview("COMMENTED")], checks: [approvalCheck("IN_PROGRESS", null)] }),
      payload({ reviews: [botReview("COMMENTED"), botReview("COMMENTED", "2026-08-05T10:00:00Z", HEAD, "A real finding.", "PRR_later_review")], checks: [approvalCheck("IN_PROGRESS", null)] }),
    ], sequenceFile: markerSequence },
  ]) })
  T(
    `${TOOL}: a marker followed by a body waits and returns the body`,
    markerThenBody.status === 0 && parsed(markerThenBody)?.reviewBody === "A real finding." && parsed(markerThenBody)?.progressMarkers === 1,
    markerThenBody.stdout || markerThenBody.stderr,
  )

  const completedOverMarkers = readPr(payload({ reviews: [botReview("COMMENTED")], checks: [approvalCheck("COMPLETED", "FAILURE")] }))
  T(
    `${TOOL}: a completed approval check ends the wait and reports failure over markers`,
    completedOverMarkers.status === 1 && parsed(completedOverMarkers)?.verdict === "CHECK_FAILED" && parsed(completedOverMarkers)?.checkConclusion === "FAILURE" && parsed(completedOverMarkers)?.progressMarkers === 1,
    completedOverMarkers.stdout || completedOverMarkers.stderr,
  )

  const approvedPending = readPr(payload({ reviews: [botReview()], checks: [approvalCheck("IN_PROGRESS", null)] }))
  T(
    `${TOOL}: an APPROVED review with a pending check is CHECK_PENDING and keeps its review evidence`,
    approvedPending.status === 1 && parsed(approvedPending)?.verdict === "CHECK_PENDING" &&
      parsed(approvedPending)?.reviewState === "APPROVED" && parsed(approvedPending)?.reviewedAt === "2026-08-04T23:16:35Z" &&
      parsed(approvedPending)?.reviewedCommit === HEAD && parsed(approvedPending)?.checkStatus === "PENDING" &&
      parsed(approvedPending)?.checkConclusion === null,
    approvedPending.stdout || approvedPending.stderr,
  )

  const approvedWithoutCheck = readPr(payload({ reviews: [botReview()], checks: [] }))
  T(
    `${TOOL}: an exact-head APPROVED review with no check is REVIEWED, the unprotected-base evidence`,
    approvedWithoutCheck.status === 0 && parsed(approvedWithoutCheck)?.verdict === "REVIEWED" &&
      parsed(approvedWithoutCheck)?.reviewState === "APPROVED" && parsed(approvedWithoutCheck)?.reviewedAt === "2026-08-04T23:16:35Z" &&
      parsed(approvedWithoutCheck)?.reviewedCommit === HEAD && parsed(approvedWithoutCheck)?.checkStatus === "ABSENT" &&
      parsed(approvedWithoutCheck)?.checkConclusion === null,
    approvedWithoutCheck.stdout || approvedWithoutCheck.stderr,
  )

  const markerWithOwnThread = readPr(payload({ reviews: [botReview("COMMENTED")], threads: [thread()], checks: [approvalCheck("IN_PROGRESS", null)] }))
  T(
    `${TOOL}: an empty COMMENTED review with its own thread carries a verdict`,
    markerWithOwnThread.status === 0 && parsed(markerWithOwnThread)?.verdict === "REVIEWED" && parsed(markerWithOwnThread)?.progressMarkers === 0,
    markerWithOwnThread.stdout || markerWithOwnThread.stderr,
  )
  const markerWithOtherThread = readPr(payload({ reviews: [botReview("COMMENTED")], threads: [thread({ reviewId: "PRR_another_review" })], checks: [approvalCheck("IN_PROGRESS", null)] }))
  T(
    `${TOOL}: another review's thread does not turn a marker into a verdict`,
    markerWithOtherThread.status === 1 && parsed(markerWithOtherThread)?.progressMarkers === 1,
    markerWithOtherThread.stdout || markerWithOtherThread.stderr,
  )

  const superseded = readPr(payload({
    reviews: [botReview("APPROVED"), botReview("COMMENTED", "2026-08-05T10:00:00Z", HEAD, "A later P1 finding.", "PRR_later_review")],
    checks: [approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z"), approvalCheck("COMPLETED", "FAILURE", "2026-08-05T10:02:00Z")],
  }))
  T(
    `${TOOL}: a later same-head finding and latest failing check supersede approval`,
    superseded.status === 1 && parsed(superseded)?.verdict === "CHECK_FAILED" && parsed(superseded)?.reviewState === "COMMENTED" && parsed(superseded)?.reviewBody === "A later P1 finding." && parsed(superseded)?.checkConclusion === "FAILURE",
    superseded.stdout || superseded.stderr,
  )
  const contradiction = readPr(payload({}), 0, ["--re-review", "--no-request"])
  T(
    `${TOOL}: --re-review and --no-request contradict each other and are refused`,
    contradiction.status === 2 && /contradict each other/.test(contradiction.stderr),
    contradiction.stdout || contradiction.stderr,
  )
  const noWait = readPr(payload({}), 0, ["--re-review"])
  T(
    `${TOOL}: --re-review with a zero wait is refused, because it could never observe a fresh review`,
    noWait.status === 2 && /--wait-seconds above 0/.test(noWait.stderr),
    noWait.stdout || noWait.stderr,
  )
  const toolSource = readFileSync(testedToolPath, "utf8")
  const querySource = /const QUERY = `([\s\S]*?)`/.exec(toolSource)?.[1] ?? ""
  const prLevelComments = /\n\s{6}comments\(last:\d+\)\{nodes\{([^}]*)\}\}/.exec(querySource)?.[1] ?? ""
  for (const field of ["createdAt", "url"]) {
    T(
      `${TOOL}: the GraphQL query selects pull request comments.${field}, which --re-review reads to bind its request boundary`,
      prLevelComments.includes(field),
      `pull-request-level comments selection was "${prLevelComments}" in:\n${querySource}`,
    )
  }
  /** Sliced by the selections that bracket it, because a nested `author{login}` defeats a [^}] scan. */
  const reviewsSelection = querySource.slice(querySource.indexOf("reviews(last:"), querySource.indexOf("comments(last:"))
  T(
    `${TOOL}: the GraphQL query selects the comment author, which decides whether a request comment counts`,
    prLevelComments.includes("author{login"),
    `pull-request-level comments selection was "${prLevelComments}"`,
  )
  for (const field of ["submittedAt", "state", "commit"]) {
    T(
      `${TOOL}: the GraphQL query selects reviews.${field}, which the verdict reads`,
      reviewsSelection.includes(field),
      `reviews selection was "${reviewsSelection}"`,
    )
  }
  T(`${TOOL}: the query selects check run identity, status, conclusion, and time`, ["statusCheckRollup", "checkSuite{app{databaseId}}", "status", "conclusion", "startedAt", "completedAt"].every((field) => querySource.includes(field)), querySource)
  T(`${TOOL}: the query selects the head branch and repository without check suites`,
    querySource.includes("headRefName headRepository{nameWithOwner}") && !querySource.includes("checkSuites"), querySource)
  T(`${TOOL}: the query selects each thread's owning review`, querySource.includes("pullRequestReview{id}"), querySource)

  const REQUEST_URL = "https://github.com/thomasluizon/orbit-ui-mobile/pull/681#issuecomment-2026081201"
  const requestComment = (createdAt) => ({ author: { login: "thomasluizon" }, body: "@pullfrog review", createdAt, url: REQUEST_URL })
  const reReviewPlan = (stdout) => ({
    ...orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: "/activity?", stdout: JSON.stringify(activity()) },
      { match: "pr comment", stdout: REQUEST_URL },
      { match: "api graphql", stdout },
    ]),
    CLAUDE_CODE_SESSION_ID: RUN_IDENTIFIER,
    CODEX_THREAD_ID: "",
  })
  const reReviewRun = (stdout) =>
    run(TOOL, ["--pr", "https://github.com/thomasluizon/orbit-ui-mobile/pull/681", "--re-review", "--wait-seconds", "3", "--poll-seconds", "1"], { path: testedToolPath, env: reReviewPlan(stdout) })

  const raceSequence = stage("list-bot-threads/re-review-race", "0")
  const inFlight = run(TOOL, ["--pr", "https://github.com/thomasluizon/orbit-ui-mobile/pull/681", "--re-review", "--wait-seconds", "3", "--poll-seconds", "1"], { path: testedToolPath, env: {
    ...orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: "/activity?", stdout: JSON.stringify(activity()) },
      { match: "pr comment", stdout: REQUEST_URL },
      { match: "api graphql", stdoutSequence: [
        payload({ reviews: [botReview("COMMENTED", "2026-08-12T20:10:00Z", HEAD, COMMENTED_BODY)], checks: [approvalCheck(), ciCheck()] }),
        payload({
          reviews: [
            botReview("COMMENTED", "2026-08-12T20:10:00Z", HEAD, COMMENTED_BODY),
            botReview("COMMENTED", "2026-08-12T20:20:00Z", HEAD, COMMENTED_BODY),
          ],
          comments: [requestComment("2026-08-12T20:30:00Z")],
          checks: [approvalCheck(), ciCheck()],
        }),
      ], sequenceFile: raceSequence },
    ]),
    CLAUDE_CODE_SESSION_ID: RUN_IDENTIFIER,
    CODEX_THREAD_ID: "",
  } })
  T(
    `${TOOL}: --re-review refuses a review that landed in flight before the request, which a baseline taken at open would wrongly accept`,
    inFlight.status === 1 && parsed(inFlight)?.verdict === "NO_REVIEW",
    inFlight.stdout || inFlight.stderr,
  )

  const answered = reReviewRun(payload({
    reviews: [botReview("APPROVED", "2026-08-12T20:35:00Z", HEAD, "")],
    comments: [requestComment("2026-08-12T20:30:00Z")],
    checks: [approvalCheck(), ciCheck()],
  }))
  T(
    `${TOOL}: --re-review accepts the review submitted AFTER the request, which is the transition that converges`,
    answered.status === 0 && parsed(answered)?.verdict === "REVIEWED" && parsed(answered)?.reviewState === "APPROVED",
    answered.stdout || answered.stderr,
  )

  /** No request comment means no boundary, so nothing can be mistaken for an answer. Fails closed. */
  const unboundable = reReviewRun(payload({
    reviews: [botReview("APPROVED", "2026-08-12T20:35:00Z", HEAD, "")],
    comments: [],
    checks: [approvalCheck(), ciCheck()],
  }))
  T(
    `${TOOL}: --re-review reports NO_REVIEW when its own request comment cannot be found, never a guessed pass`,
    unboundable.status === 1 && parsed(unboundable)?.verdict === "NO_REVIEW",
    unboundable.stdout || unboundable.stderr,
  )

  /**
   * The request goes out at the push and reads no check, so the review runs beside CI. Each case
   * records the argv of the request comment and of any branch protection read, so "requested" and
   * "read no protection" are observed rather than assumed.
   */
  const argvFile = (name) => {
    const path = stage(`list-bot-threads/${name}.json`, "")
    rmSync(path)
    return path
  }
  const requestEnv = (name, graphql, activities, comment = {}) => {
    const requestArgv = argvFile(`request-argv-${name}`)
    const protectionArgv = argvFile(`protection-argv-${name}`)
    return { requestArgv, protectionArgv, env: {
      ...orcaEnv([
        { match: "auth token --user thomasluizon", stdout: "test-github-token" },
        { match: "/activity?", ...activities },
        // Answers a branch protection read only to record it; no request case may make one.
        { match: "/protection/", stdout: "{}", argvFile: protectionArgv },
        { match: "pr comment", stdout: REQUEST_URL, argvFile: requestArgv, ...comment },
        { match: "api graphql", ...graphql },
      ]),
      CLAUDE_CODE_SESSION_ID: RUN_IDENTIFIER,
      CODEX_THREAD_ID: "",
    } }
  }
  /** The tool keeps each posted request in the git directory of the repository, so each case starts without one. */
  const requestLedger = join(gitDirectoryOf(uiContext.path), "orbit-review-requests.json")
  const requestRun = (name, graphql, { waitSeconds = "3", argv = [], activities = { stdout: JSON.stringify(activity()) }, keepLedger = false } = {}) => {
    if (!keepLedger) rmSync(requestLedger, { force: true })
    const { requestArgv, protectionArgv, env } = requestEnv(name, graphql, activities)
    const result = run(TOOL, ["--pr", "681", "--repo", "ui", "--wait-seconds", waitSeconds, "--poll-seconds", "1", ...argv], { path: testedToolPath, env })
    return {
      result,
      plan: parsed(result),
      requestArgv: existsSync(requestArgv) ? JSON.parse(readFileSync(requestArgv, "utf8")) : null,
      protectionRead: existsSync(protectionArgv),
      requests: (result.stderr.match(/"event":"REVIEW_REQUESTED"/g) ?? []).length,
    }
  }
  const sequence = (name, payloads) => ({ stdoutSequence: payloads, sequenceFile: stage(`list-bot-threads/${name}-sequence`, "0") })
  const reviewLands = (checks) => payload({ checks: [...checks, approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z")], reviews: [botReview("APPROVED", "2026-08-05T10:00:00Z")] })
  /** The request must follow the first read and come before the second, so it never waited on a later read. */
  const requestedOnFirstRead = (entry) => {
    const reads = [...entry.result.stderr.matchAll(/"event":"REVIEW_THREAD_PAGE_READ"/g)].map((match) => match.index)
    const requestedAt = entry.result.stderr.indexOf('"event":"REVIEW_REQUESTED"')
    return requestedAt > reads[0] && (reads.length === 1 || requestedAt < reads[1])
  }

  const greenHead = requestRun("green", sequence("green", [payload({ checks: [ciCheck()] }), reviewLands([ciCheck()])]))
  T(
    `${TOOL}: a head with no review gets exactly one "@pullfrog review" request, then the review is read`,
    greenHead.result.status === 0 && greenHead.plan?.verdict === "REVIEWED" && greenHead.requests === 1 &&
      greenHead.requestArgv?.includes("@pullfrog review") && !("ciGate" in (greenHead.plan ?? {})),
    greenHead.result.stdout || greenHead.result.stderr,
  )

  const runningHead = requestRun("running", sequence("running", [payload({ checks: [ciCheck(null, "IN_PROGRESS")] }), reviewLands([ciCheck(null, "IN_PROGRESS")])]))
  T(
    `${TOOL}: a head whose CI still runs is requested on the first read, with no CI wait`,
    runningHead.result.status === 0 && runningHead.plan?.verdict === "REVIEWED" && runningHead.requests === 1 && requestedOnFirstRead(runningHead) &&
      !runningHead.result.stderr.includes("CI_WAITING"),
    runningHead.result.stdout || runningHead.result.stderr,
  )

  const justPushed = requestRun("just-pushed", sequence("just-pushed", [payload({ checks: [] }), reviewLands([])]))
  T(
    `${TOOL}: a head with no check reported yet, right after its push, is requested on the first read`,
    justPushed.result.status === 0 && justPushed.plan?.verdict === "REVIEWED" && justPushed.requests === 1 && requestedOnFirstRead(justPushed),
    justPushed.result.stdout || justPushed.result.stderr,
  )

  const failingHead = requestRun("failing", sequence("failing", [payload({ checks: [ciCheck("FAILURE")] }), reviewLands([ciCheck("FAILURE")])]))
  T(
    `${TOOL}: a head whose CI failed is requested too, because the request reads no check`,
    failingHead.result.status === 0 && failingHead.plan?.verdict === "REVIEWED" && failingHead.requests === 1 && requestedOnFirstRead(failingHead),
    failingHead.result.stdout || failingHead.result.stderr,
  )

  const unanswered = requestRun("unanswered", { stdout: payload({ checks: [ciCheck(null, "QUEUED")] }) }, { waitSeconds: "2" })
  T(
    `${TOOL}: a request with no review inside the budget is NO_REVIEW that says the request WAS posted`,
    unanswered.result.status === 1 && unanswered.plan?.verdict === "NO_REVIEW" && unanswered.plan.reviewRequested === true && unanswered.requests === 1 &&
      /WAS posted/.test(unanswered.plan.note ?? ""),
    unanswered.result.stdout || unanswered.result.stderr,
  )

  const reviewedHead = requestRun("reviewed", { stdout: payload({ checks: [ciCheck(), approvalCheck()], reviews: [botReview()] }) })
  T(
    `${TOOL}: a head that already has its review gets no second request`,
    reviewedHead.result.status === 0 && reviewedHead.plan?.verdict === "REVIEWED" && reviewedHead.requestArgv === null,
    reviewedHead.result.stdout || reviewedHead.result.stderr,
  )
  const fixPush = requestRun("fix-push", sequence("fix-push", [
    payload({ checks: [ciCheck(null, "IN_PROGRESS")], reviews: [botReview("APPROVED", "2026-08-04T21:00:00Z", OLD_HEAD)] }),
    payload({ checks: [ciCheck(), approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z")], reviews: [botReview("APPROVED", "2026-08-04T21:00:00Z", OLD_HEAD), botReview("APPROVED", "2026-08-05T10:00:00Z")] }),
  ]))
  T(
    `${TOOL}: a fix push after a reviewed head is requested once at the push, for the new head`,
    fixPush.result.status === 0 && fixPush.plan?.verdict === "REVIEWED" && fixPush.plan.reviewedCommit === HEAD && fixPush.requests === 1 && requestedOnFirstRead(fixPush),
    fixPush.result.stdout || fixPush.result.stderr,
  )
  const alreadyAsked = requestRun("already-asked", { stdout: payload({ checks: [ciCheck()], comments: [requestComment("2026-08-04T22:30:00Z")] }) }, { waitSeconds: "2" })
  T(
    `${TOOL}: a request already posted after the head's push is not posted twice`,
    alreadyAsked.result.status === 1 && alreadyAsked.plan?.verdict === "NO_REVIEW" && alreadyAsked.requestArgv === null && alreadyAsked.plan.existingRequestUrl === REQUEST_URL &&
      /no second request/.test(alreadyAsked.plan.note ?? ""),
    alreadyAsked.result.stdout || alreadyAsked.result.stderr,
  )
  const strangerRequest = { ...requestComment("2026-08-04T22:30:00Z"), author: { login: "not-a-collaborator" } }
  const askedByStranger = requestRun("asked-by-stranger", sequence("asked-by-stranger", [
    payload({ checks: [ciCheck()], comments: [strangerRequest] }),
    payload({ checks: [ciCheck(), approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z")], comments: [strangerRequest], reviews: [botReview("APPROVED", "2026-08-05T10:00:00Z")] }),
  ]))
  T(
    `${TOOL}: a request comment from a non-collaborator is no request, because Pullfrog ignores it, so the real one is posted`,
    askedByStranger.result.status === 0 && askedByStranger.plan?.verdict === "REVIEWED" && askedByStranger.requests === 1 && askedByStranger.plan.existingRequestUrl === undefined,
    askedByStranger.result.stdout || askedByStranger.result.stderr,
  )
  const askedForOldHead = requestRun("asked-for-old-head", sequence("asked-for-old-head", [
    payload({ checks: [ciCheck()], comments: [requestComment("2026-08-04T21:30:00Z")] }),
    payload({ checks: [ciCheck(), approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z")], comments: [requestComment("2026-08-04T21:30:00Z")], reviews: [botReview("APPROVED", "2026-08-05T10:00:00Z")] }),
  ]))
  T(
    `${TOOL}: a request posted before the head's push asks for the older head, so the new head is requested`,
    askedForOldHead.result.status === 0 && askedForOldHead.plan?.verdict === "REVIEWED" && askedForOldHead.requests === 1,
    askedForOldHead.result.stdout || askedForOldHead.result.stderr,
  )
  const zeroWait = requestRun("zero-wait", { stdout: payload({ checks: [ciCheck("FAILURE")] }) }, { waitSeconds: "0" })
  T(
    `${TOOL}: a zero wait never requests, because asking and waiting no time would manufacture an absence`,
    zeroWait.result.status === 1 && zeroWait.plan?.verdict === "NO_REVIEW" && zeroWait.plan.reviewRequested === false && zeroWait.requestArgv === null,
    zeroWait.result.stdout || zeroWait.result.stderr,
  )
  /** The request must follow the second read and come before the third, so the first read decided nothing. */
  const requestedOnSecondRead = (entry) => {
    const reads = [...entry.result.stderr.matchAll(/"event":"REVIEW_THREAD_PAGE_READ"/g)].map((match) => match.index)
    const requestedAt = entry.result.stderr.indexOf('"event":"REVIEW_REQUESTED"')
    return reads.length >= 2 && requestedAt > reads[1] && (reads.length === 2 || requestedAt < reads[2])
  }
  const oldHeadReview = botReview("CHANGES_REQUESTED", "2026-08-04T21:00:00Z", OLD_HEAD, "The old head has a finding.", "PRR_kwDOR5Siws8AAAABNo7Old")
  const oldHeadActivity = JSON.stringify(activity(OLD_HEAD, "2026-08-04T20:00:00Z"))
  const oldHeadRead = payload({ headRefOid: OLD_HEAD, checks: [ciCheck()], reviews: [oldHeadReview] })
  const headLag = requestRun("head-lag", sequence("head-lag", [
    oldHeadRead,
    payload({ checks: [], reviews: [oldHeadReview] }),
    payload({ checks: [approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z")], reviews: [oldHeadReview, botReview("APPROVED", "2026-08-05T10:00:00Z")] }),
  ]), { argv: ["--head", HEAD], activities: sequence("head-lag-activity", [oldHeadActivity, JSON.stringify(activity())]) })
  T(
    `${TOOL}: --head reads again while GitHub still reports the reviewed previous head, then asks exactly once for the pushed head`,
    headLag.result.status === 0 && headLag.plan?.verdict === "REVIEWED" && headLag.plan.reviewedCommit === HEAD && headLag.requests === 1 &&
      requestedOnSecondRead(headLag) && /"event":"HEAD_WAITING"/.test(headLag.result.stderr),
    headLag.result.stdout || headLag.result.stderr,
  )
  const headAbsent = requestRun("head-absent", { stdout: oldHeadRead }, { waitSeconds: "2", argv: ["--head", HEAD], activities: { stdout: oldHeadActivity } })
  T(
    `${TOOL}: --head exits 2 with both heads named and posts nothing when the pushed head never arrives inside the budget`,
    headAbsent.result.status === 2 && headAbsent.plan === null && headAbsent.requestArgv === null &&
      headAbsent.result.stderr.includes(`reports head ${OLD_HEAD}, not the expected ${HEAD}`),
    headAbsent.result.stdout || headAbsent.result.stderr,
  )
  const headAbsentZeroWait = requestRun("head-absent-zero-wait", { stdout: oldHeadRead }, { waitSeconds: "0", argv: ["--head", HEAD], activities: { stdout: oldHeadActivity } })
  T(
    `${TOOL}: --head with a zero wait never reports the verdict of another head`,
    headAbsentZeroWait.result.status === 2 && headAbsentZeroWait.plan === null && headAbsentZeroWait.requestArgv === null,
    headAbsentZeroWait.result.stdout || headAbsentZeroWait.result.stderr,
  )
  check(TOOL, "refuses a --head that is not a full commit SHA", ["--pr", "681", "--repo", "ui", "--head", "0f4abca"], { status: 2, stderr: /--head must be a full 40-character commit SHA/ })

  const lateActivity = (name) => sequence(name, [oldHeadActivity, JSON.stringify(activity())])
  const askedBeforeActivity = requestRun("asked-before-activity", { stdout: payload({ checks: [ciCheck()], comments: [requestComment("2026-08-04T22:30:00Z")] }) },
    { waitSeconds: "3", activities: lateActivity("asked-before-activity-list") })
  T(
    `${TOOL}: a request already posted for a head whose push the activity does not list yet is not posted twice`,
    askedBeforeActivity.result.status === 1 && askedBeforeActivity.plan?.verdict === "NO_REVIEW" && askedBeforeActivity.requestArgv === null &&
      askedBeforeActivity.plan.existingRequestUrl === REQUEST_URL,
    askedBeforeActivity.result.stdout || askedBeforeActivity.result.stderr,
  )
  const pushListedLate = requestRun("push-listed-late", sequence("push-listed-late", [payload({ checks: [] }), payload({ checks: [] }), reviewLands([])]),
    { activities: lateActivity("push-listed-late-list") })
  T(
    `${TOOL}: a head whose push the activity lists on the second read is requested once, on that read`,
    pushListedLate.result.status === 0 && pushListedLate.plan?.verdict === "REVIEWED" && pushListedLate.requests === 1 && requestedOnSecondRead(pushListedLate),
    pushListedLate.result.stdout || pushListedLate.result.stderr,
  )
  const pushNeverListed = requestRun("push-never-listed", { stdout: payload({ checks: [] }) }, { waitSeconds: "2", activities: { stdout: oldHeadActivity } })
  T(
    `${TOOL}: a head whose push the activity never lists gets no request, because no review of it can be proven current`,
    pushNeverListed.result.status === 1 && pushNeverListed.plan?.verdict === "NO_REVIEW" && pushNeverListed.plan.reviewRequested === false &&
      pushNeverListed.requestArgv === null && /no matching head activity/.test(pushNeverListed.plan.note ?? ""),
    pushNeverListed.result.stdout || pushNeverListed.result.stderr,
  )
  const forkRequest = requestRun("fork-head", { stdout: payload({ checks: [], headRepositoryName: "fork/orbit-ui-mobile" }) }, { waitSeconds: "2" })
  T(
    `${TOOL}: a head from another repository gets no request, and the wait for its push does not start`,
    forkRequest.result.status === 1 && forkRequest.plan?.verdict === "NO_REVIEW" && forkRequest.requestArgv === null &&
      /different repository/.test(forkRequest.plan.note ?? "") && !/"event":"HEAD_WAITING"/.test(forkRequest.result.stderr),
    forkRequest.result.stdout || forkRequest.result.stderr,
  )

  /**
   * A push after the pushed head ends the wait. The verdict of the newer head is not the verdict that
   * the caller asked for, so the exit code is the one that wait-ci.mjs gives a moved head.
   */
  const laterHeadActivity = JSON.stringify(activity(REPOINTED_HEAD, "2026-08-05T09:00:00Z"))
  const laterHeadReviewed = payload({ headRefOid: REPOINTED_HEAD, checks: [approvalCheck("COMPLETED", "SUCCESS", "2026-08-05T10:01:00Z")], reviews: [botReview("APPROVED", "2026-08-05T10:00:00Z", REPOINTED_HEAD)] })
  const headMoved = requestRun("head-moved", sequence("head-moved", [payload({ checks: [] }), laterHeadReviewed]),
    { argv: ["--head", HEAD], activities: sequence("head-moved-activity", [JSON.stringify(activity()), laterHeadActivity]) })
  T(
    `${TOOL}: --head ends the wait with exit 4 and no verdict when a later push moves the head, even when the later head is approved`,
    headMoved.result.status === 4 && headMoved.plan === null && headMoved.requests === 1 && /"event":"HEAD_MOVED"/.test(headMoved.result.stderr) &&
      headMoved.result.stderr.includes(`moved from the expected ${HEAD} to ${REPOINTED_HEAD}`),
    headMoved.result.stdout || headMoved.result.stderr,
  )
  const headMovedUnasked = requestRun("head-moved-unasked", sequence("head-moved-unasked", [payload({ checks: [] }), laterHeadReviewed]),
    { waitSeconds: "6", argv: ["--head", HEAD], activities: sequence("head-moved-unasked-activity", [oldHeadActivity, laterHeadActivity]) })
  T(
    `${TOOL}: --head exits 4 and asks nothing when the head moves before the push of the expected head is listed`,
    headMovedUnasked.result.status === 4 && headMovedUnasked.plan === null && headMovedUnasked.requestArgv === null,
    headMovedUnasked.result.stdout || headMovedUnasked.result.stderr,
  )
  const withoutHead = requestRun("head-moved-no-flag", sequence("head-moved-no-flag", [payload({ checks: [] }), laterHeadReviewed]),
    { activities: sequence("head-moved-no-flag-activity", [JSON.stringify(activity()), laterHeadActivity]) })
  T(
    `${TOOL}: without --head the tool still reports the head that GitHub reports, with its commit named`,
    withoutHead.result.status === 0 && withoutHead.plan?.verdict === "REVIEWED" && withoutHead.plan.reviewedCommit === REPOINTED_HEAD,
    withoutHead.result.stdout || withoutHead.result.stderr,
  )
  const waitCiUsage = run("wait-ci.mjs", ["--help"]).stdout
  const ownUsage = run(TOOL, ["--help"]).stdout
  T(
    `${TOOL}: the moved-head exit code is the one that wait-ci.mjs documents`,
    /\b4 head moved/.test(waitCiUsage) && /\b4 the head moved/.test(ownUsage),
    `${waitCiUsage}\n${ownUsage}`,
  )

  /**
   * Two runs for one head at the same time both read before GitHub can show the request of the other
   * run. The slow comment stub keeps the first post open while the second run decides.
   */
  const spawnTool = (argv, env) => new Promise((resolve) => {
    const child = spawn(process.execPath, [testedToolPath, ...argv], { cwd: REPO_ROOT, env: { ...process.env, ...env } })
    const output = { stdout: "", stderr: "" }
    child.stdout.on("data", (chunk) => { output.stdout += chunk })
    child.stderr.on("data", (chunk) => { output.stderr += chunk })
    child.once("close", (status) => resolve({ status, ...output }))
  })
  const concurrentRun = async (name) => {
    const { requestArgv, env } = requestEnv(name, { stdout: payload({ checks: [] }) }, { stdout: JSON.stringify(activity()) }, { delayMs: 1500 })
    const result = await spawnTool(["--pr", "681", "--repo", "ui", "--wait-seconds", "8", "--poll-seconds", "1"], env)
    return { result, plan: parsed(result), posted: existsSync(requestArgv) }
  }
  rmSync(requestLedger, { force: true })
  const concurrentRuns = await Promise.all([concurrentRun("concurrent-first"), concurrentRun("concurrent-second")])
  const posters = concurrentRuns.filter((entry) => entry.posted)
  const followers = concurrentRuns.filter((entry) => !entry.posted)
  T(
    `${TOOL}: two runs for one head at the same time post exactly one request, and the other run names that request`,
    posters.length === 1 && followers.length === 1 && concurrentRuns.every((entry) => entry.result.status === 1 && entry.plan?.verdict === "NO_REVIEW") &&
      posters[0].plan.reviewRequested === true && followers[0].plan.reviewRequested === false &&
      followers[0].plan.existingRequestUrl === REQUEST_URL && /no second request/.test(followers[0].plan.note ?? ""),
    concurrentRuns.map((entry) => `posted=${entry.posted} exit=${entry.result.status} ${entry.result.stdout || entry.result.stderr}`).join("\n"),
  )
  const pushedAgain = requestRun("pushed-again", { stdout: payload({ checks: [] }) },
    { waitSeconds: "2", keepLedger: true, activities: { stdout: JSON.stringify(activity(HEAD, "2026-08-04T23:00:00Z")) } })
  T(
    `${TOOL}: a later push of the same commit is a new request, because the recorded request belongs to the earlier push`,
    pushedAgain.result.status === 1 && pushedAgain.plan?.reviewRequested === true && pushedAgain.requests === 1,
    pushedAgain.result.stdout || pushedAgain.result.stderr,
  )
  const requestCases = [greenHead, runningHead, justPushed, failingHead, unanswered, reviewedHead, fixPush, alreadyAsked, askedByStranger, askedForOldHead, zeroWait,
    headLag, headAbsent, headAbsentZeroWait, askedBeforeActivity, pushListedLate, pushNeverListed, forkRequest, headMoved, headMovedUnasked, withoutHead, pushedAgain]
  T(
    `${TOOL}: no request case reads branch protection`,
    requestCases.every((entry) => !entry.protectionRead),
    JSON.stringify(requestCases.map((entry) => entry.protectionRead)),
  )

  for (const incompleteState of ["PENDING", "DISMISSED"]) {
    const incomplete = readPr(payload({ reviews: [botReview(incompleteState)] }))
    T(
      `${TOOL}: a ${incompleteState} review cannot satisfy current-head readiness`,
      incomplete.status === 1 && parsed(incomplete)?.verdict === "NO_REVIEW",
      incomplete.stdout || incomplete.stderr,
    )
  }

  /**
   * Pullfrog reviews draft pull requests, so a draft is read exactly like any other one. Reporting a
   * draft as a verdict of its own would stop the caller looking at a review that really exists.
   */
  const draftReviewed = readPr(payload({ isDraft: true, reviews: [botReview()] }))
  T(
    `${TOOL}: a draft carrying a review is REVIEWED, because Pullfrog reviews drafts`,
    draftReviewed.status === 0 && parsed(draftReviewed)?.verdict === "REVIEWED" && parsed(draftReviewed)?.isDraft === true,
    draftReviewed.stdout || draftReviewed.stderr,
  )
  const draftUnreviewed = readPr(payload({ isDraft: true }))
  T(
    `${TOOL}: a draft with no review is NO_REVIEW and still reports that it is a draft`,
    draftUnreviewed.status === 1 && parsed(draftUnreviewed)?.verdict === "NO_REVIEW" && parsed(draftUnreviewed)?.isDraft === true,
    draftUnreviewed.stdout || draftUnreviewed.stderr,
  )

  const one = readPr(payload({ reviews: [botReview()], threads: [thread()] }))
  const onePlan = parsed(one)
  T(
    `${TOOL}: a thread is reported with its path and its first readable claim line`,
    onePlan?.threads[0]?.path === "tools/launch-worker.mjs" && onePlan.threads[0].claim === "Honor the configured timeout for every GitHub child",
    one.stdout || one.stderr,
  )
  T(`${TOOL}: the unresolved count is reported separately from the total`, onePlan?.counts.total === 1 && onePlan.counts.unresolved === 1, one.stdout)
  T(
    `${TOOL}: the thread id is recorded for the run that read it`,
    readObservedIdentifiers(uiContext.path, { runIdentifier: RUN_IDENTIFIER }).some((entry) => entry.id === thread().id),
    JSON.stringify(readObservedIdentifiers(uiContext.path, { runIdentifier: RUN_IDENTIFIER })),
  )
  T(
    `${TOOL}: another run cannot borrow the recorded thread id`,
    readObservedIdentifiers(uiContext.path, { runIdentifier: "another-run" }).length === 0,
    JSON.stringify(readObservedIdentifiers(uiContext.path, { runIdentifier: "another-run" })),
  )

  const pagedSequence = stage("list-bot-threads/page-sequence", "0")
  const paged = run(TOOL, ["--pr", "681", "--repo", "ui", "--wait-seconds", "0"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "/activity?", stdout: JSON.stringify(activity()) },
    { match: "api graphql", stdoutSequence: [
      payload({ reviews: [botReview()], threads: [thread({ id: "PRRT_page_one" })], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } }),
      payload({ reviews: [botReview()], threads: [thread({ id: "PRRT_page_two" })], pageInfo: { hasNextPage: false, endCursor: null } }),
    ], sequenceFile: pagedSequence },
  ]) })
  const pagedPlan = parsed(paged)
  T(`${TOOL}: review threads are fully paginated before counts are reported`, paged.status === 0 && pagedPlan?.threadsComplete === true && pagedPlan?.counts.pages === 2 && pagedPlan.counts.total === 2 && pagedPlan.counts.unresolved === 2, paged.stdout || paged.stderr)
  T(`${TOOL}: every review-thread page emits structured progress`, /"event":"REVIEW_THREAD_PAGE_READ"[\s\S]*"page":2/.test(paged.stderr), paged.stderr)

  const cycleSequence = stage("list-bot-threads/cycle-sequence", "0")
  const cycle = run(TOOL, ["--pr", "681", "--repo", "ui", "--wait-seconds", "0"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "api graphql", stdoutSequence: [
      payload({ reviews: [botReview()], pageInfo: { hasNextPage: true, endCursor: "repeated" } }),
      payload({ reviews: [botReview()], pageInfo: { hasNextPage: true, endCursor: "repeated" } }),
    ], sequenceFile: cycleSequence },
  ]) })
  T(`${TOOL}: a repeated review-thread cursor fails closed instead of looping`, cycle.status === 2 && /repeated an endCursor/.test(cycle.stderr), cycle.stderr || cycle.stdout)

  /** isOutdated is GitHub saying the code moved, NOT that anyone handled the finding. */
  const outdated = readPr(payload({ reviews: [botReview()], threads: [thread({ isOutdated: true })] }))
  T(`${TOOL}: an outdated unresolved thread is still surfaced`, parsed(outdated)?.threads[0]?.isOutdated === true && parsed(outdated)?.counts.unresolved === 1, outdated.stdout || outdated.stderr)

  const resolvedOnly = readPr(payload({ reviews: [botReview()], threads: [thread({ isResolved: true })] }))
  T(`${TOOL}: a resolved thread counts toward the total but not the unresolved count`, parsed(resolvedOnly)?.counts.total === 1 && parsed(resolvedOnly)?.counts.unresolved === 0, resolvedOnly.stdout || resolvedOnly.stderr)

  /**
   * Pullfrog publishes no severity, so every finding is blocking until the caller triages it. The
   * body below CONTAINS the text "P2", which is exactly the shape a severity parser would read as a
   * downgrade. Reporting P1 anyway is what proves no parser is guessing a severity nobody posts.
   */
  const looksGraded = readPr(payload({ reviews: [botReview()], threads: [thread({ body: "This P2 call site drops the error." })] }))
  T(`${TOOL}: a thread whose text mentions P2 is still reported as P1, never downgraded`, parsed(looksGraded)?.threads[0]?.severity === "P1", looksGraded.stdout || looksGraded.stderr)
  T(`${TOOL}: a thread with no severity text at all is reported as P1 too`, parsed(one)?.threads[0]?.severity === "P1", one.stdout || one.stderr)

  const human = readPr(payload({ reviews: [botReview()], threads: [thread({ login: "thomasluizon", body: "looks fine to me" })] }))
  T(`${TOOL}: a human-authored thread is excluded from the reviewer's list`, parsed(human)?.counts.total === 0, human.stdout || human.stderr)

  const otherBot = readPr(payload({ reviews: [{ author: { login: "sonarqubecloud" }, state: "COMMENTED", submittedAt: "2026-08-04T23:00:00Z", commit: { oid: HEAD } }] }))
  T(`${TOOL}: another bot's review does not stand in for Pullfrog's`, otherBot.status === 1 && parsed(otherBot)?.verdict === "NO_REVIEW", otherBot.stdout || otherBot.stderr)

  const stale = readPr(payload({ reviews: [botReview("APPROVED", "2026-08-04T23:16:35Z", OLD_HEAD)], threads: [thread()] }))
  const stalePlan = parsed(stale)
  T(
    `${TOOL}: a review pinned to an older head is NO_REVIEW, never REVIEWED`,
    stale.status === 1 && stalePlan?.verdict === "NO_REVIEW",
    stale.stdout || stale.stderr,
  )
  T(
    `${TOOL}: NO_REVIEW names the stale commit and the head, so the caller knows to re-request`,
    stalePlan?.staleReviewCommit === OLD_HEAD && stalePlan.headRefOid === HEAD && /@pullfrog review/.test(stalePlan.note ?? ""),
    stale.stdout,
  )
  /** GitHub's PR 1107 reports the old review with the later merge head's oid. */
  const repointed = readPr(payload({
    headRefOid: REPOINTED_HEAD,
    reviews: [botReview("APPROVED", "2026-09-25T21:50:13Z", "4cc1f620dae30df23b09cdbfb7ceb69a45fe35cf")],
  }))
  T(`${TOOL}: PR 1107's repointed older review is NO_REVIEW`,
    repointed.status === 1 && parsed(repointed)?.verdict === "NO_REVIEW" &&
      parsed(repointed)?.staleReviewCommit === "4cc1f620dae30df23b09cdbfb7ceb69a45fe35cf",
    repointed.stdout || repointed.stderr)
  const reviewedAfterMerge = readPr(payload({
    headRefOid: REPOINTED_HEAD,
    reviews: [botReview("APPROVED", "2026-09-26T02:59:43Z", "4cc1f620dae30df23b09cdbfb7ceb69a45fe35cf")],
  }))
  T(`${TOOL}: PR 1107's later real review is REVIEWED`, reviewedAfterMerge.status === 0 && parsed(reviewedAfterMerge)?.verdict === "REVIEWED", reviewedAfterMerge.stdout || reviewedAfterMerge.stderr)
  const beforeSuite = readPr(payload({
    headRefOid: REPOINTED_HEAD,
    reviews: [botReview("APPROVED", "2026-09-26T02:48:44.500Z", REPOINTED_HEAD)],
  }))
  T(`${TOOL}: a review after the push but before the first suite is REVIEWED`,
    beforeSuite.status === 0 && parsed(beforeSuite)?.verdict === "REVIEWED", beforeSuite.stdout || beforeSuite.stderr)
  const atPushTime = readPr(payload({
    headRefOid: REPOINTED_HEAD,
    reviews: [botReview("APPROVED", "2026-09-26T02:48:44Z", REPOINTED_HEAD)],
  }))
  T(`${TOOL}: a review submitted exactly at the push is NO_REVIEW`, atPushTime.status === 1 && parsed(atPushTime)?.verdict === "NO_REVIEW", atPushTime.stdout || atPushTime.stderr)
  const noActivity = readPr(payload({ reviews: [botReview()] }), 0, [], [])
  T(`${TOOL}: no matching head activity means NO_REVIEW with a reason`, noActivity.status === 1 && /no matching head activity/.test(parsed(noActivity)?.note ?? ""), noActivity.stdout || noActivity.stderr)
  const forkHead = readPr(payload({ headRepositoryName: "fork/orbit-ui-mobile", reviews: [botReview()] }))
  T(`${TOOL}: a head from another repository is NO_REVIEW with a reason`, forkHead.status === 1 && /different repository/.test(parsed(forkHead)?.note ?? ""), forkHead.stdout || forkHead.stderr)
  const forcePush = readPr(payload({ reviews: [botReview()] }), 0, [], activity(HEAD, "2026-08-04T22:01:00Z", "force_push"))
  T(`${TOOL}: force_push activity establishes the head boundary`, forcePush.status === 0 && parsed(forcePush)?.verdict === "REVIEWED", forcePush.stdout || forcePush.stderr)
  const invalidActivity = readPr(payload({ reviews: [botReview()] }), 0, [], activity(HEAD, "invalid"))
  T(`${TOOL}: an unparseable activity time cannot prove a review current`, invalidActivity.status === 1 && /unparseable/.test(parsed(invalidActivity)?.note ?? ""), invalidActivity.stdout || invalidActivity.stderr)
  /**
   * NO_REVIEW is ambiguous unless it says whether anyone asked, and the two readings justify
   * different actions: a reviewer that was asked and stayed silent is evidence about the reviewer,
   * while one that was never triggered is evidence about us. A zero wait budget posts no request,
   * because asking and then waiting no time at all would report an absence it manufactured.
   */
  T(
    `${TOOL}: NO_REVIEW states whether the review was actually requested on this run`,
    stalePlan?.reviewRequested === false && /never have been triggered/.test(stalePlan.note ?? ""),
    stale.stdout,
  )

  const fresh = readPr(payload({ reviews: [botReview("APPROVED", "2026-08-04T23:16:35Z", OLD_HEAD), botReview("APPROVED", "2026-08-05T10:00:00Z", HEAD)] }))
  T(`${TOOL}: a fresh review after a stale one is accepted`, fresh.status === 0 && parsed(fresh)?.verdict === "REVIEWED" && parsed(fresh)?.reviewedCommit === HEAD, fresh.stdout || fresh.stderr)

  const noCommit = readPr(payload({ reviews: [{ author: { login: BOT }, state: "APPROVED", submittedAt: "2026-08-04T23:16:35Z", commit: null }] }))
  T(`${TOOL}: a review with no commit at all cannot be proven current, so it is not accepted`, noCommit.status === 1 && parsed(noCommit)?.verdict === "NO_REVIEW", noCommit.stdout || noCommit.stderr)

  const failing = readPr("", 1)
  T(`${TOOL}: a failing gh is an environment error, never a verdict`, failing.status === 2 && /gh api graphql.*failed/.test(failing.stderr), `exit ${failing.status}: ${failing.stderr || failing.stdout}`)

  const garbage = readPr("not json at all")
  T(`${TOOL}: unparseable gh output is an environment error`, garbage.status === 2 && /unparseable JSON/.test(garbage.stderr), `exit ${garbage.status}: ${garbage.stderr || garbage.stdout}`)

  const errors = readPr(JSON.stringify({ errors: [{ message: "Could not resolve to a Repository" }] }))
  T(`${TOOL}: a GraphQL errors payload is surfaced verbatim, not treated as empty`, errors.status === 2 && /Could not resolve to a Repository/.test(errors.stderr), `exit ${errors.status}: ${errors.stderr || errors.stdout}`)

  const missing = readPr(JSON.stringify({ data: { repository: { pullRequest: null } } }))
  T(`${TOOL}: a null pull request is an environment error`, missing.status === 2 && /returned no pull request/.test(missing.stderr), `exit ${missing.status}: ${missing.stderr || missing.stdout}`)

  const descendantPidFile = stage("list-bot-threads/descendant.pid", "")
  const hanging = run(TOOL, ["--pr", "681", "--repo", "ui", "--wait-seconds", "0", "--command-timeout-seconds", "1"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "api graphql", stdout: "", hangTreePidFile: descendantPidFile },
  ]) })
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  const descendantAlive = processIsRunning(descendantPid)
  T(`${TOOL}: a hanging GitHub read is bounded and reports its timeout`, hanging.status === 2 && /timed out after 1s/.test(hanging.stderr), hanging.stderr || hanging.stdout)
  T(`${TOOL}: a GitHub timeout removes the complete child process tree`, Number.isInteger(descendantPid) && !descendantAlive, `descendant ${descendantPid} still alive`)

  T(
    `${TOOL}: stdout carries ONE JSON object and nothing else`,
    (() => {
      try {
        return JSON.parse(clean.stdout).pr === 681
      } catch {
        return false
      }
    })(),
    clean.stdout,
  )
}
