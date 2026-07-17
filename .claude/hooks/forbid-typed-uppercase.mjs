#!/usr/bin/env node
// PostToolUse adapter for the typed-UPPERCASE guard (DESIGN.md "Copy": store
// copy in natural case, uppercase via text-transform). Thin: logic in
// _lib/rules-copy.mjs (shared with the .opencode/plugin equivalent). Scans only
// the i18n values this edit introduced. Exits 0 or 2 + stderr. Any error exits 0.

import { readStdinJson, filePathFrom, addedTextFrom } from "./_lib/io.mjs"
import { checkTypedUppercase } from "./_lib/rules-copy.mjs"

try {
  const input = readStdinJson()
  const verdict = checkTypedUppercase(addedTextFrom(input?.tool_input ?? {}), filePathFrom(input))
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
