#!/usr/bin/env node
/**
 * Remove one completed worktree only after independently checking that no work can be lost.
 *
 * Runs only after `gh pr view` reads MERGED. The worker PID liveness check the previous revision
 * carried is gone with the detached-spawn design: a worker is now a CHILD of tools/launch-worker.mjs
 * and cannot outlive it, and teardown happens long after that supervisor exited.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, renameSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { assertRepositoryLabel, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: teardown-worktree.mjs (--issue <ORB-N|#N|N> | --worktree <path>) --repo <ui|api|landing> [--base <ref>]

  --issue <reference> remove the child worktree whose directory name contains ticket-<number>
  --worktree <path>   remove this child worktree (its name must contain ticket-<number>)
  --repo <key>        repository key the ticket must target
  --base <ref>        optionally narrow the merged pull request lookup to this target branch
  --help, -h          print this usage and exit 0

All four checks must pass before anything is removed: the tree is clean, the pull request is merged
with its merge commit present in the target branch, the local branch tip is contained in the pull
request head, and the linked ticket is closed with board status Done.

The local contract branch is retained because deleting a branch that is the base of a stacked pull
request can close that pull request. Existing worktrees can be cleared safely by running this tool
once per ticket; there is deliberately no unchecked bulk-delete mode.

exit codes: 0 removed and verified, 1 evidence or removal verification failed, 2 usage error,
            3 a git or gh command could not be read`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

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
const KNOWN_FLAGS = new Set(["--issue", "--worktree", "--repo", "--base", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !KNOWN_FLAGS.has(token))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const requestedIssue = argOf("--issue")
const requestedWorktree = argOf("--worktree")
const repoKey = argOf("--repo")
const requestedBase = argOf("--base")
if ([requestedIssue, requestedWorktree, repoKey, requestedBase].some((value) => value === undefined)) fail(2, `${USAGE}\n\nselector flags require a value`)
if ((requestedIssue && requestedWorktree) || (!requestedIssue && !requestedWorktree)) fail(2, `${USAGE}\n\nprovide exactly one selector`)
if (!repoKey) fail(2, `${USAGE}\n\n--repo is required`)
if (requestedIssue) {
  try {
    resolveTicket(requestedIssue)
  } catch (error) {
    fail(2, error.message)
  }
}

const git = (path, args, { allowFailure = false } = {}) => {
  const result = spawnSync(GIT, ["-C", path, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  if (result.status === 0) return result.stdout.trim()
  if (allowFailure) return null
  fail(3, `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`)
}
const normalize = (path) => (typeof path === "string" ? resolve(path.replace(/^path:/, "")) : "").replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()

const requestedTicketNumber = requestedIssue ? resolveTicket(requestedIssue).number : null

let config
let ticket
let repositoryPath
try {
  config = readOrchestratorConfig()
  if (typeof config.repos?.[repoKey] !== "string") throw new Error(`unknown repository key ${JSON.stringify(repoKey)}`)
  repositoryPath = config.repos[repoKey]
} catch (error) {
  fail(1, `ticket assertion failed: ${error.message}`)
}

const porcelain = git(repositoryPath, ["worktree", "list", "--porcelain"])
const worktrees = porcelain.split(/\n\s*\n/).filter(Boolean).map((record) => {
  const fields = Object.fromEntries(record.split("\n").map((line) => {
    const separator = line.indexOf(" ")
    return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)]
  }))
  return { path: fields.worktree, branch: typeof fields.branch === "string" ? fields.branch : null }
})
const ticketNumberFromName = (path) => {
  const match = normalize(path).split("/").at(-1)?.match(/(?:^|[-_])ticket[-_](\d+)(?:[-_]|$)/i)
  return match ? Number(match[1]) : null
}
const matches = requestedIssue
  ? worktrees.filter((entry) => normalize(entry.path) !== normalize(repositoryPath) && ticketNumberFromName(entry.path) === requestedTicketNumber)
  : worktrees.filter((entry) => normalize(entry.path) === normalize(requestedWorktree))
if (matches.length === 0) fail(1, requestedIssue ? `no active Git worktree name matches ticket ${requestedTicketNumber}` : `no active Git worktree matches ${requestedWorktree}`)
if (matches.length > 1) fail(1, `multiple active Git worktree names match ticket ${requestedTicketNumber}; use --worktree <path>`)
const worktree = matches[0]
if (normalize(worktree.path) === normalize(repositoryPath)) fail(1, "refusing to remove a primary checkout")
const linkedTicketNumber = requestedTicketNumber ?? ticketNumberFromName(worktree.path)
if (!linkedTicketNumber) fail(1, "refusing a worktree whose directory name has no ticket-<number>")
try {
  ticket = await readTicket(linkedTicketNumber)
  assertRepositoryLabel(ticket, repoKey)
} catch (error) {
  fail(1, `ticket assertion failed: ${error.message}`)
}

const path = worktree.path
const branch = (worktree.branch ?? git(path, ["rev-parse", "--abbrev-ref", "HEAD"])).replace(/^refs\/heads\//, "")
let pullRequest
try {
  const baseFilter = requestedBase ? ["--base", requestedBase] : []
  const [first] = JSON.parse(execFileSync(GH, ["pr", "list", "--head", branch, ...baseFilter, "--state", "merged", "--limit", "1", "--json", "number,mergeCommit,headRefOid,mergedAt,baseRefName"], { cwd: path, encoding: "utf8" }))
  pullRequest = first
} catch (error) {
  fail(3, `gh pr list for ${branch} failed: ${(error.stdout?.toString() || error.stderr?.toString() || error.message).trim()}`)
}
if (!pullRequest?.mergedAt || !pullRequest.mergeCommit?.oid || !pullRequest.headRefOid || typeof pullRequest.baseRefName !== "string" || !pullRequest.baseRefName) {
  fail(1, `no merged pull request with merge and head commits was found for ${branch}`)
}

const base = pullRequest.baseRefName
git(path, ["fetch", "--quiet", "origin", base], { allowFailure: true })
const baseRef = git(path, ["rev-parse", "--verify", "--quiet", `origin/${base}`], { allowFailure: true }) ? `origin/${base}` : base

/** Both commits are fetched first: a worktree legitimately has never seen the squash commit its
 * own branch became, and an unreadable commit must fail as unreadable rather than as "not an
 * ancestor", which reads as work loss when it is a missing object. */
const contains = (commit, container) => {
  git(path, ["fetch", "--quiet", "origin", commit], { allowFailure: true })
  if (git(path, ["cat-file", "-e", `${commit}^{commit}`], { allowFailure: true }) === null) fail(3, `could not read commit ${commit}`)
  return git(path, ["merge-base", "--is-ancestor", commit, container], { allowFailure: true }) !== null
}

const dirty = git(path, ["status", "--short"]).split("\n").filter(Boolean)
const localTip = git(path, ["rev-parse", branch])

const checks = [
  { name: "worktree-clean", ok: dirty.length === 0, detail: `uncommitted paths: ${dirty.join(", ")}` },
  { name: "merge-commit-in-target", ok: contains(pullRequest.mergeCommit.oid, baseRef), detail: `pull request #${pullRequest.number} merge commit ${pullRequest.mergeCommit.oid} is not an ancestor of ${baseRef}` },
  { name: "local-tip-in-pull-request-head", ok: contains(localTip, pullRequest.headRefOid), detail: `local tip ${localTip} is not contained in pull request #${pullRequest.number} head ${pullRequest.headRefOid}; local commits would be lost` },
  { name: "ticket-done", ok: ticket.state === "CLOSED" && ticket.status === config.tickets.states.done, detail: `ticket is ${ticket.state} with board status ${ticket.status ?? "unknown"}, expected CLOSED and Done` },
]
const unmet = checks.filter((check) => !check.ok)
if (unmet.length > 0) {
  for (const check of unmet) console.error(`UNMET ${check.name}: ${check.detail}`)
  process.exit(1)
}

const commonDir = resolve(path, git(path, ["rev-parse", "--git-common-dir"]))
const runGitCommon = (args) => spawnSync(GIT, [`--git-dir=${commonDir}`, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
const gitCommon = (args) => {
  const result = runGitCommon(args)
  return result.status === 0 ? result.stdout.trim() : null
}
/** Distinguishes "git says it is gone" from "git could not be read". Collapsing the second into
 * the first is how a teardown reports REMOVED over a registration that is still there. */
const listWorktrees = () => {
  const listing = gitCommon(["worktree", "list", "--porcelain"])
  if (listing === null) fail(3, `git worktree list failed against ${commonDir}; refusing to guess whether ${path} is still registered`)
  return listing
}
const isStillListed = () => listWorktrees().split("\n").some((line) => line.startsWith("worktree ") && normalize(line.slice("worktree ".length)) === normalize(path))

const LOCK_REFUSAL = (reason) => `worktree ${path} is LOCKED (${reason}); git refuses to remove or prune a locked worktree, and nothing was touched`
const removal = runGitCommon(["worktree", "remove", path])
if (removal.status !== 0) {
  const detail = (removal.stderr || removal.stdout || removal.error?.message || "unknown error").trim()
  const lockReason = removal.status === 128
    ? detail.match(/^fatal: cannot remove a locked working tree, lock reason: (.+)$/m)?.[1]
    : null
  if (lockReason) fail(1, LOCK_REFUSAL(lockReason))
  fail(3, `git worktree remove ${path} failed: ${detail}`)
}

const removalPath = `${path}.teardown-${process.pid}-${Date.now()}`

/** Git for Windows can leave junction residue after successfully deregistering a worktree. Stage
 * only that residue before deleting it, so a path recreated after the rename is never removed. */
process.chdir(repositoryPath)
if (existsSync(path)) {
  try {
    renameSync(path, removalPath)
  } catch (error) {
    fail(1, `Git released worktree ${path}, but the filesystem refused to stage its residue: ${error.message}`)
  }
  try {
    rmSync(removalPath, { recursive: true, force: true })
  } catch (error) {
    try {
      if (existsSync(removalPath) && !existsSync(path)) renameSync(removalPath, path)
    } catch (restoreError) {
      fail(1, `Git released worktree ${path}, but its files remain at ${removalPath}: ${restoreError.message}`)
    }
    fail(1, `Git released worktree ${path}, but the filesystem refused to remove its residue: ${error.message}`)
  }
}

/** Only the residue this run staged may be deleted. Anything at the original path afterward was put
 * there by something else, and removing it would destroy data this tool never checked. */
if (existsSync(path)) fail(1, `${path} was recreated during teardown; its files were NOT removed and git registration may be stale`)
if (existsSync(removalPath)) fail(1, `Git has released worktree ${path}, but its staged files remain at ${removalPath}`)
if (isStillListed()) fail(1, `filesystem removed worktree ${path}, but git still holds this worktree`)

console.log(`REMOVED worktree ${path}`)
console.log(`RETAINED local branch ${branch} (it may be the base of a stacked pull request)`)
