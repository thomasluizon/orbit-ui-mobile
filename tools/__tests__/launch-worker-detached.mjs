import { spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as pause } from "node:timers/promises"

import { T, TOOLS_DIR, processIsRunning, stage } from "./_harness.mjs"
import { readWakeSourceStates, workerCompletionFile } from "../lib/run-state.mjs"

const TOOL = "launch-worker.mjs"

const waitUntil = async (predicate, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = predicate()
    if (value) return value
    if (Date.now() >= deadline) return null
    await pause(25)
  }
}

const processRows = () => spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).stdout.split("\n")
  .map((line) => line.trim().split(/\s+/).map(Number)).filter((row) => row.length === 2 && row.every(Number.isInteger))

/** The processes a `ps` walk by ppid finds below `rootPid`, the way Claude Code ends a background task. */
const descendantsOf = (rootPid) => {
  const rows = processRows()
  const found = new Set()
  const queue = [rootPid]
  while (queue.length) {
    const parent = queue.shift()
    for (const [pid, parentPid] of rows) if (parentPid === parent && !found.has(pid)) { found.add(pid); queue.push(pid) }
  }
  return [...found]
}

/** The same two steps Claude Code takes on a background task: SIGTERM, then SIGKILL, to the group and the walked descendants. */
const endSessionTask = async (pid) => {
  const walked = descendantsOf(pid)
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try { process.kill(-pid, signal) } catch { /* the group is already gone */ }
    for (const descendant of walked) try { process.kill(descendant, signal) } catch { /* already gone */ }
    if (signal === "SIGTERM") await pause(300)
  }
}

const startEntry = (fixture, extraEnvironment) => {
  const child = spawn(process.execPath, [fixture.path, "--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt], {
    cwd: join(fixture.base, "tools"), env: { ...process.env, ...extraEnvironment }, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  const closed = new Promise((resolve) => child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr })))
  return { child, closed, output: () => ({ stdout, stderr }) }
}

const parentOf = (pid) => Number(spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim())

/** The temp files that one entry process creates for its supervisor: `launch-<entry pid>-<ms>.{stdout,stderr,exit.json}`. */
const entryFiles = (entryPid) => {
  const directory = join(tmpdir(), "orbit-workers")
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith(`launch-${entryPid}-`)).map((name) => join(directory, name)) : []
}

const detachedSource = (fixture) => readWakeSourceStates(fixture.base).live.find((source) => source.detached === true && Number.isInteger(source.workerPid))

export const cases = async ({ launch, launchConfig, stubEngine, githubAuthEnv, discardLog, IMMEDIATE }) => {
  if (process.platform === "win32") return
  const trigger = stage("launch-worker/detached-trigger.txt", "")
  rmSync(trigger, { force: true })
  const worker = stage("launch-worker/detached-worker.cjs", `const { existsSync } = require("node:fs")
const timer = setInterval(() => { if (existsSync(${JSON.stringify(trigger)})) { clearInterval(timer); process.exit(0) } }, 50)
`)
  const fixture = launch("detached", launchConfig({ ...stubEngine(worker), timeouts: { pollSeconds: 0.2 } }))
  cpSync(join(TOOLS_DIR, "wait-file.mjs"), join(fixture.base, "tools", "wait-file.mjs"))
  const entry = startEntry(fixture, githubAuthEnv())
  let source
  let supervisorPid
  let waiter
  try {
    source = await waitUntil(() => detachedSource(fixture))
    supervisorPid = source?.pid
    T(`${TOOL}: the supervisor registers a detached wake source that names its worker, entry and completion file`,
      source?.detached === true && source.entryPid === entry.child.pid && source.completionFile === workerCompletionFile(supervisorPid, fixture.base) && source.issue === "ORB-201" && source.runDirectory === fixture.worktree,
      JSON.stringify({ source, ...entry.output() }))
    T(`${TOOL}: the entry names the supervisor and the completion file on stderr`, entry.output().stderr.includes(`launcher pid ${supervisorPid} `) && entry.output().stderr.includes(workerCompletionFile(supervisorPid, fixture.base)), entry.output().stderr)
    T(`${TOOL}: the supervisor is not a descendant of the entry`, supervisorPid !== undefined && parentOf(supervisorPid) === 1 && !descendantsOf(entry.child.pid).includes(supervisorPid), String(parentOf(supervisorPid)))

    await endSessionTask(entry.child.pid)
    const ended = await Promise.race([entry.closed, pause(10000).then(() => null)])
    T(`${TOOL}: ending the entry the way the session ends a background task stops only the entry`, ended !== null && !processIsRunning(entry.child.pid), JSON.stringify(ended))
    T(`${TOOL}: the supervisor and the worker keep running after the entry is gone`, processIsRunning(supervisorPid) && processIsRunning(source.workerPid), JSON.stringify({ supervisorPid, workerPid: source?.workerPid }))
    T(`${TOOL}: the supervisor stays a live wake source and never an orphaned worker`, readWakeSourceStates(fixture.base).live.some((live) => live.pid === supervisorPid) && readWakeSourceStates(fixture.base).orphaned.length === 0)
    T(`${TOOL}: the entry's temp files still exist while the worker runs`, entryFiles(entry.child.pid).some((path) => path.endsWith(".stderr")), JSON.stringify(entryFiles(entry.child.pid)))
    T(`${TOOL}: the completion file does not exist while the worker runs`, !existsSync(workerCompletionFile(supervisorPid, fixture.base)))

    const completionFile = workerCompletionFile(supervisorPid, fixture.base)
    waiter = spawn(process.execPath, [join(fixture.base, "tools", "wait-file.mjs"), "--file", completionFile, "--started-at", source.startedAt, "--what", "worker ORB-201", "--poll-seconds", "0.05"], {
      cwd: fixture.base, env: { ...process.env, CLAUDE_CODE_SESSION_ID: "successor" }, stdio: ["ignore", "pipe", "pipe"],
    })
    let waiterOutput = ""
    waiter.stdout.on("data", (chunk) => { waiterOutput += chunk })
    const waiterClosed = new Promise((resolve) => waiter.once("close", (status) => resolve(status)))
    const waiterLive = await waitUntil(() => readWakeSourceStates(fixture.base).live.find((live) => live.pid === waiter.pid))
    T(`${TOOL}: a file waiter on the completion file registers a wake source while the worker runs`, waiterLive?.kind === "file-waiter" && waiterLive.what === "worker ORB-201", JSON.stringify(waiterLive))

    spawnSync(process.execPath, ["-e", `require("node:fs").writeFileSync(${JSON.stringify(trigger)}, "finish")`])
    const waiterStatus = await Promise.race([waiterClosed, pause(30000).then(() => "timeout")])
    const completion = existsSync(completionFile) ? JSON.parse(readFileSync(completionFile, "utf8")) : null
    T(`${TOOL}: the worker ends on its own and the supervisor writes the completion file`, completion?.outcome === "EXITED" && completion.exitCode === 0 && completion.launcherPid === supervisorPid && completion.issue === "ORB-201" && completion.pid === source.workerPid, JSON.stringify(completion))
    T(`${TOOL}: the file waiter wakes on that file and reports it found`, waiterStatus === 0 && JSON.parse(waiterOutput).found === true && JSON.parse(waiterOutput).reason === "FOUND", `${waiterStatus} ${waiterOutput}`)
    T(`${TOOL}: the supervisor leaves no wake source and no process once the worker is done`, await waitUntil(() => !processIsRunning(supervisorPid) && readWakeSourceStates(fixture.base).live.every((live) => live.pid !== supervisorPid), 10000) !== null)
    T(`${TOOL}: the supervisor removes the stdout, stderr and exit files of an entry that a relay ended`, entryFiles(entry.child.pid).length === 0, JSON.stringify(entryFiles(entry.child.pid)))
  } finally {
    waiter?.kill("SIGKILL")
    for (const pid of [supervisorPid, source?.workerPid]) if (processIsRunning(pid)) try { process.kill(pid, "SIGKILL") } catch { /* already gone */ }
    try { process.kill(-entry.child.pid, "SIGKILL") } catch { /* already gone */ }
    discardLog(entry.output().stdout)
  }

  // The entry replays what the supervisor printed and exits with the supervisor's code.
  const replay = launch("detached-replay", launchConfig(stubEngine(IMMEDIATE)))
  const replayed = await startEntry(replay, githubAuthEnv()).closed
  discardLog(replayed.stdout)
  const replayedResult = JSON.parse(replayed.stdout)
  T(`${TOOL}: the entry prints the supervisor's result and exits with its code`, replayed.status === 0 && replayedResult.outcome === "EXITED" && replayed.stderr.includes("starting the claude worker for ORB-201"), JSON.stringify(replayed))
  T(`${TOOL}: the completion file the supervisor wrote matches what the entry printed`, JSON.stringify(JSON.parse(readFileSync(workerCompletionFile(replayedResult.launcherPid, replay.base), "utf8"))) === JSON.stringify(replayedResult))
  const refused = launch("detached-refusal", launchConfig(stubEngine(IMMEDIATE)))
  const refusedRun = await startEntry(refused, githubAuthEnv({ branchPulls: [], pulls: Array.from({ length: 200 }, (_, index) => ({ number: index + 1 })) })).closed
  T(`${TOOL}: an admission refusal reaches the entry as the same stdout and exit code 8`, refusedRun.status === 8 && JSON.parse(refusedRun.stdout).reason === "ADMISSION_REFUSED", JSON.stringify(refusedRun))

  // A launcher that runs inside a worker is an entry of its own: it must not inherit the link to the outer entry.
  rmSync(trigger, { force: true })
  const nestedReport = stage("launch-worker/detached-nested-report.json", "")
  rmSync(nestedReport, { force: true })
  const nestingWorker = stage("launch-worker/detached-nesting-worker.cjs", `const { existsSync, writeFileSync } = require("node:fs")
const { spawnSync } = require("node:child_process")
const linked = Object.fromEntries(["ORBIT_LAUNCH_SUPERVISOR", "ORBIT_LAUNCH_ENTRY_PID", "ORBIT_LAUNCH_EXIT_FILE"].map((name) => [name, process.env[name] ?? null]))
const nested = spawnSync(process.execPath, [process.env.NESTED_LAUNCHER, "--issue", "ORB-1", "--worktree", "/nonexistent-nested-worktree", "--prompt", "/nonexistent-nested-prompt", "--dry-run"], { env: process.env, encoding: "utf8" })
writeFileSync(${JSON.stringify(nestedReport)}, JSON.stringify({ linked, nestedStatus: nested.status }))
const timer = setInterval(() => { if (existsSync(${JSON.stringify(trigger)})) { clearInterval(timer); process.exit(0) } }, 50)
`)
  const nesting = launch("detached-nesting", launchConfig({ ...stubEngine(nestingWorker), timeouts: { pollSeconds: 0.2 } }))
  const nestingEntry = startEntry(nesting, { ...githubAuthEnv(), NESTED_LAUNCHER: nesting.path })
  let nestingSource
  try {
    const report = await waitUntil(() => existsSync(nestedReport) && readFileSync(nestedReport, "utf8") !== "" && JSON.parse(readFileSync(nestedReport, "utf8")))
    nestingSource = await waitUntil(() => detachedSource(nesting))
    await pause(1000)
    T(`${TOOL}: the worker gets none of the three variables that link the supervisor to its entry`, report !== null && Object.values(report.linked).every((value) => value === null), JSON.stringify(report))
    T(`${TOOL}: a launcher that runs inside the worker exits on its own`, report?.nestedStatus === 2, JSON.stringify(report))
    T(`${TOOL}: a launcher inside the worker does not end the outer entry or write its exit file`, processIsRunning(nestingEntry.child.pid) && !entryFiles(nestingEntry.child.pid).some((path) => path.endsWith(".exit.json")), JSON.stringify({ files: entryFiles(nestingEntry.child.pid), ...nestingEntry.output() }))
    spawnSync(process.execPath, ["-e", `require("node:fs").writeFileSync(${JSON.stringify(trigger)}, "finish")`])
    const finished = await Promise.race([nestingEntry.closed, pause(30000).then(() => null)])
    T(`${TOOL}: the outer entry ends with the worker's own result`, finished?.status === 0 && JSON.parse(finished.stdout).outcome === "EXITED", JSON.stringify(finished))
  } finally {
    for (const pid of [nestingSource?.pid, nestingSource?.workerPid]) if (processIsRunning(pid)) try { process.kill(pid, "SIGKILL") } catch { /* already gone */ }
    try { process.kill(-nestingEntry.child.pid, "SIGKILL") } catch { /* already gone */ }
  }

  // A signal to the entry ends only the entry. A signal to the supervisor stops the worker and records STOPPED.
  rmSync(trigger, { force: true })
  const stopping = launch("detached-stop", launchConfig({ ...stubEngine(worker), timeouts: { pollSeconds: 0.2 } }))
  const stoppingEntry = startEntry(stopping, githubAuthEnv())
  let stoppingSource
  try {
    stoppingSource = await waitUntil(() => detachedSource(stopping))
    process.kill(stoppingEntry.child.pid, "SIGTERM")
    const interrupted = await stoppingEntry.closed
    T(`${TOOL}: SIGTERM to the entry exits 143 and leaves the worker running`, interrupted.status === 143 && interrupted.stderr.includes(`send SIGTERM to ${stoppingSource.pid}`) && processIsRunning(stoppingSource.pid) && processIsRunning(stoppingSource.workerPid), JSON.stringify(interrupted))
    process.kill(stoppingSource.pid, "SIGTERM")
    const completionFile = workerCompletionFile(stoppingSource.pid, stopping.base)
    const stopped = await waitUntil(() => existsSync(completionFile) && JSON.parse(readFileSync(completionFile, "utf8")), 30000)
    T(`${TOOL}: SIGTERM to the supervisor stops the worker and records STOPPED in the completion file`, stopped?.outcome === "STOPPED" && Number.isInteger(stopped.exitCode) && !processIsRunning(stoppingSource.workerPid), JSON.stringify(stopped))
  } finally {
    for (const pid of [stoppingSource?.pid, stoppingSource?.workerPid]) if (processIsRunning(pid)) try { process.kill(pid, "SIGKILL") } catch { /* already gone */ }
    try { process.kill(-stoppingEntry.child.pid, "SIGKILL") } catch { /* already gone */ }
  }
}
