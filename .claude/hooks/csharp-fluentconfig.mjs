#!/usr/bin/env node
// PostToolUse hook: when OrbitDbContext gains a DbSet<T>, require an explicit
// modelBuilder.Entity<T>(...) block in OnModelCreating. This repo's convention
// is that every mapped entity is configured explicitly (keys, indexes, column
// types), not left to EF convention inference.
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
  if (!/\/orbit-api\/src\/Orbit\.Infrastructure\/Persistence\/OrbitDbContext\.cs$/.test(normalized)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const dbSets = new Set([...contents.matchAll(/DbSet<([A-Za-z0-9_]+)>/g)].map((match) => match[1]))
  const configured = new Set([...contents.matchAll(/modelBuilder\.Entity<([A-Za-z0-9_]+)>/g)].map((match) => match[1]))

  const missing = [...dbSets].filter((type) => !configured.has(type))
  if (missing.length === 0) process.exit(0)

  process.stderr.write(
    `OrbitDbContext exposes a DbSet<T> without an explicit configuration:\n` +
      missing.map((type) => `  - ${type} → add modelBuilder.Entity<${type}>(entity => { ... }) in OnModelCreating`).join("\n") +
      `\n\nEvery mapped entity is configured explicitly here (keys, indexes, column types) — don't rely on EF convention inference.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
