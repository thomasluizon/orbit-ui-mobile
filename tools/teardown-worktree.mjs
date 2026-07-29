#!/usr/bin/env node
/**
 * Remove one completed Orca worktree only after independently checking that no
 * work can be lost. Orca may drop its runtime connection after completing a
 * removal, so success is verified from the filesystem and Git, never its reply.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { isRepainting } from "./lib/tui-repaint.mjs"

const USAGE = `usage: teardown-worktree.mjs (--issue ORB-N | --worktree <path>) [--base <ref>]

  --issue ORB-N       remove the Orca worktree linked to this Linear issue
  --worktree <path>   remove this Orca child worktree, using its linked Linear issue
  --base <ref>        target branch that must contain the pull request merge commit (default: worktree base or main)
  --help, -h          print this usage and exit 0

All four checks must pass before anything is removed: the tree is clean, the pull request merge
commit and local branch tip are present in the target branch, the linked Linear issue is Done,
and no terminal is mid-turn.
Removal is successful only when the path is gone and git worktree list no longer names it.

exit codes: 0 removed and verified, 1 evidence or removal verification failed, 2 usage error,
            3 an orca, git, or gh command could not be read`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const GIT = process.env.GIT_BIN || "git"
const GH = process.env.GH_BIN || "gh"
const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  const value = process.argv[index + 1]
  return value === undefined || value.startsWith("-") ? undefined : value
}
const KNOWN_FLAGS = new Set(["--issue", "--worktree", "--base", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !KNOWN_FLAGS.has(token))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const requestedIssue = argOf("--issue")
const requestedWorktree = argOf("--worktree")
const requestedBase = argOf("--base")
if ([requestedIssue, requestedWorktree, requestedBase].some((value) => value === undefined)) fail(2, `${USAGE}\n\nselector flags require a value`)
if ((requestedIssue && requestedWorktree) || (!requestedIssue && !requestedWorktree)) fail(2, `${USAGE}\n\nprovide exactly one selector`)
if (requestedIssue && !/^[A-Z]+-\d+$/.test(requestedIssue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    const payload = error.stdout?.toString().trim() ?? ""
    return fail(3, `orca ${args.join(" ")} failed: ${payload || error.stderr?.toString().trim() || error.message}`)
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed.ok === false) fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? parsed.message ?? "unknown error"}`)
    return parsed.result ?? parsed
  } catch (error) {
    return fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 300)}`)
  }
}
const git = (path, args, { allowFailure = false } = {}) => {
  const result = spawnSync(GIT, ["-C", path, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  if (result.status === 0) return result.stdout.trim()
  if (allowFailure) return null
  fail(3, `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`)
}
const pullRequestFor = (path, branch, base) => {
  let raw
  try {
    raw = execFileSync(GH, ["pr", "list", "--head", branch, "--base", base, "--state", "merged", "--limit", "1", "--json", "number,mergeCommit,headRefOid,mergedAt"], { cwd: path, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    return { error: { exitCode: 3, detail: `gh pr list for ${branch} failed: ${(error.stdout?.toString() || error.stderr?.toString() || error.message).trim()}` } }
  }
  try {
    const pullRequests = JSON.parse(raw)
    if (!Array.isArray(pullRequests)) return { error: { exitCode: 3, detail: `gh pr list for ${branch} returned an unexpected payload` } }
    const [pullRequest] = pullRequests
    if (!pullRequest?.mergedAt || !pullRequest.number || !pullRequest.mergeCommit?.oid || !pullRequest.headRefOid) return { error: { exitCode: 1, detail: `pull request for ${branch} is not a merged pull request with merge and head commits` } }
    return { pullRequest }
  } catch (error) {
    if (error instanceof SyntaxError) return { error: { exitCode: 3, detail: `gh pr list for ${branch} returned unparseable output: ${raw.slice(0, 300)}` } }
    throw error
  }
}
const selectorPath = (value) => value?.replace(/^path:/, "")
const normalize = (path) => (typeof path === "string" ? resolve(selectorPath(path)) : "").replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()

const worktrees = orca(["worktree", "list"]).worktrees ?? []
const worktree = requestedIssue
  ? worktrees.find((entry) => !entry.isMainWorktree && !entry.isArchived && entry.linkedLinearIssue === requestedIssue)
  : worktrees.find((entry) => normalize(entry.path) === normalize(requestedWorktree))
if (!worktree) fail(1, requestedIssue ? `no active Orca worktree is linked to ${requestedIssue}` : `no active Orca worktree matches ${requestedWorktree}`)
if (worktree.isMainWorktree) fail(1, "refusing to remove a primary checkout")
if (!worktree.linkedLinearIssue || !/^[A-Z]+-\d+$/.test(worktree.linkedLinearIssue)) fail(1, "refusing a worktree without a linked Linear issue")

const path = worktree.path
const selector = `path:${path}`
const issue = worktree.linkedLinearIssue
const branch = (worktree.branch ?? git(path, ["rev-parse", "--abbrev-ref", "HEAD"])).replace(/^refs\/heads\//, "")
const base = requestedBase ?? worktree.baseRef ?? "main"
const dirty = git(path, ["status", "--short"]).split("\n").filter(Boolean)
const terminals = (orca(["terminal", "list"]).terminals ?? []).filter((terminal) => normalize(terminal.worktreePath) === normalize(path))
const busy = terminals.filter((terminal) => isRepainting(orca, terminal.handle))
const detail = orca(["linear", "issue", issue])
const linearIssue = detail.issue ?? detail
const state = linearIssue.state?.name ?? linearIssue.state

git(path, ["fetch", "--quiet", "origin", base], { allowFailure: true })
const baseRef = git(path, ["rev-parse", "--verify", "--quiet", `origin/${base}`], { allowFailure: true }) ? `origin/${base}` : base
const pullRequestResult = pullRequestFor(path, branch, base)
const pullRequest = pullRequestResult.pullRequest
const treePresent = pullRequest
  ? (() => {
      git(path, ["fetch", "--quiet", "origin", pullRequest.mergeCommit.oid])
      const mergeCommitPresent = git(path, ["merge-base", "--is-ancestor", pullRequest.mergeCommit.oid, baseRef], { allowFailure: true }) !== null
      const localTip = git(path, ["rev-parse", branch])
      git(path, ["fetch", "--quiet", "origin", pullRequest.headRefOid], { allowFailure: true })
      const localTipPresent = git(path, ["merge-base", "--is-ancestor", localTip, pullRequest.headRefOid], { allowFailure: true }) !== null
      return mergeCommitPresent && localTipPresent
    })()
  : false
const checks = [
  { name: "worktree-clean", ok: dirty.length === 0, detail: dirty.length ? `uncommitted paths: ${dirty.join(", ")}` : "no uncommitted work" },
  pullRequest
    ? { name: "tree-present-in-target", ok: treePresent, detail: treePresent ? `pull request #${pullRequest.number}'s merged content is present in ${baseRef}` : `pull request #${pullRequest.number}'s merged content is not present in ${baseRef}` }
    : { name: "pull-request-merged", ok: false, detail: pullRequestResult.error.detail, exitCode: pullRequestResult.error.exitCode },
  { name: "linear-done", ok: state === "Done", detail: `issue is ${state ?? "unknown"}, expected Done` },
  { name: "terminals-idle", ok: busy.length === 0, detail: busy.length ? `worker is still working: ${busy.map((terminal) => terminal.handle).join(", ")}` : `${terminals.length} terminal(s) idle` },
]
const unmet = checks.filter((check) => !check.ok)
if (unmet.length > 0) {
  for (const check of unmet) console.error(`UNMET ${check.name}: ${check.detail}`)
  process.exit(unmet.some((check) => check.exitCode === 3) ? 3 : 1)
}

const commonDirRaw = git(path, ["rev-parse", "--git-common-dir"])
const commonDir = resolve(path, commonDirRaw)
const gitCommon = (args, { allowFailure = false } = {}) => {
  const result = spawnSync(GIT, [`--git-dir=${commonDir}`, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  if (result.status === 0) return result.stdout.trim()
  if (allowFailure) return null
  fail(3, `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`)
}
orca(["terminal", "stop", "--worktree", selector])
try {
  execFileSync(ORCA, ["worktree", "rm", "--worktree", selector, "--force", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
} catch {
  // Verification below decides whether a dropped Orca runtime connection was harmless.
}
gitCommon(["worktree", "prune"], { allowFailure: true })
const gitWorktrees = gitCommon(["worktree", "list", "--porcelain"])
const stillListed = gitWorktrees.split("\n").some((line) => line === `worktree ${path}` || normalize(line.replace(/^worktree /, "")) === normalize(path))
const pathGone = !existsSync(path)
if (!pathGone || stillListed) fail(1, `removal verification failed: filesystem=${pathGone ? "gone" : "present"}, git-worktree-list=${stillListed ? "present" : "gone"}`)

const branchExists = gitCommon(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }) !== null
if (branchExists) {
  const dropped = gitCommon(["branch", "-D", branch], { allowFailure: true })
  if (dropped === null) fail(1, `removed worktree but could not delete local branch ${branch}`)
}
const branchRemaining = gitCommon(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }) !== null
if (branchRemaining) fail(1, `removed worktree but local branch ${branch} still exists`)
console.log(`REMOVED worktree ${path}`)
console.log(`REMOVED terminals for ${path}`)
console.log(`REMOVED local branch ${branch}`)
