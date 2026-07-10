#!/usr/bin/env node
// PostToolUse adapter for the em-dash-in-copy guard. Thin: logic in
// _lib/rules-content.mjs (shared with the .opencode/plugin equivalent). Scans
// only the text this edit introduced. Exits 0 or 2 + stderr. Any error exits 0.

import { readStdinJson, filePathFrom, addedTextFrom } from "./_lib/io.mjs"
import { checkEmDashes } from "./_lib/rules-content.mjs"

try {
  const input = readStdinJson()
  const filePath = filePathFrom(input)
  const added = addedTextFrom(input?.tool_input ?? {})
  const verdict = checkEmDashes(added, filePath)
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
