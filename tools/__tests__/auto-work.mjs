import { spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { setTimeout as wait } from "node:timers/promises"
import { T, realOrchestratorConfig, run, stageWithConfig } from "./_harness.mjs"
import { isRelayWaiter, readRunState, readWakeSourceStates, wakeSourceDirectory, writeRunState } from "../lib/run-state.mjs"
import { checkSleepStop } from "../../.claude/hooks/_lib/rules-sleep.mjs"

/**
 * Stand-ins for every source the waiter reads, so no case reaches GitHub, Gmail or the classifier.
 * The fake gh refuses every call and logs it, which also proves no real workflow is dispatched.
 */
const stageSources = (base) => {
  writeFileSync(join(base, "tools", "plan-queue.mjs"), `console.log(JSON.stringify({ admitted: [{ identifier: "#1" }], deferred: [] }))\n`)
  writeFileSync(join(base, "tools", "orbit-mail.mjs"), `console.log(JSON.stringify({ unseen: ["m-new"] }))\n`)
  const bin = join(base, "bin")
  mkdirSync(bin, { recursive: true })
  const log = join(base, "gh-calls.log")
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$*" >> "${log}"\necho "gh stand-in refuses" >&2\nexit 1\n`)
  chmodSync(join(bin, "gh"), 0o755)
  return { env: { PATH: `${bin}:${process.env.PATH}` }, log }
}

export const cases = async () => {
  for (const mode of ["source", "disable", "SIGTERM"]) {
    const installation = stageWithConfig(`auto-work-${mode}`, "wait-auto-work.mjs", realOrchestratorConfig())
    const sources = stageSources(installation.base)
    writeRunState({ sessionId: "auto", sleep: true, autoWork: true, remaining: [] }, installation.base)
    const child = spawn(process.execPath, [installation.path, "--interval-seconds", mode === "source" ? "0.3" : "10"],
      { env: { ...process.env, ...sources.env, CLAUDE_CODE_SESSION_ID: "auto" } })
    let stdout = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    const closed = new Promise((resolve) => child.once("close", resolve))
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 8000)
    try {
      let live = []
      for (let tries = 0; tries < 200; tries++) {
        live = readWakeSourceStates(installation.base).live
        if (live.length) break
        await wait(10)
      }
      T(`auto-work ${mode}: registers a live relay waiter`, live.some((source) => source.pid === child.pid && isRelayWaiter(source)))
      T(`auto-work ${mode}: empty queue can wait`, checkSleepStop({ state: readRunState(installation.base),
        wakeSources: live, isWakeSourceAlive: () => true }) === null)
      if (mode === "disable") writeRunState({ ...readRunState(installation.base), autoWork: false }, installation.base)
      if (mode === "SIGTERM") child.kill("SIGTERM")
      const status = await closed
      const result = JSON.parse(stdout)
      T(`auto-work ${mode}: expected wake result`, status === (mode === "SIGTERM" ? 143 : 0) &&
        result.reason === ({ source: "SOURCE", disable: "MODE_CHANGED", SIGTERM: "SIGTERM" })[mode] && result.sentryMode === "mcp-hourly", stdout)
      if (mode === "source") {
        T("auto-work source: a new mail id and the review failure name their sources", JSON.stringify(result.wakes) === JSON.stringify([
          { source: "mail", kind: "new", items: ["m-new"] },
          { source: "reviews", kind: "failure", failure: "gh workflow run failed (exit 1): gh stand-in refuses" }]), stdout)
        const wake = readRunState(installation.base).intake.wake
        T("auto-work source: the board baseline, seen mail and failure persist", wake.seen.board[0] === "admitted #1" &&
          wake.seen.mail[0] === "m-new" && wake.failures.reviews.startsWith("gh workflow run failed") &&
          readRunState(installation.base).intake.play.workflowCycle === undefined, JSON.stringify(wake))
        T("auto-work source: the review dispatch went to the gh stand-in", readFileSync(sources.log, "utf8").startsWith("workflow run orbit-play-reviews.yml --ref main -f cycle=wake-"))
      }
      T(`auto-work ${mode}: clears registration`, !existsSync(join(wakeSourceDirectory(installation.base), `${child.pid}.json`)))
    } finally { child.kill("SIGKILL"); await closed; clearTimeout(watchdog) }
  }
  const crossing = stageWithConfig("auto-work-crossing", "wait-auto-work.mjs", realOrchestratorConfig())
  const crossingSources = stageSources(crossing.base)
  writeRunState({ sessionId: "auto", sleep: true, autoWork: true, remaining: [] }, crossing.base)
  // Each run state read moves the waiter's clock 6 of its 10 seconds, so the loop read crosses the interval end.
  const clock = join(crossing.base, "crossing-clock.mjs")
  writeFileSync(clock, `import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
const realNow = Date.now
const realRead = fs.readFileSync
let offset = 0
Date.now = () => realNow() + offset
fs.readFileSync = function (path, ...rest) {
  if (String(path).endsWith("orbit-orchestrate-run.json")) offset += 6000
  return realRead.call(this, path, ...rest)
}
syncBuiltinESMExports()
`)
  const { NODE_NO_WARNINGS: _silenced, NODE_OPTIONS: _options, ...warningEnv } = process.env
  const crossed = spawnSync(process.execPath, ["--import", pathToFileURL(clock).href, crossing.path, "--interval-seconds", "10"],
    { encoding: "utf8", timeout: 8000, env: { ...warningEnv, ...crossingSources.env, CLAUDE_CODE_SESSION_ID: "auto" } })
  T("auto-work crossing: a state read past the interval end waits no negative delay",
    !crossed.stderr.includes("TimeoutNegativeWarning"), crossed.stderr)
  T("auto-work crossing: prints only its JSON result line", crossed.stderr === "" &&
    crossed.stdout.trim().split("\n").length === 1, `${crossed.stdout}${crossed.stderr}`)
  T("auto-work crossing: checks the sources at the interval end with code 0", crossed.status === 0 &&
    JSON.parse(crossed.stdout).reason === "SOURCE", `${crossed.status} ${crossed.stdout}`)
  const installation = stageWithConfig("auto-work-mode", "auto-work-state.mjs", realOrchestratorConfig())
  writeRunState({ sessionId: "auto", sleep: true, crank: true, remaining: ["#1"] }, installation.base)
  const env = { CLAUDE_CODE_SESSION_ID: "auto" }
  T("auto-work: enable preserves crank and queue", run("auto-work-state.mjs", ["--enable"], { path: installation.path, env }).status === 0 &&
    readRunState(installation.base).crank === true && readRunState(installation.base).remaining[0] === "#1")
  T("auto-work: disable preserves sleep lifecycle", run("auto-work-state.mjs", ["--disable"], { path: installation.path, env }).status === 0 &&
    readRunState(installation.base).autoWork === false && readRunState(installation.base).sleep === true)
  T("auto-work: foreign session cannot change mode", run("auto-work-state.mjs", ["--enable"], { path: installation.path,
    env: { CLAUDE_CODE_SESSION_ID: "foreign" } }).status === 1)
  writeRunState({ sessionId: "auto", sleep: true, crank: false }, installation.base)
  T("auto-work: fresh default entry leaves crank off", run("auto-work-state.mjs", ["--enable"], { path: installation.path, env }).status === 0 && readRunState(installation.base).crank === false)
  T("auto-work: crank requires its explicit option", run("auto-work-state.mjs", ["--enable", "--crank"], { path: installation.path, env }).status === 0 && readRunState(installation.base).crank === true)
  writeRunState({ ...readRunState(installation.base), sleep: false }, installation.base)
  T("auto-work: a stopped run can disable without reentering sleep", run("auto-work-state.mjs", ["--disable"], { path: installation.path, env }).status === 0 && readRunState(installation.base).autoWork === false && readRunState(installation.base).sleep === false)
}
