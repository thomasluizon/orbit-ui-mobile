#!/usr/bin/env node
/**
 * night-run driver: drain a queue of tasks overnight, one FRESH `claude -p` per task.
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
 * works on its own branch off an up-to-date base and ends at a DRAFT PR. The driver never merges
 * and returns every repo to its base branch between tasks.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const DEFAULTS = {
  model: "opus",
  fallbackModel: "sonnet",
  permissionMode: "bypassPermissions",
  perTaskBudgetUsd: 4,
  totalBudgetUsd: 20,
  perTaskTimeoutMs: 60 * 60 * 1000,
  maxConsecutiveFailures: 2,
  allowedTools: [],
  disallowedTools: ["Bash(rm -rf *)", "Bash(git reset --hard*)", "Bash(git push --force*)"],
  addDirs: [],
  baseBranch: "main",
  push: true,
  repos: [{ path: ".", base: "main" }],
}

const TAINTED_ENV = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY",
]

function parseArgs(argv) {
  const out = { dir: ".claude/night-run", dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) out.dir = argv[++i]
    else if (argv[i] === "--dry-run") out.dryRun = true
  }
  return out
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

/** Return each repo to its base branch, stashing (never discarding) any leftover changes. */
function resetReposToBase(repos, log) {
  for (const repo of repos) {
    const repoPath = resolve(repo.path)
    if (!isClean(repoPath)) {
      git(repoPath, ["stash", "push", "-u", "-m", `night-run leftovers ${stamp()}`])
      log(`  stashed leftover changes in ${repo.path} (recoverable via 'git stash list')`)
    }
    if (currentBranch(repoPath) !== repo.base) git(repoPath, ["checkout", repo.base])
    git(repoPath, ["pull", "--ff-only"])
  }
}

function preflight(config, repos) {
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
  }
  return problems
}

/** Pull the last balanced {...} JSON object out of the child's final message. */
function parseStatusLine(resultText) {
  const candidates = [...String(resultText).matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]).reverse()
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed.status === "string") return parsed
    } catch {
      continue
    }
  }
  return null
}

function buildClaudeArgs(config) {
  const args = ["-p", "--output-format", "json", "--model", config.model, "--permission-mode", config.permissionMode]
  args.push("--max-budget-usd", String(config.perTaskBudgetUsd))
  if (config.fallbackModel) args.push("--fallback-model", config.fallbackModel)
  if (config.allowedTools?.length) args.push("--allowedTools", config.allowedTools.join(" "))
  if (config.disallowedTools?.length) args.push("--disallowedTools", config.disallowedTools.join(" "))
  for (const dir of config.addDirs || []) args.push("--add-dir", resolve(dir))
  return args
}

function runTask(task, config, promptText, log) {
  const started = Date.now()
  const run = spawnSync("claude", buildClaudeArgs(config), {
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
    return { status: "failed", cost: 0, pr: null, summary: reason, elapsedMs, raw: String(run.stderr || "").slice(-500) }
  }

  const outer = (() => {
    try {
      return JSON.parse(run.stdout)
    } catch {
      return null
    }
  })()
  const cost = Number(outer?.total_cost_usd ?? outer?.cost_usd ?? 0) || 0
  const resultText = outer?.result ?? run.stdout ?? ""
  if (!outer || outer.is_error) {
    return { status: "failed", cost, pr: null, summary: "child reported an error", elapsedMs, raw: String(resultText).slice(-500) }
  }

  const line = parseStatusLine(resultText)
  if (!line) {
    return { status: "unknown", cost, pr: null, summary: "no status line in child output", elapsedMs, raw: String(resultText).slice(-500) }
  }
  return {
    status: line.status,
    cost,
    pr: line.pr || null,
    summary: String(line.summary || "").slice(0, 500),
    elapsedMs,
  }
}

function main() {
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

  log(`night-run starting: ${queue.length} task(s), model=${config.model}, per-task cap $${config.perTaskBudgetUsd}, total cap $${config.totalBudgetUsd}`)
  if (!queue.length) {
    log("queue.json is empty. Nothing to do.")
    return
  }

  const problems = preflight(config, config.repos)
  if (problems.length) {
    log("PREFLIGHT FAILED:")
    for (const p of problems) log(`  - ${p}`)
    log("Aborting before any task ran.")
    return
  }
  if (opts.dryRun) {
    log("DRY RUN. Preflight passed. Tasks that would run:")
    for (const task of queue) log(`  - [${task.id}] ${task.label}`)
    return
  }

  const results = []
  let spent = 0
  let consecutiveFailures = 0
  const writeStatus = () => {
    const rows = results.map((r) => `| ${r.id} | ${r.label} | ${r.status} | $${r.cost.toFixed(2)} | ${r.pr || "-"} |`).join("\n")
    writeFileSync(
      statusPath,
      `# night-run status\n\nSpent so far: $${spent.toFixed(2)} / $${config.totalBudgetUsd}\n\n| task | label | status | cost | PR |\n|---|---|---|---|---|\n${rows}\n`,
    )
  }

  for (const task of queue) {
    if (existsSync(join(dir, "STOP"))) {
      log("STOP flag found. Halting gracefully before the next task.")
      break
    }
    if (spent >= config.totalBudgetUsd) {
      log(`Total budget cap ($${config.totalBudgetUsd}) reached. Halting.`)
      break
    }

    log(`--- task [${task.id}] ${task.label} ---`)
    resetReposToBase(config.repos, log)

    const promptPath = join(dir, "prompts", `task-${task.id}.md`)
    const promptText = (() => {
      try {
        return readFileSync(promptPath, "utf8")
      } catch {
        return task.prompt || ""
      }
    })()
    if (!promptText.trim()) {
      log(`  no prompt for task ${task.id}; skipping.`)
      results.push({ id: task.id, label: task.label, status: "skipped", cost: 0, pr: null, summary: "missing prompt" })
      writeStatus()
      continue
    }

    const outcome = runTask(task, config, promptText, log)
    spent += outcome.cost
    const record = { id: task.id, label: task.label, ...outcome }
    results.push(record)
    writeFileSync(join(runDir, `task-${task.id}.json`), JSON.stringify(record, null, 2))
    log(`  status=${outcome.status} cost=$${outcome.cost.toFixed(2)} pr=${outcome.pr || "-"} (${Math.round(outcome.elapsedMs / 1000)}s)`)
    if (outcome.summary) log(`  summary: ${outcome.summary}`)
    writeStatus()

    const hardFailure = outcome.status === "failed" || outcome.status === "unknown"
    consecutiveFailures = hardFailure ? consecutiveFailures + 1 : 0
    if (consecutiveFailures >= config.maxConsecutiveFailures) {
      log(`Circuit breaker: ${consecutiveFailures} consecutive hard failures. Halting to avoid burning budget.`)
      break
    }
  }

  resetReposToBase(config.repos, log)
  const done = results.filter((r) => r.status === "done").length
  const summary = [
    `# night-run summary`,
    ``,
    `- tasks attempted: ${results.length} / ${queue.length}`,
    `- completed (done): ${done}`,
    `- total spent: $${spent.toFixed(2)} / $${config.totalBudgetUsd}`,
    ``,
    `| task | label | status | cost | PR |`,
    `|---|---|---|---|---|`,
    ...results.map((r) => `| ${r.id} | ${r.label} | ${r.status} | $${r.cost.toFixed(2)} | ${r.pr || "-"} |`),
    ``,
  ].join("\n")
  writeFileSync(join(runDir, "SUMMARY.md"), summary)
  log(`DONE. ${done}/${queue.length} completed, $${spent.toFixed(2)} spent. Summary: ${join(runDir, "SUMMARY.md")}`)
}

main()
