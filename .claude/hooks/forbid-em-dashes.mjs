#!/usr/bin/env node
// PostToolUse hook: flag em dashes (—) newly written into Orbit-emitted copy
// (i18n locale JSON, email templates/service strings). Em dashes are a banned
// LLM tell; en dashes (–) are allowed only in numeric ranges (1–10). Scans the
// text THIS edit introduced (Edit new_string / MultiEdit edits / Write content),
// never the whole file, so pre-existing dashes don't block unrelated edits.
// Exits 0 silent or 2 with stderr feedback. Any unexpected error exits 0.

import { readFileSync } from "node:fs"

try {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const toolInput = input?.tool_input ?? {}
  const filePath = toolInput.file_path ?? input?.tool_response?.filePath
  if (!filePath) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")
  const isLocaleJson = /\/i18n\/[^/]*\.json$/.test(normalized)
  const isEmailCopy = /\/[Ee]mail\//.test(normalized) || /ResendEmailService\.cs$/.test(normalized)
  if (!isLocaleJson && !isEmailCopy) process.exit(0)

  let added = ""
  if (typeof toolInput.new_string === "string") added = toolInput.new_string
  else if (Array.isArray(toolInput.edits)) added = toolInput.edits.map((edit) => edit?.new_string ?? "").join("\n")
  else if (typeof toolInput.content === "string") added = toolInput.content
  if (!added) process.exit(0)

  const rangeEnDashOffsets = new Set()
  for (const match of added.matchAll(/\d\s*–\s*\d/g)) {
    rangeEnDashOffsets.add(match.index + match[0].indexOf("–"))
  }

  const findings = []
  for (const match of added.matchAll(/[—–]/g)) {
    if (match[0] === "–" && rangeEnDashOffsets.has(match.index)) continue
    const start = Math.max(0, match.index - 20)
    const snippet = added.slice(start, match.index + 21).replace(/\s+/g, " ").trim()
    findings.push(`${match[0] === "—" ? "em dash (—)" : "en dash (–)"} in "…${snippet}…"`)
  }

  if (findings.length === 0) process.exit(0)

  process.stderr.write(
    `Banned dash newly written into Orbit copy (${filePath}):\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nEm dashes are a banned LLM tell in Orbit copy. Use a plain hyphen (-), a comma, ` +
      `or restructure the sentence. En dashes are allowed only in numeric ranges (1–10).\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
