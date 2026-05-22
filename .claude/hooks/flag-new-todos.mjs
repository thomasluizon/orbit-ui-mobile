#!/usr/bin/env node
// PostToolUse hook: flag new TODO/FIXME/HACK/XXX/BUG markers in the edited
// file. These are workarounds-in-disguise — the Code Standards forbid them
// except with a tracked issue reference (e.g. `TODO #123 …`).
// Any unexpected error exits 0 so the hook never surfaces as a crash.

import { readFileSync, existsSync } from "node:fs"

try {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const filePath = input?.tool_input?.file_path ?? input?.tool_response?.filePath
  if (!filePath || !existsSync(filePath)) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")
  if (/\/(node_modules|\.next|\.expo|\.turbo|dist|build|coverage)\//.test(normalized)) process.exit(0)
  if (/\/\.claude\/(hooks|scripts|agents|skills)\//.test(normalized)) process.exit(0)
  if (/\/\.github\/workflows\//.test(normalized)) process.exit(0)
  if (/\.(md|mdx|json|yml|yaml)$/.test(normalized)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const markers = /(?<![A-Za-z])(TODO|FIXME|HACK|XXX|BUG)(?!\s*\(?[A-Za-z0-9_/-]*#\d+)/g
  const findings = []
  for (const match of contents.matchAll(markers)) {
    const lineNumber = contents.slice(0, match.index).split("\n").length
    const lineContent = contents.split("\n")[lineNumber - 1].trim().slice(0, 120)
    findings.push(`${filePath}:${lineNumber} — ${match[1]} — ${lineContent}`)
  }

  if (findings.length === 0) process.exit(0)

  process.stderr.write(
    `Untracked workaround markers in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nThese are root-cause-avoidance markers. Either:\n` +
      `  1. Fix the underlying issue and remove the marker.\n` +
      `  2. Open a GitHub issue and reference it: \`TODO #<number>: ...\`.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
