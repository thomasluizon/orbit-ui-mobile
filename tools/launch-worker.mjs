#!/usr/bin/env node
/**
 * Supervise ONE headless worker for one ticket, in the foreground. This process IS the watchdog:
 * the orchestrator runs it as a background shell task, so this process's death is the orchestrator's
 * wake signal. It spawns the worker as its own child, holds two clocks over it, kills the whole
 * process tree when either expires, and prints one JSON result. It launches a worker; it never
 * merges, reviews, or moves a Linear issue.
 *
 * THE CHILD'S EXIT CODE IS NEVER PROOF OF DELIVERY. openai/codex#19945 exits 0 with zero output
 * when detached from a TTY, and anthropics/claude-code#25629 hangs after emitting its own success
 * event. What this script reports is what the process did, not what the ticket got. Delivery is
 * verified out of band by tools/verify-delivery.mjs.
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, extname, join, resolve } from "node:path"

import { githubEnvironment, redactSecrets } from "./lib/github-auth.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { bodyEditInvalidationPath, clearBodyEditInvalidation, persistBodyEditInvalidation } from "./lib/body-edit-invalidation.mjs"
import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"
import { withDegradedReviewFirst } from "./lib/pr-body.mjs"
import { clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: launch-worker.mjs --issue ORB-N --worktree <path> --prompt <file> [options]
       launch-worker.mjs --issue ORB-N --review --repo <ui|api|landing> --prompt <file> [options]

  --issue ORB-N      Linear issue this worker is for (required)
  --worktree <path>  the existing worktree the worker runs in (required, implementer only)
  --prompt <file>    the composed work order. MUST live outside the worktree, or the worker commits
                     it. Only its path is handed to the worker, never its text (required)
  --review           launch the REVIEWER instead of the implementer: the reviewer engine and the
                     "review" model tier from .claude/orchestrator.json, running in the selected
                     repository's primary main checkout. Refuses --worktree, because a reviewer inside the worktree reads the
                     PR's own AGENTS.md, which is instructions written by the change under review
  --repo <key>       required with --review. Selects the configured primary main checkout; a bare
                     PR number is never resolved from the caller's cwd
  --codex-only       record that this is the Claude-quota-exhausted fallback run. It changes
                     nothing about the implementer, which is the same model in both modes. With
                     --review it DOES move the reviewer onto the worker engine's review tier,
                     because Claude is the engine that is unavailable. That review is same-vendor
                     and DEGRADED; the orchestrator says so, this launcher only resolves it
  --command-timeout-seconds <s>
                     hard bound for post-worker GitHub calls (default: 45)
  --dry-run          print the resolved plan as JSON and exit 0, spawning nothing
  --help, -h         print this usage and exit 0

Prints one JSON object on stdout when the worker is gone: issue, engine, tier, pid, logFile,
startedAt, endedAt, exitCode, outcome. Progress goes to stderr, so stdout stays pipeable.
outcome is EXITED, KILLED_HARD_CEILING, KILLED_NO_PROGRESS or SPAWN_FAILED.

exit codes: 0 the worker exited on its own, 1 this launcher killed it or it never started,
            2 usage or config error, 3 the worker executable could not be resolved`

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

const issue = argOf("--issue")
const worktreeArg = argOf("--worktree")
const promptArg = argOf("--prompt")
const repoKey = argOf("--repo")
const review = process.argv.includes("--review")
const codexOnly = process.argv.includes("--codex-only")
const dryRun = process.argv.includes("--dry-run")
const commandTimeoutSeconds = Number(argOf("--command-timeout-seconds") ?? "45")

if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)
if (review && worktreeArg) {
  fail(2, `${USAGE}\n\n--review refuses --worktree: the reviewer runs in the main checkout, never in the worktree, so it cannot read the PR's own AGENTS.md as instructions`)
}
if (review && (!repoKey || repoKey.startsWith("--"))) fail(2, `${USAGE}\n\n--review requires --repo`)
if (!review && (!worktreeArg || worktreeArg.startsWith("--"))) fail(2, `${USAGE}\n\n--worktree is required`)
if (!promptArg || promptArg.startsWith("--")) fail(2, `${USAGE}\n\n--prompt is required`)
if (!Number.isFinite(commandTimeoutSeconds) || commandTimeoutSeconds <= 0) fail(2, `${USAGE}\n\n--command-timeout-seconds requires a positive number`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
if (review && typeof config.repos?.[repoKey] !== "string") fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ") || "none"})`)

if (review && ["ui", "api"].includes(repoKey)) {
  const relativePaths = [join(".claude", "skills", "pr-review", "SKILL.md"), join(".claude", "skills", "pr-review", "rubric.md")]
  const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
  for (const relativePath of relativePaths) {
    const uiPath = join(config.repos.ui, relativePath)
    const apiPath = join(config.repos.api, relativePath)
    let matches = false
    try {
      matches = digest(uiPath) === digest(apiPath)
    } catch (error) {
      fail(2, `pr-review parity could not read ${relativePath}: ${error.message}`)
    }
    if (!matches) fail(2, `pr-review parity failed for ${relativePath}: UI is canonical and API must match before an API review can launch`)
  }
}

const runDirectory = review ? resolve(config.repos[repoKey]) : resolve(worktreeArg)
if (!existsSync(runDirectory)) fail(2, `worktree not found: ${runDirectory}`)
const promptFile = resolve(promptArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
if (normalize(promptFile).startsWith(`${normalize(runDirectory)}/`)) {
  const what = review ? "review order" : "work order"
  fail(2, `prompt file lives inside ${runDirectory}; a ${what} written into a repository gets committed. Write it to the session scratchpad instead`)
}

const gitIn = (args) => {
  const result = spawnSync("git", ["-C", runDirectory, ...args], { encoding: "utf8", windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : ""
}
const branch = gitIn(["rev-parse", "--abbrev-ref", "HEAD"])
if (!branch) fail(2, `${runDirectory} is not a git worktree`)
if (review && branch !== "main") fail(2, `--review --repo ${repoKey} requires the configured primary checkout on main; found ${branch} in ${runDirectory}`)
/**
 * --codex-only is the CLAUDE-QUOTA-EXHAUSTED fallback, so its reviewer cannot be config.reviewer:
 * that names the one engine known to be unavailable whenever the flag is passed. It resolves the
 * worker engine at the review tier instead, which is Sol at xhigh against the implementer's high,
 * exactly as the skill's model-routing table specifies. Same-vendor review is DEGRADED and the
 * orchestrator must print that in its opening line and in the PR body, but a degraded review is
 * still a review, and a reviewer that cannot start is not.
 */
const engineName = review && !codexOnly ? config.reviewer : config.worker
const engine = config.workers[engineName]
if (!engine.command) fail(2, `.claude/orchestrator.json names ${review ? "reviewer" : "worker"} "${engineName}" but carries no command for it`)

/**
 * One ticket, one worker, one model: "default" is the only tier an IMPLEMENTER ever resolves. The
 * reviewer is the other half, and it is why the "review" tier exists in the config at all: a
 * cross-vendor reviewer in a fresh session, which is the invariant step 8 of /orchestrate rests on.
 */
let invocation
try {
  invocation = resolveWorkerInvocation(engineName, engine, review ? "review" : "default")
} catch (error) {
  fail(2, error.message)
}
const hardCeilingMs = config.timeouts.hardCeilingMinutes * 60 * 1000
const noProgressMs = config.timeouts.noProgressMinutes * 60 * 1000

const workerPointer = (worktreePath, branch) => review
  ? `Read ${promptFile} and execute it in full. That file is your complete review order for ${issue}. You are reviewing a diff, not the repository, and you do not fix what you find. Do not summarise the file back to me, start the review now.`
  : `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now.`

/**
 * Resolve a bare command the way the platform's launcher does, so the result is a real file rather
 * than a name Node will refuse. On win32 only PATHEXT candidates count: npm also drops an
 * extensionless shell script next to the shim, and Windows cannot execute it.
 */
const resolveOnPath = (command) => {
  if (command.includes("/") || command.includes("\\")) {
    return existsSync(command) ? resolve(command) : null
  }
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""]
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
  }
  return null
}

/**
 * Node has refused to spawn a `.cmd` or `.bat` without `shell: true` since the CVE-2024-27980 fix,
 * and `spawn("codex.cmd", ...)` throws EINVAL before codex ever starts. `shell: true` avoids the
 * errno but hands the worker pointer to cmd.exe to re-parse, and that pointer is a positional
 * prompt carrying spaces and quotes, which is the ORB-88 mangled-prompt class. So resolve the npm
 * shim to the script it execs and spawn Node on that: the argv array survives with no shell in the
 * path. Verified against the installed codex.cmd, whose last line is
 * `"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*`. A shim that does not match
 * that shape fails closed here rather than falling through to a spawn known to throw.
 */
const NPM_SHIM_SCRIPT = /"%dp0%\\+([^"]+\.js)"/i
const headlessInvocation = () => {
  const resolved = resolveOnPath(engine.command)
  if (!resolved) {
    fail(3, `could not resolve the ${engineName} worker executable "${engine.command}" on PATH; a headless launch has no shell to resolve it later`)
  }
  if (!/\.(?:cmd|bat)$/i.test(resolved)) return { executable: resolved, scriptArgs: [] }
  let shim
  try {
    shim = readFileSync(resolved, "utf8")
  } catch (error) {
    fail(3, `could not read the ${engineName} shim ${resolved}: ${error.message}`)
  }
  const match = shim.match(NPM_SHIM_SCRIPT)
  if (!match) {
    fail(3, `${resolved} is a ${extname(resolved)} shim that tools/launch-worker.mjs cannot run headlessly: Node refuses to spawn it without a shell, and no "%dp0%...js" script line was found to spawn directly. Point .claude/orchestrator.json at the executable or the script itself.`)
  }
  const script = resolve(dirname(resolved), match[1])
  if (!existsSync(script)) {
    fail(3, `${resolved} names the script ${script}, which does not exist`)
  }
  return { executable: process.execPath, scriptArgs: [script] }
}

const { executable, scriptArgs } = headlessInvocation()
const workerArgs = [...scriptArgs, ...invocation.args, workerPointer(runDirectory, branch)]
/** Outside every repo: a log written into the worktree lands in the worker's own diff. */
const logDirectory = join(tmpdir(), "orbit-workers")
mkdirSync(logDirectory, { recursive: true })
const logFile = join(logDirectory, `${issue}-${Date.now()}.log`)

if (dryRun) {
  console.log(JSON.stringify({ issue, engine: engineName, tier: invocation.tier, model: invocation.model, codexOnly, review, repositoryKey: repoKey, runDirectory, branch, promptFile, executable, args: workerArgs, logFile, dryRun: true }, null, 2))
  process.exit(0)
}

console.error(`starting the ${engineName} ${review ? "reviewer" : "worker"} for ${issue} in ${runDirectory}; log: ${logFile}`)
const startedAt = new Date().toISOString()
const logFd = openSync(logFile, "a")
/**
 * stdin is CLOSED, never "inherit" and never "pipe": an inherited-but-unwritten stdin pipe hangs
 * `codex exec` forever on Windows (openai/codex#20919). The marker in the env is what lets the
 * orchestrator hook tell this launcher's `codex exec` from a hand-typed one.
 *
 * ORCA_CLI_COMMAND is the orca-linear skill's FIRST binary-resolution rule, and setting it here is
 * what keeps a worker off its last one: bare `orca`, which is not on PATH on this machine. Measured
 * on ORB-87, where the worker resolved bare `orca`, hit "not recognized as a name of a cmdlet", and
 * correctly stopped rather than falling through to another executable. It delivered nothing in 54s.
 */
let githubAuth
try {
  githubAuth = await githubEnvironment(runDirectory)
} catch (error) {
  fail(3, redactSecrets(error.message))
}
const child = spawn(executable, workerArgs, {
  cwd: runDirectory,
  stdio: ["ignore", logFd, logFd],
  windowsHide: true,
  // POSIX only, and it is what makes killTree's `process.kill(-pid)` reach anything at all: the
  // child becomes a process-group leader, so the group exists to be signalled. Windows needs the
  // opposite, since detached there spawns a console window; taskkill /T already walks that tree.
  detached: process.platform !== "win32",
  env: {
    ...githubAuth.environment,
    ORBIT_LAUNCH_WORKER: "1",
    ORCA_CLI_COMMAND: process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca",
  },
})

/**
 * THIS process, not the child, is what the orchestrator backgrounds and what its exit re-invokes the
 * session with, so this pid is the run's real wake source. Registering it here is what lets the Stop
 * hook prove an unattended run has something live to wake it rather than take its word: a run that
 * ended a turn claiming "CI will wake me" with nothing scheduled ended the whole night on 2026-08-06.
 */
registerWakeSource({ pid: process.pid, what: `${review ? "reviewer" : "worker"} ${issue}`, workerPid: child.pid ?? null, logFile, startedAt })

let finishing = false
const finish = async (outcome, exitCode) => {
  if (finishing) return
  finishing = true
  if (codexOnly && !review) {
    try {
      const GH = process.env.GH_BIN || "gh"
      const gh = async (args, input) => {
        const result = await runBounded(GH, args, { cwd: runDirectory, env: githubAuth.environment, timeoutMs: commandTimeoutSeconds * 1000, maxBuffer: 16 * 1024 * 1024, input })
        if (result.timedOut) throw new Error(`GitHub command timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated`)
        if (result.overflowed) throw new Error("GitHub command exceeded the 16 MiB output bound; the complete child process tree was terminated")
        if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim())
        return result.stdout
      }
      const listed = JSON.parse(await gh(["pr", "list", "--head", branch, "--json", "number,body,baseRefOid,headRefOid,statusCheckRollup"]))
      if (Array.isArray(listed) && listed.length === 1) {
        const body = withDegradedReviewFirst(listed[0].body)
        if (body !== listed[0].body) {
          const gitPath = await runBounded("git", ["-C", runDirectory, "rev-parse", "--git-path", "orbit-body-edit-invalidations"], { cwd: runDirectory, timeoutMs: commandTimeoutSeconds * 1000, maxBuffer: 1024 * 1024 })
          if (gitPath.timedOut || gitPath.overflowed || gitPath.error || gitPath.status !== 0 || !gitPath.stdout.trim()) {
            throw new Error(`could not resolve the repository-local PR-body invalidation path: ${(gitPath.stderr || gitPath.stdout || gitPath.error?.message || `exit ${gitPath.status}`).trim()}`)
          }
          const markerPath = bodyEditInvalidationPath({ worktree: runDirectory, gitPath: gitPath.stdout.trim(), prNumber: listed[0].number })
          persistBodyEditInvalidation({
            path: markerPath,
            prNumber: listed[0].number,
            headSha: listed[0].headRefOid,
            baseSha: listed[0].baseRefOid,
            statusCheckRollup: listed[0].statusCheckRollup,
          })
          try {
            await gh(["pr", "edit", String(listed[0].number), "--body-file", "-"], body)
          } catch (error) {
            clearBodyEditInvalidation(markerPath)
            throw error
          }
        }
      }
    } catch (error) {
      console.error(`could not enforce the degraded PR body marker: ${redactSecrets(error.message, githubAuth.secrets)}`)
      outcome = "PR_BODY_ENFORCEMENT_FAILED"
    }
  }
  // Body enforcement is part of the supervised launch. Keep the wake source registered until its
  // bounded GitHub children have finished, otherwise an unattended queue can lose its only wakeup.
  clearWakeSource(process.pid)
  closeSync(logFd)
  const result = { issue, engine: engineName, tier: invocation.tier, model: invocation.model, codexOnly, pid: child.pid ?? null, logFile, startedAt, endedAt: new Date().toISOString(), exitCode, outcome }
  console.log(JSON.stringify(result, null, 2))
  process.exit(outcome === "EXITED" ? 0 : 1)
}

/** The worker spawns its own children (git, npm, subagents), and killing the parent alone leaves
 * them running against the worktree this launch is about to hand back. */
const killTree = (pid) => {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { encoding: "utf8", windowsHide: true })
    return
  }
  try {
    // Negative pid signals the process GROUP, which only exists because the spawn below sets
    // detached on POSIX. Without that, spawn puts the child in this process's group, `-pid` names
    // a group that was never created, and the kill silently no-ops on ESRCH while a hung worker
    // outlives both clocks. detached does NOT make it fire-and-forget: this launcher never calls
    // unref(), so it still supervises the child and still exits when the child does.
    process.kill(-pid)
  } catch {
    /* a tree that is already gone still ends this launch; the exit handler reports what happened */
  }
}

/**
 * node_modules is the setup hook's writes, not the worker's, and walking it every sample costs more
 * than the signal is worth. .git is excluded because index locks and gc churn without the worker.
 */
const newestMtimeUnder = (directory) => {
  let newest = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const path = join(directory, entry.name)
    try {
      newest = Math.max(newest, entry.isDirectory() ? newestMtimeUnder(path) : statSync(path).mtimeMs)
    } catch {
      /* a path the worker removed between the readdir and the stat is not progress to measure */
    }
  }
  return newest
}

/**
 * Both halves are needed for an implementer: one that edits without committing moves only the
 * mtime, and one that commits an already-written tree moves only HEAD.
 *
 * A REVIEWER moves neither. It writes its findings to the session scratchpad and never touches the
 * checkout it reads from, so the tree fingerprint is constant and the no-progress clock would kill
 * every review at ten minutes. Its log is the honest signal: it grows on every tool call.
 */
const progressFingerprint = () => {
  if (review) {
    try {
      const log = statSync(logFile)
      return `${log.size}:${log.mtimeMs}`
    } catch {
      return "no-log-yet"
    }
  }
  return `${gitIn(["rev-parse", "HEAD"])}:${newestMtimeUnder(runDirectory)}`
}

let outcome = "EXITED"
const ceiling = setTimeout(() => {
  outcome = "KILLED_HARD_CEILING"
  console.error(`${issue} passed the ${config.timeouts.hardCeilingMinutes} minute ceiling; killing the worker process tree`)
  killTree(child.pid)
}, hardCeilingMs)

let progress = progressFingerprint()
let lastProgressAt = Date.now()
const sampler = setInterval(() => {
  const sampled = progressFingerprint()
  if (sampled !== progress) {
    progress = sampled
    lastProgressAt = Date.now()
    return
  }
  if (Date.now() - lastProgressAt < noProgressMs) return
  outcome = "KILLED_NO_PROGRESS"
  console.error(`${issue} has not moved HEAD or written a file for ${config.timeouts.noProgressMinutes} minutes; killing the worker process tree`)
  killTree(child.pid)
}, config.timeouts.pollSeconds * 1000)

child.on("error", (error) => {
  clearTimeout(ceiling)
  clearInterval(sampler)
  console.error(`could not start the ${engineName} worker: ${error.message}`)
  void finish("SPAWN_FAILED", null)
})

child.on("exit", (code) => {
  clearTimeout(ceiling)
  clearInterval(sampler)
  void finish(outcome, code)
})
