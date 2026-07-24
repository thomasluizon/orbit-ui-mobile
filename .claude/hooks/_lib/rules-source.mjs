// Whole-file invariants: they read the file AFTER the edit lands (Claude Code
// PostToolUse). Pure: each takes (filePath, contents) and returns
// { block, message } or null, and self-scopes by path (no-ops off its surface).

function norm(filePath) {
  return String(filePath || "").replace(/\\/g, "/")
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
