#!/usr/bin/env node
// PreToolUse adapter for the secret-in-argv guard. Thin: logic in
// _lib/rules-secrets.mjs (shared with the .opencode/plugin equivalent).
// Exits 0 or 2 + stderr.
//
// Unlike the PostToolUse adapters (which exit 0 on error so a broken hook never
// wedges Bash), this one fails CLOSED: it is a secret-leak fence, and a command
// it could not read must not run. Same posture as primer-shell-allowlist.mjs.

import { readStdinJson } from "./_lib/io.mjs"
import { checkSecretInArgv } from "./_lib/rules-secrets.mjs"

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") {
    process.stderr.write("forbid-secret-in-argv: no command on the payload; refusing to run it unchecked.\n")
    process.exit(2)
  }
  const verdict = checkSecretInArgv(command)
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`forbid-secret-in-argv: guard failed to evaluate (${error?.message ?? "unknown"}); failing closed.\n`)
  process.exit(2)
}
