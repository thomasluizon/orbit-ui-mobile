#!/usr/bin/env node
// SessionStart adapter for the pending-lessons reminder. This hook is
// informational only, so every failure exits 0 without delaying the session.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { readStdinJson } from "./_lib/io.mjs"
import { countUnreviewedPendingLessons, isDriftReviewOverdue } from "./_lib/rules-lessons.mjs"

const readOptional = (path) => {
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    return error?.code === "ENOENT" ? undefined : null
  }
}

try {
  readStdinJson()
  const hookDirectory = dirname(fileURLToPath(import.meta.url))
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || join(hookDirectory, "..", "..")
  const pendingLessons = readOptional(join(projectRoot, ".claude", "pending-lessons.md"))
  const count = typeof pendingLessons === "string" ? countUnreviewedPendingLessons(pendingLessons) : 0
  const driftState = readOptional(join(projectRoot, ".claude", "drift-review-state.json"))
  const lines = []
  if (count > 0) {
    lines.push(`${count} unreviewed pending lesson${count === 1 ? "" : "s"} in .claude/pending-lessons.md. Review ${count === 1 ? "it" : "them"} with /lesson.`)
  }
  if (isDriftReviewOverdue(driftState)) lines.push("Workflow drift review is overdue. Run /drift-review.")
  if (lines.length === 0) process.exit(0)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
  }))
  process.exit(0)
} catch {
  process.exit(0)
}
