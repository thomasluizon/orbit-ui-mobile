// Whole-file invariants — they read the file AFTER the edit lands (Claude Code
// PostToolUse; opencode tool.execute.after). Pure: each takes (filePath,
// contents) and returns { block, message } or null. Both adapters call all of
// them; each self-scopes by path and no-ops off its surface.

function norm(filePath) {
  return String(filePath || "").replace(/\\/g, "/")
}

const TS_ANTIPATTERNS = [
  { pattern: /(^|\s)console\.(log|debug|info)\(/g, label: "console.log" },
  { pattern: /:\s*any(\s|,|;|\)|>|\[|\||\})/g, label: ": any" },
  { pattern: /\bas\s+any\b/g, label: "as any" },
  { pattern: /\bas\s+unknown\s+as\s+\w+/g, label: "as unknown as X" },
  { pattern: /\/\/\s*@ts-ignore/g, label: "@ts-ignore" },
  { pattern: /\/\/\s*@ts-expect-error/g, label: "@ts-expect-error" },
  { pattern: /\/\/\s*eslint-disable(-next-line)?(?![^\n]*\s--\s+\S)/g, label: "unjustified eslint-disable" },
]

export function checkTsAntipatterns(filePath, contents) {
  const n = norm(filePath)
  if (!/\.(ts|tsx)$/.test(n)) return null
  if (/\/__tests__\//.test(n) || /\.test\.(ts|tsx)$/.test(n) || /\.spec\.(ts|tsx)$/.test(n)) return null
  if (/\/\.claude\/(hooks|scripts|agents|skills)\//.test(n)) return null
  if (typeof contents !== "string") return null

  const findings = []
  for (const { pattern, label } of TS_ANTIPATTERNS) {
    for (const match of contents.matchAll(pattern)) {
      const lineNumber = contents.slice(0, match.index).split("\n").length
      findings.push(`${filePath}:${lineNumber} — ${label}`)
    }
  }
  if (findings.length === 0) return null
  return {
    block: true,
    message:
      `Code Standards violations in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nRoot-cause fix:\n` +
      `  - console.log → remove or use a logger\n` +
      `  - any → unknown + narrowing\n` +
      `  - as any / as unknown as X → narrow the type properly\n` +
      `  - @ts-ignore / @ts-expect-error / eslint-disable → fix the underlying issue, or add a one-line WHY comment if truly unavoidable\n`,
  }
}

export function checkNewTodos(filePath, contents) {
  const n = norm(filePath)
  if (/\/(node_modules|\.next|\.expo|\.turbo|dist|build|coverage)\//.test(n)) return null
  if (/\/\.claude\/(hooks|scripts|agents|skills)\//.test(n)) return null
  if (/\/\.github\/workflows\//.test(n)) return null
  if (/\.(md|mdx|json|yml|yaml)$/.test(n)) return null
  if (typeof contents !== "string") return null

  const markers = /(?<![A-Za-z])(TODO|FIXME|HACK|XXX|BUG)(?!\s*\(?[A-Za-z0-9_/-]*#\d+)/g
  const findings = []
  for (const match of contents.matchAll(markers)) {
    const lineNumber = contents.slice(0, match.index).split("\n").length
    const lineContent = contents.split("\n")[lineNumber - 1].trim().slice(0, 120)
    findings.push(`${filePath}:${lineNumber} — ${match[1]} — ${lineContent}`)
  }
  if (findings.length === 0) return null
  return {
    block: true,
    message:
      `Untracked workaround markers in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nThese are root-cause-avoidance markers. Either:\n` +
      `  1. Fix the underlying issue and remove the marker.\n` +
      `  2. Open a GitHub issue and reference it: \`TODO #<number>: ...\`.\n`,
  }
}

export function checkCsharpAuthz(filePath, contents) {
  const n = norm(filePath)
  if (!/\/orbit-api\/src\/Orbit\.Api\/Controllers\/.*\.cs$/.test(n)) return null
  if (typeof contents !== "string") return null

  const hasControllerAuthorize = /^\s*\[Authorize[^\]]*\]\s*$[\s\S]*?(public\s+(?:partial\s+)?class\s+\w+Controller)/m.test(contents)
  const hasAnyAuthorize = /\[Authorize/.test(contents)
  const hasAnyAllowAnonymous = /\[AllowAnonymous/.test(contents)
  if (hasControllerAuthorize || hasAnyAuthorize || hasAnyAllowAnonymous) return null

  return {
    block: true,
    message:
      `${filePath}: no [Authorize] or [AllowAnonymous] decorator found.\n` +
      `\nDefault for orbit-api Controllers is [Authorize] at the class level.\n` +
      `Use [AllowAnonymous] on individual actions ONLY when truly public (e.g. POST /api/auth/send-code).\n` +
      `If this is intentional (e.g. webhook with signature verification), add a one-line WHY comment.\n`,
  }
}

export function checkCsharpTimezone(filePath, contents) {
  const n = norm(filePath)
  if (!/\/orbit-api\/src\/Orbit\.(Application|Domain)\/.*\.cs$/.test(n)) return null
  if (typeof contents !== "string") return null

  const findings = []
  const isDomain = /\/orbit-api\/src\/Orbit\.Domain\//.test(n)
  if (!isDomain) {
    for (const match of contents.matchAll(/DateTime\.UtcNow/g)) {
      const lineNumber = contents.slice(0, match.index).split("\n").length
      const line = contents.split("\n")[lineNumber - 1]
      if (/[A-Za-z]*AtUtc|cache(Key)?/i.test(line)) continue
      findings.push(`${filePath}:${lineNumber} — DateTime.UtcNow`)
    }
  }
  for (const match of contents.matchAll(/DateOnly\.FromDateTime\s*\(\s*DateTime\.UtcNow/g)) {
    const lineNumber = contents.slice(0, match.index).split("\n").length
    findings.push(`${filePath}:${lineNumber} — DateOnly.FromDateTime(DateTime.UtcNow)`)
  }
  if (findings.length === 0) return null
  return {
    block: true,
    message:
      `Timezone rule violations in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nUser-facing dates MUST use IUserDateService.GetUserTodayAsync(userId) for the user's timezone-aware "today".\n` +
      `DateTime.UtcNow is only acceptable for CreatedAtUtc/UpdatedAtUtc timestamps and cache key generation.\n`,
  }
}

export function checkCsharpFluentConfig(filePath, contents) {
  const n = norm(filePath)
  if (!/\/orbit-api\/src\/Orbit\.Infrastructure\/Persistence\/OrbitDbContext\.cs$/.test(n)) return null
  if (typeof contents !== "string") return null

  const dbSets = new Set([...contents.matchAll(/DbSet<([A-Za-z0-9_]+)>/g)].map((m) => m[1]))
  const configured = new Set([...contents.matchAll(/modelBuilder\.Entity<([A-Za-z0-9_]+)>/g)].map((m) => m[1]))
  const missing = [...dbSets].filter((type) => !configured.has(type))
  if (missing.length === 0) return null

  return {
    block: true,
    message:
      `OrbitDbContext exposes a DbSet<T> without an explicit configuration:\n` +
      missing.map((type) => `  - ${type} → add modelBuilder.Entity<${type}>(entity => { ... }) in OnModelCreating`).join("\n") +
      `\n\nEvery mapped entity is configured explicitly here (keys, indexes, column types) — don't rely on EF convention inference.\n`,
  }
}
