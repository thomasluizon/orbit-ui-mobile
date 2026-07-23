#!/usr/bin/env node
// PreToolUse hook (Bash + Edit/Write/MultiEdit): blocks tampering with the
// visual completion gate's state files (PAUSED / surfaces.json / verdicts.json).
// Rule logic lives in _lib/rules-gate-tamper.mjs (shared with the opencode
// plugin). Exits 0 or 2 + stderr. An internal error FAILS CLOSED (exit 2): this
// guard protects the one human-only completion grant, and a fence that opens
// when its own code throws is not a fence. Measured, not theorised - a broken
// regex in the rule core threw on every call and every payload sailed through
// while it did. https://github.com/thomasluizon/orbit-ui-mobile/pull/570
// Contract: https://code.claude.com/docs/en/hooks

import { readStdinJson, filePathFrom } from "./_lib/io.mjs"
import { checkGateTamperBash, checkGateTamperEdit } from "./_lib/rules-gate-tamper.mjs"

try {
  const input = readStdinJson()
  const toolName = input?.tool_name ?? ""
  let result = null
  if (toolName === "Bash") {
    result = checkGateTamperBash(input?.tool_input?.command ?? "")
  } else {
    result = checkGateTamperEdit(filePathFrom(input))
  }
  if (result?.block) {
    process.stderr.write(result.message + "\n")
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`gate-tamper: the guard itself failed (${error?.message ?? error}). Failing closed - this hook protects the human-only completion grant, so a command it cannot classify is refused, not waved through. Fix the hook, or use the Read/Write tools.
`)
  process.exit(2)
}
