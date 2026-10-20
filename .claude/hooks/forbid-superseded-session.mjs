#!/usr/bin/env node
import { supersededSession } from "../../tools/lib/session-chain.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { supersededMessage } from "./_lib/rules-relay.mjs"
import { readFileSync } from "node:fs"

const input = readStdinJson()
const enabled = JSON.parse(readFileSync(new URL("../orchestrator.json", import.meta.url), "utf8")).relay.enabled
const message = enabled ? supersededMessage(supersededSession(input?.session_id)) : null
if (message) {
  if (input.hook_event_name === "PreToolUse") {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: message } })}\n`)
  } else {
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: message })}\n`)
  }
}
