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
 * 2. It measures diff size for review planning but never turns size into a delivery verdict.
 *    Correct migrations, generated artifacts, lockfiles and codemod output stay attached to the
 *    source change that requires them.
 */

import { statSync } from "node:fs"

import { githubEnvironment, redactSecrets } from "./lib/github-auth.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { assertRepositoryLabel, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { PASSING_CONCLUSIONS, findRegisteredCheck, newestChecks, pullRequestStateArgv, pullRequestStateFromGraphQl, requiredChecksOf } from "./lib/readiness-receipt.mjs"

const USAGE = `usage: verify-delivery.mjs --issue <ORB-N|#N|N> --worktree <path> --branch <name> [options]

  --issue <reference> ticket the worker was launched on (required)
  --worktree <path>   worktree the worker committed in (required)
  --branch <name>     branch the worker pushed (required)
  --repo <key>        repository key from .claude/orchestrator.json (required); GitHub is
                      queried with that repository's owner-scoped token
  --base <ref>        base the commit count is taken against (default: main)
  --wait-ci <s>       seconds to wait for still-running checks to settle before
                      reporting CI_PENDING (default: 0, report immediately)
  --command-timeout-seconds <s>
                      hard bound for each Git/GitHub child (default: 45)
  --help, -h          print this usage and exit 0

Derives delivery from git and GitHub artifacts only, never from a worker's own
report. Checks run in order and the first failure decides the verdict:
NO_COMMIT, DIRTY_TREE, UNPUSHED, NO_PR, STALE_PR, DRAFT, OUT_OF_DATE,
CI_FAILING, CI_PENDING, or DELIVERED.

stdout carries ONE JSON object and nothing else. Errors go to stderr.

exit codes: 0 DELIVERED, 1 every other verdict,
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
const knownFlags = new Set(["--issue", "--worktree", "--branch", "--repo", "--base", "--wait-ci", "--command-timeout-seconds", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issueArgument = argOf("--issue")
const worktree = argOf("--worktree")
const branch = argOf("--branch")
const repoKey = argOf("--repo")
const base = argOf("--base") ?? "main"
const waitCiRaw = argOf("--wait-ci") ?? "0"
const waitCiSeconds = Number(waitCiRaw)
if (!Number.isFinite(waitCiSeconds) || waitCiSeconds < 0) fail(2, `${USAGE}\n\n--wait-ci requires a non-negative number of seconds`)
const commandTimeoutSeconds = Number(argOf("--command-timeout-seconds") ?? "45")
if (!Number.isFinite(commandTimeoutSeconds) || commandTimeoutSeconds <= 0) fail(2, `${USAGE}\n\n--command-timeout-seconds requires a positive number`)
const safeValue = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("-")
if (!safeValue(issueArgument)) fail(2, `${USAGE}\n\n--issue requires ORB-N, #N, or N`)
if (!safeValue(worktree)) fail(2, `${USAGE}\n\n--worktree requires a path`)
if (!safeValue(branch)) fail(2, `${USAGE}\n\n--branch requires a branch name`)
if (!safeValue(base)) fail(2, `${USAGE}\n\n--base requires a ref`)
if (!safeValue(repoKey)) fail(2, `${USAGE}\n\n--repo requires a repository key`)

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

const githubCwd = config.repos?.[repoKey]
if (typeof githubCwd !== "string" || githubCwd.trim().length === 0) {
  fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ") || "none"})`)
}

let issue
try {
  const resolvedTicket = resolveTicket(issueArgument)
  /** Labels are the only field asserted here, so the board read is pure cost on the hottest path. */
  const liveTicket = await readTicket(resolvedTicket.number, { withProjectItem: false })
  assertRepositoryLabel(liveTicket, repoKey)
  issue = resolvedTicket.identifier ?? `#${resolvedTicket.number}`
} catch (error) {
  fail(2, `ticket assertion failed: ${error.message}`)
}

const GIT = process.env.GIT_BIN || "git"
const GH = process.env.GH_BIN || "gh"
let githubAuth
try {
  githubAuth = await githubEnvironment(githubCwd, { timeoutMs: commandTimeoutSeconds * 1000 })
} catch (error) {
  fail(2, redactSecrets(error.message))
}
const run = async (file, args, cwd, input) => {
  const result = await runBounded(file, args, { cwd, env: file === GH ? githubAuth.environment : process.env, timeoutMs: commandTimeoutSeconds * 1000, maxBuffer: 32 * 1024 * 1024, input })
  if (result.timedOut) return { ok: false, stdout: result.stdout, error: `${file} timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated` }
  if (result.overflowed) return { ok: false, stdout: result.stdout, error: `${file} exceeded the 32 MiB output bound; the complete child process tree was terminated` }
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
    return { ok: false, stdout: result.stdout, error: redactSecrets(detail.trim(), githubAuth.secrets) }
  }
  return { ok: true, stdout: result.stdout }
}
const git = (args) => run(GIT, ["-C", worktree, ...args])

const checks = {}
const emit = (verdict) => {
  console.log(JSON.stringify({ issue, verdict, checks }, null, 2))
  process.exit(verdict === "DELIVERED" ? 0 : 1)
}

/**
 * Residue a run may safely discard, against work it may not. Generated files and evidence a worker
 * should never have produced are one situation; a tracked source file left mid-edit is another, and
 * only the second is somebody's unfinished thinking. Measured on ORB-39: `M apps/web/next-env.d.ts`
 * plus `?? apps/web/e2e/orb-39-evidence.spec.ts`, both discardable, so the finished commit
 * underneath was recoverable without a human opening the worktree.
 */
const GENERATED_RESIDUE = [/(^|\/)next-env\.d\.ts$/, /(^|\/)\.next\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)coverage\//, /(^|\/)node_modules\//, /\.tsbuildinfo$/, /(^|\/)test-results\//, /(^|\/)playwright-report\//]
/**
 * Discardable only while UNTRACKED. The repository has a tracked E2E suite, and a path-only rule
 * called a modified or deleted file under `e2e/` residue, which step 7 then permits the run to throw
 * away. A worker's invented evidence file is untracked (`??`); an edit to the real suite is not.
 */
const UNTRACKED_ONLY_RESIDUE = [/(^|\/)e2e\//, /(^|\/)\.orca\//]
const isDiscardable = ({ status, path }) =>
  GENERATED_RESIDUE.some((pattern) => pattern.test(path)) || (status === "??" && UNTRACKED_ONLY_RESIDUE.some((pattern) => pattern.test(path)))

/** `--untracked-files=all` because the default collapses a wholly untracked directory into one
 * entry, and a single `?? apps/` cannot be classified as residue or as somebody's unfinished work. */
const tree = await git(["status", "--porcelain", "--untracked-files=all"])
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
const counted = await git(["rev-list", "--count", `${base}..HEAD`])
if (!counted.ok) fail(2, `git rev-list --count ${base}..HEAD failed in ${worktree}: ${counted.error}`)
const commits = Number(counted.stdout.trim())
checks.hasCommits = { pass: Number.isInteger(commits) && commits >= 1, observed: commits }
if (checks.hasCommits.pass) {
  const described = await git(["log", "-1", "--format=%h %s"])
  const stat = await git(["show", "--stat", "--format=", "HEAD"])
  checks.hasCommits.head = described.ok ? described.stdout.trim() : null
  checks.hasCommits.headStat = stat.ok ? stat.stdout.trim() : null
}
if (!checks.hasCommits.pass) emit("NO_COMMIT")
if (!checks.cleanTree.pass) emit("DIRTY_TREE")

// A missing origin/<branch> is not an environment error: never having been pushed is what UNPUSHED means.
const ahead = await git(["rev-list", `origin/${branch}..HEAD`, "--count"])
const localOnly = ahead.ok ? Number(ahead.stdout.trim()) : `origin/${branch} does not exist`
checks.pushed = { pass: localOnly === 0, observed: localOnly }
if (!checks.pushed.pass) emit("UNPUSHED")

const listed = await run(GH, ["pr", "list", "--head", branch, "--json", "number,url,headRefOid,additions,deletions,title,body,changedFiles"], githubCwd)
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
const escapedIssue = issue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const mentionsIssue = (text) => typeof text === "string" && new RegExp(`(^|[^A-Za-z0-9])${escapedIssue}(?![A-Za-z0-9])`, "i").test(text)
checks.linksTicket = {
  pass: mentionsIssue(pullRequest.title) || mentionsIssue(pullRequest.body),
  observed: mentionsIssue(pullRequest.title) ? "title" : mentionsIssue(pullRequest.body) ? "body" : "neither title nor body names the issue",
}
if (!checks.linksTicket.pass) emit("UNLINKED_PR")

const head = await git(["rev-parse", "HEAD"])
if (!head.ok) fail(2, `git rev-parse HEAD failed in ${worktree}: ${head.error}`)
const localHead = head.stdout.trim()
checks.prHeadMatches = { pass: pullRequest.headRefOid === localHead, observed: pullRequest.headRefOid ?? null, local: localHead }
if (!checks.prHeadMatches.pass) emit("STALE_PR")

if (!Number.isInteger(pullRequest.additions) || !Number.isInteger(pullRequest.deletions)) {
  fail(2, `gh pr list reported no numeric additions and deletions for pull request #${pullRequest.number}`)
}
/** Size remains visible review information. It never changes the verdict. */
if (!Number.isInteger(pullRequest.changedFiles)) {
  fail(2, `gh pr list reported no numeric changedFiles for pull request #${pullRequest.number}`)
}
const size = pullRequest.additions + pullRequest.deletions
const fileCount = pullRequest.changedFiles

checks.sizeAdvisory = { changedFiles: fileCount, additions: pullRequest.additions, deletions: pullRequest.deletions, diffLines: size, blocking: false }

const repositoryFromUrl = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+\/?$/i.exec(pullRequest.url)?.[1]
if (!repositoryFromUrl) fail(2, `pull request #${pullRequest.number} carried no parseable GitHub URL`)

/**
 * One GraphQL request, exactly what `gh pr view --json statusCheckRollup` sent, plus the producing
 * app of every check. Branch protection pins a required check to an app, so a rollup read that
 * drops the producer cannot tell the required check from a same-named one somebody else published.
 * PULL_REQUEST_STATE_QUERY carries the measurement behind the swap.
 */
const readPullRequestState = async () => {
  const viewed = await run(GH, pullRequestStateArgv(repositoryFromUrl, pullRequest.number), githubCwd)
  if (!viewed.ok) fail(2, `the pull request read for ${pullRequest.number} failed: ${viewed.error}`)
  let parsed
  try {
    parsed = JSON.parse(viewed.stdout)
  } catch {
    fail(2, `the pull request read for ${pullRequest.number} returned unparseable JSON: ${viewed.stdout.trim().slice(0, 240) || "empty output"}`)
  }
  const state = pullRequestStateFromGraphQl(parsed)
  if (state === null) fail(2, `the pull request read for ${pullRequest.number} returned incomplete base/head/draft/rollup state`)
  return state
}

const validatePullRequestState = async (state) => {
  checks.pullRequestState = {
    baseBranch: state.baseRefName,
    baseSha: state.baseRefOid,
    headSha: state.headRefOid,
    draft: state.isDraft,
  }
  if (state.headRefOid !== localHead) emit("STALE_PR")
  if (state.isDraft) emit("DRAFT")

  const compared = await run(GH, ["api", `repos/${repositoryFromUrl}/compare/${encodeURIComponent(state.baseRefName)}...${state.headRefOid}`], githubCwd)
  if (!compared.ok) fail(2, `gh api compare failed for pull request #${pullRequest.number}: ${compared.error}`)
  let comparison
  try {
    comparison = JSON.parse(compared.stdout)
  } catch {
    fail(2, `gh api compare returned unparseable JSON: ${compared.stdout.trim().slice(0, 240) || "empty output"}`)
  }
  if (!Number.isInteger(comparison?.behind_by)) fail(2, `gh api compare reported no numeric behind_by for pull request #${pullRequest.number}`)
  checks.upToDate = {
    pass: comparison.behind_by === 0,
    baseSha: state.baseRefOid,
    headSha: state.headRefOid,
    behindBy: comparison.behind_by,
  }
  if (!checks.upToDate.pass) emit("OUT_OF_DATE")
}

let pullRequestState = await readPullRequestState()
await validatePullRequestState(pullRequestState)

const readRequiredChecks = async (state) => {
  const protection = await run(
    GH,
    ["api", `repos/${repositoryFromUrl}/branches/${encodeURIComponent(state.baseRefName)}/protection/required_status_checks`],
    githubCwd,
  )
  if (!protection.ok) fail(2, `gh api required status checks failed for ${state.baseRefName}: ${protection.error}`)
  let parsed
  try {
    parsed = JSON.parse(protection.stdout)
  } catch {
    fail(2, `gh api required status checks returned unparseable JSON: ${protection.stdout.trim().slice(0, 240) || "empty output"}`)
  }
  const parsedChecks = requiredChecksOf(parsed)
  if (parsedChecks === null) fail(2, `gh api required status checks returned no { context, app_id } checks array for ${state.baseRefName}`)
  return parsedChecks
}
let requiredChecks = await readRequiredChecks(pullRequestState)

/**
 * A pull request that cannot merge was never delivered, and until this check existed nothing here
 * looked: the header above promises that every check reads a GitHub artifact, and CI status was the
 * one artifact it never read. Measured on #685, which this file called DELIVERED twice while five
 * required-or-gating checks were red.
 *
 * The rollup mixes two node types with DIFFERENT fields, confirmed against a live response rather
 * than assumed: a `CheckRun` carries `status` plus `conclusion`, and a `StatusContext` carries
 * `state` alone and no status. Reading only one shape silently ignores every check of the other
 * kind. lib/readiness-receipt.mjs normalises both into one node shape carrying the producing app.
 *
 * The three buckets below are the exact complement of the pass rule readinessCiIsGreen applies,
 * and the matching of a required check is the library's own, so this reading of CI and the
 * receipt's reading cannot disagree. They were burned once by disagreeing.
 */
const FAILING_STATES = new Set(["FAILURE", "ERROR"])
const PENDING_STATES = new Set(["PENDING", "EXPECTED"])

const checkMetadata = (name, node) => {
  const identity = typeof node.detailsUrl === "string" ? /\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/.exec(node.detailsUrl) : null
  return {
    runId: identity?.[1] ?? null,
    jobId: identity?.[2] ?? null,
    detailsUrl: node.detailsUrl ?? node.targetUrl ?? null,
    workflow: node.workflowName ?? null,
    name,
    status: node.status ?? node.state ?? null,
    conclusion: node.conclusion ?? node.state ?? null,
    /** The app that published the check, so a wrong-producer check is named rather than merely
     * counted. Null on a StatusContext, which carries no producing app. */
    appId: node.appId ?? null,
  }
}

const readRollup = () => {
  /**
   * A re-run does NOT replace the old entry: the rollup carries BOTH, so a re-run of a red check
   * reads as failing and pending at once and could never clear. Measured on #685, where a re-queued
   * `Dash Ban` appeared twice. `newestChecks` keeps only the newest entry per check and producer,
   * which is what the GitHub UI shows and the only reading under which a re-run can go green.
   */
  // Never null here: readPullRequestState rejects any rollup entry that carries no check name.
  const newestByCheck = newestChecks(pullRequestState.statusCheckRollup)
  const failing = []
  const pending = []
  /**
   * A required check the rollup does not carry UNDER ITS PINNED PRODUCER is pending, never green.
   * That absence is the mechanism by which a missing `pullfrog-approval` blocks, and it is now also
   * the mechanism by which a same-named success from another app fails to clear the review gate.
   */
  for (const required of requiredChecks) {
    if (findRegisteredCheck(newestByCheck, required)) continue
    pending.push({ ...checkMetadata(required.context, { status: "NOT_REGISTERED", conclusion: null }), requiredAppId: required.appId })
  }
  for (const node of newestByCheck.values()) {
    const name = node.name ?? node.context
    if (node.__typename === "StatusContext" || typeof node.state === "string") {
      if (FAILING_STATES.has(node.state)) failing.push(checkMetadata(name, node))
      else if (PENDING_STATES.has(node.state)) pending.push(checkMetadata(name, node))
      else if (node.state !== "SUCCESS") failing.push(checkMetadata(name, node))
      continue
    }
    if (node.status !== "COMPLETED") {
      pending.push(checkMetadata(name, node))
      continue
    }
    if (!PASSING_CONCLUSIONS.has(node.conclusion)) failing.push(checkMetadata(name, node))
  }
  return { total: newestByCheck.size, failing, pending }
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
  pullRequestState = await readPullRequestState()
  await validatePullRequestState(pullRequestState)
  requiredChecks = await readRequiredChecks(pullRequestState)
  rollup = readRollup()
}

checks.ci = {
  pass: rollup.failing.length === 0 && rollup.pending.length === 0,
  observed: `${rollup.total} checks: ${rollup.failing.length} failing, ${rollup.pending.length} pending`,
  failing: rollup.failing,
  pending: rollup.pending,
  requiredChecks,
  waitedSeconds: waitCiSeconds,
}
if (rollup.failing.length > 0) emit("CI_FAILING")
if (rollup.pending.length > 0) emit("CI_PENDING")

emit("DELIVERED")
