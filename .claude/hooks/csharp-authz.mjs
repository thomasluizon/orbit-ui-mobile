#!/usr/bin/env node
// PostToolUse adapter for the orbit-api Controller [Authorize] guard. Thin: logic
// in _lib/rules-source.mjs (shared with the .opencode/plugin equivalent). Reads
// the edited file. Exits 0 or 2 + stderr. Any error exits 0.

import { readFileSync, existsSync } from "node:fs"
import { readStdinJson, filePathFrom } from "./_lib/io.mjs"
import { checkCsharpAuthz } from "./_lib/rules-source.mjs"

try {
  const input = readStdinJson()
  const filePath = filePathFrom(input)
  if (!filePath || !existsSync(filePath)) process.exit(0)
  const verdict = checkCsharpAuthz(filePath, readFileSync(filePath, "utf8"))
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
