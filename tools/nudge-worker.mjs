#!/usr/bin/env node
/**
 * Deliver a message to a running TUI worker WITHOUT cutting its turn short.
 * Measured 2026-07-24 on ORB-75: an `orca terminal send` issued while the worker
 * was mid-turn never arrived as a user turn at all. It appears in the worker's
 * session transcript only as four `type: "queue-operation"` records, the running
 * turn ended on a mid-flow sentence, and the worktree was left with 14 modified
 * and 7 untracked files, zero commits, zero gates and no PR. So the sanctioned
 * path requires a stopped repaint signal and no live trust prompt before sending,
 * and the way to hand a worker new information is to APPEND it to the prompt file
 * it already has and send a one-line pointer telling it to re-read that file.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { SETTLE_MS, isRepainting, pause } from "./lib/tui-repaint.mjs"

const USAGE = `usage: nudge-worker.mjs --terminal <handle> (--text "<one line>" | --prompt-file <path> < update.md)

  --terminal <handle>   the worker's terminal handle, as printed by launch-worker.mjs (required)
  --prompt-file <path>  the worker's prompt file. The update arrives on STDIN and is appended
                        to that file first; the sent text is then a one-line pointer telling the
                        worker to re-read it. This is the only safe way to add work mid-run.
                        MUST live outside every Orbit repo, exactly as at launch
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
const STALE_BLOCKED_REASON = "codex-trust-workspace"
// WHY: ORB-129 measured rotating composer copy; the stable prompt/status structure plus no working indicator proves readiness. https://github.com/thomasluizon/orbit-ui-mobile/pull/629
const ENGINE_PROFILES = {
  claude: {
    trustOnScreen: /isthisaprojectyoucreatedoroneyoutrust|doyoutrustthefiles|trustthisfolder/,
    composerOnScreen: />/,
    statusOnScreen: /(?:opus|sonnet)[\d.]+@(?:low|medium|high|xhigh|max|ultra)ctx\[[^\]]*\](?:--|\d+)%/,
    workingOnScreen: /esctointerrupt/,
  },
  codex: {
    trustOnScreen: /doyoutrustthecontentsofthisdirectory/,
    composerOnScreen: /›/,
    statusOnScreen: /gpt-[\w.-]+(?:low|medium|high|xhigh|max|ultra)·\d+%left·[a-z]:[\\/]/,
    workingOnScreen: /esctointerrupt/,
  },
}
const flatten = (text) => text.replace(/\s+/g, "").toLowerCase()

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

/** orca prints its `ok: false` payload on STDOUT and leaves stderr empty, so a failed call whose
 * reason is only read off stderr reports "Command failed" and nothing else. Read stdout first. */
const orcaFailureReason = (error) => {
  const payload = error.stdout?.toString() ?? ""
  try {
    const parsed = JSON.parse(payload)
    if (parsed.error?.message) return parsed.error.message
  } catch {
    if (payload.trim()) return payload.trim().slice(0, 400)
  }
  return error.stderr?.toString().trim() || error.message
}

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    fail(3, `orca ${args.join(" ")} failed: ${orcaFailureReason(error)}`)
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

/** Why a satisfied tui-idle wait is not enough to send on, and why the delta is measured
 * instead of read off the screen: tools/lib/tui-repaint.mjs. This tool's entire reason to
 * exist failed open without it. */
const busy = (handle) => isRepainting(orca, handle)

const screenSignals = (handle) => {
  const tail = (orca(["terminal", "read", "--terminal", handle, "--limit", "60"]).terminal?.tail ?? []).join("\n")
  const screen = flatten(tail)
  const trustEngine = Object.entries(ENGINE_PROFILES).find(([, profile]) => profile.trustOnScreen.test(screen))?.[0] ?? null
  const readyEngine = Object.entries(ENGINE_PROFILES).find(([, profile]) => (
    profile.composerOnScreen.test(screen)
    && profile.statusOnScreen.test(screen)
    && !profile.workingOnScreen.test(screen)
  ))?.[0] ?? null
  return { trustEngine, readyEngine }
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
  let repos
  try {
    repos = JSON.parse(readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8")).repos
  } catch (error) {
    fail(2, `.claude/orchestrator.json could not be read as JSON: ${error.message}`)
  }
  const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
  for (const [key, path] of Object.entries(repos ?? {})) {
    if (normalize(promptFile) === normalize(path) || normalize(promptFile).startsWith(`${normalize(path)}/`)) {
      fail(2, `prompt file lives inside the ${key} repo (${path}); the worker would commit the appended update. Point at the scratchpad file launch-worker.mjs was given`)
    }
  }
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
    if (!busy(terminal)) {
      idle = true
      break
    }
    console.error(`attempt ${waitAttempts}: orca reports tui-idle but the TUI is still repainting, so the repaint signal wins and the worker is mid-turn`)
    if (waitAttempts < waitAttemptsAllowed) pause(SETTLE_MS)
    continue
  }
  if (wait.blockedReason === STALE_BLOCKED_REASON) {
    if (!busy(terminal)) {
      const { trustEngine, readyEngine } = screenSignals(terminal)
      if (trustEngine) {
        console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, the TUI is not repainting, and the ${trustEngine} trust prompt is still on screen, so the worker remains blocked`)
        continue
      }
      if (!readyEngine) {
        console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, the TUI is not repainting, and no known trust prompt is on screen, but no known ready composer is on screen, so the worker remains blocked`)
        continue
      }
      console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, but the TUI is not repainting, no known trust prompt is on screen, and the ${readyEngine} ready composer is on screen, so the retained blocked reason is stale and the current screen and repaint signals win`)
      idle = true
      break
    }
    console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason} and the TUI is repainting, so both signals say the worker is mid-turn`)
    if (waitAttempts < waitAttemptsAllowed) pause(SETTLE_MS)
    continue
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
