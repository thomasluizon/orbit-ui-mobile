#!/usr/bin/env node
import { readSessionContext } from "../../tools/lib/session-context.mjs"
import { readOrchestratorConfig } from "../../tools/lib/orchestrator-config.mjs"
import { acquireRelayLock, readRunState, readWakeSourceStates, writeRunState } from "../../tools/lib/run-state.mjs"
import { recordHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { appendChainEntry } from "../../tools/lib/session-chain.mjs"
import { observeBackgroundRuns, readBackgroundRuns } from "../../tools/lib/background-runs.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkRelayStop } from "./_lib/rules-relay.mjs"

let releaseLock
try {
  const input = readStdinJson()
  let state = readRunState()
  const config = readOrchestratorConfig()
  // A subagent's tool hooks carry the parent session id; only the owning conversation may begin or hear its relay.
  const insideSubagent = typeof input?.agent_id === "string" && input.agent_id !== ""
  if (!insideSubagent && config.relay.enabled && state?.sleep === true && state.sessionId === input?.session_id) {
    observeBackgroundRuns(input)
    const measuredTokens = readSessionContext(input.transcript_path)
    if (measuredTokens >= config.relay.thresholdTokens) {
      releaseLock = acquireRelayLock()
      // Parallel tool hooks must decide from the state published by the previous lock owner.
      state = readRunState()
    }
    if (state.relay?.fallbackUntilCompacted && measuredTokens < config.relay.thresholdTokens) {
      writeRunState({ ...state, relay: { ...state.relay, fallbackUntilCompacted: false } })
    }
    const sources = readWakeSourceStates()
    const verdict = checkRelayStop({ ...config.relay, state, sessionId: input.session_id, measuredTokens,
      wakeSources: sources.live, orphaned: sources.orphaned, backgroundRuns: readBackgroundRuns(input.session_id), stopHookActive: input.stop_hook_active === true })
    if (verdict?.begin) {
      const now = new Date().toISOString()
      writeRunState({ ...state, relay: { pending: true, from: input.session_id, measuredTokens,
        permissionMode: input.permission_mode, transcriptPath: input.transcript_path, triggeredAt: now } })
      recordHandoffRequest(input.session_id, { command: "handoff", origin: "context-relay", sleep: true }, now)
    }
    if (verdict?.fallback) {
      writeRunState({ ...state, relay: { ...state.relay, pending: false, fallbackUntilCompacted: true } })
      appendChainEntry({ sessionId: state.sessionId, autoCompactFallback: true, fallbackAt: new Date().toISOString(), failures: state.relay.failures })
    }
    const hookEventName = input.hook_event_name === "PostToolUse" ? "PostToolUse" : "Stop"
    if (verdict?.message) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: verdict.message } })}\n`)
  }
} catch (error) {
  process.stderr.write(`Context relay skipped: ${error.message.replaceAll("\n", " ")}\n`)
} finally {
  releaseLock?.()
}
