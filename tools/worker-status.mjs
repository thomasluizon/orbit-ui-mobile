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

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: worker-status.mjs --worktree <path> --issue ORB-N [--base <ref>] [--json]

  --worktree <path>  the worker's worktree path, as printed by launch-worker.mjs (required)
  --issue ORB-N      the Linear issue the worker is finishing (required)
  --base <ref>       the branch the PR must target (default: main)
  --json             emit the verdict as JSON instead of text
  --help, -h         print this usage and exit 0

Checks, all from artifacts: commits exist on the branch, the worktree carries no uncommitted
work, the branch is pushed, a PR is open against <ref>, the Linear issue is In Review with the
PR attached, and both a screenshot and critique artifact are attached when the ticket carries
visible-effect (D7).

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
const pushed = (git(["ls-remote", "--heads", "origin", branch]) || "").length > 0

const remoteUrl = git(["remote", "get-url", "origin"])
const slug = remoteUrl.replace(/\.git$/, "").split(/[:/]/).slice(-2).join("/")
const pullRequests = JSON.parse(
  run(GH, ["pr", "list", "--repo", slug, "--head", branch, "--state", "all", "--json", "url,state,baseRefName,isDraft"]) || "[]",
)
const pullRequest = pullRequests.find((entry) => entry.state === "OPEN") ?? pullRequests[0] ?? null

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
  { name: "pushed", ok: pushed, detail: pushed ? `origin has ${branch}` : `origin has no ${branch}` },
  {
    name: "pr-open",
    ok: Boolean(pullRequest && pullRequest.state === "OPEN" && pullRequest.baseRefName === base && !pullRequest.isDraft),
    detail: pullRequest ? `${pullRequest.url} ${pullRequest.state} -> ${pullRequest.baseRefName}${pullRequest.isDraft ? " (draft)" : ""}` : `no PR from ${branch} in ${slug}`,
  },
  { name: "linear-in-review", ok: (linearIssue.state?.name ?? linearIssue.state) === reviewState, detail: `issue is ${linearIssue.state?.name ?? linearIssue.state}, contract wants ${reviewState}` },
  {
    name: "pr-attached",
    ok: attachmentUrls.some((url) => (pullRequest ? url === pullRequest.url : /\/pull\//.test(url))),
    detail: attachmentUrls.length ? `attachments: ${attachmentUrls.join(", ")}` : "the issue carries no attachments",
  },
]
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
const verdict = { issue, branch, base, worktree, repo: slug, pullRequest: pullRequest?.url ?? null, checks, unmet, ok: unmet.length === 0 }

if (asJson) {
  console.log(JSON.stringify(verdict, null, 2))
} else {
  console.log(`${issue} on ${branch} (${slug})`)
  for (const check of checks) console.log(`  ${check.ok ? "OK  " : "UNMET"} ${check.name}: ${check.detail}`)
  console.log(unmet.length === 0 ? "\nCONTRACT MET" : `\nCONTRACT NOT MET: ${unmet.join(", ")}. Idle is not done; nudge the worker with this list.`)
}

process.exit(unmet.length === 0 ? 0 : 1)
