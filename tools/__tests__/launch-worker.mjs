import { spawn, spawnSync } from "node:child_process"
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { processIsRunning, T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig, TOOLS_DIR } from "./_harness.mjs"

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

/**
 * A worker the gate can spawn for real without spawning a model session: node running a script
 * that only sleeps. `args` is the script PATH and not `-e`, because node refuses the `--model`
 * the launcher appends after an `--eval` script ("bad option: --model"), measured.
 */
const stubEngine = (script) => ({ engine: { args: [script], models: { default: { model: "gate-stub", args: [] } } } })

const SLEEPER = stage("launch-worker/sleeping-worker.js", "setTimeout(() => {}, 60000)\n")
const IMMEDIATE = stage("launch-worker/immediate-worker.js", "process.exit(0)\n")
/** Floods stdout the way ORB-201 did, which is how a 61.73 MB log happened. It never exits on its
 * own, so the only thing that can end it is the launcher noticing the flood. */
const FLOODER = stage("launch-worker/flooding-worker.js", "const line = 'x'.repeat(4096)\nsetInterval(() => { for (let i = 0; i < 64; i++) process.stdout.write(line + '\\n') }, 5)\n")

const launch = (label, config) => {
  const repo = stageRepo(`launch-worker-${label}`)
  if (!repo) return null
  repo.git(["remote", "set-url", "origin", `https://github.com/test-owner/${label}.git`])
  const staged = stageWithConfig(`launch-worker-${label}`, TOOL, config)
  return { ...staged, worktree: repo.path, prompt: stage(`launch-worker/${label}-prompt.md`, "the work order, verbatim\n") }
}

const githubAuthEnv = () => orcaEnv([{ match: "auth token --user test-owner", stdout: "test-github-token" }])

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

const waitForFile = (path) => {
  if (existsSync(path)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let deadline
    const finish = () => {
      clearTimeout(deadline)
      watcher.close()
      resolve()
    }
    const watcher = watch(dirname(path), () => {
      if (!existsSync(path)) return
      finish()
    })
    deadline = setTimeout(() => {
      watcher.close()
      reject(new Error(`timed out waiting for ${path}`))
    }, 10000)
    if (existsSync(path)) finish()
  })
}

const launchAsync = (path, argv, env) => {
  const child = spawn(process.execPath, [path, ...argv], {
    cwd: dirname(path),
    env: { ...process.env, ...env },
    windowsHide: true,
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
  return { child, result }
}

export const cases = async () => {
  const fixture = launch("dry-run", launchConfig())
  if (!fixture) {
    T(`${TOOL}: a real git worktree fixture is available`, false, "could not stage a git repository")
    return
  }
  const argv = ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt]
  const options = { path: fixture.path }

  /**
   * The no-progress clock once sampled only HEAD and file mtimes, so a ticket whose work IS
   * measurement looked byte for byte like a hung worker. ORB-225 was killed mid-Lighthouse on
   * 2026-08-08 with real measurements in its log and zero commits, and only succeeded once they
   * were recovered by hand. The raised cap for measurement tickets predates the log and CPU
   * signals (#358) and stays: it is the bound for work that is silent on every signal.
   */
  const measured = check(TOOL, "--measurement resolves the longer no-progress cap", [...argv, "--measurement", "--dry-run"], { status: 0 }, options)
  const measuredPlan = JSON.parse(measured.stdout)
  discardLog(measured.stdout)
  const ordinary = check(TOOL, "without --measurement the ordinary cap applies", [...argv, "--dry-run"], { status: 0 }, options)
  const ordinaryPlan = JSON.parse(ordinary.stdout)
  discardLog(ordinary.stdout)
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
    `${TOOL}: the resolved implementer is gpt-5.6-sol at high reasoning effort (D21)`,
    plan !== null && plan.model === "gpt-5.6-sol" && plan.args.includes('model_reasoning_effort="high"'),
    JSON.stringify(plan?.args),
  )
  T(
    `${TOOL}: the worker is handed the prompt PATH and the branch, never the prompt text`,
    plan !== null && plan.branch === "main" && plan.args.at(-1).includes(fixture.prompt) && !plan.args.at(-1).includes("the work order, verbatim"),
    JSON.stringify(plan?.args?.at(-1)),
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

  /**
   * Six workers holding finished, committed work were killed as "stalled" in one night on
   * 2026-08-22, because progress was defined as HEAD moving or a file changing and a worker inside
   * one long child process (a full test suite, a CI wait) changes neither (#358). CPU burned by the
   * process tree and growth of the worker's own log are both progress now. Each script below is
   * silent on the OLD signals, so with the tiny no-progress cap it survives to the hard ceiling
   * only if its one live signal is being counted.
   */
  /** The CPU probe is deliberately Windows-only (its POSIX shape could never be confirmed against a
   * real system), so off Windows the burner is INVISIBLE to every signal and the correct outcome is
   * the no-progress kill. The branch here asserts that contract instead of skipping the case. */
  const BURNER = stage("launch-worker/burning-worker.js", "const stop = Date.now() + 60000\nwhile (Date.now() < stop) {}\n")
  const cpuProgress = launch("cpu-progress", launchConfig({ ...stubEngine(BURNER), timeouts: { hardCeilingMinutes: 0.15, noProgressMinutes: 0.05, pollSeconds: 0.2 } }))
  const burned = check(
    TOOL,
    process.platform === "win32"
      ? "a worker burning CPU while writing nothing anywhere is NOT killed as stalled"
      : "without the Windows CPU probe, a silent CPU burner still dies on the no-progress clock",
    ["--issue", "ORB-201", "--worktree", cpuProgress.worktree, "--prompt", cpuProgress.prompt],
    { status: 1, stdout: process.platform === "win32" ? /"outcome": "KILLED_HARD_CEILING"/ : /"outcome": "KILLED_NO_PROGRESS"/ },
    { path: cpuProgress.path, env: githubAuthEnv() },
  )
  discardLog(burned.stdout)

  const dripReady = stage("launch-worker/drip-ready", "")
  rmSync(dripReady, { force: true })
  const dripCommand = stage("launch-worker/drip-command", "")
  rmSync(dripCommand, { force: true })
  const dripWritten = stage("launch-worker/drip-written", "")
  rmSync(dripWritten, { force: true })
  // Empty and invalid complete records keep the previous valid clock value instead of becoming 0
  // or terminating supervision. Later records use the same append-only framing.
  const supervisionClock = stage("launch-worker/supervision-clock", "0\n\ninvalid\n")
  const supervisionClockReady = `${supervisionClock}.ready`
  const DRIP = stage(
    "launch-worker/dripping-worker.js",
    `const { existsSync, watch, writeFileSync } = require("node:fs")
const { dirname } = require("node:path")
const publishHeartbeat = () => {
  if (!existsSync(${JSON.stringify(dripCommand)})) return false
  process.stdout.write("heartbeat\\n", () => writeFileSync(${JSON.stringify(dripWritten)}, "written"))
  return true
}
const commandWatcher = watch(dirname(${JSON.stringify(dripCommand)}), () => {
  if (publishHeartbeat()) commandWatcher.close()
})
writeFileSync(${JSON.stringify(dripReady)}, "ready")
if (publishHeartbeat()) commandWatcher.close()
setInterval(() => {}, 60000)
`,
  )
  const logNoProgressMinutes = 0.03
  const logProgress = launch("log-progress", launchConfig({ ...stubEngine(DRIP), timeouts: { hardCeilingMinutes: 0.1, noProgressMinutes: logNoProgressMinutes, pollSeconds: 0.2 } }))
  const logProgressProcess = launchAsync(
    logProgress.path,
    ["--issue", "ORB-201", "--worktree", logProgress.worktree, "--prompt", logProgress.prompt],
    { ...githubAuthEnv(), ORBIT_TEST_SUPERVISION_CLOCK: supervisionClock },
  )
  await Promise.all([waitForFile(dripReady), waitForFile(supervisionClockReady)])
  const noProgressMs = logNoProgressMinutes * 60 * 1000
  // Whichever side of the heartbeat the sampler observes, the next virtual interval remains one
  // millisecond inside the cap. Ignoring log growth leaves the full two intervals visible and red.
  appendFileSync(supervisionClock, `${noProgressMs - 1}\n`)
  writeFileSync(dripCommand, "write one heartbeat")
  await waitForFile(dripWritten)
  appendFileSync(supervisionClock, `${(noProgressMs * 2) - 2}\n`)
  const dripped = await logProgressProcess.result
  T(
    `${TOOL}: a worker appending to its own log resets the injected stall clock`,
    dripped.status === 1 && /"outcome": "KILLED_HARD_CEILING"/.test(dripped.stdout),
    `exit ${dripped.status}: ${dripped.stderr || dripped.stdout}`,
  )
  discardLog(dripped.stdout)

  /** Without a byte cap there is no KILLED_LOG_RUNAWAY to bound a flood, so log growth must NOT
   * count as progress in that configuration: a flooding hung worker would otherwise hold the stall
   * clock open all the way to the ceiling, the exact ORB-201 shape. */
  const uncapped = launch("log-uncapped", (() => {
    const config = launchConfig({ ...stubEngine(DRIP), timeouts: { hardCeilingMinutes: 0.1, noProgressMinutes: 0.03, pollSeconds: 0.2 } })
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

  /**
   * A worker that floods its own log is a runaway, and it used to die unexplained. Measured on the
   * 2026-08-08 night: ORB-201 wrote 61.73 MB in 36.9 minutes, 28.6 KB/s, eight times the next
   * fastest writer, and its log is one enormous git diff (5,928 hunk headers, 41,215 deleted
   * lines). It is the only log in that batch carrying "code-mode host closed its stdout", and
   * ORB-162 died 3 seconds later mid-write with no error line at all.
   *
   * The proximate failure is the vendor's code-mode host, not this harness. What IS the harness's is
   * that nothing bounded the flood, so the outcome now names it with the byte count attached.
   */
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
  const belowCap = launch("log-below-cap", launchConfig({ ...stubEngine(IMMEDIATE), caps: { workerLogMegabytes: 32 } }))
  const quiet = check(
    TOOL,
    "an ordinary worker well under the log cap exits normally",
    ["--issue", "ORB-201", "--worktree", belowCap.worktree, "--prompt", belowCap.prompt],
    { status: 0, stdout: /"outcome": "EXITED"/ },
    { path: belowCap.path, env: githubAuthEnv() },
  )
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
  writeFileSync(wakeAuthGate, `const { existsSync, writeFileSync } = require("node:fs")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
if (!argv.join(" ").includes("auth token --user test-owner")) process.exit(9)
writeFileSync(${JSON.stringify(wakeAuthEntered)}, "authentication unresolved")
while (!existsSync(${JSON.stringify(wakeAuthRelease)})) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
}
process.stdout.write("test-github-token")
process.exit(0)
`)
  writeFileSync(wakeObserver, `const { existsSync, readFileSync, writeFileSync } = require("node:fs")
const { spawnSync } = require("node:child_process")
const { join } = require("node:path")
const recordPath = join(${JSON.stringify(observedLaunch.base)}, ".git", "orbit-wake-sources", process.ppid + ".json")
const hookPath = join(${JSON.stringify(wakeHooks)}, "require-wake-source.mjs")
const deadline = setTimeout(() => process.exit(1), 10000)
const poll = setInterval(() => {
  if (!existsSync(recordPath)) return
  const source = JSON.parse(readFileSync(recordPath, "utf8"))
  if (source.workerPid !== process.pid) return
  const stopped = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ session_id: ${JSON.stringify(wakeSessionId)}, stop_hook_active: false }),
    encoding: "utf8",
    windowsHide: true,
  })
  writeFileSync(${JSON.stringify(wakeObservation)}, JSON.stringify({
    recordPath,
    source,
    observerPid: process.pid,
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
    await waitForFile(wakeAuthEntered)
    const pendingSource = existsSync(pendingRecordPath) ? JSON.parse(readFileSync(pendingRecordPath, "utf8")) : null
    const pendingStop = spawnSync(process.execPath, [join(wakeHooks, "require-wake-source.mjs")], {
      input: JSON.stringify({ session_id: wakeSessionId, stop_hook_active: false }),
      encoding: "utf8",
      windowsHide: true,
    })
    T(
      `${TOOL}: while authentication is unresolved the launcher has a fresh pending wake source`,
      pendingSource?.pending === true &&
        pendingSource.workerPid === null &&
        pendingSource.pid === observedProcess.child.pid &&
        typeof pendingSource.processStartIdentity === "string",
      JSON.stringify(pendingSource),
    )
    T(
      `${TOOL}: the pending launcher record lets the Stop adapter allow before child spawn`,
      pendingStop.status === 0,
      `exit ${pendingStop.status}: ${pendingStop.stderr || pendingStop.stdout}`,
    )
  } finally {
    writeFileSync(wakeAuthRelease, "release authentication")
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
      observation.source.workerPid === observation.observerPid &&
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
  /** A kill that leaves nothing must say so in the result itself, without anyone calling git (#358). */
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

  /**
   * The other half of the #358 report: a kill that leaves committed work must not exit with the
   * same code and shape as a kill that leaves nothing. On 2026-08-22 a killed worker whose three
   * commits later merged to main unchanged reported identically to one that produced nothing.
   */
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

  /** Three of the six 2026-08-22 kills were the fleet-wide 45-minute cap on tickets that
   * legitimately take longer, so the ceiling is per-launch overridable (#358). */
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
