#!/usr/bin/env node
// PreToolUse(Bash) adapter for primer's shell allowlist. Thin: the rule logic
// lives in _lib/rules-shell-allowlist.mjs.
//
// Wired in .claude/agents/primer.md's OWN frontmatter `hooks:` field, never in
// settings.json. PreToolUse input carries no agent_type, so a hook wired
// globally cannot tell which agent is calling and would police every Bash call
// in the session. Scoping here is by PLACEMENT: a frontmatter hook runs only
// while its agent is active. See the "Agent tool scoping" section of CLAUDE.md.
//
// Fails CLOSED (exit 2) — the deliberate divergence from every other adapter in
// this directory, which exits 0 on error so a broken hook never wedges Bash.
// This one is a security fence, not a workflow nudge: an unreadable payload
// means the command was never validated, and an unvalidated command must not
// run. A wedged primer fails loudly and visibly; a fail-open primer silently
// gets its full unscoped shell back, which is the exact bug this hook exists to
// close.

import { readStdinJson } from "./_lib/io.mjs"
import { checkShellAllowlist, PRIMER_SHELL_ALLOWLIST } from "./_lib/rules-shell-allowlist.mjs"

function deny(message) {
  process.stderr.write(message)
  process.exit(2)
}

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") {
    deny("BLOCKED (primer allowlist): no command found in the PreToolUse payload, so it could not be validated.\n")
  }

  const verdict = checkShellAllowlist(command, { allowlist: PRIMER_SHELL_ALLOWLIST, agent: "primer" })
  if (verdict?.block) deny(verdict.message)
  process.exit(0)
} catch (error) {
  deny(`BLOCKED (primer allowlist): the guard errored, so the command was not validated.\n  ${error}\n`)
}
