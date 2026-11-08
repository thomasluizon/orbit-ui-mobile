import { readFileSync } from "node:fs"
import { join } from "node:path"

import { T, TOOLS_DIR, check, orcaEnv, realOrchestratorConfig, run, stageRepo, stageWithConfig } from "./_harness.mjs"
import { categoryOf, collectMergedPulls, connectionQuery, githubGraphql, mergedPullsQuery, pullRequestQuery, roundsOf, summarize } from "../review-rounds.mjs"

const TOOL = "review-rounds.mjs"
const fixture = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "gh-review-rounds.json"), "utf8"))
const recorded = fixture.response.data
const pull = (number) => structuredClone(recorded.repository[`pr${number}`])
const UPDATE_ORDER = [2373, 2371, 2343, 2338, 2325]

/**
 * Counted by hand from the recorded reviews, threads and dismissal events, not from the tool.
 * 2343 has two reviews on its approving head, and 2325 has a CodeQL thread from another bot.
 */
const HAND_COUNT = {
  2371: { approved: true, rounds: 1, reviews: 1, categories: [] },
  2373: { approved: true, rounds: 3, reviews: 3, categories: ["dismissed approval", "test gap"] },
  2343: { approved: true, rounds: 4, reviews: 5, categories: ["behaviour defect", "dismissed approval", "behaviour defect"] },
  2338: { approved: false, rounds: null, reviews: 2, categories: [] },
  2325: { approved: true, rounds: 4, reviews: 4, categories: ["docs drift", "behaviour defect", "dismissed approval"] },
}
const HAND_SUMMARY = {
  pullRequests: 5, approved: 4, unapproved: 1, medianRounds: 3.5, meanRounds: 3,
  distribution: { 1: 1, 3: 1, 4: 2 }, reviews: 15,
  categories: { "dismissed approval": 3, "behaviour defect": 3, "test gap": 1, "docs drift": 1 },
}

const matchesHandCount = (row) => {
  const expected = HAND_COUNT[row.number]
  return row.approved === expected.approved && row.rounds === expected.rounds && row.reviews === expected.reviews &&
    JSON.stringify(row.failedRounds.map((round) => round.category)) === JSON.stringify(expected.categories)
}

const listing = (nodes, pageInfo = { hasNextPage: false, endCursor: null }) => ({
  rateLimit: recorded.rateLimit,
  repository: { pullRequests: { pageInfo, nodes } },
})

/** Serves listing pages in order and nested connection pages by cursor, recording every call. */
const fakeGraphql = (pages, connectionPages = {}) => {
  const calls = []
  const graphql = async (query, variables) => {
    calls.push({ query, variables })
    if (query === mergedPullsQuery) return pages[calls.filter((call) => call.query === mergedPullsQuery).length - 1]
    const page = connectionPages[`${variables.number}:${variables.after}`]
    return { rateLimit: recorded.rateLimit, repository: { pullRequest: page } }
  }
  return { graphql, calls }
}

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export const cases = async () => {
  check(TOOL, "refuses a missing --repo", ["--limit", "5"], { status: 2, stderr: /--repo is required/ })
  check(TOOL, "refuses a zero --limit", ["--repo", "ui", "--limit", "0"], { status: 2, stderr: /--limit must be an integer from 1 through 1000/ })
  check(TOOL, "refuses a --limit above 1000", ["--repo", "ui", "--limit", "1001"], { status: 2, stderr: /--limit must be an integer/ })
  check(TOOL, "refuses a flag with no value", ["--repo"], { status: 2, stderr: /--repo requires a value/ })
  check(TOOL, "refuses an unconfigured repository", ["--repo", "nowhere"], { status: 2, stderr: /--repo must name a configured repository/ })

  T(`${TOOL}: the recorder used the production selection`, fixture.generation.producer.includes("pullRequestQuery") &&
    sameJson([...fixture.generation.numbers].sort(), Object.keys(HAND_COUNT).map(Number).sort()) &&
    pullRequestQuery([2371]).includes('reviews(first: 100, author: "pullfrog[bot]")'))

  for (const number of Object.keys(HAND_COUNT).map(Number)) {
    const row = roundsOf(pull(number))
    T(`${TOOL}: #${number} on the recorded fixture equals the hand count`, matchesHandCount(row), JSON.stringify(row))
  }
  const rows = UPDATE_ORDER.map((number) => roundsOf(pull(number)))
  T(`${TOOL}: the unapproved pull request reports null rounds, never 0`, rows.find((row) => row.number === 2338).rounds === null)
  const summary = summarize(rows)
  T(`${TOOL}: the summary of the recorded fixture equals the hand count`, sameJson(summary, HAND_SUMMARY), JSON.stringify(summary))
  T(`${TOOL}: the claim is the first text line of the finding`,
    rows.find((row) => row.number === 2373).failedRounds[1].claim.startsWith("This is a copy of the move-then-settle loop in calendar-week-reanchor-geometry.test.tsx"),
    JSON.stringify(rows.find((row) => row.number === 2373).failedRounds))

  const foreignReview = pull(2338)
  const approval = pull(2371).reviews.nodes[0]
  foreignReview.reviews.nodes.unshift({ ...approval, id: "foreign-review", submittedAt: "2026-11-05T15:00:00Z", author: { __typename: "Bot", login: "github-advanced-security" }, commit: foreignReview.reviews.nodes[0].commit })
  T(`${TOOL}: an APPROVED review from another bot never approves the pull request`, matchesHandCount(roundsOf(foreignReview)), JSON.stringify(roundsOf(foreignReview)))

  const foreignThread = pull(2325)
  const codeql = foreignThread.reviewThreads.nodes.find((thread) => thread.comments.nodes[0].author.login === "github-advanced-security")
  codeql.comments.nodes[0].pullRequestReview.id = foreignThread.reviews.nodes[0].id
  T(`${TOOL}: an earlier thread from another bot on a Pullfrog review is not the first finding`, Boolean(codeql) && matchesHandCount(roundsOf(foreignThread)), JSON.stringify(roundsOf(foreignThread)))

  const humanLogin = pull(2371)
  humanLogin.reviews.nodes[0].author = { __typename: "User", login: "pullfrog" }
  T(`${TOOL}: a user account named like the bot is not the bot`, roundsOf(humanLogin).approved === false)

  T(`${TOOL}: a claim naming the pull request body is metadata`, categoryOf({ path: null, claim: "The PR body still lacks the real API evidence the review rules require" }) === "metadata")
  T(`${TOOL}: a stale code comment is docs drift even inside a test file`, categoryOf({ path: "tools/__tests__/android-boot.mjs", claim: "3e86a3e made this comment stale." }) === "docs drift")
  T(`${TOOL}: a thread on a C# test project is a test gap`, categoryOf({ path: "tests/Orbit.Api.Tests/HabitTests.cs", claim: "Recompute the next occurrence" }) === "test gap")
  T(`${TOOL}: a thread on production code is a behaviour defect`, categoryOf({ path: "src/Orbit.Domain/Entities/Habit.cs", claim: "Recompute the next occurrence" }) === "behaviour defect")
  T(`${TOOL}: a body finding that matches no rule is other`, categoryOf({ path: null, claim: "Nothing blocking. The new layout leaves one cleanup undone." }) === "other")

  const nodes = UPDATE_ORDER.map(pull)
  const twoPages = () => [listing(nodes.slice(0, 3), { hasNextPage: true, endCursor: "listing-1" }), listing(nodes.slice(3))]
  let fake = fakeGraphql(twoPages())
  let window = await collectMergedPulls({ graphql: fake.graphql, owner: "thomasluizon", name: "orbit-ui-mobile", limit: 5 })
  T(`${TOOL}: every listing page is read until the window is full`, window.length === 5 && fake.calls.length === 2 && fake.calls[1].variables.after === "listing-1" &&
    sameJson(window.map((entry) => entry.number), UPDATE_ORDER), JSON.stringify(fake.calls.map((call) => call.variables)))
  fake = fakeGraphql(twoPages())
  window = await collectMergedPulls({ graphql: fake.graphql, owner: "thomasluizon", name: "orbit-ui-mobile", limit: 2 })
  T(`${TOOL}: a page that ends older than the newest merges closes the window`, fake.calls.length === 1 && sameJson(window.map((entry) => entry.number), [2373, 2371]))

  const recentlyUpdated = UPDATE_ORDER.map(pull)
  recentlyUpdated[4].updatedAt = "2026-11-08T15:00:00Z"
  const reordered = [recentlyUpdated[4], ...recentlyUpdated.slice(0, 4)]
  fake = fakeGraphql([listing(reordered.slice(0, 3), { hasNextPage: true, endCursor: "listing-1" }), listing(reordered.slice(3))])
  window = await collectMergedPulls({ graphql: fake.graphql, owner: "thomasluizon", name: "orbit-ui-mobile", limit: 2 })
  T(`${TOOL}: an old merge updated recently never displaces a newer merge`, sameJson(window.map((entry) => entry.number), [2373, 2371]) && fake.calls.length === 2)

  const split = pull(2325)
  const allReviews = split.reviews.nodes
  split.reviews = { pageInfo: { hasNextPage: true, endCursor: "reviews-1" }, nodes: allReviews.slice(0, 2) }
  fake = fakeGraphql([listing([split])], { "2325:reviews-1": { reviews: { pageInfo: { hasNextPage: false, endCursor: "reviews-2" }, nodes: allReviews.slice(2) } } })
  window = await collectMergedPulls({ graphql: fake.graphql, owner: "thomasluizon", name: "orbit-ui-mobile", limit: 1 })
  const followUp = fake.calls.find((call) => call.query === connectionQuery("reviews"))
  T(`${TOOL}: a nested review page is followed to its end before counting`, matchesHandCount(roundsOf(window[0])) &&
    followUp?.variables.number === 2325 && followUp.variables.after === "reviews-1", JSON.stringify(fake.calls.map((call) => call.variables)))

  const looping = pull(2325)
  looping.reviews = { pageInfo: { hasNextPage: true, endCursor: "same" }, nodes: allReviews.slice(0, 1) }
  fake = fakeGraphql([listing([looping])], { "2325:same": { reviews: { pageInfo: { hasNextPage: true, endCursor: "same" }, nodes: [] } } })
  const loopError = await collectMergedPulls({ graphql: fake.graphql, owner: "thomasluizon", name: "orbit-ui-mobile", limit: 1 }).then(() => null, (error) => error)
  T(`${TOOL}: a repeated cursor fails with the read-failure exit code`, loopError?.exitCode === 1 && /repeated the cursor/.test(loopError.message), String(loopError?.message))

  const runnerCalls = []
  const waits = []
  const nowSeconds = Date.parse("2026-11-08T20:00:00Z") / 1000
  const runner = async (file, args, options) => {
    runnerCalls.push({ args, env: options.env })
    if (runnerCalls.length === 3) return { status: 1, stdout: "", stderr: "HTTP 502 for token-secret", error: null, timedOut: false, overflowed: false }
    return { status: 0, stdout: JSON.stringify({ data: { rateLimit: { remaining: 150, resetAt: "2026-11-08T20:00:30Z" }, repository: null } }), stderr: "", error: null, timedOut: false, overflowed: false }
  }
  const graphql = githubGraphql({ environment: { GH_TOKEN: "token-secret" }, secrets: ["token-secret"], runner, wait: async (seconds) => waits.push(seconds), now: () => nowSeconds * 1000 })
  await graphql(connectionQuery("reviews"), { owner: "thomasluizon", name: "orbit-ui-mobile", number: 2325, after: "cursor" })
  T(`${TOOL}: the first call proceeds and passes the number as a typed field`, waits.length === 0 &&
    runnerCalls[0].args.includes("number=2325") && runnerCalls[0].args[runnerCalls[0].args.indexOf("number=2325") - 1] === "-F" &&
    !runnerCalls[0].args.some((argument) => argument.includes("token-secret")) && runnerCalls[0].env.GH_TOKEN === "token-secret")
  await graphql(mergedPullsQuery, { owner: "thomasluizon", name: "orbit-ui-mobile" })
  T(`${TOOL}: a budget under the floor waits for the reported reset before the next call`, sameJson(waits, [30]), JSON.stringify(waits))
  const failure = await graphql(mergedPullsQuery, { owner: "thomasluizon", name: "orbit-ui-mobile" }).then(() => null, (error) => error)
  T(`${TOOL}: a failed gh call exits 1 with the token redacted`, failure?.exitCode === 1 && !failure.message.includes("token-secret") && failure.message.includes("<redacted>"), String(failure?.message))

  const context = stageRepo("review-rounds-ui")
  if (!context || context.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"]).status !== 0) {
    T(`${TOOL}: the hermetic repository context is available`, false, "could not stage the ui repository")
    return
  }
  const config = realOrchestratorConfig()
  config.repos = { ...config.repos, ui: context.path }
  const staged = stageWithConfig("review-rounds-hermetic", TOOL, config)
  const cli = run(TOOL, ["--repo", "ui", "--limit", "5"], { path: staged.path, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    /** Two pages, because the stub exits right after one write and a pipe holds only 64 KiB. */
    { match: "query ReviewRounds(", sequenceFile: join(staged.base, "listing-sequence"), stdoutSequence: [
      JSON.stringify({ data: listing(UPDATE_ORDER.slice(0, 3).map(pull), { hasNextPage: true, endCursor: "listing-1" }) }),
      JSON.stringify({ data: listing(UPDATE_ORDER.slice(3).map(pull)) }),
    ] },
  ]) })
  let report = null
  try { report = JSON.parse(cli.stdout) } catch { report = null }
  T(`${TOOL}: the CLI prints every pull request and the hand-counted summary`, cli.status === 0 && report?.repository === "thomasluizon/orbit-ui-mobile" &&
    report.pullRequests.length === 5 && report.pullRequests.every(matchesHandCount) && sameJson(report.summary, HAND_SUMMARY), cli.stdout || cli.stderr)
  const graphqlError = run(TOOL, ["--repo", "ui"], { path: staged.path, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "query ReviewRounds(", stdout: JSON.stringify({ errors: [{ message: "Something went wrong" }] }) },
  ]) })
  T(`${TOOL}: a GraphQL error exits 1 and prints no report`, graphqlError.status === 1 && graphqlError.stdout === "" && /Something went wrong/.test(graphqlError.stderr), graphqlError.stderr)
}
