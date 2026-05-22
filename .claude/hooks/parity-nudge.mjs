#!/usr/bin/env node
// PostToolUse hook: track which workspaces were edited in this session and
// nudge when one is missing its counterpart. Reads/writes a session-scoped
// state file under .tmp/sessions/<session-id>/.
// Any unexpected error exits 0 so the hook never surfaces as a crash.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

try {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const filePath = input?.tool_input?.file_path ?? input?.tool_response?.filePath
  const sessionId = input?.session_id
  if (!filePath || !sessionId) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")

  const scope =
    /\/apps\/web\//.test(normalized) ? "web"
    : /\/apps\/mobile\//.test(normalized) ? "mobile"
    : /\/packages\/shared\//.test(normalized) ? "shared"
    : /\/orbit-api\/src\//.test(normalized) ? "api"
    : null

  if (!scope) process.exit(0)

  const stateDir = join(".tmp", "sessions", String(sessionId))
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

  const NUDGE_THRESHOLD = 3
  const messages = []

  if (state.web >= NUDGE_THRESHOLD && state.mobile === 0) {
    messages.push(`${state.web} edits to apps/web/ with zero edits to apps/mobile/. Parity is mandatory — apply the matching change in apps/mobile/, or invoke the parity-checker subagent.`)
  }
  if (state.mobile >= NUDGE_THRESHOLD && state.web === 0) {
    messages.push(`${state.mobile} edits to apps/mobile/ with zero edits to apps/web/. Parity is mandatory — apply the matching change in apps/web/, or invoke the parity-checker subagent.`)
  }
  if (state.api >= NUDGE_THRESHOLD && state.shared === 0 && state.web === 0 && state.mobile === 0) {
    messages.push(`${state.api} edits to orbit-api/ with no client-side changes. If the contract changed, update packages/shared/src/api/endpoints.ts and the consumer hooks. Invoke contract-aligner to verify.`)
  }

  if (messages.length === 0) process.exit(0)

  process.stderr.write("Parity reminder:\n" + messages.map((m) => `  - ${m}`).join("\n") + "\n")
  process.exit(2)
} catch {
  process.exit(0)
}
