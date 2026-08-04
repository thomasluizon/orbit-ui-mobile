#!/usr/bin/env node
/**
 * Remove one completed Orca worktree only after independently checking that no work can be lost.
 * Orca may drop its runtime connection after completing a removal, so success is verified from the
 * filesystem and git, never from its reply.
 *
 * Runs only after `gh pr view` reads MERGED. The worker PID liveness check the previous revision
 * carried is gone with the detached-spawn design: a worker is now a CHILD of tools/launch-worker.mjs
 * and cannot outlive it, and teardown happens long after that supervisor exited.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const USAGE = `usage: teardown-worktree.mjs (--issue ORB-N | --worktree <path>) [--base <ref>]

  --issue ORB-N       remove the Orca worktree linked to this Linear issue
  --worktree <path>   remove this Orca child worktree
  --base <ref>        branch that must contain the merge commit (default: worktree base or main)
  --help, -h          print this usage and exit 0

All four checks must pass before anything is removed: the tree is clean, the pull request is merged
with its merge commit present in the target branch, the local branch tip is contained in the pull
request head, and the linked Linear issue is Done.

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
    return fail(3, `orca ${args.join(" ")} failed: ${error.stdout?.toString().trim() || error.stderr?.toString().trim() || error.message}`)
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed.ok === false) fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? "unknown error"}`)
    return parsed.result ?? parsed
  } catch {
    return fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 300)}`)
  }
}
const git = (path, args, { allowFailure = false } = {}) => {
  const result = spawnSync(GIT, ["-C", path, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  if (result.status === 0) return result.stdout.trim()
  if (allowFailure) return null
  fail(3, `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`)
}
const normalize = (path) => (typeof path === "string" ? resolve(path.replace(/^path:/, "")) : "").replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()

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

git(path, ["fetch", "--quiet", "origin", base], { allowFailure: true })
const baseRef = git(path, ["rev-parse", "--verify", "--quiet", `origin/${base}`], { allowFailure: true }) ? `origin/${base}` : base

let pullRequest
try {
  const [first] = JSON.parse(execFileSync(GH, ["pr", "list", "--head", branch, "--base", base, "--state", "merged", "--limit", "1", "--json", "number,mergeCommit,headRefOid,mergedAt"], { cwd: path, encoding: "utf8" }))
  pullRequest = first
} catch (error) {
  fail(3, `gh pr list for ${branch} failed: ${(error.stdout?.toString() || error.stderr?.toString() || error.message).trim()}`)
}
if (!pullRequest?.mergedAt || !pullRequest.mergeCommit?.oid || !pullRequest.headRefOid) {
  fail(1, `no merged pull request with merge and head commits was found for ${branch}`)
}

/** Both commits are fetched first: a worktree legitimately has never seen the squash commit its
 * own branch became, and an unreadable commit must fail as unreadable rather than as "not an
 * ancestor", which reads as work loss when it is a missing object. */
const contains = (commit, container) => {
  git(path, ["fetch", "--quiet", "origin", commit], { allowFailure: true })
  if (git(path, ["cat-file", "-e", `${commit}^{commit}`], { allowFailure: true }) === null) fail(3, `could not read commit ${commit}`)
  return git(path, ["merge-base", "--is-ancestor", commit, container], { allowFailure: true }) !== null
}

const state = (() => {
  const detail = orca(["linear", "issue", issue])
  const linearIssue = detail.issue ?? detail
  return linearIssue.state?.name ?? linearIssue.state
})()
const dirty = git(path, ["status", "--short"]).split("\n").filter(Boolean)
const localTip = git(path, ["rev-parse", branch])

const checks = [
  { name: "worktree-clean", ok: dirty.length === 0, detail: `uncommitted paths: ${dirty.join(", ")}` },
  { name: "merge-commit-in-target", ok: contains(pullRequest.mergeCommit.oid, baseRef), detail: `pull request #${pullRequest.number} merge commit ${pullRequest.mergeCommit.oid} is not an ancestor of ${baseRef}` },
  { name: "local-tip-in-pull-request-head", ok: contains(localTip, pullRequest.headRefOid), detail: `local tip ${localTip} is not contained in pull request #${pullRequest.number} head ${pullRequest.headRefOid}; local commits would be lost` },
  { name: "linear-done", ok: state === "Done", detail: `issue is ${state ?? "unknown"}, expected Done` },
]
const unmet = checks.filter((check) => !check.ok)
if (unmet.length > 0) {
  for (const check of unmet) console.error(`UNMET ${check.name}: ${check.detail}`)
  process.exit(1)
}

const commonDir = resolve(path, git(path, ["rev-parse", "--git-common-dir"]))
const gitCommon = (args) => {
  const result = spawnSync(GIT, [`--git-dir=${commonDir}`, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  return result.status === 0 ? result.stdout.trim() : null
}
try {
  execFileSync(ORCA, ["worktree", "rm", "--worktree", selector, "--force", "--json"], { encoding: "utf8" })
} catch {
  // Verification below decides whether a dropped Orca runtime connection was harmless.
}
gitCommon(["worktree", "prune"])
const stillListed = (gitCommon(["worktree", "list", "--porcelain"]) ?? "").split("\n").some((line) => line.startsWith("worktree ") && normalize(line.slice("worktree ".length)) === normalize(path))
if (existsSync(path) || stillListed) fail(1, `removal verification failed: filesystem=${existsSync(path) ? "present" : "gone"}, git-worktree-list=${stillListed ? "present" : "gone"}`)

if (gitCommon(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]) !== null) {
  gitCommon(["branch", "-D", branch])
  if (gitCommon(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]) !== null) fail(1, `removed worktree but local branch ${branch} still exists`)
}
console.log(`REMOVED worktree ${path}`)
console.log(`REMOVED local branch ${branch}`)
