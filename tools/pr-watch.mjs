#!/usr/bin/env node
/**
 * Watch one or more PRs until they reach a state the caller has NOT already acted on, and
 * exit naming which transition fired.
 *
 * This exists because babysitting a PR was prose in `/orchestrate` section 3, so every run
 * improvised its own shell loop, and on the 2026-07-27 ORB-88 run that loop was written wrong
 * twice, both times failing SILENTLY. First it exited as soon as a review verdict existed at
 * all, so a stale CHANGES_REQUESTED carried on an older commit fired instantly and reported a
 * verdict that had nothing to do with the pushed fix. Then, rewritten, it exited only on
 * `mergeStateStatus == CLEAN` plus APPROVED or on a failing check: a fresh CHANGES_REQUESTED
 * is neither, so when review round 3 requested changes the loop just kept spinning, recording
 * `verdict=CHANGES_REQUESTED merge=BLOCKED` at polls 9, 10 and 11 into a file nobody was
 * reading. Thomas learned the PR had come back before the orchestrator did, by asking.
 *
 * Both bugs are one root cause: a watcher whose terminal condition is an allowlist of the
 * states somebody remembered. So the condition here is the inverse, and it is the whole design
 * of this tool: stop on ANYTHING that differs from the state the caller says it has handled.
 * A verdict counts only when it sits on the CURRENT head, which is why the review's own commit
 * comes back from the GraphQL API; `gh pr view --json reviews` cannot answer that.
 */

import { execFileSync } from "node:child_process"

const USAGE = `usage: pr-watch.mjs --repo <owner/name> --pr <n>[,<n>...] [options]

  --repo <owner/name>   the GitHub repository the PRs live in (required)
  --pr <n>[,<n>...]     PR numbers to watch; repeatable and comma-separated (required).
                        The FIRST one to transition ends the run
  --acted <n>=<sha>:<verdict>
                        what the caller has ALREADY handled on PR <n>: the head SHA the
                        verdict was given on (a prefix is enough) and the verdict itself
                        (APPROVED, CHANGES_REQUESTED, COMMENTED). Repeatable. Omit it and
                        any verdict on the current head is news. This is the ONLY thing that
                        suppresses a verdict, so a state nobody listed is always reported
  --interval <seconds>  seconds between polls (default: 60)
  --timeout <seconds>   stop waiting after this long (default: 5400, 90 minutes)
  --once                read the state once and report it; wait for nothing
  --help, -h            print this usage and exit 0

Prints one JSON object on stdout: repo, pr, url, transition, headSha, verdict, verdictSha,
reviewDecision, mergeStateStatus, failingChecks, polls, watched. Progress goes to stderr.

The transitions, in the order they are checked, so a PR in several at once reports the one
that matters most: gone (merged or closed), checks-failed, changes-requested, review-comment,
approved (a fresh verdict on the current head), ready-to-merge (approved and mergeable).

exit codes: 0 approved or ready to merge, 1 the PR needs work (a failing check or a fresh
            non-approving verdict), 2 usage error, 3 a gh command failed,
            4 nothing transitioned before the timeout (or before --once returned),
            5 the PR is merged or closed, so there is nothing left to watch`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const GH = process.env.GH_BIN || "gh"

/**
 * A cancelled check is deliberately NOT a failure: it is what a superseded or re-run workflow
 * leaves behind, and its replacement is usually already queued, so firing on it would wake the
 * orchestrator for a push it made itself. Everything else that concluded without success is.
 */
const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED"])
const FAILED_STATUS_STATES = new Set(["FAILURE", "ERROR"])

/** CHANGES_REQUESTED outranks APPROVED on the same head: two reviewers disagreeing is work, not a merge. */
const VERDICT_RANK = { CHANGES_REQUESTED: 3, COMMENTED: 2, APPROVED: 1 }

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argsOf = (flag) =>
  process.argv.reduce((found, token, index) => (token === flag && process.argv[index + 1] ? [...found, process.argv[index + 1]] : found), [])
const argOf = (flag) => argsOf(flag)[0] ?? null

const KNOWN_FLAGS = new Set(["--repo", "--pr", "--acted", "--interval", "--timeout", "--once", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && KNOWN_FLAGS.has(token) === false && /^-\d+$/.test(token) === false)
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const repo = argOf("--repo")
const prNumbers = argsOf("--pr")
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter(Boolean)
const interval = Number(argOf("--interval") ?? 60)
const timeout = Number(argOf("--timeout") ?? 5400)
const once = process.argv.includes("--once")

if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(2, `${USAGE}\n\n--repo must be an owner/name slug such as thomasluizon/orbit-ui-mobile`)
if (prNumbers.length === 0) fail(2, `${USAGE}\n\n--pr is required`)
if (prNumbers.some((value) => !/^\d+$/.test(value))) fail(2, `--pr takes PR numbers, got: ${prNumbers.join(", ")}`)
if (!Number.isFinite(interval) || interval <= 0) fail(2, "--interval must be a positive number of seconds")
if (!Number.isFinite(timeout) || timeout <= 0) fail(2, "--timeout must be a positive number of seconds")

/** The baseline is per PR, so watching two PRs cannot suppress the other's verdict. */
const acted = new Map()
for (const entry of argsOf("--acted")) {
  const parsed = /^(\d+)=([0-9a-fA-F]{7,40}):([A-Z_]+)$/.exec(entry)
  if (!parsed) fail(2, `--acted must look like 615=d9a3f1c:CHANGES_REQUESTED, got: ${entry}`)
  acted.set(parsed[1], { sha: parsed[2].toLowerCase(), verdict: parsed[3] })
}
const unwatched = [...acted.keys()].filter((number) => !prNumbers.includes(number))
if (unwatched.length > 0) fail(2, `--acted names PR(s) that --pr does not watch: ${unwatched.join(", ")}`)

const QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      number url state merged isDraft mergeStateStatus reviewDecision headRefOid
      latestReviews(last:20){nodes{state author{login} commit{oid}}}
      commits(last:1){nodes{commit{statusCheckRollup{state contexts(last:100){nodes{
        __typename
        ... on CheckRun{name status conclusion}
        ... on StatusContext{context state}
      }}}}}}
    }
  }
}`

const [owner, name] = repo.split("/")

const readPullRequest = (number) => {
  let raw
  try {
    raw = execFileSync(GH, ["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error) {
    fail(3, `gh api graphql for ${repo}#${number} failed: ${(error.stdout?.toString() || error.stderr?.toString() || error.message).trim().slice(0, 400)}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(3, `gh api graphql returned unparseable output for ${repo}#${number}: ${raw.slice(0, 400)}`)
  }
  if (parsed.errors?.length) fail(3, `gh api graphql reported an error for ${repo}#${number}: ${parsed.errors.map((entry) => entry.message).join("; ").slice(0, 400)}`)
  const pullRequest = parsed.data?.repository?.pullRequest
  if (!pullRequest) fail(3, `${repo}#${number} does not exist, or the token cannot see it`)
  return pullRequest
}

const failingChecksOf = (pullRequest) =>
  (pullRequest.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [])
    .filter((context) =>
      context.__typename === "CheckRun" ? FAILED_CONCLUSIONS.has(context.conclusion) : FAILED_STATUS_STATES.has(context.state),
    )
    .map((context) => `${context.name ?? context.context}: ${context.conclusion ?? context.state}`)

/** Only reviews sitting on the CURRENT head count, which is the whole stale-verdict fix. */
const verdictOn = (pullRequest) => {
  const head = pullRequest.headRefOid
  const onHead = (pullRequest.latestReviews?.nodes ?? []).filter((review) => review.commit?.oid === head && VERDICT_RANK[review.state])
  if (onHead.length === 0) return null
  return onHead.reduce((worst, review) => (VERDICT_RANK[review.state] > VERDICT_RANK[worst.state] ? review : worst)).state
}

/** The one decision in this tool: does this state differ from what the caller already handled? */
const transitionOf = (pullRequest) => {
  const number = String(pullRequest.number)
  const head = pullRequest.headRefOid
  const failingChecks = failingChecksOf(pullRequest)
  const verdict = verdictOn(pullRequest)
  const baseline = acted.get(number)
  const handled = Boolean(baseline && baseline.verdict === verdict && head.toLowerCase().startsWith(baseline.sha))
  const state = {
    repo,
    pr: pullRequest.number,
    url: pullRequest.url,
    headSha: head,
    verdict,
    verdictSha: verdict ? head : null,
    reviewDecision: pullRequest.reviewDecision,
    mergeStateStatus: pullRequest.mergeStateStatus,
    failingChecks,
  }

  if (pullRequest.merged) return { ...state, transition: "gone", reason: "the PR is merged", code: 5 }
  if (pullRequest.state === "CLOSED") return { ...state, transition: "gone", reason: "the PR is closed unmerged", code: 5 }
  if (failingChecks.length > 0) return { ...state, transition: "checks-failed", reason: `failing check(s): ${failingChecks.join(", ")}`, code: 1 }
  if (verdict && !handled) {
    if (verdict === "CHANGES_REQUESTED") return { ...state, transition: "changes-requested", reason: `a fresh CHANGES_REQUESTED on ${head.slice(0, 7)}`, code: 1 }
    if (verdict === "COMMENTED") return { ...state, transition: "review-comment", reason: `a fresh review comment on ${head.slice(0, 7)}`, code: 1 }
    return { ...state, transition: "approved", reason: `a fresh APPROVED on ${head.slice(0, 7)} (merge state ${pullRequest.mergeStateStatus})`, code: 0 }
  }
  if (pullRequest.reviewDecision === "APPROVED" && pullRequest.mergeStateStatus === "CLEAN") {
    return { ...state, transition: "ready-to-merge", reason: "approved and mergeable", code: 0 }
  }
  return null
}

const deadline = Date.now() + timeout * 1000
let polls = 0
let last = null

while (true) {
  polls += 1
  for (const number of prNumbers) {
    const pullRequest = readPullRequest(number)
    const fired = transitionOf(pullRequest)
    last = fired ?? {
      repo,
      pr: pullRequest.number,
      url: pullRequest.url,
      headSha: pullRequest.headRefOid,
      verdict: verdictOn(pullRequest),
      reviewDecision: pullRequest.reviewDecision,
      mergeStateStatus: pullRequest.mergeStateStatus,
      failingChecks: failingChecksOf(pullRequest),
    }
    console.error(
      `poll ${polls}: #${pullRequest.number} head=${pullRequest.headRefOid.slice(0, 7)} verdict=${last.verdict ?? "none-on-head"} decision=${pullRequest.reviewDecision ?? "none"} merge=${pullRequest.mergeStateStatus} failing=${last.failingChecks.length}${fired ? ` -> ${fired.transition}` : ""}`,
    )
    if (fired) {
      console.log(JSON.stringify({ ...fired, polls, watched: prNumbers.map(Number) }, null, 2))
      console.error(fired.reason)
      process.exit(fired.code)
    }
  }
  if (once || Date.now() + interval * 1000 >= deadline) break
  sleep(interval * 1000)
}

console.log(JSON.stringify({ ...last, transition: once ? "none" : "timeout", polls, watched: prNumbers.map(Number) }, null, 2))
console.error(
  once
    ? "nothing to act on: no failing check, no verdict on the current head that you have not handled, and not mergeable-and-approved"
    : `nothing transitioned in ${timeout}s over ${polls} poll(s); the PR is still in a state you have already acted on`,
)
process.exit(4)
