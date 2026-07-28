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
  --engine <name>       readiness profile override: claude or codex. Otherwise uses the
                        orchestrator worker. Claude has no verified readiness profile and
                        always refuses stale-block recovery. Missing, auto or unknown values
                        also fail closed
  --wait-attempts <n>   how many 60s tui-idle waits to allow before refusing (default: 3)
  --dry-run             resolve and print what would be sent; append nothing, send nothing
  --help, -h            print this usage and exit 0

Prints one JSON object on stdout: terminal, sent, promptFile, appendedBytes, waitAttempts,
resolved engine and engine source.

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
// WHY: ORB-129 measured Codex marker/status/no-working structure against three live terminals; readiness stays absent for unmeasured engines. https://github.com/thomasluizon/orbit-ui-mobile/pull/629
const ENGINE_PROFILES = {
  claude: {
    // WHY: No Claude worker ran during ORB-129, so readiness stays disabled pending captured composer screens with and without a live working indicator. https://github.com/thomasluizon/orbit-ui-mobile/pull/629
    trustOnScreen: /isthisaprojectyoucreatedoroneyoutrust|doyoutrustthefiles|trustthisfolder/,
  },
  codex: {
    trustOnScreen: /doyoutrustthecontentsofthisdirectory/,
    composerMarker: "›",
    statusOnScreen: /(?:^| )[a-z0-9][a-z0-9._/-]* (?:low|medium|high|xhigh|max|ultra) · (?:~[\\/]|[a-z]:[\\/]|\/)[^·]+/,
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

const readOrchestratorConfig = () => {
  try {
    return { config: JSON.parse(readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8")), error: null }
  } catch (error) {
    return { config: null, error: error.message }
  }
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

const screenSignals = (handle, resolvedEngine) => {
  const tail = (orca(["terminal", "read", "--terminal", handle, "--limit", "60"]).terminal?.tail ?? []).join("\n")
  const screen = tail.replace(/\s+/g, " ").toLowerCase()
  const profile = resolvedEngine ? ENGINE_PROFILES[resolvedEngine] : null
  const hasVerifiedReadiness = Boolean(profile?.composerMarker && profile?.statusOnScreen && profile?.workingOnScreen)
  const composerIndex = hasVerifiedReadiness ? screen.lastIndexOf(profile.composerMarker) : -1
  const currentScreen = composerIndex === -1 ? null : screen.slice(composerIndex)
  const trustScreen = flatten(currentScreen ?? screen)
  const trustEngine = Object.entries(ENGINE_PROFILES).find(([, candidate]) => candidate.trustOnScreen.test(trustScreen))?.[0] ?? null
  const statusStructureOnScreen = Boolean(currentScreen && profile.statusOnScreen.test(currentScreen))
  const workingOnScreen = Boolean(currentScreen && profile.workingOnScreen.test(flatten(currentScreen)))
  const readyEngine = currentScreen && statusStructureOnScreen && !workingOnScreen ? resolvedEngine : null
  return { trustEngine, readyEngine, hasVerifiedReadiness, currentScreenLocated: currentScreen !== null, statusStructureOnScreen, workingOnScreen }
}

const terminal = argOf("--terminal")
const promptFileArg = argOf("--prompt-file")
const textArg = argOf("--text")
const engineOverridePresent = process.argv.includes("--engine")
const engineOverride = engineOverridePresent ? argOf("--engine") : null
const waitAttemptsAllowed = Number(argOf("--wait-attempts") ?? 3)
const dryRun = process.argv.includes("--dry-run")

if (!terminal) fail(2, `${USAGE}\n\n--terminal is required`)
if (!promptFileArg && !textArg) fail(2, `${USAGE}\n\n--prompt-file or --text is required`)
if (promptFileArg && textArg) fail(2, "--prompt-file and --text are alternatives; pass one")
if (!Number.isInteger(waitAttemptsAllowed) || waitAttemptsAllowed < 1) fail(2, "--wait-attempts must be a positive integer")
if (textArg && /[\r\n]/.test(textArg)) fail(2, "--text must be a single line; append the long form to the prompt file instead")

const orchestrator = readOrchestratorConfig()
const engineSource = engineOverridePresent ? "--engine" : ".claude/orchestrator.json worker"
const engineValue = engineOverridePresent ? engineOverride : orchestrator.config?.worker
const normalizedEngine = typeof engineValue === "string" ? engineValue.trim().toLowerCase() : ""
const resolvedEngine = Object.hasOwn(ENGINE_PROFILES, normalizedEngine) ? normalizedEngine : null
const displayedEngine = normalizedEngine || "<missing>"
const readinessRefusalReason = () => {
  if (!resolvedEngine) return `engine "${displayedEngine}" from ${engineSource} does not resolve to a known readiness profile`
  const profile = ENGINE_PROFILES[resolvedEngine]
  if (!profile.composerMarker || !profile.statusOnScreen || !profile.workingOnScreen) {
    return `the ${resolvedEngine} readiness profile is unverified; enabling it requires a captured Claude Code composer screen with and without a live working indicator; see https://github.com/thomasluizon/orbit-ui-mobile/pull/629`
  }
  return `no known ready composer is on screen for the ${resolvedEngine} profile`
}

let promptFile = null
let update = ""
if (promptFileArg) {
  promptFile = resolve(promptFileArg)
  if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
  if (!orchestrator.config) fail(2, `.claude/orchestrator.json could not be read as JSON: ${orchestrator.error}`)
  const repos = orchestrator.config.repos
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
      const { trustEngine, readyEngine, hasVerifiedReadiness, currentScreenLocated, statusStructureOnScreen, workingOnScreen } = screenSignals(terminal, resolvedEngine)
      if (!hasVerifiedReadiness) {
        const engineReason = readinessRefusalReason()
        console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, the TUI is not repainting, but ${engineReason}, so the worker remains blocked`)
        if (waitAttempts < waitAttemptsAllowed) pause(SETTLE_MS)
        continue
      }
      if (!currentScreenLocated) {
        const trustReason = trustEngine
          ? `the ${trustEngine} trust prompt is still on screen in retained tail`
          : "no known trust prompt is on screen"
        console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, the TUI is not repainting, but the current screen region could not be located because no ${resolvedEngine} composer marker is on screen, ${trustReason}, and no known ready composer is on screen, so the worker remains blocked`)
        if (waitAttempts < waitAttemptsAllowed) pause(SETTLE_MS)
        continue
      }
      if (trustEngine) {
        console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, the TUI is not repainting, and the ${trustEngine} trust prompt is still on screen, so the worker remains blocked`)
        if (waitAttempts < waitAttemptsAllowed) pause(SETTLE_MS)
        continue
      }
      if (!readyEngine) {
        const missingSignal = workingOnScreen
          ? "the live working indicator follows the composer marker"
          : "the live model, effort, separator and working-directory status structure is absent"
        console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, the TUI is not repainting, and no known trust prompt is on screen, but no known ready composer is on screen for the ${resolvedEngine} profile because ${statusStructureOnScreen ? missingSignal : "the live model, effort, separator and working-directory status structure is absent"}, so the worker remains blocked`)
        if (waitAttempts < waitAttemptsAllowed) pause(SETTLE_MS)
        continue
      }
      console.error(`attempt ${waitAttempts}: orca reports ${wait.blockedReason}, but the TUI is not repainting, no known trust prompt is on screen, and the ${readyEngine} ready composer is on screen with its status structure and no live working indicator, so the retained blocked reason is stale and the current screen and repaint signals win`)
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

console.log(JSON.stringify({ terminal, sent: text, promptFile, appendedBytes, waitAttempts, engine: resolvedEngine, engineSource, dryRun }, null, 2))
