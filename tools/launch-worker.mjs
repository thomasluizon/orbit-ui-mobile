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
            3 an orca or git command failed

Any non-zero exit after the worktree exists stops its terminals and removes that worktree and
the branches this run created, so a relaunch starts clean instead of piling up orb-N-slug-2.
If orca still refuses to remove it (a wedged setup PTY), the exact removal command is printed
on stderr; run it before relaunching.`

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

/**
 * Everything created after `orca worktree create` succeeds has to come back out on any later
 * failure, or a failed launch leaves a full checkout, its terminals and an `npm install`
 * behind. Orca then de-duplicates the NAME on the next attempt (orb-N-slug-2) while the
 * contract branch survives, so `git switch -c` fails again and the retry the skill tells the
 * operator to run compounds the mess instead of clearing it. Measured on this branch.
 */
let rollback = null

const fail = (code, message) => {
  console.error(message)
  if (rollback) {
    const { selector, contractBranch, orcaBranch, repoPath: rollbackRepo } = rollback
    rollback = null
    console.error(`rolling back ${selector} so a relaunch starts clean`)
    /**
     * `orca worktree create` spawns its own startup PTYs (a shell, plus the repo's setup hook,
     * which is `npm install` here). `worktree rm --force` fails with "Failed to physically stop
     * every PTY" while one of those is still alive, so stop them first and give a slow one a
     * second chance before giving up. Measured on this branch: the first rollback attempt
     * failed exactly this way with npm install still running.
     */
    spawnSync(ORCA, ["terminal", "stop", "--worktree", selector, "--json"], { encoding: "utf8" })
    let removal = spawnSync(ORCA, ["worktree", "rm", "--worktree", selector, "--force", "--json"], { encoding: "utf8" })
    if (removal.status !== 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000)
      spawnSync(ORCA, ["terminal", "stop", "--worktree", selector, "--json"], { encoding: "utf8" })
      removal = spawnSync(ORCA, ["worktree", "rm", "--worktree", selector, "--force", "--json"], { encoding: "utf8" })
    }
    if (removal.status !== 0) {
      console.error(`could not remove the worktree: ${(removal.stdout || removal.stderr || "").trim().slice(0, 300)}`)
      console.error(`remove it by hand before relaunching: orca worktree rm --worktree ${selector} --force`)
    }
    for (const branchToDrop of [contractBranch, orcaBranch].filter(Boolean)) {
      const stillThere = spawnSync("git", ["-C", rollbackRepo, "rev-parse", "--verify", "--quiet", `refs/heads/${branchToDrop}`], { encoding: "utf8" })
      if (stillThere.status !== 0) continue
      const dropped = spawnSync("git", ["-C", rollbackRepo, "branch", "-D", branchToDrop], { encoding: "utf8" })
      if (dropped.status !== 0) console.error(`left the branch ${branchToDrop} behind: ${(dropped.stderr || "").trim().slice(0, 200)}`)
    }
  }
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

/** orca prints its `ok: false` payload on STDOUT and leaves stderr empty, so a failed call whose
 * reason is only read off stderr reports "Command failed" and nothing else. Read stdout first. */
const orcaFailureReason = (error) => {
  const payload = error.stdout?.toString() ?? ""
  try {
    const parsed = JSON.parse(payload)
    if (parsed.error?.message) return parsed.error.message
  } catch {
    if (payload.trim()) return payload.trim().slice(0, 400)
  }
  return error.stderr?.toString().trim() || error.message
}

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    fail(3, `orca ${args.join(" ")} failed: ${orcaFailureReason(error)}`)
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

let config
try {
  config = JSON.parse(readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8"))
} catch (error) {
  fail(2, `.claude/orchestrator.json could not be read as JSON: ${error.message}`)
}
const engineName = config.worker
const engine = config.workers?.[engineName]
if (!engine?.command) fail(2, `.claude/orchestrator.json names worker "${engineName}" but carries no command for it`)
if (!Array.isArray(engine.args)) fail(2, `.claude/orchestrator.json worker "${engineName}" carries no args array; give it one (use [] for none)`)
if (engine.interactive !== true) {
  fail(
    2,
    `.claude/orchestrator.json worker "${engineName}" does not declare interactive: true. Everything below this line assumes a supervisable TUI: the trust-prompt answer, the tui-idle poll, nudge-worker's busy refusal, worker-status' idle-then-check. A headless engine has none of that, so it launches unwatched and lands zero commits, zero gates and no PR. Declare the engine interactive only when its invocation really opens a TUI.`,
  )
}
if (!config.repos || typeof config.repos !== "object") {
  fail(2, ".claude/orchestrator.json carries no repos map; add one keyed by the repo:* label ids (ui, api, landing)")
}

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
const command = [engine.command, ...engineArgs].join(" ")

/**
 * Second level, for an entry that declares interactive: true while carrying a headless
 * invocation anyway. It scans the WHOLE invocation, command included: "command": "codex exec"
 * and "command": "claude --print" are the same headless launch as the same token sitting in
 * args, and a guard that only reads args is one field move from passing them. This is an
 * assertion on the known headless shapes, not a blocklist to extend flag by flag: the
 * interactive declaration above is the gate.
 */
const HEADLESS_TOKENS = ["-p", "--print", "exec"]
const headless = command.split(/\s+/).find((token) => HEADLESS_TOKENS.includes(token))
if (headless) {
  fail(2, `worker "${engineName}" declares interactive: true but its invocation "${command}" carries "${headless}", which is a headless invocation. Fix the command or args, or the declaration, in .claude/orchestrator.json`)
}

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
rollback = {
  selector: worktreeSelector,
  repoPath,
  orcaBranch: (created.worktree?.branch ?? "").replace(/^refs\/heads\//, "") || null,
  contractBranch: null,
}

if (isInside(promptFile, worktreePath)) {
  fail(3, `prompt file lives inside the new worktree (${worktreePath}); write the prompt to the session scratchpad instead`)
}

console.error(`switching ${worktreePath} onto the contract branch ${branch}`)
git(["-C", worktreePath, "switch", "-c", branch])
rollback.contractBranch = branch
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
rollback = null
orca(["terminal", "switch", "--terminal", terminal])
orca(["worktree", "set", "--worktree", worktreeSelector, "--comment", comment, "--workspace-status", workspaceStatus])

console.log(
  JSON.stringify(
    { ...plan, worktreePath, worktreeSelector, terminal, trustPromptAnswered, waitAttempts },
    null,
    2,
  ),
)
