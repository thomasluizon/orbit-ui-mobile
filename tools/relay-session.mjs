#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { redactSecrets } from "./lib/github-auth.mjs"
import { readSessionContext, readSessionMetrics } from "./lib/session-context.mjs"
import { appendChainEntry, closeSessionChain, confirmChainSuccessor, openSessionChain, refreshChainMetrics, sessionChainEntry, supersededSession } from "./lib/session-chain.mjs"
import { HANDOFF_PROMPT_PATH, readHandoffRequest, recordHandoffRequest, validateHandoffPrompt } from "./lib/handoff-prompt.mjs"
import { REPO_ROOT, acquireRelayLock, clearWakeSource, isWakeSourceAlive, readRunState, readWakeSourceStates, readWorkerLaunches, registerWakeSource, writeRunState } from "./lib/run-state.mjs"

const USAGE = `usage: relay-session.mjs [--retry-wake | --close-chain]

  Relays the current unattended orchestrator through a committed and pushed NEXT.md.
  Reads session identity from CLAUDE_CODE_SESSION_ID, context from its transcript,
  and model and permission mode from machine observations. Accepts no model claim.
  --retry-wake   background wake source until the failed relay's ten minute retry time
  --close-chain record the current session and close the owner's open chain
  --help, -h    print usage and exit 0

exit codes: 0 successor confirmed or requested lifecycle action complete,
  1 RELAY_FAILED with predecessor retained, 2 usage error`

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const cleanEnvironment = (environment) => Object.fromEntries(Object.entries(environment).filter(([key]) =>
  !["CLAUDE_CONFIG_DIR", "GH_TOKEN", "ORBIT_LAUNCH_WORKER"].includes(key)))

const run = (binary, args, cwd, environment = process.env) => {
  const result = spawnSync(binary, args, { cwd, env: environment, encoding: "utf8", timeout: 30_000, windowsHide: true })
  if (result.error || result.status !== 0) {
    const detail = redactSecrets((result.stderr || result.stdout || result.error?.message || "").trim()).slice(0, 2000)
    throw new Error(`${binary} ${args.slice(0, 2).join(" ")} failed (${result.status ?? result.error.code}): ${detail}`)
  }
  return result.stdout.trim()
}

/** Exported so the harness drives the production sequence with external processes isolated. */
export const relaySession = async ({ repoRoot = REPO_ROOT, sessionId = process.env.CLAUDE_CODE_SESSION_ID, execute = run, wait = delay, confirmMilliseconds = 120_000 } = {}) => {
  const config = readOrchestratorConfig(pathToFileURL(join(repoRoot, ".claude", "orchestrator.json")))
  if (!config.relay.enabled) throw new Error("relay is disabled")
  const previous = readRunState(repoRoot)
  if (!sessionId || previous?.sessionId !== sessionId || previous.sleep !== true || !previous.relay?.pending) throw new Error("no matching unattended relay drain")
  if (supersededSession(sessionId, repoRoot)) throw new Error("session is already superseded")
  const measuredTokens = readSessionContext(previous.relay.transcriptPath)
  if (measuredTokens < config.relay.thresholdTokens) throw new Error(`context ${measuredTokens} is below threshold ${config.relay.thresholdTokens}`)
  const metrics = await readSessionMetrics(previous.relay.transcriptPath)
  if (metrics.calls < 20) throw new Error(`session has ${metrics.calls} assistant calls; relay requires at least 20`)
  if (previous.relay.lastAttemptAt && Date.now() - Date.parse(previous.relay.lastAttemptAt) < 600_000) throw new Error("relay retry is not due for ten minutes")
  assertDrained(repoRoot)
  let releaseLock
  try {
    releaseLock = acquireRelayLock(repoRoot)
    return await launchSuccessor({ previous, metrics, sessionId, repoRoot, execute, wait, confirmMilliseconds })
  } catch (error) {
    const state = readRunState(repoRoot)
    if (releaseLock && state?.sessionId === sessionId && state.relay?.pending) {
      const failed = { ...state, relay: { ...state.relay, lastAttemptAt: new Date().toISOString(), failures: (state.relay.failures ?? 0) + 1 } }
      writeRunState(failed, repoRoot)
      appendChainEntry({ ...(await sessionChainEntry(failed, previous.relay.transcriptPath)), failure: error.message }, repoRoot)
    }
    throw error
  } finally { releaseLock?.() }
}

const assertDrained = (repoRoot) => {
  const sources = readWakeSourceStates(repoRoot)
  const blockers = [...sources.live.filter((source) => !source.what?.startsWith("CI ") && source.what !== "Context relay retry"), ...sources.orphaned]
  const launchers = readWorkerLaunches(repoRoot).filter((launch) => isWakeSourceAlive({ pid: launch.launcherPid, processStartIdentity: launch.launcherProcessStartIdentity }))
  const pids = [...new Set([...blockers.map((source) => source.workerPid ?? source.pid), ...launchers.map((launch) => launch.launcherPid)])]
  if (pids.length) throw new Error(`relay drain has live pid ${pids.join(", ")}`)
}

const provePromptPublished = (repoRoot, execute) => {
  const prompt = readFileSync(join(repoRoot, HANDOFF_PROMPT_PATH), "utf8")
  const missing = validateHandoffPrompt(prompt, { sleep: true })
  if (missing.length) throw new Error(`NEXT.md misses: ${missing.join("; ")}`)
  const opening = prompt.split(/^## /m)[0]
  const specs = [...new Set(opening.match(/\.claude\/specs\/[\w.-]+\.md/g) ?? [])]
  const paths = [HANDOFF_PROMPT_PATH, ...specs]
  for (const path of paths) {
    const committed = execute("git", ["show", `HEAD:${path}`], repoRoot)
    if (committed !== readFileSync(join(repoRoot, path), "utf8").trim()) throw new Error(`${path} is not committed`)
  }
  execute("git", ["diff", "--exit-code", "--cached", "--", ...paths], repoRoot)
  const branch = execute("git", ["symbolic-ref", "--short", "HEAD"], repoRoot)
  const remote = execute("git", ["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], repoRoot).split(/\s+/)[0]
  const head = execute("git", ["rev-parse", "HEAD"], repoRoot)
  if (head !== remote) throw new Error("handoff HEAD is not pushed to origin")
  return prompt
}

const stopCiWaiters = (sessionId, repoRoot) => {
  for (const source of readWakeSourceStates(repoRoot).live) {
    if (source.sessionId !== sessionId || !source.what?.startsWith("CI ") || !isWakeSourceAlive(source)) continue
    process.kill(source.pid, "SIGTERM")
    clearWakeSource(source.pid, repoRoot)
  }
}

const successorCommand = (model, permissionMode, successorSessionId, repoRoot) => {
  const modes = new Set(["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"])
  if (!modes.has(permissionMode)) throw new Error("relay permission mode is unconfirmed")
  if (typeof model !== "string" || !model) throw new Error("transcript has no measured model")
  const payload = Buffer.from(JSON.stringify({ model, permissionMode, sessionId: successorSessionId, repoRoot })).toString("base64")
  return `node tools/start-relay-successor.mjs --launch ${payload}`
}

const launchSuccessor = async ({ previous, metrics, sessionId, repoRoot, execute, wait, confirmMilliseconds }) => {
  const now = new Date().toISOString()
  recordHandoffRequest(sessionId, { command: "handoff", origin: "context-relay", sleep: true }, now, repoRoot)
  const prompt = provePromptPublished(repoRoot, execute)
  const successorSessionId = randomUUID()
  const command = successorCommand(metrics.lastCall.model, previous.relay.permissionMode, successorSessionId, repoRoot)
  assertDrained(repoRoot)
  const current = readRunState(repoRoot)
  if (current?.sessionId !== sessionId || !current.relay?.pending) throw new Error("owner canceled the relay drain")
  const attempting = { ...current, relay: { ...current.relay, successorSessionId, lastAttemptAt: now, attempts: (current.relay.attempts ?? 0) + 1 } }
  writeRunState(attempting, repoRoot)
  stopCiWaiters(sessionId, repoRoot)
  appendChainEntry(await sessionChainEntry(attempting, previous.relay.transcriptPath), repoRoot)
  let terminal = null
  try {
    const orca = process.env.ORCA_CLI_COMMAND || (process.env.ORCA_DEV_REPO_ROOT ? "orca-dev" : process.platform === "linux" ? "orca-ide" : "orca")
    const environment = cleanEnvironment(process.env)
    const response = JSON.parse(execute(orca, ["terminal", "create", "--worktree", `path:${repoRoot}`, "--title", "Context relay", "--command", command, "--json"], repoRoot, environment))
    terminal = response.result?.terminal?.handle
    if (typeof terminal !== "string" || !terminal) throw new Error("Orca returned no terminal handle")
    const nominated = readRunState(repoRoot)
    if (nominated?.sessionId !== sessionId || !nominated.relay?.pending || nominated.relay.successorSessionId !== successorSessionId) throw new Error("owner canceled the relay drain")
    writeRunState({ ...nominated, relay: { ...nominated.relay, successorTerminal: terminal } }, repoRoot)
    const started = Date.now()
    try { execute(orca, ["terminal", "wait", "--terminal", terminal, "--for", "tui-idle", "--timeout-ms", "10000", "--json"], repoRoot, environment) }
    catch { execute(orca, ["terminal", "wait", "--terminal", terminal, "--for", "tui-idle", "--timeout-ms", "20000", "--json"], repoRoot, environment) }
    execute(orca, ["terminal", "send", "--terminal", terminal, "--text", prompt, "--enter", "--json"], repoRoot, environment)
    while (Date.now() - started < confirmMilliseconds) {
      const successor = readRunState(repoRoot)
      if (successor?.sessionId === successorSessionId && successor.sleep === true && successor.relay?.from === sessionId) {
        confirmChainSuccessor(sessionId, successorSessionId, terminal, (Date.now() - started) / 1000, repoRoot)
        return { successorSessionId, terminal }
      }
      await wait(1000)
    }
    execute(orca, ["terminal", "send", "--terminal", terminal, "--enter", "--json"], repoRoot, environment)
    throw new Error("successor did not confirm sleep state; sent one Enter for composer stall")
  } catch (error) {
    const state = readRunState(repoRoot)
    const adopted = state?.sessionId === successorSessionId && state.relay?.from === sessionId && state.relay.successorTerminal === terminal
    if (adopted) {
      confirmChainSuccessor(sessionId, successorSessionId, terminal, null, repoRoot)
      return { successorSessionId, terminal }
    }
    if (state?.sessionId === sessionId && state.relay?.pending && state.relay.successorSessionId === successorSessionId) {
      writeRunState({ ...state, relay: { ...state.relay, successorSessionId: null, successorTerminal: null } }, repoRoot)
    } else if (state?.sessionId === successorSessionId && state.relay?.from === sessionId && !state.relay.canceledByOwner) {
      writeRunState({ ...attempting, relay: { ...attempting.relay, successorSessionId: null } }, repoRoot)
    }
    if (terminal) {
      const orca = process.env.ORCA_CLI_COMMAND || (process.env.ORCA_DEV_REPO_ROOT ? "orca-dev" : process.platform === "linux" ? "orca-ide" : "orca")
      execute(orca, ["terminal", "close", "--terminal", terminal, "--json"], repoRoot, cleanEnvironment(process.env))
    }
    appendChainEntry({ ...(await sessionChainEntry(attempting, previous.relay.transcriptPath)), failure: error.message }, repoRoot)
    throw error
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { process.stdout.write(`${USAGE}\n`); return }
  if (args.length > 1 || args.some((argument) => !["--retry-wake", "--close-chain"].includes(argument))) {
    process.stderr.write(`${USAGE}\n`); process.exitCode = 2; return
  }
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID
  const state = readRunState()
  if (!sessionId || state?.sessionId !== sessionId) throw new Error("no matching CLAUDE_CODE_SESSION_ID")
  if (args[0] === "--close-chain") {
    if (!openSessionChain(sessionId)) return
    if (readHandoffRequest(sessionId)?.origin !== "owner") throw new Error("chain closure requires an owner-origin handoff")
    appendChainEntry(await sessionChainEntry(state, state.transcriptPath ?? state.relay?.transcriptPath))
    await refreshChainMetrics(sessionId)
    closeSessionChain(sessionId)
    return
  }
  if (args[0] === "--retry-wake") {
    if (!state.relay?.pending || !state.relay.lastAttemptAt) throw new Error("no failed relay to retry")
    if (!registerWakeSource({ pid: process.pid, sessionId, what: "Context relay retry" })) throw new Error("retry wake registration failed")
    try { await delay(Math.max(0, Date.parse(state.relay.lastAttemptAt) + 600_000 - Date.now())) }
    finally { clearWakeSource(process.pid) }
    process.stdout.write("Context relay retry is due.\n")
    return
  }
  process.stdout.write(`${JSON.stringify(await relaySession())}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`RELAY_FAILED: ${error.message}\n`); process.exitCode = 1 })
}
