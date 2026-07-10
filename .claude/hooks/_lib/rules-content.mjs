// Added-text invariants — scan only the text an edit INTRODUCED (never the whole
// file): banned em dashes in Orbit copy, and hardcoded brand-accent colors.
// Pure apart from an injected file reader (the brand-color rule derives its ban
// set from the live token files). Both the Claude Code PostToolUse hooks and the
// opencode tool.execute.before plugin call these.

import { readFileSync, existsSync } from "node:fs"

const defaultReadFile = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null)

export function checkEmDashes(added, filePath) {
  if (!filePath || typeof added !== "string" || !added) return null
  const normalized = String(filePath).replace(/\\/g, "/")
  const isLocaleJson = /\/i18n\/[^/]*\.json$/.test(normalized)
  const isEmailCopy = /\/[Ee]mail\//.test(normalized) || /ResendEmailService\.cs$/.test(normalized)
  const isLandingCopy = /\/orbit-landing-page\/src\/.*\.astro$/.test(normalized)
  if (!isLocaleJson && !isEmailCopy && !isLandingCopy) return null

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
  if (findings.length === 0) return null
  return {
    block: true,
    message:
      `Banned dash newly written into Orbit copy (${filePath}):\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nEm dashes are a banned LLM tell in Orbit copy. Use a plain hyphen (-), a comma, ` +
      `or restructure the sentence. En dashes are allowed only in numeric ranges (1–10).\n`,
  }
}

export function checkBrandColors(added, filePath, readFile = defaultReadFile) {
  if (!filePath || typeof added !== "string" || !added) return null
  const normalized = String(filePath).replace(/\\/g, "/")
  if (/\/(node_modules|__tests__)\//.test(normalized)) return null
  if (/\.(test|spec)\.(ts|tsx)$/.test(normalized)) return null

  let globalsPath = null
  const appsMatch = /^(.*)\/apps\/(?:web|mobile)\//.exec(normalized)
  const landingMatch = /^(.*\/orbit-landing-page)\//.exec(normalized)
  if (appsMatch && /\.(ts|tsx|css)$/.test(normalized)) {
    if (/\/apps\/web\/app\/globals\.css$/.test(normalized)) return null
    if (/\/apps\/mobile\/lib\/theme\.ts$/.test(normalized)) return null
    globalsPath = `${appsMatch[1]}/apps/web/app/globals.css`
  } else if (landingMatch && /\.(astro|css|ts)$/.test(normalized)) {
    if (/\/src\/styles\/global\.css$/.test(normalized)) return null
    globalsPath = `${landingMatch[1]}/src/styles/global.css`
  } else {
    return null
  }

  const globals = readFile(globalsPath)
  if (!globals) return null

  const bannedHex = new Set(
    [...globals.matchAll(/--(?:color-)?primary(?:-pressed)?:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase()),
  )
  const bannedRgb = new Set([...globals.matchAll(/--primary-rgb:\s*(\d+,\s*\d+,\s*\d+)/g)].map((m) => m[1].replace(/\s+/g, "")))
  if (bannedHex.size === 0 && bannedRgb.size === 0) return null

  const findings = []
  const lowerAdded = added.toLowerCase()
  for (const hex of bannedHex) if (lowerAdded.includes(hex)) findings.push(`${hex} → use the --primary token`)
  const compactAdded = added.replace(/\s+/g, "")
  for (const rgb of bannedRgb) if (compactAdded.includes(rgb)) findings.push(`rgb(${rgb}) → use rgba(var(--primary-rgb), a)`)
  if (findings.length === 0) return null

  return {
    block: true,
    message:
      `Hardcoded brand-accent color newly written into ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nDESIGN.md: accents come from tokens. Use var(--primary) / var(--color-primary) / var(--primary-pressed) or rgba(var(--primary-rgb), a), never a raw scheme literal.\n`,
  }
}
