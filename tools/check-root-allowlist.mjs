#!/usr/bin/env node
/**
 * Gate repository-root files by location, not by guessed filename patterns.
 *
 * The allowlist is deliberately a closed set: every unlisted root file fails regardless of its
 * name, extension, or leading dot. Adding a legitimate root file therefore requires a visible
 * data change instead of another pattern that only recognizes shapes already seen.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-root-allowlist.mjs

  Fails when the repository root contains a file not named in root-allowlist.json.
  Directories are outside this gate. The .git worktree pointer is always ignored.

  --help, -h  print this usage and exit 0

exit codes: 0 every root file is declared, 1 undeclared root files exist, 2 usage or configuration error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

if (process.argv.length > 2) {
  console.error(`check-root-allowlist: takes no arguments, got: ${process.argv.slice(2).join(" ")}\n`)
  console.error(USAGE)
  process.exit(2)
}

const toolsDirectory = dirname(fileURLToPath(import.meta.url))
const allowlistPath = join(toolsDirectory, "root-allowlist.json")
const repositoryRoot = resolve(toolsDirectory, "..")

let allowedNames
try {
  allowedNames = JSON.parse(readFileSync(allowlistPath, "utf8"))
} catch (error) {
  console.error(`check-root-allowlist: cannot read ${allowlistPath}: ${error.message}`)
  process.exit(2)
}

if (
  !Array.isArray(allowedNames) ||
  allowedNames.some((name) => typeof name !== "string" || name.length === 0) ||
  new Set(allowedNames).size !== allowedNames.length
) {
  console.error("check-root-allowlist: root-allowlist.json must be an array of unique, non-empty filenames")
  process.exit(2)
}

const allowed = new Set(allowedNames)
const undeclared = readdirSync(repositoryRoot, { withFileTypes: true })
  .filter((entry) => entry.name !== ".git" && !entry.isDirectory() && !allowed.has(entry.name))
  .map((entry) => entry.name)
  .sort()

if (undeclared.length > 0) {
  console.error("Root allowlist violation: declare or remove these repository-root files:")
  for (const name of undeclared) console.error(`  ${name}`)
  process.exit(1)
}
