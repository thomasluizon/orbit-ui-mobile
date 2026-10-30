#!/usr/bin/env node
// PreToolUse(Bash, PowerShell) and Stop adapter for the handoff prompt gate. The rules live in
// _lib/rules-handoff.mjs. Exits 0 (allow) or 2 + stderr (block). Checkout refresh failures block
// handoff commits; unrelated adapter errors leave the shell and Stop usable.

import { handoffDocsChanged, syncRelayCheckout } from "../../tools/lib/relay-checkout.mjs"
import { readHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { REPO_ROOT, readRunState } from "../../tools/lib/run-state.mjs"
import { newestCommittedPrompt, promptsForCommit } from "./_lib/handoff-git.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkHandoffCommit, checkHandoffStop, gitCommitDirectory } from "./_lib/rules-handoff.mjs"

try {
  const input = readStdinJson()
  const request = readHandoffRequest(input?.session_id ?? "")
  const run = readRunState()
  const state = run?.sessionId === input?.session_id ? run : null
  let verdict = null
  if (input?.hook_event_name === "Stop") {
    const head = newestCommittedPrompt(REPO_ROOT)
    verdict = checkHandoffStop({ request, state, headPrompt: head.text, headPromptCommittedAt: head.committedAt })
  } else if (typeof input?.tool_input?.command === "string") {
    verdict = checkHandoffCommit({ command: input.tool_input.command, cwd: input?.cwd || process.cwd(), request, state, promptsForCommit })
  }
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  if (input?.hook_event_name !== "Stop" && typeof input?.tool_input?.command === "string") {
    const directory = gitCommitDirectory(input.tool_input.command, input?.cwd || process.cwd())
    if (directory) {
      try {
        if (handoffDocsChanged(directory)) syncRelayCheckout(directory)
      } catch (error) {
        process.stderr.write(`Handoff checkout refresh failed: ${error.message}\n`)
        process.exit(2)
      }
    }
  }
  process.exit(0)
} catch {
  process.exit(0)
}
