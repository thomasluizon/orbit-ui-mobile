#!/usr/bin/env node
/**
 * Gate repository-root entries by location, not by guessed filename patterns.
 *
 * The allowlist is deliberately a closed set: every unlisted root file AND every unlisted root
 * directory fails regardless of its name, extension, or leading dot. Adding a legitimate root entry
 * therefore requires a visible data change instead of another pattern that only recognizes shapes
 * already seen.
 *
 * Both halves are closed on purpose. Gating files alone left the same scratch one level down, so
 * `.artifacts/transcript.mjs` walked past a gate written to stop exactly that.
 *
 * Three classes of declared entry are not committed content and are declared anyway, because they
 * legitimately appear on a real checkout and a gate that fires on them would block every commit:
 *   - generated directories (`node_modules`, `.turbo`), observed after an install and a test run
 *   - local environment files (`.env`, `.env.local`), which `.gitignore` already blesses at the root
 *   - runtime state written by a tool that runs here (`.orca`, `.lighthouseci`, `.maestro`)
 * Any further local variant (`.env.production.local`) is a deliberate one-line addition here. That
 * friction is the feature: a new root entry is a real architectural addition and should not be silent.
 *
 * Declaring the third class is why this gate does NOT filter the root listing through
 * `git check-ignore` (thomasluizon/orbit-tickets#256). Every scratch entry the closed set exists to
 * catch is gitignored too: `.tmp-extract.mjs` and `.agent-scratch-extract.mjs` both match a
 * `.gitignore` pattern, so skipping ignored entries would delete the gate's own reason to exist.
 * A tool's runtime directory earns an allowlist line, not an exemption class nobody can see.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-root-allowlist.mjs [--changed-files-file <path>]

  Fails when the repository root contains a file or directory not named in root-allowlist.json.
  The .git worktree pointer is always ignored.

  --changed-files-file <path>  NUL-delimited pull request paths; skip when no root entry can change
  --help, -h                   print this usage and exit 0

exit codes: 0 every root entry is declared, 1 undeclared root entries exist, 2 usage or configuration error`

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE)
    process.exit(0)
  }
  if (argv.length === 0) return null
  if (argv.length === 2 && argv[0] === "--changed-files-file" && argv[1] && !argv[1].startsWith("-")) {
    return resolve(argv[1])
  }
  throw new Error(`expected --changed-files-file <path>, got: ${argv.join(" ")}`)
}

let changedFilesPath
try {
  changedFilesPath = parseArguments(process.argv.slice(2))
} catch (error) {
  console.error(`check-root-allowlist: ${error.message}\n`)
  console.error(USAGE)
  process.exit(2)
}

const toolsDirectory = dirname(fileURLToPath(import.meta.url))
const allowlistPath = join(toolsDirectory, "root-allowlist.json")
const repositoryRoot = resolve(toolsDirectory, "..")

let allowlist
try {
  allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"))
} catch (error) {
  console.error(`check-root-allowlist: cannot read ${allowlistPath}: ${error.message}`)
  process.exit(2)
}

const isNameList = (value) =>
  Array.isArray(value) &&
  value.every((name) => typeof name === "string" && name.length > 0) &&
  new Set(value).size === value.length

if (allowlist === null || typeof allowlist !== "object" || !isNameList(allowlist.files) || !isNameList(allowlist.directories)) {
  console.error(
    "check-root-allowlist: root-allowlist.json must be an object with `files` and `directories`, each an array of unique, non-empty names",
  )
  process.exit(2)
}

const allowedFiles = new Set(allowlist.files)
const allowedDirectories = new Set(allowlist.directories)

if (changedFilesPath) {
  let changedPaths
  try {
    changedPaths = readFileSync(changedFilesPath, "utf8").split("\0").filter(Boolean)
  } catch (error) {
    console.error(`check-root-allowlist: cannot read ${changedFilesPath}: ${error.message}`)
    process.exit(2)
  }
  const ownInputs = new Set(["tools/check-root-allowlist.mjs", "tools/root-allowlist.json"])
  const canChangeRoot = changedPaths.some((path) => {
    if (ownInputs.has(path)) return true
    const segments = path.split("/")
    return segments.length === 1 ? !allowedFiles.has(segments[0]) : !allowedDirectories.has(segments[0])
  })
  if (!canChangeRoot) {
    console.log("Root allowlist skipped: no changed path can alter a declared root entry.")
    process.exit(0)
  }
}

const undeclared = readdirSync(repositoryRoot, { withFileTypes: true })
  .filter((entry) => entry.name !== ".git")
  .filter((entry) => (entry.isDirectory() ? !allowedDirectories.has(entry.name) : !allowedFiles.has(entry.name)))
  .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  .sort()

if (undeclared.length > 0) {
  console.error("Root allowlist violation: declare or remove these repository-root entries:")
  for (const name of undeclared) console.error(`  ${name}`)
  process.exit(1)
}
