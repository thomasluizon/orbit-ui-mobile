#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-dependency-edits.mjs [--root <path>] [--tolerance-seconds <n>]

  Walks installed node_modules trees under <root> for files later than their package's extraction.
  For a flagged package, compares all regular files with its integrity-verified locked archive.
  Matching contents pass regardless of extraction duration; modified, missing or extra files fail.
  Without a locked archive, the timestamp finding remains. Unverifiable locked archives fail.
  Archives are read from file: paths or fetched over HTTPS with a 30 second timeout.
  Generated .next/standalone copies are excluded, including roots inside that output.

  --root <path>              tree to scan (defaults to the parent of this tool's directory)
  --tolerance-seconds <n>    how much later than the earliest file is still extraction (default 300)
  --help, -h                 print this usage and exit 0

  Repair what it finds with: rm -rf '<affected package path>' && npm install
  Run the reinstall in the project that owns the affected dependency tree.
  A plain npm install leaves a complete package alone and will not repair it.

exit codes: 0 no dependency edits found, 1 edits or unverifiable flagged packages, 2 usage error`

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
const flaggedPackages = []
const lockfiles = new Map()
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
function collectPackageFiles(directory, collected, installed = true) {
  for (const entry of readEntries(directory)) {
    const path = join(directory, entry.name)
    /**
     * A workspace is linked into node_modules rather than copied (`node_modules/@orbit/shared`),
     * so following a link would walk the repository's own source and report every file edited
     * since the install. A link is never extracted content.
     */
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        if (installed) scanInstalledTree(path)
      } else collectPackageFiles(path, collected, installed)
      continue
    }
    if (!entry.isFile()) continue
    if (installed) filesScanned += 1
    try {
      collected.push({ path, modifiedAtMs: statSync(path).mtimeMs })
    } catch {
      /* a file that cannot be stated carries no mtime evidence either way */
    }
  }
}

function scanPackage(packageDirectory) {
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
  const lateFiles = collected.filter((file) => file.modifiedAtMs > extractedAtMs + toleranceSeconds * 1000)
  if (lateFiles.length > 0) flaggedPackages.push({ packageDirectory, collected, lateFiles, extractedAtMs })
}

function findLockedArchive(packageDirectory) {
  for (let directory = dirname(packageDirectory); ; directory = dirname(directory)) {
    const lockPath = join(directory, "package-lock.json")
    if (existsSync(lockPath)) {
      if (!lockfiles.has(lockPath)) lockfiles.set(lockPath, JSON.parse(readFileSync(lockPath, "utf8")))
      const packagePath = relative(directory, packageDirectory).split(sep).join("/")
      const locked = lockfiles.get(lockPath).packages?.[packagePath]
      if (locked?.resolved && locked.integrity) return { directory, ...locked }
    }
    if (dirname(directory) === directory) return null
  }
}

async function readLockedArchive(locked) {
  let archive
  if (locked.resolved.startsWith("file:")) {
    archive = readFileSync(resolve(locked.directory, locked.resolved.slice(5)))
  } else {
    if (!locked.resolved.startsWith("https://")) throw new Error("locked archive must use HTTPS or file:")
    const response = await fetch(locked.resolved, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`locked archive request failed (${response.status})`)
    archive = Buffer.from(await response.arrayBuffer())
  }
  const hashes = locked.integrity.split(/\s+/).map((hash) => hash.split("-"))
  const algorithm = ["sha512", "sha384", "sha256", "sha1"].find((name) => hashes.some(([kind]) => kind === name))
  if (!algorithm) throw new Error("locked archive has no supported integrity hash")
  const digest = createHash(algorithm).update(archive).digest("base64")
  if (!hashes.some(([kind, expected]) => kind === algorithm && expected === digest)) {
    throw new Error("locked archive integrity mismatch")
  }
  return archive
}

async function compareLockedPackage(packageDirectory, collected, locked) {
  const archive = await readLockedArchive(locked)
  const scratch = mkdtempSync(join(tmpdir(), "dependency-archive-"))
  try {
    const archivePath = join(scratch, "package.tgz")
    writeFileSync(archivePath, archive)
    /** Reuse the archive reader shipped with the existing web dependency. */
    const tar = createRequire(import.meta.url)("next/dist/compiled/tar")
    await tar.x({ file: archivePath, cwd: scratch, strict: true })
    const expected = []
    collectPackageFiles(join(scratch, "package"), expected, false)
    if (expected.length === 0) throw new Error("locked archive contains no regular package files")
    const installed = new Set(collected.map((file) => relative(packageDirectory, file.path)))
    const differences = []
    for (const file of expected) {
      const name = relative(join(scratch, "package"), file.path)
      const path = join(packageDirectory, name)
      if (!installed.delete(name)) differences.push({ path, packageDirectory, reason: "missing" })
      else if (!readFileSync(path).equals(readFileSync(file.path))) differences.push({ path, packageDirectory, reason: "modified" })
    }
    for (const name of installed) differences.push({ path: join(packageDirectory, name), packageDirectory, reason: "extra" })
    return differences
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

async function checkFlaggedPackage({ packageDirectory, collected, lateFiles, extractedAtMs }) {
  try {
    const locked = findLockedArchive(packageDirectory)
    if (locked) {
      findings.push(...await compareLockedPackage(packageDirectory, collected, locked))
      return
    }
  } catch (error) {
    findings.push({ path: packageDirectory, packageDirectory, reason: `could not verify locked archive: ${error.message}` })
    return
  }
  for (const file of lateFiles) {
    findings.push({ path: file.path, packageDirectory, lateSeconds: Math.round((file.modifiedAtMs - extractedAtMs) / 1000) })
  }
}

function scanInstalledTree(nodeModulesDirectory) {
  for (const entry of readEntries(nodeModulesDirectory)) {
    /** `.bin`, `.cache` and `.package-lock.json` are npm's own bookkeeping, not package content. */
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue
    const path = join(nodeModulesDirectory, entry.name)
    if (!entry.name.startsWith("@")) {
      scanPackage(path)
      continue
    }
    for (const scoped of readEntries(path)) {
      if (!scoped.isDirectory() || scoped.isSymbolicLink()) continue
      scanPackage(join(path, scoped.name))
    }
  }
}

function findInstalledTrees(directory) {
  /** Standalone output copies traced files; their mtimes do not describe an npm extraction. */
  const segments = directory.split(sep)
  if (segments.some((segment, index) => segment === ".next" && segments[index + 1] === "standalone")) return
  for (const entry of readEntries(directory)) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === ".git") continue
    const path = join(directory, entry.name)
    if (entry.name === "node_modules") scanInstalledTree(path)
    else findInstalledTrees(path)
  }
}

const startedAtMs = Date.now()
findInstalledTrees(repositoryRoot)
for (const flagged of flaggedPackages) await checkFlaggedPackage(flagged)
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

const editedPackages = [...new Set(findings.map((finding) => finding.packageDirectory))].sort()
console.error(`\n${findings.length} file(s) in ${editedPackages.length} package(s) failed dependency verification:`)
for (const finding of findings.slice(0, MAXIMUM_LISTED_FINDINGS)) {
  if (finding.reason) console.error(`  ${finding.reason}: ${relativePath(finding.path)}`)
  else console.error(`  ${relativePath(finding.path)}  (+${finding.lateSeconds}s after its package's earliest file)`)
}
if (findings.length > MAXIMUM_LISTED_FINDINGS) {
  console.error(`  ... and ${findings.length - MAXIMUM_LISTED_FINDINGS} more`)
}
console.error("\nRepair each package, then read it again before citing it:")
for (const packageDirectory of editedPackages.slice(0, MAXIMUM_LISTED_FINDINGS)) {
  const quotedDirectory = `'${packageDirectory.split(sep).join("/").replaceAll("'", "'\\''")}'`
  console.error(`  rm -rf ${quotedDirectory} && npm install`)
}
console.error("\nRun the reinstall in the project that owns the affected dependency tree.")
console.error("\nA plain npm install leaves a complete package alone and will not repair this.")
process.exit(1)
