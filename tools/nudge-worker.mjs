#!/usr/bin/env node
/**
 * Deliver a message to a running TUI worker WITHOUT cutting its turn short.
 * Measured 2026-07-24 on ORB-75: an `orca terminal send` issued while the worker
 * was mid-turn never arrived as a user turn at all. It appears in the worker's
 * session transcript only as four `type: "queue-operation"` records, the running
 * turn ended on a mid-flow sentence, and the worktree was left with 14 modified
 * and 7 untracked files, zero commits, zero gates and no PR. So the sanctioned
 * path refuses to send to anything that is not tui-idle, and the way to hand a
 * worker new information is to APPEND it to the prompt file it already has and
 * send a one-line pointer telling it to re-read that file.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const USAGE = `usage: nudge-worker.mjs --terminal <handle> (--text "<one line>" | --prompt-file <path> < update.md)

  --terminal <handle>   the worker's terminal handle, as printed by launch-worker.mjs (required)
  --prompt-file <path>  the worker's prompt file. The update arrives on STDIN and is appended
                        to that file first; the sent text is then a one-line pointer telling the
                        worker to re-read it. This is the only safe way to add work mid-run
  --text "<one line>"   send this exact one-liner instead. Newlines are rejected: a multi-line
                        payload through a TUI submits early and arrives quoting-damaged
  --wait-attempts <n>   how many 60s tui-idle waits to allow before refusing (default: 3)
  --dry-run             resolve and print what would be sent; append nothing, send nothing
  --help, -h            print this usage and exit 0

Prints one JSON object on stdout: terminal, sent, promptFile, appendedBytes, waitAttempts.

exit codes: 0 delivered, 1 the worker was busy so NOTHING was sent, 2 usage error,
            3 an orca command failed`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

/** One wait is a full minute; three of them is a worker that is genuinely working, not one that is stuck. */
const WAIT_TIMEOUT_MS = 60000

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    fail(3, `orca ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 400)}`)
  }
  if (parsed.ok === false) fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? "unknown orca error"}`)
  return parsed.result ?? parsed
}

/**
 * A busy worker is the normal case here, and orca reports it as an exit-1 timeout payload
 * rather than a clean "not yet". Treating that exit code as a tool failure would turn the
 * guard into a crash, so read the payload instead.
 */
const waitForIdle = (handle) => {
  const result = spawnSync(
    ORCA,
    ["terminal", "wait", "--terminal", handle, "--for", "tui-idle", "--timeout-ms", String(WAIT_TIMEOUT_MS), "--json"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.error) fail(3, `orca terminal wait failed: ${result.error.message}`)
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    fail(3, `orca terminal wait returned unparseable output: ${(result.stdout || result.stderr || "").slice(0, 400)}`)
  }
  if (parsed.ok === false) {
    if (parsed.error?.code === "timeout") return { satisfied: false, status: "timeout" }
    fail(3, `orca terminal wait failed: ${parsed.error?.message ?? "unknown orca error"}`)
  }
  return parsed.result?.wait ?? {}
}

const terminal = argOf("--terminal")
const promptFileArg = argOf("--prompt-file")
const textArg = argOf("--text")
const waitAttemptsAllowed = Number(argOf("--wait-attempts") ?? 3)
const dryRun = process.argv.includes("--dry-run")

if (!terminal) fail(2, `${USAGE}\n\n--terminal is required`)
if (!promptFileArg && !textArg) fail(2, `${USAGE}\n\n--prompt-file or --text is required`)
if (promptFileArg && textArg) fail(2, "--prompt-file and --text are alternatives; pass one")
if (!Number.isInteger(waitAttemptsAllowed) || waitAttemptsAllowed < 1) fail(2, "--wait-attempts must be a positive integer")
if (textArg && /[\r\n]/.test(textArg)) fail(2, "--text must be a single line; append the long form to the prompt file instead")

let promptFile = null
let update = ""
if (promptFileArg) {
  promptFile = resolve(promptFileArg)
  if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
  if (process.stdin.isTTY) fail(2, "--prompt-file expects the update on stdin")
  update = readFileSync(0, "utf8").trim()
  if (!update) fail(2, "stdin was empty; nothing to append")
}

const text = textArg ?? `New information was appended to ${promptFile}. Re-read that file in full and continue the work order from where you are.`

let waitAttempts = 0
let idle = false
while (waitAttempts < waitAttemptsAllowed && !idle) {
  waitAttempts += 1
  if (dryRun) {
    idle = true
    break
  }
  const wait = waitForIdle(terminal)
  if (wait.status === "exited") fail(1, `${terminal} has exited; there is no worker to nudge`)
  if (wait.satisfied) {
    idle = true
    break
  }
  console.error(`attempt ${waitAttempts}: worker is busy (${wait.blockedReason ?? wait.status ?? "not idle"})`)
}
if (!idle) {
  fail(
    1,
    `${terminal} is still mid-turn after ${waitAttempts} waits; NOTHING was sent. A send while busy is queued and can cut the running turn short (ORB-75, 2026-07-24). Wait for it to go idle and run this again.`,
  )
}

let appendedBytes = 0
if (promptFile && update) {
  const block = `\n\n## Update appended ${new Date().toISOString()}\n\n${update}\n`
  appendedBytes = Buffer.byteLength(block, "utf8")
  if (!dryRun) appendFileSync(promptFile, block, "utf8")
}

if (!dryRun) orca(["terminal", "send", "--terminal", terminal, "--text", text, "--enter"])

console.log(JSON.stringify({ terminal, sent: text, promptFile, appendedBytes, waitAttempts, dryRun }, null, 2))
