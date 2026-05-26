#!/usr/bin/env node
// PostToolUse hook: flag console.log / any / @ts-ignore / @ts-expect-error in
// .ts/.tsx files outside __tests__. Scoped to the edited file only — never
// scans the whole repo. Exits 0 silent or 2 with stderr feedback. Any
// unexpected error exits 0 so the hook never surfaces as a crash to the user.

import { readFileSync, existsSync } from "node:fs"

try {
  const ANTIPATTERNS = [
    { pattern: /(^|\s)console\.(log|debug|info)\(/g, label: "console.log" },
    { pattern: /:\s*any(\s|,|;|\)|>|\[|\||\})/g, label: ": any" },
    { pattern: /\bas\s+any\b/g, label: "as any" },
    { pattern: /\bas\s+unknown\s+as\s+\w+/g, label: "as unknown as X" },
    { pattern: /\/\/\s*@ts-ignore/g, label: "@ts-ignore" },
    { pattern: /\/\/\s*@ts-expect-error/g, label: "@ts-expect-error" },
    // Negative lookahead scans the rest of the same line for ` -- reason ` so
    // the standard ESLint syntax `eslint-disable-next-line rule -- why` passes.
    { pattern: /\/\/\s*eslint-disable(-next-line)?(?![^\n]*\s--\s+\S)/g, label: "unjustified eslint-disable" },
  ]

  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const filePath = input?.tool_input?.file_path ?? input?.tool_response?.filePath
  if (!filePath) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")
  if (!/\.(ts|tsx)$/.test(normalized)) process.exit(0)
  if (/\/__tests__\//.test(normalized)) process.exit(0)
  if (/\.test\.(ts|tsx)$/.test(normalized)) process.exit(0)
  if (/\.spec\.(ts|tsx)$/.test(normalized)) process.exit(0)
  if (/\/\.claude\/(hooks|scripts|agents|skills)\//.test(normalized)) process.exit(0)
  if (!existsSync(filePath)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const findings = []
  for (const { pattern, label } of ANTIPATTERNS) {
    for (const match of contents.matchAll(pattern)) {
      const lineNumber = contents.slice(0, match.index).split("\n").length
      findings.push(`${filePath}:${lineNumber} — ${label}`)
    }
  }

  if (findings.length === 0) process.exit(0)

  process.stderr.write(
    `Code Standards violations in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nRoot-cause fix:\n` +
      `  - console.log → remove or use a logger\n` +
      `  - any → unknown + narrowing\n` +
      `  - as any / as unknown as X → narrow the type properly\n` +
      `  - @ts-ignore / @ts-expect-error / eslint-disable → fix the underlying issue, or add a one-line WHY comment if truly unavoidable\n`,
  )
  process.exit(2)
} catch {
  // Never surface hook crashes to the user — silently no-op on any error.
  process.exit(0)
}
