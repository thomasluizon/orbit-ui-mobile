#!/usr/bin/env node
/**
 * Decide whether a worker actually finished its contract, mechanically, from
 * artifacts rather than from a status signal. Measured 2026-07-24 on ORB-75: the
 * orchestrator armed `orca terminal wait --for tui-idle`, got `satisfied: true`,
 * and read that as completion, while the worktree held 14 modified and 7
 * untracked files with zero commits, no push, no PR and the issue still In
 * Progress. tui-idle cannot tell "finished the contract" apart from "stopped
 * early" or "waiting on a prompt that will never come", so idle is a trigger to
 * run this check, never a report of success. Exits non-zero with the specific
 * unmet items, which is the checklist to nudge the worker with.
 */

import { execFileSyncHidden as execFileSync } from "./lib/subprocess-options.mjs"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"
import { RELAUNCH_SCOPE, STRIKE_LEDGER_ENV, recordStrike, strikeCount, strikeLedgerPath } from "./lib/strike-ledger.mjs"
import { readWorkerLaunchRecords, sameWorkerLaunch, workerDeliveryEvidence, workerLaunchLedgerPath } from "./lib/worker-launch-provenance.mjs"
import { evaluateReviewEvidence } from "./check-review-evidence.mjs"

/**
 * `process.kill(pid, 0)` proves SOME process holds that id, never that it is still the worker the
 * launcher started, because the operating system recycles ids. The same 275 codex rollouts that
 * set automation-budget.mjs's claimed-row backstop (p99 13.4 h, max 14.9 h on this machine) bound
 * a real session, so a claim older than 16 hours is past every measured session and the id may
 * belong to anyone. Past it liveness reads UNKNOWN: not alive, not gone, because neither was read.
 */
const PID_REUSE_BACKSTOP_HOURS = 16

const USAGE = `usage: worker-status.mjs --worktree <path> --issue ORB-N [--base <ref>] [--implementation] [--verify-review] [--consume-relaunch] [--json]

  --worktree <path>   the worker's worktree path, as printed by launch-worker.mjs (required)
  --issue ORB-N       the Linear issue the worker is finishing (required)
  --base <ref>        the branch the PR must target (default: main)
  --implementation     verify Luna's local commit handoff before Sol pushes or opens the PR
  --verify-review     run the one-time pre-merge review-thread verification
  --consume-relaunch  spend one relaunch allowance for this (issue, PR head) pair
  --json              emit the verdict as JSON instead of text
  --help, -h          print this usage and exit 0

Checks, all from artifacts: commits exist on the branch, the worktree carries no uncommitted
work, the branch is pushed, a PR is open against <ref> with no CHANGES_REQUESTED decision,
current local APPROVE evidence, zero unresolved threads, and any existing native approval anchored to its current head, every resolved automated thread has reconciliation evidence
after its latest finding-bearing nested activity and names a later fix commit that changed its reviewed path,
every standalone automated review item has a worker acknowledgement naming a PR commit,
no human-authored thread was resolved by the worker account, the local head matches the PR
head, the Linear issue is In Review with the PR attached, and both a screenshot and critique
artifact are attached when the ticket carries visible-effect (D7).

Liveness comes from the launcher-written PID marker <git-dir>/orbit-worker-pids.jsonl, whose exact
row must also exist in the central launcher ledger and match the configured headless invocation.
process.kill(pid, 0): ESRCH is gone, EPERM is alive and not ours. A pid that answers alive but was
claimed more than ${PID_REUSE_BACKSTOP_HOURS} hours ago may be a recycled id, so it reads unknown rather than alive. A
missing or unreadable marker, an unissued row, a row naming no parseable startedAt, and any other
errno also read unknown. Liveness is never inferred from the Linear state, which is honestly In
Progress for a ticket shipping several sequential pull requests.

verdicts:
  IMPLEMENTATION_READY Luna's signed completion receipt matches a clean local head above the remote base
  DELIVERED       every check above is met, including launcher-issued worker provenance and a
                  signed completion receipt for the exact PR head
  WORKING         a check is unmet and the worker process is alive
  AWAITING-REVIEW the worker process is gone, the PR is otherwise ready for review, and no
                  decisive local verdict exists for the current head. This includes no local
                  evidence, a valid prior-head marker, a selected malformed marker, or ambiguity
  NEEDS-WORK      the worker process is gone and the latest local review requests work
  STALLED         the worker process is gone, a PR is open, and review work is still outstanding:
                  CHANGES_REQUESTED is active, review evidence is invalid or stale, or an unresolved
                  thread, unacknowledged standalone automated review item, or resolved automated
                  thread with no fix commit still needs a worker
  AWAITING-MERGE  the worker process is gone, a PR is open, its review gates are clear and NO
                  review work is outstanding, so what is left is bookkeeping no relaunch can do
  IDLE            the worker process is gone and no PR is open, so this ticket is between pull
                  requests and needs a launch decision rather than a relaunch
  UNKNOWN         liveness could not be read, so nothing is relaunched on a state nobody observed

The relaunch allowance is counted in the shared strike ledger under scope "relaunch", keyed on
(issue, PR head SHA), so a push earns a fresh allowance and an unchanged head does not. The ledger
lives outside every worker process at ~/.orbit/worker-strikes.jsonl, overridable with
${STRIKE_LEDGER_ENV}. Its cap is attemptsBeforeRewrite from .claude/orchestrator.json, and
the verdict carries the outstanding findings a relaunch must carry instead of the ticket body alone.

exit codes: 0 the contract is met, or under --consume-relaunch the relaunch was granted and recorded,
            1 unmet items (listed), 2 usage error,
            3 a git, gh or orca command failed, an OPEN pull request's head could not be read, or
              the strike ledger could not be read; a value that was not read is never substituted,
            4 --consume-relaunch refused because the verdict is neither STALLED nor NEEDS-WORK or the allowance for
              this head SHA is spent; nothing was written`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const GH = process.env.GH_BIN || "gh"

/** A Linear attachment counts as D7 evidence only when its URL or title identifies its artifact type. */
const IMAGE_ARTIFACT = /\.(png|jpe?g|gif|webp)(\?|$)/i
const CRITIQUE_ARTIFACT = /\.(md|markdown|txt)(\?|$)/i
const CRITIQUE_TITLE = /\bcritique\b/i
const LINEAR_UPLOAD = /^https?:\/\/uploads\.linear\.app(?:[/?#]|$)/i

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const run = (file, args, { allowFailure = false } = {}) => {
  try {
    return execFileSync(file, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim()
  } catch (error) {
    if (allowFailure) return null
    return fail(3, `${file} ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`)
  }
}

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim()
  } catch (error) {
    const payload = error.stdout?.toString() ?? ""
    let reason = error.stderr?.toString().trim() || error.message
    try {
      reason = JSON.parse(payload).error?.message ?? reason
    } catch {
      if (payload.trim()) reason = payload.trim().slice(0, 400)
    }
    fail(3, `orca ${args.join(" ")} failed: ${reason}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 400)}`)
  }
  if (parsed.ok === false) fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? "unknown orca error"}`)
  return parsed.result ?? parsed
}

const VALUE_FLAGS = new Set(["--worktree", "--issue", "--base"])
const BOOLEAN_FLAGS = new Set(["--implementation", "--verify-review", "--consume-relaunch", "--json"])
const argv = process.argv.slice(2)
const unknownOptions = argv.filter(
  (value, index) =>
    value.startsWith("-") && !VALUE_FLAGS.has(value) && !BOOLEAN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]),
)
if (unknownOptions.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknownOptions.join(" ")}`)

const worktree = argOf("--worktree")
const issue = argOf("--issue")
const base = argOf("--base") ?? "main"
const implementationMode = process.argv.includes("--implementation")
const verifyReview = process.argv.includes("--verify-review")
const consumeRelaunch = process.argv.includes("--consume-relaunch")
const asJson = process.argv.includes("--json")

if (!worktree) fail(2, `${USAGE}\n\n--worktree is required`)
if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const reviewState = config.linear?.states?.review ?? "In Review"
/** The relaunch cap is D9's own number, not a second one invented here. A missing one is a config defect. */
if (!Number.isInteger(config.attemptsBeforeRewrite) || config.attemptsBeforeRewrite < 1) {
  fail(2, ".claude/orchestrator.json attemptsBeforeRewrite must be a positive integer; it is the relaunch cap")
}
const relaunchCap = config.attemptsBeforeRewrite
let workerLaunchLedger
try {
  workerLaunchLedger = workerLaunchLedgerPath()
} catch (error) {
  fail(2, error.message)
}

const git = (args, options) => run("git", ["-C", worktree, ...args], options)
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])

/**
 * The base has to be the REMOTE ref, refreshed. A worktree shares the repo's local branches, so
 * a local `main` left behind by an older session resolves happily and every commit merged to
 * origin since then counts as the worker's own: measured on this branch, a worktree sitting
 * exactly on origin/main with zero worker commits reported "1 commit(s)" and passed the check
 * that exists to catch a worker who committed nothing.
 */
git(["fetch", "--quiet", "origin", base], { allowFailure: true })
const baseRef = git(["rev-parse", "--verify", "--quiet", `origin/${base}`], { allowFailure: true }) ? `origin/${base}` : base
const commits = git(["log", "--oneline", `${baseRef}..HEAD`]).split("\n").filter(Boolean)
const dirty = git(["status", "--porcelain"]).split("\n").filter(Boolean)

if (implementationMode) {
  const localHead = git(["rev-parse", "HEAD"])
  let configuredInvocation = null
  let configuredInvocationError = null
  try {
    const workerEngine = config.workers?.[config.worker]
    const resolved = resolveWorkerInvocation(config.worker, workerEngine, [])
    configuredInvocation = { engine: config.worker, command: workerEngine.command, args: resolved.args }
  } catch (error) {
    configuredInvocationError = error.message
  }
  const workerDelivery = configuredInvocationError
    ? { ok: false, status: "INVALID", reason: configuredInvocationError }
    : workerDeliveryEvidence({
        issue,
        branch,
        head: localHead,
        worktreePath: worktree,
        invocation: configuredInvocation,
        ledgerPath: workerLaunchLedger,
      })
  const checks = [
    { name: "commits", ok: commits.length > 0, detail: commits.length ? `${commits.length} commit(s) on ${branch}` : `no commits on ${branch} above ${baseRef}` },
    { name: "worktree-clean", ok: dirty.length === 0, detail: dirty.length ? `${dirty.length} uncommitted path(s)` : "no uncommitted work" },
    { name: "worker-launch-provenance", ok: configuredInvocationError === null && workerDelivery.ok, detail: workerDelivery.reason },
  ]
  const ok = checks.every((check) => check.ok)
  const verdict = {
    issue,
    branch,
    base,
    baseRef,
    worktree,
    head: localHead,
    implementation: true,
    checks,
    unmet: checks.filter((check) => !check.ok).map((check) => check.name),
    ok,
    verdict: ok ? "IMPLEMENTATION_READY" : "IMPLEMENTATION_BLOCKED",
    workerDelivery,
  }
  if (asJson) console.log(JSON.stringify(verdict, null, 2))
  else {
    console.log(`${issue} local implementation on ${branch}`)
    for (const check of checks) console.log(`  ${check.ok ? "OK  " : "UNMET"} ${check.name}: ${check.detail}`)
    console.log(`\nVERDICT ${verdict.verdict}`)
  }
  process.exit(ok ? 0 : 1)
}

const pushed = (git(["ls-remote", "--heads", "origin", branch]) || "").length > 0

const remoteUrl = git(["remote", "get-url", "origin"])
const slug = remoteUrl.replace(/\.git$/, "").split(/[:/]/).slice(-2).join("/")
const pullRequests = JSON.parse(
  run(GH, ["pr", "list", "--repo", slug, "--head", branch, "--state", "all", "--json", "number,url,state,baseRefName,isDraft"]) || "[]",
)
const pullRequest = pullRequests.find((entry) => entry.state === "OPEN") ?? pullRequests[0] ?? null
const reviewRepository = pullRequest?.url?.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\//i)?.[1] ?? slug

const reviewPayload = pullRequest
  ? JSON.parse(
      run(GH, [
        "api",
        "graphql",
        "-f",
        "query=query($owner:String!,$name:String!,$number:Int!){viewer{login}repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid reviewDecision files(first:100){pageInfo{hasNextPage}nodes{path}} reviews(first:100){pageInfo{hasNextPage}nodes{id author{login __typename}state body submittedAt updatedAt lastEditedAt url commit{oid}}}comments(first:100){pageInfo{hasNextPage}nodes{id author{login __typename}body createdAt updatedAt}}reviewThreads(first:100){pageInfo{hasNextPage}nodes{id isResolved path resolvedBy{login}comments(first:100){pageInfo{hasNextPage}nodes{id author{login __typename}body createdAt updatedAt pullRequestReview{id commit{oid}}}}}}}}}",
        "-F",
        `owner=${slug.split("/")[0]}`,
        "-F",
        `name=${slug.split("/")[1]}`,
        "-F",
        `number=${pullRequest.number}`,
      ]),
    ).data
  : null
const review = reviewPayload?.repository?.pullRequest
const reviewThreads = review?.reviewThreads?.nodes ?? []
const workerLogin = reviewPayload?.viewer?.login
const localHead = git(["rev-parse", "HEAD"])
const prHead = review?.headRefOid ?? null
/**
 * `prOpen` comes from the `gh pr list` response and `prHead` from a SEPARATE graphql call keyed by
 * pull request number. Nothing makes the second answer whenever the first does, so a partial
 * graphql failure resolves the head to null while the list still reports OPEN, and the allowance
 * below would silently key on the LOCAL head: an allowance handed out against a SHA GitHub never
 * saw, which is the "a push earns a fresh allowance" invariant inverted. A lookup that could not be
 * performed reports so, exactly as liveness reads UNKNOWN rather than guessing.
 */
if (pullRequest?.state === "OPEN" && !prHead) {
  fail(
    3,
    `gh api graphql returned no pull request head for ${slug}#${pullRequest.number}, which gh pr list reports OPEN; the relaunch allowance keys on the PR head and the local head is never substituted for it`,
  )
}
const prHeadPresent = Boolean(prHead && git(["cat-file", "-e", `${prHead}^{commit}`], { allowFailure: true }) !== null)
const prCommits = new Set(prHeadPresent ? git(["rev-list", `${baseRef}..${prHead}`]).split("\n").filter(Boolean) : [])
const resolveCommit = (reference) => git(["rev-parse", "--verify", `${reference}^{commit}`], { allowFailure: true })
const automatedAuthor = (author) => author?.__typename === "Bot" || author?.login?.endsWith("[bot]")
const reviewBodyHasFindings = (body) => {
  const text = body ?? ""
  const heading = text.search(/^## Findings[ \t]*\r?$/m)
  if (heading === -1) return false
  const afterHeading = text.slice(heading).replace(/^## Findings[ \t]*\r?\n?/, "")
  const nextSection = afterHeading.search(/^## [^#]/m)
  const findings = nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection)
  return findings
    .split(/^### /m)
    .slice(1)
    .some((section) => {
      const newline = section.indexOf("\n")
      const content = (newline === -1 ? "" : section.slice(newline + 1)).trim()
      return Boolean(content && !/^none(?:\.| posted \(signal gate\)\.)?$/i.test(content))
    })
}
const reviewCommentTime = (comment) => Date.parse(comment.updatedAt ?? comment.createdAt ?? "")
const threadHasFix = (thread) => {
  const resolver = thread.resolvedBy?.login
  const comments = thread.comments?.nodes ?? []
  const findingActivity = comments.filter((comment) => comment.author?.login !== resolver)
  const latestFindingTime = Math.max(...findingActivity.map(reviewCommentTime))
  const reviewedCommit = [...findingActivity].reverse().find((comment) => comment.pullRequestReview?.commit?.oid)?.pullRequestReview.commit.oid
  if (!resolver || !thread.path || !reviewedCommit || !Number.isFinite(latestFindingTime)) return false
  const replies = comments.filter(
    (comment) => comment.author?.login === resolver && reviewCommentTime(comment) > latestFindingTime,
  )
  for (const reply of replies) {
    for (const match of (reply.body ?? "").matchAll(/\b[0-9a-f]{7,40}\b/gi)) {
      const commit = resolveCommit(match[0])
      const followsReview =
        commit &&
        commit !== reviewedCommit &&
        git(["merge-base", "--is-ancestor", reviewedCommit, commit], { allowFailure: true }) !== null
      if (followsReview && prCommits.has(commit) && git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit, "--", thread.path])) return true
    }
  }
  return false
}
const automatedResolvedWithoutFix = reviewThreads.filter(
  (thread) => automatedAuthor(thread.comments?.nodes?.[0]?.author) && thread.isResolved && !threadHasFix(thread),
)
const workerResolvedHumanThreads = reviewThreads.filter(
  (thread) => !automatedAuthor(thread.comments?.nodes?.[0]?.author) && thread.isResolved && thread.resolvedBy?.login === workerLogin,
)
const unresolvedThreads = reviewThreads.filter((thread) => !thread.isResolved)
const standaloneAutomatedActivity = [
  ...(review?.reviews?.nodes ?? []).filter((item) => automatedAuthor(item.author) && reviewBodyHasFindings(item.body)),
  ...(review?.comments?.nodes ?? []).filter((item) => automatedAuthor(item.author) && item.body?.trim()),
]
const workerComments = (review?.comments?.nodes ?? []).filter((item) => item.author?.login === workerLogin)
const activityAcknowledged = (item) => {
  const activityTime = Date.parse(item.updatedAt ?? item.submittedAt ?? item.createdAt ?? "")
  return workerComments.some((comment) => {
    if (!comment.body?.includes(item.id) || Date.parse(comment.updatedAt ?? comment.createdAt ?? "") < activityTime) return false
    for (const match of comment.body.matchAll(/\b[0-9a-f]{7,40}\b/gi)) {
      const commit = resolveCommit(match[0])
      if (commit && prCommits.has(commit)) return true
    }
    return false
  })
}
const unacknowledgedAutomatedActivity = standaloneAutomatedActivity.filter((item) => !activityAcknowledged(item))
const reviewInventoryComplete =
  review?.files?.pageInfo?.hasNextPage === false &&
  review?.reviewThreads?.pageInfo?.hasNextPage === false &&
  review?.reviews?.pageInfo?.hasNextPage === false &&
  review?.comments?.pageInfo?.hasNextPage === false &&
  reviewThreads.every((thread) => thread.comments?.pageInfo?.hasNextPage === false)
const reviewNotChangesRequested = Boolean(review && review.reviewDecision !== "CHANGES_REQUESTED")
const reviewEvidence = evaluateReviewEvidence(review, prHead, { repository: reviewRepository, pullRequest: pullRequest?.number })

const detail = orca(["linear", "issue", issue, "--attachments"])
const linearIssue = detail.issue ?? detail
const attachments = detail.attachments ?? linearIssue.attachments ?? []
const attachmentUrls = attachments.map((entry) => entry.url ?? entry.href ?? "").filter(Boolean)
const screenshotAttachments = attachments.filter((entry) => {
  const url = entry.url ?? entry.href ?? ""
  const title = entry.title ?? entry.name ?? ""
  const critique = CRITIQUE_ARTIFACT.test(url) || CRITIQUE_ARTIFACT.test(title) || CRITIQUE_TITLE.test(title)
  return IMAGE_ARTIFACT.test(url) || IMAGE_ARTIFACT.test(title) || (LINEAR_UPLOAD.test(url) && !critique)
})
const critiqueAttachments = attachments.filter((entry) => {
  const url = entry.url ?? entry.href ?? ""
  const title = entry.title ?? entry.name ?? ""
  const image = IMAGE_ARTIFACT.test(url) || IMAGE_ARTIFACT.test(title)
  return !image && (CRITIQUE_ARTIFACT.test(url) || CRITIQUE_ARTIFACT.test(title) || CRITIQUE_TITLE.test(title))
})
const labels = (linearIssue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name))
const visibleEffect = labels.includes("visible-effect")
let configuredInvocation = null
let configuredInvocationError = null
try {
  const workerEngine = config.workers?.[config.worker]
  const resolved = resolveWorkerInvocation(config.worker, workerEngine, labels)
  configuredInvocation = { engine: config.worker, command: workerEngine.command, args: resolved.args }
} catch (error) {
  configuredInvocationError = error.message
}

const checks = [
  { name: "commits", ok: commits.length > 0, detail: commits.length ? `${commits.length} commit(s) on ${branch}` : `no commits on ${branch} above ${baseRef}` },
  { name: "worktree-clean", ok: dirty.length === 0, detail: dirty.length ? `${dirty.length} uncommitted path(s), work is not captured` : "no uncommitted work" },
  { name: "pushed", ok: pushed, detail: pushed ? `origin has ${branch}` : `origin has no ${branch}` },
  {
    name: "pr-head-match",
    ok: Boolean(prHead && prHeadPresent && localHead === prHead),
    detail: prHead
      ? `local HEAD ${localHead} ${localHead === prHead ? "matches" : "does not match"} PR head ${prHead}${prHeadPresent ? "" : " (object unavailable locally)"}`
      : "no PR head is available",
  },
  {
    name: "pr-open",
    ok: Boolean(pullRequest && pullRequest.state === "OPEN" && pullRequest.baseRefName === base),
    detail: pullRequest ? `${pullRequest.url} ${pullRequest.state} -> ${pullRequest.baseRefName}` : `no PR from ${branch} in ${slug}`,
  },
  {
    name: "pr-ready-for-review",
    ok: Boolean(pullRequest && !pullRequest.isDraft),
    detail: pullRequest?.isDraft ? `${pullRequest.url} is a draft pull request; open it ready for review` : "pull request is ready for review",
  },
  {
    name: "review-not-changes-requested",
    ok: reviewNotChangesRequested,
    detail: review ? `review decision is ${review.reviewDecision ?? "absent"}; only CHANGES_REQUESTED blocks` : "no pull request review state is available",
  },
  {
    name: "review-evidence",
    ok: Boolean(prHead && reviewEvidence.ok),
    detail: `${reviewEvidence.status}: ${reviewEvidence.reason}`,
  },
  {
    name: "review-thread-inventory",
    ok: reviewInventoryComplete,
    detail: reviewInventoryComplete ? "complete file and review activity inventory" : "changed files or review activity exceed one connection page, verification is incomplete",
  },
  {
    name: "review-threads",
    ok: unresolvedThreads.length === 0,
    detail: unresolvedThreads.length ? `${unresolvedThreads.length} unresolved review thread(s)` : "zero unresolved review threads",
  },
  {
    name: "review-activity",
    ok: unacknowledgedAutomatedActivity.length === 0,
    detail: unacknowledgedAutomatedActivity.length
      ? `standalone automated review item(s) without a later worker acknowledgement naming a PR commit: ${unacknowledgedAutomatedActivity.map((item) => item.id).join(", ")}`
      : "every standalone automated review item has a worker acknowledgement naming a PR commit",
  },
  { name: "linear-in-review", ok: (linearIssue.state?.name ?? linearIssue.state) === reviewState, detail: `issue is ${linearIssue.state?.name ?? linearIssue.state}, contract wants ${reviewState}` },
  {
    name: "pr-attached",
    ok: attachmentUrls.some((url) => (pullRequest ? url === pullRequest.url : /\/pull\//.test(url))),
    detail: attachmentUrls.length ? `attachments: ${attachmentUrls.join(", ")}` : "the issue carries no attachments",
  },
]
if (verifyReview) {
  checks.push({
    name: "resolved-thread-fixes",
    ok: automatedResolvedWithoutFix.length === 0,
    detail: automatedResolvedWithoutFix.length
      ? `resolved automated thread(s) without a fix commit changing the reviewed path: ${automatedResolvedWithoutFix.map((thread) => `${thread.id}:${thread.path}`).join(", ")}`
      : "every resolved automated thread names a fix commit changing the reviewed path",
  })
  checks.push({
    name: "human-thread-resolution",
    ok: workerResolvedHumanThreads.length === 0,
    detail: workerResolvedHumanThreads.length
      ? `human-authored thread(s) resolved by the worker account: ${workerResolvedHumanThreads.map((thread) => thread.id).join(", ")}`
      : "the worker account did not resolve a human-authored thread",
  })
}
if (visibleEffect) {
  checks.push({
    name: "screenshot-attached",
    ok: screenshotAttachments.length > 0,
    detail: "ticket is visible-effect, so D7 needs an image attachment on the issue",
  })
  checks.push({
    name: "critique-attached",
    ok: critiqueAttachments.length > 0,
    detail: "ticket is visible-effect, so D7 needs a non-image critique artifact on the issue",
  })
}

const samePath = (left, right) =>
  process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right)

/**
 * The launcher's own record, which is the only liveness source that survives a headless worker: a
 * worker that dies cannot write "I died", so a heartbeat proves nothing here. Rows for another
 * worktree or another ticket are somebody else's worker and are not evidence about this one.
 */
const readWorkerPidRows = () => {
  const marker = join(resolve(worktree, git(["rev-parse", "--git-dir"])), "orbit-worker-pids.jsonl")
  if (!existsSync(marker)) return { marker, rows: [], unreadable: `no launcher PID marker at ${marker}` }
  let issuedLaunches
  try {
    issuedLaunches = readWorkerLaunchRecords(workerLaunchLedger)
  } catch (error) {
    return { marker, rows: [], unreadable: error.message }
  }
  let lines
  try {
    lines = readFileSync(marker, "utf8").split(/\r?\n/).filter(Boolean)
  } catch (error) {
    return { marker, rows: [], unreadable: `PID marker ${marker} could not be read: ${error.message}` }
  }
  const rows = []
  for (const line of lines) {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      return { marker, rows: [], unreadable: `PID marker ${marker} carries a line that is not JSON` }
    }
    if (typeof row?.worktreePath === "string" && samePath(row.worktreePath, worktree) && row.issue === issue) {
      if (!issuedLaunches.some((issued) => sameWorkerLaunch(row, issued))) {
        return { marker, rows: [], unreadable: `PID marker ${marker} carries a ${issue} row without launcher-issued provenance` }
      }
      rows.push(row)
    }
  }
  return { marker, rows, unreadable: rows.length ? null : `PID marker ${marker} names no ${issue} worker for this worktree` }
}

const readRowLiveness = (row) => {
  if (!Number.isInteger(row.pid) || row.pid < 1) return { pid: row.pid ?? null, state: "unknown", detail: "PID marker row carries no positive integer pid" }
  const claimedAt = Date.parse(row.startedAt ?? "")
  if (!Number.isFinite(claimedAt)) return { pid: row.pid, state: "unknown", detail: `pid ${row.pid} carries no parseable startedAt, so a recycled id cannot be ruled out` }
  try {
    process.kill(row.pid, 0)
  } catch (error) {
    if (error.code === "ESRCH") return { pid: row.pid, state: "gone", detail: `pid ${row.pid} is gone (ESRCH)` }
    if (error.code !== "EPERM") return { pid: row.pid, state: "unknown", detail: `pid ${row.pid} liveness could not be read: ${error.code ?? error.message}` }
  }
  const claimedHoursAgo = (Date.now() - claimedAt) / 3_600_000
  if (claimedHoursAgo < 0) return { pid: row.pid, state: "unknown", detail: `pid ${row.pid} was claimed in the future, so the clock cannot bound a recycled id` }
  if (claimedHoursAgo > PID_REUSE_BACKSTOP_HOURS) {
    return { pid: row.pid, state: "unknown", detail: `pid ${row.pid} answers alive but was claimed ${claimedHoursAgo.toFixed(1)}h ago, past the ${PID_REUSE_BACKSTOP_HOURS}h reuse backstop` }
  }
  return { pid: row.pid, state: "alive", detail: `pid ${row.pid} is alive, claimed ${claimedHoursAgo.toFixed(1)}h ago` }
}

const { marker, rows: pidRows, unreadable } = readWorkerPidRows()
const pidReadings = pidRows.map(readRowLiveness)
const livenessState = unreadable
  ? "unknown"
  : pidReadings.some((reading) => reading.state === "alive")
    ? "alive"
    : pidReadings.some((reading) => reading.state === "unknown")
      ? "unknown"
      : "gone"
const liveness = {
  state: livenessState,
  marker,
  pids: pidReadings,
  detail: unreadable ?? pidReadings.map((reading) => reading.detail).join("; "),
}

const configuredLaunchRows = configuredInvocation
  ? pidRows.filter((row) =>
      row.engine === configuredInvocation.engine &&
      row.invocation?.command === configuredInvocation.command &&
      JSON.stringify(row.invocation?.args) === JSON.stringify(configuredInvocation.args),
    )
  : []
const workerLaunchProvenanceOk = !unreadable && configuredInvocationError === null && configuredLaunchRows.length > 0
checks.push({
  name: "worker-launch-provenance",
  ok: workerLaunchProvenanceOk,
  detail: workerLaunchProvenanceOk
    ? `launcher-issued ${configuredInvocation.engine} invocation for ${issue} in ${worktree}`
    : configuredInvocationError
      ? `configured headless invocation could not be resolved: ${configuredInvocationError}`
      : `${liveness.detail}; no launcher-issued row matches the configured headless invocation`,
})
const workerDelivery = workerDeliveryEvidence({
  issue,
  branch,
  head: prHead,
  worktreePath: worktree,
  invocation: configuredInvocation,
  ledgerPath: workerLaunchLedger,
})
const workerDeliveryOk = !unreadable && configuredInvocationError === null && workerDelivery.ok
checks.push({
  name: "worker-completed-head",
  ok: workerDeliveryOk,
  detail: workerDeliveryOk
    ? workerDelivery.reason
    : configuredInvocationError
      ? `configured headless invocation could not be resolved: ${configuredInvocationError}`
      : workerDelivery.reason,
})
const unmet = checks.filter((check) => !check.ok).map((check) => check.name)

const prOpen = Boolean(pullRequest && pullRequest.state === "OPEN")
const reviewGatesClear = reviewNotChangesRequested && reviewEvidence.ok
/**
 * The unmet items that are reviewer output only a WORKER can reconcile, so a review-clear head
 * carrying any of them still needs a relaunch rather than a merge. Everything else that can sit
 * unmet beside a review-clear head is deliberately excluded, because relaunching on it spends an
 * allowance that buys nothing: linear-in-review, pr-attached and the two D7 artifact checks are
 * bookkeeping; review-thread-inventory is a >100-item ceiling in the query itself, which no worker
 * can move; human-thread-resolution is a human's call, since the worker already buried a
 * human-authored finding and only that human can reopen it.
 */
const OUTSTANDING_REVIEW_WORK = new Set(["review-threads", "review-activity", "resolved-thread-fixes"])
const reviewWorkOutstanding = unmet.some((name) => OUTSTANDING_REVIEW_WORK.has(name))
const REVIEWER_WAIT_ALLOWED_UNMET = new Set(["review-evidence", "linear-in-review", "pr-attached", "screenshot-attached", "critique-attached"])
const localReviewUndecided =
  reviewEvidence.status === "AWAITING_REVIEW" ||
  reviewEvidence.status === "AMBIGUOUS" ||
  (["STALE", "MALFORMED", "UNAUTHENTICATED"].includes(reviewEvidence.status) && Boolean(reviewEvidence.review))
const readyForFreshReviewer =
  localReviewUndecided &&
  reviewNotChangesRequested &&
  unmet.every((name) => REVIEWER_WAIT_ALLOWED_UNMET.has(name))
/**
 * STALLED keys on the worker PROCESS and the pull request, never on the Linear state: measured on
 * ORB-163, `linear-in-review` is unmet purely because a ticket shipping four sequential pull
 * requests honestly sits In Progress between them. That shape has no open pull request, so it
 * lands on IDLE, which needs a launch decision rather than a relaunch of nobody.
 */
const verdictName =
  unmet.length === 0
    ? "DELIVERED"
    : livenessState === "alive"
      ? "WORKING"
      : livenessState === "unknown"
        ? "UNKNOWN"
        : prOpen && reviewEvidence.status === "NEEDS_WORK"
          ? "NEEDS-WORK"
          : prOpen && readyForFreshReviewer
            ? "AWAITING-REVIEW"
            : prOpen && (!reviewGatesClear || reviewWorkOutstanding)
          ? "STALLED"
          : prOpen
            ? "AWAITING-MERGE"
            : "IDLE"

/**
 * The head SHA is the whole key, so a push earns a fresh allowance and an unchanged head does not.
 * The counter itself lives in the shared strike ledger, which is append-only, keyed by
 * (scope, issue, key) and owned by no worker process, rather than in a second store of its own.
 * The local-head fallback is reachable only when no pull request is OPEN, because the guard above
 * refuses an OPEN pull request whose head could not be read; that shape is IDLE, which spends no
 * allowance, so the key is a ledger label rather than a substitute for a SHA nobody read.
 */
const allowanceHead = prHead ?? localHead
let strikeLedger
try {
  strikeLedger = strikeLedgerPath()
} catch (error) {
  fail(2, error.message)
}
const relaunchStrike = { ledgerPath: strikeLedger, scope: RELAUNCH_SCOPE, issue, key: allowanceHead }
let consumed
try {
  consumed = strikeCount(relaunchStrike)
} catch (error) {
  fail(3, error.message)
}
const relaunchable = verdictName === "STALLED" || verdictName === "NEEDS-WORK"
const relaunchRefusal =
  relaunchable
    ? consumed >= relaunchCap
      ? `the ${relaunchCap} relaunch allowance(s) for ${issue} at ${allowanceHead} are spent; the head must move before another one is earned`
      : null
    : `the verdict is ${verdictName}, and only STALLED or NEEDS-WORK spends a relaunch allowance`
const outstandingFindings = [
  ...(reviewEvidence.status === "NEEDS_WORK" && reviewEvidence.review
    ? (reviewEvidence.findingIds.length > 0
      ? reviewEvidence.findingIds.map((id) => ({
          kind: "local-review-needs-work",
          id,
          path: null,
          body: (reviewEvidence.review.body ?? "").slice(0, 2000),
        }))
      : [{
          kind: "local-review-needs-work",
          id: "missing-finding-identity",
          path: null,
          body: (reviewEvidence.review.body ?? "").slice(0, 2000),
        }])
    : []),
  ...unresolvedThreads.map((thread) => ({
    kind: "unresolved-thread",
    id: thread.id,
    path: thread.path ?? null,
    body: (thread.comments?.nodes?.[0]?.body ?? "").slice(0, 2000),
  })),
  ...unacknowledgedAutomatedActivity.map((item) => ({
    kind: "unacknowledged-review-activity",
    id: item.id,
    path: null,
    body: (item.body ?? "").slice(0, 2000),
  })),
]
const relaunch = {
  scope: RELAUNCH_SCOPE,
  headSha: allowanceHead,
  ledger: strikeLedger,
  cap: relaunchCap,
  consumed,
  remaining: Math.max(0, relaunchCap - consumed),
  allowed: relaunchRefusal === null,
  refusal: relaunchRefusal,
  unmet,
  findings: outstandingFindings,
}

if (consumeRelaunch && relaunchRefusal === null) {
  try {
    relaunch.consumed = recordStrike(relaunchStrike)
  } catch (error) {
    fail(3, error.message)
  }
  relaunch.remaining = Math.max(0, relaunchCap - relaunch.consumed)
}

const verdict = { issue, branch, base, worktree, repo: slug, pullRequest: pullRequest?.url ?? null, verifyReview, checks, unmet, ok: unmet.length === 0, verdict: verdictName, liveness, relaunch }

if (asJson) {
  console.log(JSON.stringify(verdict, null, 2))
} else {
  console.log(`${issue} on ${branch} (${slug})`)
  for (const check of checks) console.log(`  ${check.ok ? "OK  " : "UNMET"} ${check.name}: ${check.detail}`)
  console.log(`\nVERDICT ${verdictName}`)
  console.log(`  liveness ${livenessState}: ${liveness.detail}`)
  console.log(`  relaunch ${relaunch.allowed ? `allowed, ${relaunch.remaining} of ${relaunchCap} left for ${issue} at ${allowanceHead}` : `not allowed: ${relaunchRefusal}`}`)
  if (outstandingFindings.length) console.log(`  outstanding findings: ${outstandingFindings.map((finding) => `${finding.kind} ${finding.id}`).join(", ")}`)
  console.log(unmet.length === 0 ? "CONTRACT MET" : `CONTRACT NOT MET: ${unmet.join(", ")}. Idle is not done; nudge the worker with this list.`)
}

if (consumeRelaunch) process.exit(relaunchRefusal === null ? 0 : 4)
process.exit(unmet.length === 0 ? 0 : 1)
