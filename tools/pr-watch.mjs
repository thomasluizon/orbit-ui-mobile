#!/usr/bin/env node
/**
 * Watch one or more PRs until they reach an actionable state the caller has NOT already
 * acted on, and exit naming which transition fired.
 *
 * This exists because babysitting a PR was prose in `/orchestrate` section 3, so every run
 * improvised its own shell loop, and on the 2026-07-27 ORB-88 run that loop was written wrong
 * twice, both times failing SILENTLY. First it exited as soon as a review verdict existed at
 * all, so a stale CHANGES_REQUESTED carried on an older commit fired instantly and reported a
 * verdict that had nothing to do with the pushed fix. A rewritten version then exited only on
 * `mergeStateStatus == CLEAN` plus APPROVED or a failing check. A fresh CHANGES_REQUESTED
 * is neither, so when review round 3 requested changes that loop just kept spinning, recording
 * `verdict=CHANGES_REQUESTED merge=BLOCKED` at polls 9, 10 and 11 into a file nobody was
 * reading. Thomas learned the PR had come back before the orchestrator did, by asking.
 *
 * A verdict counts only when it sits on the CURRENT head, which is why the review's own commit
 * comes back from the GraphQL API; `gh pr view --json reviews` cannot answer that. Poll-to-poll
 * changes are limited to signals the orchestrator can act on; mergeability recomputation churn
 * is deliberately not a transition.
 */

import { execFileSync } from "node:child_process"

import { evaluateReviewEvidence, isReviewEvidenceCandidate } from "./check-review-evidence.mjs"

const USAGE = `usage: pr-watch.mjs --repo <owner/name> --pr <n>[,<n>...] [options]

  --repo <owner/name>   the GitHub repository the PRs live in (required)
  --pr <n>[,<n>...]     PR numbers to watch; repeatable and comma-separated (required).
                        The FIRST one to transition ends the run
  --acted <n>=<sha>:<signal>
                        what the caller has ALREADY handled on PR <n>: the head SHA the
                        signal belongs to (a prefix is enough) and APPROVED,
                        CHANGES_REQUESTED, COMMENTED, NEEDS_WORK, or READY_TO_MERGE. Repeatable entries
                        for the same PR and head accumulate, suppressing every listed signal.
                        APPROVED suppresses only that verdict; READY_TO_MERGE independently
                        suppresses readiness already handled on that head
  --interval <seconds>  seconds between polls (default: 60)
  --timeout <seconds>   stop waiting after this long (default: 5400, 90 minutes)
  --once                read the state once and report it; wait for nothing
  --help, -h            print this usage and exit 0

Prints one JSON object on stdout: repo, pr, url, transition, headSha, verdict, verdictSha,
reviewDecision, mergeStateStatus, failingChecks, polls, watched. Progress goes to stderr.

The transitions, in the order they are checked, so a PR in several at once reports the one
that matters most: gone (merged or closed), draft, checks-failed, head-changed, changes-requested,
review-comment, needs-work, review-evidence-blocked, approved (a fresh verdict on the current head),
ready-to-merge (a review-clear PR
becomes mergeable), review-decision, merge-clean. UNKNOWN and changes among other merge states
never emit. The first poll establishes the baseline for state transitions, except unhandled
verdicts and unhandled readiness still emit immediately.

Ready-to-merge means CLEAN with no CHANGES_REQUESTED and current local APPROVE evidence from a
complete review inventory. If a native approval exists, at least one must name the current head.

exit codes: 0 an actionable non-error state, 1 the PR needs work or has a new head (a failing
            check, a fresh blocking verdict or decision, or a head change), 2 usage error,
            3 a gh command failed,
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
const ACTED_SIGNALS = new Set([...Object.keys(VERDICT_RANK), "NEEDS_WORK", "READY_TO_MERGE"])

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

/** The baseline is per PR and head, with every handled verdict or readiness signal retained. */
const acted = new Map()
for (const entry of argsOf("--acted")) {
  const parsed = /^(\d+)=([0-9a-fA-F]{7,40}):([A-Z_]+)$/.exec(entry)
  if (!parsed) fail(2, `--acted must look like 615=d9a3f1c:CHANGES_REQUESTED, got: ${entry}`)
  if (!ACTED_SIGNALS.has(parsed[3])) fail(2, `--acted signal must be ${[...ACTED_SIGNALS].join(", ")}, got: ${parsed[3]}`)
  const key = `${parsed[1]}:${parsed[2].toLowerCase()}`
  const signals = acted.get(key) ?? new Set()
  signals.add(parsed[3])
  acted.set(key, signals)
}
const unwatched = [...new Set([...acted.keys()].map((key) => key.split(":")[0]).filter((number) => !prNumbers.includes(number)))]
if (unwatched.length > 0) fail(2, `--acted names PR(s) that --pr does not watch: ${unwatched.join(", ")}`)

const QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      number url state merged isDraft mergeStateStatus reviewDecision headRefOid
      files(first:100){pageInfo{hasNextPage}nodes{path}}
      latestReviews(last:20){nodes{state body author{login} commit{oid}}}
      reviews(first:100){pageInfo{hasNextPage} nodes{state body submittedAt updatedAt lastEditedAt url author{login} commit{oid}}}
      commits(last:1){nodes{commit{statusCheckRollup{state contexts(last:100){nodes{
        __typename
        ... on CheckRun{name status conclusion startedAt}
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

/** GitHub evaluates only the latest check run per context name. The connection order is not that contract. */
const latestCheckRunsOf = (contexts) => {
  const statusContexts = contexts.filter((context) => context.__typename !== "CheckRun")
  const latestByName = new Map()
  const unordered = []
  for (const checkRun of contexts.filter((context) => context.__typename === "CheckRun")) {
    const startedAt = checkRun.startedAt
    if (typeof startedAt !== "string") {
      unordered.push(checkRun)
      continue
    }
    const latest = latestByName.get(checkRun.name)
    if (!latest || startedAt > latest.startedAt) latestByName.set(checkRun.name, { startedAt, runs: [checkRun] })
    else if (startedAt === latest.startedAt) latest.runs.push(checkRun)
  }
  return [...statusContexts, ...unordered, ...[...latestByName.values()].flatMap((latest) => latest.runs)]
}

const failingChecksOf = (pullRequest) =>
  latestCheckRunsOf(pullRequest.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [])
    .filter((context) =>
      context.__typename === "CheckRun" ? FAILED_CONCLUSIONS.has(context.conclusion) : FAILED_STATUS_STATES.has(context.state),
    )
    .map((context) => `${context.name ?? context.context}: ${context.conclusion ?? context.state}`)

/** Only reviews sitting on the CURRENT head count, which is the whole stale-verdict fix. */
const verdictsOn = (pullRequest) => {
  const head = pullRequest.headRefOid
  const onHead = (pullRequest.latestReviews?.nodes ?? []).filter((review) => review.commit?.oid === head && VERDICT_RANK[review.state] && !isReviewEvidenceCandidate(review))
  return [...new Set(onHead.map((review) => review.state))].sort((left, right) => VERDICT_RANK[right] - VERDICT_RANK[left])
}

const handledSignalsOn = (number, head) => {
  const handled = new Set()
  for (const [key, signals] of acted) {
    const [actedNumber, actedSha] = key.split(":")
    if (actedNumber === number && head.toLowerCase().startsWith(actedSha)) {
      for (const signal of signals) handled.add(signal)
    }
  }
  return handled
}

const reviewClearOn = (pullRequest) => {
  if (!Object.hasOwn(pullRequest, "reviewDecision") || pullRequest.reviewDecision === "CHANGES_REQUESTED") return false
  return evaluateReviewEvidence(pullRequest, pullRequest.headRefOid).ok
}

const snapshotOf = (pullRequest, previous) => ({
  headSha: pullRequest.headRefOid,
  reviewDecision: pullRequest.reviewDecision,
  mergeStateStatus: pullRequest.mergeStateStatus === "UNKNOWN" ? (previous?.mergeStateStatus ?? null) : pullRequest.mergeStateStatus,
})

/** The one decision in this tool: did this PR enter a state the orchestrator can act on? */
const transitionOf = (pullRequest, previous) => {
  const number = String(pullRequest.number)
  const head = pullRequest.headRefOid
  const failingChecks = failingChecksOf(pullRequest)
  const handled = handledSignalsOn(number, head)
  const verdicts = verdictsOn(pullRequest)
  const verdict = verdicts.find((candidate) => !handled.has(candidate)) ?? verdicts[0] ?? null
  const reviewEvidence = evaluateReviewEvidence(pullRequest, head)
  const reviewClear = reviewClearOn(pullRequest)
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
    reviewEvidence: { status: reviewEvidence.status, reason: reviewEvidence.reason },
  }

  if (pullRequest.merged) return { ...state, transition: "gone", reason: "the PR is merged", code: 5 }
  if (pullRequest.state === "CLOSED") return { ...state, transition: "gone", reason: "the PR is closed unmerged", code: 5 }
  if (pullRequest.isDraft) return { ...state, transition: "draft", reason: "the PR is a draft and cannot be merged", code: 1 }
  if (failingChecks.length > 0) return { ...state, transition: "checks-failed", reason: `failing check(s): ${failingChecks.join(", ")}`, code: 1 }
  if (previous && head !== previous.headSha) {
    return { ...state, transition: "head-changed", reason: `the head changed from ${previous.headSha.slice(0, 7)} to ${head.slice(0, 7)}`, code: 1 }
  }
  if (verdict === "CHANGES_REQUESTED" && !handled.has(verdict)) return { ...state, transition: "changes-requested", reason: `a fresh CHANGES_REQUESTED on ${head.slice(0, 7)}`, code: 1 }
  if (verdict === "COMMENTED" && !handled.has(verdict)) return { ...state, transition: "review-comment", reason: `a fresh review comment on ${head.slice(0, 7)}`, code: 1 }
  if (reviewEvidence.status === "NEEDS_WORK" && !handled.has("NEEDS_WORK")) return { ...state, transition: "needs-work", reason: reviewEvidence.reason, code: 1 }
  if (!["APPROVE", "AWAITING_REVIEW", "NEEDS_WORK"].includes(reviewEvidence.status)) return { ...state, transition: "review-evidence-blocked", reason: reviewEvidence.reason, code: 1 }
  if (reviewEvidence.ok && pullRequest.reviewDecision !== "CHANGES_REQUESTED" && !handled.has("APPROVED")) {
    return {
      ...state,
      verdict: "APPROVED",
      verdictSha: head,
      transition: "approved",
      reason: `current local APPROVE evidence on ${head.slice(0, 7)} (merge state ${pullRequest.mergeStateStatus})`,
      code: 0,
    }
  }
  const becameClean = Boolean(previous && pullRequest.mergeStateStatus === "CLEAN" && previous.mergeStateStatus !== "CLEAN")
  const decisionChanged = previous && pullRequest.reviewDecision !== previous.reviewDecision
  if (
    handled.has("READY_TO_MERGE") === false &&
    reviewClear &&
    pullRequest.mergeStateStatus === "CLEAN" &&
    (!previous || becameClean || decisionChanged)
  ) {
    return { ...state, transition: "ready-to-merge", reason: "review clear and mergeable", code: 0 }
  }
  if (decisionChanged) {
    const decision = pullRequest.reviewDecision ?? "none"
    return {
      ...state,
      transition: "review-decision",
      reason: `the review decision changed from ${previous.reviewDecision ?? "none"} to ${decision}`,
      code: reviewClear ? 0 : 1,
    }
  }
  if (becameClean) return { ...state, transition: "merge-clean", reason: "the merge state became CLEAN", code: 0 }
  return null
}

const deadline = Date.now() + timeout * 1000
let polls = 0
let last = null
const snapshots = new Map()

while (true) {
  polls += 1
  for (const number of prNumbers) {
    const pullRequest = readPullRequest(number)
    const previous = snapshots.get(number)
    const fired = transitionOf(pullRequest, previous)
    snapshots.set(number, snapshotOf(pullRequest, previous))
    last = fired ?? {
      repo,
      pr: pullRequest.number,
      url: pullRequest.url,
      headSha: pullRequest.headRefOid,
      verdict: verdictsOn(pullRequest)[0] ?? null,
      reviewDecision: pullRequest.reviewDecision,
      mergeStateStatus: pullRequest.mergeStateStatus,
      failingChecks: failingChecksOf(pullRequest),
      reviewEvidence: (() => {
        const evidence = evaluateReviewEvidence(pullRequest, pullRequest.headRefOid)
        return { status: evidence.status, reason: evidence.reason }
      })(),
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
    ? "nothing to act on: no failing check, no verdict on the current head that you have not handled, and not review-clear-and-mergeable"
    : `nothing transitioned in ${timeout}s over ${polls} poll(s); the PR is still in a state you have already acted on`,
)
process.exit(4)
