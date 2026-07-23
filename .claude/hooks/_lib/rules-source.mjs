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

// Line numbers of every `throw` keyword that sits at module scope (bracket
// depth 0), skipping strings and comments. Depth-tracked rather than anchored to
// column 0, so an indented or `if (!x) throw ...` guard-clause form still counts
// — the module-eval crash does not care about indentation.
function moduleScopeThrowLines(contents) {
  const lines = []
  let depth = 0
  let line = 1
  let inLineComment = false
  let inBlockComment = false
  let stringChar = null
  for (let i = 0; i < contents.length; i++) {
    const ch = contents[i]
    const next = contents[i + 1]
    if (ch === "\n") {
      line++
      inLineComment = false
      continue
    }
    if (inLineComment) continue
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false
        i++
      }
      continue
    }
    if (stringChar) {
      if (ch === "\\") i++
      else if (ch === stringChar) stringChar = null
      continue
    }
    if (ch === "/" && next === "/") {
      inLineComment = true
      i++
      continue
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      stringChar = ch
      continue
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++
      continue
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      if (depth > 0) depth--
      continue
    }
    if (depth === 0 && contents.startsWith("throw", i) && !/\w/.test(contents[i - 1] || "") && !/\w/.test(contents[i + 5] || "")) {
      lines.push(line)
      i += 4
    }
  }
  return lines
}

export function checkMobileSupabaseLazy(filePath, contents) {
  const n = norm(filePath)
  if (!/\/apps\/mobile\/.*supabase\.ts$/.test(n)) return null
  if (typeof contents !== "string") return null

  const findings = []
  for (const lineNumber of moduleScopeThrowLines(contents)) {
    findings.push(`${filePath}:${lineNumber} — module-scope throw`)
  }
  // A direct top-level assignment `const supabase[: Type] = createClient(` is
  // eager init; the type annotation is optional (that is how the real file
  // declares its state). The lazy `() => createClient(` arrow has `() =>`
  // between the `=` and the call, so it does not match — and stays allowed.
  for (const match of contents.matchAll(/^(?:export\s+)?const\s+\w+\s*(?::\s*[\w.<>[\]|& ]+?\s*)?=\s*createClient\s*\(/gm)) {
    const lineNumber = contents.slice(0, match.index).split("\n").length
    findings.push(`${filePath}:${lineNumber} — top-level createClient() init`)
  }
  if (findings.length === 0) return null
  return {
    block: true,
    message:
      `Mobile Supabase must stay lazy in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nKeep the client lazy behind a getSupabaseClient() accessor — never init or throw at module scope.\n` +
      `A module-eval throw or top-level createClient() runs during the app's first import and crashes to a grey\n` +
      `screen at launch before any error boundary mounts (#172/#174).\n`,
  }
}

export function checkEfMigrationRawIndex(filePath, contents) {
  const n = norm(filePath)
  if (!/\/orbit-api\/.*Migrations\/.*\.cs$/.test(n)) return null
  if (typeof contents !== "string") return null

  const findings = []
  const marker = /migrationBuilder\.Sql\s*\(/g
  let call
  while ((call = marker.exec(contents))) {
    let index = call.index + call[0].length
    let depth = 1
    const start = index
    while (index < contents.length && depth > 0) {
      const ch = contents[index]
      if (ch === "(") depth++
      else if (ch === ")") depth--
      index++
    }
    const sql = contents.slice(start, index - 1)
    const lineNumber = contents.slice(0, call.index).split("\n").length
    // Check each `;`-separated statement on its own — one statement's IF [NOT]
    // EXISTS clause must not mask a sibling statement in the same batched Sql()
    // call that lacks its own.
    for (const statement of sql.split(";")) {
      if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(statement) && !/\bIF\s+NOT\s+EXISTS\b/i.test(statement)) {
        findings.push(`${filePath}:${lineNumber} — raw CREATE INDEX without IF NOT EXISTS`)
      }
      if (/\bDROP\s+INDEX\b/i.test(statement) && !/\bIF\s+EXISTS\b/i.test(statement)) {
        findings.push(`${filePath}:${lineNumber} — raw DROP INDEX without IF EXISTS`)
      }
    }
  }
  if (findings.length === 0) return null
  return {
    block: true,
    message:
      `Non-idempotent raw index SQL in ${filePath}:\n` +
      findings.map((f) => `  - ${f}`).join("\n") +
      `\n\nEF applies migrations at startup on Render; a raw CREATE INDEX for an index that already exists throws\n` +
      `Postgres 42P07 and fails the deploy. Use CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS (mirrors the\n` +
      `Guard-Migrations CI). migrationBuilder.CreateIndex(...) is already idempotent-safe — this only flags raw Sql().\n`,
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
