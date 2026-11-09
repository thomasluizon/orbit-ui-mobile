#!/usr/bin/env node

import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { runBounded } from "./lib/bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { graphqlBudgetDecision } from "./lib/github-rate-limit.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { REVIEW_APP_AUTHOR_FILTER, REVIEW_APP_LOGIN } from "./lib/readiness-receipt.mjs"

const USAGE = `usage: review-rounds.mjs --repo <ui|api|landing> [--limit <n>]

Counts Pullfrog review rounds to approval for the most recently merged pull requests.
A round is one distinct head commit that Pullfrog reviewed. The rounds of a pull request are the
distinct heads reviewed up to and including the head of its first review whose state is APPROVED.
An approval that a later push dismissed carries the state DISMISSED, so it never ends the count.
A pull request with no APPROVED Pullfrog review is unapproved: its rounds are null, never 0.

Every round before the approving head is a failed round. Its finding is the earliest Pullfrog
thread that a review of that head opened, or the body of its last review when it opened none.
The claim is the first text line of that finding. The first matching rule gives the category:
  dismissed approval  the last review of that head was an approval that a later push dismissed
  metadata            the claim names the pull request body, description, title or labels
  docs drift          the claim says a comment or document is stale, or the thread is on .md
  test gap            the thread is on a test file, or the claim names a test or coverage
  behaviour defect    the thread is on any other file
  other               the round opened no thread and its claim matched no rule
Reviews and threads from any author other than the Pullfrog bot are excluded.

Reads only. Every connection is paginated to its end, and GraphQL calls run one at a time.
Before each call the tool reads the budget that the previous response reported and waits for
the window to refill when fewer than 200 points remain.

  --repo <key>   configured repository to read (required)
  --limit <n>    merged pull requests to count, newest merge first (default 100, at most 1000)
  --help, -h     print this usage and exit 0

Prints ONE JSON object on stdout:
  repository, limit
  pullRequests[]  number, mergedAt, approved, rounds, reviews, failedRounds[] {head, category, path, claim}
  summary         pullRequests, approved, unapproved, medianRounds, meanRounds,
                  distribution {rounds: count}, reviews, categories {category: count}
Progress events and errors go to stderr.

exit codes: 0 report printed, 1 a GitHub read failed or returned an unexpected shape,
2 usage or environment error`

const PAGE_SIZE = 20
const MAX_PAGES = 200
const MAX_LIMIT = 1000

/** Each connection's arguments and node fields, written once for the first page and every later one. */
const CONNECTION_SELECTIONS = {
  reviews: (after) => `reviews(first: 100${after}, author: "${REVIEW_APP_AUTHOR_FILTER}") { pageInfo { hasNextPage endCursor } nodes { id state submittedAt body author { __typename login } commit { oid } } }`,
  reviewThreads: (after) => `reviewThreads(first: 100${after}) { pageInfo { hasNextPage endCursor } nodes { path comments(first: 1) { nodes { createdAt body author { __typename login } pullRequestReview { id } } } } }`,
  timelineItems: (after) => `timelineItems(first: 100${after}, itemTypes: [REVIEW_DISMISSED_EVENT]) { pageInfo { hasNextPage endCursor } nodes { ... on ReviewDismissedEvent { previousReviewState review { id } } } }`,
}

const PULL_FIELDS = `number mergedAt updatedAt
  ${Object.values(CONNECTION_SELECTIONS).map((selection) => selection("")).join("\n  ")}`

export const mergedPullsQuery = `query ReviewRounds($owner: String!, $name: String!, $after: String) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: ${PAGE_SIZE}, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PULL_FIELDS} }
    }
  }
}`

/** The selection of one pull request, shared with the fixture recorder so both read one shape. */
export const pullRequestQuery = (numbers) => `query ReviewRoundsPulls($owner: String!, $name: String!) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    ${numbers.map((number) => `pr${number}: pullRequest(number: ${number}) { ${PULL_FIELDS} }`).join("\n    ")}
  }
}`

export const connectionQuery = (connection) => `query ReviewRoundsPage($owner: String!, $name: String!, $number: Int!, $after: String!) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${CONNECTION_SELECTIONS[connection](", after: $after")} } }
}`

const isBot = (author) => author?.__typename === "Bot" && author.login === REVIEW_APP_LOGIN
const timeOf = (value) => {
  const parsed = Date.parse(value ?? "")
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

const DOCUMENT_PATH = /\.mdx?$/i
const TEST_PATH = /(^|\/)(__tests__|__fixtures__|tests?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|Tests?\.cs$/
const METADATA_CLAIM = /\b(the )?(pr|pull request)('s)? (body|description|title|labels?)\b|\b(this|the) (pr|pull request) (cites|says|claims|states)\b|\bparity:(exempt|no)\b/i
const DOCS_CLAIM = /\b(comment|jsdoc|docstring|readme|runbook|documentation)\b[^.]{0,80}\b(stale|out of date|no longer|still (says|describes|names|lists|reads|claims|states))\b|\bmade (this|the) (comment|jsdoc) stale\b/i
const TEST_CLAIM = /\b(test|tests|fixture|fixtures|assertion|assertions|suite|coverage)\b/i

/**
 * One category per failed round, from its first claim line and its thread path. A thread on any
 * other file is a behaviour defect; a round with no thread and no matching claim is other.
 */
export const categoryOf = ({ path = null, claim = "" } = {}) => {
  if (METADATA_CLAIM.test(claim)) return "metadata"
  if (DOCS_CLAIM.test(claim) || (path && DOCUMENT_PATH.test(path))) return "docs drift"
  if ((path && TEST_PATH.test(path)) || TEST_CLAIM.test(claim)) return "test gap"
  return path ? "behaviour defect" : "other"
}

const claimOf = (body) => {
  if (typeof body !== "string") return ""
  const line = body
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .split("\n")
    .map((entry) => entry.replace(/^>\s*(\[![A-Z]+\]\s*)?/, "").replaceAll(/[*_`#]/g, "").replaceAll(/\s+/g, " ").trim())
    .find((entry) => /[A-Za-z0-9]/.test(entry) && !/^\[![A-Z]+\]$/.test(entry))
  return (line ?? "").slice(0, 200)
}

const REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"])

/**
 * Rounds to the first APPROVED Pullfrog review of one merged pull request, counted on distinct
 * head commits in submission order, and the category of every failed round before it.
 */
export const roundsOf = (pull) => {
  const reviews = pull.reviews.nodes
    .filter((review) => isBot(review.author) && REVIEW_STATES.has(review.state))
    .sort((left, right) => timeOf(left.submittedAt) - timeOf(right.submittedAt))
  const approvalIndex = reviews.findIndex((review) => review.state === "APPROVED")
  if (approvalIndex === -1) return { number: pull.number, mergedAt: pull.mergedAt, approved: false, rounds: null, reviews: reviews.length, failedRounds: [] }
  const counted = reviews.slice(0, approvalIndex + 1)
  const approvingHead = counted.at(-1).commit?.oid ?? null
  const heads = [...new Set(counted.map((review) => review.commit?.oid ?? null))]
  const dismissedApprovals = new Set(pull.timelineItems.nodes
    .filter((event) => event?.previousReviewState === "APPROVED" && event.review?.id)
    .map((event) => event.review.id))
  const threads = pull.reviewThreads.nodes
    .map((thread) => ({ path: thread.path ?? null, comment: thread.comments?.nodes?.[0] }))
    .filter((thread) => isBot(thread.comment?.author))
    .sort((left, right) => timeOf(left.comment.createdAt) - timeOf(right.comment.createdAt))
  const failedRounds = heads.filter((head) => head !== approvingHead).map((head) => {
    const headReviews = counted.filter((review) => (review.commit?.oid ?? null) === head)
    const last = headReviews.at(-1)
    if (last.state === "DISMISSED" && dismissedApprovals.has(last.id)) return { head, category: "dismissed approval", path: null, claim: claimOf(last.body) }
    const reviewIds = new Set(headReviews.map((review) => review.id))
    const first = threads.find((thread) => reviewIds.has(thread.comment.pullRequestReview?.id))
    const finding = first ? { path: first.path, claim: claimOf(first.comment.body) } : { path: null, claim: claimOf(last.body) }
    return { head, category: categoryOf(finding), ...finding }
  })
  return { number: pull.number, mergedAt: pull.mergedAt, approved: true, rounds: heads.length, reviews: counted.length, failedRounds }
}

const median = (values) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const summarize = (rows) => {
  const approved = rows.filter((row) => row.approved)
  const rounds = approved.map((row) => row.rounds)
  const distribution = {}
  for (const count of rounds) distribution[count] = (distribution[count] ?? 0) + 1
  const categories = {}
  for (const round of rows.flatMap((row) => row.failedRounds)) categories[round.category] = (categories[round.category] ?? 0) + 1
  return {
    pullRequests: rows.length,
    approved: approved.length,
    unapproved: rows.length - approved.length,
    medianRounds: median(rounds),
    meanRounds: rounds.length ? Number((rounds.reduce((total, count) => total + count, 0) / rounds.length).toFixed(2)) : null,
    distribution,
    reviews: rows.reduce((total, row) => total + row.reviews, 0),
    categories: Object.fromEntries(Object.entries(categories).sort(([, left], [, right]) => right - left)),
  }
}

const shapeError = (message) => Object.assign(new Error(`GitHub returned an unexpected shape: ${message}`), { exitCode: 1 })

const assertConnection = (connection, label) => {
  if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean") throw shapeError(`${label} carries no nodes or pageInfo`)
  if (connection.pageInfo.hasNextPage && typeof connection.pageInfo.endCursor !== "string") throw shapeError(`${label} says another page exists but carries no endCursor`)
}

/** Follows one cursor chain to its end, refusing a repeated cursor or an unbounded chain. */
const exhaust = async (first, label, readPage) => {
  assertConnection(first, label)
  const nodes = [...first.nodes]
  let pageInfo = first.pageInfo
  const seen = new Set()
  while (pageInfo.hasNextPage) {
    if (seen.has(pageInfo.endCursor)) throw shapeError(`${label} repeated the cursor ${pageInfo.endCursor}`)
    if (seen.size >= MAX_PAGES) throw shapeError(`${label} passed the ${MAX_PAGES}-page bound`)
    seen.add(pageInfo.endCursor)
    const next = await readPage(pageInfo.endCursor)
    assertConnection(next, label)
    nodes.push(...next.nodes)
    pageInfo = next.pageInfo
  }
  return nodes
}

/**
 * Reads the newest `limit` merged pull requests with every review, thread and dismissal.
 * GitHub cannot order by merge time, so pages arrive newest update first. A merge also updates
 * the pull request, so once a page ends older than the limit-th newest merge, the window is exact.
 */
export const collectMergedPulls = async ({ graphql, owner, name, limit }) => {
  const pulls = []
  let after = null
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) throw shapeError(`merged pull requests passed the ${MAX_PAGES}-page bound`)
    const data = await graphql(mergedPullsQuery, { owner, name, ...(after ? { after } : {}) })
    const connection = data?.repository?.pullRequests
    assertConnection(connection, "pullRequests")
    pulls.push(...connection.nodes)
    const newest = pulls.map((pull) => timeOf(pull.mergedAt)).sort((left, right) => right - left)
    const oldestUpdate = timeOf(connection.nodes.at(-1)?.updatedAt)
    const windowClosed = newest.length >= limit && oldestUpdate < newest[limit - 1]
    if (!connection.pageInfo.hasNextPage || windowClosed) break
    after = connection.pageInfo.endCursor
  }
  const window = pulls.sort((left, right) => timeOf(right.mergedAt) - timeOf(left.mergedAt)).slice(0, limit)
  for (const pull of window) {
    for (const connection of Object.keys(CONNECTION_SELECTIONS)) {
      pull[connection] = { nodes: await exhaust(pull[connection], `#${pull.number} ${connection}`, async (cursor) => {
        const data = await graphql(connectionQuery(connection), { owner, name, number: pull.number, after: cursor })
        return data?.repository?.pullRequest?.[connection]
      }), pageInfo: { hasNextPage: false, endCursor: null } }
    }
  }
  return window
}

const reviewRounds = async (options) => {
  const rows = (await collectMergedPulls(options)).map(roundsOf)
  return { pullRequests: rows, summary: summarize(rows) }
}

const sleep = (seconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, seconds * 1000))

/** One gh child per call; the budget the previous response reported paces the next call. */
export const githubGraphql = ({ environment, secrets, runner = runBounded, wait = sleep, now = () => Date.now() }) => {
  let budget = null
  return async (query, variables) => {
    const decision = graphqlBudgetDecision(budget, { nowSeconds: Math.floor(now() / 1000) })
    if (decision.action === "wait" && decision.waitSeconds > 0) {
      console.error(JSON.stringify({ event: "GITHUB_RATE_LIMIT_WAIT", waitSeconds: decision.waitSeconds, reason: decision.reason }))
      await wait(decision.waitSeconds)
    }
    const fields = Object.entries(variables).flatMap(([key, value]) => [typeof value === "number" ? "-F" : "-f", `${key}=${value}`])
    const result = await runner(environment.GH_BIN || "gh", ["api", "graphql", ...fields, "-f", `query=${query}`], { env: environment, timeoutMs: 60000 })
    if (result.error || result.timedOut || result.overflowed || result.status !== 0) {
      const detail = result.stderr || result.error?.message || (result.timedOut ? "timed out after 60s" : result.overflowed ? "output bound exceeded" : `exit ${result.status}`)
      throw Object.assign(new Error(`gh api graphql failed: ${redactSecrets(String(detail).trim(), secrets)}`), { exitCode: 1 })
    }
    let response
    try {
      response = JSON.parse(result.stdout)
    } catch {
      throw shapeError("gh api graphql printed invalid JSON")
    }
    if (response.errors?.length) throw Object.assign(new Error(`gh api graphql reported: ${response.errors.map((entry) => entry.message).join("; ")}`), { exitCode: 1 })
    const limit = response.data?.rateLimit
    budget = limit && Number.isFinite(limit.remaining) ? { remaining: limit.remaining, reset: Math.floor(Date.parse(limit.resetAt) / 1000) } : null
    return response.data
  }
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const parseArguments = (argv) => {
  const options = { repo: null, limit: 100 }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag !== "--repo" && flag !== "--limit") fail(2, `${USAGE}\n\nunknown option: ${flag}`)
    if (value === undefined || value.startsWith("-")) fail(2, `${USAGE}\n\n${flag} requires a value`)
    index++
    if (flag === "--repo") options.repo = value
    else if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_LIMIT) fail(2, `${USAGE}\n\n--limit must be an integer from 1 through ${MAX_LIMIT}`)
    else options.limit = Number(value)
  }
  if (!options.repo) fail(2, `${USAGE}\n\n--repo is required`)
  return options
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE)
    return
  }
  const { repo, limit } = parseArguments(argv)
  let config
  let slug
  let auth
  try {
    config = readOrchestratorConfig()
    if (typeof config.repos?.[repo] !== "string") fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ")})`)
    slug = repositorySlug(config.repos[repo])
    auth = await githubEnvironment(config.repos[repo])
  } catch (error) {
    fail(2, redactSecrets(error.message))
  }
  const [owner, name] = slug.split("/")
  try {
    const report = await reviewRounds({ graphql: githubGraphql(auth), owner, name, limit })
    console.log(JSON.stringify({ repository: slug, limit, ...report }, null, 2))
  } catch (error) {
    fail(error.exitCode ?? 1, redactSecrets(error.message, auth.secrets))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
