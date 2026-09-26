#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { githubEnvironment, redactSecrets } from "./lib/github-auth.mjs"
import { ADMISSION_REFUSED_EXIT, checkAdmission, releaseAdmission } from "./lib/admission.mjs"
import { resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"
import { clearWakeSource, clearWorkerLaunchReservation, recordReservedWorkerPid, registerWakeSource, reserveWorkerLaunch } from "./lib/run-state.mjs"

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
  --tier <default|mechanical>
                     worker profile for this order (default: default)
  --relaunch-reason <text>
                     deliberate reason for launching after this branch reaches its configured cap
  --dry-run          print the resolved plan as JSON and exit 0, spawning nothing
  --help, -h         print this usage and exit 0

Prints one JSON object on stdout when the worker is gone: issue, engine, tier, pid, logFile,
startedAt, endedAt, exitCode, outcome, plus what the run left in the tree: commitsSinceLaunch,
commits and treeClean. Progress goes to stderr, so stdout stays pipeable.
outcome is EXITED, KILLED_HARD_CEILING, KILLED_NO_PROGRESS, KILLED_LOG_RUNAWAY or SPAWN_FAILED.

exit codes: 0 the worker exited on its own, 1 this launcher killed it or it never started,
            2 usage or config error, 3 the worker executable could not be resolved,
            4 this launcher killed it but the tree holds commits it made, so the work may be salvageable,
            8 admission refused new ticket work before reservation`

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
const tierValue = argOf("--tier")
const tierArgument = tierValue ?? "default"
const relaunchReasonArgument = argOf("--relaunch-reason")
const measurement = process.argv.includes("--measurement")
const dryRun = process.argv.includes("--dry-run")

if ((process.argv.includes("--tier") && typeof tierValue !== "string") || !new Set(["default", "mechanical"]).has(tierArgument)) {
  fail(2, `${USAGE}\n\n--tier must be default or mechanical, got "${tierArgument}"`)
}
if (process.argv.includes("--relaunch-reason") && (typeof relaunchReasonArgument !== "string" || relaunchReasonArgument.startsWith("--") || relaunchReasonArgument.trim() === "")) {
  fail(2, `${USAGE}\n\n--relaunch-reason must be non-empty text`)
}

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

let invocation
try {
  invocation = resolveWorkerInvocation(engineName, engine, tierArgument)
} catch (error) {
  fail(2, error.message)
}
const hardCeilingMinutes = hardCeilingArg === null ? config.timeouts.hardCeilingMinutes : Number(hardCeilingArg)
if (hardCeilingArg !== null && !(Number.isFinite(hardCeilingMinutes) && hardCeilingMinutes > 0)) {
  fail(2, `${USAGE}\n\n--hard-ceiling-minutes must be a positive number, got "${hardCeilingArg}"`)
}
const hardCeilingMs = hardCeilingMinutes * 60 * 1000

const measurementNoProgressMinutes = config.timeouts.measurementNoProgressMinutes
if (measurement && !(Number.isFinite(measurementNoProgressMinutes) && measurementNoProgressMinutes > config.timeouts.noProgressMinutes)) {
  fail(2, `--measurement requires timeouts.measurementNoProgressMinutes in .claude/orchestrator.json, greater than noProgressMinutes (${config.timeouts.noProgressMinutes})`)
}
const noProgressMinutes = measurement ? measurementNoProgressMinutes : config.timeouts.noProgressMinutes
const noProgressMs = noProgressMinutes * 60 * 1000
const supervisionClockPath = process.env.ORBIT_TEST_SUPERVISION_CLOCK
let lastCompleteSupervisionTime = null
let supervisionSample = null
const publishSupervisionMarker = (path, contents) => {
  const unpublishedPath = `${path}.${process.pid}.unpublished`
  writeFileSync(unpublishedPath, contents)
  renameSync(unpublishedPath, path)
}
const supervisionNow = () => {
  if (!supervisionClockPath) return Date.now()
  const clockContents = readFileSync(supervisionClockPath, "utf8")
  const records = clockContents.split("\n")
  records.pop()
  let sampledTime = lastCompleteSupervisionTime
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].trim() === "") continue
    const clockValue = Number(records[index])
    if (!Number.isFinite(clockValue)) continue
    lastCompleteSupervisionTime = clockValue
    sampledTime = clockValue
    break
  }
  supervisionSample = { byteLength: Buffer.byteLength(clockContents), sampledTime }
  return sampledTime
}

const acknowledgeSupervisionSample = () => {
  if (!supervisionClockPath || supervisionSample === null) return
  publishSupervisionMarker(`${supervisionClockPath}.sampled-${supervisionSample.byteLength}`, String(supervisionSample.sampledTime))
}

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

const gitRepositoryIdentity = (directory) => {
  const result = spawnSync("git", ["-C", directory, "rev-parse", "--git-common-dir"], { encoding: "utf8", windowsHide: true })
  if (result.error || result.status !== 0 || result.stdout.trim() === "") return null
  try {
    const identity = realpathSync.native(resolve(directory, result.stdout.trim()))
    return process.platform === "win32" ? identity.toLowerCase() : identity
  } catch {
    return null
  }
}
const repositoryIdentity = gitRepositoryIdentity(runDirectory)
if (!repositoryIdentity) fail(2, `could not resolve the Git repository identity for ${runDirectory}`)
const repositoryKey = Object.entries(config.repos ?? {}).find(([, repository]) =>
  typeof repository === "string" && gitRepositoryIdentity(repository) === repositoryIdentity)?.[0]
if (!repositoryKey) fail(2, `${runDirectory} does not belong to a repository configured in .claude/orchestrator.json`)

let githubAuth
try {
  githubAuth = await githubEnvironment(runDirectory)
} catch (error) {
  const result = { admitted: false, reason: "ADMISSION_REFUSED", counts: { openPullRequests: null, queuedRuns: null }, limits: { maxOpenPullRequests: config.caps.maxOpenPullRequests, maxQueuedRuns: config.caps.maxQueuedRuns }, error: redactSecrets(error.message) }
  console.log(JSON.stringify(result))
  process.exit(ADMISSION_REFUSED_EXIT)
}
const admission = await checkAdmission({ config, repositoryKey, branch, environment: githubAuth.environment, worktree: runDirectory })
if (!admission.admitted) {
  console.log(JSON.stringify({ ...admission, error: admission.error ? redactSecrets(admission.error, githubAuth.secrets) : null }))
  process.exit(ADMISSION_REFUSED_EXIT)
}
process.on("exit", () => releaseAdmission(admission.reservationId))
let child
for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    if (child?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true })
      else { try { process.kill(-child.pid) } catch { /* child already exited */ } }
    }
    releaseAdmission(admission.reservationId)
    process.exit(exitCode)
  })
}

const timestamp = new Date().toISOString()
const reservation = reserveWorkerLaunch({
  launcherPid: process.pid,
  repositoryKey,
  branch,
  headSha: startHead,
  tier: invocation.tier,
  timestamp,
  relaunchReason: relaunchReasonArgument,
}, config.caps.workerLaunchesPerBranch, runDirectory)
if (!reservation.allowed) {
  if (reservation.occupiedWorkerPid) fail(2, `worktree ${runDirectory} already has a live worker pid ${reservation.occupiedWorkerPid}`)
  if (reservation.occupiedLauncherPid !== undefined) fail(2, `worktree ${runDirectory} already has a launcher pid ${reservation.occupiedLauncherPid ?? "unknown"}`)
  const earlier = reservation.earlierLaunches.map((launch, index) =>
    `  ${index + 1}. ${launch.timestamp} tier=${launch.tier} head=${launch.headSha}`).join("\n")
  fail(2, `worker launch cap ${config.caps.workerLaunchesPerBranch} reached for ${repositoryKey} branch ${branch}. Earlier launches:\n${earlier}\nPass --relaunch-reason "<text>" to record and allow another launch.`)
}

console.error(`starting the ${engineName} worker for ${issue} in ${runDirectory}; log: ${logFile}`)
const startedAt = new Date().toISOString()
/**
 * The orchestrator backgrounds this launcher. Register before any awaited setup or child spawn so
 * a Stop in that launch window can observe the live launcher. The reader expires this pending form
 * after 45 seconds, while the process identity still proves that the launcher itself really began.
 */
if (!registerWakeSource({ pid: process.pid, what: `worker ${issue}`, workerPid: null, logFile, startedAt, pending: true, pendingAt: startedAt })) {
  clearWorkerLaunchReservation(process.pid, runDirectory)
  fail(3, "could not register the pending launcher wake source")
}
const logFd = openSync(logFile, "a")
// The gate cannot enter the worktree until both records name its pid. If this launcher dies
// beforehand, its IPC channel closes and the gate exits without starting the real worker.
const gatePath = fileURLToPath(new URL("./lib/worker-gate.cjs", import.meta.url))
child = spawn(process.execPath, [gatePath], {
  cwd: tmpdir(),
  stdio: ["ignore", logFd, logFd, "ipc"],
  windowsHide: true,
  // POSIX only, and it is what makes killTree's `process.kill(-pid)` reach anything at all: the
  // child becomes a process-group leader, so the group exists to be signalled. Windows needs the
  // opposite, since detached there spawns a console window; taskkill /T already walks that tree.
  detached: process.platform !== "win32",
  env: {
    ...githubAuth.environment,
    ORBIT_LAUNCH_WORKER: "1",
    ORCA_CLI_COMMAND: process.env.ORCA_BIN || "orca",
  },
})
if (!child.pid || !recordReservedWorkerPid(process.pid, child.pid, runDirectory)) {
  child.kill()
  fail(3, "could not publish the worker pid in the worktree reservation")
}

if (!registerWakeSource({ pid: process.pid, what: `worker ${issue}`, workerPid: child.pid, logFile, startedAt })) {
  child.kill()
  fail(3, "could not publish the worker pid in the wake source")
}
child.send({ executable, args: workerArgs, directory: runDirectory })

let finishing = false
const finish = (outcome, exitCode) => {
  if (finishing) return
  finishing = true
  releaseAdmission(admission.reservationId)
  clearWakeSource(process.pid)
  clearWorkerLaunchReservation(process.pid, runDirectory)
  closeSync(logFd)
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

const processRows = () => {
  if (process.platform === "darwin") {
    // BSD ps `time` is user plus system CPU as minutes:seconds.hundredths. Read on the M5 Pro
    // hours. A row in any other shape is skipped; the sampler clamps a drop, never a rise.
    const result = spawnSync("ps", ["-A", "-o", "pid=,ppid=,time="], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } })
    if (result.status !== 0) return null
    const rows = []
    for (const line of result.stdout.split("\n")) {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+):(\d{2}\.\d{2})\s*$/.exec(line)
      if (match) rows.push({ pid: Number(match[1]), parentPid: Number(match[2]), cpuMilliseconds: (Number(match[3]) * 60 + Number(match[4])) * 1000 })
    }
    return rows
  }
  const query = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,KernelModeTime,UserModeTime | ConvertTo-Json -Compress"
  const result = spawnSync("powershell", ["-NoProfile", "-Command", query], { encoding: "utf8", windowsHide: true })
  if (result.status !== 0) return null
  try {
    const rows = JSON.parse(result.stdout)
    return Array.isArray(rows)
      ? rows.map((row) => ({ pid: row.ProcessId, parentPid: row.ParentProcessId, cpuMilliseconds: ((row.KernelModeTime ?? 0) + (row.UserModeTime ?? 0)) / 10_000 }))
      : null
  } catch {
    return null
  }
}

const cpuMillisecondsOfTree = (rootPid) => {
  if (!["win32", "darwin"].includes(process.platform) || !Number.isInteger(rootPid)) return null
  const rows = processRows()
  if (rows === null) return null
  const childrenOf = new Map()
  const cpuOf = new Map()
  for (const row of rows) {
    cpuOf.set(row.pid, row.cpuMilliseconds)
    if (!childrenOf.has(row.parentPid)) childrenOf.set(row.parentPid, [])
    childrenOf.get(row.parentPid).push(row.pid)
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

const logMegabyteCap = config.caps?.workerLogMegabytes
const logByteCap = Number.isFinite(logMegabyteCap) && logMegabyteCap > 0 ? logMegabyteCap * 1024 * 1024 : null

let progress = progressFingerprint()
let lastProgressAt = supervisionNow() ?? Date.now()
if (supervisionClockPath) publishSupervisionMarker(`${supervisionClockPath}.ready`, "ready")
let lastLogSize = 0
let cpuBaseline = null
const sampleProgress = () => {
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
    const now = supervisionNow()
    if (now !== null) lastProgressAt = now
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
  // An injected wall clock has no relationship to live process CPU. Clock-driven cases isolate
  // the filesystem and log signals rather than letting real CPU reset a virtual stall interval.
  const cpuMs = supervisionClockPath ? null : cpuMillisecondsOfTree(child.pid)
  const now = supervisionNow()
  if (now === null) return
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
}
const sampler = setInterval(() => {
  supervisionSample = null
  sampleProgress()
  acknowledgeSupervisionSample()
}, config.timeouts.pollSeconds * 1000)

child.on("error", (error) => {
  clearTimeout(ceiling)
  clearInterval(sampler)
  console.error(`could not start the ${engineName} worker: ${error.message}`)
  finish("SPAWN_FAILED", null)
})

child.on("message", (message) => {
  if (message?.type === "SPAWN_FAILED") outcome = "SPAWN_FAILED"
})

child.on("exit", (code) => {
  clearTimeout(ceiling)
  clearInterval(sampler)
  finish(outcome, code)
})
