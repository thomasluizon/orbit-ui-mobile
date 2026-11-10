#!/usr/bin/env node
// PreToolUse(Bash, PowerShell) and Stop adapter for the handoff prompt gate. The rules live in
// _lib/rules-handoff.mjs. Exits 0 (allow) or 2 + stderr (block). Adapter errors block with a diagnostic.

import { handoffDocsChanged, mergeInProgress, syncRelayCheckout } from "../../tools/lib/relay-checkout.mjs"
import { readHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { REPO_ROOT, readRunState } from "../../tools/lib/run-state.mjs"
import { newestCommittedPrompt, promptsForCommit, specsForCommit } from "./_lib/handoff-git.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkHandoffCommit, checkHandoffStop } from "./_lib/rules-handoff.mjs"

try {
  const input = readStdinJson()
  const request = readHandoffRequest(input?.session_id ?? "")
  const run = readRunState()
  const state = run?.sessionId === input?.session_id ? run : null
  let verdict = null
  if (input?.hook_event_name === "Stop" && request) {
    const head = newestCommittedPrompt(REPO_ROOT)
    verdict = checkHandoffStop({ request, state, headPrompt: head.text, headPromptCommittedAt: head.committedAt, headSpecVersions: head.specVersions })
  } else if (typeof input?.tool_input?.command === "string") {
    verdict = checkHandoffCommit({ command: input.tool_input.command, cwd: input?.cwd || process.cwd(), request, state, promptsForCommit, specsForCommit,
      // A commit that concludes a merge authors no handoff docs and already merges main.
      refreshCheckout: (directory) => { if (!mergeInProgress(directory) && handoffDocsChanged(directory)) syncRelayCheckout(directory) },
    })
  }
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`require-handoff-prompt: ${error.message}\n`)
  process.exit(2)
}
