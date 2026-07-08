#!/usr/bin/env node
// PostToolUse hook: flag hardcoded Orbit brand-accent colors in app code across
// both the web/mobile apps and the landing page. DESIGN.md mandates semantic
// tokens — var(--primary) / rgba(var(--primary-rgb), a) — never a raw accent
// literal. The ban-set is derived live from each surface's token definitions
// (apps/web/app/globals.css for the apps, src/styles/global.css for landing), so
// it never drifts from the palette. Legit raw colors (QR #ffffff, third-party
// brand logos, #000 shadows, neutral slate) are not accent values, so they never
// match. Any unexpected error exits 0.

import { readFileSync, existsSync } from "node:fs"

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

  let added = ""
  if (typeof toolInput.new_string === "string") added = toolInput.new_string
  else if (Array.isArray(toolInput.edits)) added = toolInput.edits.map((edit) => edit?.new_string ?? "").join("\n")
  else if (typeof toolInput.content === "string") added = toolInput.content
  if (!added) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")
  if (/\/(node_modules|__tests__)\//.test(normalized)) process.exit(0)
  if (/\.(test|spec)\.(ts|tsx)$/.test(normalized)) process.exit(0)

  // Resolve which surface this file belongs to, and where its token defs live.
  let globalsPath = null
  const appsMatch = /^(.*)\/apps\/(?:web|mobile)\//.exec(normalized)
  const landingMatch = /^(.*\/orbit-landing-page)\//.exec(normalized)
  if (appsMatch && /\.(ts|tsx|css)$/.test(normalized)) {
    if (/\/apps\/web\/app\/globals\.css$/.test(normalized)) process.exit(0)
    if (/\/apps\/mobile\/lib\/theme\.ts$/.test(normalized)) process.exit(0)
    globalsPath = `${appsMatch[1]}/apps/web/app/globals.css`
  } else if (landingMatch && /\.(astro|css|ts)$/.test(normalized)) {
    if (/\/src\/styles\/global\.css$/.test(normalized)) process.exit(0)
    globalsPath = `${landingMatch[1]}/src/styles/global.css`
  } else {
    process.exit(0)
  }

  if (!existsSync(globalsPath)) process.exit(0)

  const globals = readFileSync(globalsPath, "utf8")
  const bannedHex = new Set(
    [...globals.matchAll(/--(?:color-)?primary(?:-pressed)?:\s*(#[0-9a-fA-F]{6})/g)].map((match) =>
      match[1].toLowerCase(),
    ),
  )
  const bannedRgb = new Set(
    [...globals.matchAll(/--primary-rgb:\s*(\d+,\s*\d+,\s*\d+)/g)].map((match) =>
      match[1].replace(/\s+/g, ""),
    ),
  )
  if (bannedHex.size === 0 && bannedRgb.size === 0) process.exit(0)

  const findings = []
  const lowerAdded = added.toLowerCase()
  for (const hex of bannedHex) {
    if (lowerAdded.includes(hex)) findings.push(`${hex} → use the --primary token`)
  }
  const compactAdded = added.replace(/\s+/g, "")
  for (const rgb of bannedRgb) {
    if (compactAdded.includes(rgb)) findings.push(`rgb(${rgb}) → use rgba(var(--primary-rgb), a)`)
  }

  if (findings.length === 0) process.exit(0)

  process.stderr.write(
    `Hardcoded brand-accent color newly written into ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nDESIGN.md: accents come from tokens. Use var(--primary) / var(--color-primary) / var(--primary-pressed) or rgba(var(--primary-rgb), a), never a raw scheme literal.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
