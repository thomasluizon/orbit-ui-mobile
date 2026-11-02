#!/usr/bin/env node
// Adapter for the ticket write guard. It checks shell commands before execution and source
// edits after they land. Repository tools are the sanctioned ticket-system boundary.

import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { readStdinJson, filePathFrom } from "./_lib/io.mjs"
import { checkTicketMutation } from "./_lib/rules-tickets.mjs"

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url))
const EXEMPT_SOURCE = /^(?:\.claude\/hooks|tools)\//

try {
  const input = readStdinJson()
  if (EXEMPT_SOURCE.test(relative(REPO_ROOT, resolve(input?.cwd || REPO_ROOT, filePathFrom(input) ?? "")).replaceAll("\\", "/"))) process.exit(0)
  const candidates = [
    input?.tool_input?.command,
    input?.tool_input?.content,
    input?.tool_input?.new_string,
    ...(Array.isArray(input?.tool_input?.edits) ? input.tool_input.edits.map((edit) => edit?.new_string) : []),
  ].filter((value) => typeof value === "string")
  for (const text of candidates) {
    const verdict = checkTicketMutation(text, { sourcePath: text === input?.tool_input?.command ? "" : filePathFrom(input) })
    if (verdict?.block) {
      process.stderr.write(verdict.message)
      process.exit(2)
    }
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`forbid-raw-ticket-mutation: ${error.message}\n`)
  process.exit(2)
}
