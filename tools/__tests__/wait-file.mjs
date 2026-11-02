import { spawn } from "node:child_process"
import { existsSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { T, realOrchestratorConfig, run, stage, stageWithConfig } from "./_harness.mjs"
import { isWakeSourceAlive, readWakeSourceStates, wakeSourceDirectory } from "../lib/run-state.mjs"
import { checkSleepStop } from "../../.claude/hooks/_lib/rules-sleep.mjs"

const TOOL = "wait-file.mjs"

export async function cases() {
  for (const [label, signal, expectedCode] of [["found", null, 0], ["failed", null, 1], ["invalid", null, 1], ["ceiling", null, 3], ["interrupt", "SIGINT", 130], ["terminate", "SIGTERM", 143]]) {
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
      if (["found", "failed", "invalid"].includes(label)) writeFileSync(file, JSON.stringify(label === "invalid" ? {} : { exitCode: label === "found" ? 0 : 1 }))
      if (signal) child.kill(signal)
      const status = await closed
      T(`file waiter ${label}: expected exit`, status === expectedCode, stdout + stderr)
      const result = JSON.parse(stdout)
      T(`file waiter ${label}: one JSON result`, stdout.trim().split("\n").length === 1 && result.file === file &&
        result.found === ["found", "failed", "invalid"].includes(label) && result.reason === (signal ?? (({ found: "FOUND", failed: "CHECK_FAILED", invalid: "INVALID_MARKER" }[label] ?? "CEILING"))) &&
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
  for (const [label, marker, old] of [["stale", { exitCode: 0 }, true], ["failed", { exitCode: 1 }, false], ["invalid", {}, false]]) {
    const installation = stageWithConfig(`wait-file-${label}`, TOOL, realOrchestratorConfig())
    const file = join(installation.base, "DONE")
    writeFileSync(file, JSON.stringify(marker))
    if (old) utimesSync(file, new Date(0), new Date(0))
    const result = run(TOOL, ["--file", file, "--ceiling-minutes", "0.001"], { path: installation.path })
    T(`file waiter refuses ${label} marker`, result.status === 1, result.stdout + result.stderr)
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
