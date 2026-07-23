#!/usr/bin/env node
/**
 * drive engine: run a queue of bundles/tasks, one FRESH `claude -p` per task.
 *
 * Two modes (one engine):
 *  - ATTENDED (`--attended`, the default `/drive` path): readline gates — approve each bundle
 *    before it runs, review its PR after. The human is the verifier, so the auto-verifier
 *    is off. No `/clear` ever: each bundle is a fresh headless process, so context never accrues.
 *  - UNATTENDED (`--sleep`, no `--attended`): the overnight queue-drain - no readline gates, an
 *    independent Sonnet verifier grades what each bundle produced (its PR, or the driver-measured
 *    commit range when it opened none). This is the old `/night-run`.
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
 * NOTHING A CHILD SAYS BECOMES ITS RECORDED OUTCOME. The driver records the base sha before the
 * spawn and measures the commit the child actually left off it (measureChildWork), then judges
 * that explicit base..childHead range - never "whatever HEAD the child left checked out" - with
 * `check-diff-ownership --head` and `workorder --check`. deriveOutcome turns those measurements
 * into the recorded status; the child's status line is evidence weighed against them, never the
 * verdict. A bundle that produced no commit off the base, or a commit whose diff is empty, is
 * terminal `no-work-produced`: never ready-for-review, never green, and it feeds the circuit
 * breaker. Measured before this existed: a child that changed nothing, committed nothing and
 * opened no PR was recorded ready-for-review and rolled up green, and a child whose last act was
 * `git checkout <base>` hid its whole committed escape from a gate that then printed OK.
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
// human had granted. normalizeChildStatus is where a claim is read; what the
// driver RECORDS is deriveOutcome's, off the measurements below.
const CHILD_STATUSES = new Set(["ready-for-review", "blocked", "failed"])
// Statuses worth grading: the verifier runs on these whenever there is an
// artifact to grade (a PR, or the measured base..childHead range).
const SUCCESS_STATUSES = new Set(["ready-for-review", "blocked"])
// The one claim that says "this is complete enough to review", and the terminal
// state the driver records instead when its own measurement finds no artifact.
const CLAIMS_COMPLETION = "ready-for-review"
const NO_WORK = "no-work-produced"

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

/**
 * A load-bearing JSON file, read loudly. Absent is legal only where the caller
 * says so; unreadable, empty, unparseable or the wrong shape is an abort naming
 * the file. The silent `catch { return fallback }` this replaces turned a
 * truncated queue.json into "0 bundle(s), Nothing to do" and exit 0 with 48
 * generated prompts sitting beside it, and let a corrupt config.json reassert
 * every DEFAULT over the operator's file. Throws; main logs and exits 1.
 */
export function readJsonFile(path, { optional = false, shape } = {}) {
  if (!existsSync(path)) {
    if (optional) return null
    throw new Error(`${path} does not exist. The drive engine cannot run without it.`)
  }
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    throw new Error(`${path} cannot be read: ${error.message}`)
  }
  if (!text.trim()) throw new Error(`${path} is empty. An empty file is a broken run, never "nothing to do".`)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${error.message}). Fix it or regenerate it.`)
  }
  if (shape === "array" && !Array.isArray(parsed)) throw new Error(`${path} must be a JSON array of queue entries, got ${parsed === null ? "null" : typeof parsed}.`)
  if (shape === "object" && (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")) throw new Error(`${path} must be a JSON object of config keys.`)
  return parsed
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
export function acquireRunLock(dir, log) {
  const lockPath = join(dir, "RUNNING")
  if (existsSync(lockPath)) {
    // An unreadable lock used to be treated as no lock at all, which is the
    // fail-open direction: the file exists because SOMETHING claimed this tree,
    // and stealing it on a parse error is exactly the corruption the lock is
    // for. A lock we cannot read is a lock we must not reclaim.
    let holder
    try {
      holder = readJsonFile(lockPath, { shape: "object" })
    } catch (error) {
      log(`THE RUN LOCK IS UNREADABLE: ${error.message}`)
      log(`Another run may hold this working tree. Inspect ${lockPath} and delete it yourself if you know it is dead.`)
      return null
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

/** Every local branch tip, sampled before a child so a commit it PRODUCED can be told from one that was already there. Exported for the hermetic derivation tests. */
export function branchTips(repoPath) {
  const listed = git(repoPath, ["for-each-ref", "--format=%(objectname) %(refname:short)", "refs/heads"]).stdout || ""
  return listed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ")
      return { sha: line.slice(0, space), name: line.slice(space + 1) }
    })
}

/** The open PR for a branch, read from GitHub - not from the child's status line. Null when `gh` cannot answer. */
function openPrFor(repoPath, branch) {
  if (!branch) return null
  const pr = spawnSync("gh", ["pr", "list", "--head", branch, "--state", "open", "--limit", "1", "--json", "url", "--jq", ".[0].url"], {
    cwd: repoPath,
    encoding: "utf8",
  })
  return (pr.stdout || "").trim() || null
}

/**
 * What the child actually PRODUCED against the driver's own base: the commit it
 * left, the branch carrying it, and the size of that range. This is the subject
 * of every gate, because "whatever HEAD the child left checked out" is chosen by
 * the child - one that committed an escape and then ran `git checkout <base>`
 * was measured at "changed: 0 file(s), OK" while its PR carried unowned files.
 * The head is found among the branch tips regardless of the checkout. A tip that
 * existed at spawn time belongs to an earlier bundle, and one that does not
 * descend from the base is not this range; when nothing qualifies the head is
 * null and the caller records the terminal no-work state, never a green.
 */
export function measureChildWork(repoPath, baseSha, tipsBefore) {
  const empty = { head: null, branch: null, commits: 0, files: 0, insertions: 0, deletions: 0 }
  if (!baseSha) return empty
  const known = new Set((tipsBefore || []).map((tip) => tip.sha))
  const headSha = git(repoPath, ["rev-parse", "HEAD"]).stdout.trim()
  const tipsAfter = branchTips(repoPath)
  const produced = [...new Set([headSha, ...tipsAfter.map((tip) => tip.sha)])].filter(
    (sha) => sha && sha !== baseSha && !known.has(sha) && git(repoPath, ["merge-base", "--is-ancestor", baseSha, sha]).status === 0,
  )
  if (!produced.length) return empty
  const commitsOf = (sha) => Number(git(repoPath, ["rev-list", "--count", `${baseSha}..${sha}`]).stdout.trim() || 0)
  const head = produced.includes(headSha) ? headSha : [...produced].sort((a, b) => commitsOf(b) - commitsOf(a) || a.localeCompare(b))[0]
  const work = { head, branch: tipsAfter.find((tip) => tip.sha === head)?.name ?? null, commits: commitsOf(head), files: 0, insertions: 0, deletions: 0 }
  for (const row of (git(repoPath, ["diff", "--numstat", `${baseSha}...${head}`]).stdout || "").split("\n")) {
    const [added, removed] = row.split("\t")
    if (!row.trim()) continue
    work.files += 1
    work.insertions += Number(added) || 0
    work.deletions += Number(removed) || 0
  }
  return work
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
export function measureGates(task, config, baseSha, childHeadSha) {
  const repoPath = resolve(config.repos[0].path)
  const checks = []
  const idFlags = task.workOrders.flatMap((id) => ["--id", id])
  const idLabel = task.workOrders.map((id) => `--id ${id}`).join(" ")
  // The judged head is named, never inferred from the checkout. Callers that
  // have measured the child's produced commit pass it; the fallback is the
  // current HEAD, which is only the right subject for a self-check inside the
  // tree being judged.
  const headSha = childHeadSha || git(repoPath, ["rev-parse", "HEAD"]).stdout.trim()
  const pristine = extractBaseGateTool(repoPath, baseSha, "tools/check-diff-ownership.mjs")
  if (pristine.problem) {
    checks.push({ command: `check-diff-ownership (base-ref copy) ${idLabel}`, exit: 2, tail: `failed closed: ${pristine.problem}` })
  } else {
    const ownership = spawnSync(process.execPath, [pristine.path, ...idFlags, "--base", baseSha, "--head", headSha], {
      cwd: repoPath,
      env: { ...process.env, ORBIT_SURFACE_ROOT: repoPath },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
    checks.push({
      command: `check-diff-ownership (base-ref copy) ${idLabel} --base ${baseSha.slice(0, 12)} --head ${String(headSha).slice(0, 12)}`,
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

/**
 * Spawn the child and return WHAT IT SAID, nothing more. It used to return a
 * recorded status - taking `{"status":"ready-for-review"}` at its word and, on
 * a missing status line, sampling git itself - so the claim and the verdict were
 * the same object. They are separate now: this reports the claim, deriveOutcome
 * weighs it against measureChildWork and the gates.
 */
function runTask(task, config, promptText) {
  const started = Date.now()
  const model = resolveModel(task, config)
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
    return { model, elapsedMs, claim: null, failure: reason, raw: String(run.stderr || "").slice(-500) }
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
    return { model, elapsedMs, claim: null, failure: "child reported an error", raw: String(resultText).slice(-500) }
  }
  const line = parseJsonLine(resultText, "status")
  if (!line) return { model, elapsedMs, claim: null, raw: String(resultText).slice(-500) }
  const normalized = normalizeChildStatus(line.status)
  return {
    model,
    elapsedMs,
    raw: String(resultText).slice(-500),
    claim: {
      status: normalized.status,
      claimedStatus: normalized.claimedStatus ?? null,
      note: normalized.note ?? null,
      pr: line.pr || null,
      summary: String(line.summary || "").slice(0, 500),
    },
  }
}

/**
 * The recorded outcome, DERIVED. Ordered so the measurements decide and the
 * claim only narrows what a measurement already allows: (1) no commit off the
 * recorded base, or an empty diff, is terminal `no-work-produced` - nothing was
 * made, so nothing can be ready for review, which is the shape that recorded
 * zero-change bundles as green; a child's own blocked/failed is an admission,
 * not a lie, so it stands with the zero measurement beside it. (2) a failing
 * gate beats a completion claim. (3) work with no status line is blocked, so a
 * Stop hook eating the final message never costs a bundle that really
 * committed. (4) a completion claim with no PR anywhere is not reviewable.
 * Pure and exported, so it is checkable on inputs no child can forge.
 */
export function deriveOutcome(claim, work, gates, { requirePr = true, prUrl = null } = {}) {
  const failedGates = (gates || []).filter((gate) => gate.exit !== 0)
  const produced = !!work?.head && work.files > 0
  if (!produced) {
    const measured = work?.head
      ? `it committed ${work.commits} commit(s) off the base but the diff is empty`
      : "no commit off the base the driver recorded before the spawn"
    if (claim && (claim.status === "blocked" || claim.status === "failed")) {
      return { status: claim.status, claimedStatus: claim.claimedStatus, note: `${claim.status} with NO WORK PRODUCED: ${measured}` }
    }
    return {
      status: NO_WORK,
      claimedStatus: claim ? claim.claimedStatus || claim.status : null,
      note: `NO WORK PRODUCED: ${measured}. A claim of completion cannot stand against an absent artifact.`,
    }
  }
  if (failedGates.length && (!claim || claim.status === CLAIMS_COMPLETION)) {
    return {
      status: "failed",
      claimedStatus: claim ? claim.claimedStatus || claim.status : null,
      note: `gate-contradicted: ${failedGates.map((gate) => gate.command).join("; ")} failed over ${work.files} changed file(s)`,
    }
  }
  if (!claim) {
    return { status: "blocked", claimedStatus: null, note: `no status line, but the child left ${work.commits} commit(s) over ${work.files} file(s) - status derived from what it did` }
  }
  if (claim.status === CLAIMS_COMPLETION && requirePr && !prUrl) {
    return { status: "blocked", claimedStatus: claim.claimedStatus || claim.status, note: "claimed ready-for-review, but no open PR was found for the branch it produced - there is nothing to review" }
  }
  return { status: claim.status, claimedStatus: claim.claimedStatus, note: claim.note }
}

/** Every `depth N% vs floor M%` reading the gate tails carry: a MEASUREMENT and a human veto, never a target a child can aim at. */
export function depthReadings(gates) {
  const readings = { min: null, unknown: 0, belowFloor: 0, total: 0, floor: 30 }
  for (const gate of gates || []) {
    for (const match of String(gate.tail || "").matchAll(/depth (?:(\d+(?:\.\d+)?)%|UNKNOWN) vs floor (\d+)%/g)) {
      readings.total += 1
      readings.floor = Number(match[2])
      if (match[1] === undefined) {
        readings.unknown += 1
        continue
      }
      const value = Number(match[1])
      if (value < readings.floor) readings.belowFloor += 1
      if (readings.min === null || value < readings.min) readings.min = value
    }
  }
  return readings
}

/** The outstanding mechanical-violation count the gate tails report. A LINT COUNT, never evidence of visual change - see the legend buildRunReport prints beside it. */
export function debtReadings(gates) {
  let measured = null
  for (const gate of gates || []) {
    for (const match of String(gate.tail || "").matchAll(/(\d+) outstanding mechanical violation\(s\)/g)) {
      measured = (measured ?? 0) + Number(match[1])
    }
  }
  return measured
}

/**
 * Build the independent-verifier prompt. The verifier never sees the maker's reasoning trail
 * (fresh context, only the diff + the acceptance criteria) — the structural reason a separate
 * grader outperforms self-critique. Read-only by allowlist; posture reinforced in the prompt.
 * Exported so the wording (ready-for-review PR, verdict-consuming ui clause) is pinned by
 * tests without spawning a verifier.
 */
export function buildVerifyPrompt(task, promptText, prUrl, gateChecks, baseSha, range) {
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
   d. Read the \`depth N% vs floor 30%\` reading in those verdicts. It is a MEASUREMENT of how much
      of the surface's render signature moved since the baseline, and a veto a human consults -
      never a target. A cleared \`workorder --check\` is a LINT COUNT reaching zero, which hoisting
      an off-scale literal into a named constant achieves with zero pixels moved; say so plainly
      when depth sits far below the floor while the debt count reads clear.
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

${
    prUrl
      ? `The implementer opened this PR ready for review (CI and the review bots run on it): ${prUrl}`
      : `The implementer opened NO PR. The driver measured the commit range it actually produced: ${range}`
  }
Inspect the ACTUAL change, do not trust the summary:
- ${prUrl ? `\`gh pr diff ${prUrl}\` for the full diff (and the paired orbit-api PR if the task was cross-repo).` : `\`git diff ${range}\` for the full diff, and \`git log ${range}\` for what it claims to have done.`}
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

/** Run the independent verifier over what the child produced - its PR, or the driver-measured commit range when it opened none - and return its verdict. */
function verifyTask(task, config, promptText, prUrl, gateChecks, baseSha, range) {
  const started = Date.now()
  const run = spawnSync("claude", buildVerifyArgs(config), {
    input: buildVerifyPrompt(task, promptText, prUrl, gateChecks, baseSha, range),
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
const taskStatus = (r) => (r.status === NO_WORK ? `**NO WORK PRODUCED**` : r.claimedStatus && r.claimedStatus !== r.status ? `${r.status} (claimed ${r.claimedStatus})` : r.status)
const taskFiles = (r) => (r.work ? (r.work.files === 0 ? `**0**` : String(r.work.files)) : "-")
const taskChurn = (r) => (r.work ? `+${r.work.insertions}/-${r.work.deletions}` : "-")
const taskDepth = (r) => {
  if (!r.depth?.total) return "-"
  const parts = [r.depth.min === null ? "UNKNOWN" : `min ${r.depth.min.toFixed(1)}%`]
  if (r.depth.belowFloor) parts.push(`${r.depth.belowFloor}/${r.depth.total} below`)
  if (r.depth.unknown) parts.push(`${r.depth.unknown} unknown`)
  return parts.join(", ")
}
const taskDebt = (r) => {
  if (!r.debt) return "-"
  const before = r.debt.queued ?? "?"
  return `${before} -> ${r.debt.measured ?? "?"}`
}
const taskRow = (r) =>
  `| ${r.id} | ${r.label} | ${taskStatus(r)} | ${taskFiles(r)} | ${taskChurn(r)} | ${taskDepth(r)} | ${taskDebt(r)} | ${r.verdict || "-"} | ${taskWall(r)} | ${r.pr || "-"} |`

/**
 * The operator-facing rollup (SUMMARY.md + the final log line) - the two
 * artifacts read the morning after. It carried status, verifier verdict, wall
 * time and PR only, while the driver computed the changed-file count and the
 * depth reading seconds earlier and wrote them nowhere a human looks: 16
 * zero-change bundles printed identically to 16 real ones. Every row now carries
 * what was produced, the depth measurement, the debt delta and the PR, and a
 * zero-change bundle is bolded NO WORK PRODUCED and counted on its own line.
 * The legend must keep saying both measured things: debt is a LINT COUNT a
 * no-op refactor can drive to zero, and depth is a measurement and a veto,
 * never a target (a target would be satisfied by churn). `completionLine` is the
 * surface completion ratio, which the documented path never showed the operator.
 */
export function buildRunReport(results, queueLength, lessonCount, completionLine) {
  const readyForReview = results.filter((r) => r.status === "ready-for-review").length
  const blocked = results.filter((r) => r.status === "blocked").length
  const failed = results.filter((r) => r.status === "failed" || r.status === "unknown").length
  const noWork = results.filter((r) => r.status === NO_WORK).length
  const flagged = results.filter((r) => r.verdict === "DISAGREE").length
  const totals = results.reduce(
    (sum, r) => ({
      files: sum.files + (r.work?.files || 0),
      insertions: sum.insertions + (r.work?.insertions || 0),
      deletions: sum.deletions + (r.work?.deletions || 0),
      belowFloor: sum.belowFloor + (r.depth?.belowFloor || 0),
      orders: sum.orders + (r.depth?.total || 0),
    }),
    { files: 0, insertions: 0, deletions: 0, belowFloor: 0, orders: 0 },
  )
  const depthLine = totals.orders
    ? `- depth: ${totals.belowFloor} of ${totals.orders} measured order(s) below the 30% floor - a MEASUREMENT and a human veto, never a target`
    : `- depth: no order was measured for redesign depth in this run`
  const summary = [
    `# drive summary`,
    ``,
    `- tasks attempted: ${results.length} / ${queueLength}`,
    `- ready for review: ${readyForReview} (a human review and a signoff.json tick are still owed)`,
    `- blocked: ${blocked}`,
    `- failed: ${failed}`,
    `- NO WORK PRODUCED: ${noWork} (no commit off the recorded base, or an empty diff - never a pass)`,
    `- diff produced: ${totals.files} file(s), +${totals.insertions}/-${totals.deletions}`,
    depthLine,
    `- ${completionLine || "surface completion: NOT MEASURED in this run"}`,
    `- verifier flagged (DISAGREE): ${flagged}`,
    `- lesson candidates: ${lessonCount}${lessonCount ? ` (see LESSONS.md - run /lesson to promote)` : ""}`,
    ``,
    `| task | label | status | files | +/- | depth (floor 30%) | debt (lint-count) | verifier | wall | PR |`,
    `|---|---|---|---|---|---|---|---|---|---|`,
    ...results.map(taskRow),
    ``,
    `debt is a LINT-COUNT axis: eslint counts literals, so hoisting an off-scale value into a named`,
    `constant clears a violation with zero pixels moved. A cleared debt column is NOT evidence of`,
    `visual change - read it beside the depth column, which is the axis that measures movement.`,
    ``,
  ].join("\n")
  const headline =
    `RUN COMPLETE. ${readyForReview}/${queueLength} ready for review, ${blocked} blocked, ${failed} failed, ` +
    `${noWork} produced NO WORK, ${flagged} flagged, ${lessonCount} lesson candidate(s). ` +
    `${totals.files} file(s) changed, +${totals.insertions}/-${totals.deletions}; ` +
    `${totals.belowFloor} of ${totals.orders} measured order(s) below the 30% depth floor. ` +
    `${completionLine || "surface completion: NOT MEASURED"}`
  return { summary, headline }
}

/**
 * The ratio the whole harness exists to move, printed where the operator
 * actually looks. It appears in no drive command in the documented path, so a
 * night could report "16/16 ready for review" while 0 of 804 cells were done.
 * The oracle exits non-zero on any shortfall - that is its normal state - so
 * the ratio is read from its output, and a failure to produce one is reported
 * as UNAVAILABLE rather than quietly omitted.
 */
function surfaceCompletionLine(repoPath) {
  const oracle = join(repoPath, "tools", "check-surface-coverage.mjs")
  if (!existsSync(oracle)) return `surface completion: UNAVAILABLE - ${oracle} does not exist`
  const run = spawnSync(process.execPath, [oracle], { cwd: repoPath, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  const lines = String(run.stdout || "").split("\n")
  const done = lines.find((line) => /cells DONE/.test(line))
  const touched = lines.find((line) => /^\s*touched\s/.test(line))
  if (!done) return `surface completion: UNAVAILABLE - tools/check-surface-coverage.mjs printed no ratio (exit ${run.status}${run.error ? `, ${run.error.code}` : ""})`
  return `surface completion: ${done.trim()}${touched ? `; ${touched.trim().replace(/\s{2,}/g, " ")}` : ""} - only a human tick in signoff.json grants a cell`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const dir = resolve(opts.dir)
  const runDir = join(dir, "runs", stamp())
  mkdirSync(runDir, { recursive: true })
  const logPath = join(runDir, "run.log")
  const statusPath = join(runDir, "STATUS.md")
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`
    process.stdout.write(line + "\n")
    appendFileSync(logPath, line + "\n")
  }

  // Load-bearing state, read loudly. A truncated queue.json used to yield
  // "0 bundle(s). Nothing to do." and exit 0 with every prompt generated beside
  // it, and a corrupt config.json silently reverted to DEFAULTS while the log
  // printed the default model as though the operator had chosen it.
  let config
  let queue
  try {
    config = { ...DEFAULTS, ...(readJsonFile(join(dir, "config.json"), { optional: true, shape: "object" }) ?? {}) }
    if (!Array.isArray(config.repos) || !config.repos.length) {
      throw new Error(`${join(dir, "config.json")} sets "repos" to something other than a non-empty array. The engine has no repo to drive.`)
    }
    queue = readJsonFile(join(dir, "queue.json"), { shape: "array" })
    if (!queue.length) throw new Error(`${join(dir, "queue.json")} is an empty array. There is nothing queued, which is a broken setup, not a successful run. Regenerate it with tools/drive-queue.mjs.`)
  } catch (error) {
    log(`ABORTING: ${error.message}`)
    process.exitCode = 1
    return
  }

  // The label must say what was actually asked for: a plain `--dry-run` used to
  // announce itself as "drive --sleep starting", so a run.log reader concluded
  // an unattended overnight run had been launched when none was.
  const modeLabel = opts.dryRun ? "drive (dry run)" : opts.attended ? "drive (attended)" : "drive --sleep"
  log(`${modeLabel} starting: ${queue.length} bundle(s), model=${config.model}, per-task timeout ${Math.round(config.perTaskTimeoutMs / 60000)}min`)

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
  const workRepoPath = resolve(config.repos[0].path)
  let consecutiveFailures = 0
  let previousTaskId = "pre-run"
  let halted = false
  const writeStatus = () => {
    const rows = results.map(taskRow).join("\n")
    writeFileSync(
      statusPath,
      `# drive status\n\n| bundle | label | status | files | +/- | depth (floor 30%) | debt (lint-count) | verifier | wall | PR |\n|---|---|---|---|---|---|---|---|---|---|\n${rows}\n`,
    )
  }
  // One breaker, one place. The same six lines were pasted at three exits and
  // are the reason a night of no-ops must halt rather than run to completion.
  const recordHardFailure = (id, label, summary) => {
    results.push({ id, label, status: "failed", pr: null, summary })
    writeStatus()
    consecutiveFailures += 1
    if (consecutiveFailures >= config.maxConsecutiveFailures) {
      log(`Circuit breaker: ${consecutiveFailures} consecutive hard failures. Halting rather than burning the rest of the night.`)
      halted = true
    }
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
    // reset, recorded by the driver so no child report can move it. The branch
    // tips are recorded with it, so a commit this child produces can be told
    // from one an earlier bundle left behind.
    const bundleBaseSha = git(workRepoPath, ["rev-parse", "HEAD"]).stdout.trim()
    const tipsBeforeChild = branchTips(workRepoPath)

    const promptPath = join(dir, "prompts", `task-${task.id}.md`)
    const rawPromptText = existsSync(promptPath) ? readFileSync(promptPath, "utf8") : task.prompt || ""
    if (!rawPromptText.trim()) {
      // Preflight already errors on this shape; reaching it here means the
      // prompt vanished mid-run. That is a FAILURE that feeds the circuit
      // breaker, never a quiet skip - a skip once buried a whole queue.
      log(`  no prompt for task ${task.id} (looked in ${promptPath}); recording FAILED.`)
      recordHardFailure(task.id, task.label, `missing prompt (${promptPath})`)
      if (halted) break
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
      recordHardFailure(task.id, task.label, substituted.problem)
      if (halted) break
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

    const reported = runTask(task, config, promptText)
    // MEASURE FIRST, then derive. What the child produced is read from git
    // against the driver's own base, and every gate judges that explicit range -
    // never whatever HEAD the child left checked out.
    const work = measureChildWork(workRepoPath, bundleBaseSha, tipsBeforeChild)
    const observedPr = openPrFor(workRepoPath, work.branch)
    const record = {
      id: task.id,
      label: task.label,
      model: reported.model,
      elapsedMs: reported.elapsedMs,
      raw: reported.raw,
      work,
      pr: observedPr || reported.claim?.pr || null,
      prSource: observedPr ? "driver-observed" : reported.claim?.pr ? "claimed by the child, no open PR found for its branch" : null,
    }
    if (Array.isArray(task.workOrders) && task.workOrders.length && work.head) {
      record.gates = measureGates(task, config, bundleBaseSha, work.head)
      for (const gate of record.gates) {
        log(`  gate: ${gate.command} -> exit ${gate.exit}`)
        for (const line of gate.tail ? gate.tail.split("\n") : []) log(`    ${line}`)
      }
    }
    record.depth = depthReadings(record.gates)
    record.debt = { queued: typeof task.debt === "number" ? task.debt : null, measured: debtReadings(record.gates) }
    const derived = reported.failure
      ? { status: "failed", claimedStatus: null, note: reported.failure }
      : deriveOutcome(reported.claim, work, record.gates, { requirePr: config.push !== false, prUrl: record.pr })
    record.status = derived.status
    if (derived.claimedStatus && derived.claimedStatus !== derived.status) record.claimedStatus = derived.claimedStatus
    record.summary = [derived.note, reported.claim?.summary].filter(Boolean).join(" | ")
    results.push(record)
    log(
      `  status=${record.status} files=${work.files} +${work.insertions}/-${work.deletions} commits=${work.commits} ` +
        `depth=${taskDepth(record)} debt=${taskDebt(record)} (LINT-COUNT axis, not visual change) pr=${record.pr || "-"} (${Math.round(record.elapsedMs / 1000)}s)`,
    )
    if (record.summary) log(`  summary: ${record.summary}`)

    // The verifier is no longer bought off by a null PR. It grades whatever the
    // child produced: its PR, or the driver-measured commit range when it opened
    // none - a shape the generated prompt's own JSON schema offers, and which
    // used to buy total exemption from the independent grader.
    const verifyRange = work.head ? `${bundleBaseSha}..${work.head}` : null
    if (config.verify && !opts.attended && SUCCESS_STATUSES.has(record.status) && (record.pr || verifyRange)) {
      log(`  verifying [${task.id}] against acceptance criteria (independent ${config.verifyModel})...`)
      const verdict = verifyTask(task, config, promptText, record.pr, record.gates, bundleBaseSha, verifyRange)
      record.verdict = verdict.verdict
      record.verifyReasons = verdict.reasons
      if (config.push && record.pr) postVerdictComment(record.pr, verdict, log)
      log(`  verifier=${verdict.verdict} criteriaMet=${verdict.criteriaMet} parityOk=${verdict.parityOk}`)
      if (verdict.lesson) lessons.push({ id: task.id, label: task.label, source: "verifier", text: verdict.lesson })
    }
    if (record.status === "blocked" || record.status === "failed" || record.status === NO_WORK) {
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

    // A bundle that produced nothing is a hard failure for the breaker: a night
    // of no-ops must halt, not run to completion and print all-green.
    const hardFailure = record.status === "failed" || record.status === "unknown" || record.status === NO_WORK
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

  const report = buildRunReport(results, queue.length, lessons.length, surfaceCompletionLine(workRepoPath))
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
