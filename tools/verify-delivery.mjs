#!/usr/bin/env node
/**
 * The sole authority for the word "delivered".
 *
 * A worker's exit code is not evidence. Three documented CLI bugs make "the
 * process finished" untrustworthy: on Windows `codex exec` hangs forever when
 * stdin is an inherited-but-unwritten pipe (openai/codex#20919); it exits 0
 * with zero output when detached from a TTY (openai/codex#19945); and
 * claude-code hangs after emitting its own success event
 * (anthropics/claude-code#25629). A measured incident closed the argument: the
 * remote PR head remained 20987524 while four later commits and the pagination
 * work existed only locally. A successful local repair that is never pushed,
 * reviewed, and made green is not delivery.
 *
 * So every check below reads a git or GitHub artifact. None reads a
 * self-report, and child stdin is never inherited.
 */

import { execFileSync } from "node:child_process"
import { statSync } from "node:fs"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: verify-delivery.mjs --issue ORB-N --worktree <path> --branch <name> [options]

  --issue <ORB-N>     Linear issue the worker was launched on (required)
  --worktree <path>   worktree the worker committed in (required)
  --branch <name>     branch the worker pushed (required)
  --repo <key>        repository key from .claude/orchestrator.json; GitHub is
                      queried from that checkout instead of the worktree
  --base <ref>        base the commit count is taken against (default: main)
  --help, -h          print this usage and exit 0

Derives delivery from git and GitHub artifacts only, never from a worker's own
report. Checks run in order and the first failure decides the verdict:
NO_COMMIT, UNPUSHED, NO_PR, STALE_PR, OVERSIZE, or DELIVERED.

stdout carries ONE JSON object and nothing else. Errors go to stderr.

exit codes: 0 DELIVERED, 1 every other verdict, 2 usage or environment error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}
const knownFlags = new Set(["--issue", "--worktree", "--branch", "--repo", "--base", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issue = argOf("--issue")
const worktree = argOf("--worktree")
const branch = argOf("--branch")
const repoKey = argOf("--repo")
const base = argOf("--base") ?? "main"
const safeValue = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("-")
if (!issue || !/^[A-Z][A-Z0-9]*-\d+$/i.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-163`)
if (!safeValue(worktree)) fail(2, `${USAGE}\n\n--worktree requires a path`)
if (!safeValue(branch)) fail(2, `${USAGE}\n\n--branch requires a branch name`)
if (!safeValue(base)) fail(2, `${USAGE}\n\n--base requires a ref`)

let worktreePresent = false
try {
  worktreePresent = statSync(worktree).isDirectory()
} catch {
  worktreePresent = false
}
if (!worktreePresent) fail(2, `--worktree does not name a directory: ${worktree}`)

let githubCwd = worktree
if (repoKey !== null) {
  if (!safeValue(repoKey)) fail(2, `${USAGE}\n\n--repo requires a repository key`)
  let config
  try {
    config = readOrchestratorConfig()
  } catch (error) {
    fail(2, error.message)
  }
  const repoPath = config.repos?.[repoKey]
  if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
    fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ") || "none"})`)
  }
  githubCwd = repoPath
}

const GIT = process.env.GIT_BIN || "git"
const GH = process.env.GH_BIN || "gh"
const DIFF_CAP = 400
const FILE_CAP = 8
const run = (file, args, cwd) => {
  try {
    const stdout = execFileSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 })
    return { ok: true, stdout }
  } catch (error) {
    return { ok: false, stdout: "", error: (error.stderr?.toString() || error.stdout?.toString() || error.message).trim() }
  }
}
const git = (args) => run(GIT, ["-C", worktree, ...args])

const checks = {}
const emit = (verdict) => {
  console.log(JSON.stringify({ issue, verdict, checks }, null, 2))
  process.exit(verdict === "DELIVERED" ? 0 : 1)
}

const tree = git(["status", "--porcelain"])
if (!tree.ok) fail(2, `git status --porcelain failed in ${worktree}: ${tree.error}`)
const dirty = tree.stdout.trim()
checks.cleanTree = { pass: dirty.length === 0, observed: dirty }
if (!checks.cleanTree.pass) emit("NO_COMMIT")

const counted = git(["rev-list", "--count", `${base}..HEAD`])
if (!counted.ok) fail(2, `git rev-list --count ${base}..HEAD failed in ${worktree}: ${counted.error}`)
const commits = Number(counted.stdout.trim())
checks.hasCommits = { pass: Number.isInteger(commits) && commits >= 1, observed: commits }
if (!checks.hasCommits.pass) emit("NO_COMMIT")

// A missing origin/<branch> is not an environment error: never having been pushed is what UNPUSHED means.
const ahead = git(["rev-list", `origin/${branch}..HEAD`, "--count"])
const localOnly = ahead.ok ? Number(ahead.stdout.trim()) : `origin/${branch} does not exist`
checks.pushed = { pass: localOnly === 0, observed: localOnly }
if (!checks.pushed.pass) emit("UNPUSHED")

const listed = run(GH, ["pr", "list", "--head", branch, "--json", "number,url,headRefOid,additions,deletions,title,body,files"], githubCwd)
if (!listed.ok) fail(2, `gh pr list --head ${branch} failed: ${listed.error}`)
let pullRequests
try {
  pullRequests = JSON.parse(listed.stdout)
} catch {
  fail(2, `gh pr list --head ${branch} returned unparseable JSON: ${listed.stdout.trim().slice(0, 240) || "empty output"}`)
}
if (!Array.isArray(pullRequests)) fail(2, `gh pr list --head ${branch} did not return an array`)
const [pullRequest] = pullRequests
checks.prCount = {
  pass: pullRequests.length === 1,
  observed: pullRequests.length,
  number: pullRequest?.number ?? null,
  url: pullRequest?.url ?? null,
}
if (!checks.prCount.pass) emit("NO_PR")

/**
 * `--head` filters on the BRANCH and nothing else, so a pull request that never names the ticket
 * still lands here and would read as delivered. The composed work order requires a pull request
 * that links the issue, and this file is the only thing that checks the work order was honoured.
 */
const mentionsIssue = (text) => typeof text === "string" && new RegExp(`\\b${issue}\\b`, "i").test(text)
checks.linksTicket = {
  pass: mentionsIssue(pullRequest.title) || mentionsIssue(pullRequest.body),
  observed: mentionsIssue(pullRequest.title) ? "title" : mentionsIssue(pullRequest.body) ? "body" : "neither title nor body names the issue",
}
if (!checks.linksTicket.pass) emit("UNLINKED_PR")

const head = git(["rev-parse", "HEAD"])
if (!head.ok) fail(2, `git rev-parse HEAD failed in ${worktree}: ${head.error}`)
const localHead = head.stdout.trim()
checks.prHeadMatches = { pass: pullRequest.headRefOid === localHead, observed: pullRequest.headRefOid ?? null, local: localHead }
if (!checks.prHeadMatches.pass) emit("STALE_PR")

if (!Number.isInteger(pullRequest.additions) || !Number.isInteger(pullRequest.deletions)) {
  fail(2, `gh pr list reported no numeric additions and deletions for pull request #${pullRequest.number}`)
}
const size = pullRequest.additions + pullRequest.deletions
checks.diffSize = { pass: size <= DIFF_CAP, observed: size, cap: DIFF_CAP }
if (!checks.diffSize.pass) emit("OVERSIZE")

/**
 * The scope gate promises TWO caps and this file enforced only one: a worker can touch 20 files
 * while staying under 400 lines. `files` is what the GitHub API returns, and it truncates at 100
 * entries, so a length of exactly 100 means "at least 100" and is reported that way rather than as
 * a precise count that would be a lie.
 */
if (!Array.isArray(pullRequest.files)) {
  fail(2, `gh pr list reported no files array for pull request #${pullRequest.number}`)
}
const truncated = pullRequest.files.length >= 100
const fileCount = pullRequest.files.length
checks.affectedFiles = {
  pass: !truncated && fileCount <= FILE_CAP,
  observed: truncated ? `at least ${fileCount} (the API truncates this list)` : fileCount,
  cap: FILE_CAP,
}
if (!checks.affectedFiles.pass) emit("OVERSIZE")

emit("DELIVERED")
