#!/usr/bin/env node
// The completion oracle for a visual pass. Reads the EXPECTED inventory from
// .claude/manifests/surfaces.json and derives completion ONLY from evidence on
// disk, two stages per cell:
//   1. artifact: the screenshot exists, is big enough to not be a blank/error
//      page, and is newer than the source file it depicts;
//   2. verdict: an INDEPENDENT vision judge (tools/judge-surfaces.mjs) marked
//      the surface "transformed", and the hash it recorded still matches the
//      PNG bytes on disk (a re-capture invalidates the old verdict).
// Stage 2 exists because stage 1 alone measures camera coverage, not design
// change - a fresh screenshot of an untouched page passed it, which is how a
// "done" claim survived with 5% of the work delivered (#539 post-mortem,
// .claude/rules/visual-delivery.md). Nothing here reads or trusts a status
// field an agent could write; verdicts.json is written only by the judge tool
// (enforced by the forbid-gate-tamper hook) and is hash-bound.

import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const ARTIFACT_DIR = join(REPO_ROOT, ".artifacts", "surfaces")
const VERDICTS_PATH = join(ARTIFACT_DIR, "verdicts.json")
const MIN_ARTIFACT_BYTES = 5 * 1024

const USAGE = `check-surface-coverage - derive visual-pass completion from evidence on disk.

Usage:
  node tools/check-surface-coverage.mjs [--json] [--filter <substring>] [--help]

Reads .claude/manifests/surfaces.json (write it with tools/surface-manifest.mjs)
and requires, for every cell:
  1. a screenshot at .artifacts/surfaces/<surfaceId>--<theme>--<locale>.png
     that exists, is larger than ${MIN_ARTIFACT_BYTES} bytes, and is newer than its
     sourceFile's mtime;
  2. an independent judge verdict (npm run surfaces:judge) of "transformed" for
     the surface, whose recorded sha256 for that cell matches the PNG on disk.

Flags:
  --json     emit the machine-readable verdict on stdout
  --filter   evaluate only cells whose surfaceId contains this substring
  --help     this text

Exit codes:
  0  every cell in scope verified
  1  at least one cell missing, stale, undersized, unjudged, or judge-rejected
  2  the manifest is absent or unreadable
`

/** Artifact path (repo-relative, POSIX) for one manifest cell. */
export function artifactPathFor(cell) {
  return `.artifacts/surfaces/${cell.surfaceId}--${cell.theme}--${cell.locale}.png`
}

function evaluateCell(cell, verdicts) {
  const relativePath = artifactPathFor(cell)
  const absolutePath = join(REPO_ROOT, relativePath)
  const artifactName = `${cell.surfaceId}--${cell.theme}--${cell.locale}.png`

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

  const surfaceVerdict = verdicts?.surfaces?.[cell.surfaceId]
  const recordedHash = surfaceVerdict?.judgedCells?.[artifactName]
  if (!surfaceVerdict || !recordedHash) {
    return {
      ...cell,
      artifact: relativePath,
      ok: false,
      reason: "unjudged",
      detail: "no independent judge verdict for this cell - run: npm run surfaces:judge",
    }
  }

  if (surfaceVerdict.status !== "transformed") {
    const firstFinding = surfaceVerdict.findings?.[0]?.issue
    return {
      ...cell,
      artifact: relativePath,
      ok: false,
      reason: "judge-rejected",
      detail: `judge verdict "${surfaceVerdict.status}"${firstFinding ? `: ${firstFinding}` : ""}`,
    }
  }

  const currentHash = createHash("sha256").update(readFileSync(absolutePath)).digest("hex")
  if (currentHash !== recordedHash) {
    return {
      ...cell,
      artifact: relativePath,
      ok: false,
      reason: "verdict-stale",
      detail: "screenshot changed since it was judged - re-run: npm run surfaces:judge",
    }
  }

  return { ...cell, artifact: relativePath, ok: true, reason: null, detail: null }
}

/** Full verdict for a manifest: per-cell results plus the derived counts. */
export function evaluateManifest(manifest, verdicts = loadVerdicts()) {
  const results = manifest.cells.map((cell) => evaluateCell(cell, verdicts))
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
  const filterIndex = args.indexOf("--filter")
  const filter = filterIndex !== -1 ? args[filterIndex + 1] : null

  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch (error) {
    const message = `check-surface-coverage: cannot read .claude/manifests/surfaces.json (${error.message}). Run: npm run surfaces:manifest\n`
    if (asJson) process.stdout.write(JSON.stringify({ error: message.trim() }) + "\n")
    else process.stderr.write(message)
    return 2
  }

  if (filter) {
    manifest = { ...manifest, cells: manifest.cells.filter((cell) => cell.surfaceId.includes(filter)) }
  }

  const verdict = evaluateManifest(manifest)

  if (asJson) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n")
    return verdict.complete ? 0 : 1
  }

  process.stdout.write(
    `${verdict.verified}/${verdict.total} cells verified${filter ? ` (FILTERED: "${filter}")` : ""} (manifest @ ${verdict.generatedFrom})\n`,
  )
  process.stdout.write(`artifact root: ${ARTIFACT_DIR.split("\\").join("/")}\n`)

  if (verdict.complete) {
    process.stdout.write("every cell in scope has a fresh screenshot AND an independent \"transformed\" judge verdict.\n")
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

/** The judge-verdict store, or null when absent/unreadable (= everything unjudged). */
export function loadVerdicts() {
  try {
    return JSON.parse(readFileSync(VERDICTS_PATH, "utf8"))
  } catch {
    return null
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
