#!/usr/bin/env node
// Adapter for the dependency write ban. The reusable core is checkDependencyFileWrite and
// checkDependencyCommand in _lib/rules-dependencies.mjs. Wired to PreToolUse on Write, Edit and
// MultiEdit, which is how an agent actually edits a file, AND on Bash and PowerShell, because the
// PowerShell tool fires no hook by default and that alone would defeat half of it.
// Exits 0 (allow) or 2 + stderr (block). Any error exits 0 so the hook never wedges a tool.
//
// It takes no caller: a hand edit inside a dependency is wrong from a worker, an orchestrator and
// Thomas alike, because the damage is to what every later reader sees. Deleting a package and
// reinstalling it, the documented repair, stays open.

import { filePathFrom, readStdinJson } from "./_lib/io.mjs"
import { checkDependencyCommand, checkDependencyFileWrite } from "./_lib/rules-dependencies.mjs"

try {
  const input = readStdinJson()
  const cwd = input?.cwd ?? ""
  const editTarget = filePathFrom(input) ?? input?.tool_input?.notebook_path ?? null
  const verdict =
    checkDependencyFileWrite(editTarget, { cwd }) ?? checkDependencyCommand(input?.tool_input?.command, { cwd })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
