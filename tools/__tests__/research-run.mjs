import { spawn } from "node:child_process"
import { chmodSync, existsSync, readFileSync, rmSync, symlinkSync, watch } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"
import { readWakeSourceStates, workerLaunchDirectory, writeRunState } from "../lib/run-state.mjs"

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
  const child = spawn(process.execPath, [staged.path, ...staged.argv], { cwd: staged.base, env: process.env })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", chunk => { stdout += chunk })
    child.stderr.on("data", chunk => { stderr += chunk })
    child.on("error", reject)
    child.on("close", status => resolve({ status, stdout, stderr }))
  })
  return { child, result }
}
const waitForPublishedFile = (path, result) => new Promise((resolve, reject) => {
  let settled = false
  const finish = (error) => {
    if (settled) return
    settled = true
    watcher.close()
    if (error) reject(error)
    else resolve()
  }
  const watcher = watch(dirname(path), () => { if (existsSync(path)) finish() })
  result.then(value => finish(new Error(`engine exited before marker: ${value.stderr}`)), finish)
  if (existsSync(path)) finish()
})
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
  const failedResult = run(TOOL, failed.argv, { path: failed.path })
  T("research: an engine failure cannot publish findings or report success", failedResult.status === 1 && !existsSync(failed.output) && discardLog(failedResult).exitCode === 7)
  const empty = fixture("empty", engineStub("empty", "process.exit(0)"))
  const emptyResult = run(TOOL, empty.argv, { path: empty.path })
  T("research: an empty result cannot report success", emptyResult.status === 1 && !existsSync(empty.output) && !discardLog(emptyResult).published)

  const claude = fixture("claude", command, { worker: "claude" })
  const claudeResult = run(TOOL, claude.argv, { path: claude.path })
  T("research: the configured Claude engine returns findings through stdout", claudeResult.status === 0 && discardLog(claudeResult).engine === "claude")
  const claudeObserved = JSON.parse(readFileSync(claude.output, "utf8"))
  T("research: Claude has only web tools and no bypass or inherited settings", claudeObserved.args[claudeObserved.args.indexOf("--tools") + 1] === "WebSearch,WebFetch" && claudeObserved.args.includes("dontAsk") && !claudeObserved.args.includes("bypassPermissions"))

  const marker = stage("research/wake-marker-parent/marker", "")
  rmSync(marker)
  const sleeper = engineStub("sleeper", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ready'); setTimeout(() => {}, 60000)`)
  const real = realOrchestratorConfig()
  const supervised = fixture("supervised", sleeper, { timeouts: { ...real.timeouts, hardCeilingMinutes: 0.02, pollSeconds: 0.1 } })
  writeRunState({ sessionId: "research-session", sleep: true, remaining: ["#1128"] }, supervised.base)
  const running = asyncRun(supervised)
  await waitForPublishedFile(marker, running.result)
  const wakes = readWakeSourceStates(supervised.base).live
  T("research: a live wake source records the launcher and child before execution", wakes.some(source => source.pid === running.child.pid && source.research === true && Number.isInteger(source.workerPid)))
  T("research: a running researcher has no ticket admission or branch reservation", !existsSync(workerLaunchDirectory(supervised.base)))
  const killed = await running.result
  const killedReport = discardLog(killed)
  T("research: the shared hard ceiling kills the run and clears the wake source", killed.status === 1 && killedReport.outcome === "KILLED_HARD_CEILING" && readWakeSourceStates(supervised.base).live.length === 0 && !existsSync(supervised.output))
  const flooder = engineStub("report-flooder", "setInterval(() => process.stdout.write('x'.repeat(4096)), 5)")
  const flooding = fixture("report-flood", flooder, { worker: "claude", timeouts: { ...real.timeouts, hardCeilingMinutes: 0.02, pollSeconds: 0.05 }, caps: { ...real.caps, workerLogMegabytes: 0.01 } })
  const floodingResult = run(TOOL, flooding.argv, { path: flooding.path })
  const floodingReport = discardLog(floodingResult)
  T("research: findings streamed on stdout obey the shared log cap", floodingResult.status === 1 && floodingReport.outcome === "KILLED_LOG_RUNAWAY" && !existsSync(flooding.output), floodingReport.outcome)
}
