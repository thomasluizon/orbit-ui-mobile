import { spawn, spawnSync } from "node:child_process"
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { processIsRunning, T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig, TOOLS_DIR } from "./_harness.mjs"
import { clearWorkerLaunchReservation, readWakeSourceStates, recordReservedWorkerPid, reserveWorkerLaunch, writeRunState } from "../lib/run-state.mjs"
import { cases as lifecycleCases, cleanupLifecycleLaunch, launcherResult } from "./launch-worker-lifecycle.mjs"

const TOOL = "launch-worker.mjs"

/**
 * Derived from the shipped .claude/orchestrator.json rather than hand-written, so a fixture cannot
 * agree with a guess about the schema while the real config carries something else. Only `command`
 * is swapped by default: the configured worker is `codex`, which is not installed in CI, and a
 * gate that needs a model CLI on PATH is not hermetic.
 */
const launchConfig = ({ engine = {}, timeouts = {}, caps = {} } = {}) => {
  const real = realOrchestratorConfig()
  return {
    ...real,
    workers: { ...real.workers, [real.worker]: { ...real.workers[real.worker], command: process.execPath, ...engine } },
    timeouts: { ...real.timeouts, ...timeouts },
    caps: { ...real.caps, ...caps },
  }
}

const stubEngine = (script) => ({
  engine: {
    args: [script],
    models: {
      default: { model: "gate-stub", args: ["--gate-effort=high"] },
      mechanical: { model: "gate-stub", args: ["--gate-effort=medium"] },
    },
  },
})

const SLEEPER = stage("launch-worker/sleeping-worker.js", "setTimeout(() => {}, 60000)\n")
const IMMEDIATE = stage("launch-worker/immediate-worker.js", "process.exit(0)\n")
/** Floods stdout the way ORB-201 did, which is how a 61.73 MB log happened. It never exits on its
 * own, so the only thing that can end it is the launcher noticing the flood. */
const FLOODER = stage("launch-worker/flooding-worker.js", "const line = 'x'.repeat(4096)\nsetInterval(() => { for (let i = 0; i < 64; i++) process.stdout.write(line + '\\n') }, 5)\n")
const UNBOUNDED_LOG_DRIP = stage("launch-worker/unbounded-log-drip.js", "setInterval(() => process.stdout.write('heartbeat\\n'), 250)\n")

let siblingRepos = null
const stagedSiblings = (config) => {
  siblingRepos ??= Object.fromEntries(Object.keys(config.repos).filter((key) => key !== config.cloud.repositoryKey).map((key) => {
    const sibling = stageRepo(`launch-worker-sibling-${key}`)
    sibling.git(["remote", "set-url", "origin", `https://github.com/test-owner/sibling-${key}.git`])
    return [key, sibling.path]
  }))
  return siblingRepos
}

const launch = (label, config) => {
  const repo = stageRepo(`launch-worker-${label}`)
  if (!repo) return null
  repo.git(["remote", "set-url", "origin", `https://github.com/test-owner/${label}.git`])
  const configured = { ...config, repos: { ...config.repos, ...stagedSiblings(config), [config.cloud.repositoryKey]: repo.path } }
  const staged = stageWithConfig(`launch-worker-${label}`, TOOL, configured)
  return { ...staged, worktree: repo.path, git: repo.git, prompt: stage(`launch-worker/${label}-prompt.md`, "the work order, verbatim\n") }
}

const githubAuthEnv = ({ branchPulls = [], pulls = [], queuedRuns = 0, readError = false } = {}) => orcaEnv([
  { match: "auth token --user test-owner", stdout: "test-github-token" },
  { match: "actions/runs?status=queued", stdout: JSON.stringify({ total_count: queuedRuns, workflow_runs: [] }), exit: readError ? 1 : 0, stderr: readError ? "GitHub unavailable" : "" },
  { match: "pulls?head=", stdout: JSON.stringify(branchPulls) },
  ...Array.from({ length: Math.floor(pulls.length / 100) + 1 }, (_, page) => ({
    match: `pulls?state=open&per_page=100&page=${page + 1}`,
    stdout: JSON.stringify(pulls.slice(page * 100, (page + 1) * 100)),
  })),
])

/** The launcher writes its worker log outside every repository, so the fixture root cannot hold it. */
const discardLog = (stdout) => {
  try {
    const { logFile } = JSON.parse(stdout)
    if (logFile) rmSync(logFile, { force: true })
    return logFile
  } catch {
    return null
  }
}

const readFileContents = (path) => {
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

const waitForPublication = (path, inspectPublication, writerResult, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, publication) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(deadline)
      if (error) reject(error)
      else resolve(publication)
    }
    const inspect = () => {
      if (settled) return
      try {
        const publication = inspectPublication()
        if (publication !== null) finish(null, publication)
      } catch (error) {
        finish(error)
      }
    }
    const poll = setInterval(inspect, 20)
    const deadline = setTimeout(() => finish(new Error(`writer did not publish ${path} within ${timeoutMs}ms`)), timeoutMs)
    writerResult?.then((result) => {
      inspect()
      finish(new Error(`writer exited before publishing ${path}: ${result.stderr || result.stdout}`))
    }, finish)
    inspect()
  })

const waitForFile = (path, expectedContents, writerResult) => waitForPublication(path, () => {
  const contents = readFileContents(path)
  if (contents === null) return null
  if (contents !== expectedContents) throw new Error(`observed incomplete contents in ${path}: ${JSON.stringify(contents)}`)
  return contents
}, writerResult)

const waitForAcknowledgementPublication = (path, expectedSample, writerResult, timeoutMs) => {
  const directWriteOpened = `${path}.direct-write-opened`
  const readerObservedIncomplete = `${path}.reader-observed-incomplete`
  let observedIncomplete = false
  return waitForPublication(path, () => {
    const contents = readFileContents(path)
    if (contents !== null && contents !== "") {
      if (contents !== String(expectedSample)) throw new Error(`observed invalid sample in ${path}: ${JSON.stringify(contents)}`)
      return { observedIncomplete, contents }
    }
    const directWriteState = readFileContents(directWriteOpened)
    if (directWriteState === null) return null
    if (directWriteState !== "opened") throw new Error(`observed invalid direct-write state in ${directWriteOpened}: ${JSON.stringify(directWriteState)}`)
    if (!observedIncomplete) {
      observedIncomplete = true
      publishMarker(readerObservedIncomplete, "observed")
    }
    return null
  }, writerResult, timeoutMs)
}

let markerPublication = 0
const publishMarker = (path, contents) => {
  markerPublication += 1
  const unpublishedPath = `${path}.${process.pid}-${markerPublication}.unpublished`
  writeFileSync(unpublishedPath, contents)
  renameSync(unpublishedPath, path)
}

const launchAsync = (path, argv, env) => {
  const child = spawn(process.execPath, [path, ...argv], {
    cwd: dirname(path),
    env: { ...process.env, ...env },
    windowsHide: true,
  })
  let stdout = ""
  let stderr = ""
  const result = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
  return { child, result, output: () => ({ stdout, stderr }) }
}

const checkOccupiedWorktree = async () => {
  const config = launchConfig(stubEngine(IMMEDIATE))
  const occupiedLaunch = launch("occupied-worktree", config)
  const occupiedArgv = ["--issue", "ORB-201", "--worktree", occupiedLaunch.worktree, "--prompt", occupiedLaunch.prompt]
  // IPC owns this fixture's lifetime, including cleanup if the runner is killed without a signal handler.
  const worker = stage("launch-worker/occupied-worker.cjs", `
const { spawn, spawnSync } = require("node:child_process")
process.on("disconnect", () => {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(process.pid)])
  else process.kill(-process.pid, "SIGKILL")
})
const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore" })
descendant.on("error", (error) => { throw error })
descendant.once("spawn", () => process.send(descendant.pid))
`)
  const child = spawn(process.execPath, [worker], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    detached: process.platform !== "win32",
    windowsHide: true,
  })
  const closed = new Promise((resolve) => child.once("close", resolve))
  const cleanup = () => {
    if (Number.isInteger(child.pid)) {
      if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true })
      else {
        try { process.kill(-child.pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error }
      }
    }
    clearWorkerLaunchReservation(process.pid, occupiedLaunch.worktree)
  }
  const interrupt = () => process.exit(1)
  process.once("exit", cleanup)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  let descendantPid
  try {
    descendantPid = await new Promise((resolve, reject) => {
      child.once("message", resolve)
      child.once("error", reject)
      child.once("exit", () => reject(new Error("occupied worker exited before readiness")))
    })
    const reservation = reserveWorkerLaunch({
      launcherPid: process.pid, issue: "ORB-201", runDirectory: occupiedLaunch.worktree,
      repositoryKey: config.cloud.repositoryKey, branch: "main", tier: "default",
      headSha: occupiedLaunch.git(["rev-parse", "HEAD"]).stdout.trim(),
      timestamp: new Date().toISOString(), relaunchReason: null,
    }, config.caps.workerLaunchesPerBranch, occupiedLaunch.worktree)
    if (!reservation.allowed || !recordReservedWorkerPid(process.pid, child.pid, occupiedLaunch.worktree)) {
      throw new Error("could not reserve the occupied fixture worker")
    }
    // Exercise a scheduling delay longer than 1.8 seconds before the refusal check starts.
    await new Promise((resolve) => setTimeout(resolve, 2200))
    const refused = run(TOOL, occupiedArgv, { path: occupiedLaunch.path, env: githubAuthEnv() })
    discardLog(refused.stdout)
    T(`${TOOL}: a second launch into a live worker's worktree is refused with its pid`,
      processIsRunning(child.pid) && processIsRunning(descendantPid) && refused.status === 2 && refused.stderr.includes(`live worker pid ${child.pid}`),
      JSON.stringify({ runningWorkerPid: child.pid, status: refused.status, stderr: refused.stderr }))
  } finally {
    cleanup()
    await closed
    const cleanupDeadline = Date.now() + 5000
    while (processIsRunning(descendantPid) && Date.now() < cleanupDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    process.removeListener("exit", cleanup)
    process.removeListener("SIGINT", interrupt)
    process.removeListener("SIGTERM", interrupt)
  }
  T(`${TOOL}: the occupied fixture cleans up its worker process tree`,
    !processIsRunning(child.pid) && !processIsRunning(descendantPid))
}

const checkKilledLauncherBeforePublication = async () => {
  const gateWorkerPidFile = stage("launch-worker/gate-worker.pid", "")
  rmSync(gateWorkerPidFile)
  const gateWorker = stage("launch-worker/gate-worker.js", `require('node:fs').writeFileSync(${JSON.stringify(gateWorkerPidFile)}, String(process.pid))\n`)
  const gateLaunch = launch("post-spawn-gate", launchConfig(stubEngine(gateWorker)))
  const gateArgv = ["--issue", "ORB-201", "--worktree", gateLaunch.worktree, "--prompt", gateLaunch.prompt]
  const gateClaim = join(gateLaunch.worktree, ".git", "orbit-worker-launches", "occupied-worktree.json")
  const gatePause = stage("launch-worker/gate-pause", "")
  const gateReady = stage("launch-worker/gate-ready", "")
  const heldReservation = stage("launch-worker/held-reservation.json", "")
  rmSync(gatePause)
  rmSync(gateReady)
  const gatePreload = stage("launch-worker/gate-preload.cjs", `
const fs = require('node:fs')
const { syncBuiltinESMExports } = require('node:module')
const claim = ${JSON.stringify(gateClaim)}
const marker = ${JSON.stringify(gatePause)}
const ready = ${JSON.stringify(gateReady)}
const heldReservation = ${JSON.stringify(heldReservation)}
const originalWrite = fs.writeFileSync
const originalRename = fs.renameSync
const publish = (path, contents) => {
  const unpublished = path + '.' + process.pid + '.unpublished'
  originalWrite(unpublished, contents)
  originalRename(unpublished, path)
}
if (process.argv[1]?.endsWith('worker-gate.cjs')) {
  // The gate has installed its IPC listeners before this callback runs.
  setImmediate(() => publish(ready, 'ready'))
}
fs.renameSync = (source, destination) => {
  if (destination === claim) {
    publish(heldReservation, fs.readFileSync(source, 'utf8'))
    publish(marker, 'paused')
    // Only launcher death may end this pause; runner scheduling cannot release the worker.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  }
  return originalRename(source, destination)
}
syncBuiltinESMExports()
`)
  const gateEnv = githubAuthEnv()
  const pausedLaunch = launchAsync(gateLaunch.path, gateArgv, { ...gateEnv, NODE_OPTIONS: `${gateEnv.NODE_OPTIONS} --require "${gatePreload.replaceAll("\\", "/")}"` })
  let gatePid
  let pendingSource
  try {
    await waitForFile(gatePause, "paused", pausedLaunch.result)
    gatePid = JSON.parse(readFileSync(heldReservation, "utf8")).workerPid
    await waitForFile(gateReady, "ready", pausedLaunch.result)
    // Delay consumption beyond the former finite hold to exercise a descheduled runner.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 31000)
    const reservation = JSON.parse(readFileSync(gateClaim, "utf8"))
    pendingSource = JSON.parse(readFileSync(join(gateLaunch.base, ".git", "orbit-wake-sources", `${pausedLaunch.child.pid}.json`), "utf8"))
    T(`${TOOL}: the launcher stays paused before PID publication even when the runner is delayed`,
      processIsRunning(pausedLaunch.child.pid) && processIsRunning(gatePid) &&
      reservation.launcherPid === pausedLaunch.child.pid && reservation.workerPid === undefined &&
      pendingSource.pending === true && pendingSource.workerPid === null && !existsSync(gateWorkerPidFile),
      JSON.stringify({ reservation, pendingSource, gatePid, workerStarted: existsSync(gateWorkerPidFile) }))
    pausedLaunch.child.kill("SIGKILL")
    await pausedLaunch.result
    const gateExitDeadline = Date.now() + 10000
    while (processIsRunning(gatePid) && Date.now() < gateExitDeadline) await new Promise((resolve) => setTimeout(resolve, 20))
    const workerStartedBeforeRelaunch = existsSync(gateWorkerPidFile)
    T(`${TOOL}: launcher death closes the unreleased gate without starting the engine`,
      !processIsRunning(gatePid) && !workerStartedBeforeRelaunch,
      JSON.stringify({ gatePid, workerStartedBeforeRelaunch }))
    const afterDeath = run(TOOL, gateArgv, { path: gateLaunch.path, env: githubAuthEnv() })
    discardLog(afterDeath.stdout)
    const wakeStates = readWakeSourceStates(gateLaunch.base)
    T(`${TOOL}: a killed launcher before PID publication cannot start a worker or strand admission`,
      !workerStartedBeforeRelaunch && afterDeath.status === 0 && existsSync(gateWorkerPidFile) &&
      !existsSync(gateClaim) && wakeStates.live.length === 0 && wakeStates.orphaned.length === 0,
      JSON.stringify({ workerStartedBeforeRelaunch, ...afterDeath, wakeStates }))
  } finally {
    pausedLaunch.child.kill("SIGKILL")
    await pausedLaunch.result
    if (processIsRunning(gatePid)) process.kill(gatePid, "SIGKILL")
    if (pendingSource?.logFile) rmSync(pendingSource.logFile, { force: true })
    clearWorkerLaunchReservation(pausedLaunch.child.pid, gateLaunch.worktree)
  }
}

export const clockCases = async () => {
  const absentPublication = stage("launch-worker/absent-publication", "")
  rmSync(absentPublication)
  const pendingWriter = new Promise(() => {})
  for (const [label, result, timeoutMs, expectedError] of [
    ["bounds a missing acknowledgement from a live sampler", pendingWriter, 50, /did not publish.*within 50ms/],
    ["diagnoses sampler exit before acknowledgement", Promise.resolve({ status: 1, stdout: "", stderr: "sampler stopped" }), 60000, /exited before publishing.*sampler stopped/],
  ]) {
    try {
      await waitForAcknowledgementPublication(absentPublication, 10000, result, timeoutMs)
      T(`${TOOL}: ${label}`, false, "accepted an absent acknowledgement")
    } catch (error) {
      T(`${TOOL}: ${label}`, expectedError.test(error.message), error.message)
    }
  }
  const latePublication = stage("launch-worker/late-publication", "10000")
  const lateSample = await waitForAcknowledgementPublication(latePublication, 10000, Promise.resolve({ status: 0, stdout: "", stderr: "" }))
  T(`${TOOL}: a delayed reader accepts a complete acknowledgement after sampler exit`, !lateSample.observedIncomplete && lateSample.contents === "10000")
  const incompletePublication = stage("launch-worker/incomplete-publication", "")
  publishMarker(`${incompletePublication}.direct-write-opened`, "opened")
  const incompleteSample = waitForAcknowledgementPublication(incompletePublication, 10000, pendingWriter)
  await waitForFile(`${incompletePublication}.reader-observed-incomplete`, "observed", pendingWriter)
  publishMarker(incompletePublication, "10000")
  T(`${TOOL}: the acknowledgement reader records an incomplete direct publication`, (await incompleteSample).observedIncomplete)

  const dripReady = stage("launch-worker/drip-ready", "")
  rmSync(dripReady, { force: true })
  const dripCommand = stage("launch-worker/drip-command", "")
  rmSync(dripCommand, { force: true })
  const dripWritten = stage("launch-worker/drip-written", "")
  rmSync(dripWritten, { force: true })
  const dripTree = stage("launch-worker/drip-tree.json", "")
  // Empty and invalid complete records keep the previous valid clock value instead of becoming 0
  // or terminating supervision. Later records use the same append-only framing.
  const supervisionStart = 10000
  const supervisionClock = stage("launch-worker/supervision-clock", `${supervisionStart}\n`)
  const supervisionClockReady = `${supervisionClock}.ready`
  const acknowledgementPublicationProbe = stage(
    "launch-worker/acknowledgement-publication-probe.cjs",
    `const fs = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const writeFileSync = fs.writeFileSync
const pendingPublications = new Set()
fs.writeFileSync = (path, contents, options) => {
  const clockPath = process.env.ORBIT_TEST_SUPERVISION_CLOCK
  const acknowledgementPrefix = clockPath + ".sampled-"
  const acknowledgementSuffix = String(path).slice(acknowledgementPrefix.length)
  if (clockPath && String(path).startsWith(acknowledgementPrefix) && /^\\d+$/.test(acknowledgementSuffix)) {
    if (pendingPublications.has(path)) return
    pendingPublications.add(path)
    const descriptor = fs.openSync(path, "w")
    const directWriteOpened = path + ".direct-write-opened"
    const readerObservedIncomplete = path + ".reader-observed-incomplete"
    const readerPoll = setInterval(() => {
      if (readFileContents(readerObservedIncomplete) !== "observed") return
      try {
        writeFileSync(descriptor, contents, options)
      } finally {
        fs.closeSync(descriptor)
        clearInterval(readerPoll)
      }
    }, 20)
    const readFileContents = (candidate) => {
      try {
        return fs.readFileSync(candidate, "utf8")
      } catch (error) {
        if (error.code === "ENOENT") return null
        throw error
      }
    }
    const unpublishedPath = directWriteOpened + "." + process.pid + ".unpublished"
    try {
      writeFileSync(unpublishedPath, "opened")
      fs.renameSync(unpublishedPath, directWriteOpened)
    } catch (error) {
      fs.closeSync(descriptor)
      clearInterval(readerPoll)
      throw error
    }
    return
  }
  writeFileSync(path, contents, options)
}
syncBuiltinESMExports()
`,
  )
  const DRIP = stage(
    "launch-worker/dripping-worker.js",
    `const { existsSync, renameSync, writeFileSync } = require("node:fs")
const { spawn } = require("node:child_process")
const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore", env: { ...process.env, NODE_OPTIONS: "" } })
const publishMarker = (path, contents) => {
  const unpublishedPath = path + "." + process.pid + ".unpublished"
  writeFileSync(unpublishedPath, contents)
  renameSync(unpublishedPath, path)
}
const publishHeartbeat = () => {
  if (!existsSync(${JSON.stringify(dripCommand)})) return false
  process.stdout.write("heartbeat\\n", () => publishMarker(${JSON.stringify(dripWritten)}, "written"))
  return true
}
const commandPoll = setInterval(() => {
  if (publishHeartbeat()) clearInterval(commandPoll)
}, 20)
descendant.once("spawn", () => {
  publishMarker(${JSON.stringify(dripTree)}, JSON.stringify({ pid: process.pid, descendantPid: descendant.pid }))
  publishMarker(${JSON.stringify(dripReady)}, "ready")
})
setInterval(() => {}, 60000)
`,
  )
  const logNoProgressMinutes = 0.03
  const logPollSeconds = 0.2
  const logProgress = launch("log-progress", launchConfig({ ...stubEngine(DRIP), timeouts: { hardCeilingMinutes: 5, noProgressMinutes: logNoProgressMinutes, pollSeconds: logPollSeconds } }))
  const logProgressEnvironment = githubAuthEnv()
  const logProgressProcess = launchAsync(
    logProgress.path,
    ["--issue", "ORB-201", "--worktree", logProgress.worktree, "--prompt", logProgress.prompt],
    {
      ...logProgressEnvironment,
      NODE_OPTIONS: `${logProgressEnvironment.NODE_OPTIONS} --require "${acknowledgementPublicationProbe.replaceAll("\\", "/")}"`,
      ORBIT_TEST_SUPERVISION_CLOCK: supervisionClock,
    },
  )
  let workerTree
  try {
    await Promise.all([
      waitForFile(dripReady, "ready", logProgressProcess.result),
      waitForFile(supervisionClockReady, "ready", logProgressProcess.result),
    ])
    workerTree = JSON.parse(readFileSync(dripTree, "utf8"))
    // Hold the reader beyond the former fixture ceiling to model a descheduled harness.
    await new Promise((resolve) => setTimeout(resolve, 6500))
    const noProgressMs = logNoProgressMinutes * 60 * 1000
    const publishClockAndWaitForSample = async (record, expectedSample) => {
      const publishedByteLength = Buffer.byteLength(readFileSync(supervisionClock, "utf8")) + Buffer.byteLength(record)
      const acknowledgement = `${supervisionClock}.sampled-${publishedByteLength}`
      rmSync(acknowledgement, { force: true })
      appendFileSync(supervisionClock, record)
      const publication = await waitForAcknowledgementPublication(acknowledgement, expectedSample, logProgressProcess.result)
      T(
        `${TOOL}: a sampler acknowledgement is atomically published`,
        !publication.observedIncomplete,
        `the reader observed incomplete contents in ${acknowledgement}`,
      )
      return publication.contents
    }
    // The first virtual interval stays one millisecond inside the cap. Empty and invalid records
    // then remain newest while the heartbeat resets the retained clock value.
    const previousClockValue = supervisionStart + noProgressMs - 1
    const afterEmptyRecord = await publishClockAndWaitForSample(`${previousClockValue}\n\n`, previousClockValue)
    T(
      `${TOOL}: an empty clock record retains the previous non-zero value`,
      afterEmptyRecord === String(previousClockValue),
      `the sampler reported ${afterEmptyRecord} instead of ${previousClockValue}`,
    )
    publishMarker(dripCommand, "write one heartbeat")
    await waitForFile(dripWritten, "written", logProgressProcess.result)
    const afterInvalidRecord = await publishClockAndWaitForSample("invalid\n", previousClockValue)
    T(
      `${TOOL}: an invalid clock record retains the previous non-zero value`,
      afterInvalidRecord === String(previousClockValue),
      `the sampler reported ${afterInvalidRecord} instead of ${previousClockValue}`,
    )
    const nextClockValue = supervisionStart + (noProgressMs * 2) - 2
    await publishClockAndWaitForSample(`${nextClockValue}\n`, nextClockValue)
    const afterPartialRecord = await publishClockAndWaitForSample(`${supervisionStart + (noProgressMs * 4)}`, nextClockValue)
    T(
      `${TOOL}: a truncated trailing clock record is ignored until publication completes`,
      afterPartialRecord === String(nextClockValue) && logProgressProcess.child.exitCode === null,
      `the sampler reported ${afterPartialRecord} instead of ${nextClockValue}, or shortened the worker's life`,
    )
    T(
      `${TOOL}: a worker appending to its own log resets the injected stall clock`,
      logProgressProcess.child.exitCode === null && processIsRunning(workerTree.pid) && processIsRunning(workerTree.descendantPid),
      JSON.stringify({ workerTree, launcherExitCode: logProgressProcess.child.exitCode, workerAlive: processIsRunning(workerTree.pid), descendantAlive: processIsRunning(workerTree.descendantPid), ...logProgressProcess.output() }),
    )
    // Complete the trailing record only after the progress assertions, then let supervision kill it.
    await publishClockAndWaitForSample("\n", supervisionStart + (noProgressMs * 4))
    const dripped = await launcherResult(logProgressProcess)
    T(
      `${TOOL}: completing the trailing clock record triggers the configured stall kill`,
      dripped.status === 1 && /"outcome": "KILLED_NO_PROGRESS"/.test(dripped.stdout),
      `exit ${dripped.status}: ${dripped.stderr || dripped.stdout}`,
    )
    discardLog(dripped.stdout)
  } catch (error) {
    T(`${TOOL}: log-progress readiness and acknowledgement publication completes`, false, error.message)
  } finally {
    try {
      await cleanupLifecycleLaunch(logProgressProcess, logProgress, { discardLog, readFileContents })
    } catch (error) {
      T(`${TOOL}: log-progress cleanup completes within its deadline`, false, error.message)
    }
    const cleanupDeadline = Date.now() + 5000
    const workerPids = workerTree ? [workerTree.pid, workerTree.descendantPid] : []
    while (workerPids.some(processIsRunning) && Date.now() < cleanupDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    T(`${TOOL}: the log-progress fixture cleans up its launcher and worker process tree`,
      !processIsRunning(logProgressProcess.child.pid) && workerPids.every((pid) => !processIsRunning(pid)),
      JSON.stringify({ launcherPid: logProgressProcess.child.pid, workerPids }))
  }
}

export const cases = async () => {
  const fixture = launch("dry-run", launchConfig())
  if (!fixture) {
    T(`${TOOL}: a real git worktree fixture is available`, false, "could not stage a git repository")
    return
  }
  check(TOOL, "research refuses an output inside a repository", ["--research", "--order", fixture.prompt, "--out", join(fixture.worktree, "findings.md")], { status: 2, stderr: /output.*repository/ }, { path: fixture.path })
  const admissionConfig = launchConfig(stubEngine(IMMEDIATE))
  const pullRequestCap = admissionConfig.caps.maxOpenPullRequests
  const repositoryCount = Object.keys(admissionConfig.repos).length
  const pullsPerRepository = Math.floor(pullRequestCap / repositoryCount) + 1
  const aboveCapPulls = Array.from({ length: pullsPerRepository }, (_, index) => ({ number: index + 1 }))
  const admissionFixture = launch("admission-refusal", admissionConfig)
  const refusedArgs = ["--issue", "ORB-201", "--worktree", admissionFixture.worktree, "--prompt", admissionFixture.prompt]
  const refusedResult = run(TOOL, refusedArgs, { path: admissionFixture.path, env: githubAuthEnv({ pulls: aboveCapPulls }) })
  const refusedBody = JSON.parse(refusedResult.stdout)
  T(`${TOOL}: admission refuses before reservation and wake source`, refusedResult.status === 8 && refusedBody.reason === "ADMISSION_REFUSED" && refusedBody.counts.openPullRequests === pullsPerRepository * repositoryCount && refusedBody.limits.maxOpenPullRequests === pullRequestCap && !existsSync(join(admissionFixture.worktree, ".git", "orbit-worker-launches")) && readWakeSourceStates(admissionFixture.base).live.length === 0, JSON.stringify(refusedBody))
  const admittedExisting = run(TOOL, refusedArgs, { path: admissionFixture.path, env: githubAuthEnv({ branchPulls: [{ number: 99 }], pulls: aboveCapPulls, queuedRuns: admissionConfig.caps.maxQueuedRuns + 1 }) })
  T(`${TOOL}: existing pull request proceeds above both caps`, admittedExisting.status === 0, admittedExisting.stderr)
  discardLog(admittedExisting.stdout)
  const argv = ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt]
  const options = { path: fixture.path }
  writeRunState({ sessionId: "draining", sleep: true, relay: { pending: true } }, fixture.base)
  const draining = run(TOOL, [...argv, "--dry-run"], options)
  T(`${TOOL}: a relay drain refuses even dry runs`, draining.status === 8 && /ADMISSION_REFUSED/.test(draining.stdout) && /RELAY_DRAIN/.test(draining.stdout))
  writeRunState({ sessionId: "draining", sleep: true, relay: { pending: false } }, fixture.base)

  const measured = check(TOOL, "--measurement resolves the longer no-progress cap", [...argv, "--measurement", "--dry-run"], { status: 0 }, options)
  const measuredPlan = JSON.parse(measured.stdout)
  discardLog(measured.stdout)
  const ordinary = check(TOOL, "without --measurement the ordinary cap applies", [...argv, "--dry-run"], { status: 0 }, options)
  const ordinaryPlan = JSON.parse(ordinary.stdout)
  discardLog(ordinary.stdout)
  for (const name of ["codex", "claude"]) {
    const config = launchConfig()
    config.worker = name
    config.workers[name].command = process.execPath
    const subagents = launch(`subagents-${name}`, config)
    const launchArgs = ["--issue", "#1089", "--worktree", subagents.worktree, "--prompt", subagents.prompt, "--dry-run"]
    const launchOptions = { path: subagents.path }
    const offArgs = name === "codex" ? ["--disable", "multi_agent"] : ["--disallowed-tools", "Task"]
    for (const tier of ["default", "mechanical", "deep", "max"]) {
      const disabled = check(TOOL, `${name}.${tier} non-sweep order resolves offline`, [...launchArgs, "--tier", tier], { status: 0 }, launchOptions)
      T(`${TOOL}: ${name}.${tier} non-sweep order disables sub-agents`,
        offArgs.every((argument) => JSON.parse(disabled.stdout).args.includes(argument)), disabled.stdout)
    }
    check(TOOL, `${name} refuses sub-agents without the sweep heading`, [...launchArgs, "--allow-subagents"], { status: 2, stderr: /--allow-subagents requires the ## UI review sweep heading/ }, launchOptions)
    writeFileSync(subagents.prompt, "## UI review sweep ownership\nCloud handoff only.\n")
    check(TOOL, `${name} refuses a heading prefix`, [...launchArgs, "--allow-subagents"], { status: 2 }, launchOptions)
    writeFileSync(subagents.prompt, "## UI review sweep\nRun the conditional sweep.\n")
    const stillDisabled = check(TOOL, `${name} sweep heading alone grants no permission`, launchArgs, { status: 0 }, launchOptions)
    T(`${TOOL}: ${name} ticket text never enables sub-agents`,
      JSON.parse(stillDisabled.stdout).args.includes(offArgs[1]), stillDisabled.stdout)
    for (const tier of ["default", "mechanical", "deep", "max"]) {
      const allowed = check(TOOL, `${name}.${tier} allows the explicit sweep`, [...launchArgs, "--tier", tier, "--allow-subagents"], { status: 0 }, launchOptions)
      T(`${TOOL}: ${name}.${tier} sweep order drops the off vector`,
        !JSON.parse(allowed.stdout).args.includes(offArgs[1]), allowed.stdout)
    }
  }
  const isolationArgs = ["exec", "--disable", "apps", "--ignore-user-config"]
  T(
    `${TOOL}: ordinary Codex workers disable account apps and user MCP servers`,
    JSON.stringify(ordinaryPlan.args.slice(0, isolationArgs.length)) === JSON.stringify(isolationArgs),
    `argv starts ${JSON.stringify(ordinaryPlan.args.slice(0, isolationArgs.length))}`,
  )
  T(
    `${TOOL}: measurement Codex workers disable account apps and user MCP servers`,
    JSON.stringify(measuredPlan.args.slice(0, isolationArgs.length)) === JSON.stringify(isolationArgs),
    `argv starts ${JSON.stringify(measuredPlan.args.slice(0, isolationArgs.length))}`,
  )
  T(
    `${TOOL}: the measurement cap is longer than the ordinary one, and both are reported`,
    measuredPlan.measurement === true && ordinaryPlan.measurement === false && measuredPlan.noProgressMinutes > ordinaryPlan.noProgressMinutes,
    `measurement ${measuredPlan.noProgressMinutes}, ordinary ${ordinaryPlan.noProgressMinutes}`,
  )
  T(
    `${TOOL}: the HARD CEILING is unchanged by --measurement, so a hung measurement worker still dies`,
    realOrchestratorConfig().timeouts.hardCeilingMinutes > measuredPlan.noProgressMinutes,
    "a measurement cap at or above the hard ceiling would disable the no-progress clock entirely",
  )
  const noMeasurementCap = launch("no-measurement-cap", (() => {
    const config = launchConfig()
    delete config.timeouts.measurementNoProgressMinutes
    return config
  })())
  if (noMeasurementCap) {
    check(
      TOOL,
      "--measurement refuses when the config declares no measurement cap, rather than falling back",
      ["--issue", "ORB-201", "--worktree", noMeasurementCap.worktree, "--prompt", noMeasurementCap.prompt, "--measurement", "--dry-run"],
      { status: 2, stderr: /requires timeouts\.measurementNoProgressMinutes/ },
      { path: noMeasurementCap.path },
    )
  }

  check(TOOL, "refuses a malformed ticket reference", ["--issue", "ticket-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt], { status: 2, stderr: /--issue must be ORB-N, #N, or N/ }, options)
  check(TOOL, "accepts a post-migration #N reference", ["--issue", "#9001", "--worktree", fixture.worktree, "--prompt", fixture.prompt, "--dry-run"], { status: 0, stdout: /"issue": "#9001"/ }, options)
  check(TOOL, "accepts a post-migration plain number and normalizes it", ["--issue", "9001", "--worktree", fixture.worktree, "--prompt", fixture.prompt, "--dry-run"], { status: 0, stdout: /"issue": "#9001"/ }, options)
  check(TOOL, "refuses a tier outside the four order profiles", [...argv, "--tier", "expensive", "--dry-run"], { status: 2, stderr: /--tier must be default, mechanical, deep or max/ }, options)
  check(TOOL, "refuses ultra because automatic delegation is forbidden", [...argv, "--tier", "ultra", "--dry-run"], { status: 2, stderr: /--tier must be default, mechanical, deep or max/ }, options)
  check(TOOL, "refuses a tier flag with no value", [...argv, "--tier"], { status: 2, stderr: /--tier must be default, mechanical, deep or max/ }, options)
  check(TOOL, "refuses an empty relaunch reason", [...argv, "--relaunch-reason", "", "--dry-run"], { status: 2, stderr: /--relaunch-reason must be non-empty text/ }, options)
  check(TOOL, "refuses a missing worktree flag", ["--issue", "ORB-201", "--prompt", fixture.prompt], { status: 2, stderr: /--worktree is required/ }, options)
  check(TOOL, "refuses a missing prompt flag", ["--issue", "ORB-201", "--worktree", fixture.worktree], { status: 2, stderr: /--prompt is required/ }, options)
  check(TOOL, "refuses a worktree that does not exist", ["--issue", "ORB-201", "--worktree", join(fixture.base, "absent"), "--prompt", fixture.prompt], { status: 2, stderr: /worktree not found/ }, options)
  check(TOOL, "refuses a prompt file that does not exist", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", join(fixture.base, "absent.md")], { status: 2, stderr: /prompt file not found/ }, options)
  check(TOOL, "refuses an empty prompt file", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", stage("launch-worker/empty-prompt.md", "")], { status: 2, stderr: /prompt file is empty/ }, options)

  /** A work order written into the tree becomes part of the worker's own diff, so the pull request
   * ships the prompt and Pullfrog reviews it as if it were product code. */
  const insidePrompt = join(fixture.worktree, "work-order.md")
  writeFileSync(insidePrompt, "the work order, verbatim\n")
  check(
    TOOL,
    "refuses a prompt file living inside the worktree it would be committed into",
    ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", insidePrompt],
    { status: 2, stderr: /prompt file lives inside[\s\S]*work order written into a repository gets committed[\s\S]*scratchpad/ },
    options,
  )
  rmSync(insidePrompt, { force: true })

  const plain = dirname(stage("launch-worker/not-a-worktree/marker.txt", "no git here\n"))
  check(TOOL, "refuses a directory that is not a git worktree", ["--issue", "ORB-201", "--worktree", plain, "--prompt", fixture.prompt], { status: 2, stderr: /is not a git worktree/ }, options)

  const unresolvable = launch("unresolvable", launchConfig({ engine: { command: "orbit-not-a-real-worker-binary" } }))
  check(
    TOOL,
    "an unresolvable worker executable fails closed with exit 3 rather than at spawn time",
    ["--issue", "ORB-201", "--worktree", unresolvable.worktree, "--prompt", unresolvable.prompt],
    { status: 3, stderr: /could not resolve the .* worker executable "orbit-not-a-real-worker-binary" on PATH/ },
    { path: unresolvable.path },
  )

  const innerSpawnFailure = launch("inner-spawn-failure", launchConfig({ ...stubEngine(IMMEDIATE) }))
  const failGateSpawn = stage("launch-worker/fail-gate-spawn.cjs", `
if (process.argv[1]?.endsWith("worker-gate.cjs")) {
  const childProcess = require("node:child_process")
  const originalSpawn = childProcess.spawn
  childProcess.spawn = (_executable, args, options) => originalSpawn("orbit-worker-binary-that-does-not-exist", args, options)
}
`)
  const innerFailureEnv = githubAuthEnv()
  const innerFailure = check(
    TOOL,
    "a spawn failure inside the gate reports SPAWN_FAILED and a nonzero launcher exit",
    ["--issue", "ORB-201", "--worktree", innerSpawnFailure.worktree, "--prompt", innerSpawnFailure.prompt],
    { status: 1, stdout: /"outcome": "SPAWN_FAILED"/ },
    { path: innerSpawnFailure.path, env: { ...innerFailureEnv, NODE_OPTIONS: `${innerFailureEnv.NODE_OPTIONS} --require "${failGateSpawn}"` } },
  )
  discardLog(innerFailure.stdout)

  const dryRun = check(TOOL, "--dry-run resolves the plan and exits 0", [...argv, "--dry-run"], { status: 0, stdout: /"dryRun": true/ }, options)
  const real = realOrchestratorConfig()
  const engine = real.workers[real.worker]
  let plan = null
  try {
    plan = JSON.parse(dryRun.stdout)
  } catch {
    plan = null
  }
  T(
    `${TOOL}: --dry-run spawns nothing, so the log file it names was never opened`,
    plan !== null && typeof plan.logFile === "string" && !existsSync(plan.logFile),
    plan === null ? dryRun.stdout || dryRun.stderr : `${plan.logFile} exists, so the worker was started`,
  )
  T(
    `${TOOL}: the engine, tier, and model come from .claude/orchestrator.json`,
    plan !== null && plan.engine === real.worker && plan.tier === "default" && plan.model === engine.models.default.model,
    JSON.stringify(plan),
  )
  T(
    `${TOOL}: the default tier resolves gpt-6.1-sol at high reasoning effort`,
    plan !== null && plan.engine === "codex" && plan.model === "gpt-6.1-sol" && plan.args.includes('model_reasoning_effort="high"'),
    JSON.stringify(plan?.args),
  )
  const mechanicalDryRun = check(TOOL, "--dry-run resolves the mechanical tier", [...argv, "--tier", "mechanical", "--dry-run"], { status: 0 }, options)
  const mechanicalPlan = JSON.parse(mechanicalDryRun.stdout)
  T(
    `${TOOL}: each tier reports itself and resolves a different argument vector`,
    mechanicalPlan.tier === "mechanical" &&
      mechanicalPlan.engine === "codex" &&
      mechanicalPlan.model === "gpt-6.1-sol" &&
      mechanicalPlan.args.includes('model_reasoning_effort="medium"') &&
      JSON.stringify(mechanicalPlan.args) !== JSON.stringify(plan?.args),
    JSON.stringify({ default: plan?.args, mechanical: mechanicalPlan.args }),
  )
  for (const [tier, effort] of [["deep", "xhigh"], ["max", "max"]]) {
    const result = check(TOOL, `--dry-run resolves the ${tier} tier`, [...argv, "--tier", tier, "--dry-run"], { status: 0 }, options)
    const tierPlan = result.status === 0 ? JSON.parse(result.stdout) : null
    T(
      `${TOOL}: the ${tier} tier resolves gpt-6.1-sol at ${effort} reasoning effort`,
      tierPlan?.tier === tier && tierPlan.engine === "codex" && tierPlan.model === "gpt-6.1-sol" &&
        tierPlan.args.includes(`model_reasoning_effort="${effort}"`),
      result.stderr || JSON.stringify(tierPlan),
    )
  }
  T(
    `${TOOL}: the worker is handed the prompt PATH and the branch, never the prompt text`,
    plan !== null && plan.branch === "main" && plan.args.at(-1).includes(fixture.prompt) && !plan.args.at(-1).includes("the work order, verbatim"),
    JSON.stringify(plan?.args?.at(-1)),
  )

  const capped = launch("branch-cap", launchConfig({ ...stubEngine(IMMEDIATE), caps: { workerLaunchesPerBranch: 2 } }))
  await checkOccupiedWorktree()
  await lifecycleCases({
    launch, launchConfig, stubEngine, githubAuthEnv, discardLog, readFileContents, launchAsync, IMMEDIATE, SLEEPER,
  })
  await checkKilledLauncherBeforePublication()
  const cappedArgs = ["--issue", "ORB-201", "--worktree", capped.worktree, "--prompt", capped.prompt]
  const firstLaunch = check(TOOL, "the first launch below the branch cap succeeds", cappedArgs, { status: 0 }, { path: capped.path, env: githubAuthEnv() })
  const secondLaunch = check(TOOL, "the second launch at the branch cap succeeds", [...cappedArgs, "--tier", "mechanical"], { status: 0 }, { path: capped.path, env: githubAuthEnv() })
  discardLog(firstLaunch.stdout)
  discardLog(secondLaunch.stdout)
  const refusedLaunch = check(
    TOOL,
    "a third launch exits 2 and names both earlier launches",
    cappedArgs,
    { status: 2, stderr: /worker launch cap 2 reached[\s\S]*Earlier launches:[\s\S]*1\.[\s\S]*tier=default[\s\S]*2\.[\s\S]*tier=mechanical/ },
    { path: capped.path, env: githubAuthEnv() },
  )
  const allowedLaunch = check(
    TOOL,
    "a third launch with a recorded reason succeeds",
    [...cappedArgs, "--tier", "mechanical", "--relaunch-reason", "Pullfrog supplied a second experiment"],
    { status: 0 },
    { path: capped.path, env: githubAuthEnv() },
  )
  discardLog(allowedLaunch.stdout)
  const ledgerPath = join(capped.worktree, ".git", "orbit-worker-launches")
  const launchLedger = readdirSync(ledgerPath)
    .map((name) => JSON.parse(readFileSync(join(ledgerPath, name), "utf8")))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
  T(
    `${TOOL}: the checkout-local ledger records required fields and the override reason`,
    launchLedger.length === 3 &&
      launchLedger.every((row) => row.repositoryKey === "ui" && row.branch === "main" && /^[0-9a-f]{40}$/.test(row.headSha) && typeof row.timestamp === "string") &&
      launchLedger[2].relaunchReason === "Pullfrog supplied a second experiment" &&
      refusedLaunch.stderr.includes(launchLedger[0].headSha) &&
      capped.git(["status", "--short"]).stdout.trim() === "",
    JSON.stringify({ launchLedger, status: capped.git(["status", "--short"]).stdout }),
  )
  /**
   * Both clocks are read from config.timeouts, and the only way to prove that is to move them:
   * a hardcoded 45 and 10 minutes would leave a sleeping worker running until the suite's own
   * timeout, and would print those numbers rather than the configured ones.
   */
  const noProgress = launch("no-progress", launchConfig({ ...stubEngine(SLEEPER), timeouts: { hardCeilingMinutes: 5, noProgressMinutes: 0.02, pollSeconds: 0.2 } }))
  const stalled = check(
    TOOL,
    "a worker idle on every signal is killed on the configured no-progress clock",
    ["--issue", "ORB-201", "--worktree", noProgress.worktree, "--prompt", noProgress.prompt],
    { status: 1, stdout: /"outcome": "KILLED_NO_PROGRESS"/, stderr: /has not moved HEAD, written a file, grown its log or burned CPU for 0\.02 minutes/ },
    { path: noProgress.path, env: githubAuthEnv() },
  )
  discardLog(stalled.stdout)

  /** The CPU probe covers Windows and macOS, the two systems whose process tables were read for it.
   * On Linux the burner is INVISIBLE to every signal and the correct outcome is the no-progress
   * kill. The branch here asserts that contract instead of skipping the case. */
  const cpuProbed = ["win32", "darwin"].includes(process.platform)
  const BURNER = stage("launch-worker/burning-worker.js", "const stop = Date.now() + 60000\nwhile (Date.now() < stop) {}\n")
  const cpuProgress = launch("cpu-progress", launchConfig({ ...stubEngine(BURNER), timeouts: { hardCeilingMinutes: 0.15, noProgressMinutes: 0.05, pollSeconds: 0.2 } }))
  const burned = check(
    TOOL,
    cpuProbed
      ? "a worker burning CPU while writing nothing anywhere is NOT killed as stalled"
      : "without a CPU probe, a silent CPU burner still dies on the no-progress clock",
    ["--issue", "ORB-201", "--worktree", cpuProgress.worktree, "--prompt", cpuProgress.prompt],
    { status: 1, stdout: cpuProbed ? /"outcome": "KILLED_HARD_CEILING"/ : /"outcome": "KILLED_NO_PROGRESS"/ },
    { path: cpuProgress.path, env: githubAuthEnv() },
  )
  discardLog(burned.stdout)

  await clockCases()

  /** Without a byte cap there is no KILLED_LOG_RUNAWAY to bound a flood, so log growth must NOT
   * count as progress in that configuration: a flooding hung worker would otherwise hold the stall
   * clock open all the way to the ceiling, the exact ORB-201 shape. */
  const uncapped = launch("log-uncapped", (() => {
    const config = launchConfig({ ...stubEngine(UNBOUNDED_LOG_DRIP), timeouts: { hardCeilingMinutes: 0.1, noProgressMinutes: 0.03, pollSeconds: 0.2 } })
    delete config.caps.workerLogMegabytes
    return config
  })())
  const uncappedKill = check(
    TOOL,
    "without a log byte cap, log growth alone does not hold the stall clock open",
    ["--issue", "ORB-201", "--worktree", uncapped.worktree, "--prompt", uncapped.prompt],
    { status: 1, stdout: /"outcome": "KILLED_NO_PROGRESS"/ },
    { path: uncapped.path, env: githubAuthEnv() },
  )
  discardLog(uncappedKill.stdout)

  const flood = launch("log-runaway", launchConfig({ ...stubEngine(FLOODER), timeouts: { hardCeilingMinutes: 5, noProgressMinutes: 5, pollSeconds: 0.2 }, caps: { workerLogMegabytes: 1 } }))
  const flooded = check(
    TOOL,
    "a worker flooding its own log is killed and the outcome NAMES the runaway",
    ["--issue", "ORB-201", "--worktree", flood.worktree, "--prompt", flood.prompt],
    { status: 1, stdout: /"outcome": "KILLED_LOG_RUNAWAY"/, stderr: /MB of worker log, past the 1 MB cap/ },
    { path: flood.path, env: githubAuthEnv() },
  )
  discardLog(flooded.stdout)

  /** An ordinary worker must not trip the cap, or the bound is just a shorter ceiling. */
  const sessionMutator = stage("launch-worker/session-mutator.cjs", 'const { writeFileSync } = require("node:fs")\nwriteFileSync(process.env.ORBIT_TEST_RUN_RECORD, JSON.stringify({ sessionId: "replacement-session" }))\n')
  const belowCap = launch("log-below-cap", launchConfig({ ...stubEngine(sessionMutator), caps: { workerLogMegabytes: 32 } }))
  const sessionRecord = join(belowCap.base, ".git", "orbit-orchestrate-run.json")
  mkdirSync(dirname(sessionRecord), { recursive: true })
  writeFileSync(sessionRecord, JSON.stringify({ sessionId: "launch-session" }))
  const quiet = check(
    TOOL,
    "an ordinary worker well under the log cap exits normally",
    ["--issue", "ORB-201", "--worktree", belowCap.worktree, "--prompt", belowCap.prompt],
    { status: 0, stdout: /"outcome": "EXITED"/ },
    { path: belowCap.path, env: { ...githubAuthEnv(), ORBIT_TEST_RUN_RECORD: sessionRecord } },
  )
  const quietResult = JSON.parse(quiet.stdout)
  T(`${TOOL}: a replacement run cannot relabel the completed launcher result`, quietResult.sessionId === "launch-session", quiet.stdout)
  const savedResult = join(belowCap.base, ".git", "orbit-worker-launches", "results", `${quietResult.launcherPid}.json`)
  T(`${TOOL}: final result is atomically retained in the launcher checkout`,
    existsSync(savedResult) && JSON.stringify(JSON.parse(readFileSync(savedResult, "utf8"))) === JSON.stringify(quietResult))
  discardLog(quiet.stdout)

  const wakeObservation = stage("launch-worker/wake-observation.json", "")
  const wakeAuthEntered = stage("launch-worker/wake-auth-entered", "")
  rmSync(wakeAuthEntered, { force: true })
  const wakeAuthRelease = stage("launch-worker/wake-auth-release", "")
  rmSync(wakeAuthRelease, { force: true })
  const wakeAuthGate = stage("launch-worker/wake-auth-gate.cjs", "")
  const wakeObserver = stage("launch-worker/wake-observer.cjs", "")
  const observedLaunch = launch("wake-cleanup", launchConfig({ ...stubEngine(wakeObserver) }))
  const wakeHooks = join(observedLaunch.base, ".claude", "hooks")
  mkdirSync(join(observedLaunch.base, ".git"), { recursive: true })
  mkdirSync(wakeHooks, { recursive: true })
  cpSync(join(TOOLS_DIR, "..", ".claude", "hooks", "_lib"), join(wakeHooks, "_lib"), { recursive: true })
  cpSync(join(TOOLS_DIR, "..", ".claude", "hooks", "require-wake-source.mjs"), join(wakeHooks, "require-wake-source.mjs"))
  const wakeSessionId = "launch-worker-replacement"
  writeFileSync(
    join(observedLaunch.base, ".git", "orbit-orchestrate-run.json"),
    JSON.stringify({ sessionId: wakeSessionId, sleep: true, remaining: ["ORB-202"] }),
  )
  writeFileSync(wakeAuthGate, `const { existsSync, renameSync, writeFileSync } = require("node:fs")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const line = argv.join(" ")
if (line.includes("actions/runs?status=queued")) { process.stdout.write(JSON.stringify({ total_count: 0, workflow_runs: [] })); process.exit(0) }
if (line.includes("pulls?")) { process.stdout.write("[]"); process.exit(0) }
if (!line.includes("auth token --user test-owner")) process.exit(9)
const unpublishedPath = ${JSON.stringify(wakeAuthEntered)} + "." + process.pid + ".unpublished"
writeFileSync(unpublishedPath, "authentication unresolved")
renameSync(unpublishedPath, ${JSON.stringify(wakeAuthEntered)})
while (!existsSync(${JSON.stringify(wakeAuthRelease)})) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
}
process.stdout.write("test-github-token")
process.exit(0)
`)
  writeFileSync(wakeObserver, `const { readFileSync, readdirSync, writeFileSync } = require("node:fs")
const { spawnSync } = require("node:child_process")
const { join } = require("node:path")
const wakeDirectory = join(${JSON.stringify(observedLaunch.base)}, ".git", "orbit-wake-sources")
const hookPath = join(${JSON.stringify(wakeHooks)}, "require-wake-source.mjs")
const deadline = setTimeout(() => process.exit(1), 10000)
const poll = setInterval(() => {
  const name = readdirSync(wakeDirectory).find((entry) => {
    if (!entry.endsWith(".json")) return false
    const record = JSON.parse(readFileSync(join(wakeDirectory, entry), "utf8"))
    return record.workerPid === process.ppid
  })
  if (!name) return
  const recordPath = join(wakeDirectory, name)
  const source = JSON.parse(readFileSync(recordPath, "utf8"))
  if (source.workerPid !== process.ppid) return
  const stopped = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ session_id: ${JSON.stringify(wakeSessionId)}, stop_hook_active: false }),
    encoding: "utf8",
    windowsHide: true,
  })
  writeFileSync(${JSON.stringify(wakeObservation)}, JSON.stringify({
    recordPath,
    source,
    observerPid: process.pid,
    gatePid: process.ppid,
    stopStatus: stopped.status,
    stopStderr: stopped.stderr,
  }))
  clearTimeout(deadline)
  clearInterval(poll)
}, 50)
`)
  const observedArgv = ["--issue", "ORB-201", "--worktree", observedLaunch.worktree, "--prompt", observedLaunch.prompt]
  const observedProcess = launchAsync(observedLaunch.path, observedArgv, {
    GH_BIN: process.execPath,
    ORCA_BIN: process.execPath,
    NODE_OPTIONS: `--require "${wakeAuthGate.replaceAll("\\", "/")}"`,
  })
  const pendingRecordPath = join(observedLaunch.base, ".git", "orbit-wake-sources", `${observedProcess.child.pid}.json`)
  let observed
  try {
    await waitForFile(wakeAuthEntered, "authentication unresolved", observedProcess.result)
    const pendingSource = existsSync(pendingRecordPath) ? JSON.parse(readFileSync(pendingRecordPath, "utf8")) : null
    const pendingStop = spawnSync(process.execPath, [join(wakeHooks, "require-wake-source.mjs")], {
      input: JSON.stringify({ session_id: wakeSessionId, stop_hook_active: false }),
      encoding: "utf8",
      windowsHide: true,
    })
    T(
      `${TOOL}: unresolved admission has no wake source`,
      pendingSource === null,
      JSON.stringify(pendingSource),
    )
    T(
      `${TOOL}: Stop remains blocked before admission`,
      pendingStop.status === 2,
      `exit ${pendingStop.status}: ${pendingStop.stderr || pendingStop.stdout}`,
    )
  } finally {
    publishMarker(wakeAuthRelease, "release authentication")
    observed = await observedProcess.result
  }
  T(
    `${TOOL}: a real launcher registers its identity while its worker runs and exits normally`,
    observed.status === 0 && /"exitCode": 0/.test(observed.stdout),
    `exit ${observed.status}: ${observed.stderr || observed.stdout}`,
  )
  discardLog(observed.stdout)
  const observation = JSON.parse(readFileSync(wakeObservation, "utf8"))
  T(`${TOOL}: the running launcher record includes its OS start identity`, typeof observation.source.processStartIdentity === "string")
  T(
    `${TOOL}: spawning the child replaces the pending record with its real pid and the Stop adapter still allows`,
    observation.source.pending !== true &&
      observation.source.workerPid === observation.gatePid &&
      observation.stopStatus === 0,
    JSON.stringify(observation),
  )
  T(`${TOOL}: after a real launch exits its observed wake record is gone`, !existsSync(observation.recordPath), observation.recordPath)

  const ceiling = launch("ceiling", launchConfig({ ...stubEngine(SLEEPER), timeouts: { hardCeilingMinutes: 0.02, noProgressMinutes: 5, pollSeconds: 0.2 } }))
  const killed = check(
    TOOL,
    "a worker still running at the configured ceiling is killed with its process tree",
    ["--issue", "ORB-201", "--worktree", ceiling.worktree, "--prompt", ceiling.prompt],
    { status: 1, stdout: /"outcome": "KILLED_HARD_CEILING"/, stderr: /passed the 0\.02 minute ceiling; killing the worker process tree/ },
    { path: ceiling.path, env: githubAuthEnv() },
  )
  discardLog(killed.stdout)
  let emptyKill = null
  try {
    emptyKill = JSON.parse(killed.stdout)
  } catch {
    emptyKill = null
  }
  T(
    `${TOOL}: a kill that leaves no commits reports zero, distinguishably, in the result JSON`,
    emptyKill !== null && emptyKill.commitsSinceLaunch === 0 && Array.isArray(emptyKill.commits) && emptyKill.commits.length === 0,
    killed.stdout,
  )

  const COMMITTER = stage(
    "launch-worker/committing-worker.js",
    'const { spawnSync } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nwriteFileSync("delivered.txt", "the work\\n")\nspawnSync("git", ["add", "delivered.txt"], { stdio: "ignore" })\nspawnSync("git", ["commit", "-q", "-m", "deliver the work"], { stdio: "ignore" })\nsetInterval(() => {}, 60000)\n',
  )
  const committedKill = launch("kill-with-commits", launchConfig({ ...stubEngine(COMMITTER), timeouts: { hardCeilingMinutes: 0.08, noProgressMinutes: 5, pollSeconds: 0.2 } }))
  const salvageable = check(
    TOOL,
    "a kill that leaves commits exits 4 and NAMES them in the result",
    ["--issue", "ORB-201", "--worktree", committedKill.worktree, "--prompt", committedKill.prompt],
    { status: 4, stdout: /"outcome": "KILLED_HARD_CEILING"[\s\S]*"commitsSinceLaunch": 1[\s\S]*deliver the work/ },
    { path: committedKill.path, env: githubAuthEnv() },
  )
  discardLog(salvageable.stdout)

  const ceilingOverride = check(TOOL, "--hard-ceiling-minutes overrides the configured ceiling for one launch", [...argv, "--hard-ceiling-minutes", "90", "--dry-run"], { status: 0, stdout: /"hardCeilingMinutes": 90/ }, options)
  discardLog(ceilingOverride.stdout)
  const ceilingDefault = check(TOOL, "without the flag the ceiling comes from .claude/orchestrator.json", [...argv, "--dry-run"], { status: 0, stdout: new RegExp(`"hardCeilingMinutes": ${realOrchestratorConfig().timeouts.hardCeilingMinutes}\\b`) }, options)
  discardLog(ceilingDefault.stdout)
  check(TOOL, "--hard-ceiling-minutes refuses a non-positive value", [...argv, "--hard-ceiling-minutes", "0", "--dry-run"], { status: 2, stderr: /--hard-ceiling-minutes must be a positive number/ }, options)
  check(TOOL, "--hard-ceiling-minutes refuses a non-numeric value", [...argv, "--hard-ceiling-minutes", "soon", "--dry-run"], { status: 2, stderr: /--hard-ceiling-minutes must be a positive number/ }, options)

  const descendantPidFile = stage("launch-worker/descendant.pid", "")
  const treeWorker = stage(
    "launch-worker/tree-worker.js",
    `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore" })\nwriteFileSync(${JSON.stringify(descendantPidFile)}, String(child.pid))\nsetInterval(() => {}, 60000)\n`,
  )
  const tree = launch("process-tree", launchConfig({ ...stubEngine(treeWorker), timeouts: { hardCeilingMinutes: 0.02, noProgressMinutes: 5, pollSeconds: 0.2 } }))
  const treeKilled = check(TOOL, "a hanging worker tree is timed out", ["--issue", "ORB-201", "--worktree", tree.worktree, "--prompt", tree.prompt], { status: 1, stdout: /KILLED_HARD_CEILING/ }, { path: tree.path, env: githubAuthEnv() })
  discardLog(treeKilled.stdout)
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  const descendantAlive = processIsRunning(descendantPid)
  T(`${TOOL}: timeout removes the complete process tree, not only the parent`, Number.isInteger(descendantPid) && !descendantAlive, `descendant ${descendantPid} still alive`)

  const brokenClock = launch("broken-clock", launchConfig({ timeouts: { pollSeconds: 0 } }))
  const refused = run(TOOL, ["--issue", "ORB-201", "--worktree", brokenClock.worktree, "--prompt", brokenClock.prompt, "--dry-run"], { path: brokenClock.path })
  T(
    `${TOOL}: a config with a zero clock is refused before anything is launched`,
    refused.status === 2 && /timeouts\.pollSeconds must be a positive number/.test(refused.stderr),
    `exit ${refused.status}: ${refused.stderr || refused.stdout}`,
  )

}
