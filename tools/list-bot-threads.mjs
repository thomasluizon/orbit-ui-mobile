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
 *      yet". The verdict is therefore derived from the presence of a bot-authored REVIEW, never
 *      from the thread count.
 *   2. A body-level CHANGES_REQUESTED opens no review thread at all, so zero unresolved threads is
 *      not proof of a clean pull request. Both surfaces are read in one query.
 *
 * A draft pull request attracts no Codex review ever, so waiting on one burns the whole budget and
 * then reports a reviewer that was never going to run. Draft is checked before the clock starts.
 *
 * It reads. It never replies, resolves, or fixes: tools/resolve-bot-thread.mjs owns the mutations.
 */

import { execFileSync } from "node:child_process"

const BOT_LOGIN = "chatgpt-codex-connector"

const USAGE = `usage: list-bot-threads.mjs --pr <number> [options]

  --pr <number>       the pull request to read (required)
  --wait-seconds <n>  how long to wait for the bot review to land (default 900, 0 polls once)
  --poll-seconds <n>  gap between polls (default 30)
  --bot <login>       reviewer login to filter on (default ${BOT_LOGIN})
  --help, -h          print this usage and exit 0

The bot reviews on open, on ready-for-review, and on an explicit "@codex review" comment. Whether it
re-reviews after a plain push is NOT reliable (#676 never did, #682 did), so a review is accepted
only when its commit is the current head. 900 covers the longest lag observed on a real pull request
(564s on #676) with margin.

Prints ONE JSON object on stdout: pr, isDraft, verdict, reviewedAt, reviewState, threads[].
Errors go to stderr.

  verdict  REVIEWED      a bot review OF THE CURRENT HEAD exists; threads[] may be empty (clean)
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

const VALUE_FLAGS = new Set(["--pr", "--wait-seconds", "--poll-seconds", "--bot"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--help", "-h"])
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

const pullRequest = argOf("--pr")
if (!pullRequest || !/^\d+$/.test(pullRequest)) fail(2, `${USAGE}\n\n--pr must be a pull request number`)
const waitSeconds = numberFlag("--wait-seconds", 900)
const pollSeconds = numberFlag("--poll-seconds", 30, { min: 1 })
const botLogin = argOf("--bot") ?? BOT_LOGIN
if (!botLogin || botLogin.startsWith("-")) fail(2, `${USAGE}\n\n--bot requires a login`)

const GH = process.env.GH_BIN || "gh"

const QUERY = `query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      number isDraft headRefOid
      reviews(last:50){nodes{author{login} state submittedAt body commit{oid}}}
      reviewThreads(first:100){nodes{
        id isResolved isOutdated path line
        comments(first:1){nodes{author{login} body}}
      }}
    }
  }
}`

const readPullRequest = () => {
  let stdout = ""
  try {
    stdout = execFileSync(
      GH,
      ["api", "graphql", "-F", "owner={owner}", "-F", "repo={repo}", "-F", `pr=${pullRequest}`, "-f", `query=${QUERY}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 },
    )
  } catch (error) {
    fail(2, `gh api graphql failed for pull request ${pullRequest}: ${(error.stderr?.toString() || error.stdout?.toString() || error.message).trim()}`)
  }
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

/** Synchronous by design: this tool is one blocking step in a shell pipeline, not an event loop. */
const sleep = (seconds) => {
  const buffer = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(buffer, 0, 0, seconds * 1000)
}

const deadline = Date.now() + waitSeconds * 1000
let node = readPullRequest()

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

/** Kept separately so NO_REVIEW can say WHICH shape it is: never reviewed, or reviewed a dead head. */
const staleReviewOf = (payload) => (payload.reviews?.nodes ?? []).filter((review) => review.author?.login === botLogin).at(-1)

let review = botReviewOf(node)
while (!review && Date.now() < deadline) {
  sleep(Math.min(pollSeconds, Math.max(1, Math.ceil((deadline - Date.now()) / 1000))))
  node = readPullRequest()
  review = botReviewOf(node)
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

if (!review) {
  const stale = staleReviewOf(node)
  const note = stale
    ? `the newest ${botLogin} review is pinned to ${stale.commit?.oid ?? "an unknown commit"}, not to head ${node.headRefOid}; it never saw this code. Post "@codex review" to re-request`
    : `no ${botLogin} review arrived; do not report this pull request as clean`
  console.log(
    JSON.stringify(
      { pr: Number(pullRequest), isDraft: false, verdict: "NO_REVIEW", reviewedAt: null, reviewState: null, headRefOid: node.headRefOid, staleReviewCommit: stale?.commit?.oid ?? null, threads, waitedSeconds: waitSeconds, note },
      null,
      2,
    ),
  )
  process.exit(1)
}

const verdict = review.state === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REVIEWED"
console.log(
  JSON.stringify(
    {
      pr: Number(pullRequest),
      isDraft: false,
      verdict,
      reviewedAt: review.submittedAt ?? null,
      reviewState: review.state ?? null,
      reviewedCommit: review.commit.oid,
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
