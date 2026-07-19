#!/usr/bin/env node
// PreToolUse hook (Bash + Edit/Write/MultiEdit): blocks tampering with the
// visual completion gate's state files (PAUSED / surfaces.json / verdicts.json).
// Rule logic lives in _lib/rules-gate-tamper.mjs (shared with the opencode
// plugin). Exits 0 or 2 + stderr; any internal error exits 0 (this guard must
// never break an unrelated session). Contract: https://code.claude.com/docs/en/hooks

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
} catch {
  process.exit(0)
}
