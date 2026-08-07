#!/usr/bin/env node
/**
 * Report what the GitHub Codex reviewer said about ONE pull request, and make "it never reviewed"
 * a verdict the caller can branch on rather than a silence it reads as approval.
 *
 * /orchestrate hands Thomas a pull request it calls reviewed. A second reviewer reviews that same
 * pull request and nothing in the harness has ever read it. Measured 2026-08-05 across PRs #676,
 * #680 and #681: eight inline threads opened, eight still unresolved, all three merged.
 *
 * Two shapes make a naive reading wrong, and both are handled here rather than documented:
 *
 *   1. An empty thread list is ambiguous between "reviewed, found nothing" and "has not reviewed
 *      yet". The verdict is therefore derived from a current-head bot Review or measured clean
 *      issue comment, never from the thread count.
 *   2. A body-level CHANGES_REQUESTED opens no review thread at all, so zero unresolved threads is
 *      not proof of a clean pull request. Both surfaces are read in one query.
 *
 * A draft pull request attracts no Codex review ever, so waiting on one burns the whole budget and
 * then reports a reviewer that was never going to run. Draft is checked before the clock starts.
 *
 * It reads. It never replies, resolves, or fixes: tools/resolve-bot-thread.mjs owns the mutations.
 */

import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const BOT_LOGIN = "chatgpt-codex-connector"

const USAGE = `usage: list-bot-threads.mjs --pr <number|url> (--repo <ui|api|landing> | URL) [options]

  --pr <number|url>   the pull request to read (required)
  --repo <key>        required for a bare number; a full PR URL selects its repository
  --wait-seconds <n>  how long to wait for the bot review to land (default 900, 0 polls once)
  --poll-seconds <n>  gap between polls (default 30)
  --command-timeout-seconds <n>  hard bound for each gh child (default 45)
  --bot <login>       reviewer login to filter on (default ${BOT_LOGIN})
  --no-request        do NOT post "@codex review" first; wait for a review that
                      may never have been triggered (default: request it)
  --help, -h          print this usage and exit 0

The bot reviews on open, on ready-for-review, and on an explicit "@codex review" comment. Whether it
re-reviews after a plain push is NOT reliable (#676 never did, #682 did), so a review is accepted
only when its commit is the current head. 900 covers the longest lag observed on a real pull request
(564s on #676) with margin.

Prints ONE JSON object on stdout: pr, isDraft, verdict, reviewedAt, reviewState, threads[].
Errors go to stderr.

  verdict  REVIEWED      a bot Review or clean issue comment OF THE CURRENT HEAD exists;
                         threads[] may be empty (clean)
           CHANGES_REQUESTED  a bot review of the current head exists and requests changes
           DRAFT         the pull request is a draft, so no review will ever arrive
           NO_REVIEW     no bot review of this head inside the budget. staleReviewCommit names
                         the commit an older review WAS given on, when there is one

A review is evidence about the commit it was given on and nothing else. One pinned to an older
head is NOT accepted: after any push the newest bot review still names the old commit, and taking
it would report REVIEWED for code the bot never saw.

  threads[]  id, isResolved, isOutdated, path, line, severity, claim

Severity is parsed from the P1/P2/P3 badge the bot stamps in the comment body. A thread whose
severity cannot be parsed is reported as P1: an unreadable severity is never downgraded.

exit codes: 0 REVIEWED or CHANGES_REQUESTED, 1 NO_REVIEW or DRAFT, 2 usage or environment error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const VALUE_FLAGS = new Set(["--pr", "--repo", "--wait-seconds", "--poll-seconds", "--command-timeout-seconds", "--bot"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--no-request", "--help", "-h"])
/**
 * A flag's VALUE is skipped before the unknown-option check, because `--wait-seconds -5` is a
 * legitimate (if invalid) argument and reporting it as an unknown option would hide the real
 * complaint behind the wrong error.
 */
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const numberFlag = (flag, fallback, { min = 0 } = {}) => {
  const raw = argOf(flag)
  if (raw === null) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) fail(2, `${USAGE}\n\n${flag} must be an integer >= ${min}`)
  return value
}

const pullRequestArg = argOf("--pr")
const repoKey = argOf("--repo")
const urlMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/i.exec(pullRequestArg ?? "")
if (!pullRequestArg || (!/^\d+$/.test(pullRequestArg) && !urlMatch)) fail(2, `${USAGE}\n\n--pr must be a pull request number or full GitHub pull request URL`)
if (!urlMatch && !repoKey) fail(2, `${USAGE}\n\na bare pull request number requires --repo`)
const pullRequest = urlMatch?.[3] ?? pullRequestArg
const waitSeconds = numberFlag("--wait-seconds", 900)
const pollSeconds = numberFlag("--poll-seconds", 30, { min: 1 })
const commandTimeoutSeconds = numberFlag("--command-timeout-seconds", 45, { min: 1 })
const botLogin = argOf("--bot") ?? BOT_LOGIN
if (!botLogin || botLogin.startsWith("-")) fail(2, `${USAGE}\n\n--bot requires a login`)
const requestReview = !process.argv.includes("--no-request")

const GH = process.env.GH_BIN || "gh"
let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
if (repoKey && typeof config.repos?.[repoKey] !== "string") fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ") || "none"})`)
let githubCwd = repoKey ? config.repos[repoKey] : null
let repository = urlMatch ? `${urlMatch[1]}/${urlMatch[2]}` : null
if (!githubCwd) {
  const matches = Object.values(config.repos).filter((path) => {
    try {
      return repositorySlug(path).toLowerCase() === repository.toLowerCase()
    } catch {
      return false
    }
  })
  if (matches.length !== 1) fail(2, `pull request URL does not identify exactly one configured repository`)
  ;[githubCwd] = matches
}
if (!repository) {
  try {
    repository = repositorySlug(githubCwd)
  } catch (error) {
    fail(2, error.message)
  }
}
const [owner, repo] = repository.split("/")
let githubAuth
try {
  githubAuth = await githubEnvironment(githubCwd, { timeoutMs: commandTimeoutSeconds * 1000 })
} catch (error) {
  fail(2, redactSecrets(error.message))
}

const QUERY = `query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      number isDraft baseRefOid headRefOid
      reviews(last:50){nodes{author{login} state submittedAt body commit{oid}}}
      comments(last:100){nodes{author{login} body createdAt url}}
      reviewThreads(first:100){nodes{
        id isResolved isOutdated path line
        comments(first:1){nodes{author{login} body}}
      }}
    }
  }
}`

const gh = async (args, operation) => {
  const result = await runBounded(GH, args, { cwd: githubCwd, env: githubAuth.environment, timeoutMs: commandTimeoutSeconds * 1000 })
  if (result.timedOut) fail(2, `${operation} timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated`)
  if (result.overflowed) fail(2, `${operation} exceeded the 32 MiB output bound; the complete child process tree was terminated`)
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
    fail(2, `${operation} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  return result.stdout
}

const readPullRequest = async () => {
  const stdout = await gh(
    ["api", "graphql", "-F", `owner=${owner}`, "-F", `repo=${repo}`, "-F", `pr=${pullRequest}`, "-f", `query=${QUERY}`],
    `gh api graphql`,
  )
  let payload
  try {
    payload = JSON.parse(stdout)
  } catch {
    fail(2, `gh api graphql returned unparseable JSON: ${stdout.trim().slice(0, 240) || "empty output"}`)
  }
  if (payload.errors?.length) fail(2, `gh api graphql reported: ${payload.errors.map((entry) => entry.message).join("; ")}`)
  const node = payload.data?.repository?.pullRequest
  if (!node) fail(2, `gh api graphql returned no pull request ${pullRequest}`)
  return node
}

/**
 * The badge is shields.io markup in the comment body, confirmed on #681:
 * ![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat). Failing closed to P1 is
 * deliberate: a severity nobody can read is the one most likely to matter.
 */
const severityOf = (body) => (typeof body === "string" && /\bP([123])\b/.test(body) ? `P${/\bP([123])\b/.exec(body)[1]}` : "P1")

/**
 * The first line of prose after the badge, so a caller can triage without refetching the body. The
 * bot wraps its badge in nested <sub> tags, so stripping markdown alone leaves "<sub><sub> </sub>"
 * as the "first line"; HTML tags go too, and the line is only accepted once something readable
 * survives.
 */
const claimOf = (body) => {
  if (typeof body !== "string") return ""
  const line = body
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .split("\n")
    .map((entry) => entry.replaceAll(/[*_`#]/g, "").replaceAll(/\s+/g, " ").trim())
    .find((entry) => /[A-Za-z0-9]/.test(entry))
  return (line ?? "").slice(0, 200)
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

const progress = (event, node, startedAt, deadline) => {
  console.error(JSON.stringify({
    event,
    pr: Number(pullRequest),
    headRefOid: node?.headRefOid ?? null,
    elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
    remainingSeconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  }))
}

const startedAt = Date.now()
const deadline = Date.now() + waitSeconds * 1000
let node = await readPullRequest()
progress("CODEX_REVIEW_STATE_READ", node, startedAt, deadline)

if (node.isDraft) {
  console.log(JSON.stringify({ pr: Number(pullRequest), isDraft: true, verdict: "DRAFT", reviewedAt: null, reviewState: null, threads: [], note: "a draft pull request attracts no Codex review; mark it ready for review" }, null, 2))
  process.exit(1)
}

/**
 * A review is only evidence about the commit it was given on.
 *
 * Whether the bot re-reviews after a push is NOT reliable, and both shapes are measured: PR #676
 * reviewed once and never again while commits kept landing, and PR #682 reviewed the old head, took
 * a push, and reviewed the new head seven minutes later. So the newest bot review may name the OLD
 * commit, and accepting it would report REVIEWED for code the bot never saw. That is the same class
 * of defect this tool exists to remove: the harness reading a stale approval as a current one.
 *
 * Comparing the commit is what makes the answer correct under either behaviour. A review whose
 * commit is not the head does not count, and the wait continues.
 */
const botReviewOf = (payload) =>
  (payload.reviews?.nodes ?? [])
    .filter((review) => review.author?.login === botLogin)
    .filter((review) => review.commit?.oid && review.commit.oid === payload.headRefOid)
    .at(-1)

const CLEAN_COMMENT = "Codex Review: Didn't find any major issues."
const connectorCommentLogins = new Set(botLogin.endsWith("[bot]") ? [botLogin, botLogin.slice(0, -5)] : [botLogin, `${botLogin}[bot]`])
// The live connector issue-comment shape reports exactly 10 hex characters. Accepting a shorter
// unmeasured prefix could match more than one commit; accepting a guessed longer shape would violate
// the repository's external-interface rule.
const commitFromComment = (comment) => /\*\*Reviewed commit:\*\*\s*`([0-9a-f]{10})`(?![0-9a-f])/i.exec(comment?.body ?? "")?.[1] ?? null
const cleanCommentOf = (payload) =>
  (payload.comments?.nodes ?? [])
    .filter((comment) => connectorCommentLogins.has(comment.author?.login))
    .map((comment) => ({ ...comment, reportedCommit: commitFromComment(comment) }))
    .filter((comment) => comment.body?.includes(CLEAN_COMMENT))
    .filter((comment) => comment.reportedCommit && payload.headRefOid?.toLowerCase().startsWith(comment.reportedCommit.toLowerCase()))
    .at(-1)

const staleCommentOf = (payload) =>
  (payload.comments?.nodes ?? [])
    .filter((comment) => connectorCommentLogins.has(comment.author?.login))
    .map((comment) => ({ ...comment, reportedCommit: commitFromComment(comment) }))
    .filter((comment) => comment.body?.includes(CLEAN_COMMENT) && comment.reportedCommit)
    .at(-1)

const evidenceOf = (payload) => {
  const review = botReviewOf(payload)
  if (review?.state === "CHANGES_REQUESTED") return { kind: "REVIEW", value: review }
  const comment = cleanCommentOf(payload)
  if (!review) return comment ? { kind: "ISSUE_COMMENT", value: comment } : null
  if (!comment) return { kind: "REVIEW", value: review }
  return Date.parse(comment.createdAt) > Date.parse(review.submittedAt) ? { kind: "ISSUE_COMMENT", value: comment } : { kind: "REVIEW", value: review }
}

/** Kept separately so NO_REVIEW can say WHICH shape it is: never reviewed, or reviewed a dead head. */
const staleReviewOf = (payload) => (payload.reviews?.nodes ?? []).filter((review) => review.author?.login === botLogin).at(-1)

let evidence = evidenceOf(node)

/**
 * Ask BEFORE waiting, not after.
 *
 * The bot reviews on open, on ready-for-review, and on an explicit request, and a plain push is not
 * a reliable trigger: #676 took one review and never re-reviewed while commits kept landing. Waiting
 * first and asking afterwards spends the entire budget on a review that may never have been
 * triggered, then starts a second budget from zero. Measured on #685: 900 seconds elapsed to
 * NO_REVIEW, the request was then posted by hand, and the review arrived within minutes.
 *
 * The request is gated on `botReviewOf` returning nothing, which is already "no review pinned to the
 * CURRENT head", so a pull request the bot has genuinely reviewed is never nagged.
 */
let requested = false
if (requestReview && !evidence && waitSeconds > 0) {
  await gh(["pr", "comment", pullRequest, "--repo", repository, "--body", "@codex review"], `gh pr comment ${pullRequest}`)
  requested = true
  progress("CODEX_REVIEW_REQUESTED", node, startedAt, deadline)
}

while (!evidence && Date.now() < deadline) {
  await sleep(Math.min(pollSeconds, Math.max(1, Math.ceil((deadline - Date.now()) / 1000))))
  node = await readPullRequest()
  evidence = evidenceOf(node)
  progress(evidence ? "CODEX_REVIEW_ARRIVED" : "CODEX_REVIEW_WAITING", node, startedAt, deadline)
}

const threads = (node.reviewThreads?.nodes ?? [])
  .filter((thread) => thread.comments?.nodes?.[0]?.author?.login === botLogin)
  .map((thread) => {
    const body = thread.comments.nodes[0].body
    return {
      id: thread.id,
      isResolved: Boolean(thread.isResolved),
      isOutdated: Boolean(thread.isOutdated),
      path: thread.path ?? null,
      line: thread.line ?? null,
      severity: severityOf(body),
      claim: claimOf(body),
    }
  })

if (!evidence) {
  const stale = staleReviewOf(node)
  const staleComment = staleCommentOf(node)
  /**
   * The note distinguishes "asked and still absent" from "never asked", because the two justify
   * different actions and only the first is evidence about the reviewer rather than about us.
   */
  const asked = requested
    ? '"@codex review" WAS posted on this run and no review arrived inside the budget, so the absence is the reviewer\'s, not ours'
    : 'no "@codex review" was posted on this run, so the reviewer may simply never have been triggered'
  const note = stale
    ? `the newest ${botLogin} review is pinned to ${stale.commit?.oid ?? "an unknown commit"}, not to head ${node.headRefOid}; it never saw this code. ${asked}`
    : staleComment
      ? `the newest ${botLogin} clean issue comment reports commit ${staleComment.reportedCommit}, not head ${node.headRefOid}; it never saw this code. ${asked}`
    : `no ${botLogin} review arrived; ${asked}; do not report this pull request as clean`
  console.log(
    JSON.stringify(
      { pr: Number(pullRequest), isDraft: false, verdict: "NO_REVIEW", reviewedAt: null, reviewState: null, baseRefOid: node.baseRefOid, headRefOid: node.headRefOid, staleReviewCommit: stale?.commit?.oid ?? staleComment?.reportedCommit ?? null, threads, waitedSeconds: waitSeconds, reviewRequested: requested, note },
      null,
      2,
    ),
  )
  process.exit(1)
}

const review = evidence.value
const verdict = evidence.kind === "REVIEW" && review.state === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REVIEWED"
console.log(
  JSON.stringify(
    {
      pr: Number(pullRequest),
      isDraft: false,
      verdict,
      reviewedAt: evidence.kind === "REVIEW" ? (review.submittedAt ?? null) : (review.createdAt ?? null),
      reviewState: evidence.kind === "REVIEW" ? (review.state ?? null) : "CLEAN_COMMENT",
      reviewSource: evidence.kind,
      reviewUrl: evidence.kind === "ISSUE_COMMENT" ? (review.url ?? null) : null,
      reportedCommit: evidence.kind === "ISSUE_COMMENT" ? review.reportedCommit : review.commit.oid,
      reviewedCommit: node.headRefOid,
      baseRefOid: node.baseRefOid,
      headRefOid: node.headRefOid,
      /**
       * A body-level CHANGES_REQUESTED carries its whole complaint here and opens no thread, so
       * without the body the caller learns it is blocked and nothing about why. Only carried for
       * that verdict: on a COMMENTED review the body is the bot's boilerplate preamble and the
       * threads hold the findings.
       */
      reviewBody: verdict === "CHANGES_REQUESTED" ? (review.body ?? "").trim().slice(0, 4000) : null,
      counts: { total: threads.length, unresolved: threads.filter((thread) => !thread.isResolved).length },
      threads,
    },
    null,
    2,
  ),
)
process.exit(0)
