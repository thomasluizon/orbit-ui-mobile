#!/usr/bin/env node
// Adapter for the ticket write guard. It checks shell commands before execution and source
// edits after they land. Repository tools are the sanctioned ticket-system boundary.

import { readStdinJson, filePathFrom } from "./_lib/io.mjs"
import { checkTicketMutation } from "./_lib/rules-tickets.mjs"

const EXEMPT_SOURCE = /[/\\](?:\.claude[/\\]hooks|tools)[/\\]/

try {
  const input = readStdinJson()
  if (EXEMPT_SOURCE.test(filePathFrom(input) ?? "")) process.exit(0)
  const candidates = [
    input?.tool_input?.command,
    input?.tool_input?.content,
    input?.tool_input?.new_string,
    ...(Array.isArray(input?.tool_input?.edits) ? input.tool_input.edits.map((edit) => edit?.new_string) : []),
  ].filter((value) => typeof value === "string")
  for (const text of candidates) {
    const verdict = checkTicketMutation(text)
    if (verdict?.block) {
      process.stderr.write(verdict.message)
      process.exit(2)
    }
  }
  process.exit(0)
} catch {
  process.exit(0)
}
