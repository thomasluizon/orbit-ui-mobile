#!/usr/bin/env node

import { readFileSync } from "node:fs"

import { readinessReport } from "../../tools/lib/readiness-receipt.mjs"
import { readOrchestratorConfig } from "../../tools/lib/orchestrator-config.mjs"
import { readSessionContext } from "../../tools/lib/session-context.mjs"
import { isWakeSourceAlive, readRunState, readWakeSourceStates } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"
import { checkRelayStop } from "./_lib/rules-relay.mjs"

/** READY comes from the persisted receipt alone. An unreadable or not-READY receipt is null. */
const receiptVerdict = (entry) => {
  try {
    const receipt = JSON.parse(readFileSync(entry.receiptPath, "utf8"))
    return readinessReport(receipt).verdict === "READY" ? "READY" : null
  } catch {
    return null
  }
}

try {
  const input = readStdinJson()
  const wakeSourceStates = readWakeSourceStates()
  let state = readRunState()
  const config = readOrchestratorConfig()
  // Stop handlers run concurrently. Suppress launch guidance on the crossing even if the relay
  // handler has not published pending state yet.
  if (config.relay.enabled && state?.sleep && state.sessionId === input?.session_id && typeof input.transcript_path === "string") {
    const relay = checkRelayStop({ ...config.relay, state, sessionId: input.session_id, measuredTokens: readSessionContext(input.transcript_path) })
    if (relay?.begin) state = { ...state, relay: { ...state.relay, pending: true } }
    if (relay?.fallback) state = { ...state, relay: { ...state.relay, pending: false } }
  }
  const verdict = checkSleepStop({
    state,
    relayEnabled: config.relay.enabled,
    wakeSources: wakeSourceStates.live,
    orphanedWakeSources: wakeSourceStates.orphaned,
    sessionId: input?.session_id ?? "",
    stopHookActive: input?.stop_hook_active === true,
    isWakeSourceAlive,
    receiptVerdict,
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  if (verdict?.terminal === "BLOCKED" || verdict?.terminal === "MERGED") {
    process.stderr.write(verdict.message)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
