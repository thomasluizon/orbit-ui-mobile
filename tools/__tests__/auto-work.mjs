import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
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
  const installation = stageWithConfig("auto-work-mode", "auto-work-state.mjs", realOrchestratorConfig())
  writeRunState({ sessionId: "auto", sleep: true, crank: true, remaining: ["#1"] }, installation.base)
  const env = { CLAUDE_CODE_SESSION_ID: "auto" }
  T("auto-work: enable preserves crank and queue", run("auto-work-state.mjs", ["--enable"], { path: installation.path, env }).status === 0 &&
    readRunState(installation.base).crank === true && readRunState(installation.base).remaining[0] === "#1")
  T("auto-work: disable preserves sleep lifecycle", run("auto-work-state.mjs", ["--disable"], { path: installation.path, env }).status === 0 &&
    readRunState(installation.base).autoWork === false && readRunState(installation.base).sleep === true)
  T("auto-work: foreign session cannot change mode", run("auto-work-state.mjs", ["--enable"], { path: installation.path,
    env: { CLAUDE_CODE_SESSION_ID: "foreign" } }).status === 1)
}
