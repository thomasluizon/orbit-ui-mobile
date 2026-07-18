#!/usr/bin/env node
// The completion oracle for a visual pass. Reads the EXPECTED inventory from
// .claude/manifests/surfaces.json and derives completion ONLY from artifacts on
// disk: a cell counts as verified when its screenshot exists, is big enough to
// not be a blank/error page, and is newer than the source file it depicts.
// Nothing here reads or trusts a status field, because a status field is
// writable by the agent being gated. See .claude/rules/visual-delivery.md.

import { readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const ARTIFACT_DIR = join(REPO_ROOT, ".artifacts", "surfaces")
const MIN_ARTIFACT_BYTES = 5 * 1024

const USAGE = `check-surface-coverage - derive visual-pass completion from artifacts on disk.

Usage:
  node tools/check-surface-coverage.mjs [--json] [--help]

Reads .claude/manifests/surfaces.json (write it with tools/surface-manifest.mjs)
and requires, for every cell, a screenshot at
  .artifacts/surfaces/<surfaceId>--<theme>--<locale>.png
that (1) exists, (2) is larger than ${MIN_ARTIFACT_BYTES} bytes, and (3) has an mtime
newer than its sourceFile's mtime.

Flags:
  --json   emit the machine-readable verdict on stdout
  --help   this text

Exit codes:
  0  every cell verified
  1  at least one cell missing, stale, or undersized
  2  the manifest is absent or unreadable
`

/** Artifact path (repo-relative, POSIX) for one manifest cell. */
export function artifactPathFor(cell) {
  return `.artifacts/surfaces/${cell.surfaceId}--${cell.theme}--${cell.locale}.png`
}

function evaluateCell(cell) {
  const relativePath = artifactPathFor(cell)
  const absolutePath = join(REPO_ROOT, relativePath)

  let artifactStat
  try {
    artifactStat = statSync(absolutePath)
  } catch {
    return { ...cell, artifact: relativePath, ok: false, reason: "missing", detail: "no screenshot on disk" }
  }

  if (artifactStat.size <= MIN_ARTIFACT_BYTES) {
    return {
      ...cell,
      artifact: relativePath,
      ok: false,
      reason: "undersized",
      detail: `${artifactStat.size} bytes <= ${MIN_ARTIFACT_BYTES} (blank or error page)`,
    }
  }

  let sourceStat
  try {
    sourceStat = statSync(join(REPO_ROOT, cell.sourceFile))
  } catch {
    return { ...cell, artifact: relativePath, ok: false, reason: "orphaned", detail: `sourceFile ${cell.sourceFile} is gone` }
  }

  if (artifactStat.mtimeMs < sourceStat.mtimeMs) {
    return {
      ...cell,
      artifact: relativePath,
      ok: false,
      reason: "stale",
      detail: `screenshot predates ${cell.sourceFile}`,
    }
  }

  return { ...cell, artifact: relativePath, ok: true, reason: null, detail: null }
}

/** Full verdict for a manifest: per-cell results plus the derived counts. */
export function evaluateManifest(manifest) {
  const results = manifest.cells.map(evaluateCell)
  const failures = results.filter((result) => !result.ok)
  return {
    generatedFrom: manifest.generatedFrom,
    total: results.length,
    verified: results.length - failures.length,
    complete: failures.length === 0,
    failures,
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  const asJson = args.includes("--json")

  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch (error) {
    const message = `check-surface-coverage: cannot read .claude/manifests/surfaces.json (${error.message}). Run: npm run surfaces:manifest\n`
    if (asJson) process.stdout.write(JSON.stringify({ error: message.trim() }) + "\n")
    else process.stderr.write(message)
    return 2
  }

  const verdict = evaluateManifest(manifest)

  if (asJson) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n")
    return verdict.complete ? 0 : 1
  }

  process.stdout.write(`${verdict.verified}/${verdict.total} cells verified (manifest @ ${verdict.generatedFrom})\n`)
  process.stdout.write(`artifact root: ${ARTIFACT_DIR.split("\\").join("/")}\n`)

  if (verdict.complete) {
    process.stdout.write("all surfaces have a fresh, non-blank screenshot in both themes and both locales.\n")
    return 0
  }

  const byReason = verdict.failures.reduce((acc, failure) => {
    acc[failure.reason] = (acc[failure.reason] ?? 0) + 1
    return acc
  }, {})

  process.stdout.write(`\nSHORTFALL: ${verdict.failures.length} cell(s) unverified`)
  process.stdout.write(` (${Object.entries(byReason).sort().map(([reason, count]) => `${reason}: ${count}`).join(", ")})\n\n`)

  for (const failure of verdict.failures) {
    process.stdout.write(`  [${failure.reason}] ${failure.artifact}\n`)
    process.stdout.write(`      surface ${failure.surfaceId} (${failure.kind}) <- ${failure.sourceFile}\n`)
    process.stdout.write(`      ${failure.detail}\n`)
  }

  process.stderr.write(`check-surface-coverage: ${verdict.failures.length}/${verdict.total} cells unverified\n`)
  return 1
}

/** The manifest this oracle reads, or null when it is absent/unreadable. */
export function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch {
    return null
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
