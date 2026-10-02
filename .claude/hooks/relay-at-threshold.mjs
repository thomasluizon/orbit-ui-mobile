#!/usr/bin/env node
import { readSessionContext } from "../../tools/lib/session-context.mjs"
import { readOrchestratorConfig } from "../../tools/lib/orchestrator-config.mjs"
import { readRunState, readWakeSourceStates, writeRunState } from "../../tools/lib/run-state.mjs"
import { recordHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { appendChainEntry } from "../../tools/lib/session-chain.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkRelayStop } from "./_lib/rules-relay.mjs"

try {
  const input = readStdinJson()
  const state = readRunState()
  const config = readOrchestratorConfig()
  if (config.relay.enabled && state?.sleep === true && state.sessionId === input?.session_id) {
    const measuredTokens = readSessionContext(input.transcript_path)
    if (state.relay?.fallbackUntilCompacted && measuredTokens < config.relay.thresholdTokens) {
      writeRunState({ ...state, relay: { ...state.relay, fallbackUntilCompacted: false } })
    }
    const sources = readWakeSourceStates()
    const verdict = checkRelayStop({ ...config.relay, state, sessionId: input.session_id, measuredTokens,
      wakeSources: sources.live, orphaned: sources.orphaned, stopHookActive: input.stop_hook_active === true })
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
}
