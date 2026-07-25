#!/usr/bin/env node
/**
 * Launch one ticket's Orca worktree + TUI worker end to end, and be the single
 * place the four launch gotchas measured on 2026-07-24 (the ORB-75 Phase 7 run)
 * are handled: `orca worktree create` exits 1 without --name, a fresh checkout
 * blocks forever on Claude Code's workspace-trust prompt, Orca's
 * <gituser>/<name> branch is not the worker contract's feature/fix branch, and a
 * multi-line prompt pushed through `terminal send --text` submits early and
 * arrives mangled. Engine, model routing and repo paths come from
 * .claude/orchestrator.json. This script launches a worker; it never merges,
 * reviews, or moves a Linear issue.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

const USAGE = `usage: launch-worker.mjs --issue ORB-N --prompt-file <path> [options]

  --issue ORB-N          Linear issue whose worker to launch (required)
  --prompt-file <path>   the composed worker prompt: ticket body verbatim (D2) then the
                         finishing contract. MUST live outside every Orbit repo and outside
                         the worktree (an in-worktree prompt gets committed). Only its path
                         is sent to the TUI, never its text (required)
  --repo ui|api|landing  override the repo the ticket's repo:* label names
  --base-branch <ref>    base branch for the worktree (default: main)
  --branch-prefix <p>    contract branch prefix, feature or fix (default: feature)
  --comment "<text>"     worktree card comment (default: "<ORB-N> launched: worker running")
  --workspace-status <s> Orca board status id (default: in-progress)
  --dry-run              resolve everything and print the plan; run no orca or git command
  --help, -h             print this usage and exit 0

Prints one JSON object on stdout: issue, repo, repoPath, worktreePath, worktreeSelector,
branch, baseBranch, terminal, engine, command, promptFile, trustPromptAnswered, waitAttempts.
Progress goes to stderr, so stdout stays pipeable.

exit codes: 0 worker launched, 1 the worker never reached tui-idle, 2 usage or config error,
            3 an orca or git command failed`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

/** How long one tui-idle wait may block, and how many waits a launch gets before it fails. */
const WAIT_TIMEOUT_MS = 60000
const MAX_WAIT_ATTEMPTS = 6

/**
 * Claude Code's first-run workspace-trust gate, seen two ways: Orca reports it as a
 * blockedReason on the wait, and the TUI paints it as a numbered question. Either signal
 * answers it, because a blocked worker with nobody at the keyboard hangs forever.
 */
const TRUST_BLOCKED_REASON = /trust/i
const TRUST_ON_SCREEN = /(is this a project you created or one you trust|do you trust the files|trust this folder)/i

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    fail(3, `orca ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`)
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

/**
 * `orca terminal wait` reports "not yet" two different ways, and neither is a tool failure:
 * a condition it cannot meet in time exits 1 with ok:false and error.code timeout, while a
 * TUI gate such as the trust prompt exits 0 with satisfied:false and a blockedReason. Both
 * are normal polling outcomes, so read the payload rather than trusting the exit code.
 */
const waitForIdle = (handle) => {
  const result = spawnSync(
    ORCA,
    ["terminal", "wait", "--terminal", handle, "--for", "tui-idle", "--timeout-ms", String(WAIT_TIMEOUT_MS), "--json"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.error) fail(3, `orca terminal wait failed: ${result.error.message}`)
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    fail(3, `orca terminal wait returned unparseable output: ${(result.stdout || result.stderr || "").slice(0, 400)}`)
  }
  if (parsed.ok === false) {
    if (parsed.error?.code === "timeout") return { satisfied: false, status: "timeout" }
    fail(3, `orca terminal wait failed: ${parsed.error?.message ?? "unknown orca error"}`)
  }
  return parsed.result?.wait ?? {}
}

const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim()
  } catch (error) {
    fail(3, `git ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`)
  }
}

const issue = argOf("--issue")
const promptFileArg = argOf("--prompt-file")
const repoOverride = argOf("--repo")
const baseBranch = argOf("--base-branch") ?? "main"
const branchPrefix = argOf("--branch-prefix") ?? "feature"
const workspaceStatus = argOf("--workspace-status") ?? "in-progress"
const dryRun = process.argv.includes("--dry-run")

if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)
if (!promptFileArg) fail(2, `${USAGE}\n\n--prompt-file is required`)
if (branchPrefix !== "feature" && branchPrefix !== "fix") fail(2, "--branch-prefix must be feature or fix")

const promptFile = resolve(promptFileArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

const config = JSON.parse(readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8"))
const engineName = config.worker
const engine = config.workers?.[engineName]
if (!engine?.command) fail(2, `.claude/orchestrator.json names worker "${engineName}" but carries no command for it`)

const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
const isInside = (child, parent) => normalize(child) === normalize(parent) || normalize(child).startsWith(`${normalize(parent)}/`)

for (const [key, path] of Object.entries(config.repos)) {
  if (isInside(promptFile, path)) {
    fail(2, `prompt file lives inside the ${key} repo (${path}); it would be committed. Write it to the session scratchpad instead`)
  }
}

const detail = orca(["linear", "issue", issue])
const linearIssue = detail.issue ?? detail
const labels = (linearIssue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name))
const title = linearIssue.title ?? ""
if (!title) fail(3, `orca returned no title for ${issue}; cannot derive a branch slug`)

const repoKey = repoOverride ?? labels.find((label) => label.startsWith("repo:"))?.slice("repo:".length)
if (!repoKey) fail(2, `${issue} carries no repo:* label and no --repo was given`)
const repoPath = config.repos[repoKey]
if (!repoPath) fail(2, `no repo path for "${repoKey}" in .claude/orchestrator.json (known: ${Object.keys(config.repos).join(", ")})`)

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .split("-")
  .slice(0, 6)
  .join("-")
  .slice(0, 40)
  .replace(/-$/, "")
const worktreeName = `${issue.toLowerCase()}-${slug}`
const branch = `${branchPrefix}/${worktreeName}`
const comment = argOf("--comment") ?? `${issue} launched: worker running`

/** Model routing: a worker:sonnet ticket swaps the configured opus for sonnet, nothing else. */
const wantsSonnet = labels.includes("worker:sonnet")
const engineArgs = engine.args.map((arg, index) => (wantsSonnet && engine.args[index - 1] === "--model" && arg === "opus" ? "sonnet" : arg))
if (engineArgs.includes("-p") || engineArgs.includes("--print")) {
  fail(2, "the engine args carry -p/--print: a headless worker is invisible to Orca and cannot be babysat. Remove it from .claude/orchestrator.json")
}
const command = [engine.command, ...engineArgs].join(" ")

const plan = {
  issue,
  repo: repoKey,
  repoPath,
  worktreeName,
  branch,
  baseBranch,
  engine: engineName,
  command,
  promptFile,
  labels,
}

if (dryRun) {
  console.log(JSON.stringify({ ...plan, dryRun: true }, null, 2))
  process.exit(0)
}

console.error(`creating worktree ${worktreeName} in ${repoKey} from ${baseBranch}`)
const created = orca([
  "worktree", "create",
  "--repo", `path:${repoPath}`,
  "--name", worktreeName,
  "--base-branch", baseBranch,
  "--linear-issue", issue,
  "--no-parent",
  "--comment", comment,
])
const worktreePath = created.worktree?.path
if (!worktreePath) fail(3, `orca worktree create returned no path: ${JSON.stringify(created).slice(0, 400)}`)
const worktreeSelector = `path:${worktreePath}`

if (isInside(promptFile, worktreePath)) {
  fail(3, `prompt file lives inside the new worktree (${worktreePath}); remove the worktree and write the prompt to the session scratchpad`)
}

console.error(`switching ${worktreePath} onto the contract branch ${branch}`)
git(["-C", worktreePath, "switch", "-c", branch])
const actualBranch = git(["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"])
if (actualBranch !== branch) fail(3, `expected the worktree on ${branch}, found ${actualBranch}`)

console.error(`starting the ${engineName} TUI: ${command}`)
const terminal = orca(["terminal", "create", "--worktree", worktreeSelector, "--command", command]).terminal?.handle
if (!terminal) fail(3, "orca terminal create returned no handle")

let trustPromptAnswered = false
let waitAttempts = 0
let idle = false
while (waitAttempts < MAX_WAIT_ATTEMPTS && !idle) {
  waitAttempts += 1
  const wait = waitForIdle(terminal)
  const tail = (orca(["terminal", "read", "--terminal", terminal, "--limit", "60"]).terminal?.tail ?? []).join("\n")
  const trustBlocking = TRUST_BLOCKED_REASON.test(wait.blockedReason ?? "") || TRUST_ON_SCREEN.test(tail)
  if (trustBlocking) {
    console.error(`attempt ${waitAttempts}: workspace-trust prompt detected, answering it`)
    orca(["terminal", "send", "--terminal", terminal, "--text", "1", "--enter"])
    trustPromptAnswered = true
    continue
  }
  if (wait.satisfied) {
    idle = true
    break
  }
  console.error(`attempt ${waitAttempts}: not idle yet (${wait.blockedReason ?? wait.status ?? "unknown"})`)
}
if (!idle) {
  fail(1, `${terminal} never reached tui-idle after ${waitAttempts} waits; the worker is not running. Inspect it with: orca terminal read --terminal ${terminal}`)
}

const pointer = `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}: the ticket body verbatim, then the finishing contract. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now.`
console.error("sending the prompt pointer")
orca(["terminal", "send", "--terminal", terminal, "--text", pointer, "--enter"])
orca(["terminal", "switch", "--terminal", terminal])
orca(["worktree", "set", "--worktree", worktreeSelector, "--comment", comment, "--workspace-status", workspaceStatus])

console.log(
  JSON.stringify(
    { ...plan, worktreePath, worktreeSelector, terminal, trustPromptAnswered, waitAttempts },
    null,
    2,
  ),
)
