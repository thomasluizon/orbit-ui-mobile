#!/usr/bin/env node
// PreToolUse(Bash, PowerShell) adapter for the orchestration guardrails. Thin: the reusable
// core is the pure functions in _lib/rules-orchestrator.mjs. Exits 0 (allow) or 2 + stderr
// (block). Any error exits 0 so the hook never wedges a shell.
//
// Registered on the PowerShell tool as well as Bash. The PowerShell tool fires no hook by
// default, so a guard matching only "Bash" is open on day one to anyone who reaches for the
// other shell, which is not a hypothetical: it defeated every existing command guard in both
// repositories.

import { readStdinJson } from "./_lib/io.mjs"
import { checkAdminMerge, checkEngineInvocation } from "./_lib/rules-orchestrator.mjs"

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") process.exit(0)

  const verdict =
    checkAdminMerge(command) ??
    checkEngineInvocation(command, { env: process.env })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
