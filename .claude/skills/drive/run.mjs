#!/usr/bin/env node
/**
 * drive engine: run a queue of bundles/tasks, one FRESH `claude -p` per task.
 *
 * Two modes (one engine):
 *  - ATTENDED (`--attended`, the default `/drive` path): readline gates — approve each bundle
 *    before it runs, review its PR after. The human is the verifier, so the auto-verifier
 *    is off. No `/clear` ever: each bundle is a fresh headless process, so context never accrues.
 *  - UNATTENDED (`--sleep`, no `--attended`): the proven overnight queue-drain, UNCHANGED — no
 *    gates, an independent Sonnet verifier grades each PR. This is the old `/night-run`.
 *
 * Per-task model tier: each queue entry may carry `tier` ("sonnet"|"opus") and `effort`
 * ("high"|"xhigh"); the driver routes the fresh `claude -p` to that model/effort (falling back to
 * the global config.model). This is the scriptable half of per-issue routing.
 *
 * Why a Node driver (not a live Claude session, not a bash script):
 *  - A live Claude-session driver taints children with CLAUDECODE / CLAUDE_CODE_ENTRYPOINT,
 *    which makes ~50% of nested `claude -p` runs hang on startup (anthropics/claude-code#26190).
 *    This driver strips those vars before every child spawn, so children never inherit the taint.
 *  - `spawnSync('claude', argsArray, { shell: false })` passes arguments without shell quoting,
 *    which avoids the PowerShell/.cmd quoting footguns; the prompt goes over stdin so it has no
 *    length limit. Verified on this machine: `claude --version` returns 0 under shell:false.
 *  - Each `claude -p` invocation starts a clean context window (no parent history), which is the
 *    whole point: fresh context per task defeats the context-rot that a single long session hits.
 *
 * Safety model (see README.md): the child runs WITHOUT `--bare`, so it inherits the project
 * PreToolUse hooks (git-guardrails blocks any push to main, force-push, --no-verify). Each task
 * works on its own branch off an up-to-date base and ends at a PR opened READY FOR REVIEW
 * (never a draft - SKILL.md's contract, so CI and the review bots run on it). The driver never
 * merges and returns every repo to its base branch between tasks.
 *
 * A bundle that carries `workOrders` is additionally measured by the DRIVER after its child
 * exits: `workorder --check --id` per order, and one `check-diff-ownership` run over the whole
 * bundle's diff against the base sha the driver recorded when the bundle started. Before this,
 * the only caller of either tool was a sentence in the child's own prompt - an instruction a
 * model may skip is advisory, not enforcement, and a repo-wide grep found zero deterministic
 * callers anywhere (no CI, no git hook, no settings). The verdicts ride into the task record,
 * the run log and the verifier prompt, and a child that claims ready-for-review against a
 * failing verdict is overridden to failed: the measurement wins over the claim.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { pathToFileURL } from "node:url"

const DEFAULTS = {
  model: "opus",
  fallbackModel: "sonnet",
  modelOverride: null,
  permissionMode: "bypassPermissions",
  perTaskTimeoutMs: 60 * 60 * 1000,
  maxConsecutiveFailures: 2,
  allowedTools: [],
  disallowedTools: ["Bash(rm -rf *)", "Bash(git reset --hard*)", "Bash(git push --force*)"],
  addDirs: [],
  baseBranch: "main",
  push: true,
  repos: [{ path: ".", base: "main" }],
  verify: true,
  verifyModel: "sonnet",
  verifyTimeoutMs: 20 * 60 * 1000,
  verifyAllowedTools: ["Read", "Grep", "Glob", "Bash(gh pr diff:*)", "Bash(gh pr view:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)"],
}

// A child can return only what its generated prompt offers: "ready-for-review"
// (the machine-checkable conditions hold: violations cleared, diff inside its
// owned files, Timeline appended), "blocked" (a verifiable outcome worth
// grading, not a failure), or "failed". "done" is deliberately NOT a child
// status: completion is granted only by a human tick in signoff.json, which no
// child can write - yet the engine recorded a child-returned "done" verbatim,
// and the operator rollup then printed "done (human-granted)" for work no
// human had granted. normalizeChildStatus is the enforcement point; the two
// sets below are what the driver acts on afterwards.
const CHILD_STATUSES = new Set(["ready-for-review", "blocked", "failed"])
// Statuses worth grading: the verifier runs on these when a PR exists.
const SUCCESS_STATUSES = new Set(["ready-for-review", "blocked"])
// The subset that CLAIMS the work is complete enough to review, which a
// failing driver-measured gate overrides.
const COMPLETED_STATUSES = new Set(["ready-for-review"])

/**
 * Child-returned statuses pass through only when they are in the offered enum.
 * "done" demotes to ready-for-review with the claim recorded: only a human
 * signoff.json tick grants done, so the rollup must never launder a child's
 * claim into "done (human-granted)". Anything else is a reporting failure.
 * Exported so the demotion is pinned by tests without spawning a child.
 */
export function normalizeChildStatus(status) {
  if (CHILD_STATUSES.has(status)) return { status }
  if (status === "done")
    return {
      status: "ready-for-review",
      claimedStatus: "done",
      note: 'child claimed "done", which only a human signoff.json tick can grant - recorded as ready-for-review',
    }
  return { status: "unknown", claimedStatus: status, note: `child returned unrecognized status "${status}"` }
}

const TAINTED_ENV = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY",
]

function parseArgs(argv) {
  const out = { dir: ".claude/drive", dryRun: false, attended: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) out.dir = argv[++i]
    else if (argv[i] === "--dry-run") out.dryRun = true
    else if (argv[i] === "--attended") out.attended = true
  }
  return out
}

/** Per-task tier routing: `config.modelOverride` (A/B: force every bundle to one model) wins; else map a queue entry's `tier` to a model, falling back to the global model. */
const TIER_MODEL = { sonnet: "sonnet", opus: "opus" }
function resolveModel(task, config) {
  if (config.modelOverride) return config.modelOverride
  return TIER_MODEL[task?.tier] || config.model
}
function resolveEffort(task) {
  const e = task?.effort
  return e === "high" || e === "xhigh" || e === "medium" || e === "low" ? e : null
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function childEnv() {
  const env = { ...process.env }
  for (const key of TAINTED_ENV) delete env[key]
  return env
}

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" })
}

function isClean(repoPath) {
  const r = git(repoPath, ["status", "--porcelain"])
  return r.status === 0 && r.stdout.trim() === ""
}

function currentBranch(repoPath) {
  return git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim()
}

/** Return each repo to its base branch, stashing (never discarding) any leftover changes, labelled with the bundle that produced them. */
function resetReposToBase(repos, log, label = "unattributed") {
  for (const repo of repos) {
    const repoPath = resolve(repo.path)
    if (!isClean(repoPath)) {
      git(repoPath, ["stash", "push", "-u", "-m", `drive leftovers [${label}] ${stamp()}`])
      const ref = git(repoPath, ["rev-parse", "stash@{0}"]).stdout.trim()
      log(`  stashed leftover changes from [${label}] in ${repo.path} -> ${ref || "stash@{0}"} (git stash list)`)
    }
    if (currentBranch(repoPath) !== repo.base) git(repoPath, ["checkout", repo.base])
    git(repoPath, ["pull", "--ff-only"])
  }
}

/**
 * Two drive runs against one checkout is the top operational risk in this repo:
 * children share the working tree, and `resetReposToBase` stashes and checks out
 * on every repo, so the second run silently rips the tree out from under the
 * first. preflight's clean-tree check is a check-then-act race, not a lock -
 * both runs pass it, then fight. Observed for real: a concurrent session landed
 * 9 commits into this tree mid-session while another was reading it.
 *
 * A stale lock whose pid is gone is reclaimed; a live one aborts.
 */
function acquireRunLock(dir, log) {
  const lockPath = join(dir, "RUNNING")
  if (existsSync(lockPath)) {
    let holder = null
    try {
      holder = JSON.parse(readFileSync(lockPath, "utf8"))
    } catch {
      holder = null
    }
    if (holder?.pid && processIsAlive(holder.pid)) {
      log(`ANOTHER DRIVE RUN IS ACTIVE: pid ${holder.pid}, started ${holder.startedAt}, branch ${holder.branch}.`)
      log(`Two runs share this working tree and will corrupt each other. Stop that run, or delete ${lockPath} if you know it is dead.`)
      return null
    }
    log(`Reclaiming a stale drive lock (pid ${holder?.pid ?? "unknown"} is not running).`)
  }
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" })
  writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), branch: branch.stdout?.trim() || "unknown" }, null, 2),
  )
  return lockPath
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

/**
 * The token drive-queue prints into condition (b)'s `--base`, because only the
 * driver knows the child's true fork point at spawn time. Unpinned, the gate's
 * own base resolution lands on a merge-base that predates every work order in
 * this deployment (exit 2 for honest work - measured), and a child improvising
 * `--base HEAD` after committing measures an empty diff, a vacuous green.
 */
export const DRIVE_BASE_PLACEHOLDER = "{{DRIVE_BASE}}"

/**
 * Fill every occurrence of the placeholder with the driver-recorded base sha.
 * Fails closed instead of spawning: a pinned prompt with no sha to pin it to,
 * a non-sha value, or (belt on braces) any occurrence left after substitution
 * is a `problem` the caller records as a task FAILURE before spawn - a child
 * must never receive a prompt whose definition of done still carries the token
 * or, worse, carries a base the driver never recorded.
 */
export function substituteDriveBase(promptText, baseSha) {
  if (!promptText.includes(DRIVE_BASE_PLACEHOLDER)) return { text: promptText }
  if (!baseSha || !/^[0-9a-f]{7,40}$/i.test(baseSha)) {
    return {
      problem: `the prompt pins its ownership gate to ${DRIVE_BASE_PLACEHOLDER} but the driver has no commit sha to fill it with (got "${baseSha || ""}")`,
    }
  }
  const text = promptText.split(DRIVE_BASE_PLACEHOLDER).join(baseSha)
  if (text.includes(DRIVE_BASE_PLACEHOLDER)) {
    return { problem: `substitution left ${DRIVE_BASE_PLACEHOLDER} in the prompt - refusing to spawn with an unpinned gate` }
  }
  return { text }
}

/**
 * A workOrders bundle whose prompt never pins its base would hand the child an
 * ownership gate that exits 2 for honest work (or a gameable improvised base),
 * so the gap is a preflight ERROR naming the entry, not a runtime surprise.
 * Exported so the check is testable against a fixture dir without spawning the
 * engine, like queuePromptProblems below.
 */
export function queueBasePinProblems(queue, dir) {
  const problems = []
  for (const task of queue) {
    if (!Array.isArray(task.workOrders) || !task.workOrders.length) continue
    const promptPath = join(dir, "prompts", `task-${task.id}.md`)
    const promptText = existsSync(promptPath)
      ? readFileSync(promptPath, "utf8")
      : typeof task.prompt === "string"
        ? task.prompt
        : ""
    if (!promptText.includes(DRIVE_BASE_PLACEHOLDER)) {
      problems.push(
        `task "${task.id}" carries workOrders but its prompt never pins ${DRIVE_BASE_PLACEHOLDER}: its ownership gate would resolve a base of its own and exit 2 for honest work. Regenerate with tools/drive-queue.mjs.`,
      )
    }
  }
  return problems
}

/**
 * A queue entry with no prompt used to surface at RUNTIME as a quiet "skipped",
 * which buried an entire hand-written queue: the documented fallback entry shape
 * carried no prompt field, `--dry-run` said "Preflight passed", and the run then
 * skipped 100% of its bundles. The prompt IS the task, so its absence is a
 * preflight ERROR that names the entry. Exported so the check is testable
 * against a fixture dir without spawning the engine.
 */
export function queuePromptProblems(queue, dir) {
  const problems = []
  for (const task of queue) {
    const promptPath = join(dir, "prompts", `task-${task.id}.md`)
    const hasInline = typeof task.prompt === "string" && task.prompt.trim() !== ""
    if (!existsSync(promptPath) && !hasInline) {
      problems.push(`task "${task.id}" has no prompt: neither ${promptPath} nor a non-empty "prompt" field. Generate it with tools/drive-queue.mjs, or add a prompt to the entry.`)
    }
  }
  return problems
}

function preflight(config, repos, queue, dir) {
  const problems = []
  const version = spawnSync("claude", ["--version"], { encoding: "utf8", env: childEnv() })
  if (version.status !== 0) problems.push("`claude` CLI is not runnable on PATH.")
  if (config.push) {
    const auth = spawnSync("gh", ["auth", "status"], { encoding: "utf8" })
    if (auth.status !== 0) problems.push("`gh` is not authenticated (needed to open PRs). Run `gh auth login`.")
  }
  for (const repo of repos) {
    const repoPath = resolve(repo.path)
    if (!existsSync(join(repoPath, ".git")) && git(repoPath, ["rev-parse", "--git-dir"]).status !== 0) {
      problems.push(`${repo.path} is not a git repository.`)
      continue
    }
    if (!isClean(repoPath)) problems.push(`${repo.path} has uncommitted changes. Commit or stash before starting.`)
    // The run's first act is resetReposToBase: checkout base + pull. Launched
    // from the wrong branch, that reset silently swaps the tree for a base that
    // may contain none of the work orders or gate tools the queue depends on
    // (measured: origin/main carries zero .claude/workorders/ files). SKILL.md
    // documented this check long before it existed; now it exists.
    const branch = currentBranch(repoPath)
    if (branch !== repo.base) {
      problems.push(`${repo.path} is on branch "${branch}" but its configured base is "${repo.base}". The run resets each repo to its base before bundle 1, so start from ${repo.base} (or point config.repos[].base at the branch that carries the queue's work orders).`)
    }
  }
  problems.push(...queuePromptProblems(queue, dir))
  problems.push(...queueBasePinProblems(queue, dir))
  return problems
}

/** Pull the last balanced {...} JSON object carrying `requiredKey` out of a child's final message. */
function parseJsonLine(resultText, requiredKey) {
  const candidates = [...String(resultText).matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]).reverse()
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed[requiredKey] === "string") return parsed
    } catch {
      continue
    }
  }
  return null
}

function buildClaudeArgs(config, task) {
  const model = resolveModel(task, config)
  const effort = resolveEffort(task)
  const args = ["-p", "--output-format", "json", "--model", model, "--permission-mode", config.permissionMode]
  if (effort) args.push("--effort", effort)
  if (config.fallbackModel) args.push("--fallback-model", config.fallbackModel)
  if (config.allowedTools?.length) args.push("--allowedTools", config.allowedTools.join(" "))
  if (config.disallowedTools?.length) args.push("--disallowedTools", config.disallowedTools.join(" "))
  for (const dir of config.addDirs || []) args.push("--add-dir", resolve(dir))
  return args
}

/** Head sha + open PR url for a repo, sampled before and after a child so a task's outcome can be read from what it DID, not from what it said. */
function repoSideEffects(repoPath) {
  const head = git(repoPath, ["rev-parse", "HEAD"]).stdout.trim()
  const branch = currentBranch(repoPath)
  const pr = spawnSync("gh", ["pr", "list", "--head", branch, "--state", "open", "--limit", "1", "--json", "url", "--jq", ".[0].url"], {
    cwd: repoPath,
    encoding: "utf8",
  })
  return { head, branch, pr: (pr.stdout || "").trim() || null }
}

function gateOutputTail(run) {
  return `${run.stdout || ""}${run.stderr ? `\n${run.stderr}` : ""}`.trim().slice(-600)
}

/**
 * The BASE ref's copy of a gate tool, extracted to a temp file the child never
 * touched. The driver used to execute tools/check-diff-ownership.mjs from the
 * child's own working checkout - the exact tree the child just committed to -
 * while framing the verdicts as "measurements, not claims". forbid-gate-tamper
 * does not protect the gate tools, so a child stubbing the tool to `exit 0`
 * would have measured a fabricated green. The base sha is driver-recorded, so
 * no child report can move it; check-diff-ownership.mjs imports node builtins
 * only, so the single extracted file runs from anywhere, pointed at the judged
 * tree via ORBIT_SURFACE_ROOT. Returns { path, dir } or { problem }; the
 * caller records a problem as a FAILING check - an unextractable pristine gate
 * is never a fallback to the working-tree copy.
 */
export function extractBaseGateTool(repoPath, baseSha, toolRelPath) {
  if (!baseSha) return { problem: "no driver-recorded base sha to extract the pristine gate from" }
  const shown = spawnSync("git", ["show", `${baseSha}:${toolRelPath}`], { cwd: repoPath, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  if (shown.status !== 0 || !shown.stdout) {
    return { problem: `git show ${String(baseSha).slice(0, 12)}:${toolRelPath} failed - the gate tool does not exist at the recorded base` }
  }
  const dir = mkdtempSync(join(tmpdir(), "drive-pristine-gate-"))
  const path = join(dir, basename(toolRelPath))
  writeFileSync(path, shown.stdout)
  return { path, dir }
}

/**
 * The deterministic gates, run by the driver itself against what the child left
 * behind. `workorder --check --id` answers per order (each order's own debt is
 * its own verdict); `check-diff-ownership` runs ONCE with every id in the
 * bundle, because the diff is bundle-wide and a per-order run would read the
 * sibling orders' legitimate files as escapes. The base is the sha the driver
 * recorded after resetting the repo, not anything the child reported.
 *
 * Two-step trust chain, in this order:
 *  1. check-diff-ownership runs from the BASE ref's copy (extractBaseGateTool),
 *     never the child-writable working tree. Its exit 0 proves tools/ and the
 *     hooks are untouched, because the gate tools are GATE_STATE inside it and
 *     any edit to them fails this very step.
 *  2. Only then is running the WORKING TREE's workorder.mjs sound: step 1 just
 *     proved it byte-identical to the base copy. It cannot be base-extracted
 *     itself - it imports sibling tool modules and node_modules - which is why
 *     the self-contained ownership gate goes first.
 *
 * A PLAN bundle gets no workorder --check verdict at all, and that is honesty,
 * not leniency: --from-plan refuses any file a surface or residual group owns,
 * and every file carrying lint debt is owned by one of those two, so a plan
 * order's debt is 0 before the child starts and can never fail. Recording it
 * put a tautology in front of the verifier under the banner "measurements, not
 * claims - weigh them over anything the implementer says". A plan bundle's real
 * machine check is its lint/type-check/test run, which the child owns; the
 * ownership gate above still applies to it in full.
 *
 * Exported so the ordering and the pristine-copy selection are pinned by tests
 * against a fixture repo, without spawning the engine.
 */
export function measureGates(task, config, baseSha) {
  const repoPath = resolve(config.repos[0].path)
  const checks = []
  const idFlags = task.workOrders.flatMap((id) => ["--id", id])
  const idLabel = task.workOrders.map((id) => `--id ${id}`).join(" ")
  const pristine = extractBaseGateTool(repoPath, baseSha, "tools/check-diff-ownership.mjs")
  if (pristine.problem) {
    checks.push({ command: `check-diff-ownership (base-ref copy) ${idLabel}`, exit: 2, tail: `failed closed: ${pristine.problem}` })
  } else {
    const ownership = spawnSync(process.execPath, [pristine.path, ...idFlags, "--base", baseSha], {
      cwd: repoPath,
      env: { ...process.env, ORBIT_SURFACE_ROOT: repoPath },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
    checks.push({
      command: `check-diff-ownership (base-ref copy) ${idLabel} --base ${baseSha.slice(0, 12)}`,
      exit: ownership.status,
      tail: gateOutputTail(ownership),
    })
    try {
      rmSync(pristine.dir, { recursive: true, force: true })
    } catch {
      /* temp cleanup is housekeeping; it must never move a gate verdict */
    }
  }
  // The trust chain is only sound in sequence: step 1's exit 0 is what proves
  // the working tree's generator is byte-identical to the base copy (tools/ is
  // GATE_STATE inside the ownership gate). When step 1 does NOT pass, running
  // the working-tree generator anyway recorded a stubbed generator's fabricated
  // exit 0 next to the failure - and run.mjs embeds both in the verifier prompt
  // as "measurements, not claims". A gate that cannot be trusted is not run.
  if (checks[0].exit !== 0) return checks
  if (task.kind === "plan") return checks
  for (const id of task.workOrders) {
    const check = spawnSync(process.execPath, [join(repoPath, "tools", "workorder.mjs"), "--check", "--id", id], {
      cwd: repoPath,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
    checks.push({ command: `workorder --check --id ${id}`, exit: check.status, tail: gateOutputTail(check) })
  }
  return checks
}

function runTask(task, config, promptText, log) {
  const started = Date.now()
  const model = resolveModel(task, config)
  const repoPath = resolve(config.repos[0].path)
  const before = repoSideEffects(repoPath)
  const run = spawnSync("claude", buildClaudeArgs(config, task), {
    input: promptText,
    cwd: resolve(config.repos[0].path),
    env: childEnv(),
    encoding: "utf8",
    timeout: config.perTaskTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  })
  const elapsedMs = Date.now() - started

  if (run.error) {
    const reason = run.error.code === "ETIMEDOUT" ? "timed out" : `spawn failed (${run.error.code})`
    return { status: "failed", model, pr: null, summary: reason, elapsedMs, raw: String(run.stderr || "").slice(-500) }
  }

  const outer = (() => {
    try {
      return JSON.parse(run.stdout)
    } catch {
      return null
    }
  })()
  const resultText = outer?.result ?? run.stdout ?? ""
  if (!outer || outer.is_error) {
    return { status: "failed", model, pr: null, summary: "child reported an error", elapsedMs, raw: String(resultText).slice(-500) }
  }

  const line = parseJsonLine(resultText, "status")
  if (!line) {
    // A missing status line is a reporting failure, not necessarily a work failure: the repo's own
    // Stop hook could reject the child's final message and push the JSON out of `result`. Read the
    // outcome from durable side effects instead, so a bundle that committed and pushed is never
    // recorded as a loss (#539 post-mortem, 2026-07-19 - `social` cost a bundle exactly this way).
    const after = repoSideEffects(repoPath)
    if (after.head !== before.head || (after.pr && after.pr !== before.pr)) {
      const commits = git(repoPath, ["rev-list", "--count", `${before.head}..${after.head}`]).stdout.trim() || "?"
      return {
        status: "blocked",
        model,
        pr: after.pr,
        summary: `no status line, but the child left ${commits} new commit(s)${after.pr ? " and a PR" : ""} - status derived from side effects`,
        elapsedMs,
        derived: true,
        raw: String(resultText).slice(-500),
      }
    }
    return { status: "unknown", model, pr: null, summary: "no status line and no commits or PR - the child left nothing", elapsedMs, raw: String(resultText).slice(-500) }
  }
  const normalized = normalizeChildStatus(line.status)
  return {
    status: normalized.status,
    ...(normalized.claimedStatus ? { claimedStatus: normalized.claimedStatus } : {}),
    model,
    pr: line.pr || null,
    summary: [normalized.note, String(line.summary || "").slice(0, 500)].filter(Boolean).join(" | "),
    elapsedMs,
  }
}

/**
 * Build the independent-verifier prompt. The verifier never sees the maker's reasoning trail
 * (fresh context, only the diff + the acceptance criteria) — the structural reason a separate
 * grader outperforms self-critique. Read-only by allowlist; posture reinforced in the prompt.
 * Exported so the wording (ready-for-review PR, verdict-consuming ui clause) is pinned by
 * tests without spawning a verifier.
 */
export function buildVerifyPrompt(task, promptText, prUrl, gateChecks, baseSha) {
  // The UI clause used to demand a judge verdict of "transformed" and call anything
  // else UNMET. That judge was demoted to a defect detector after measuring 0/12
  // recall and passing a byte-identical surface twice, so the clause was asking the
  // verifier to require evidence the harness deliberately no longer produces. It
  // now reads the three conditions that ARE checkable off the driver's own embedded
  // measurements - the verifier's allowlist cannot run the gate tools, and a re-run
  // against a base the verifier resolved itself measures a different (or empty)
  // diff - and is explicit that it cannot rule on whether the surface looks good,
  // because nothing here can.
  const uiClause = task.ui
    ? `5. UI/DESIGN, checked in this order:
   a. Read the DRIVER-MEASURED GATE VERDICTS above. A non-zero \`workorder --check --id\` exit
      means that order's enumerated DESIGN.md violations were not cleared: UNMET.
   b. A non-zero \`check-diff-ownership\` exit means the diff escaped its owned files or moved
      gate state: UNMET, and say which files. The driver measured it against the pinned base
      ${baseSha ? String(baseSha).slice(0, 12) : "it recorded at spawn"}; never re-derive a base of your own - an unpinned or HEAD base
      measures a different (or empty) diff.
   c. Confirm each touched work order gained a Timeline entry describing what changed.
   Then review the JSX/CSS/token diff against DESIGN.md: semantic tokens only, NO decorative glow
   or gradient wash, the enumerated spacing scale, and the AI-slop test.
   You CANNOT rule on whether the surface looks good, and you must not pretend to. No instrument
   here can, which is why a human tick in signoff.json is the only thing that grants completion.
   Judge whether the enumerated work was done, not whether the result is beautiful. An implementer
   sentence like "looks good" or "vision-verify PASS" is not evidence of anything.\n`
    : ""
  // The verifier used to be TOLD to run these tools, which handed enforcement
  // back to a model's discretion - the same hole the driver-side measurement
  // closes for the child. Now the driver's own verdicts are embedded, so the
  // grader sees the measurement, not anyone's claim about it.
  const gateClause = gateChecks?.length
    ? `\nDRIVER-MEASURED GATE VERDICTS (the driver ran these itself after the implementer finished;
they are measurements, not claims - weigh them over anything the implementer says):
${gateChecks.map((gate) => `- ${gate.command} -> exit ${gate.exit}${gate.tail ? `\n  ${gate.tail.split("\n").join("\n  ")}` : ""}`).join("\n")}\n`
    : ""
  return `You are an INDEPENDENT VERIFIER for an unattended overnight engineering run. You did
NOT write this code and must not defer to any claim the implementer made — judge ONLY the
artifact against the acceptance criteria below.

TASK — acceptance criteria (verbatim):
${promptText}

The implementer opened this PR ready for review (CI and the review bots run on it): ${prUrl}
Inspect the ACTUAL change, do not trust the summary:
- \`gh pr diff ${prUrl}\` for the full diff (and the paired orbit-api PR if the task was cross-repo).
- Read any file you need for surrounding context.
${gateClause}

Verify, specifically:
1. Does the diff satisfy EVERY acceptance criterion above? Name any unmet one.
2. Cross-platform parity: a web change mirrored in apps/mobile and vice versa; i18n keys in BOTH en.json and pt-BR.json. Flag any missing mirror.
3. Did it ship a workaround, placeholder, or deferral instead of the real change? (Orbit standard: the complete implementation, always — a "would be an API change / follow-up" note is a defect, not an excuse.)
4. Any obvious correctness, data-isolation, or security regression in the diff.
${uiClause}
You are STRICTLY READ-ONLY: do not edit, commit, push, or comment. Only Read/Grep/Glob and \`gh\`/\`git\` read commands are available to you.

END your final message with EXACTLY one line of JSON (no fences):
{"verdict":"AGREE"|"DISAGREE"|"UNSURE","criteria_met":true|false,"parity_ok":true|false,"reasons":"<one or two sentences, cite file:line for any defect>","lesson":"<one line to carry forward if you DISAGREE, else null>"}`
}

function buildVerifyArgs(config) {
  const args = ["-p", "--output-format", "json", "--model", config.verifyModel, "--permission-mode", "bypassPermissions"]
  if (config.fallbackModel) args.push("--fallback-model", config.fallbackModel)
  if (config.verifyAllowedTools?.length) args.push("--allowedTools", config.verifyAllowedTools.join(" "))
  for (const dir of config.addDirs || []) args.push("--add-dir", resolve(dir))
  return args
}

/** Run the independent verifier over a task's ready-for-review PR and return its verdict. */
function verifyTask(task, config, promptText, prUrl, gateChecks, baseSha) {
  const started = Date.now()
  const run = spawnSync("claude", buildVerifyArgs(config), {
    input: buildVerifyPrompt(task, promptText, prUrl, gateChecks, baseSha),
    cwd: resolve(config.repos[0].path),
    env: childEnv(),
    encoding: "utf8",
    timeout: config.verifyTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  })
  const elapsedMs = Date.now() - started
  if (run.error) {
    const reason = run.error.code === "ETIMEDOUT" ? "verifier timed out" : `verifier spawn failed (${run.error.code})`
    return { verdict: "UNSURE", reasons: reason, lesson: null, elapsedMs }
  }
  const outer = (() => {
    try {
      return JSON.parse(run.stdout)
    } catch {
      return null
    }
  })()
  const resultText = outer?.result ?? run.stdout ?? ""
  const line = parseJsonLine(resultText, "verdict")
  if (!line) {
    return { verdict: "UNSURE", reasons: "verifier returned no verdict line", lesson: null, elapsedMs }
  }
  return {
    verdict: line.verdict,
    criteriaMet: line.criteria_met === true,
    parityOk: line.parity_ok === true,
    reasons: String(line.reasons || "").slice(0, 600),
    lesson: line.lesson && line.lesson !== "null" ? String(line.lesson).slice(0, 300) : null,
    elapsedMs,
  }
}

/** Post the verifier verdict onto the PR so it is visible at review time. Best-effort. */
function postVerdictComment(prUrl, verdict, log) {
  const body = [
    `**Night-run independent verifier — ${verdict.verdict}**`,
    ``,
    `- criteria met: ${verdict.criteriaMet ? "yes" : "no"}`,
    `- parity ok: ${verdict.parityOk ? "yes" : "no"}`,
    ``,
    verdict.reasons || "(no reasons given)",
    ``,
    `_Independent Sonnet verifier, fresh context, read-only. Not a substitute for your review._`,
  ].join("\n")
  const r = spawnSync("gh", ["pr", "comment", prUrl, "--body", body], { encoding: "utf8" })
  if (r.status !== 0) log(`  could not post verifier comment (${String(r.stderr || "").trim().slice(-160)})`)
}

const taskWall = (r) => (r.elapsedMs ? `${Math.round(r.elapsedMs / 60000)}min` : "-")
const taskStatus = (r) => (r.claimedStatus && r.claimedStatus !== r.status ? `${r.status} (claimed ${r.claimedStatus})` : r.status)
const taskRow = (r) => `| ${r.id} | ${r.label} | ${taskStatus(r)} | ${r.verdict || "-"} | ${taskWall(r)} | ${r.pr || "-"} |`

/**
 * The operator-facing rollup (SUMMARY.md + the final log line). Child statuses
 * are reported as exactly what they are - ready-for-review / blocked / failed
 * counts - and the phrase "done (human-granted)" is printed ONLY for a result
 * whose `humanGranted` flag the DRIVER set after verifying a signoff.json
 * grant itself. No code path sets that flag today, so the wording is simply
 * absent: the engine once bucketed any child-returned status "done" under
 * "done (human-granted)", asserting a grant nobody had made - the exact
 * reported-done framing the harness exists to eliminate. Exported so the
 * wording is pinned by tests without spawning the engine.
 */
export function buildRunReport(results, queueLength, lessonCount) {
  const readyForReview = results.filter((r) => r.status === "ready-for-review").length
  const blocked = results.filter((r) => r.status === "blocked").length
  const failed = results.filter((r) => r.status === "failed" || r.status === "unknown").length
  const humanGranted = results.filter((r) => r.humanGranted === true).length
  const flagged = results.filter((r) => r.verdict === "DISAGREE").length
  const summary = [
    `# drive summary`,
    ``,
    `- tasks attempted: ${results.length} / ${queueLength}`,
    `- ready for review: ${readyForReview} (a human review and a signoff.json tick are still owed)`,
    `- blocked: ${blocked}`,
    `- failed: ${failed}`,
    ...(humanGranted ? [`- done (human-granted): ${humanGranted} (signoff.json grant verified by the driver)`] : []),
    `- verifier flagged (DISAGREE): ${flagged}`,
    `- lesson candidates: ${lessonCount}${lessonCount ? ` (see LESSONS.md - run /lesson to promote)` : ""}`,
    ``,
    `| task | label | status | verifier | wall | PR |`,
    `|---|---|---|---|---|---|`,
    ...results.map(taskRow),
    ``,
  ].join("\n")
  const headline = `RUN COMPLETE. ${readyForReview}/${queueLength} ready for review, ${blocked} blocked, ${failed} failed${humanGranted ? `, ${humanGranted} done (human-granted)` : ""}, ${flagged} flagged, ${lessonCount} lesson candidate(s).`
  return { summary, headline }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const dir = resolve(opts.dir)
  const config = { ...DEFAULTS, ...loadJson(join(dir, "config.json"), {}) }
  config.repos = config.repos?.length ? config.repos : DEFAULTS.repos
  const queue = loadJson(join(dir, "queue.json"), [])

  const runDir = join(dir, "runs", stamp())
  mkdirSync(runDir, { recursive: true })
  const logPath = join(runDir, "run.log")
  const statusPath = join(runDir, "STATUS.md")
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`
    process.stdout.write(line + "\n")
    appendFileSync(logPath, line + "\n")
  }

  // The label must say what was actually asked for: a plain `--dry-run` used to
  // announce itself as "drive --sleep starting", so a run.log reader concluded
  // an unattended overnight run had been launched when none was.
  const modeLabel = opts.dryRun ? "drive (dry run)" : opts.attended ? "drive (attended)" : "drive --sleep"
  log(`${modeLabel} starting: ${queue.length} bundle(s), model=${config.model}, per-task timeout ${Math.round(config.perTaskTimeoutMs / 60000)}min`)
  if (!queue.length) {
    log("queue.json is empty. Nothing to do.")
    return
  }

  const problems = preflight(config, config.repos, queue, dir)
  if (problems.length) {
    log("PREFLIGHT FAILED:")
    for (const p of problems) log(`  - ${p}`)
    log("Aborting before any task ran.")
    // An aborted run that exits 0 reads as success to any caller checking the
    // code, which is the fail-open shape the whole harness forbids.
    process.exitCode = 1
    return
  }
  if (opts.dryRun) {
    log("DRY RUN. Preflight passed. Tasks that would run:")
    for (const task of queue) log(`  - [${task.id}] ${task.label}`)
    return
  }

  const lockPath = acquireRunLock(dir, log)
  if (!lockPath) {
    log("Aborting before any task ran.")
    // Same fail-open shape as an aborted preflight: a caller checking the exit
    // code must never read "another run holds the tree" as success.
    process.exitCode = 1
    return
  }
  const releaseLock = () => {
    try {
      if (existsSync(lockPath)) rmSync(lockPath)
    } catch {
      /* the lock is advisory; a failed cleanup must never mask the run's own outcome */
    }
  }
  process.on("exit", releaseLock)
  try {

  const results = []
  const lessons = []
  let consecutiveFailures = 0
  let previousTaskId = "pre-run"
  const writeStatus = () => {
    const rows = results.map(taskRow).join("\n")
    writeFileSync(
      statusPath,
      `# drive status\n\n| bundle | label | status | verifier | wall | PR |\n|---|---|---|---|---|---|\n${rows}\n`,
    )
  }

  const rl = opts.attended ? createInterface({ input: process.stdin, output: process.stdout }) : null
  const ask = async (q) => (rl ? (await rl.question(q)).trim().toLowerCase() : "")
  if (opts.attended) log("ATTENDED mode: you approve each bundle before it runs and review its PR after (auto-verifier off - you are the verifier).")

  for (const task of queue) {
    if (existsSync(join(dir, "STOP"))) {
      log("STOP flag found. Halting gracefully before the next task.")
      break
    }
    log(`--- task [${task.id}] ${task.label} ---`)
    resetReposToBase(config.repos, log, previousTaskId)
    previousTaskId = task.id
    // The base every gate measures against: the work repo's sha right after the
    // reset, recorded by the driver so no child report can move it.
    const bundleBaseSha = git(resolve(config.repos[0].path), ["rev-parse", "HEAD"]).stdout.trim()

    const promptPath = join(dir, "prompts", `task-${task.id}.md`)
    const rawPromptText = (() => {
      try {
        return readFileSync(promptPath, "utf8")
      } catch {
        return task.prompt || ""
      }
    })()
    if (!rawPromptText.trim()) {
      // Preflight already errors on this shape; reaching it here means the
      // prompt vanished mid-run. That is a FAILURE that feeds the circuit
      // breaker, never a quiet skip - a skip once buried a whole queue.
      log(`  no prompt for task ${task.id}; recording FAILED.`)
      results.push({ id: task.id, label: task.label, status: "failed", pr: null, summary: "missing prompt" })
      writeStatus()
      consecutiveFailures += 1
      if (consecutiveFailures >= config.maxConsecutiveFailures) {
        log(`Circuit breaker: ${consecutiveFailures} consecutive hard failures. Halting rather than burning the rest of the night.`)
        break
      }
      continue
    }
    // The prompt's condition (b) pins its ownership base to a token only the
    // driver can fill: the sha it just reset the work repo to, which no child
    // report can move. A prompt the driver cannot pin is a FAILURE before
    // spawn, never a prompt handed over with the token (or an improvised base)
    // still in it.
    const substituted = substituteDriveBase(rawPromptText, bundleBaseSha)
    if (substituted.problem) {
      log(`  ${substituted.problem}; recording FAILED before spawn.`)
      results.push({ id: task.id, label: task.label, status: "failed", pr: null, summary: substituted.problem })
      writeStatus()
      consecutiveFailures += 1
      if (consecutiveFailures >= config.maxConsecutiveFailures) {
        log(`Circuit breaker: ${consecutiveFailures} consecutive hard failures. Halting rather than burning the rest of the night.`)
        break
      }
      continue
    }
    const promptText = substituted.text

    if (opts.attended) {
      const tier = resolveModel(task, config)
      const effort = resolveEffort(task)
      const snippet = promptText.trim().slice(0, 240).replace(/\s+/g, " ")
      const ans = await ask(`\n[${task.id}] ${task.label}  (tier=${tier}${effort ? " @" + effort : ""})\n  ${snippet}...\n  Run this bundle? [go / skip / abort] `)
      if (ans === "abort" || ans === "a") {
        log("Aborted by user before running this bundle.")
        break
      }
      if (ans === "skip" || ans === "s") {
        log(`  skipped [${task.id}] by user.`)
        results.push({ id: task.id, label: task.label, status: "skipped", pr: null, summary: "skipped by user" })
        writeStatus()
        continue
      }
    }

    const outcome = runTask(task, config, promptText, log)
    const record = { id: task.id, label: task.label, ...outcome }
    if (Array.isArray(task.workOrders) && task.workOrders.length) {
      record.gates = measureGates(task, config, bundleBaseSha)
      for (const gate of record.gates) {
        log(`  gate: ${gate.command} -> exit ${gate.exit}`)
        for (const line of gate.tail ? gate.tail.split("\n") : []) log(`    ${line}`)
      }
      const failedGates = record.gates.filter((gate) => gate.exit !== 0)
      // ready-for-review is a CLAIM; the gates are a
      // measurement. When they disagree, the measurement wins.
      if (failedGates.length && COMPLETED_STATUSES.has(record.status)) {
        record.claimedStatus = record.status
        record.status = "failed"
        record.summary = `gate-contradicted: child claimed ${record.claimedStatus} but ${failedGates.map((gate) => gate.command).join("; ")} failed`
        log(`  GATE-CONTRADICTED: overriding claimed ${record.claimedStatus} to failed.`)
      }
    }
    results.push(record)
    log(`  status=${record.status} pr=${record.pr || "-"} (${Math.round(record.elapsedMs / 1000)}s)`)
    if (record.summary) log(`  summary: ${record.summary}`)

    if (config.verify && !opts.attended && record.pr && SUCCESS_STATUSES.has(record.status)) {
      log(`  verifying [${task.id}] against acceptance criteria (independent ${config.verifyModel})...`)
      const verdict = verifyTask(task, config, promptText, record.pr, record.gates, bundleBaseSha)
      record.verdict = verdict.verdict
      record.verifyReasons = verdict.reasons
      if (config.push) postVerdictComment(record.pr, verdict, log)
      log(`  verifier=${verdict.verdict} criteriaMet=${verdict.criteriaMet} parityOk=${verdict.parityOk}`)
      if (verdict.lesson) lessons.push({ id: task.id, label: task.label, source: "verifier", text: verdict.lesson })
    }
    if (record.status === "blocked" || record.status === "failed") {
      lessons.push({ id: task.id, label: task.label, source: record.status, text: record.summary || record.raw || "(no detail)" })
    }

    writeFileSync(join(runDir, `task-${task.id}.json`), JSON.stringify(record, null, 2))
    writeStatus()

    if (opts.attended) {
      const ans = await ask(`  -> ${record.status}${record.pr ? " " + record.pr : ""} - review the PR, then: continue to next bundle? [continue / stop] `)
      if (ans === "stop" || ans === "s") {
        log("Stopped by user after review.")
        break
      }
      continue
    }

    const hardFailure = record.status === "failed" || record.status === "unknown"
    consecutiveFailures = hardFailure ? consecutiveFailures + 1 : 0
    if (consecutiveFailures >= config.maxConsecutiveFailures) {
      log(`Circuit breaker: ${consecutiveFailures} consecutive hard failures. Halting rather than burning the rest of the night.`)
      break
    }
  }

  if (rl) rl.close()
  resetReposToBase(config.repos, log, previousTaskId)

  if (lessons.length) {
    const lessonDoc = [
      `# drive lesson candidates — ${stamp()}`,
      ``,
      `Fail/blocked outcomes and verifier DISAGREEs from this run. NOT auto-promoted: review each`,
      `and run \`/lesson\` to distill and graduate it (that human gate is deliberate).`,
      ``,
      ...lessons.map((l) => `- **[${l.id}] ${l.label}** (${l.source}): ${l.text}`),
      ``,
    ].join("\n")
    writeFileSync(join(runDir, "LESSONS.md"), lessonDoc)
  }

  const report = buildRunReport(results, queue.length, lessons.length)
  writeFileSync(join(runDir, "SUMMARY.md"), report.summary)
  log(`${report.headline} Summary: ${join(runDir, "SUMMARY.md")}`)
  } finally {
    releaseLock()
  }
}

// Importable for hermetic tests (test-hooks drives queuePromptProblems against a
// fixture dir); only a direct `node run.mjs` invocation starts the engine. The
// comparison is case-insensitive because Windows reports the drive letter in
// either case depending on how the process was launched.
const invokedDirectly =
  process.argv[1] && import.meta.url.toLowerCase() === pathToFileURL(resolve(process.argv[1])).href.toLowerCase()
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
