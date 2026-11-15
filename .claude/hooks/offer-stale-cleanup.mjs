#!/usr/bin/env node
// UserPromptSubmit adapter for the stale files offer. While the stored listing holds a stale item, every
// prompt carries one line that tells the session to offer the cleanup to the owner. The listing itself runs
// detached, so the prompt never waits for it. This hook is informational only: every failure exits 0.

import { dirname } from "node:path"

import { offerOf, readStoredListing, refreshIsDue, startRefresh } from "../../tools/lib/stale-files.mjs"
import { readStdinJson } from "./_lib/io.mjs"

try {
  const input = readStdinJson()
  // A launched worker and a subagent have no owner to ask.
  if (process.env.ORBIT_LAUNCH_WORKER || input.agent_id || typeof input.session_id !== "string") process.exit(0)
  const listing = readStoredListing()
  // Claude Code names the scratchpad `<session root>/<session id>/scratchpad` in every hook input.
  const sessionRoot = typeof input.scratchpad_dir === "string" ? dirname(dirname(input.scratchpad_dir)) : null
  if (refreshIsDue(listing)) startRefresh(input.session_id, sessionRoot)
  const offer = offerOf(listing, input.session_id)
  if (offer) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: offer } })}\n`)
} catch {
  // A prompt must never fail because the offer could not be built.
}
process.exit(0)
