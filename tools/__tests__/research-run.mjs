import { spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, processIsRunning, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"
import { readWakeSourceStates, wakeSourceDirectory, workerLaunchDirectory, writeRunState } from "../lib/run-state.mjs"

const TOOL = "launch-worker.mjs"
const engineStub = (label, body) => {
  const script = stage(`research/${label}.js`, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(script, 0o755)
  if (process.platform !== "win32") return script
  return stage(`research/${label}.cmd`, `@echo off\n"${process.execPath}" "%dp0%\\${label}.js" %*\n`)
}
const fixture = (label, command, overrides = {}) => {
  const real = realOrchestratorConfig()
  const worker = overrides.worker ?? real.worker
  const config = { ...real, ...overrides, workers: { ...real.workers, [worker]: { ...real.workers[worker], command } } }
  const staged = stageWithConfig(`research-${label}`, TOOL, config)
  const order = stage(`research/${label}-order.md`, "Compare read-only research approaches and cite sources.\n")
  const output = join(dirname(order), `${label}-findings.md`)
  return { ...staged, order, output, argv: ["--research", "--order", order, "--out", output] }
}
const immediateBody = `
const fs = require('node:fs')
const args = process.argv.slice(2)
const snapshot = { args, directory: process.cwd(), files: fs.readdirSync(process.cwd()), credentials: Object.keys(process.env).filter(key => /^(GIT|GH_|GITHUB_|SSH_|ORCA_)/.test(key)), input: '' }
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { snapshot.input += chunk })
process.stdin.on('end', () => {
  const findings = JSON.stringify(snapshot)
  const outputIndex = args.indexOf('--output-last-message')
  if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], findings)
  else process.stdout.write(findings)
})`
const asyncRun = (staged) => {
  const child = spawn(process.execPath, [...(staged.preload ? ["--require", staged.preload] : []), staged.path, ...staged.argv], { cwd: staged.base, env: process.env })
  const pids = new Set([child.pid])
  let closed = false
  let stdout = ""
  let stderr = ""
  const result = new Promise((resolve) => {
    child.stdout.on("data", chunk => { stdout += chunk })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", error => { stderr += error.message })
    child.on("close", status => { closed = true; resolve({ status, stdout, stderr }) })
  })
  let stopping
  const stop = () => stopping ??= (async () => {
    const wakePath = join(wakeSourceDirectory(staged.base), `${child.pid}.json`)
    let wake = null
    try { wake = JSON.parse(readFileSync(wakePath, "utf8")) } catch (error) { if (error.code !== "ENOENT") throw error }
    const workerPid = wake?.workerPid
    if (Number.isInteger(workerPid)) pids.add(workerPid)
    const killWorker = () => {
      if (!Number.isInteger(workerPid)) return
      if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(workerPid)], { windowsHide: true })
      else { try { process.kill(-workerPid, "SIGKILL") } catch { /* the worker group may have already exited */ } }
    }
    const watchdog = setTimeout(() => { killWorker(); child.kill("SIGKILL") }, 5000)
    try {
      if (!closed) child.kill("SIGTERM")
      await result
    } finally {
      clearTimeout(watchdog)
      killWorker()
      const cleanupDeadline = Date.now() + 5000
      let alive = [...pids].filter(processIsRunning)
      while (alive.length > 0 && Date.now() < cleanupDeadline) {
        await new Promise(resolve => setTimeout(resolve, 20))
        alive = [...pids].filter(processIsRunning)
      }
      T("research: fixture cleanup waits for every recorded PID", alive.length === 0, `cleanup exceeded 5000ms; still running PIDs: ${alive.join(", ")}`)
      if (wake) rmSync(wake.logFile, { force: true })
    }
  })()
  const deadline = setTimeout(() => { stderr += "research fixture exceeded its execution bound\n"; void stop() }, 120000)
  result.then(() => clearTimeout(deadline))
  return { child, result, stop, pids }
}
const waitForPublishedFile = (path, result, timeoutMs = 60000) => new Promise((resolve) => {
  let settled = false
  const finish = (error) => {
    if (settled) return
    settled = true
    clearInterval(poll)
    clearTimeout(deadline)
    resolve({ ready: !error, error })
  }
  const poll = setInterval(() => { if (existsSync(path)) finish() }, 20)
  const deadline = setTimeout(() => finish(`engine did not publish its marker within ${timeoutMs}ms`), timeoutMs)
  result.then(value => finish(`engine exited before marker: ${value.stderr}`), error => finish(error.message))
  if (existsSync(path)) finish()
})
const gateCeilingUntilRelease = (staged, label) => {
  const release = stage(`research/${label}-ceiling-release`, "")
  rmSync(release)
  const hardCeilingMs = JSON.parse(readFileSync(staged.configPath, "utf8")).timeouts.hardCeilingMinutes * 60000
  // Only the launcher is preloaded. Its real ceiling callback and native timer run after release.
  const preload = stage(`research/${label}-ceiling.cjs`, `
const { existsSync } = require('node:fs')
const nativeSetTimeout = global.setTimeout
const nativeClearTimeout = global.clearTimeout
const pending = new Map()
global.setTimeout = (callback, milliseconds, ...args) => {
  if (milliseconds !== ${hardCeilingMs}) return nativeSetTimeout(callback, milliseconds, ...args)
  const handle = nativeSetTimeout(() => {}, 2147483647)
  nativeClearTimeout(handle)
  let armedTimer = null
  const arm = () => {
    if (armedTimer || !existsSync(${JSON.stringify(release)})) return
    clearInterval(poll)
    armedTimer = nativeSetTimeout(callback, milliseconds, ...args)
  }
  const poll = setInterval(arm, 20)
  pending.set(handle, () => { clearInterval(poll); nativeClearTimeout(armedTimer) })
  arm()
  return handle
}
global.clearTimeout = handle => {
  pending.get(handle)?.()
  pending.delete(handle)
  nativeClearTimeout(handle)
}
`)
  return { ...staged, preload, release }
}
const withReadyEngine = async (staged, marker, assertions) => {
  const running = asyncRun(staged)
  try {
    const readiness = await waitForPublishedFile(marker, running.result)
    T("research: the supervision engine publishes readiness", readiness.ready, readiness.error)
    if (readiness.ready) {
      const enginePids = Object.values(JSON.parse(readFileSync(marker, "utf8")))
      for (const pid of [...enginePids, ...readWakeSourceStates(staged.base).live.map(source => source.workerPid)]) running.pids.add(pid)
      await assertions(running, enginePids)
    }
  } catch (error) {
    T("research: supervision completes without a fixture error", false, error.message)
  } finally {
    await running.stop()
  }
}
const discardLog = (result) => {
  const report = JSON.parse(result.stdout)
  rmSync(report.logFile, { force: true })
  return report
}

export const cases = async () => {
  const command = engineStub("immediate", immediateBody)
  const staged = fixture("success", command)
  const result = run(TOOL, staged.argv, { path: staged.path, env: { GH_TOKEN: "fixture", GITHUB_TOKEN: "fixture", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "fixture", SSH_AUTH_SOCK: "fixture" } })
  T("research: order and output start without a ticket or worktree", result.status === 0, result.stderr)
  if (result.status !== 0) return
  const observed = JSON.parse(readFileSync(staged.output, "utf8"))
  const report = discardLog(result)
  T("research: child starts in an empty directory outside repositories", observed.files.length === 0 && observed.directory !== staged.base && !existsSync(observed.directory))
  T("research: child receives the actual order on stdin", observed.input.includes(readFileSync(staged.order, "utf8")))
  T("research: child receives no git credentials or launcher exemption", observed.credentials.length === 0 && !observed.args.includes("--dangerously-bypass-approvals-and-sandbox"))
  T("research: Codex is read-only with search and a final-message output", observed.args[observed.args.indexOf("--sandbox") + 1] === "read-only" && observed.args.includes('web_search="live"') && observed.args.includes("--skip-git-repo-check"))
  T("research: successful publication has no admission or ticket launch records", report.published && !existsSync(workerLaunchDirectory(staged.base)) && readWakeSourceStates(staged.base).live.length === 0)

  const repository = stageRepo("research-output")
  check(TOOL, "research refuses repository output", ["--research", "--order", staged.order, "--out", join(repository.path, "findings.md")], { status: 2, stderr: /output.*repository/ }, { path: staged.path })
  check(TOOL, "research refuses no order", ["--research", "--out", staged.output], { status: 2, stderr: /--order is required/ }, { path: staged.path })
  check(TOOL, "research refuses no output", ["--research", "--order", staged.order], { status: 2, stderr: /--out is required/ }, { path: staged.path })
  check(TOOL, "research refuses an empty order", ["--research", "--order", stage("research/empty.md", ""), "--out", join(dirname(staged.output), "empty-output.md")], { status: 2, stderr: /non-empty/ }, { path: staged.path })
  check(TOOL, "research refuses ticket arguments", [...staged.argv, "--issue", "#1128"], { status: 2, stderr: /unsupported research option/ }, { path: staged.path })
  check(TOOL, "research refuses overwrite", staged.argv, { status: 2, stderr: /new file/ }, { path: staged.path })
  const linkedDirectory = join(dirname(staged.output), "repository-link")
  symlinkSync(repository.path, linkedDirectory, process.platform === "win32" ? "junction" : "dir")
  check(TOOL, "research refuses symlink output into a repository", ["--research", "--order", staged.order, "--out", join(linkedDirectory, "findings.md")], { status: 2, stderr: /output.*repository/ }, { path: staged.path })
  const linkedOutput = join(dirname(staged.output), "output-link.md")
  symlinkSync(join(repository.path, "findings.md"), linkedOutput)
  check(TOOL, "research refuses a dangling output symlink", ["--research", "--order", staged.order, "--out", linkedOutput], { status: 2, stderr: /new file/ }, { path: staged.path })
  const emptyHome = dirname(stage("research/empty-home/marker", ""))
  const bareRepository = repository.origin
  check(TOOL, "research refuses output in a bare repository", ["--research", "--order", staged.order, "--out", join(bareRepository, "findings.md")], { status: 2, stderr: /output.*repository/ }, { path: staged.path, env: { HOME: emptyHome } })

  const failed = fixture("failed", engineStub("failed", "process.exit(7)"))
  const failedMarker = stage("research/failed-marker", "")
  rmSync(failedMarker)
  const failingRun = asyncRun(failed)
  try {
    const readiness = await waitForPublishedFile(failedMarker, failingRun.result)
    const failedResult = await failingRun.result
    const failedReport = discardLog(failedResult)
    failingRun.pids.add(failedReport.pid)
    T("research: an engine failure cannot publish findings or report success", failedResult.status === 1 && !existsSync(failed.output) && failedReport.exitCode === 7)
    T("research: exit before readiness returns an assertion result", !readiness.ready && readiness.error.includes("engine exited before marker"))
    T("research: exit before readiness stops the gate and deletes its wake record", !processIsRunning(failedReport.pid) && !existsSync(join(wakeSourceDirectory(failed.base), `${failingRun.child.pid}.json`)))
  } finally {
    await failingRun.stop()
  }
  const empty = fixture("empty", engineStub("empty", "process.exit(0)"))
  const emptyResult = run(TOOL, empty.argv, { path: empty.path })
  T("research: an empty result cannot report success", emptyResult.status === 1 && !existsSync(empty.output) && !discardLog(emptyResult).published)

  const claude = fixture("claude", command, { worker: "claude" })
  const claudeResult = run(TOOL, claude.argv, { path: claude.path })
  T("research: the configured Claude engine returns findings through stdout", claudeResult.status === 0 && discardLog(claudeResult).engine === "claude")
  const claudeObserved = JSON.parse(readFileSync(claude.output, "utf8"))
  T("research: Claude has only web tools and no bypass or inherited settings", claudeObserved.args[claudeObserved.args.indexOf("--tools") + 1] === "WebSearch,WebFetch" && claudeObserved.args.includes("dontAsk") && !claudeObserved.args.includes("bypassPermissions"))
  const allowedAt = claudeObserved.args.indexOf("--allowedTools")
  T("research: Claude pre-approves exactly the two web tools", allowedAt > 0 && JSON.stringify(claudeObserved.args.slice(allowedAt + 1, allowedAt + 3)) === JSON.stringify(["WebSearch", "WebFetch"]) && claudeObserved.args[allowedAt + 3].startsWith("--") && !claudeObserved.args.some((arg) => /^(Bash|Edit|Write|Read|Agent|mcp__)/.test(arg)))

  const marker = stage("research/wake-marker-parent/marker", "")
  rmSync(marker)
  const sleeper = engineStub("sleeper", `
const { spawn } = require('node:child_process')
const { renameSync, writeFileSync } = require('node:fs')
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)'], { stdio: 'ignore' })
setTimeout(() => {
  writeFileSync(${JSON.stringify(`${marker}.unpublished`)}, JSON.stringify({ enginePid: process.pid, descendantPid: descendant.pid }))
  renameSync(${JSON.stringify(`${marker}.unpublished`)}, ${JSON.stringify(marker)})
}, 1500)
setInterval(() => {}, 60000)
`)
  const real = realOrchestratorConfig()
  // Readiness takes longer than this ceiling. Only the fixture release starts the native timer.
  const hardCeilingMinutes = 0.02
  const timeouts = { ...real.timeouts, hardCeilingMinutes, pollSeconds: 0.1 }
  const unpublished = gateCeilingUntilRelease(fixture("unpublished", sleeper, { timeouts }), "unpublished")
  for (let attempt = 0; attempt < 5; attempt++) {
    rmSync(marker, { force: true })
    let unpublishedPids = []
    await withReadyEngine(unpublished, marker, async (running, pids) => {
      const workerPid = readWakeSourceStates(unpublished.base).live[0].workerPid
      unpublishedPids = [running.child.pid, workerPid, ...pids]
      const readiness = await waitForPublishedFile(`${marker}.missing`, running.result, 20)
      T("research: a missing marker returns a bounded assertion result while the tree is live", !readiness.ready && readiness.error.includes("within 20ms") && unpublishedPids.every(processIsRunning))
      // A stopped worker tree cannot handle the launcher's graceful termination signal.
      if (process.platform !== "win32") {
        process.kill(-workerPid, "SIGSTOP")
        const stop = running.stop
        running.stop = async () => {
          const nativeKill = process.kill
          // Hold delivery so cleanup must observe termination instead of trusting signal success.
          process.kill = (pid, signal) => {
            if (pid !== -workerPid || signal !== "SIGKILL") return nativeKill(pid, signal)
            const delivered = nativeKill(pid, 0)
            setTimeout(() => {
              try { nativeKill(pid, signal) } catch (error) { if (error.code !== "ESRCH") throw error }
            }, 250)
            return delivered
          }
          try { await stop() } finally { process.kill = nativeKill }
        }
      }
    })
    const alive = unpublishedPids.filter(processIsRunning)
    T("research: missing-marker cleanup stops the launcher, gate, engine and descendant", unpublishedPids.length === 4 && alive.length === 0, `attempt ${attempt + 1}: still running PIDs: ${alive.join(", ")}`)
    T("research: missing-marker cleanup deletes wake state without publishing findings", !existsSync(join(wakeSourceDirectory(unpublished.base), `${unpublishedPids[0]}.json`)) && !existsSync(unpublished.output))
  }
  rmSync(marker, { force: true })
  const supervised = gateCeilingUntilRelease(fixture("supervised", sleeper, { timeouts }), "supervised")
  writeRunState({ sessionId: "research-session", sleep: true, remaining: ["#1128"] }, supervised.base)
  await withReadyEngine(supervised, marker, async (running, sleeperPids) => {
    T("research: delayed engine startup reaches readiness with a live descendant", sleeperPids.every(processIsRunning))
    const wakes = readWakeSourceStates(supervised.base).live
    T("research: a live wake source records the launcher and child before execution", wakes.some(source => source.pid === running.child.pid && source.research === true && Number.isInteger(source.workerPid)))
    T("research: a running researcher has no ticket admission or branch reservation", !existsSync(workerLaunchDirectory(supervised.base)))
    writeFileSync(supervised.release, "release")
    const killed = await running.result
    const killedReport = discardLog(killed)
    T("research: the hard ceiling stops the gate, engine and descendant", [killedReport.pid, ...sleeperPids].every(pid => !processIsRunning(pid)))
    T("research: the hard ceiling deletes the wake record before any reader sweeps it", !existsSync(join(wakeSourceDirectory(supervised.base), `${running.child.pid}.json`)))
    T("research: the shared hard ceiling kills the run and clears the wake source", killed.status === 1 && killedReport.outcome === "KILLED_HARD_CEILING" && readWakeSourceStates(supervised.base).live.length === 0 && !existsSync(supervised.output))
  })
  const floodMarker = stage("research/flood-marker-parent/marker", "")
  rmSync(floodMarker)
  const floodRelease = `${floodMarker}.release`
  const flooder = engineStub("report-flooder", `
const { spawn } = require('node:child_process')
const { existsSync, renameSync, writeFileSync } = require('node:fs')
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)'], { stdio: 'ignore' })
setTimeout(() => {
  writeFileSync(${JSON.stringify(`${floodMarker}.unpublished`)}, JSON.stringify({ enginePid: process.pid, descendantPid: descendant.pid }))
  renameSync(${JSON.stringify(`${floodMarker}.unpublished`)}, ${JSON.stringify(floodMarker)})
}, 1500)
setInterval(() => { if (existsSync(${JSON.stringify(floodRelease)})) process.stdout.write('x'.repeat(4096)) }, 5)
`)
  const flooding = gateCeilingUntilRelease(fixture("report-flood", flooder, { worker: "claude", timeouts: { ...timeouts, pollSeconds: 0.05 }, caps: { ...real.caps, workerLogMegabytes: 0.01 } }), "report-flood")
  writeRunState({ sessionId: "research-flood-session", sleep: true, remaining: ["#1128"] }, flooding.base)
  await withReadyEngine(flooding, floodMarker, async (floodingRun, floodPids) => {
    T("research: the log-cap fixture reaches readiness with a live engine and descendant", floodPids.every(processIsRunning))
    T("research: the log-cap fixture registers a live wake source before flooding", readWakeSourceStates(flooding.base).live.some(source => source.pid === floodingRun.child.pid && source.workerPid > 0))
    writeFileSync(floodRelease, "release")
    const floodingResult = await floodingRun.result
    const floodingReport = discardLog(floodingResult)
    T("research: the log cap stops the gate, engine and descendant", [floodingReport.pid, ...floodPids].every(pid => !processIsRunning(pid)))
    T("research: the log cap deletes the wake record before any reader sweeps it", !existsSync(join(wakeSourceDirectory(flooding.base), `${floodingRun.child.pid}.json`)))
    T("research: the log cap clears live and orphaned wake sources", Object.values(readWakeSourceStates(flooding.base)).every(sources => sources.length === 0))
    T("research: findings streamed on stdout obey the shared log cap", floodingResult.status === 1 && floodingReport.outcome === "KILLED_LOG_RUNAWAY" && !existsSync(flooding.output), floodingReport.outcome)
  })
}
