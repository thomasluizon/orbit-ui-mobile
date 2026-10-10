import { spawnSync } from "node:child_process"
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

  const refusedTarget = stage("bounded-process/refused-target.cmd", "@echo off\r\nexit /b 0\r\n")
  const refused = await runBounded(process.platform === "win32" ? refusedTarget : "", [], { timeoutMs: 5000 })
  T(
    "bounded-process.mjs: a target the platform refuses to spawn resolves with its error instead of rejecting",
    refused.error instanceof Error && refused.status === null && refused.stdout === "" && refused.timedOut === false,
    JSON.stringify({ error: refused.error?.code ?? null, status: refused.status }),
  )

  const pidFile = stage("bounded-process/descendant.pid", "")
  const script = stage(
    "bounded-process/hang.cjs",
    `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })\nwriteFileSync(${JSON.stringify(pidFile)}, String(child.pid))\nsetInterval(() => {}, 1000)\n`,
  )
  const timeoutMs = 1000
  const timed = await runBounded(process.execPath, [script], { timeoutMs })
  const descendantPid = Number(readFileSync(pidFile, "utf8"))
  const descendantExitDeadline = Date.now() + timeoutMs
  while (processIsRunning(descendantPid) && Date.now() < descendantExitDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const alive = processIsRunning(descendantPid)
  T("bounded-process.mjs: the hard bound fires", timed.timedOut === true, JSON.stringify(timed))
  T("bounded-process.mjs: timeout kills the complete process tree", Number.isInteger(descendantPid) && !alive, `descendant ${descendantPid} still alive`)

  const inheritedPids = stage("bounded-process/inherited-pids.json", "")
  const launcherExit = stage("bounded-process/launcher-exit.json", "")
  const inheritedScript = stage("bounded-process/inherited-stdio.cjs", `
const { spawn } = require("node:child_process")
const { writeFileSync } = require("node:fs")
const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { stdio: "inherit" })
writeFileSync(${JSON.stringify(inheritedPids)}, JSON.stringify({ parent: process.pid, descendant: child.pid }))
child.unref()
`)
  // Isolate the awaited runner so a lost deadline fails at the outer watchdog.
  const inheritedProbe = stage("bounded-process/inherited-probe.mjs", `
import childProcess from "node:child_process"
import { writeFileSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
const spawn = childProcess.spawn
childProcess.spawn = (...args) => {
  const launchedAt = performance.now()
  const child = spawn(...args)
  child.once("exit", (status, signal) => writeFileSync(${JSON.stringify(launcherExit)}, JSON.stringify({
    pid: child.pid, status, signal, elapsedMs: performance.now() - launchedAt,
    stdoutEnded: child.stdout.readableEnded, stderrEnded: child.stderr.readableEnded,
  })))
  return child
}
syncBuiltinESMExports()
const { runBounded } = await import(${JSON.stringify(new URL("../lib/bounded-process.mjs", import.meta.url).href)})
const started = performance.now()
const result = await runBounded(process.execPath, [${JSON.stringify(inheritedScript)}], { timeoutMs: ${timeoutMs} })
process.stdout.write(JSON.stringify({ ...result, elapsedMs: performance.now() - started }))
`)
  const observed = spawnSync(process.execPath, [inheritedProbe], { encoding: "utf8", timeout: 5000 })
  let verdict
  let pids
  let exit
  try { verdict = JSON.parse(observed.stdout) } catch { verdict = null }
  try { pids = JSON.parse(readFileSync(inheritedPids, "utf8")) } catch { pids = null }
  try { exit = JSON.parse(readFileSync(launcherExit, "utf8")) } catch { exit = null }
  process.stdout.write(`Bounded inherited stdio probe: ${JSON.stringify({ verdict, pids, exit })}\n`)
  T("bounded-process.mjs: launcher exits before the deadline with stdout and stderr still open", exit?.pid === pids?.parent && exit?.status === 0 && exit.signal === null && exit.elapsedMs < timeoutMs && !exit.stdoutEnded && !exit.stderrEnded, JSON.stringify({ exit, pids }))
  T("bounded-process.mjs: inherited stdio remains bounded after launcher exit", observed.status === 0 && verdict?.timedOut === true && verdict.status === 0 && verdict.signal === null && verdict.elapsedMs < timeoutMs + 700, observed.stderr || observed.stdout || String(observed.error))
  T("bounded-process.mjs: timeout terminates the exited launcher's stdio descendant", Number.isInteger(pids?.descendant) && !processIsRunning(pids.parent) && !processIsRunning(pids.descendant), JSON.stringify(pids))
  for (const pid of [pids?.parent, pids?.descendant]) {
    if (processIsRunning(pid)) {
      try { process.kill(pid, "SIGKILL") } catch { /* the process can exit before cleanup */ }
    }
  }
}
