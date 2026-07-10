#!/usr/bin/env node
// PostToolUse adapter for the cross-platform parity nudge. Thin: the pure parts
// (classify + derive the nudge) live in _lib/rules-parity.mjs (shared with the
// .opencode/plugin equivalent); this adapter owns the session-state file. Any
// error exits 0 so the hook never surfaces as a crash.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { readStdinJson, filePathFrom } from "./_lib/io.mjs"
import { classifyScope, parityMessages } from "./_lib/rules-parity.mjs"

try {
  const input = readStdinJson()
  const filePath = filePathFrom(input)
  const sessionId = input?.session_id
  if (!filePath || !sessionId) process.exit(0)

  const scope = classifyScope(filePath)
  if (!scope) process.exit(0)

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const stateDir = join(projectRoot, ".tmp", "sessions", String(sessionId))
  const statePath = join(stateDir, "parity-state.json")

  let state = { web: 0, mobile: 0, shared: 0, api: 0 }
  if (existsSync(statePath)) {
    try {
      state = { ...state, ...JSON.parse(readFileSync(statePath, "utf8")) }
    } catch {
      // ignore stale state
    }
  }
  state[scope] = (state[scope] || 0) + 1
  try {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(statePath, JSON.stringify(state), "utf8")
  } catch {
    // best effort
  }

  const messages = parityMessages(state)
  if (messages.length === 0) process.exit(0)

  process.stderr.write("Parity reminder:\n" + messages.map((m) => `  - ${m}`).join("\n") + "\n")
  process.exit(2)
} catch {
  process.exit(0)
}
