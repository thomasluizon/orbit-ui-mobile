import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { T, realOrchestratorConfig, run, stage, stageWithConfig } from "./_harness.mjs"
import { isWakeSourceAlive, readWakeSourceStates, wakeSourceDirectory } from "../lib/run-state.mjs"
import { checkSleepStop } from "../../.claude/hooks/_lib/rules-sleep.mjs"

const TOOL = "wait-file.mjs"

export async function cases() {
  for (const [label, signal, expectedCode] of [["found", null, 0], ["ceiling", null, 3], ["interrupt", "SIGINT", 130], ["terminate", "SIGTERM", 143]]) {
    const installation = stageWithConfig(`wait-file-${label}`, TOOL, realOrchestratorConfig())
    const file = join(installation.base, "DONE")
    const child = spawn(process.execPath, [installation.path, "--file", file, "--what", label,
      "--ceiling-minutes", label === "ceiling" ? "0.02" : "1", "--poll-seconds", "0.01"], { cwd: installation.base })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    const closed = new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("close", resolve)
    })
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 10000)
    try {
      const deadline = Date.now() + 5000
      let live = []
      while (Date.now() < deadline && child.exitCode === null) {
        live = readWakeSourceStates(installation.base).live
        if (live.some((source) => source.pid === child.pid)) break
        await wait(10)
      }
      T(`file waiter ${label}: registered source is live`, live.some((source) => source.pid === child.pid && source.what === label), stderr)
      T(`file waiter ${label}: sleep Stop accepts the waiting source`, live.length > 0 && checkSleepStop({
        state: { sleep: true, remaining: ["#1914"] }, wakeSources: live, isWakeSourceAlive,
      }) === null)
      if (label === "found") writeFileSync(file, "done")
      if (signal) child.kill(signal)
      const status = await closed
      T(`file waiter ${label}: expected exit`, status === expectedCode, stdout + stderr)
      const result = JSON.parse(stdout)
      T(`file waiter ${label}: one JSON result`, stdout.trim().split("\n").length === 1 && result.file === file &&
        result.found === (label === "found") && result.reason === (signal ?? (label === "found" ? "FOUND" : "CEILING")) &&
        Number.isFinite(result.waitedSeconds) && result.waitedSeconds >= 0, stdout)
      T(`file waiter ${label}: registration removed before reading states`,
        !existsSync(join(wakeSourceDirectory(installation.base), `${child.pid}.json`)))
      T(`file waiter ${label}: no live wake remains`, readWakeSourceStates(installation.base).live.length === 0)
    } finally {
      child.kill("SIGKILL")
      await closed
      clearTimeout(watchdog)
    }
  }
  const file = stage("wait-file/existing", "done")
  for (const argv of [[], ["--file"], ["--file", "relative"], ["--file", file, "--file", file],
    ["--file", file, "--what", ""], ["--file", file, "--unknown", "x"],
    ...["0", "-1", "NaN", "Infinity"].flatMap((value) => [
      ["--file", file, "--poll-seconds", value], ["--file", file, "--ceiling-minutes", value],
    ])]) {
    const result = run(TOOL, argv)
    T(`file waiter refuses invalid arguments ${JSON.stringify(argv)}`, result.status === 2, result.stderr)
  }
}
