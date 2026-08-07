import { readFileSync } from "node:fs"

import { runBounded } from "../lib/bounded-process.mjs"
import { processIsRunning, T, stage } from "./_harness.mjs"

export const cases = async () => {
  const success = await runBounded(process.execPath, ["-e", "process.stdout.write('bounded-ok')"], { timeoutMs: 5000 })
  T("bounded-process.mjs: a completing child returns its exact output and exit", success.status === 0 && success.stdout === "bounded-ok" && success.timedOut === false, JSON.stringify(success))
  const piped = await runBounded(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { timeoutMs: 5000, input: "bounded-input" })
  T("bounded-process.mjs: caller-supplied stdin stays bounded and is never inherited", piped.status === 0 && piped.stdout === "bounded-input", JSON.stringify(piped))

  const pidFile = stage("bounded-process/descendant.pid", "")
  const script = stage(
    "bounded-process/hang.cjs",
    `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })\nwriteFileSync(${JSON.stringify(pidFile)}, String(child.pid))\nsetInterval(() => {}, 1000)\n`,
  )
  const timed = await runBounded(process.execPath, [script], { timeoutMs: 1000 })
  const descendantPid = Number(readFileSync(pidFile, "utf8"))
  const alive = processIsRunning(descendantPid)
  T("bounded-process.mjs: the hard bound fires", timed.timedOut === true, JSON.stringify(timed))
  T("bounded-process.mjs: timeout kills the complete process tree", Number.isInteger(descendantPid) && !alive, `descendant ${descendantPid} still alive`)
}
