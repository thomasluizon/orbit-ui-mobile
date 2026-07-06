#!/usr/bin/env node
// PostToolUse hook: warn on raw DateTime.UtcNow or DateOnly.FromDateTime(DateTime.UtcNow)
// in orbit-api Application AND Domain code. User-facing "today" MUST come from
// IUserDateService.GetUserTodayAsync(userId) (Application) or be passed into the
// Domain method as a parameter — Domain never derives "today" from the clock.
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
  if (!/\/orbit-api\/src\/Orbit\.(Application|Domain)\/.*\.cs$/.test(normalized)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const findings = []
  const utcNowPattern = /DateTime\.UtcNow/g
  const dateOnlyPattern = /DateOnly\.FromDateTime\s*\(\s*DateTime\.UtcNow/g

  // Domain legitimately uses DateTime.UtcNow for instant comparisons and
  // absolute timestamps; only deriving a calendar day from the clock
  // (DateOnly.FromDateTime) is the anti-pattern there. Application forbids
  // both, since it owns IUserDateService.
  const isDomain = /\/orbit-api\/src\/Orbit\.Domain\//.test(normalized)

  if (!isDomain) {
    for (const match of contents.matchAll(utcNowPattern)) {
      const lineNumber = contents.slice(0, match.index).split("\n").length
      const line = contents.split("\n")[lineNumber - 1]
      if (/[A-Za-z]*AtUtc|cache(Key)?/i.test(line)) continue
      findings.push(`${filePath}:${lineNumber} — DateTime.UtcNow`)
    }
  }

  for (const match of contents.matchAll(dateOnlyPattern)) {
    const lineNumber = contents.slice(0, match.index).split("\n").length
    findings.push(`${filePath}:${lineNumber} — DateOnly.FromDateTime(DateTime.UtcNow)`)
  }

  if (findings.length === 0) process.exit(0)

  process.stderr.write(
    `Timezone rule violations in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nUser-facing dates MUST use IUserDateService.GetUserTodayAsync(userId) for the user's timezone-aware "today".\n` +
      `DateTime.UtcNow is only acceptable for CreatedAtUtc/UpdatedAtUtc timestamps and cache key generation.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
