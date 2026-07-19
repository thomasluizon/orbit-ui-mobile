#!/usr/bin/env node
// The independent vision judge for a visual pass: the "positive check" the
// subtractive gates cannot be (.claude/rules/visual-delivery.md). Spawns fresh,
// read-only `claude -p` judges over the ACTUAL captured screenshots in
// .artifacts/surfaces/ and records a per-surface verdict in
// .artifacts/surfaces/verdicts.json, hash-bound to the exact PNG bytes judged.
// tools/check-surface-coverage.mjs then counts a cell verified ONLY when its
// surface's verdict is "transformed" AND the recorded hash still matches the
// file on disk - so a re-captured screenshot silently invalidates its old
// verdict and must be re-judged.
//
// The judge never trusts the implementer: it is a separate model process with a
// clean context that reads DESIGN.md and the pixels, nothing else. This tool is
// the ONLY sanctioned writer of verdicts.json (enforced by the
// forbid-gate-tamper hook); it computes the hashes itself rather than trusting
// judge output. Env-taint stripping mirrors .claude/skills/drive/run.mjs so the
// nested `claude -p` works from inside any session (anthropics/claude-code#26190).

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const ARTIFACT_DIR = join(REPO_ROOT, ".artifacts", "surfaces")
const VERDICTS_PATH = join(ARTIFACT_DIR, "verdicts.json")
const DESIGN_MD = join(REPO_ROOT, "DESIGN.md")
const DEFECTS_SPEC = join(REPO_ROOT, ".claude", "specs", "issue-539-user-found-defects.md")

const STATUSES = ["transformed", "partial", "default", "broken", "no-artifact"]

const TAINTED_ENV = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY",
]

const USAGE = `judge-surfaces - independent vision judge over captured surface screenshots.

Usage:
  node tools/judge-surfaces.mjs [--filter <substring>] [--model <model>]
                                [--batch <n>] [--timeout-min <n>] [--help]

For each manifest surface with at least one screenshot on disk, spawns a fresh
read-only \`claude -p\` judge that Reads the PNGs and DESIGN.md and returns a
verdict per surface: ${STATUSES.join(" | ")}.
Verdicts land in .artifacts/surfaces/verdicts.json, each cell hash-bound to the
exact PNG bytes judged. tools/check-surface-coverage.mjs requires a
"transformed" verdict with a matching hash before a cell counts as verified.

Flags:
  --filter       only judge surfaces whose surfaceId contains this substring
  --model        judge model (default: sonnet)
  --batch        surfaces per judge process (default: 5)
  --timeout-min  per-judge timeout in minutes (default: 15)
  --help         this text

Exit codes:
  0  every in-scope surface with artifacts received a verdict
  1  at least one judge call failed or returned no usable verdict
  2  preconditions missing (manifest absent, claude CLI not runnable)
`

function parseArgs(argv) {
  const out = { filter: null, model: "sonnet", batch: 5, timeoutMin: 15, help: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--filter" && argv[i + 1]) out.filter = argv[++i]
    else if (argv[i] === "--model" && argv[i + 1]) out.model = argv[++i]
    else if (argv[i] === "--batch" && argv[i + 1]) out.batch = Math.max(1, Number(argv[++i]) || 5)
    else if (argv[i] === "--timeout-min" && argv[i + 1]) out.timeoutMin = Math.max(1, Number(argv[++i]) || 15)
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true
  }
  return out
}

function childEnv() {
  const env = { ...process.env }
  for (const key of TAINTED_ENV) delete env[key]
  return env
}

function sha256File(absolutePath) {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex")
}

/** Group manifest cells into surfaces with the artifact files that exist on disk. */
function collectSurfaces(manifest, filter) {
  const bySurface = new Map()
  for (const cell of manifest.cells) {
    if (filter && !cell.surfaceId.includes(filter)) continue
    const artifactName = `${cell.surfaceId}--${cell.theme}--${cell.locale}.png`
    const absolutePath = join(ARTIFACT_DIR, artifactName)
    if (!bySurface.has(cell.surfaceId)) {
      bySurface.set(cell.surfaceId, { surfaceId: cell.surfaceId, sourceFile: cell.sourceFile, artifacts: [], missing: [] })
    }
    const surface = bySurface.get(cell.surfaceId)
    if (existsSync(absolutePath)) surface.artifacts.push({ name: artifactName, path: absolutePath })
    else surface.missing.push(artifactName)
  }
  return [...bySurface.values()]
}

function judgePrompt(surfaces) {
  const surfaceLines = surfaces
    .map((surface) => {
      const files = surface.artifacts.map((artifact) => `    ${artifact.path}`).join("\n")
      return `- ${surface.surfaceId} (source: ${surface.sourceFile})\n${files}${surface.missing.length ? `\n    (missing cells, do not judge: ${surface.missing.join(", ")})` : ""}`
    })
    .join("\n")

  const defectsLine = existsSync(DEFECTS_SPEC)
    ? `Also read ${DEFECTS_SPEC} - it lists known user-found defects; a surface exhibiting one can never be "transformed".\n`
    : ""

  return `You are an ADVERSARIAL visual-completeness judge for Orbit's whole-app redesign (#539).
Your ONLY job is to FALSIFY the claim that these surfaces are done. You did not write this
code; do not be charitable; a false "transformed" verdict recreates the exact failure this
gate exists to stop.

FIRST read ${DESIGN_MD} in full - it is the spec you judge against (de-decorated navy-violet,
semantic tokens, no decorative glow, no gradient wash, tonal panels, enumerated spacing scale,
restrained accent usage).
${defectsLine}
Then, for EACH surface below, use the Read tool on EVERY screenshot path listed (Read renders
PNGs visually) and judge the rendered pixels:
${surfaceLines}

Verdict per surface (judge across all its screenshots together):
- "no-artifact": a listed screenshot fails to open, or shows a login/redirect/blank screen
  instead of the real surface. A surface you cannot see is UNKNOWN, never a pass.
- "broken": something visibly wrong - overflow, clipped or wrapping labels, misaligned
  indentation, double focus rings, English text in a pt-BR cell, raw identifiers, or the
  data is trivially empty/unseeded where the fixture should show real habit families,
  gamification numbers, and calendar occurrences.
- "default": still default/pre-redesign styling - opaque card-on-card, borders as borders,
  off-token colors, decorative glow or gradient, stretched full-bleed buttons, cramped or
  off-rhythm spacing, stock shadcn look.
- "partial": de-slopped but taste is thin - weak hierarchy, undersized focal element,
  spacing without rhythm, a surface that is merely "not broken".
- "transformed": ONLY if it genuinely carries DESIGN.md's visual language with real taste,
  in every screenshot provided (both themes, both locales when present).

List concrete findings (severity "blocker" | "major" | "minor" + a specific pixel-grounded
issue). Never invent a file or line you did not derive from what you saw.

END your final message with EXACTLY one JSON object (no code fences), shaped:
{"surfaces":[{"surfaceId":"...","status":"transformed|partial|default|broken|no-artifact","findings":[{"severity":"major","issue":"..."}]}]}`
}

/** Pull the last balanced JSON object containing a "surfaces" array out of judge output. */
function parseVerdicts(resultText) {
  const text = String(resultText)
  const candidates = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue
    let depth = 0
    for (let j = i; j < text.length; j++) {
      if (text[j] === "{") depth++
      else if (text[j] === "}") {
        depth--
        if (depth === 0) {
          candidates.push(text.slice(i, j + 1))
          break
        }
      }
    }
  }
  for (const candidate of candidates.reverse()) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed?.surfaces)) return parsed.surfaces
    } catch {
      continue
    }
  }
  return null
}

function runJudge(surfaces, options) {
  // --safe-mode: no project hooks/CLAUDE.md reach the judge - the repo's own
  // Stop gate must not hijack its final verdict message (verified failure
  // without it; --bare is unusable because it also skips credential reads).
  // A pure judge sees only DESIGN.md + pixels. Read-only allowlist, no
  // bypassPermissions: it is structurally unable to write.
  const args = [
    "-p",
    "--safe-mode",
    "--output-format",
    "json",
    "--model",
    options.model,
    "--allowedTools",
    "Read",
  ]
  const run = spawnSync("claude", args, {
    input: judgePrompt(surfaces),
    cwd: tmpdir(),
    env: childEnv(),
    encoding: "utf8",
    timeout: options.timeoutMin * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  })
  if (run.error) {
    return { error: run.error.code === "ETIMEDOUT" ? "judge timed out" : `judge spawn failed (${run.error.code})` }
  }
  let outer
  try {
    outer = JSON.parse(run.stdout)
  } catch {
    outer = null
  }
  if (!outer || outer.is_error) {
    return { error: "judge process reported an error", raw: String(run.stdout || run.stderr || "").slice(-400) }
  }
  const verdicts = parseVerdicts(outer.result ?? "")
  if (!verdicts) return { error: "judge returned no parseable verdict object", raw: String(outer.result ?? "").slice(-400) }
  return { verdicts, costUsd: Number(outer.total_cost_usd ?? 0) || 0 }
}

function loadExistingVerdicts() {
  try {
    return JSON.parse(readFileSync(VERDICTS_PATH, "utf8"))
  } catch {
    return { version: 1, surfaces: {} }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(USAGE)
    return 0
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch (error) {
    process.stderr.write(`judge-surfaces: cannot read the surface manifest (${error.message}). Run: npm run surfaces:manifest\n`)
    return 2
  }
  const version = spawnSync("claude", ["--version"], { encoding: "utf8", env: childEnv(), shell: false })
  if (version.status !== 0) {
    process.stderr.write("judge-surfaces: the `claude` CLI is not runnable, cannot spawn judges.\n")
    return 2
  }

  const surfaces = collectSurfaces(manifest, options.filter)
  const judgeable = surfaces.filter((surface) => surface.artifacts.length > 0)
  const skipped = surfaces.filter((surface) => surface.artifacts.length === 0)

  process.stdout.write(`judging ${judgeable.length} surface(s) with artifacts (model ${options.model}, batch ${options.batch})\n`)
  for (const surface of skipped) {
    process.stdout.write(`  [no artifacts yet] ${surface.surfaceId} - capture it first (npm run surfaces:capture)\n`)
  }
  if (judgeable.length === 0) {
    process.stdout.write("nothing to judge.\n")
    return skipped.length ? 1 : 0
  }

  const store = loadExistingVerdicts()
  let failures = 0
  let totalCost = 0

  for (let i = 0; i < judgeable.length; i += options.batch) {
    const batch = judgeable.slice(i, i + options.batch)
    process.stdout.write(`  judge ${1 + i / options.batch}: ${batch.map((surface) => surface.surfaceId).join(", ")}\n`)
    const outcome = runJudge(batch, options)
    if (outcome.error) {
      failures++
      process.stderr.write(`    FAILED: ${outcome.error}${outcome.raw ? `\n    tail: ${outcome.raw}` : ""}\n`)
      continue
    }
    totalCost += outcome.costUsd
    const byId = new Map(outcome.verdicts.map((verdict) => [verdict.surfaceId, verdict]))
    for (const surface of batch) {
      const verdict = byId.get(surface.surfaceId)
      if (!verdict || !STATUSES.includes(verdict.status)) {
        failures++
        process.stderr.write(`    FAILED: judge returned no valid verdict for ${surface.surfaceId}\n`)
        continue
      }
      const judgedCells = {}
      for (const artifact of surface.artifacts) judgedCells[artifact.name] = sha256File(artifact.path)
      store.surfaces[surface.surfaceId] = {
        status: verdict.status,
        findings: Array.isArray(verdict.findings) ? verdict.findings.slice(0, 20) : [],
        judgedCells,
        judgedAt: new Date().toISOString(),
        model: options.model,
      }
      process.stdout.write(`    ${surface.surfaceId}: ${verdict.status}${verdict.findings?.length ? ` (${verdict.findings.length} finding(s))` : ""}\n`)
    }
    mkdirSync(ARTIFACT_DIR, { recursive: true })
    writeFileSync(VERDICTS_PATH, JSON.stringify(store, null, 2) + "\n", "utf8")
  }

  const counts = {}
  for (const surface of judgeable) {
    const status = store.surfaces[surface.surfaceId]?.status ?? "unjudged"
    counts[status] = (counts[status] ?? 0) + 1
  }
  process.stdout.write(
    `\nverdicts: ${Object.entries(counts).sort().map(([status, count]) => `${status}: ${count}`).join(", ")} ($${totalCost.toFixed(2)} judge spend)\n`,
  )
  process.stdout.write(`wrote ${VERDICTS_PATH.split("\\").join("/")}\nnext: npm run surfaces:check\n`)
  return failures ? 1 : 0
}

process.exit(main())
