#!/usr/bin/env node
// UserPromptSubmit adapter: records whether the owner's prompt asked for a handoff and in which mode, so
// require-handoff-prompt.mjs judges NEXT.md against the owner's words rather than the model's reading of
// them. It never blocks and never writes to stdout. Any error exits 0.

import { recordHandoffRequest, parseHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { readStdinJson } from "./_lib/io.mjs"

try {
  const input = readStdinJson()
  const request = parseHandoffRequest(input?.prompt)
  if (request) recordHandoffRequest(input?.session_id ?? "", request, new Date().toISOString())
} catch {
  // A failed record leaves the commit gate checking the requirements every prompt shares.
}
process.exit(0)
