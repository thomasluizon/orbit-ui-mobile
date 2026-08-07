import { readFileSync } from "node:fs"

import { runBounded } from "../lib/bounded-process.mjs"
import { T, stage } from "./_harness.mjs"

export const cases = async () => {
  const success = await runBounded(process.execPath, ["-e", "process.stdout.write('bounded-ok')"], { timeoutMs: 5000 })
  T("bounded-process.mjs: a completing child returns its exact output and exit", success.status === 0 && success.stdout === "bounded-ok" && success.timedOut === false, JSON.stringify(success))

  const pidFile = stage("bounded-process/descendant.pid", "")
  const script = stage(
    "bounded-process/hang.cjs",
    `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })\nwriteFileSync(${JSON.stringify(pidFile)}, String(child.pid))\nsetInterval(() => {}, 1000)\n`,
  )
  const timed = await runBounded(process.execPath, [script], { timeoutMs: 1000 })
  const descendantPid = Number(readFileSync(pidFile, "utf8"))
  let alive = false
  try {
    process.kill(descendantPid, 0)
    alive = true
  } catch {
    alive = false
  }
  T("bounded-process.mjs: the hard bound fires", timed.timedOut === true, JSON.stringify(timed))
  T("bounded-process.mjs: timeout kills the complete process tree", Number.isInteger(descendantPid) && !alive, `descendant ${descendantPid} still alive`)
}
