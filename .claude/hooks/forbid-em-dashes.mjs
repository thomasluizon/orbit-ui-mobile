#!/usr/bin/env node
// PostToolUse hook: flag em dashes (—) and en dashes (–) in Orbit-emitted copy
// — i18n locale JSON and email templates/service strings. These are a banned
// LLM tell in Orbit copy; a plain hyphen or restructured sentence is correct.
// Scoped to the edited file only; exits 0 silent or 2 with stderr feedback so
// the model corrects it. Any unexpected error exits 0 so the hook never crashes.

import { readFileSync, existsSync } from "node:fs"

try {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const filePath = input?.tool_input?.file_path ?? input?.tool_response?.filePath
  if (!filePath) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")

  const isLocaleJson = /\/i18n\/[^/]*\.json$/.test(normalized)
  const isEmailCopy = /\/[Ee]mail\//.test(normalized) || /ResendEmailService\.cs$/.test(normalized)
  if (!isLocaleJson && !isEmailCopy) process.exit(0)
  if (!existsSync(filePath)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const findings = []
  for (const match of contents.matchAll(/[—–]/g)) {
    const lineNumber = contents.slice(0, match.index).split("\n").length
    const label = match[0] === "—" ? "em dash (—)" : "en dash (–)"
    findings.push(`${filePath}:${lineNumber} — ${label}`)
  }

  if (findings.length === 0) process.exit(0)

  process.stderr.write(
    `Banned dash in Orbit copy in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nEm/en dashes are a banned LLM tell in Orbit copy. Use a plain hyphen (-), ` +
      `a comma, or restructure the sentence.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
