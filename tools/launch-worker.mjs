#!/usr/bin/env node
/**
 * Supervise ONE headless worker for one ticket, in the foreground. This process IS the watchdog:
 * the orchestrator runs it as a background shell task, so this process's death is the orchestrator's
 * wake signal. It spawns the worker as its own child, holds two clocks over it, kills the whole
 * process tree when either expires, and prints one JSON result. It launches a worker; it never
 * merges, reviews, or moves a ticket.
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

import { githubEnvironment, redactSecrets } from "./lib/github-auth.mjs"
import { resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"
import { clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: launch-worker.mjs --issue <ORB-N|#N|N> --worktree <path> --prompt <file> [options]

  --issue <reference> migrated ORB identifier or GitHub issue reference (required)
  --worktree <path>  the existing worktree the worker runs in (required)
  --prompt <file>    the composed work order. MUST live outside the worktree, or the worker commits
                     it. Only its path is handed to the worker, never its text (required)
  --measurement      this ticket's work IS measurement (Lighthouse, a benchmark, a profile), so it
                     legitimately writes no file for long stretches. Uses
                     timeouts.measurementNoProgressMinutes instead of noProgressMinutes. The hard
                     ceiling is unchanged, so a measurement worker that really is hung still dies
  --hard-ceiling-minutes <n>
                     this ticket's hard ceiling, replacing timeouts.hardCeilingMinutes for this one
                     launch. For a ticket that legitimately outruns the fleet-wide default
  --dry-run          print the resolved plan as JSON and exit 0, spawning nothing
  --help, -h         print this usage and exit 0

Prints one JSON object on stdout when the worker is gone: issue, engine, tier, pid, logFile,
startedAt, endedAt, exitCode, outcome, plus what the run left in the tree: commitsSinceLaunch,
commits and treeClean. Progress goes to stderr, so stdout stays pipeable.
outcome is EXITED, KILLED_HARD_CEILING, KILLED_NO_PROGRESS, KILLED_LOG_RUNAWAY or SPAWN_FAILED.

exit codes: 0 the worker exited on its own, 1 this launcher killed it or it never started,
            2 usage or config error, 3 the worker executable could not be resolved,
            4 this launcher killed it but the tree holds commits it made, so the work may be salvageable`

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

const issueArgument = argOf("--issue")
const worktreeArg = argOf("--worktree")
const promptArg = argOf("--prompt")
const hardCeilingArg = argOf("--hard-ceiling-minutes")
const measurement = process.argv.includes("--measurement")
const dryRun = process.argv.includes("--dry-run")

let issue
try {
  const resolvedTicket = resolveTicket(issueArgument)
  issue = resolvedTicket.identifier ?? `#${resolvedTicket.number}`
} catch (error) {
  fail(2, `${USAGE}\n\n--issue must be ORB-N, #N, or N: ${error.message}`)
}
if (!worktreeArg || worktreeArg.startsWith("--")) fail(2, `${USAGE}\n\n--worktree is required`)
if (!promptArg || promptArg.startsWith("--")) fail(2, `${USAGE}\n\n--prompt is required`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}

/**
 * This launcher starts implementers only. The harness runs no reviewer of its own: Pullfrog reviews
 * every pull request in GitHub Actions and publishes the `pullfrog-approval` required check, so the
 * review verdict reaches readiness through branch protection rather than through a model session
 * this process would have to launch, bound, and keep pinned to a head.
 */
const runDirectory = resolve(worktreeArg)
if (!existsSync(runDirectory)) fail(2, `worktree not found: ${runDirectory}`)
const promptFile = resolve(promptArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
if (normalize(promptFile).startsWith(`${normalize(runDirectory)}/`)) {
  fail(2, `prompt file lives inside ${runDirectory}; a work order written into a repository gets committed. Write it to the session scratchpad instead`)
}

const gitIn = (args) => {
  const result = spawnSync("git", ["-C", runDirectory, ...args], { encoding: "utf8", windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : ""
}
const branch = gitIn(["rev-parse", "--abbrev-ref", "HEAD"])
if (!branch) fail(2, `${runDirectory} is not a git worktree`)
/** Where the worker starts from, so a kill can report what the run added rather than make the
 * orchestrator re-derive it from git on every exit. */
const startHead = gitIn(["rev-parse", "HEAD"])
const engineName = config.worker
const engine = config.workers[engineName]
if (!engine.command) fail(2, `.claude/orchestrator.json names worker "${engineName}" but carries no command for it`)

/** One ticket, one worker, one model: "default" is the only tier this launcher ever resolves. */
let invocation
try {
  invocation = resolveWorkerInvocation(engineName, engine, "default")
} catch (error) {
  fail(2, error.message)
}
/** Per-launch override for a ticket that legitimately outruns the fleet-wide default: three of the
 * six 2026-08-22 kills were the 45-minute cap on tickets whose work simply takes longer (#358). */
const hardCeilingMinutes = hardCeilingArg === null ? config.timeouts.hardCeilingMinutes : Number(hardCeilingArg)
if (hardCeilingArg !== null && !(Number.isFinite(hardCeilingMinutes) && hardCeilingMinutes > 0)) {
  fail(2, `${USAGE}\n\n--hard-ceiling-minutes must be a positive number, got "${hardCeilingArg}"`)
}
const hardCeilingMs = hardCeilingMinutes * 60 * 1000

/**
 * THE no-progress cap punished work whose whole job is measurement.
 *
 * The clock samples HEAD and file mtimes, so a ticket that RUNS a benchmark looks byte for byte like
 * a hung worker: no commit, no file written, for minutes at a time. ORB-225 was killed mid-Lighthouse
 * on 2026-08-08 with real measurements sitting in its log and zero commits. It only succeeded on a
 * second attempt, after those measurements were recovered by hand and injected into the work order.
 * Lighthouse, benchmarks, profiling and bundle-size tickets all share that shape.
 *
 * The first fix was a longer cap for those tickets, and log growth was rejected as a signal then
 * because ORB-201's runaway wrote 61.73 MB in 37 minutes while delivering nothing. That objection
 * died when caps.workerLogMegabytes started killing exactly that flood by byte count: with the
 * runaway bounded, log growth became an honest liveness signal, and the sampler now counts it, next
 * to process-tree CPU, after six FINISHED workers were killed in one night for running long test
 * suites (#358, 2026-08-22). The measurement cap stays for work that is silent on every signal,
 * and the hard ceiling still bounds everything: a worker that really is hung dies at the ceiling.
 */
const measurementNoProgressMinutes = config.timeouts.measurementNoProgressMinutes
if (measurement && !(Number.isFinite(measurementNoProgressMinutes) && measurementNoProgressMinutes > config.timeouts.noProgressMinutes)) {
  fail(2, `--measurement requires timeouts.measurementNoProgressMinutes in .claude/orchestrator.json, greater than noProgressMinutes (${config.timeouts.noProgressMinutes})`)
}
const noProgressMinutes = measurement ? measurementNoProgressMinutes : config.timeouts.noProgressMinutes
const noProgressMs = noProgressMinutes * 60 * 1000

const workerPointer = (worktreePath, branch) =>
  `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now.`

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
  console.log(JSON.stringify({ issue, engine: engineName, tier: invocation.tier, model: invocation.model, measurement, noProgressMinutes, hardCeilingMinutes, runDirectory, branch, promptFile, executable, args: workerArgs, logFile, dryRun: true }, null, 2))
  process.exit(0)
}

console.error(`starting the ${engineName} worker for ${issue} in ${runDirectory}; log: ${logFile}`)
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
registerWakeSource({ pid: process.pid, what: `worker ${issue}`, workerPid: child.pid ?? null, logFile, startedAt })

let finishing = false
const finish = (outcome, exitCode) => {
  if (finishing) return
  finishing = true
  clearWakeSource(process.pid)
  closeSync(logFd)
  /**
   * What the run left in the tree, read once here so the orchestrator does not have to call git to
   * tell a kill that discarded nothing from one that discarded nine finished commits (#358). The
   * exit code carries the same distinction: on 2026-08-22 six killed workers all exited identically
   * while every one of them held complete, committed work.
   */
  const commits = startHead ? gitIn(["log", "--format=%h %s", `${startHead}..HEAD`]).split("\n").filter(Boolean) : []
  const porcelain = spawnSync("git", ["-C", runDirectory, "status", "--porcelain"], { encoding: "utf8", windowsHide: true })
  const treeClean = porcelain.status === 0 && porcelain.stdout.trim() === ""
  const result = { issue, engine: engineName, tier: invocation.tier, model: invocation.model, measurement, noProgressMinutes, hardCeilingMinutes, pid: child.pid ?? null, logFile, startedAt, endedAt: new Date().toISOString(), exitCode, outcome, commitsSinceLaunch: commits.length, commits, treeClean }
  console.log(JSON.stringify(result, null, 2))
  if (outcome === "EXITED") process.exit(0)
  process.exit(commits.length > 0 ? 4 : 1)
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
 * Both halves are needed: a worker that edits without committing moves only the mtime, and one that
 * commits an already-written tree moves only HEAD.
 */
const progressFingerprint = () => `${gitIn(["rev-parse", "HEAD"])}:${newestMtimeUnder(runDirectory)}`

/**
 * Cumulative CPU milliseconds burned by a process and every currently running descendant, or null
 * when the probe cannot answer. One CIM query returns the whole table; KernelModeTime and
 * UserModeTime are 100 ns units. Confirmed against the live output of this exact command on this
 * machine (2026-08-23), whose first rows were, verbatim:
 *   [{"ProcessId":0,"ParentProcessId":0,"KernelModeTime":47697331093750,"UserModeTime":0},
 *    {"ProcessId":4,"ParentProcessId":0,"KernelModeTime":826359375000,"UserModeTime":0},
 *    {"ProcessId":140,"ParentProcessId":4,"KernelModeTime":0,"UserModeTime":0}]
 *
 * The number is a snapshot of LIVE processes, not an account of the whole tree's history: a child
 * that starts and exits between two polls contributes nothing, a child exiting mid-window makes the
 * total DROP, and a dead intermediate breaks the parent-pid chain, so live grandchildren behind it
 * are unreachable from the root. Windows does not re-parent orphans, and following a dead pid's key
 * would count strangers under a recycled pid, so a single snapshot cannot see across that break
 * without native job objects, complexity this harness does not warrant. The sampler clamps on a
 * drop rather than demanding a re-climb, and the shapes this blindness leaves, short-lived children
 * and an orphaned burner, are what the log signal covers, since the worker narrates work to its
 * log; a kill still requires every signal silent for the whole cap.
 *
 * Windows only, deliberately: this launcher runs on one Windows machine, and a POSIX `ps` parser
 * written here could not be confirmed against any real system (code standard 8). A null probe fails
 * toward the historical signals, never toward keeping a worker alive.
 */
const cpuMillisecondsOfTree = (rootPid) => {
  if (process.platform !== "win32" || !Number.isInteger(rootPid)) return null
  const query = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,KernelModeTime,UserModeTime | ConvertTo-Json -Compress"
  const result = spawnSync("powershell", ["-NoProfile", "-Command", query], { encoding: "utf8", windowsHide: true })
  if (result.status !== 0) return null
  let rows
  try {
    rows = JSON.parse(result.stdout)
  } catch {
    return null
  }
  if (!Array.isArray(rows)) return null
  const childrenOf = new Map()
  const cpuOf = new Map()
  for (const row of rows) {
    cpuOf.set(row.ProcessId, ((row.KernelModeTime ?? 0) + (row.UserModeTime ?? 0)) / 10_000)
    if (!childrenOf.has(row.ParentProcessId)) childrenOf.set(row.ParentProcessId, [])
    childrenOf.get(row.ParentProcessId).push(row.ProcessId)
  }
  let total = 0
  const queue = [rootPid]
  const seen = new Set()
  while (queue.length > 0) {
    const pid = queue.pop()
    if (seen.has(pid)) continue
    seen.add(pid)
    total += cpuOf.get(pid) ?? 0
    for (const childPid of childrenOf.get(pid) ?? []) queue.push(childPid)
  }
  return total
}

/**
 * 1.5% of one core across the probe window. A wedged or deadlocked tree sits at zero; a tree
 * driving a test suite or a build sits far above. The floor exists so a process that is merely
 * alive, timer ticks and nothing else, cannot hold the stall clock open forever.
 */
const CPU_PROGRESS_FRACTION = 0.015

let outcome = "EXITED"
const ceiling = setTimeout(() => {
  outcome = "KILLED_HARD_CEILING"
  console.error(`${issue} passed the ${hardCeilingMinutes} minute ceiling; killing the worker process tree`)
  killTree(child.pid)
}, hardCeilingMs)

/**
 * A worker that floods its own log is a runaway, and until now it died unexplained.
 *
 * Measured on the 2026-08-08 night, from the 30 logs it left behind. ORB-201 wrote 61.73 MB in 36.9
 * minutes, 28.6 KB/s, EIGHT times the next-fastest writer (ORB-162 at 3.6 KB/s), and its log is one
 * enormous `git diff`: 5,928 hunk headers and 41,215 deleted lines. It is the only log in the batch
 * carrying `ERROR codex_core::tools::router: error=code-mode host closed its stdout`, and ORB-162
 * died 3 seconds later mid-write with no error line at all.
 *
 * That proximate failure is the vendor's code-mode host, not this harness, and it is named as such
 * rather than papered over. What IS the harness's is that nothing bounded the flood that preceded
 * it. This turns an unexplained death into a named outcome with the byte count attached.
 *
 * The child writes to the log fd directly, so this samples rather than rotates: re-plumbing a
 * running child's stdio is not possible, and the sampler already runs on the same clock.
 */
const logMegabyteCap = config.caps?.workerLogMegabytes
const logByteCap = Number.isFinite(logMegabyteCap) && logMegabyteCap > 0 ? logMegabyteCap * 1024 * 1024 : null

/**
 * Progress is any of three signals, tested cheapest first (#358, after six workers holding
 * finished, committed work were killed in one night as "stalled"):
 *   1. HEAD moved or a file changed under the run directory, the original fingerprint.
 *   2. The worker log grew. The worker streams to it continuously, so a long `dotnet test`, a CI
 *      wait, or a model turn all show up here while writing nothing to the tree. Safe to count only
 *      because KILLED_LOG_RUNAWAY bounds a flood by byte count, which is what answers ORB-201.
 *   3. The process tree burned real CPU since the last silent sample. This is the honest signal for
 *      a child that computes without writing, and the probe enumerates every process on the
 *      machine, so it runs only when both cheap signals are static, which is exactly the situation
 *      that used to count toward a kill.
 * A tree that is idle on all three for noProgressMinutes is still killed, as it must be.
 */
let progress = progressFingerprint()
let lastProgressAt = Date.now()
let lastLogSize = 0
let cpuBaseline = null
const sampler = setInterval(() => {
  let logSize = null
  try {
    logSize = statSync(logFile).size
  } catch {
    /* a log that cannot be stat'd is neither a runaway nor progress */
  }
  if (logByteCap !== null && logSize !== null && logSize > logByteCap) {
    outcome = "KILLED_LOG_RUNAWAY"
    console.error(`${issue} wrote ${(logSize / 1048576).toFixed(2)} MB of worker log, past the ${logMegabyteCap} MB cap; killing the worker process tree`)
    killTree(child.pid)
    return
  }
  const noteProgress = () => {
    lastProgressAt = Date.now()
    if (logSize !== null) lastLogSize = logSize
    cpuBaseline = null
  }
  const sampled = progressFingerprint()
  if (sampled !== progress) {
    progress = sampled
    noteProgress()
    return
  }
  // Log growth counts ONLY while the byte cap bounds it. Without a configured cap there is no
  // KILLED_LOG_RUNAWAY, so a flooding hung worker could hold this signal open to the ceiling, which
  // is the exact ORB-201 objection. An uncapped config keeps the historical signals instead.
  if (logByteCap !== null && logSize !== null && logSize > lastLogSize) {
    noteProgress()
    return
  }
  const cpuMs = cpuMillisecondsOfTree(child.pid)
  const now = Date.now()
  if (cpuMs !== null) {
    if (cpuBaseline === null || cpuMs < cpuBaseline.cpuMs) {
      // First silent sample, or a child exited and took its CPU time out of the snapshot. Rebase
      // rather than compare: measuring against the higher pre-exit total would demand the survivors
      // re-earn a dead child's whole history before any burn counted again.
      cpuBaseline = { cpuMs, at: now }
    } else if (cpuMs - cpuBaseline.cpuMs >= (now - cpuBaseline.at) * CPU_PROGRESS_FRACTION) {
      cpuBaseline = { cpuMs, at: now }
      lastProgressAt = now
      return
    }
  }
  if (now - lastProgressAt < noProgressMs) return
  outcome = "KILLED_NO_PROGRESS"
  console.error(`${issue} has not moved HEAD, written a file, grown its log or burned CPU for ${noProgressMinutes} minutes${measurement ? " (measurement cap)" : ""}; killing the worker process tree`)
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
