#!/usr/bin/env node
// UserPromptSubmit and Stop adapter for the unattended stale files cleanup. It starts one detached
// `tools/stale-files.mjs --delete` at each relay adoption and whenever free disk is under the floor. It adds no
// context and asks nobody: the listing at the removal proves each item stale. Every failure exits 0.

import { dirname } from "node:path"

import { cleanupDueReason, cleanupIsRunning, DATA_VOLUME, freeBytes, readCleanupAdoption, readCleanupMarker, startCleanup } from "../../tools/lib/stale-files.mjs"
import { readRunState } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"

const freeDisk = () => {
  try { return freeBytes(DATA_VOLUME) } catch { return null }
}

try {
  const input = readStdinJson()
  // A launched worker and a subagent are not the run: the orchestrating session starts the cleanup.
  if (process.env.ORBIT_LAUNCH_WORKER || input.agent_id || typeof input.session_id !== "string") process.exit(0)
  const reason = cleanupDueReason({ sessionId: input.session_id, state: readRunState(), adoption: readCleanupAdoption(), marker: readCleanupMarker(), running: cleanupIsRunning(),
    freeDiskBytes: freeDisk() })
  if (reason) {
    // Claude Code names the scratchpad `<session root>/<session id>/scratchpad` in every hook input.
    const sessionRoot = typeof input.scratchpad_dir === "string" ? dirname(dirname(input.scratchpad_dir)) : null
    startCleanup({ sessionId: input.session_id, sessionRoot, reason, adoptedBy: reason === "relay adoption" ? input.session_id : null })
  }
} catch {
  // A prompt or a stop must never fail because the cleanup could not start.
}
process.exit(0)
