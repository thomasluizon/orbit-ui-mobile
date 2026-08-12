import { readFileSync } from "node:fs"

import { readObservedIdentifiers } from "../lib/identifier-ledger.mjs"
import { processIsRunning, T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "list-bot-threads.mjs"
/**
 * The GraphQL spelling, because that is the only API this tool reads. Both spellings were read on
 * 2026-08-12: REST prints `pullfrog[bot]` and GraphQL prints `pullfrog` for the same review on pull
 * request 711.
 */
const BOT = "pullfrog"
const RUN_IDENTIFIER = "list-bot-threads-current-run"
let testedToolPath = null

/**
 * No Pullfrog review has opened a review thread in this repository yet, so no thread body has been
 * measured to copy. The markup below is the markup Pullfrog really writes: its review on pull
 * request 711, read 2026-08-12, used `**bold**` headings, markdown prose, and raw HTML including an
 * HTML comment block of review metadata. The assertions never depend on the wording, only on what
 * the tool must do with ANY body: strip the markup, take the first readable line, and report P1.
 */
const THREAD_BODY = "**Honor the configured timeout for every GitHub child**\n\nWhen the poller runs, this still uses the default bound.\n\n<!-- Pullfrog review metadata -->"

const thread = ({ id = "PRRT_kwDOR5Siws6Wfy_V", isResolved = false, isOutdated = false, path = "tools/launch-worker.mjs", line = 42, body = THREAD_BODY, login = BOT } = {}) => ({
  id,
  isResolved,
  isOutdated,
  path,
  line,
  comments: { nodes: [{ author: { login }, body }] },
})

const HEAD = "0f4abca78a0f4c487a98ab642508c06c6634f36f"
const OLD_HEAD = "b5cd7394a8a687126eaaec32c02978ad6575c01c"
const BASE = "c5cd7394a8a687126eaaec32c02978ad6575c01d"

const payload = ({ isDraft = false, reviews = [], comments = [], threads = [], headRefOid = HEAD, pageInfo = { hasNextPage: false, endCursor: null } } = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 681,
          isDraft,
          baseRefOid: BASE,
          headRefOid,
          reviews: { nodes: reviews },
          comments: { nodes: comments },
          reviewThreads: { pageInfo, nodes: threads },
        },
      },
    },
  })

/** APPROVED is the state Pullfrog really used for its clean pass on pull request 711. */
const botReview = (state = "APPROVED", submittedAt = "2026-08-04T23:16:35Z", oid = HEAD, body = "") => ({ author: { login: BOT }, state, submittedAt, body, commit: { oid } })
const ghPlan = (stdout, exit = 0) => ({
  ...orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "api graphql", stdout, exit },
  ]),
  CLAUDE_CODE_SESSION_ID: RUN_IDENTIFIER,
  CODEX_THREAD_ID: "",
})
const parsed = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const readPr = (stdout, exit = 0, argv = []) => run(TOOL, ["--pr", "https://github.com/thomasluizon/orbit-ui-mobile/pull/681", "--wait-seconds", "0", ...argv], { path: testedToolPath, env: ghPlan(stdout, exit) })

export const cases = () => {
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

  /**
   * THE ambiguity this tool exists to remove. Zero threads plus a real review is CLEAN; zero
   * threads and no review is NOT, and a caller reading the thread count alone cannot tell them
   * apart. The verdict is derived from the review, never from the count. Pull request 711 is the
   * live case: Pullfrog approved and opened no thread at all.
   */
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
    { match: "repo=orbit-api", stdout: payload({ reviews: [botReview()] }) },
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
  /**
   * Raised in review on this tool's own pull request (#682). Without the body a caller learns it is
   * blocked and NOTHING about why, because this verdict's whole complaint lives in the review body
   * and no thread carries it.
   */
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
  const commented = readPr(payload({ reviews: [botReview("COMMENTED")] }))
  T(
    `${TOOL}: a COMMENTED review is REVIEWED and carries no body, because there the threads hold the findings`,
    commented.status === 0 && parsed(commented)?.verdict === "REVIEWED" && parsed(commented)?.reviewBody === null,
    commented.stdout || commented.stderr,
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

  /**
   * Raised in review on this tool's own pull request (#682), and it was right. Pullfrog re-reviews
   * after a push, so between the push and the re-review its newest review still names the OLD head.
   * Accepting it reports REVIEWED for code Pullfrog never saw, which is the very defect this tool
   * exists to remove. A review is evidence about its own commit and nothing else.
   */
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
