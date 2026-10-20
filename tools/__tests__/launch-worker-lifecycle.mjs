import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { loadavg } from "node:os"

import { processIsRunning, T, stage } from "./_harness.mjs"
import { readWakeSourceStates } from "../lib/run-state.mjs"

const TOOL = "launch-worker.mjs"

const waitForStartup = (launcher, publication, { timeoutMs = 60000, allowCompletion = false } = {}) => new Promise((resolve, reject) => {
  const started = Date.now()
  let settled = false
  let observed
  const finish = (reason, completion) => {
    if (settled) return
    settled = true
    clearInterval(poll)
    clearTimeout(deadline)
    if (reason) reject(new Error(JSON.stringify({ reason, completion, elapsedMs: Date.now() - started, launcherPid: launcher.child.pid, publication: observed, ...launcher.output(), load: loadavg() })))
    else resolve(completion ? { completion } : observed)
  }
  const inspect = () => {
    try {
      observed = publication()
      if (observed.ready) finish()
    } catch (error) { finish(`invalid startup publication: ${error.message}`) }
  }
  const poll = setInterval(inspect, 20)
  const deadline = setTimeout(() => finish(`startup publication timed out after ${timeoutMs}ms`), timeoutMs)
  launcher.result.then((result) => finish(allowCompletion ? null : "launcher completed before startup publication", result), (error) => finish(error.message))
  inspect()
})

const admissionDecision = async (launcher, fixture, readFileContents) => {
  const path = join(fixture.base, ".git", "orbit-wake-sources", `${launcher.child.pid}.json`)
  const observed = await waitForStartup(launcher, () => {
    const record = JSON.parse(readFileContents(path) ?? "null")
    return { ready: Number.isInteger(record?.workerPid), record }
  }, { allowCompletion: true })
  return observed.completion ?? { status: "unexpected worker publication", ...launcher.output(), record: observed.record }
}

const launcherResult = async (launcher, timeoutMs = 60000) => {
  let deadline
  try {
    return await Promise.race([
      launcher.result,
      new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`launcher ${launcher.child.pid} did not complete after ${timeoutMs}ms: ${JSON.stringify(launcher.output())}`)), timeoutMs)
      }),
    ])
  } finally { clearTimeout(deadline) }
}

const killFixtureTree = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, timeout: 10000 })
  else try { process.kill(-pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error }
}

const cleanupLifecycleLaunch = async (launcher, fixture, { discardLog, readFileContents }) => {
  launcher.child.kill("SIGKILL")
  try {
    discardLog((await launcherResult(launcher, 10000)).stdout)
  } finally {
    const recordPaths = [
      join(fixture.base, ".git", "orbit-wake-sources", `${launcher.child.pid}.json`),
      join(fixture.worktree, ".git", "orbit-worker-launches", "occupied-worktree.json"),
    ]
    const workerPids = new Set()
    for (const path of recordPaths) {
      const contents = readFileContents(path)
      if (contents !== null) {
        const record = JSON.parse(contents)
        if ((record.pid ?? record.launcherPid) === launcher.child.pid) workerPids.add(record.workerPid)
        if (record.pid === launcher.child.pid && record.logFile) rmSync(record.logFile, { force: true })
      }
    }
    for (const pid of workerPids) killFixtureTree(pid)
  }
}

export const cases = async ({
  launch, launchConfig, stubEngine, githubAuthEnv, discardLog, readFileContents, launchAsync, IMMEDIATE, SLEEPER,
}) => {
  // Startup latency must not decide when a second launcher probes admission.
  const startupDelay = stage("launch-worker/startup-delay.cjs", `if (process.argv[1]?.endsWith("launch-worker.mjs")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 6000)\n`)
  const startupEnvironment = () => {
    const environment = githubAuthEnv()
    return { ...environment, NODE_OPTIONS: `${environment.NODE_OPTIONS} --require "${startupDelay.replaceAll("\\", "/")}"` }
  }
  const lifecycleWorker = stage("launch-worker/lifecycle-worker.cjs", `
const { spawn } = require("node:child_process")
const { renameSync, writeFileSync } = require("node:fs")
const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore", env: { ...process.env, NODE_OPTIONS: "" } })
const marker = process.env.ORBIT_TEST_LIFECYCLE_MARKER
const unpublished = marker + "." + process.pid + ".unpublished"
writeFileSync(unpublished, JSON.stringify({ pid: process.pid, descendantPid: descendant.pid }))
renameSync(unpublished, marker)
setInterval(() => {}, 60000)
`)
  const completedStartup = launchAsync(IMMEDIATE, [], {})
  try {
    await waitForStartup(completedStartup, () => ({ ready: false, marker: "absent" }))
    T(`${TOOL}: startup wait diagnoses terminal completion`, false, "accepted a launcher without publication")
  } catch (error) {
    T(`${TOOL}: startup wait diagnoses terminal completion`, /launcher completed before startup publication/.test(error.message) && /"status":0/.test(error.message) && /"marker":"absent"/.test(error.message), error.message)
  }
  const unpublishedStartup = launchAsync(SLEEPER, [], {})
  try {
    await waitForStartup(unpublishedStartup, () => ({ ready: false, marker: "absent" }), { timeoutMs: 80 })
    T(`${TOOL}: startup wait bounds missing publication with diagnostics`, false, "accepted missing publication")
  } catch (error) {
    T(`${TOOL}: startup wait bounds missing publication with diagnostics`, /startup publication timed out/.test(error.message) && error.message.includes(`"launcherPid":${unpublishedStartup.child.pid}`) && /"marker":"absent"/.test(error.message) && /"stderr":/.test(error.message), error.message)
  } finally {
    unpublishedStartup.child.kill("SIGKILL")
    await launcherResult(unpublishedStartup)
  }
  const occupiedLaunch = launch("delayed-startup-worktree", launchConfig(stubEngine(lifecycleWorker)))
  const occupiedArgv = ["--issue", "ORB-201", "--worktree", occupiedLaunch.worktree, "--prompt", occupiedLaunch.prompt]
  const occupiedMarker = stage("launch-worker/occupied-worker.json", "")
  rmSync(occupiedMarker)
  const occupiedEnvironment = { ...startupEnvironment(), ORBIT_TEST_LIFECYCLE_MARKER: occupiedMarker }
  const firstOccupied = launchAsync(occupiedLaunch.path, occupiedArgv, occupiedEnvironment)
  const occupiedRecord = join(occupiedLaunch.base, ".git", "orbit-wake-sources", `${firstOccupied.child.pid}.json`)
  let secondOccupied
  try {
    const published = await waitForStartup(firstOccupied, () => {
      const record = JSON.parse(readFileContents(occupiedRecord) ?? "null")
      const worker = JSON.parse(readFileContents(occupiedMarker) ?? "null")
      return { ready: Number.isInteger(record?.workerPid) && worker !== null, record, worker }
    })
    const runningWorkerPid = published.record.workerPid
    // Keep the worker alive until admission finishes; the probe deadline bounds the wait.
    secondOccupied = launchAsync(occupiedLaunch.path, occupiedArgv, { ...githubAuthEnv(), ORBIT_TEST_LIFECYCLE_MARKER: occupiedMarker })
    const refusedOccupied = await admissionDecision(secondOccupied, occupiedLaunch, readFileContents)
    T(`${TOOL}: a delayed launcher publishes startup before a second launch is refused with its worker pid`,
      refusedOccupied.status === 2 && refusedOccupied.stderr.includes(`live worker pid ${runningWorkerPid}`) && processIsRunning(runningWorkerPid),
      JSON.stringify({ runningWorkerPid, ...refusedOccupied }))
  } catch (error) {
    T(`${TOOL}: occupied worker startup and admission probe completes`, false, error.message)
  } finally {
    try {
      if (secondOccupied) await cleanupLifecycleLaunch(secondOccupied, occupiedLaunch, { discardLog, readFileContents })
    } finally { await cleanupLifecycleLaunch(firstOccupied, occupiedLaunch, { discardLog, readFileContents }) }
  }
  const orphanWorkerMarker = stage("launch-worker/orphan-worker.json", "")
  rmSync(orphanWorkerMarker)
  const orphanLaunch = launch("published-orphan", launchConfig(stubEngine(lifecycleWorker)))
  const orphanArgv = ["--issue", "ORB-201", "--worktree", orphanLaunch.worktree, "--prompt", orphanLaunch.prompt]
  const releasedLaunch = launchAsync(orphanLaunch.path, orphanArgv, { ...startupEnvironment(), ORBIT_TEST_LIFECYCLE_MARKER: orphanWorkerMarker })
  const orphanRecord = join(orphanLaunch.base, ".git", "orbit-wake-sources", `${releasedLaunch.child.pid}.json`)
  let secondOrphan
  try {
    const published = await waitForStartup(releasedLaunch, () => {
      const record = JSON.parse(readFileContents(orphanRecord) ?? "null")
      const worker = JSON.parse(readFileContents(orphanWorkerMarker) ?? "null")
      return { ready: Number.isInteger(record?.workerPid) && worker !== null, record, worker }
    })
    releasedLaunch.child.kill("SIGKILL")
    await launcherResult(releasedLaunch)
    const orphanStates = readWakeSourceStates(orphanLaunch.base)
    const orphanGatePid = published.record.workerPid
    secondOrphan = launchAsync(orphanLaunch.path, orphanArgv, { ...githubAuthEnv(), ORBIT_TEST_LIFECYCLE_MARKER: orphanWorkerMarker })
    const refusedOrphan = await admissionDecision(secondOrphan, orphanLaunch, readFileContents)
    T(`${TOOL}: after publication a killed launcher leaves a named orphan and blocks another worker`,
      orphanStates.orphaned.some((source) => source.pid === releasedLaunch.child.pid && source.workerPid === orphanGatePid) && refusedOrphan.status === 2 && refusedOrphan.stderr.includes(`live worker pid ${orphanGatePid}`) && processIsRunning(published.worker.pid) && processIsRunning(published.worker.descendantPid),
      JSON.stringify({ orphanGatePid, orphanStates, worker: published.worker, workerAlive: processIsRunning(published.worker.pid), descendantAlive: processIsRunning(published.worker.descendantPid), ...refusedOrphan }))
  } catch (error) {
    T(`${TOOL}: orphan worker startup and admission probe completes`, false, error.message)
  } finally {
    try {
      if (secondOrphan) await cleanupLifecycleLaunch(secondOrphan, orphanLaunch, { discardLog, readFileContents })
    } finally { await cleanupLifecycleLaunch(releasedLaunch, orphanLaunch, { discardLog, readFileContents }) }
  }
}
