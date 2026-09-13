#!/usr/bin/env node
// SessionStart adapter for the pending-lessons reminder. This hook is
// informational only, so every failure exits 0 without delaying the session.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { readStdinJson } from "./_lib/io.mjs"
import { countUnreviewedPendingLessons } from "./_lib/rules-lessons.mjs"

try {
  if (readStdinJson() === null) process.exit(0)
  const hookDirectory = dirname(fileURLToPath(import.meta.url))
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || join(hookDirectory, "..", "..")
  const pendingLessons = readFileSync(join(projectRoot, ".claude", "pending-lessons.md"), "utf8")
  const count = countUnreviewedPendingLessons(pendingLessons)
  if (count === 0) process.exit(0)

  const line = `${count} unreviewed pending lesson${count === 1 ? "" : "s"} in .claude/pending-lessons.md. Review ${count === 1 ? "it" : "them"} with /lesson.`
  process.stdout.write(line)
  process.exit(0)
} catch {
  process.exit(0)
}
