#!/usr/bin/env node
import { readSessionContext } from "../../tools/lib/session-context.mjs"
import { readOrchestratorConfig } from "../../tools/lib/orchestrator-config.mjs"
import { acquireRelayLock, readRunState, readWakeSourceStates, updateRunState } from "../../tools/lib/run-state.mjs"
import { recordHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { appendChainEntry } from "../../tools/lib/session-chain.mjs"
import { observeBackgroundRuns, readBackgroundRuns } from "../../tools/lib/background-runs.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkRelayStop } from "./_lib/rules-relay.mjs"

/** A relay write applies only while the record still shows what its verdict read. */
const verdictStillHolds = (decided, current) => current?.sessionId === decided.sessionId && current.sleep === decided.sleep &&
  JSON.stringify(current.relay) === JSON.stringify(decided.relay)

let releaseLock
try {
  const input = readStdinJson()
  let state = readRunState()
  const config = readOrchestratorConfig()
  // A subagent's tool hooks carry the parent session id; only the owning conversation may begin or hear its relay.
  const insideSubagent = typeof input?.agent_id === "string" && input.agent_id !== ""
  if (!insideSubagent && config.relay.enabled && state?.sleep === true && state.sessionId === input?.session_id) {
    observeBackgroundRuns(input)
    // The hook payload names the session; the hook process environment is not the confirmed source.
    const caller = { sessionId: input.session_id }
    const measuredTokens = readSessionContext(input.transcript_path)
    if (measuredTokens >= config.relay.softTokens) {
      releaseLock = acquireRelayLock()
      // Parallel tool hooks must decide from the state published by the previous lock owner.
      state = readRunState()
    }
    if ((state.relay?.fallbackUntilCompacted || state.relay?.armed) && measuredTokens < config.relay.softTokens) {
      const decided = state
      state = updateRunState((current) => verdictStillHolds(decided, current)
        ? { ...current, relay: { ...current.relay, fallbackUntilCompacted: false, armed: false } } : undefined, undefined, caller) ?? readRunState()
    }
    const sources = readWakeSourceStates()
    const verdict = checkRelayStop({ ...config.relay, state, sessionId: input.session_id, measuredTokens, hookEventName: input.hook_event_name,
      wakeSources: sources.live, orphaned: sources.orphaned, backgroundRuns: readBackgroundRuns(input.session_id), stopHookActive: input.stop_hook_active === true })
    // A record that changed after the verdict skips the write and its message; the next hook decides again.
    let applied = true
    if (verdict?.arm) {
      applied = updateRunState((current) => verdictStillHolds(state, current)
        ? { ...current, relay: { ...current.relay, armed: true, armedAt: new Date().toISOString(), armedTokens: measuredTokens } } : undefined, undefined, caller) !== undefined
    }
    if (verdict?.begin) {
      const now = new Date().toISOString()
      const begun = updateRunState((current) => verdictStillHolds(state, current) ? { ...current, relay: { pending: true, forced: verdict.forced, armedAt: current.relay?.armedAt,
        armedTokens: current.relay?.armedTokens, from: input.session_id, measuredTokens, permissionMode: input.permission_mode, transcriptPath: input.transcript_path, triggeredAt: now } } : undefined, undefined, caller)
      applied = begun !== undefined
      if (applied) recordHandoffRequest(input.session_id, { command: "handoff", origin: "context-relay", sleep: true, crank: begun.crank === true, autoWork: begun.autoWork === true }, now)
    }
    if (verdict?.fallback) {
      applied = updateRunState((current) => verdictStillHolds(state, current)
        ? { ...current, relay: { ...current.relay, pending: false, fallbackUntilCompacted: true } } : undefined, undefined, caller) !== undefined
      if (applied) appendChainEntry({ sessionId: state.sessionId, autoCompactFallback: true, fallbackAt: new Date().toISOString(), failures: state.relay.failures })
    }
    const hookEventName = input.hook_event_name === "PostToolUse" ? "PostToolUse" : "Stop"
    if (applied && verdict?.message) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: verdict.message } })}\n`)
  }
} catch (error) {
  process.stderr.write(`Context relay skipped: ${error.message.replaceAll("\n", " ")}\n`)
} finally {
  releaseLock?.()
}
