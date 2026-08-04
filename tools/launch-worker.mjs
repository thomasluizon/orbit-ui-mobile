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
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, extname, join, resolve } from "node:path"

import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: launch-worker.mjs --issue ORB-N --worktree <path> --prompt <file> [options]

  --issue ORB-N      Linear issue this worker is for (required)
  --worktree <path>  the existing worktree the worker runs in (required)
  --prompt <file>    the composed work order. MUST live outside the worktree, or the worker commits
                     it. Only its path is handed to the worker, never its text (required)
  --codex-only       record that this is the Claude-quota-exhausted fallback run. It changes
                     nothing about the implementer, which is the same model in both modes
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
const codexOnly = process.argv.includes("--codex-only")
const dryRun = process.argv.includes("--dry-run")

if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)
if (!worktreeArg || worktreeArg.startsWith("--")) fail(2, `${USAGE}\n\n--worktree is required`)
if (!promptArg || promptArg.startsWith("--")) fail(2, `${USAGE}\n\n--prompt is required`)

const worktreePath = resolve(worktreeArg)
if (!existsSync(worktreePath)) fail(2, `worktree not found: ${worktreePath}`)
const promptFile = resolve(promptArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
if (normalize(promptFile).startsWith(`${normalize(worktreePath)}/`)) {
  fail(2, `prompt file lives inside the worktree (${worktreePath}); a work order committed into its own PR. Write it to the session scratchpad instead`)
}

const gitIn = (args) => {
  const result = spawnSync("git", ["-C", worktreePath, ...args], { encoding: "utf8", windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : ""
}
const branch = gitIn(["rev-parse", "--abbrev-ref", "HEAD"])
if (!branch) fail(2, `${worktreePath} is not a git worktree`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const engineName = config.worker
const engine = config.workers[engineName]
if (!engine.command) fail(2, `.claude/orchestrator.json names worker "${engineName}" but carries no command for it`)

/** One ticket, one worker, one model: "default" is the only tier an implementer ever resolves. */
let invocation
try {
  invocation = resolveWorkerInvocation(engineName, engine, "default")
} catch (error) {
  fail(2, error.message)
}
const hardCeilingMs = config.timeouts.hardCeilingMinutes * 60 * 1000
const noProgressMs = config.timeouts.noProgressMinutes * 60 * 1000

const workerPointer = (worktreePath, branch) => `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now.`

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
const workerArgs = [...scriptArgs, ...invocation.args, workerPointer(worktreePath, branch)]
/** Outside every repo: a log written into the worktree lands in the worker's own diff. */
const logDirectory = join(tmpdir(), "orbit-workers")
mkdirSync(logDirectory, { recursive: true })
const logFile = join(logDirectory, `${issue}-${Date.now()}.log`)

if (dryRun) {
  console.log(JSON.stringify({ issue, engine: engineName, tier: invocation.tier, model: invocation.model, codexOnly, worktreePath, branch, promptFile, executable, args: workerArgs, logFile, dryRun: true }, null, 2))
  process.exit(0)
}

console.error(`starting the ${engineName} worker for ${issue} in ${worktreePath}; log: ${logFile}`)
const startedAt = new Date().toISOString()
const logFd = openSync(logFile, "a")
/**
 * stdin is CLOSED, never "inherit" and never "pipe": an inherited-but-unwritten stdin pipe hangs
 * `codex exec` forever on Windows (openai/codex#20919). The marker in the env is what lets the
 * orchestrator hook tell this launcher's `codex exec` from a hand-typed one.
 */
const child = spawn(executable, workerArgs, {
  cwd: worktreePath,
  stdio: ["ignore", logFd, logFd],
  windowsHide: true,
  env: { ...process.env, ORBIT_LAUNCH_WORKER: "1" },
})

const finish = (outcome, exitCode) => {
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

/** Both halves are needed: a worker that edits without committing moves only the mtime, and a
 * worker that commits an already-written tree moves only HEAD. */
const progressFingerprint = () => `${gitIn(["rev-parse", "HEAD"])}:${newestMtimeUnder(worktreePath)}`

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
  finish("SPAWN_FAILED", null)
})

child.on("exit", (code) => {
  clearTimeout(ceiling)
  clearInterval(sampler)
  finish(outcome, code)
})
