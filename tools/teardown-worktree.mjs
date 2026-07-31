#!/usr/bin/env node
/**
 * Remove one completed Orca worktree only after independently checking that no
 * work can be lost. Orca may drop its runtime connection after completing a
 * removal, so success is verified from the filesystem and Git, never its reply.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"


const USAGE = `usage: teardown-worktree.mjs (--issue ORB-N | --worktree <path>) [--base <ref>]

  --issue ORB-N       remove the Orca worktree linked to this Linear issue
  --worktree <path>   remove this Orca child worktree, using its linked Linear issue
  --base <ref>        target branch that must contain the pull request merge commit (default: worktree base or main)
  --help, -h          print this usage and exit 0

All five checks must pass before anything is removed: the tree is clean, the pull request merge
commit is present in the target branch, the local branch tip is contained in the pull request
head, the linked Linear issue is Done,
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
const isInside = (parent, child) => {
  const pathFromParent = relative(parent, child)
  return pathFromParent !== "" && pathFromParent !== ".." && !pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(pathFromParent)
}
const directoryLinks = (worktreePath) => {
  let exactRoot
  try {
    exactRoot = realpathSync(worktreePath)
  } catch (error) {
    fail(3, `could not resolve worktree root ${worktreePath}: ${error.message}`)
  }
  const links = []
  const visit = (directory) => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch (error) {
      fail(3, `could not inspect worktree directory ${directory}: ${error.message}`)
    }
    for (const entry of entries) {
      const entryPath = resolve(directory, entry.name)
      if (!isInside(exactRoot, entryPath)) fail(1, `refusing to inspect a path outside the exact worktree: ${entryPath}`)
      let entryStats
      try {
        entryStats = lstatSync(entryPath)
      } catch (error) {
        fail(3, `could not inspect worktree entry ${entryPath}: ${error.message}`)
      }
      if (entryStats.isSymbolicLink()) {
        let target
        let targetStats
        try {
          target = realpathSync(entryPath)
          targetStats = statSync(entryPath)
        } catch (error) {
          fail(1, `refusing an unresolved link in the worktree: ${entryPath}: ${error.message}`)
        }
        if (targetStats.isDirectory()) links.push({ link: entryPath, target })
        continue
      }
      if (entryStats.isDirectory()) visit(entryPath)
    }
  }
  visit(exactRoot)
  return links
}

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
const workerMarker = join(resolve(path, git(path, ["rev-parse", "--git-dir"])), "orbit-worker-pids.jsonl")
const workerPids = existsSync(workerMarker)
  ? readFileSync(workerMarker, "utf8").trim().split(/\r?\n/).filter(Boolean).flatMap((line) => { try { const row = JSON.parse(line); return Number.isInteger(row.pid) ? [row.pid] : [] } catch { return [] } })
  : []
const workerAlive = workerPids.filter((pid) => { try { process.kill(pid, 0); return true } catch (error) { return error.code !== "ESRCH" } })
const detail = orca(["linear", "issue", issue])
const linearIssue = detail.issue ?? detail
const state = linearIssue.state?.name ?? linearIssue.state

git(path, ["fetch", "--quiet", "origin", base], { allowFailure: true })
const baseRef = git(path, ["rev-parse", "--verify", "--quiet", `origin/${base}`], { allowFailure: true }) ? `origin/${base}` : base
const pullRequestResult = pullRequestFor(path, branch, base)
const pullRequest = pullRequestResult.pullRequest
const pullRequestChecks = pullRequest
  ? (() => {
      const mergeCommitFetched = git(path, ["fetch", "--quiet", "origin", pullRequest.mergeCommit.oid], { allowFailure: true }) !== null
      const mergeCommitReadable = mergeCommitFetched && git(path, ["cat-file", "-e", `${pullRequest.mergeCommit.oid}^{commit}`], { allowFailure: true }) !== null
      const mergeCommitPresent = mergeCommitReadable && git(path, ["merge-base", "--is-ancestor", pullRequest.mergeCommit.oid, baseRef], { allowFailure: true }) !== null
      const localTip = git(path, ["rev-parse", branch])
      const pullRequestHeadFetched = git(path, ["fetch", "--quiet", "origin", pullRequest.headRefOid], { allowFailure: true }) !== null
      const pullRequestHeadReadable = pullRequestHeadFetched && git(path, ["cat-file", "-e", `${pullRequest.headRefOid}^{commit}`], { allowFailure: true }) !== null
      const localTipPresent = pullRequestHeadReadable && git(path, ["merge-base", "--is-ancestor", localTip, pullRequest.headRefOid], { allowFailure: true }) !== null
      return [
        {
          name: "merge-commit-in-target",
          ok: mergeCommitPresent,
          detail: mergeCommitReadable
            ? `pull request #${pullRequest.number}'s merge commit ${pullRequest.mergeCommit.oid} is not an ancestor of ${baseRef}`
            : `could not read pull request #${pullRequest.number}'s merge commit ${pullRequest.mergeCommit.oid}`,
          exitCode: mergeCommitReadable ? undefined : 3,
        },
        {
          name: "local-tip-in-pull-request-head",
          ok: localTipPresent,
          detail: pullRequestHeadReadable
            ? `local tip ${localTip} is not contained in pull request #${pullRequest.number}'s head ${pullRequest.headRefOid}; local commits would be lost`
            : `could not read pull request #${pullRequest.number}'s head ${pullRequest.headRefOid}`,
          exitCode: pullRequestHeadReadable ? undefined : 3,
        },
      ]
    })()
  : [{ name: "pull-request-merged", ok: false, detail: pullRequestResult.error.detail, exitCode: pullRequestResult.error.exitCode }]
const checks = [
  { name: "worktree-clean", ok: dirty.length === 0, detail: dirty.length ? `uncommitted paths: ${dirty.join(", ")}` : "no uncommitted work" },
  ...pullRequestChecks,
  { name: "linear-done", ok: state === "Done", detail: `issue is ${state ?? "unknown"}, expected Done` },
  { name: "worker-pid-exited", ok: workerAlive.length === 0, detail: workerAlive.length ? `worker PID is still running: ${workerAlive.join(", ")}` : "the worker PID has exited" },
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
const links = directoryLinks(path)
for (const { link, target } of links) {
  try {
    unlinkSync(link)
  } catch (error) {
    fail(3, `could not remove verified junction link ${link}: ${error.message}`)
  }
  if (existsSync(link)) fail(1, `junction link remained after removal: ${link}`)
  if (!existsSync(target)) fail(1, `junction target did not survive link removal: ${target}`)
  console.log(`REMOVED junction link ${link}`)
  console.log(`PRESERVED junction target ${target}`)
}
orca(["terminal", "stop", "--worktree", selector])
try {
  execFileSync(ORCA, ["worktree", "rm", "--worktree", selector, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
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
if (existsSync(workerMarker)) {
  try { unlinkSync(workerMarker) } catch (error) { fail(3, `could not prune worker PID marker ${workerMarker}: ${error.message}`) }
}
console.log(`REMOVED worktree ${path}`)
console.log(`REMOVED terminals for ${path}`)
console.log(`REMOVED local branch ${branch}`)
