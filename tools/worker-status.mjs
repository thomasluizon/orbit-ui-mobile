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

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: worker-status.mjs --worktree <path> --issue ORB-N [options]

  --worktree <path>  the worker's worktree path, as printed by launch-worker.mjs (required)
  --issue ORB-N      the Linear issue the worker is finishing (required)
  --base <ref>       the branch the PR must target (default: main)
  --verify-review    run the one-time pre-merge review-thread verification
  --reports-file <path>
                      shared reports.jsonl written by worker Stop hooks
  --expected-window-minutes <n>
                      mark a missing or older report suspect after this many minutes (default: 30)
  --json             emit the verdict as JSON instead of text
  --help, -h         print this usage and exit 0

Checks, all from artifacts: commits exist on the branch, the worktree carries no uncommitted
work, no merge is in progress, every commit is pushed, a PR is open against <ref> with an approving review on its current
head and zero unresolved threads, every resolved automated thread has reconciliation evidence
after its latest finding-bearing nested activity and names a later fix commit that changed its reviewed path,
every standalone automated review item has a worker acknowledgement naming a PR commit,
no human-authored thread was resolved by the worker account, the local head matches the PR
head, the Linear issue is In Review with the PR attached, and both a screenshot and critique
artifact are attached when the ticket carries visible-effect (D7). When --reports-file is
supplied, a missing or stale worker report makes liveness suspect.

exit codes: 0 the contract is met, 1 unmet items (listed), 2 usage error,
            3 a git, gh or orca command failed`

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

const KNOWN_FLAGS = new Set(["--worktree", "--issue", "--base", "--verify-review", "--reports-file", "--expected-window-minutes", "--json", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !KNOWN_FLAGS.has(token))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

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

const worktree = argOf("--worktree")
const issue = argOf("--issue")
const base = argOf("--base") ?? "main"
const verifyReview = process.argv.includes("--verify-review")
const reportsFile = argOf("--reports-file")
const expectedWindowMinutes = Number(argOf("--expected-window-minutes") ?? 30)
const asJson = process.argv.includes("--json")

if (!worktree) fail(2, `${USAGE}\n\n--worktree is required`)
if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)
if (process.argv.includes("--reports-file") && !reportsFile) fail(2, `${USAGE}\n\n--reports-file needs a path`)
if (process.argv.includes("--expected-window-minutes") && argOf("--expected-window-minutes") == null) {
  fail(2, `${USAGE}\n\n--expected-window-minutes needs a value`)
}
if (!Number.isFinite(expectedWindowMinutes) || expectedWindowMinutes <= 0) {
  fail(2, `${USAGE}\n\n--expected-window-minutes must be a positive number`)
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const reviewState = config.linear?.states?.review ?? "In Review"

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
const staged = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean)
const mergeInProgress = Boolean(
  git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
    allowFailure: true,
  }),
)
const remoteBranch = git(["ls-remote", "--heads", "origin", branch]) || ""
const remoteHead = remoteBranch.split(/\s+/)[0] || null
if (remoteHead)
  git(["fetch", "--quiet", "origin", `refs/heads/${branch}`], {
    allowFailure: true,
  })
const unpushedCommits = remoteHead
  ? git(["log", "--oneline", `${remoteHead}..HEAD`])
      .split("\n")
      .filter(Boolean)
  : commits
const pushed = Boolean(remoteHead)

let latestReport = null
let reportAgeMinutes = null
let reportFresh = null
if (reportsFile) {
  let lines = []
  try {
    lines = existsSync(reportsFile) ? readFileSync(reportsFile, "utf8").split(/\r?\n/).filter(Boolean) : []
  } catch (error) {
    fail(3, `reports file could not be read: ${error.message}`)
  }
  const reports = lines.map((line, index) => {
    try {
      return JSON.parse(line)
    } catch {
      fail(3, `reports file line ${index + 1} is not valid JSON`)
    }
  })
  latestReport = reports.filter((report) => report.ticket === issue).at(-1) ?? null
  const reportedAt = latestReport ? Date.parse(latestReport.reportedAt) : statSync(worktree).birthtimeMs
  reportAgeMinutes = Number.isFinite(reportedAt) ? (Date.now() - reportedAt) / 60_000 : Number.POSITIVE_INFINITY
  reportFresh = reportAgeMinutes <= expectedWindowMinutes
}

const remoteUrl = git(["remote", "get-url", "origin"])
const slug = remoteUrl.replace(/\.git$/, "").split(/[:/]/).slice(-2).join("/")
const pullRequests = JSON.parse(
  run(GH, ["pr", "list", "--repo", slug, "--head", branch, "--state", "all", "--json", "number,url,state,baseRefName,isDraft"]) || "[]",
)
const pullRequest = pullRequests.find((entry) => entry.state === "OPEN") ?? pullRequests[0] ?? null

const reviewPayload = pullRequest
  ? JSON.parse(
      run(GH, [
        "api",
        "graphql",
        "-f",
        "query=query($owner:String!,$name:String!,$number:Int!){viewer{login}repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid reviewDecision reviews(first:100){pageInfo{hasNextPage}nodes{id author{login __typename}state body submittedAt updatedAt commit{oid}}}comments(first:100){pageInfo{hasNextPage}nodes{id author{login __typename}body createdAt updatedAt}}reviewThreads(first:100){pageInfo{hasNextPage}nodes{id isResolved path resolvedBy{login}comments(first:100){pageInfo{hasNextPage}nodes{id author{login __typename}body createdAt updatedAt pullRequestReview{id commit{oid}}}}}}}}}",
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
  const reviewedCommitStillInHistory =
    git(["merge-base", "--is-ancestor", reviewedCommit, prHead], { allowFailure: true }) !== null
  const rewrittenReviewSharesHistory =
    !reviewedCommitStillInHistory &&
    git(["merge-base", reviewedCommit, prHead], { allowFailure: true }) !== null
  const replies = comments.filter(
    (comment) => comment.author?.login === resolver && reviewCommentTime(comment) > latestFindingTime,
  )
  for (const reply of replies) {
    for (const match of (reply.body ?? "").matchAll(/\b[0-9a-f]{7,40}\b/gi)) {
      const commit = resolveCommit(match[0])
      const followsReview =
        commit &&
        commit !== reviewedCommit &&
        (rewrittenReviewSharesHistory ||
          git(["merge-base", "--is-ancestor", reviewedCommit, commit], { allowFailure: true }) !== null)
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
  review?.reviewThreads?.pageInfo?.hasNextPage === false &&
  review?.reviews?.pageInfo?.hasNextPage === false &&
  review?.comments?.pageInfo?.hasNextPage === false &&
  reviewThreads.every((thread) => thread.comments?.pageInfo?.hasNextPage === false)
const currentHeadApproved = (review?.reviews?.nodes ?? []).some(
  (item) => item.state === "APPROVED" && item.commit?.oid === prHead,
)

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

const checks = [
  { name: "commits", ok: commits.length > 0, detail: commits.length ? `${commits.length} commit(s) on ${branch}` : `no commits on ${branch} above ${baseRef}` },
  { name: "worktree-clean", ok: dirty.length === 0, detail: dirty.length ? `${dirty.length} uncommitted path(s), work is not captured` : "no uncommitted work" },
  {
    name: "staged-uncommitted",
    ok: staged.length === 0,
    detail: staged.length ? `${staged.length} staged path(s) are not committed` : "no staged-but-uncommitted work",
  },
  {
    name: "merge-in-progress",
    ok: !mergeInProgress,
    detail: mergeInProgress ? "MERGE_HEAD exists, so a merge is in progress" : "no merge is in progress",
  },
  {
    name: "pushed",
    ok: pushed,
    detail: pushed ? `origin has ${branch}` : `origin has no ${branch}`,
  },
  {
    name: "unpushed-commits",
    ok: unpushedCommits.length === 0,
    detail: unpushedCommits.length ? `${unpushedCommits.length} commit(s) have not been pushed to origin/${branch}` : `HEAD has no commits beyond origin/${branch}`,
  },
  {
    name: "pr-head-match",
    ok: Boolean(prHead && prHeadPresent && localHead === prHead),
    detail: prHead
      ? `local HEAD ${localHead} ${localHead === prHead ? "matches" : "does not match"} PR head ${prHead}${prHeadPresent ? "" : " (object unavailable locally)"}`
      : "no PR head is available",
  },
  {
    name: "pr-open",
    ok: Boolean(pullRequest && pullRequest.state === "OPEN" && pullRequest.baseRefName === base && !pullRequest.isDraft),
    detail: pullRequest ? `${pullRequest.url} ${pullRequest.state} -> ${pullRequest.baseRefName}${pullRequest.isDraft ? " (draft)" : ""}` : `no PR from ${branch} in ${slug}`,
  },
  {
    name: "review-approved",
    ok: review?.reviewDecision === "APPROVED",
    detail: review ? `review decision is ${review.reviewDecision ?? "absent"}, contract wants APPROVED` : "no pull request review state is available",
  },
  {
    name: "review-head-approved",
    ok: Boolean(prHead && currentHeadApproved),
    detail: prHead
      ? `PR head ${prHead} ${currentHeadApproved ? "has" : "does not have"} an approving review`
      : "no PR head is available for approval verification",
  },
  {
    name: "review-thread-inventory",
    ok: reviewInventoryComplete,
    detail: reviewInventoryComplete ? "complete review activity inventory" : "more than 100 review items in at least one connection, verification is incomplete",
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
if (reportsFile) {
  checks.unshift({
    name: "report-fresh",
    ok: reportFresh,
    detail: latestReport ? `latest report is ${Number.isFinite(reportAgeMinutes) ? reportAgeMinutes.toFixed(1) : "invalid"} minute(s) old; expected within ${expectedWindowMinutes}` : `no report for ${issue}; worktree is ${reportAgeMinutes.toFixed(1)} minute(s) old and expected within ${expectedWindowMinutes}`,
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

const unmet = checks.filter((check) => !check.ok).map((check) => check.name)
const verdict = {
  issue,
  branch,
  base,
  worktree,
  repo: slug,
  pullRequest: pullRequest?.url ?? null,
  verifyReview,
  liveness: reportsFile ? (reportFresh ? "reported" : "suspect") : "not-checked",
  latestReport,
  checks,
  unmet,
  ok: unmet.length === 0,
}

if (asJson) {
  console.log(JSON.stringify(verdict, null, 2))
} else {
  console.log(`${issue} on ${branch} (${slug})`)
  if (reportsFile) console.log(`  ${reportFresh ? "REPORTED" : "SUSPECT "} liveness: ${checks[0].detail}`)
  for (const check of checks) console.log(`  ${check.ok ? "OK  " : "UNMET"} ${check.name}: ${check.detail}`)
  console.log(unmet.length === 0 ? "\nCONTRACT MET" : `\nCONTRACT NOT MET: ${unmet.join(", ")}. Idle is not done; nudge the worker with this list.`)
}

process.exit(unmet.length === 0 ? 0 : 1)
