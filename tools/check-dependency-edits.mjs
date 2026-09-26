#!/usr/bin/env node

import { readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-dependency-edits.mjs [--root <path>] [--tolerance-seconds <n>]

  Walks every node_modules tree under <root> and fails on any file whose mtime is later than
  its own package's earliest file. That is a write that did not come from the install.

  --root <path>              tree to scan (defaults to the parent of this tool's directory)
  --tolerance-seconds <n>    how much later than the earliest file is still extraction (default 300)
  --help, -h                 print this usage and exit 0

  Repair what it finds with: rm -rf node_modules/<package> && npm install
  A plain npm install leaves a complete package alone and will not repair it.

exit codes: 0 no file was written after its install, 1 at least one was, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const DEFAULT_TOLERANCE_SECONDS = 300
/** A long listing is not a report. The count is always exact; the listing is bounded. */
const MAXIMUM_LISTED_FINDINGS = 50

let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
let toleranceSeconds = DEFAULT_TOLERANCE_SECONDS

const refuseArguments = () => {
  console.error(`check-dependency-edits: invalid arguments: ${process.argv.slice(2).join(" ")}\n`)
  console.error(USAGE)
  process.exit(2)
}

const argumentsToParse = process.argv.slice(2)
while (argumentsToParse.length > 0) {
  const argument = argumentsToParse.shift()
  if (argumentsToParse.length === 0) refuseArguments()
  if (argument === "--root") {
    repositoryRoot = resolve(argumentsToParse.shift())
    continue
  }
  if (argument === "--tolerance-seconds") {
    toleranceSeconds = Number(argumentsToParse.shift())
    if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) refuseArguments()
    continue
  }
  refuseArguments()
}

const findings = []
let packagesScanned = 0
let filesScanned = 0

const readEntries = (directory) => {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Every file the package itself owns, with its mtime. A nested tree is a separate package. */
function collectPackageFiles(directory, collected) {
  for (const entry of readEntries(directory)) {
    const path = join(directory, entry.name)
    /**
     * A workspace is linked into node_modules rather than copied (`node_modules/@orbit/shared`),
     * so following a link would walk the repository's own source and report every file edited
     * since the install. A link is never extracted content.
     */
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") scanInstalledTree(path)
      else collectPackageFiles(path, collected)
      continue
    }
    if (!entry.isFile()) continue
    filesScanned += 1
    try {
      collected.push({ path, modifiedAtMs: statSync(path).mtimeMs })
    } catch {
      /* a file that cannot be stated carries no mtime evidence either way */
    }
  }
}

function scanPackage(packageDirectory, packageName) {
  try {
    statSync(join(packageDirectory, "package.json"))
  } catch {
    /** No package.json means this directory is not an installed package, so it is not judged. */
    return
  }
  packagesScanned += 1
  const collected = []
  collectPackageFiles(packageDirectory, collected)
  if (collected.length === 0) return
  let extractedAtMs = collected[0].modifiedAtMs
  for (const file of collected) if (file.modifiedAtMs < extractedAtMs) extractedAtMs = file.modifiedAtMs
  for (const file of collected) {
    if (file.modifiedAtMs > extractedAtMs + toleranceSeconds * 1000) {
      findings.push({ path: file.path, packageName, lateSeconds: Math.round((file.modifiedAtMs - extractedAtMs) / 1000) })
    }
  }
}

function scanInstalledTree(nodeModulesDirectory) {
  for (const entry of readEntries(nodeModulesDirectory)) {
    /** `.bin`, `.cache` and `.package-lock.json` are npm's own bookkeeping, not package content. */
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue
    const path = join(nodeModulesDirectory, entry.name)
    if (!entry.name.startsWith("@")) {
      scanPackage(path, entry.name)
      continue
    }
    for (const scoped of readEntries(path)) {
      if (!scoped.isDirectory() || scoped.isSymbolicLink()) continue
      scanPackage(join(path, scoped.name), `${entry.name}/${scoped.name}`)
    }
  }
}

function findInstalledTrees(directory) {
  for (const entry of readEntries(directory)) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === ".git") continue
    const path = join(directory, entry.name)
    if (entry.name === "node_modules") scanInstalledTree(path)
    else findInstalledTrees(path)
  }
}

const startedAtMs = Date.now()
findInstalledTrees(repositoryRoot)
const elapsedSeconds = ((Date.now() - startedAtMs) / 1000).toFixed(1)
const relativePath = (path) => relative(repositoryRoot, path).split(sep).join("/")

console.log(
  `Scanned ${packagesScanned} packages and ${filesScanned} files in ${elapsedSeconds}s, tolerance ${toleranceSeconds}s.`,
)

if (findings.length === 0) {
  if (packagesScanned === 0) console.log("No installed dependency tree under this root. Nothing was checked.")
  else console.log("Every file matches its own package's extraction. No dependency was edited in place.")
  process.exit(0)
}

const editedPackages = [...new Set(findings.map((finding) => finding.packageName))].sort()
console.error(`\n${findings.length} file(s) in ${editedPackages.length} package(s) were written after their install:`)
for (const finding of findings.slice(0, MAXIMUM_LISTED_FINDINGS)) {
  console.error(`  ${relativePath(finding.path)}  (+${finding.lateSeconds}s after its package.json)`)
}
if (findings.length > MAXIMUM_LISTED_FINDINGS) {
  console.error(`  ... and ${findings.length - MAXIMUM_LISTED_FINDINGS} more`)
}
console.error("\nRepair each package, then read it again before citing it:")
for (const packageName of editedPackages.slice(0, MAXIMUM_LISTED_FINDINGS)) {
  console.error(`  rm -rf node_modules/${packageName} && npm install`)
}
console.error("\nA plain npm install leaves a complete package alone and will not repair this.")
process.exit(1)
