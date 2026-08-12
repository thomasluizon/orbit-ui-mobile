#!/usr/bin/env node
/**
 * Report what Pullfrog said about ONE pull request, and make "it never reviewed" a verdict the
 * caller can branch on rather than a silence it reads as approval.
 *
 * Pullfrog is the only reviewer of an Orbit pull request. It runs in GitHub Actions, it reviews a
 * pull request when the pull request opens, and it re-reviews after every push. /orchestrate reads
 * this tool to clear that review: it fixes the blocking findings, files the rest as tickets, and
 * replies to every thread it did not fix.
 *
 * Two shapes make a naive reading wrong, and both are handled here rather than documented:
 *
 *   1. An empty thread list is ambiguous between "reviewed, found nothing" and "has not reviewed
 *      yet". The verdict is therefore derived from a current-head Pullfrog review, never from the
 *      thread count. Measured on pull request 711 (2026-08-12): the clean pass arrived as a review
 *      with the state APPROVED and opened no thread at all.
 *   2. A review that did not approve states its complaint in the review BODY and can open no review
 *      thread at all, so zero unresolved threads is not proof of a clean pull request. Both surfaces
 *      are read in one query, and both are reported.
 *
 * It reads. It never replies, resolves, or fixes: tools/resolve-bot-thread.mjs owns the mutations.
 */

import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { graphqlBudgetDecision } from "./lib/github-rate-limit.mjs"
import { currentRunIdentifier, recordObservedIdentifiers } from "./lib/identifier-ledger.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

/**
 * The login as GraphQL spells it, because this tool reads GraphQL and nothing else. The two GitHub
 * APIs disagree on the same identity, and both spellings were read on 2026-08-12:
 * `gh api repos/thomasluizon/orbit-ui-mobile/pulls/711/reviews` prints `pullfrog[bot]`, while the
 * GraphQL `author.login` of that same review prints `pullfrog` with the typename `Bot`. A login
 * that never matches makes this tool report NO_REVIEW forever, so the GraphQL spelling wins.
 */
const BOT_LOGIN = "pullfrog"

const USAGE = `usage: list-bot-threads.mjs --pr <number|url> (--repo <ui|api|landing> | URL) [options]

  --pr <number|url>   the pull request to read (required)
  --repo <key>        required for a bare number; a full PR URL selects its repository
  --wait-seconds <n>  how long to wait for the review to land (default 900, 0 polls once)
  --poll-seconds <n>  gap between polls (default 30)
  --command-timeout-seconds <n>  hard bound for each gh child (default 45)
  --bot <login>       reviewer login to filter on (default ${BOT_LOGIN}); a trailing [bot] is dropped
  --no-request        do NOT post "@pullfrog review" first; wait only for the review Pullfrog
                      starts on its own (default: post the request)
  --help, -h          print this usage and exit 0

Pullfrog reviews a pull request when it opens and re-reviews after every push, so a push alone is a
reliable trigger. A review still counts only when its commit is the current head. The 900-second
default is a carry-over bound that nobody has measured for Pullfrog. The one timing taken so far is
148 seconds, from the request comment on pull request 711 to the submitted review of a one-file diff
(2026-08-12).

Prints ONE JSON object on stdout: pr, isDraft, verdict, reviewedAt, reviewState, reviewBody,
threads[]. Errors go to stderr.

  verdict  REVIEWED      a Pullfrog review OF THE CURRENT HEAD exists; threads[] may be empty,
                         and a non-null reviewBody can still carry a finding
           CHANGES_REQUESTED  a review of the current head exists and requests changes
           NO_REVIEW     no review of this head inside the budget. staleReviewCommit names
                         the commit an older review WAS given on, when there is one

reviewBody carries the review body for EVERY accepted state except APPROVED, and is null when the
body is empty. Triage it exactly like a thread: counts{} describes threads only, so "REVIEWED with
zero threads" is a clean pull request only when reviewBody is null too.

A review is evidence about the commit it was given on and nothing else. One pinned to an older
head is NOT accepted: after a push the newest review names the old commit until the re-review
lands, and taking it would report REVIEWED for code Pullfrog never saw.

A draft pull request is read exactly like any other one, because Pullfrog reviews drafts too.

  threads[]  id, isResolved, isOutdated, path, line, severity, claim

Pullfrog publishes no severity, so every thread reports P1. The caller treats each finding as
blocking until the caller triages it.

exit codes: 0 REVIEWED or CHANGES_REQUESTED, 1 NO_REVIEW, 2 usage or environment error`

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
/**
 * The `[bot]` suffix is stripped at the boundary because REST and GraphQL spell the same reviewer
 * differently, and a caller who copied the login out of a REST response is right about the identity
 * and wrong only about the spelling. Stripping it here means the comparisons below stay exact.
 */
const botLogin = (argOf("--bot") ?? BOT_LOGIN).replace(/\[bot\]$/, "")
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

const QUERY = `query($owner:String!,$repo:String!,$pr:Int!,$threadsAfter:String){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      number isDraft baseRefOid headRefOid
      reviews(last:50){nodes{author{login} state submittedAt body commit{oid}}}
      reviewThreads(first:100,after:$threadsAfter){
        pageInfo{hasNextPage endCursor}
        nodes{
          id isResolved isOutdated path line
          comments(first:1){nodes{author{login} body}}
        }
      }
    }
  }
}`

const gh = async (args, operation, timeoutMs = commandTimeoutSeconds * 1000) => {
  const result = await runBounded(GH, args, { cwd: githubCwd, env: githubAuth.environment, timeoutMs })
  if (result.timedOut) fail(2, `${operation} timed out after ${Math.max(1, Math.ceil(timeoutMs / 1000))}s; the complete child process tree was terminated`)
  if (result.overflowed) fail(2, `${operation} exceeded the 32 MiB output bound; the complete child process tree was terminated`)
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
    fail(2, `${operation} failed: ${redactSecrets(detail.trim(), githubAuth.secrets)}`)
  }
  return result.stdout
}

const readPullRequest = async () => {
  const paginationDeadline = Date.now() + commandTimeoutSeconds * 1000
  const fetchPage = async (threadsAfter = null, page = 1) => {
    const remainingMs = paginationDeadline - Date.now()
    if (remainingMs <= 0) fail(2, `review-thread pagination exceeded its ${commandTimeoutSeconds}s total bound`)
    const cursorArgs = threadsAfter === null ? [] : ["-f", `threadsAfter=${threadsAfter}`]
    const stdout = await gh(
      ["api", "graphql", "-F", `owner=${owner}`, "-F", `repo=${repo}`, "-F", `pr=${pullRequest}`, ...cursorArgs, "-f", `query=${QUERY}`],
      `gh api graphql review-thread page ${page}`,
      remainingMs,
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
    const pageInfo = node.reviewThreads?.pageInfo
    if (typeof pageInfo?.hasNextPage !== "boolean" || !(typeof pageInfo.endCursor === "string" || pageInfo.endCursor === null)) fail(2, "gh api graphql returned no complete reviewThreads pageInfo")
    if (!Array.isArray(node.reviewThreads?.nodes)) fail(2, "gh api graphql returned no reviewThreads nodes array")
    console.error(JSON.stringify({ event: "REVIEW_THREAD_PAGE_READ", pr: Number(pullRequest), page, headRefOid: node.headRefOid, hasNextPage: pageInfo.hasNextPage }))
    return node
  }

  const first = await fetchPage()
  const nodes = [...first.reviewThreads.nodes]
  let pageInfo = first.reviewThreads.pageInfo
  let pages = 1
  const seenCursors = new Set()
  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) fail(2, "gh api graphql reviewThreads page says another page exists but carries no endCursor")
    if (seenCursors.has(pageInfo.endCursor)) fail(2, "gh api graphql reviewThreads pagination repeated an endCursor")
    if (pages >= 100) fail(2, "gh api graphql reviewThreads pagination exceeded the 100-page safety bound")
    seenCursors.add(pageInfo.endCursor)
    const next = await fetchPage(pageInfo.endCursor, pages + 1)
    if (next.headRefOid !== first.headRefOid || next.baseRefOid !== first.baseRefOid) fail(2, "pull request head/base changed while review threads were paginated; retry on the new pair")
    nodes.push(...next.reviewThreads.nodes)
    pageInfo = next.reviewThreads.pageInfo
    pages += 1
  }
  first.reviewThreads = { nodes, pageInfo, pages, complete: true }
  return first
}

/**
 * Pullfrog publishes no severity. Pull request 711 is the only Pullfrog review in this repository
 * so far (2026-08-12), it approved, and it opened no thread that a severity could be read from, so
 * there is no measured shape to parse. Every finding therefore reports P1: the caller triages it or
 * treats it as blocking, and nothing is downgraded by a parser written against a guess.
 */
const UNTRIAGED_SEVERITY = "P1"

/**
 * The first line of prose in the thread, so a caller can triage without refetching the body.
 * Pullfrog writes markdown and embeds raw HTML: its review body on pull request 711 carried
 * `<sup>` and `<picture>` tags plus an HTML comment block of review metadata. Markdown markup and
 * HTML tags are both stripped, and the line is only accepted once something readable survives.
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

/**
 * Ask before spending. The reviewThreads document is an expensive GraphQL read and the budget is
 * per USER, so ui, api and landing pollers all draw on the same 5,000 points; eight concurrent
 * pollers exhausted it three times on 2026-08-09. `gh api rate_limit` is REST and costs nothing.
 * On a spent budget this WAITS, bounded by the caller's own remaining --wait-seconds, and says so;
 * a budget that cannot be read proceeds, because the call itself is the better probe.
 */
const readGraphqlBudget = async () => {
  const result = await runBounded(GH, ["api", "rate_limit"], { cwd: githubCwd, env: githubAuth.environment, timeoutMs: commandTimeoutSeconds * 1000 })
  if (result.timedOut || result.error || result.status !== 0) return null
  try {
    const graphql = JSON.parse(result.stdout)?.resources?.graphql
    return graphql && Number.isFinite(graphql.remaining) && Number.isFinite(graphql.reset) ? graphql : null
  } catch {
    return null
  }
}

const awaitGraphqlBudget = async (deadline) => {
  const decision = graphqlBudgetDecision(await readGraphqlBudget(), {
    nowSeconds: Math.floor(Date.now() / 1000),
    maxWaitSeconds: Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
  })
  if (decision.action === "wait" && decision.waitSeconds > 0) {
    console.error(JSON.stringify({ event: "GITHUB_RATE_LIMIT_WAIT", pr: Number(pullRequest), waitSeconds: decision.waitSeconds, reason: decision.reason }))
    await sleep(decision.waitSeconds)
  }
}

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
await awaitGraphqlBudget(deadline)
let node = await readPullRequest()
progress("REVIEW_STATE_READ", node, startedAt, deadline)

/**
 * A review is only evidence about the commit it was given on.
 *
 * Pullfrog re-reviews after every push, so between a push and the next review the newest review
 * still names the OLD commit. Accepting it would report REVIEWED for code Pullfrog never saw, which
 * is the very defect this tool exists to remove: the harness reading a stale approval as a current
 * one. Comparing the commit is what makes the answer correct. A review whose commit is not the head
 * does not count, and the wait continues.
 */
const COMPLETED_REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"])
const botReviewOf = (payload) =>
  (payload.reviews?.nodes ?? [])
    .filter((review) => review.author?.login === botLogin)
    .filter((review) => review.commit?.oid && review.commit.oid === payload.headRefOid)
    // Confirmed live ReviewState enum: APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING.
    // APPROVED is the state Pullfrog used for its clean pass on pull request 711 (2026-08-12). A
    // pending or dismissed review is not a completed pass and must never become evidence.
    // COMMENTED stays accepted because it IS a completed review, and it is safe to accept only
    // because the body of every non-APPROVED state is reported below. Drop that and a COMMENTED
    // review whose whole finding lives in its body reads here as a clean pass.
    .filter((review) => COMPLETED_REVIEW_STATES.has(review.state))
    .at(-1)

/** Kept separately so NO_REVIEW can say WHICH shape it is: never reviewed, or reviewed a dead head. */
const staleReviewOf = (payload) => (payload.reviews?.nodes ?? []).filter((review) => review.author?.login === botLogin && COMPLETED_REVIEW_STATES.has(review.state)).at(-1)

let review = botReviewOf(node)

/**
 * Ask BEFORE waiting, not after.
 *
 * Pullfrog starts a review by itself when a pull request opens and after every push, so the request
 * is normally redundant. It stays for the two cases that automation does not cover: a pull request
 * that was already open before auto-review was turned on, and a re-review wanted without a push.
 * The trigger is measured, not assumed: on pull request 711 the comment "@pullfrog review" landed at
 * 16:01:48Z on 2026-08-12, the workflow run started six seconds later, and the review was submitted
 * at 16:04:16Z. Pass --no-request to suppress it.
 *
 * The request is gated on `botReviewOf` returning nothing, which is already "no review pinned to the
 * CURRENT head", so a pull request Pullfrog has genuinely reviewed is never nagged.
 */
let requested = false
if (requestReview && !review && waitSeconds > 0) {
  await gh(["pr", "comment", pullRequest, "--repo", repository, "--body", "@pullfrog review"], `gh pr comment ${pullRequest}`)
  requested = true
  progress("REVIEW_REQUESTED", node, startedAt, deadline)
}

while (!review && Date.now() < deadline) {
  await sleep(Math.min(pollSeconds, Math.max(1, Math.ceil((deadline - Date.now()) / 1000))))
  await awaitGraphqlBudget(deadline)
  if (Date.now() >= deadline) break
  node = await readPullRequest()
  review = botReviewOf(node)
  progress(review ? "REVIEW_ARRIVED" : "REVIEW_WAITING", node, startedAt, deadline)
}

const threads = (node.reviewThreads?.nodes ?? [])
  .filter((thread) => thread.comments?.nodes?.[0]?.author?.login === botLogin)
  .map((thread) => ({
    id: thread.id,
    isResolved: Boolean(thread.isResolved),
    isOutdated: Boolean(thread.isOutdated),
    path: thread.path ?? null,
    line: thread.line ?? null,
    severity: UNTRIAGED_SEVERITY,
    claim: claimOf(thread.comments.nodes[0].body),
  }))

/**
 * This tool is the ONLY producer of review-thread node ids in the harness, so it is the only place
 * that can attest one was really read back from GitHub. resolve-bot-thread.mjs writes with those
 * ids, and on 2026-08-08 one of them was typed instead of copied and landed a reply on a stranger's
 * repository. The ledger is what lets .claude/hooks/forbid-invented-identifier.mjs tell an id this
 * harness observed from one it never saw. Recorded before either output branch, so a NO_REVIEW run
 * that still returned threads records them too.
 */
recordObservedIdentifiers(threads.map((thread) => thread.id), {
  repoRoot: githubCwd,
  tool: "list-bot-threads.mjs",
  repository,
  runIdentifier: currentRunIdentifier(),
})

if (!review) {
  const stale = staleReviewOf(node)
  /**
   * The note distinguishes "asked and still absent" from "never asked", because the two justify
   * different actions and only the first is evidence about the reviewer rather than about us.
   */
  const asked = requested
    ? '"@pullfrog review" WAS posted on this run and no review arrived inside the budget, so the absence is the reviewer\'s, not ours'
    : 'no "@pullfrog review" was posted on this run, so the reviewer may simply never have been triggered'
  const note = stale
    ? `the newest ${botLogin} review is pinned to ${stale.commit?.oid ?? "an unknown commit"}, not to head ${node.headRefOid}; it never saw this code. ${asked}`
    : `no ${botLogin} review arrived; ${asked}; do not report this pull request as clean`
  console.log(
    JSON.stringify(
      { pr: Number(pullRequest), isDraft: Boolean(node.isDraft), verdict: "NO_REVIEW", reviewedAt: null, reviewState: null, baseRefOid: node.baseRefOid, headRefOid: node.headRefOid, staleReviewCommit: stale?.commit?.oid ?? null, threadsComplete: node.reviewThreads.complete === true, threads, waitedSeconds: waitSeconds, reviewRequested: requested, note },
      null,
      2,
    ),
  )
  process.exit(1)
}

const verdict = review.state === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REVIEWED"

/**
 * The body of every accepted state EXCEPT APPROVED, because a review that did not approve states
 * its complaint there and no thread has to repeat it.
 *
 * Measured on 2026-08-12, on the three Pullfrog reviews read that day. Every body opened with a
 * blockquote callout that states the verdict in prose. The CHANGES_REQUESTED review of pull request
 * 716 opened with `[!IMPORTANT]` and named both of its blocking findings there. The APPROVED
 * reviews of pull request 711 and of orbit-api pull request 473 opened with `No new issues found.`
 * and then summarized the diff. So the body is the reviewer's own statement of the verdict, not a
 * preamble.
 *
 * COMMENTED is the one state nobody measured, because Pullfrog posted none yet. An earlier comment
 * here said a commenting review puts boilerplate in the body and the findings in the threads. That
 * shape was measured against the ChatGPT Codex connector, never against Pullfrog, so it does not
 * transfer. A COMMENTED review that states its finding in the body and opens no thread otherwise
 * reaches the caller as REVIEWED with zero findings. APPROVED is the single state whose body says
 * there is nothing to act on, so it alone stays null.
 *
 * An empty body normalizes to null, so null always means "nothing to read" and never "dropped".
 */
const reviewBody = review.state === "APPROVED" ? null : (review.body ?? "").trim().slice(0, 4000) || null

console.log(
  JSON.stringify(
    {
      pr: Number(pullRequest),
      isDraft: Boolean(node.isDraft),
      verdict,
      reviewedAt: review.submittedAt ?? null,
      reviewState: review.state ?? null,
      reviewedCommit: node.headRefOid,
      baseRefOid: node.baseRefOid,
      headRefOid: node.headRefOid,
      reviewBody,
      threadsComplete: node.reviewThreads.complete === true,
      counts: { total: threads.length, unresolved: threads.filter((thread) => !thread.isResolved).length, pages: node.reviewThreads.pages },
      threads,
    },
    null,
    2,
  ),
)
process.exit(0)
