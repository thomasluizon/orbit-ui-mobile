#!/usr/bin/env node
// PostToolUse hook: when an EF migration is edited that adds a new table /
// DbSet<>, verify there's a matching FluentConfig in Persistence/Configurations/.
// Any unexpected error exits 0 so the hook never surfaces as a crash.

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"

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
  if (!/\/orbit-api\/src\/Orbit\.Infrastructure\/Migrations\/.*\.cs$/.test(normalized)) process.exit(0)
  if (/\.Designer\.cs$/.test(normalized)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const createTablePattern = /migrationBuilder\.CreateTable\s*\(\s*name:\s*"([^"]+)"/g
  const newTables = []
  for (const match of contents.matchAll(createTablePattern)) {
    newTables.push(match[1])
  }

  if (newTables.length === 0) process.exit(0)

  const migrationsDir = dirname(filePath)
  const infraDir = dirname(migrationsDir)
  const configurationsDir = join(infraDir, "Persistence", "Configurations")
  if (!existsSync(configurationsDir)) process.exit(0)

  let configFiles
  try {
    configFiles = readdirSync(configurationsDir).filter((f) => /\.cs$/.test(f))
  } catch {
    process.exit(0)
  }

  const missing = []
  for (const table of newTables) {
    const entityGuess = table.replace(/s$/, "")
    const hasConfig = configFiles.some((f) =>
      new RegExp(`(${table}|${entityGuess})Configuration\\.cs$`, "i").test(f),
    )
    if (!hasConfig) missing.push(table)
  }

  if (missing.length === 0) process.exit(0)

  process.stderr.write(
    `Migration ${filePath} adds tables without a matching FluentConfig:\n` +
      missing.map((t) => `  - ${t} → expected Persistence/Configurations/${t.replace(/s$/, "")}Configuration.cs`).join("\n") +
      `\n\nEF will infer the schema if no FluentConfig exists. Add IEntityTypeConfiguration<T> for every new entity.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
