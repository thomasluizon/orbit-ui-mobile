#!/usr/bin/env node
import { existsSync } from "node:fs"
import { isAbsolute } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { REPO_ROOT, clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-file.mjs --file <absolute path> [--what <label>] [--ceiling-minutes <n>] [--poll-seconds <n>]

Wait for a detached local check's completion file with a registered harness wake source.
--file must be an absolute path. An existing file completes immediately.
--what labels the wake source (defaults to the file path).
--ceiling-minutes defaults to 360; --poll-seconds defaults to 1. Both must be positive finite numbers.
No stdin is read. Prints one JSON result with file, found, reason and waitedSeconds.
--help, -h  print this usage and exit 0
exit codes: 0 file found; 1 wake registration failed; 2 invalid arguments;
            3 ceiling reached; 130 SIGINT; 143 SIGTERM`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const args = process.argv.slice(2)
const values = {}
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index]
  const value = args[index + 1]
  if (!["--file", "--what", "--ceiling-minutes", "--poll-seconds"].includes(flag) ||
      !value || value.startsWith("--") || flag in values) {
    console.error(USAGE)
    process.exit(2)
  }
  values[flag] = value
}
const file = values["--file"]
const ceilingMinutes = Number(values["--ceiling-minutes"] ?? 360)
const pollSeconds = Number(values["--poll-seconds"] ?? 1)
if (!file || !isAbsolute(file) || !Number.isFinite(ceilingMinutes) || ceilingMinutes <= 0 ||
    !Number.isFinite(pollSeconds) || pollSeconds <= 0) {
  console.error(USAGE)
  process.exit(2)
}

const started = Date.now()
let finished = false
const result = { file, found: false, reason: null, waitedSeconds: 0 }
const finish = (reason, code) => {
  if (finished) return
  finished = true
  clearWakeSource(process.pid, REPO_ROOT)
  result.reason = reason
  result.waitedSeconds = (Date.now() - started) / 1000
  console.log(JSON.stringify(result))
  process.exit(code)
}
process.once("exit", () => clearWakeSource(process.pid, REPO_ROOT))
process.once("SIGINT", () => finish("SIGINT", 130))
process.once("SIGTERM", () => finish("SIGTERM", 143))
if (!registerWakeSource({ pid: process.pid, what: values["--what"] ?? file, startedAt: new Date().toISOString() }, REPO_ROOT)) {
  finish("WAKE_REGISTRATION_FAILED", 1)
}

const deadline = started + ceilingMinutes * 60_000
while (!finished) {
  if (existsSync(file)) {
    result.found = true
    finish("FOUND", 0)
  }
  if (Date.now() >= deadline) finish("CEILING", 3)
  await wait(Math.min(pollSeconds * 1000, Math.max(1, deadline - Date.now())))
}
