#!/usr/bin/env node

import { execFileSyncHidden as execFileSync, spawnHidden as spawn, spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const controlPath = process.argv[2]
if (!controlPath) process.exit(2)

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const processTreePowerShell = (rootPid) => [
  `$root = ${rootPid}`,
  "$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name)",
  "$children = @{}",
  "foreach ($item in $all) { $parent = [int]$item.ParentProcessId; if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }; $children[$parent] += $item }",
  "$queue = [System.Collections.Generic.Queue[int]]::new(); $queue.Enqueue($root); $rows = @()",
  "while ($queue.Count -gt 0) { $parent = $queue.Dequeue(); foreach ($item in @($children[$parent])) { if ($null -eq $item) { continue }; $id = [int]$item.ProcessId; $process = Get-Process -Id $id -ErrorAction SilentlyContinue; $handle = [int64]0; $title = ''; if ($null -ne $process) { $handle = [int64]$process.MainWindowHandle; $title = [string]$process.MainWindowTitle }; $rows += [pscustomobject]@{ processId = $id; parentProcessId = $parent; name = [string]$item.Name; mainWindowHandle = $handle; mainWindowTitle = $title }; $queue.Enqueue($id) } }",
  "$rows | ConvertTo-Json -Compress",
].join(";")

const readWindowsProcessTree = (rootPid) => {
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", processTreePowerShell(rootPid)], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  const parsed = JSON.parse(output.trim() || "[]")
  return Array.isArray(parsed) ? parsed : [parsed]
}

const observeProcessTree = async (observation) => {
  if (!observation) return null
  if (process.platform !== "win32") return { skipped: true, ready: true, descendants: [] }
  const timeoutMs = observation.timeoutMs ?? 5000
  const deadline = Date.now() + timeoutMs
  while (!existsSync(observation.readyPath) && Date.now() < deadline) await delay(50)
  if (!existsSync(observation.readyPath)) return { ready: false, descendants: [], error: "ready marker was not written" }
  await delay(observation.settleMs ?? 500)
  try {
    return { ready: true, descendants: readWindowsProcessTree(process.pid) }
  } catch (error) {
    return { ready: true, descendants: [], error: error.message }
  }
}

let control
try {
  control = JSON.parse(readFileSync(controlPath, "utf8"))
} catch (error) {
  writeFileSync(`${controlPath}.error`, error.message)
  process.exit(3)
}

const killProcessTree = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8", windowsHide: true })
    if (result.status === 0) return
    try {
      process.kill(pid)
    } catch {
      /* the target may have exited between taskkill and the fallback */
    }
    return
  }
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      /* the target may have exited before the tree kill */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL")
    } catch {
      /* the target may have exited after SIGTERM */
    }
  }, 100)
}

const writeResult = (result) => {
  writeFileSync(control.resultPath, `${JSON.stringify(result)}\n`)
  process.exit(0)
}

let child
try {
  child = spawn(control.command, control.args, {
    cwd: control.cwd,
    detached: process.platform !== "win32",
    env: control.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
} catch (error) {
  writeResult({ status: null, signal: null, timedOut: false, stdout: "", stderr: "", error: error.message })
}

if (!child.pid) {
  writeResult({ status: null, signal: null, timedOut: false, stdout: "", stderr: "", error: "child process did not expose a PID" })
}

writeFileSync(control.pidPath, String(child.pid))
let stdout = ""
let stderr = ""
let finished = false
let timedOut = false
let timeoutHandle
let forceFinishHandle
const processTreeObservation = observeProcessTree(control.processTreeObservation)
child.stdout.setEncoding("utf8")
child.stderr.setEncoding("utf8")
child.stdout.on("data", (chunk) => { stdout += chunk })
child.stderr.on("data", (chunk) => { stderr += chunk })

const finish = (status, signal, error = null) => {
  if (finished) return
  finished = true
  clearTimeout(timeoutHandle)
  clearTimeout(forceFinishHandle)
  processTreeObservation.then((processTree) => writeResult({ status, signal, timedOut, stdout, stderr, error, processTree }))
}

child.on("error", (error) => finish(null, null, error.message))
child.on("close", (status, signal) => finish(status, signal))
timeoutHandle = setTimeout(() => {
  timedOut = true
  killProcessTree(child.pid)
  forceFinishHandle = setTimeout(() => finish(null, "SIGKILL"), 2000)
}, control.timeoutMs)
child.stdin.end(control.input ?? "")
