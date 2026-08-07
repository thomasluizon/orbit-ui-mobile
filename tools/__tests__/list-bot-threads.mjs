import { readFileSync } from "node:fs"

import { T, check, orcaEnv, run, stage } from "./_harness.mjs"

const TOOL = "list-bot-threads.mjs"
const BOT = "chatgpt-codex-connector"

/**
 * Every field below was read off a REAL `gh api graphql` response against PR #681 on 2026-08-05
 * before being written down, per CLAUDE.md standard 8. The severity badge is shields.io markup
 * nested inside <sub> tags, which is why the tool strips HTML before taking the claim line.
 */
const P2_BODY = "**<sub><sub>![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat)</sub></sub> Honor --codex-only for review launches**\n\nWhen the review path is invoked with `--codex-only`, this still selects config.reviewer."

const thread = ({ id = "PRRT_kwDOR5Siws6Wfy_V", isResolved = false, isOutdated = false, path = "tools/launch-worker.mjs", line = 42, body = P2_BODY, login = BOT } = {}) => ({
  id,
  isResolved,
  isOutdated,
  path,
  line,
  comments: { nodes: [{ author: { login }, body }] },
})

const HEAD = "0f4abca78a0f4c487a98ab642508c06c6634f36f"
const OLD_HEAD = "b5cd7394a8a687126eaaec32c02978ad6575c01c"

const payload = ({ isDraft = false, reviews = [], comments = [], threads = [], headRefOid = HEAD } = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 681,
          isDraft,
          headRefOid,
          reviews: { nodes: reviews },
          comments: { nodes: comments },
          reviewThreads: { nodes: threads },
        },
      },
    },
  })

const botReview = (state = "COMMENTED", submittedAt = "2026-08-04T23:16:35Z", oid = HEAD, body = "") => ({ author: { login: BOT }, state, submittedAt, body, commit: { oid } })
const botComment = (oid = HEAD.slice(0, 10), createdAt = "2026-08-05T11:00:00Z") => ({
  author: { login: `${BOT}[bot]` },
  body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${oid}\``,
  createdAt,
  url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/681#issuecomment-123",
})
const ghPlan = (stdout, exit = 0) => orcaEnv([
  { match: "auth token --user thomasluizon", stdout: "test-github-token" },
  { match: "api graphql", stdout, exit },
])
const parsed = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const readPr = (stdout, exit = 0) => run(TOOL, ["--pr", "https://github.com/thomasluizon/orbit-ui-mobile/pull/681", "--wait-seconds", "0"], { env: ghPlan(stdout, exit) })

export const cases = () => {
  check(TOOL, "refuses a missing pull request", ["--wait-seconds", "0"], { status: 2, stderr: /--pr must be a pull request number or full GitHub/ })
  check(TOOL, "refuses a non-numeric pull request number", ["--pr", "abc"], { status: 2, stderr: /--pr must be a pull request number or full GitHub/ })
  check(TOOL, "a bare pull request number requires an explicit repository", ["--pr", "681"], { status: 2, stderr: /bare pull request number requires --repo/ })
  check(TOOL, "refuses an unknown repository", ["--pr", "681", "--repo", "ghost"], { status: 2, stderr: /--repo must name a configured repository/ })
  check(TOOL, "refuses a negative wait budget", ["--pr", "681", "--repo", "ui", "--wait-seconds", "-5"], { status: 2, stderr: /--wait-seconds must be an integer/ })
  check(TOOL, "refuses a zero poll interval", ["--pr", "681", "--repo", "ui", "--poll-seconds", "0"], { status: 2, stderr: /--poll-seconds must be an integer >= 1/ })
  check(TOOL, "refuses a zero command timeout", ["--pr", "681", "--repo", "ui", "--command-timeout-seconds", "0"], { status: 2, stderr: /--command-timeout-seconds must be an integer >= 1/ })

  /**
   * THE ambiguity this tool exists to remove. Zero threads plus a real review is CLEAN; zero
   * threads and no review is NOT, and a caller reading the thread count alone cannot tell them
   * apart. The verdict is derived from the review, never from the count.
   */
  const clean = readPr(payload({ reviews: [botReview()] }))
  const cleanPlan = parsed(clean)
  T(
    `${TOOL}: a review with zero threads is REVIEWED and exits 0`,
    clean.status === 0 && cleanPlan?.verdict === "REVIEWED" && cleanPlan.counts.total === 0 && cleanPlan.reviewedAt === "2026-08-04T23:16:35Z",
    clean.stdout || clean.stderr,
  )
  T(`${TOOL}: every read emits structured progress on stderr`, /"event":"CODEX_REVIEW_STATE_READ"/.test(clean.stderr), clean.stderr)

  const apiNumber = run(TOOL, ["--pr", "681", "--repo", "api", "--wait-seconds", "0"], { env: orcaEnv([
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

  const cleanComment = readPr(payload({ comments: [botComment()] }))
  const cleanCommentPlan = parsed(cleanComment)
  T(
    `${TOOL}: a clean connector issue comment for the current head is REVIEWED`,
    cleanComment.status === 0 && cleanCommentPlan?.verdict === "REVIEWED" && cleanCommentPlan.reviewSource === "ISSUE_COMMENT" && cleanCommentPlan.reviewedCommit === HEAD && cleanCommentPlan.reportedCommit === HEAD.slice(0, 10),
    cleanComment.stdout || cleanComment.stderr,
  )

  const staleComment = readPr(payload({ comments: [botComment(OLD_HEAD.slice(0, 10))] }))
  const staleCommentPlan = parsed(staleComment)
  T(
    `${TOOL}: a clean connector issue comment for an old head is NO_REVIEW`,
    staleComment.status === 1 && staleCommentPlan?.verdict === "NO_REVIEW" && staleCommentPlan.staleReviewCommit === OLD_HEAD.slice(0, 10),
    staleComment.stdout || staleComment.stderr,
  )

  const humanComment = readPr(payload({ comments: [{ ...botComment(), author: { login: "thomasluizon" } }] }))
  T(`${TOOL}: a human copy of the connector comment cannot satisfy review`, humanComment.status === 1 && parsed(humanComment)?.verdict === "NO_REVIEW", humanComment.stdout || humanComment.stderr)

  /** A body-level CHANGES_REQUESTED opens no thread at all, so a thread count of 0 is not clean. */
  const changes = readPr(payload({ reviews: [botReview("CHANGES_REQUESTED", "2026-08-04T23:16:35Z", HEAD, "The migration drops a column old clients still read.")] }))
  const changesPlan = parsed(changes)
  T(
    `${TOOL}: CHANGES_REQUESTED with zero threads is reported as blocked, not clean`,
    changes.status === 0 && changesPlan?.verdict === "CHANGES_REQUESTED" && changesPlan.counts.total === 0,
    changes.stdout || changes.stderr,
  )
  /**
   * Raised by the Codex reviewer on this pull request (#682, P2). Without the body a caller learns
   * it is blocked and NOTHING about why, because this verdict's whole complaint lives in the review
   * body and no thread carries it.
   */
  T(
    `${TOOL}: CHANGES_REQUESTED carries the review body, which is its only statement of the problem`,
    changesPlan?.reviewBody === "The migration drops a column old clients still read.",
    changes.stdout,
  )
  T(
    `${TOOL}: a COMMENTED review carries no body, because there the threads hold the findings`,
    parsed(clean)?.reviewBody === null,
    clean.stdout,
  )

  /** A draft attracts no review ever, so the wait budget must not be spent discovering that. */
  const draft = run(TOOL, ["--pr", "https://github.com/thomasluizon/orbit-ui-mobile/pull/681", "--wait-seconds", "600", "--poll-seconds", "1"], { env: ghPlan(payload({ isDraft: true })) })
  const draftPlan = parsed(draft)
  T(
    `${TOOL}: a draft is reported immediately as DRAFT without consuming the wait budget`,
    draft.status === 1 && draftPlan?.verdict === "DRAFT" && draftPlan.isDraft === true,
    draft.stdout || draft.stderr,
  )

  const one = readPr(payload({ reviews: [botReview()], threads: [thread()] }))
  const onePlan = parsed(one)
  T(
    `${TOOL}: a P2 thread is parsed with its severity, path and claim`,
    onePlan?.threads[0]?.severity === "P2" && onePlan.threads[0].path === "tools/launch-worker.mjs" && onePlan.threads[0].claim === "Honor --codex-only for review launches",
    one.stdout || one.stderr,
  )
  T(`${TOOL}: the unresolved count is reported separately from the total`, onePlan?.counts.total === 1 && onePlan.counts.unresolved === 1, one.stdout)

  /** #681's real shape: outdated means the code moved, NOT that anyone handled the finding. */
  const outdated = readPr(payload({ reviews: [botReview()], threads: [thread({ isOutdated: true })] }))
  T(`${TOOL}: an outdated unresolved thread is still surfaced`, parsed(outdated)?.threads[0]?.isOutdated === true && parsed(outdated)?.counts.unresolved === 1, outdated.stdout || outdated.stderr)

  const resolvedOnly = readPr(payload({ reviews: [botReview()], threads: [thread({ isResolved: true })] }))
  T(`${TOOL}: a resolved thread counts toward the total but not the unresolved count`, parsed(resolvedOnly)?.counts.total === 1 && parsed(resolvedOnly)?.counts.unresolved === 0, resolvedOnly.stdout || resolvedOnly.stderr)

  /** Fail closed. A severity nobody can read is the one most likely to matter. */
  const unparseable = readPr(payload({ reviews: [botReview()], threads: [thread({ body: "no badge here at all" })] }))
  T(`${TOOL}: a thread with no parseable badge is reported as P1, never downgraded`, parsed(unparseable)?.threads[0]?.severity === "P1", unparseable.stdout || unparseable.stderr)

  const human = readPr(payload({ reviews: [botReview()], threads: [thread({ login: "thomasluizon", body: "looks fine to me" })] }))
  T(`${TOOL}: a human-authored thread is excluded from the bot's list`, parsed(human)?.counts.total === 0, human.stdout || human.stderr)

  const otherBot = readPr(payload({ reviews: [{ author: { login: "sonarqubecloud" }, state: "COMMENTED", submittedAt: "2026-08-04T23:00:00Z", commit: { oid: HEAD } }] }))
  T(`${TOOL}: another bot's review does not satisfy the Codex reviewer`, otherBot.status === 1 && parsed(otherBot)?.verdict === "NO_REVIEW", otherBot.stdout || otherBot.stderr)

  /**
   * Raised by the Codex reviewer on this tool's own pull request (#682, P1), and it was right. The
   * bot never reviews on a push, so after any fixup its newest review still names the OLD head.
   * Accepting it reports REVIEWED for code the bot never saw, which is the very defect this tool
   * exists to remove. A review is evidence about its own commit and nothing else.
   */
  const stale = readPr(payload({ reviews: [botReview("COMMENTED", "2026-08-04T23:16:35Z", OLD_HEAD)], threads: [thread()] }))
  const stalePlan = parsed(stale)
  T(
    `${TOOL}: a review pinned to an older head is NO_REVIEW, never REVIEWED`,
    stale.status === 1 && stalePlan?.verdict === "NO_REVIEW",
    stale.stdout || stale.stderr,
  )
  T(
    `${TOOL}: NO_REVIEW names the stale commit and the head, so the caller knows to re-request`,
    stalePlan?.staleReviewCommit === OLD_HEAD && stalePlan.headRefOid === HEAD && /@codex review/.test(stalePlan.note ?? ""),
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

  const fresh = readPr(payload({ reviews: [botReview("COMMENTED", "2026-08-04T23:16:35Z", OLD_HEAD), botReview("COMMENTED", "2026-08-05T10:00:00Z", HEAD)] }))
  T(`${TOOL}: a fresh review after a stale one is accepted`, fresh.status === 0 && parsed(fresh)?.verdict === "REVIEWED" && parsed(fresh)?.reviewedCommit === HEAD, fresh.stdout || fresh.stderr)

  const noCommit = readPr(payload({ reviews: [{ author: { login: BOT }, state: "COMMENTED", submittedAt: "2026-08-04T23:16:35Z", commit: null }] }))
  T(`${TOOL}: a review with no commit at all cannot be proven current, so it is not accepted`, noCommit.status === 1 && parsed(noCommit)?.verdict === "NO_REVIEW", noCommit.stdout || noCommit.stderr)

  const failing = readPr("", 1)
  T(`${TOOL}: a failing gh is an environment error, never a verdict`, failing.status === 2 && /gh api graphql failed/.test(failing.stderr), `exit ${failing.status}: ${failing.stderr || failing.stdout}`)

  const garbage = readPr("not json at all")
  T(`${TOOL}: unparseable gh output is an environment error`, garbage.status === 2 && /unparseable JSON/.test(garbage.stderr), `exit ${garbage.status}: ${garbage.stderr || garbage.stdout}`)

  const errors = readPr(JSON.stringify({ errors: [{ message: "Could not resolve to a Repository" }] }))
  T(`${TOOL}: a GraphQL errors payload is surfaced verbatim, not treated as empty`, errors.status === 2 && /Could not resolve to a Repository/.test(errors.stderr), `exit ${errors.status}: ${errors.stderr || errors.stdout}`)

  const missing = readPr(JSON.stringify({ data: { repository: { pullRequest: null } } }))
  T(`${TOOL}: a null pull request is an environment error`, missing.status === 2 && /returned no pull request/.test(missing.stderr), `exit ${missing.status}: ${missing.stderr || missing.stdout}`)

  const descendantPidFile = stage("list-bot-threads/descendant.pid", "")
  const hanging = run(TOOL, ["--pr", "681", "--repo", "ui", "--wait-seconds", "0", "--command-timeout-seconds", "1"], { env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "api graphql", stdout: "", hangTreePidFile: descendantPidFile },
  ]) })
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  let descendantAlive = false
  try {
    process.kill(descendantPid, 0)
    descendantAlive = true
  } catch {
    descendantAlive = false
  }
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
