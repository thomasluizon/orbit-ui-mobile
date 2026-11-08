import { spawn, spawnSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { setTimeout as wait } from "node:timers/promises"
import { T, realOrchestratorConfig, run, stageWithConfig } from "./_harness.mjs"
import { isRelayWaiter, readRunState, readWakeSourceStates, wakeSourceDirectory, writeRunState } from "../lib/run-state.mjs"
import { checkSleepStop } from "../../.claude/hooks/_lib/rules-sleep.mjs"

export const cases = async () => {
  for (const mode of ["interval", "disable", "SIGTERM"]) {
    const installation = stageWithConfig(`auto-work-${mode}`, "wait-auto-work.mjs", realOrchestratorConfig())
    writeRunState({ sessionId: "auto", sleep: true, autoWork: true, remaining: [] }, installation.base)
    const child = spawn(process.execPath, [installation.path, "--interval-seconds", mode === "interval" ? "0.3" : "10"],
      { env: { ...process.env, CLAUDE_CODE_SESSION_ID: "auto" } })
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
      T(`auto-work ${mode}: expected wake result`, status === (mode === "SIGTERM" ? 143 : 0) &&
        JSON.parse(stdout).reason === ({ interval: "INTERVAL", disable: "MODE_CHANGED", SIGTERM: "SIGTERM" })[mode], stdout)
      T(`auto-work ${mode}: clears registration`, !existsSync(join(wakeSourceDirectory(installation.base), `${child.pid}.json`)))
    } finally { child.kill("SIGKILL"); await closed; clearTimeout(watchdog) }
  }
  const crossing = stageWithConfig("auto-work-crossing", "wait-auto-work.mjs", realOrchestratorConfig())
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
    { encoding: "utf8", timeout: 8000, env: { ...warningEnv, CLAUDE_CODE_SESSION_ID: "auto" } })
  T("auto-work crossing: a state read past the interval end waits no negative delay",
    !crossed.stderr.includes("TimeoutNegativeWarning"), crossed.stderr)
  T("auto-work crossing: prints only its JSON result line", crossed.stderr === "" &&
    crossed.stdout.trim().split("\n").length === 1, `${crossed.stdout}${crossed.stderr}`)
  T("auto-work crossing: ends on the interval with code 0", crossed.status === 0 &&
    JSON.parse(crossed.stdout).reason === "INTERVAL", `${crossed.status} ${crossed.stdout}`)
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
