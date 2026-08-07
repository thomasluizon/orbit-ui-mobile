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
 *
 * Two things this file is careful NOT to do, both measured on ORB-39 (2026-08-06):
 *
 * 1. It never short-circuits before counting commits. It used to emit NO_COMMIT the
 *    moment the tree was dirty, so a worktree holding commit 7c726189 (8 files, 221
 *    insertions, the whole ticket) reported one check and the word NO_COMMIT. That
 *    reads as "produced nothing", and the correct recovery was the opposite: discard
 *    the residue, push, open the pull request. DIRTY_TREE is now its own verdict and
 *    hasCommits is always evaluated and always reported.
 * 2. It never hides an oversize diff behind a pass. A ticket may carry a human-authored
 *    CAPS-OVERRIDE line (tools/lib/caps-override.mjs), and when one covers the breach the
 *    real numbers are still measured, still printed, and the verdict says so by name.
 */

import { execFileSync } from "node:child_process"
import { statSync } from "node:fs"

import { effectiveCaps, parseCapsOverride } from "./lib/caps-override.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: verify-delivery.mjs --issue ORB-N --worktree <path> --branch <name> [options]

  --issue <ORB-N>     Linear issue the worker was launched on (required)
  --worktree <path>   worktree the worker committed in (required)
  --branch <name>     branch the worker pushed (required)
  --repo <key>        repository key from .claude/orchestrator.json; GitHub is
                      queried from that checkout instead of the worktree
  --base <ref>        base the commit count is taken against (default: main)
  --wait-ci <s>       seconds to wait for still-running checks to settle before
                      reporting CI_PENDING (default: 0, report immediately)
  --help, -h          print this usage and exit 0

Derives delivery from git and GitHub artifacts only, never from a worker's own
report. Checks run in order and the first failure decides the verdict:
NO_COMMIT, DIRTY_TREE, UNPUSHED, NO_PR, STALE_PR, OVERSIZE, CI_FAILING,
CI_PENDING, DELIVERED_OVERSIZE_EXEMPT, or DELIVERED.

stdout carries ONE JSON object and nothing else. Errors go to stderr.

exit codes: 0 DELIVERED or DELIVERED_OVERSIZE_EXEMPT, 1 every other verdict,
            2 usage or environment error`

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
const knownFlags = new Set(["--issue", "--worktree", "--branch", "--repo", "--base", "--wait-ci", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issue = argOf("--issue")
const worktree = argOf("--worktree")
const branch = argOf("--branch")
const repoKey = argOf("--repo")
const base = argOf("--base") ?? "main"
const waitCiRaw = argOf("--wait-ci") ?? "0"
const waitCiSeconds = Number(waitCiRaw)
if (!Number.isFinite(waitCiSeconds) || waitCiSeconds < 0) fail(2, `${USAGE}\n\n--wait-ci requires a non-negative number of seconds`)
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

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}

let githubCwd = worktree
if (repoKey !== null) {
  if (!safeValue(repoKey)) fail(2, `${USAGE}\n\n--repo requires a repository key`)
  const repoPath = config.repos?.[repoKey]
  if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
    fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ") || "none"})`)
  }
  githubCwd = repoPath
}

const GIT = process.env.GIT_BIN || "git"
const GH = process.env.GH_BIN || "gh"
const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
/** The standing caps come from the config the whole harness reads, never from a second copy here. */
const STANDING_CAPS = { lines: config.caps.diffLines, files: config.caps.affectedFiles }
const run = (file, args, cwd) => {
  try {
    const stdout = execFileSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 })
    return { ok: true, stdout }
  } catch (error) {
    return { ok: false, stdout: error.stdout?.toString() ?? "", error: (error.stderr?.toString() || error.stdout?.toString() || error.message).trim() }
  }
}
const git = (args) => run(GIT, ["-C", worktree, ...args])

const checks = {}
const emit = (verdict) => {
  console.log(JSON.stringify({ issue, verdict, checks }, null, 2))
  process.exit(verdict.startsWith("DELIVERED") ? 0 : 1)
}

/**
 * Residue a run may safely discard, against work it may not. Generated files and evidence a worker
 * should never have produced are one situation; a tracked source file left mid-edit is another, and
 * only the second is somebody's unfinished thinking. Measured on ORB-39: `M apps/web/next-env.d.ts`
 * plus `?? apps/web/e2e/visual/orb-39-evidence.visual.ts`, both discardable, so the finished commit
 * underneath was recoverable without a human opening the worktree.
 */
const GENERATED_RESIDUE = [/(^|\/)next-env\.d\.ts$/, /(^|\/)\.next\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)coverage\//, /(^|\/)node_modules\//, /\.tsbuildinfo$/, /(^|\/)test-results\//, /(^|\/)playwright-report\//]
/**
 * Discardable only while UNTRACKED. The repository has a tracked E2E suite, and a path-only rule
 * called a modified or deleted file under `e2e/` residue, which step 7 then permits the run to throw
 * away. A worker's invented evidence file is untracked (`??`); an edit to the real suite is not.
 */
const UNTRACKED_ONLY_RESIDUE = [/(^|\/)e2e\//]
const isDiscardable = ({ status, path }) =>
  GENERATED_RESIDUE.some((pattern) => pattern.test(path)) || (status === "??" && UNTRACKED_ONLY_RESIDUE.some((pattern) => pattern.test(path)))

/** `--untracked-files=all` because the default collapses a wholly untracked directory into one
 * entry, and a single `?? apps/` cannot be classified as residue or as somebody's unfinished work. */
const tree = git(["status", "--porcelain", "--untracked-files=all"])
if (!tree.ok) fail(2, `git status --porcelain failed in ${worktree}: ${tree.error}`)
/**
 * TRAILING whitespace only. Trimming the whole blob ate the leading space of the FIRST line, so a
 * tracked modification (` M path`) lost a character off its path and its two-character status code
 * read as `M `. Every earlier fixture happened to start with `??`, which has no leading space, so
 * the defect was invisible until a tracked e2e edit had to be told from an untracked one.
 */
const dirty = tree.stdout.replace(/\s+$/, "")
const dirtyEntries = dirty
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const parts = line.slice(3).trim().split(" -> ")
    return { status: line.slice(0, 2), path: parts[parts.length - 1].replaceAll('"', "") }
  })
const sourcePaths = dirtyEntries.filter((entry) => !isDiscardable(entry)).map((entry) => entry.path)
checks.cleanTree = {
  pass: dirty.length === 0,
  observed: dirty,
  discardable: dirtyEntries.filter((entry) => isDiscardable(entry)).map((entry) => entry.path),
  source: sourcePaths,
  allDiscardable: dirtyEntries.length > 0 && sourcePaths.length === 0,
}

/**
 * ALWAYS evaluated, dirty tree or not. A finished deliverable and a worker that did nothing produced
 * the same one-key report until this stopped short-circuiting, and on an unattended night that is the
 * same line in the morning summary for two states whose recoveries have nothing in common.
 */
const counted = git(["rev-list", "--count", `${base}..HEAD`])
if (!counted.ok) fail(2, `git rev-list --count ${base}..HEAD failed in ${worktree}: ${counted.error}`)
const commits = Number(counted.stdout.trim())
checks.hasCommits = { pass: Number.isInteger(commits) && commits >= 1, observed: commits }
if (checks.hasCommits.pass) {
  const described = git(["log", "-1", "--format=%h %s"])
  const stat = git(["show", "--stat", "--format=", "HEAD"])
  checks.hasCommits.head = described.ok ? described.stdout.trim() : null
  checks.hasCommits.headStat = stat.ok ? stat.stdout.trim() : null
}
if (!checks.hasCommits.pass) emit("NO_COMMIT")
if (!checks.cleanTree.pass) emit("DIRTY_TREE")

// A missing origin/<branch> is not an environment error: never having been pushed is what UNPUSHED means.
const ahead = git(["rev-list", `origin/${branch}..HEAD`, "--count"])
const localOnly = ahead.ok ? Number(ahead.stdout.trim()) : `origin/${branch} does not exist`
checks.pushed = { pass: localOnly === 0, observed: localOnly }
if (!checks.pushed.pass) emit("UNPUSHED")

const listed = run(GH, ["pr", "list", "--head", branch, "--json", "number,url,headRefOid,additions,deletions,title,body,changedFiles"], githubCwd)
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
/**
 * The scope gate promises TWO caps and this file enforced only one: a worker can touch 20 files while
 * staying under 400 lines. It replaces counting the `files` array, which the API truncates at 100
 * entries and which therefore could never measure the 355-file codemod the override exists for.
 *
 * `changedFiles` was confirmed on THIS subcommand, not a neighbouring one. `gh pr view` and
 * `gh pr list` are different response interfaces and an earlier comment cited the wrong one, which
 * is the kind of near-miss standard 8 exists to catch. The real `gh pr list` response, gh 2.97.0:
 *
 *   $ gh pr list --head <branch> --json number,additions,deletions,changedFiles
 *   [{"additions":1453,"changedFiles":22,"deletions":74,"number":693}]
 *
 * An integer, matching `gh pr view 693 --json changedFiles`, and the CLI lists the field as valid
 * for `pr list` when given no field names at all.
 */
if (!Number.isInteger(pullRequest.changedFiles)) {
  fail(2, `gh pr list reported no numeric changedFiles for pull request #${pullRequest.number}`)
}
const size = pullRequest.additions + pullRequest.deletions
const fileCount = pullRequest.changedFiles

/**
 * The ticket is read ONLY when a cap is already breached, so the normal path costs no Linear call. A
 * lookup that fails leaves the caps standing: an unreadable ticket is not evidence of an exemption,
 * and failing closed here can only ever cost one hand-over.
 */
let override = null
if (size > STANDING_CAPS.lines || fileCount > STANDING_CAPS.files) {
  const read = run(ORCA, ["linear", "issue", issue.toUpperCase(), "--json"])
  let description = null
  let lookupError = read.ok ? null : read.error
  try {
    const envelope = JSON.parse(read.stdout)
    if (envelope?.ok === false) lookupError = envelope.error?.message ?? "orca refused the read"
    else if (typeof envelope?.result?.issue?.description === "string") description = envelope.result.issue.description
    else lookupError = "the issue carried no description"
  } catch {
    lookupError = lookupError ?? `orca returned unparseable JSON: ${read.stdout.trim().slice(0, 120) || "empty output"}`
  }
  const parsed = description === null ? { found: false } : parseCapsOverride(description, STANDING_CAPS)
  if (parsed.found && !parsed.error) override = parsed
  checks.capsOverride = {
    present: Boolean(override),
    files: override?.files ?? null,
    lines: override?.lines ?? null,
    reason: override?.reason ?? null,
    observed: lookupError ? `the ticket could not be read, so the caps stand: ${lookupError}` : parsed.error ? parsed.error : override ? parsed.source : `no ${"CAPS-OVERRIDE:"} line in the ticket description`,
  }
}

const caps = effectiveCaps(STANDING_CAPS, override)
checks.diffSize = { pass: size <= caps.lines, exempt: size > STANDING_CAPS.lines && size <= caps.lines, observed: size, cap: STANDING_CAPS.lines, allowed: caps.lines }
checks.affectedFiles = { pass: fileCount <= caps.files, exempt: fileCount > STANDING_CAPS.files && fileCount <= caps.files, observed: fileCount, cap: STANDING_CAPS.files, allowed: caps.files }
if (!checks.diffSize.pass || !checks.affectedFiles.pass) emit("OVERSIZE")
const oversizeExempt = checks.diffSize.exempt || checks.affectedFiles.exempt

/**
 * A pull request that cannot merge was never delivered, and until this check existed nothing here
 * looked: the header above promises that every check reads a GitHub artifact, and CI status was the
 * one artifact it never read. Measured on #685, which this file called DELIVERED twice while five
 * required-or-gating checks were red.
 *
 * The rollup mixes two node types with DIFFERENT fields, confirmed against a live response rather
 * than assumed: a `CheckRun` carries `status` plus `conclusion`, where `conclusion` is the EMPTY
 * STRING (not null) until it completes, and a `StatusContext` carries `state` alone and no status.
 * Reading only one shape silently ignores every check of the other kind.
 */
const FAILING_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"])
const FAILING_STATES = new Set(["FAILURE", "ERROR"])
const PENDING_STATES = new Set(["PENDING", "EXPECTED"])

const readRollup = () => {
  const viewed = run(GH, ["pr", "view", String(pullRequest.number), "--json", "statusCheckRollup"], githubCwd)
  if (!viewed.ok) fail(2, `gh pr view ${pullRequest.number} --json statusCheckRollup failed: ${viewed.error}`)
  let parsed
  try {
    parsed = JSON.parse(viewed.stdout)
  } catch {
    fail(2, `gh pr view ${pullRequest.number} returned unparseable JSON: ${viewed.stdout.trim().slice(0, 240) || "empty output"}`)
  }
  const rollup = parsed?.statusCheckRollup
  if (!Array.isArray(rollup)) fail(2, `gh pr view ${pullRequest.number} returned no statusCheckRollup array`)
  /**
   * A re-run does NOT replace the old entry: the rollup carries BOTH, so a re-run of a red check
   * reads as failing and pending at once and could never clear. Measured on #685, where a re-queued
   * `Dash Ban` appeared twice. Keep only the newest entry per check name, which is what the GitHub
   * UI shows and the only reading under which a re-run can go green.
   */
  const newestByName = new Map()
  for (const node of rollup) {
    const name = node.name ?? node.context ?? "unnamed check"
    const startedAt = node.startedAt ?? node.createdAt ?? ""
    const previous = newestByName.get(name)
    if (!previous || String(startedAt) >= String(previous.startedAt ?? previous.createdAt ?? "")) newestByName.set(name, node)
  }
  const failing = []
  const pending = []
  for (const [name, node] of newestByName) {
    if (node.__typename === "StatusContext" || typeof node.state === "string") {
      if (FAILING_STATES.has(node.state)) failing.push(name)
      else if (PENDING_STATES.has(node.state)) pending.push(name)
      continue
    }
    if (node.status !== "COMPLETED") {
      pending.push(name)
      continue
    }
    if (FAILING_CONCLUSIONS.has(node.conclusion)) failing.push(name)
  }
  return { total: newestByName.size, failing, pending }
}

// The same synchronous wait list-bot-threads.mjs uses, so the two tools poll the same way.
const sleep = (seconds) => {
  const buffer = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(buffer, 0, 0, seconds * 1000)
}

let rollup = readRollup()
const deadline = Date.now() + waitCiSeconds * 1000
while (rollup.failing.length === 0 && rollup.pending.length > 0 && Date.now() < deadline) {
  sleep(Math.min(30, Math.max(1, Math.ceil((deadline - Date.now()) / 1000))))
  rollup = readRollup()
}

checks.ci = {
  pass: rollup.failing.length === 0 && rollup.pending.length === 0,
  observed: `${rollup.total} checks: ${rollup.failing.length} failing, ${rollup.pending.length} pending`,
  failing: rollup.failing,
  pending: rollup.pending,
  waitedSeconds: waitCiSeconds,
}
if (rollup.failing.length > 0) emit("CI_FAILING")
if (rollup.pending.length > 0) emit("CI_PENDING")

emit(oversizeExempt ? "DELIVERED_OVERSIZE_EXEMPT" : "DELIVERED")
