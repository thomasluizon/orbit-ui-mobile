#!/usr/bin/env node
// PreToolUse(Bash) adapter for the git-workflow guard. Thin: the rule logic lives
// in _lib/rules-git.mjs (shared with the .opencode/plugin equivalent, so a fix
// lands in both tools). Exits 0 (allow) or 2 + stderr (block). Any error exits 0
// so the hook never wedges Bash.

import { execFileSync } from "node:child_process"
import { readStdinJson } from "./_lib/io.mjs"
import { checkGitCommand } from "./_lib/rules-git.mjs"

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") process.exit(0)

  const resolveHeadBranch = (dir) =>
    execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()

  const verdict = checkGitCommand(command, { resolveHeadBranch, cwd: input?.cwd || process.cwd() })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
