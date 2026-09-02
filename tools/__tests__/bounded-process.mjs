import { readFileSync } from "node:fs"

import { runBounded } from "../lib/bounded-process.mjs"
import { processIsRunning, T, stage } from "./_harness.mjs"

export const cases = async () => {
  const success = await runBounded(process.execPath, ["-e", "process.stdout.write('bounded-ok')"], { timeoutMs: 5000 })
  T("bounded-process.mjs: a completing child returns its exact output and exit", success.status === 0 && success.stdout === "bounded-ok" && success.timedOut === false, JSON.stringify(success))
  const piped = await runBounded(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { timeoutMs: 5000, input: "bounded-input" })
  T("bounded-process.mjs: caller-supplied stdin stays bounded and is never inherited", piped.status === 0 && piped.stdout === "bounded-input", JSON.stringify(piped))

  const splitUtf8 = await runBounded(process.execPath, ["-e", `
const bytes = Buffer.from("cloud café", "utf8")
process.stdout.write(bytes.subarray(0, bytes.length - 1))
setTimeout(() => process.stdout.write(bytes.subarray(bytes.length - 1)), 20)
`], { timeoutMs: 5000, encoding: null })
  T(
    "bounded-process.mjs: raw output preserves a multibyte character split across child chunks",
    Buffer.isBuffer(splitUtf8.stdout) && splitUtf8.stdout.equals(Buffer.from("cloud café", "utf8")),
    `${splitUtf8.stdout.toString("hex")} != ${Buffer.from("cloud café", "utf8").toString("hex")}`,
  )
  const firstInvalid = await runBounded(process.execPath, ["-e", "process.stdout.write(Buffer.from([0x80]))"], { timeoutMs: 5000, encoding: null })
  const secondInvalid = await runBounded(process.execPath, ["-e", "process.stdout.write(Buffer.from([0x81]))"], { timeoutMs: 5000, encoding: null })
  T(
    "bounded-process.mjs: distinct invalid UTF-8 bytes remain distinct in raw output",
    firstInvalid.stdout.toString("utf8") === secondInvalid.stdout.toString("utf8") &&
      !firstInvalid.stdout.equals(secondInvalid.stdout),
    `${firstInvalid.stdout.toString("hex")} vs ${secondInvalid.stdout.toString("hex")}`,
  )

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
