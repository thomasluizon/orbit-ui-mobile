#!/usr/bin/env node
/**
 * drive engine: run a queue of bundles/tasks, one FRESH `claude -p` per task.
 *
 * Two modes (one engine):
 *  - ATTENDED (`--attended`, the default `/drive` path): readline gates — approve each bundle
 *    before it runs, review its draft PR after. The human is the verifier, so the auto-verifier
 *    is off. No `/clear` ever: each bundle is a fresh headless process, so context never accrues.
 *  - UNATTENDED (`--sleep`, no `--attended`): the proven overnight queue-drain, UNCHANGED — no
 *    gates, an independent Sonnet verifier grades each draft PR. This is the old `/night-run`.
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
 * works on its own branch off an up-to-date base and ends at a DRAFT PR. The driver never merges
 * and returns every repo to its base branch between tasks.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline/promises"

const DEFAULTS = {
  model: "opus",
  fallbackModel: "sonnet",
  modelOverride: null,
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
  verify: true,
  verifyModel: "sonnet",
  verifyBudgetUsd: 2,
  verifyTimeoutMs: 20 * 60 * 1000,
  verifyAllowedTools: ["Read", "Grep", "Glob", "Bash(gh pr diff:*)", "Bash(gh pr view:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)"],
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

/** Return each repo to its base branch, stashing (never discarding) any leftover changes. */
function resetReposToBase(repos, log) {
  for (const repo of repos) {
    const repoPath = resolve(repo.path)
    if (!isClean(repoPath)) {
      git(repoPath, ["stash", "push", "-u", "-m", `drive leftovers ${stamp()}`])
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
  args.push("--max-budget-usd", String(config.perTaskBudgetUsd))
  if (config.fallbackModel) args.push("--fallback-model", config.fallbackModel)
  if (config.allowedTools?.length) args.push("--allowedTools", config.allowedTools.join(" "))
  if (config.disallowedTools?.length) args.push("--disallowedTools", config.disallowedTools.join(" "))
  for (const dir of config.addDirs || []) args.push("--add-dir", resolve(dir))
  return args
}

function runTask(task, config, promptText, log) {
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
    return { status: "failed", model, cost: 0, pr: null, summary: reason, elapsedMs, raw: String(run.stderr || "").slice(-500) }
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
    return { status: "failed", model, cost, pr: null, summary: "child reported an error", elapsedMs, raw: String(resultText).slice(-500) }
  }

  const line = parseJsonLine(resultText, "status")
  if (!line) {
    return { status: "unknown", model, cost, pr: null, summary: "no status line in child output", elapsedMs, raw: String(resultText).slice(-500) }
  }
  return {
    status: line.status,
    model,
    cost,
    pr: line.pr || null,
    summary: String(line.summary || "").slice(0, 500),
    elapsedMs,
  }
}

/**
 * Build the independent-verifier prompt. The verifier never sees the maker's reasoning trail
 * (fresh context, only the diff + the acceptance criteria) — the structural reason a separate
 * grader outperforms self-critique. Read-only by allowlist; posture reinforced in the prompt.
 */
function buildVerifyPrompt(task, promptText, prUrl) {
  const uiClause = task.ui
    ? `5. UI/DESIGN: this task changed UI. Review the JSX/CSS/token diff against DESIGN.md — semantic tokens only, NO decorative glow or gradient wash, base-4 spacing, and the AI-slop test. (You are headless: do NOT claim any pixel/rendered check you did not actually run; a static diff review against DESIGN.md is the expected depth here.)\n`
    : ""
  return `You are an INDEPENDENT VERIFIER for an unattended overnight engineering run. You did
NOT write this code and must not defer to any claim the implementer made — judge ONLY the
artifact against the acceptance criteria below.

TASK — acceptance criteria (verbatim):
${promptText}

The implementer opened this draft PR: ${prUrl}
Inspect the ACTUAL change, do not trust the summary:
- \`gh pr diff ${prUrl}\` for the full diff (and the paired orbit-api PR if the task was cross-repo).
- Read any file you need for surrounding context.

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
  args.push("--max-budget-usd", String(config.verifyBudgetUsd))
  if (config.fallbackModel) args.push("--fallback-model", config.fallbackModel)
  if (config.verifyAllowedTools?.length) args.push("--allowedTools", config.verifyAllowedTools.join(" "))
  for (const dir of config.addDirs || []) args.push("--add-dir", resolve(dir))
  return args
}

/** Run the independent verifier over a task's draft PR. Its cost is returned so the caller adds it to spend. */
function verifyTask(task, config, promptText, prUrl) {
  const started = Date.now()
  const run = spawnSync("claude", buildVerifyArgs(config), {
    input: buildVerifyPrompt(task, promptText, prUrl),
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
    return { verdict: "UNSURE", cost: 0, reasons: reason, lesson: null, elapsedMs }
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
  const line = parseJsonLine(resultText, "verdict")
  if (!line) {
    return { verdict: "UNSURE", cost, reasons: "verifier returned no verdict line", lesson: null, elapsedMs }
  }
  return {
    verdict: line.verdict,
    criteriaMet: line.criteria_met === true,
    parityOk: line.parity_ok === true,
    reasons: String(line.reasons || "").slice(0, 600),
    lesson: line.lesson && line.lesson !== "null" ? String(line.lesson).slice(0, 300) : null,
    cost,
    elapsedMs,
  }
}

/** Post the verifier verdict onto the draft PR so it is visible at review time. Best-effort. */
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

  log(`${opts.attended ? "drive (attended)" : "drive --sleep"} starting: ${queue.length} bundle(s), model=${config.model}, per-task cap $${config.perTaskBudgetUsd}, total cap $${config.totalBudgetUsd}`)
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
  const lessons = []
  let spent = 0
  let consecutiveFailures = 0
  const row = (r) => `| ${r.id} | ${r.label} | ${r.status} | ${r.verdict || "-"} | $${r.cost.toFixed(2)} | ${r.pr || "-"} |`
  const writeStatus = () => {
    const rows = results.map(row).join("\n")
    writeFileSync(
      statusPath,
      `# drive status\n\nSpent so far: $${spent.toFixed(2)} / $${config.totalBudgetUsd}\n\n| bundle | label | status | verifier | cost | PR |\n|---|---|---|---|---|---|\n${rows}\n`,
    )
  }

  const rl = opts.attended ? createInterface({ input: process.stdin, output: process.stdout }) : null
  const ask = async (q) => (rl ? (await rl.question(q)).trim().toLowerCase() : "")
  if (opts.attended) log("ATTENDED mode: you approve each bundle before it runs and review its draft PR after (auto-verifier off — you are the verifier).")

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
        results.push({ id: task.id, label: task.label, status: "skipped", cost: 0, pr: null, summary: "skipped by user" })
        writeStatus()
        continue
      }
    }

    const outcome = runTask(task, config, promptText, log)
    spent += outcome.cost
    const record = { id: task.id, label: task.label, ...outcome }
    results.push(record)
    log(`  status=${outcome.status} cost=$${outcome.cost.toFixed(2)} pr=${outcome.pr || "-"} (${Math.round(outcome.elapsedMs / 1000)}s)`)
    if (outcome.summary) log(`  summary: ${outcome.summary}`)

    if (config.verify && !opts.attended && outcome.pr && (outcome.status === "done" || outcome.status === "blocked")) {
      log(`  verifying [${task.id}] against acceptance criteria (independent ${config.verifyModel})...`)
      const verdict = verifyTask(task, config, promptText, outcome.pr)
      spent += verdict.cost
      record.verdict = verdict.verdict
      record.verifyCost = verdict.cost
      record.verifyReasons = verdict.reasons
      if (config.push) postVerdictComment(outcome.pr, verdict, log)
      log(`  verifier=${verdict.verdict} criteriaMet=${verdict.criteriaMet} parityOk=${verdict.parityOk} cost=$${verdict.cost.toFixed(2)}`)
      if (verdict.lesson) lessons.push({ id: task.id, label: task.label, source: "verifier", text: verdict.lesson })
    }
    if (outcome.status === "blocked" || outcome.status === "failed") {
      lessons.push({ id: task.id, label: task.label, source: outcome.status, text: outcome.summary || outcome.raw || "(no detail)" })
    }

    writeFileSync(join(runDir, `task-${task.id}.json`), JSON.stringify(record, null, 2))
    writeStatus()

    if (opts.attended) {
      const ans = await ask(`  -> ${outcome.status}${outcome.pr ? " " + outcome.pr : ""} — review the draft PR, then: continue to next bundle? [continue / stop] `)
      if (ans === "stop" || ans === "s") {
        log("Stopped by user after review.")
        break
      }
      continue
    }

    const hardFailure = outcome.status === "failed" || outcome.status === "unknown"
    consecutiveFailures = hardFailure ? consecutiveFailures + 1 : 0
    if (consecutiveFailures >= config.maxConsecutiveFailures) {
      log(`Circuit breaker: ${consecutiveFailures} consecutive hard failures. Halting to avoid burning budget.`)
      break
    }
  }

  if (rl) rl.close()
  resetReposToBase(config.repos, log)
  const done = results.filter((r) => r.status === "done").length
  const flagged = results.filter((r) => r.verdict === "DISAGREE").length

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

  const summary = [
    `# drive summary`,
    ``,
    `- tasks attempted: ${results.length} / ${queue.length}`,
    `- completed (done): ${done}`,
    `- verifier flagged (DISAGREE): ${flagged}`,
    `- lesson candidates: ${lessons.length}${lessons.length ? ` (see LESSONS.md — run /lesson to promote)` : ""}`,
    `- total spent: $${spent.toFixed(2)} / $${config.totalBudgetUsd}`,
    ``,
    `| task | label | status | verifier | cost | PR |`,
    `|---|---|---|---|---|---|`,
    ...results.map(row),
    ``,
  ].join("\n")
  writeFileSync(join(runDir, "SUMMARY.md"), summary)
  log(`DONE. ${done}/${queue.length} completed, ${flagged} flagged, ${lessons.length} lesson candidate(s), $${spent.toFixed(2)} spent. Summary: ${join(runDir, "SUMMARY.md")}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
