#!/usr/bin/env node

import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { graphqlBudgetDecision } from "./lib/github-rate-limit.mjs"
import { currentRunIdentifier, recordObservedIdentifiers } from "./lib/identifier-ledger.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const BOT_LOGIN = "pullfrog"

const USAGE = `usage: list-bot-threads.mjs --pr <number|url> (--repo <ui|api|landing> | URL) [options]

  --pr <number|url>   the pull request to read (required)
  --repo <key>        required for a bare number; a full PR URL selects its repository
  --wait-seconds <n>  how long to wait for the review to land (default 900, 0 polls once)
  --poll-seconds <n>  gap between polls (default 30)
  --command-timeout-seconds <n>  hard bound for each gh child (default 45)
  --bot <login>       reviewer login to filter on (default ${BOT_LOGIN}); a trailing [bot] is dropped
  --re-review         request a FRESH review of the head that is already reviewed, and accept
                      only a review submitted after the one present when this run started. The
                      only way to clear a finding carried in a review BODY, which opens no
                      thread to resolve. Needs --wait-seconds above 0.
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
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--no-request", "--re-review", "--help", "-h"])
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
const reReview = process.argv.includes("--re-review")
if (reReview && !requestReview) fail(2, `${USAGE}\n\n--re-review and --no-request contradict each other`)
if (reReview && waitSeconds === 0) fail(2, `${USAGE}\n\n--re-review needs --wait-seconds above 0 to observe the fresh review`)

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
      comments(last:100){nodes{createdAt url}}
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

const COMPLETED_REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"])
const botReviewOf = (payload) =>
  (payload.reviews?.nodes ?? [])
    .filter((review) => review.author?.login === botLogin)
    .filter((review) => review.commit?.oid && review.commit.oid === payload.headRefOid)
    .filter((review) => COMPLETED_REVIEW_STATES.has(review.state))
    .at(-1)

/**
 * A missing or unparseable submittedAt sorts BELOW every real timestamp, so a review whose age
 * cannot be read can never be mistaken for the fresh one --re-review is waiting on.
 */
const submittedAtOf = (review) => {
  const parsed = Date.parse(review?.submittedAt ?? "")
  return Number.isFinite(parsed) ? parsed : -1
}

/** Kept separately so NO_REVIEW can say WHICH shape it is: never reviewed, or reviewed a dead head. */
const staleReviewOf = (payload) => (payload.reviews?.nodes ?? []).filter((review) => review.author?.login === botLogin && COMPLETED_REVIEW_STATES.has(review.state)).at(-1)

let requestCreatedAt = null
const answersTheRequest = (review) => requestCreatedAt !== null && submittedAtOf(review) > requestCreatedAt

/**
 * A review is superseded only by one that answers THIS request. Without that comparison the run
 * reads back the review it was sent to replace, reports the finding it just answered, and never
 * converges.
 */
const currentReviewOf = (payload) => {
  const found = botReviewOf(payload)
  if (!reReview || !found) return found
  return answersTheRequest(found) ? found : null
}

let review = currentReviewOf(node)

let requested = false
let requestUrl = null
if (requestReview && !review && waitSeconds > 0) {
  const posted = await gh(["pr", "comment", pullRequest, "--repo", repository, "--body", "@pullfrog review"], `gh pr comment ${pullRequest}`)
  requestUrl = posted.trim().split("\n").at(-1)?.trim() || null
  requested = true
  progress(reReview ? "RE_REVIEW_REQUESTED" : "REVIEW_REQUESTED", node, startedAt, deadline)
}

/**
 * Our request comment, found by the url gh printed when it posted it, so its createdAt is GitHub's
 * own stamp rather than this machine's clock. Until it is found the boundary stays null and no
 * review can answer the request, so a comment this run cannot see fails closed into NO_REVIEW.
 */
const bindRequestBoundary = (payload) => {
  if (!reReview || requestCreatedAt !== null || !requestUrl) return
  const mine = (payload.comments?.nodes ?? []).find((comment) => comment.url === requestUrl)
  if (!mine) return
  const stamped = Date.parse(mine.createdAt ?? "")
  if (Number.isFinite(stamped)) requestCreatedAt = stamped
}

bindRequestBoundary(node)

while (!review && Date.now() < deadline) {
  await sleep(Math.min(pollSeconds, Math.max(1, Math.ceil((deadline - Date.now()) / 1000))))
  await awaitGraphqlBudget(deadline)
  if (Date.now() >= deadline) break
  node = await readPullRequest()
  bindRequestBoundary(node)
  review = currentReviewOf(node)
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
