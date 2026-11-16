#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { assertOutsideRepository, researchEnvironment, researchInvocation, researchPaths, researchPrompt } from "./lib/research-run.mjs"
import { freeEmulatorPort, protectedDirectories, readOnlyPaths, resultVerdict, runDirectorySnapshot, runDirectoryWrites, sandboxedInvocation, SANDBOX_EXEC, writeSandboxAvailable, writeSandboxProfile } from "./lib/review-run.mjs"
import { githubEnvironment, redactSecrets } from "./lib/github-auth.mjs"
import { ADMISSION_REFUSED_EXIT, checkAdmission, releaseAdmission } from "./lib/admission.mjs"
import { resolveTicket } from "./lib/github-issues.mjs"
import { logFinalResult, NO_STOP } from "./lib/claude-usage-limit.mjs"
import { readOrchestratorConfig, resolveWorkerInvocation, workerAccountEnvironment, workerAccounts } from "./lib/orchestrator-config.mjs"
import { clearWakeSource, clearWorkerLaunchReservation, recordReservedWorkerPid, registerWakeSource, reserveWorkerLaunch, readRunState, workerLaunchDirectory } from "./lib/run-state.mjs"

const USAGE = `usage: launch-worker.mjs --issue <ORB-N|#N|N> --worktree <path> --prompt <file> [options]

  Research: launch-worker.mjs --research --order <file> --out <scratchpad file> [--dry-run]
  --research         research in an empty temporary directory, without ticket admission or git writes
  --order <file>     non-empty research order outside every repository
  --out <file>       new findings file in an existing scratchpad directory outside every repository
                     Engine output is published only on successful completion. Uses the same
                     session load and launch-spacing gate as ticket work

  Read-only: launch-worker.mjs --review|--proof --order <file> --out <scratchpad file> --directory <path>
                     [--tier <t>] [--hard-ceiling-minutes <n>] [--measurement] [--dry-run]
  --review           a pre-push or fix-round review (tools/compose-prompt.mjs --review composes the order)
  --proof            a device proof (tools/compose-prompt.mjs --proof composes the order). The worker
                     gets ORBIT_DEVICE_PROOF=1, which lets the worker hook allow adb and emulator, and
                     a free emulator port pair from 5560: ORBIT_PROOF_EMULATOR_PORT=<port> and
                     ANDROID_SERIAL=emulator-<port>. The hook refuses each adb or emulator command
                     that names another device or port
  --directory <path> the directory the worker runs in: the root of a detached worktree at the head, or
                     a copy outside every repository
                     A read-only run uses the full tool set of its tier on the worker account, takes no
                     ticket admission and no branch launch slot, claims a git run directory against a
                     second launch, registers a wake source and keeps both clocks and the CPU probe.
                     It runs only on macOS, under sandbox-exec. The write profile refuses each write
                     to the directory that holds each configured repository, to each worktree of a
                     configured repository or of the run directory's repository, to each hygiene root,
                     to each git directory under the home directory and to the run directory's .git,
                     and it refuses each git network transport (git-remote-* and ssh). Only the run
                     directory and paths outside those stay writable. A before and after status of the
                     run directory finds a commit or a changed tracked file there. The worker writes
                     its result to a file the launcher names; the launcher publishes it to --out only
                     when the worker exits 0, the run directory holds no write, and the first line is
                     the mode's verdict line (VERDICT: CLEAN or VERDICT: DEFECTS (<n>), PROOF: PASS or
                     PROOF: FAIL (<n> defects))

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
  --tier <default|mechanical|deep|max>
                     worker profile for this order (default: default)
  --relaunch-reason <text>
                     deliberate reason for launching after this branch reaches its configured cap
  --dry-run          print the resolved plan as JSON and exit 0, spawning nothing. The plan names
                     account and configDirectory, the account a claude worker runs under
  --help, -h         print this usage and exit 0

Prints one JSON object on stdout when the worker is gone: issue, engine, tier, account, pid,
logFile, startedAt, endedAt, exitCode, outcome, usageLimitReached, authenticationFailed, resultError
and attempts, plus what the run left in the tree: commitsSinceLaunch, commits and treeClean.
Progress goes to stderr, so stdout stays pipeable. When ORBIT_WORKER_CLAUDE_CONFIG_DIR names the
worker account's directory, a claude worker runs on that account. When its final result is a
usage-limit error, the launcher relaunches the order once on the main account, the default Claude
config. When the variable is unset or empty, the worker runs on the main account once, with no
relaunch. attempts names the account, log and outcome of each run, and each log file name ends in
-worker-account.log or -main-account.log. authenticationFailed marks a sign-in the account could
not complete, such as a cancelled account, and resultError carries the final error text.
outcome is EXITED, KILLED_HARD_CEILING, KILLED_NO_PROGRESS, KILLED_LOG_RUNAWAY, STOPPED or SPAWN_FAILED.
A SIGINT or SIGTERM to this launcher ends the worker process tree, then publishes the result with STOPPED.
Research prints research, outputFile, published, engine, model, account, pid, logFile, startedAt, endedAt,
exitCode, outcome, authenticationFailed and resultError. It publishes only a non-empty final response from an engine that exits 0.
A read-only run prints mode, outputFile, published, verdict, writes, runDirectory, engine, tier, model,
account, configDirectory, pid, logFile, startedAt, endedAt, exitCode, outcome, usageLimitReached,
authenticationFailed, resultError and attempts. writes lists each write found in the run directory,
with kind (commit or tracked-change), directory and detail. A read-only dry run also prints
writeSandbox, the protected directories, and proofEmulatorPort.

exit codes: 0 the worker exited on its own, 1 this launcher killed it or it never started,
            2 usage or config error, including a worker account directory that does not exist,
            3 the worker executable could not be resolved,
            4 this launcher killed it but the tree holds commits it made, so the work may be salvageable,
            8 admission refused new ticket work before reservation,
            130 stopped by SIGINT, 143 stopped by SIGTERM
Research exits 0 only after publishing findings, 1 on engine, supervision or publication failure, or 130 or 143 when stopped.
A read-only run exits 0 only after publishing its result, 5 when it found a write, 1 on any other
engine, supervision or publication failure, 2 on a usage error, a held run directory or a platform with
no write sandbox, 3 when no emulator port is free for a proof, or 130 or 143 when stopped.`

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

const research = process.argv.includes("--research")
const readOnlyMode = ["--review", "--proof"].filter((flag) => process.argv.includes(flag)).map((flag) => flag.slice(2))
const readOnly = readOnlyMode.length > 0
const mode = readOnlyMode[0] ?? null
const orderArgument = argOf("--order")
const outputArgument = argOf("--out")
const directoryArgument = argOf("--directory")
const issueArgument = argOf("--issue")
const worktreeArg = argOf("--worktree")
const promptArg = argOf("--prompt")
const hardCeilingArg = argOf("--hard-ceiling-minutes")
const tierValue = argOf("--tier")
const tierArgument = tierValue ?? "default"
const relaunchReasonArgument = argOf("--relaunch-reason")
const measurement = process.argv.includes("--measurement")
const dryRun = process.argv.includes("--dry-run")

if ((process.argv.includes("--tier") && typeof tierValue !== "string") || !new Set(["default", "mechanical", "deep", "max"]).has(tierArgument)) {
  fail(2, `${USAGE}\n\n--tier must be default, mechanical, deep or max, got "${tierArgument}"`)
}
if (process.argv.includes("--relaunch-reason") && (typeof relaunchReasonArgument !== "string" || relaunchReasonArgument.startsWith("--") || relaunchReasonArgument.trim() === "")) {
  fail(2, `${USAGE}\n\n--relaunch-reason must be non-empty text`)
}

let researchPlan = null
let readOnlyPlan = null
if (readOnlyMode.length > 1 || (research && readOnly)) fail(2, `${USAGE}\n\nchoose one of --research, --review and --proof`)
if (research) {
  const allowed = new Set(["--research", "--order", "--out", "--dry-run"])
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index]
    if (!allowed.has(flag)) fail(2, `unsupported research option: ${flag}`)
    if (["--order", "--out"].includes(flag)) index++
  }
  try { researchPlan = researchPaths(orderArgument, outputArgument) } catch (error) { fail(2, error.message) }
} else if (readOnly) {
  const valueFlags = new Set(["--order", "--out", "--directory", "--tier", "--hard-ceiling-minutes"])
  const switches = new Set([`--${mode}`, "--measurement", "--dry-run"])
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index]
    if (valueFlags.has(flag)) index++
    else if (!switches.has(flag)) fail(2, `unsupported --${mode} option: ${flag}`)
  }
  try { readOnlyPlan = readOnlyPaths(orderArgument, outputArgument, directoryArgument, mode) } catch (error) { fail(2, error.message) }
} else {
  if (orderArgument !== null || outputArgument !== null) fail(2, "--order and --out require --research, --review or --proof")
  if (directoryArgument !== null) fail(2, "--directory requires --review or --proof")
  const valueFlags = new Set(["--issue", "--worktree", "--prompt", "--hard-ceiling-minutes", "--tier", "--relaunch-reason"])
  const switches = new Set(["--measurement", "--dry-run"])
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index]
    if (valueFlags.has(flag)) index++
    else if (!switches.has(flag)) fail(2, `${USAGE}\n\nunsupported option: ${flag}`)
  }
}

/** Ticket work names its ticket; the other modes name themselves in logs and wake sources. */
const ticketWork = !research && !readOnly
let issue = research ? "research" : mode
if (ticketWork) {
  try {
    const resolvedTicket = resolveTicket(issueArgument)
    issue = resolvedTicket.identifier ?? `#${resolvedTicket.number}`
  } catch (error) {
    fail(2, `${USAGE}\n\n--issue must be ORB-N, #N, or N: ${error.message}`)
  }
}
if (ticketWork && (!worktreeArg || worktreeArg.startsWith("--"))) fail(2, `${USAGE}\n\n--worktree is required`)
if (ticketWork && (!promptArg || promptArg.startsWith("--"))) fail(2, `${USAGE}\n\n--prompt is required`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
let launchRunState
try { launchRunState = readRunState() } catch (error) { fail(2, error.message) }
if (config.relay.enabled && launchRunState?.relay?.pending === true) {
  console.log(JSON.stringify({ admitted: false, reason: "ADMISSION_REFUSED", refusalReason: "RELAY_DRAIN", error: "RELAY_DRAIN" }))
  process.exit(ADMISSION_REFUSED_EXIT)
}

if (readOnly && !writeSandboxAvailable()) {
  fail(2, `--${mode} needs the macOS write sandbox (${SANDBOX_EXEC}), and ${process.platform} has none. A read-only worker never runs without it.`)
}

const researchStorage = research ? mkdtempSync(join(tmpdir(), "orbit-research-")) : null
const runDirectory = research ? join(researchStorage, "workspace") : readOnly ? readOnlyPlan.runDirectory : resolve(worktreeArg)
if (research) {
  mkdirSync(runDirectory)
  process.on("exit", () => rmSync(researchStorage, { recursive: true, force: true }))
  try { assertOutsideRepository(runDirectory, "research directory") } catch (error) { fail(2, error.message) }
}
/** The worker writes its result here; only the finish step copies it to --out. */
const readOnlyStorage = readOnly ? mkdtempSync(join(tmpdir(), `orbit-${mode}-`)) : null
const stagedResult = readOnly ? join(readOnlyStorage, "result.md") : null
if (readOnly) process.on("exit", () => rmSync(readOnlyStorage, { recursive: true, force: true }))
if (!existsSync(runDirectory)) fail(2, `worktree not found: ${runDirectory}`)
const promptFile = research ? researchPlan.orderFile : readOnly ? readOnlyPlan.orderFile : resolve(promptArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
if (normalize(promptFile).startsWith(`${normalize(runDirectory)}/`)) {
  fail(2, `prompt file lives inside ${runDirectory}; a work order written into a repository gets committed. Write it to the session scratchpad instead`)
}

const gitIn = (args) => {
  if (research) return ""
  const result = spawnSync("git", ["-C", runDirectory, ...args], { encoding: "utf8", windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : ""
}
const branch = gitIn(["rev-parse", "--abbrev-ref", "HEAD"])
if (ticketWork && !branch) fail(2, `${runDirectory} is not a git worktree`)
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
let accounts
try {
  accounts = workerAccounts(engineName, engine)
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
/** The relaunch after a usage-limit stop continues a run that may already hold commits. */
const continuationPointer = (worktreePath, branch) =>
  `${workerPointer(worktreePath, branch)} An earlier worker on this branch stopped at its account's usage limit before it finished. Read git log and git status first, keep the work it already did, and finish the order.`

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
const readOnlyPointer = () =>
  `Read ${promptFile} and execute it in full. That file is your complete order for a read-only ${mode} run. You are in ${runDirectory}. Write your complete result to ${stagedResult}; its first line is the verdict line the order names. Write no tracked file, commit, branch or push in any repository. Do not summarise the file back to me, start the work now.`
const workerArgs = research ? null : [...scriptArgs, ...invocation.args, readOnly ? readOnlyPointer() : workerPointer(runDirectory, branch)]
/**
 * A claude worker starts on the first account. With a worker account configured, the one relaunch
 * after a usage limit runs on the main account, the orchestrator's default Claude config. In
 * single-account mode there is no second account. Other engines have no Claude account, so their
 * account is null.
 */
const [primaryAccount = null, fallbackAccount = null] = accounts
/** Outside every repo: a log written into the worktree lands in the worker's own diff. */
const logDirectory = join(tmpdir(), "orbit-workers")
mkdirSync(logDirectory, { recursive: true })
/** Each log names the account its worker ran under. */
const logFileFor = (account) => join(logDirectory, `${issue}-${process.pid}-${Date.now()}${account === null ? "" : `-${account.name}-account`}.log`)
const logFile = logFileFor(primaryAccount)
const reportFile = research ? join(researchStorage, "findings.txt") : null
/**
 * The write sandbox of a read-only run, and the throwaway emulator that a proof pins. The profile
 * refuses writes to every configured repository, its siblings, its worktrees and the hygiene roots.
 */
let writeSandbox = null
if (readOnly) {
  const directories = protectedDirectories({
    repositories: Object.values(config.repos ?? {}).filter((path) => typeof path === "string"),
    runDirectory: readOnlyPlan.gitWorktree ? runDirectory : null,
    extraRoots: Object.values(config.hygieneRoots ?? {}),
  })
  try {
    writeSandbox = { protectedDirectories: directories, profile: writeSandboxProfile({ protectedDirectories: directories, homeDirectory: realpathSync(homedir()), runDirectory }) }
  } catch (error) { fail(2, error.message) }
}
const proofEmulatorPort = mode === "proof" ? await freeEmulatorPort() : null
if (mode === "proof" && proofEmulatorPort === null) fail(3, "no free emulator port pair from 5560 to 5681 for the proof's throwaway emulator")

let researchArgs = null
if (research) {
  try { researchArgs = [...scriptArgs, ...researchInvocation(engineName, invocation, reportFile)] } catch (error) { fail(2, error.message) }
}

if (dryRun) {
  console.log(JSON.stringify({ issue: ticketWork ? issue : null, research, mode, outputFile: researchPlan?.outputFile ?? readOnlyPlan?.outputFile ?? null, engine: engineName, tier: invocation.tier, model: invocation.model, account: primaryAccount?.name ?? null, configDirectory: primaryAccount?.configDirectory ?? null, measurement, noProgressMinutes, hardCeilingMinutes, runDirectory, branch, promptFile, executable, args: researchArgs ?? workerArgs, writeSandbox: writeSandbox?.protectedDirectories ?? null, proofEmulatorPort, logFile, dryRun: true }, null, 2))
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
let repositoryKey = null
let githubAuth = { environment: researchEnvironment(), secrets: [] }
let admission = { admitted: true, reservationId: null }
if (readOnly) {
  // A copy outside every repository has no remote to choose a GitHub owner from, so it keeps the caller's own gh sign-in.
  githubAuth = { environment: process.env, secrets: [] }
  if (readOnlyPlan.gitWorktree) {
    try { githubAuth = await githubEnvironment(runDirectory) } catch (error) { fail(2, `could not resolve GitHub reads for ${runDirectory}: ${redactSecrets(error.message)}`) }
  }
}
if (ticketWork) {
  const repositoryIdentity = gitRepositoryIdentity(runDirectory)
  if (!repositoryIdentity) fail(2, `could not resolve the Git repository identity for ${runDirectory}`)
  repositoryKey = Object.entries(config.repos ?? {}).find(([, repository]) =>
    typeof repository === "string" && gitRepositoryIdentity(repository) === repositoryIdentity)?.[0]
  if (!repositoryKey) fail(2, `${runDirectory} does not belong to a repository configured in .claude/orchestrator.json`)

  try {
    githubAuth = await githubEnvironment(runDirectory)
  } catch (error) {
    const result = { admitted: false, reason: "ADMISSION_REFUSED", counts: { openPullRequests: null, queuedRuns: null }, limits: { maxOpenPullRequests: config.caps.maxOpenPullRequests, maxQueuedRuns: config.caps.maxQueuedRuns }, error: redactSecrets(error.message) }
    console.log(JSON.stringify(result))
    process.exit(ADMISSION_REFUSED_EXIT)
  }
  admission = await checkAdmission({ config, repositoryKey, branch, environment: githubAuth.environment, worktree: runDirectory })
  if (!admission.admitted) {
    console.log(JSON.stringify({ ...admission, error: admission.error ? redactSecrets(admission.error, githubAuth.secrets) : null }))
    process.exit(ADMISSION_REFUSED_EXIT)
  }
}
process.on("exit", () => { if (ticketWork) releaseAdmission(admission.reservationId) })
/** Set while an attempt runs. It stops that attempt's whole group and returns false when a clock already did. */
let stopActiveAttempt = null
let stopExitCode = null
for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(signal, () => {
    if (stopActiveAttempt) {
      if (stopActiveAttempt(`${issue} received ${signal}; killing the worker process tree`)) stopExitCode ??= exitCode
      return
    }
    if (ticketWork) releaseAdmission(admission.reservationId)
    process.exit(exitCode)
  })
}

const timestamp = new Date().toISOString()
let launchSessionId
try { launchSessionId = readRunState()?.sessionId ?? null } catch (error) { fail(2, error.message) }
/** A read-only run claims a git run directory against a second launch, but holds no branch slot. */
const reservesWorktree = ticketWork || (readOnly && readOnlyPlan.gitWorktree)
const reservation = !reservesWorktree ? { allowed: true } : reserveWorkerLaunch({
  launcherPid: process.pid,
  sessionId: launchSessionId,
  issue,
  runDirectory,
  repositoryKey,
  branch,
  headSha: startHead,
  tier: invocation.tier,
  timestamp,
  relaunchReason: relaunchReasonArgument,
}, ticketWork ? config.caps.workerLaunchesPerBranch : null, runDirectory)
if (!reservation.allowed) {
  if (reservation.occupiedWorkerPid) fail(2, `worktree ${runDirectory} already has a live worker pid ${reservation.occupiedWorkerPid}`)
  if (reservation.occupiedLauncherPid !== undefined) fail(2, `worktree ${runDirectory} already has a launcher pid ${reservation.occupiedLauncherPid ?? "unknown"}`)
  const earlier = reservation.earlierLaunches.map((launch, index) =>
    `  ${index + 1}. ${launch.timestamp} tier=${launch.tier} head=${launch.headSha}`).join("\n")
  fail(2, `worker launch cap ${config.caps.workerLaunchesPerBranch} reached for ${repositoryKey} branch ${branch}. Earlier launches:\n${earlier}\nPass --relaunch-reason "<text>" to record and allow another launch.`)
}

const accountLabel = (account) => account === null ? "" : ` on the ${account.name} account${account.configDirectory === null ? " (default Claude config)" : ` (${account.configDirectory})`}`
const startedAt = new Date().toISOString()
/**
 * The orchestrator backgrounds this launcher. Register before any awaited setup or child spawn so
 * a Stop in that launch window can observe the live launcher. The reader expires this pending form
 * after 45 seconds, while the process identity still proves that the launcher itself really began.
 */
const wakeWhat = ticketWork ? `worker ${issue}` : issue
if (!registerWakeSource({ pid: process.pid, what: wakeWhat, research, review: readOnly, workerPid: null, logFile, startedAt, pending: true, pendingAt: startedAt })) {
  if (reservesWorktree) clearWorkerLaunchReservation(process.pid, runDirectory)
  fail(3, "could not register the pending launcher wake source")
}
const reportFd = research && engineName === "claude" ? openSync(reportFile, "wx") : null
process.on("exit", () => {
  if (!ticketWork) clearWakeSource(process.pid)
  if (readOnly && reservesWorktree) clearWorkerLaunchReservation(process.pid, runDirectory)
})
const snapshotBefore = readOnly ? runDirectorySnapshot(runDirectory, readOnlyPlan.gitWorktree) : null
const gatePath = fileURLToPath(new URL("./lib/worker-gate.cjs", import.meta.url))
const launchEnvironment = research ? githubAuth.environment : {
  ...githubAuth.environment,
  ORBIT_LAUNCH_WORKER: "1",
  ORCA_CLI_COMMAND: process.env.ORCA_BIN || "orca",
  // A read-only status never takes the index lock, which the sandbox refuses.
  ...(readOnly ? { GIT_OPTIONAL_LOCKS: "0", ORBIT_READ_ONLY_RUN: "1" } : {}),
  // adb sends each command without a device flag to ANDROID_SERIAL, the proof's own throwaway emulator.
  ...(mode === "proof" ? { ORBIT_DEVICE_PROOF: "1", ANDROID_SERIAL: `emulator-${proofEmulatorPort}`, ORBIT_PROOF_EMULATOR_PORT: String(proofEmulatorPort) } : {}),
}

/** The worker spawns its own children (git, npm, subagents), and killing the parent alone leaves
 * them running against the worktree this launch is about to hand back. */
const killTree = (pid, signal = "SIGTERM") => {
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
    process.kill(-pid, signal)
  } catch {
    /* a tree that is already gone still ends this launch; the exit handler reports what happened */
  }
}

/** A worker that handles SIGTERM without exiting still dies at this deadline. The override is a test hook. */
const killGraceMs = Number(process.env.ORBIT_TEST_KILL_GRACE_MS) > 0 ? Number(process.env.ORBIT_TEST_KILL_GRACE_MS) : 10_000

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

const logMegabyteCap = config.caps?.workerLogMegabytes
const logByteCap = Number.isFinite(logMegabyteCap) && logMegabyteCap > 0 ? logMegabyteCap * 1024 * 1024 : null

/**
 * The hard ceiling, log cap and stall clock for one worker process. Each attempt gets its own,
 * because a relaunched worker is a fresh process with its own log. `kill` records the outcome.
 */
const superviseAttempt = (workerPid, attemptLogFile) => {
  let outcome = "EXITED"
  let killed = false
  let graceTimer
  /** The first kill keeps its outcome. SIGTERM ends the tree and SIGKILL follows at the grace deadline. */
  const kill = (killedOutcome, message) => {
    if (killed) return false
    killed = true
    outcome = killedOutcome
    console.error(message)
    killTree(workerPid)
    graceTimer = setTimeout(() => killTree(workerPid, "SIGKILL"), killGraceMs)
    return true
  }
  const ceiling = setTimeout(() => {
    kill("KILLED_HARD_CEILING", `${issue} passed the ${hardCeilingMinutes} minute ceiling; killing the worker process tree`)
  }, hardCeilingMs)
  let progress = progressFingerprint()
  let lastProgressAt = supervisionNow() ?? Date.now()
  if (supervisionClockPath) publishSupervisionMarker(`${supervisionClockPath}.ready`, "ready")
  let lastLogSize = 0
  let cpuBaseline = null
  const sampleProgress = () => {
    let logSize = null
    try {
      logSize = statSync(attemptLogFile).size
    } catch {
      /* a log that cannot be stat'd is neither a runaway nor progress */
    }
    if (logByteCap !== null && logSize !== null && logSize > logByteCap) {
      kill("KILLED_LOG_RUNAWAY", `${issue} wrote ${(logSize / 1048576).toFixed(2)} MB of worker log, past the ${logMegabyteCap} MB cap; killing the worker process tree`)
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
    // Log growth counts only when a byte cap can stop a flooding worker.
    if (logByteCap !== null && logSize !== null && logSize > lastLogSize) {
      noteProgress()
      return
    }
    // An injected wall clock has no relationship to live process CPU. Clock-driven cases isolate
    // the filesystem and log signals rather than letting real CPU reset a virtual stall interval.
    const cpuMs = supervisionClockPath ? null : cpuMillisecondsOfTree(workerPid)
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
    kill("KILLED_NO_PROGRESS", `${issue} has not moved HEAD, written a file, grown its log or burned CPU for ${noProgressMinutes} minutes${measurement ? " (measurement cap)" : ""}; killing the worker process tree`)
  }
  const sampler = setInterval(() => {
    supervisionSample = null
    sampleProgress()
    acknowledgeSupervisionSample()
  }, config.timeouts.pollSeconds * 1000)
  return {
    outcome: () => outcome,
    markSpawnFailed: () => { outcome = "SPAWN_FAILED" },
    kill,
    stop: () => { clearTimeout(ceiling); clearInterval(sampler); clearTimeout(graceTimer) },
  }
}

/**
 * Starts one worker process under `account` and resolves when it is gone. The gate cannot enter
 * the worktree until both records name its pid. If this launcher dies beforehand, its IPC channel
 * closes and the gate exits without starting the real worker.
 */
const runAttempt = (account, attemptLogFile, attemptArgs) => new Promise((settle) => {
  console.error(`starting the ${engineName} worker for ${issue} in ${runDirectory}${accountLabel(account)}; log: ${attemptLogFile}`)
  const attemptStartedAt = new Date().toISOString()
  const logFd = openSync(attemptLogFile, "a")
  const attemptChild = spawn(process.execPath, [gatePath], {
    cwd: tmpdir(),
    stdio: ["ignore", logFd, logFd, "ipc", ...(reportFd === null ? [] : [reportFd])],
    windowsHide: true,
    // POSIX only, and it is what makes killTree's `process.kill(-pid)` reach anything at all: the
    // child becomes a process-group leader, so the group exists to be signalled. Windows needs the
    // opposite, since detached there spawns a console window; taskkill /T already walks that tree.
    detached: process.platform !== "win32",
    env: workerAccountEnvironment(launchEnvironment, account),
  })
  if (!attemptChild.pid || (reservesWorktree && !recordReservedWorkerPid(process.pid, attemptChild.pid, runDirectory))) {
    attemptChild.kill()
    fail(3, "could not publish the worker pid in the worktree reservation")
  }
  if (!registerWakeSource({ pid: process.pid, what: wakeWhat, research, review: readOnly, workerPid: attemptChild.pid, logFile: attemptLogFile, startedAt })) {
    attemptChild.kill()
    fail(3, "could not publish the worker pid in the wake source")
  }
  const spawned = readOnly ? sandboxedInvocation(writeSandbox.profile, executable, attemptArgs) : { executable, args: attemptArgs }
  attemptChild.send({ executable: spawned.executable, args: spawned.args, directory: runDirectory, ...(research ? { input: researchPrompt(promptFile), reportDescriptor: reportFd === null ? null : 4 } : {}) })
  const supervisor = superviseAttempt(attemptChild.pid, attemptLogFile)
  stopActiveAttempt = (message) => supervisor.kill("STOPPED", message)
  let settled = false
  const end = (outcome, exitCode) => {
    if (settled) return
    settled = true
    stopActiveAttempt = null
    supervisor.stop()
    closeSync(logFd)
    const result = account !== null && outcome === "EXITED" ? logFinalResult(attemptLogFile) : NO_STOP
    if (result.authenticationFailed) console.error(`the ${engineName} worker for ${issue} could not sign in${accountLabel(account)}: ${result.error}`)
    settle({ account: account?.name ?? null, configDirectory: account?.configDirectory ?? null, pid: attemptChild.pid ?? null, logFile: attemptLogFile, startedAt: attemptStartedAt, endedAt: new Date().toISOString(), exitCode, outcome, usageLimitReached: result.usageLimitReached, authenticationFailed: result.authenticationFailed, resultError: result.error })
  }
  attemptChild.on("error", (error) => {
    console.error(`could not start the ${engineName} worker: ${error.message}`)
    end("SPAWN_FAILED", null)
  })
  attemptChild.on("message", (message) => {
    if (message?.type === "SPAWN_FAILED") supervisor.markSpawnFailed()
  })
  attemptChild.on("exit", (code) => {
    // The gate's exit does not end a process it left in its group. The group id stays valid while any member lives.
    // Windows has no group to signal, and taskkill /T cannot walk a tree whose parent is gone.
    if (process.platform !== "win32") killTree(attemptChild.pid, "SIGKILL")
    end(supervisor.outcome(), code)
  })
})

/**
 * Publishes a read-only result only when the worker exited 0, the run directory holds no write of it,
 * and the staged result opens with the mode's verdict line. A write fails the run with exit 5.
 */
const finishReadOnly = (last) => {
  const { outcome, exitCode } = last
  const writes = runDirectoryWrites(snapshotBefore, runDirectorySnapshot(runDirectory, readOnlyPlan.gitWorktree), runDirectory)
  for (const write of writes) console.error(`the ${mode} worker left a ${write.kind} in ${write.directory}: ${write.detail}`)
  let published = false
  let verdict = null
  if (outcome === "EXITED" && exitCode === 0 && writes.length === 0) {
    try {
      const text = readFileSync(stagedResult, "utf8")
      verdict = resultVerdict(text, mode)
      if (verdict === null) throw new Error(`the result does not open with the ${mode} verdict line: ${JSON.stringify(text.split(/\r?\n/, 1)[0])}`)
      const checked = readOnlyPaths(promptFile, readOnlyPlan.outputFile, runDirectory, mode)
      writeFileSync(checked.outputFile, text, { flag: "wx", mode: 0o600 })
      published = true
    } catch (error) { console.error(`could not publish the ${mode} result: ${error.message}`) }
  }
  console.log(JSON.stringify({ mode, outputFile: readOnlyPlan.outputFile, published, verdict, writes, runDirectory, engine: engineName, tier: invocation.tier, model: invocation.model, account: last.account, configDirectory: last.configDirectory, pid: last.pid, logFile: last.logFile, startedAt, endedAt: last.endedAt, exitCode, outcome, usageLimitReached: last.usageLimitReached, authenticationFailed: last.authenticationFailed, resultError: last.resultError, attempts }, null, 2))
  if (outcome === "STOPPED") process.exit(stopExitCode)
  process.exit(writes.length > 0 ? 5 : published ? 0 : 1)
}

const finish = (attempts) => {
  const last = attempts.at(-1)
  const { outcome, exitCode } = last
  if (ticketWork) releaseAdmission(admission.reservationId)
  clearWakeSource(process.pid)
  if (reservesWorktree) clearWorkerLaunchReservation(process.pid, runDirectory)
  if (reportFd !== null) closeSync(reportFd)
  if (readOnly) finishReadOnly(last)
  if (research) {
    let published = false
    if (outcome === "EXITED" && exitCode === 0) {
      try {
        const findings = readFileSync(reportFile, "utf8")
        if (!findings.trim()) throw new Error("research returned no findings")
        const checked = researchPaths(promptFile, researchPlan.outputFile)
        writeFileSync(checked.outputFile, findings, { flag: "wx", mode: 0o600 })
        published = true
      } catch (error) { console.error(`could not publish research findings: ${error.message}`) }
    }
    console.log(JSON.stringify({ research: true, outputFile: researchPlan.outputFile, published, engine: engineName, model: invocation.model, account: last.account, pid: last.pid, logFile: last.logFile, startedAt, endedAt: last.endedAt, exitCode, outcome, authenticationFailed: last.authenticationFailed, resultError: last.resultError }, null, 2))
    process.exit(outcome === "STOPPED" ? stopExitCode : published ? 0 : 1)
  }
  const commits = startHead ? gitIn(["log", "--format=%h %s", `${startHead}..HEAD`]).split("\n").filter(Boolean) : []
  const porcelain = spawnSync("git", ["-C", runDirectory, "status", "--porcelain"], { encoding: "utf8", windowsHide: true })
  const treeClean = porcelain.status === 0 && porcelain.stdout.trim() === ""
  const result = { launcherPid: process.pid, sessionId: launchSessionId, repositoryKey, runDirectory, branch, issue, engine: engineName, tier: invocation.tier, model: invocation.model, account: last.account, configDirectory: last.configDirectory, measurement, noProgressMinutes, hardCeilingMinutes, pid: last.pid, logFile: last.logFile, startedAt, endedAt: last.endedAt, exitCode, outcome, usageLimitReached: last.usageLimitReached, authenticationFailed: last.authenticationFailed, resultError: last.resultError, attempts, commitsSinceLaunch: commits.length, commits, treeClean }
  const directory = join(workerLaunchDirectory(), "results")
  mkdirSync(directory, { recursive: true })
  const resultPath = join(directory, `${process.pid}.json`)
  const unpublished = `${resultPath}.unpublished`
  writeFileSync(unpublished, `${JSON.stringify(result)}\n`, { flag: "wx" })
  renameSync(unpublished, resultPath)
  console.log(JSON.stringify(result, null, 2))
  if (outcome === "EXITED") process.exit(0)
  if (outcome === "STOPPED") process.exit(stopExitCode)
  process.exit(commits.length > 0 ? 4 : 1)
}

const attempts = [await runAttempt(primaryAccount, logFile, researchArgs ?? workerArgs)]
// Research publishes one report file, and its order is rerun whole. A stopped launch never relaunches, because only an EXITED attempt reads a usage limit.
if (!research && attempts[0].usageLimitReached && fallbackAccount !== null) {
  console.error(`${issue} stopped at the ${primaryAccount.name} account's usage limit; relaunching it once on the ${fallbackAccount.name} account`)
  // A read-only order starts again from its beginning, so a partial result of the first attempt cannot be published.
  if (readOnly) rmSync(stagedResult, { force: true })
  attempts.push(await runAttempt(fallbackAccount, logFileFor(fallbackAccount), [...scriptArgs, ...invocation.args, readOnly ? readOnlyPointer() : continuationPointer(runDirectory, branch)]))
}
finish(attempts)
