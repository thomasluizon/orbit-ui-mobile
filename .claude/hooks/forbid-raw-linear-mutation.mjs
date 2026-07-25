#!/usr/bin/env node
// Adapter for the Linear write guard. The reusable core is the pure functions in
// _lib/rules-linear.mjs. Wired twice, because a raw mutation reaches Linear two
// ways and blocking only the first is a fence with a gate in it:
//   PreToolUse(Bash)          - the curl / gh api / inline POST.
//   PostToolUse(Write|Edit)   - a script that will POST when it is run. The file
//                               already exists at this point, so this cannot
//                               prevent the write; it reports before the run,
//                               which is the last moment the caller can switch
//                               to orca without having sent anything.
// Exits 0 (allow) or 2 + stderr (report). Any error exits 0 so the hook never
// wedges a tool.

import { readStdinJson, filePathFrom } from "./_lib/io.mjs"
import { checkLinearMutation } from "./_lib/rules-linear.mjs"

// The gate cannot police its own source. A rule module and its fixtures must
// contain the exact strings they match on, so scanning them reports the gate
// itself - measured the first time this hook ran, on the edit that added its
// tests. Same class as the git rule's heredoc case: text that NAMES a pattern
// is not text that runs it. Scoped to this directory, nothing wider.
const GATE_SOURCE = /[/\\]\.claude[/\\]hooks[/\\]/

try {
  const input = readStdinJson()
  if (GATE_SOURCE.test(filePathFrom(input) ?? "")) process.exit(0)

  const candidates = [
    input?.tool_input?.command,
    input?.tool_input?.content,
    input?.tool_input?.new_string,
    ...(Array.isArray(input?.tool_input?.edits) ? input.tool_input.edits.map((edit) => edit?.new_string) : []),
  ].filter((value) => typeof value === "string")

  for (const text of candidates) {
    const verdict = checkLinearMutation(text)
    if (verdict?.block) {
      process.stderr.write(verdict.message)
      process.exit(2)
    }
  }
  process.exit(0)
} catch {
  process.exit(0)
}
