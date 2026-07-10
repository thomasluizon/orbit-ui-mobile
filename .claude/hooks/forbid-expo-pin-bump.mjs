#!/usr/bin/env node
// PreToolUse(Bash) adapter for the Expo-SDK pin guard. Thin: logic in
// _lib/rules-git.mjs (shared with the .opencode/plugin equivalent). Exits 0
// (allow) or 2 (block). Any error exits 0 so the hook never wedges Bash.

import { readStdinJson } from "./_lib/io.mjs"
import { checkNpmExpoPin } from "./_lib/rules-git.mjs"

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") process.exit(0)

  const verdict = checkNpmExpoPin(command)
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
