#!/usr/bin/env node
// PreToolUse(Bash, PowerShell) and Stop adapter for the handoff prompt gate. The rules live in
// _lib/rules-handoff.mjs. Exits 0 (allow) or 2 + stderr (block). Any error exits 0 so the hook never
// wedges a shell or a stop.

import { readHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { REPO_ROOT } from "../../tools/lib/run-state.mjs"
import { newestCommittedPrompt, promptsForCommit } from "./_lib/handoff-git.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkHandoffCommit, checkHandoffStop } from "./_lib/rules-handoff.mjs"

try {
  const input = readStdinJson()
  const request = readHandoffRequest(input?.session_id ?? "")
  let verdict = null
  if (input?.hook_event_name === "Stop") {
    const head = newestCommittedPrompt(REPO_ROOT)
    verdict = checkHandoffStop({ request, headPrompt: head.text, headPromptCommittedAt: head.committedAt })
  } else if (typeof input?.tool_input?.command === "string") {
    verdict = checkHandoffCommit({ command: input.tool_input.command, cwd: input?.cwd || process.cwd(), request, promptsForCommit })
  }
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
