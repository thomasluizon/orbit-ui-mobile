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
import { spawn, spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { signatureOfFile } from "./visual-signature.mjs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const ARTIFACT_DIR = join(REPO_ROOT, ".artifacts", "surfaces")
const VERDICTS_PATH = join(ARTIFACT_DIR, "verdicts.json")
// The cell-keyed report the completion oracle reads. It lives under
// .claude/manifests/ (committed) rather than .artifacts/ (gitignored) so the
// evidence survives the session that produced it - every prior attempt lost
// its findings at the session boundary and rediscovered them from scratch.
const DEFECTS_PATH = join(REPO_ROOT, ".claude", "manifests", "defects.json")
const DESIGN_MD = join(REPO_ROOT, "DESIGN.md")

const STATUSES = ["transformed", "partial", "default", "broken", "no-artifact"]

const MAX_JUDGE_STDOUT = 64 * 1024 * 1024

const TAINTED_ENV = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY",
]

const USAGE = `judge-surfaces - independent vision judge over captured surface screenshots.

Usage:
  node tools/judge-surfaces.mjs [--filter <substring>] [--model <model>]
                                [--batch <n>] [--votes <n>] [--timeout-min <n>]
                                [--concurrency <n>] [--help]

For each manifest surface with at least one screenshot on disk, spawns N fresh
INDEPENDENT read-only \`claude -p\` judges (--votes) that Read the PNGs and
DESIGN.md and return a verdict per surface: ${STATUSES.join(" | ")}.
Votes merge worst-wins: a surface is "transformed" ONLY if every vote says so;
findings are unioned. If any vote fails, its surfaces stay unjudged (fail
closed) - a verdict is never built from fewer than the requested votes.
Verdicts land in .artifacts/surfaces/verdicts.json, each cell hash-bound to the
exact PNG bytes judged. tools/check-surface-coverage.mjs requires a
"transformed" verdict with a matching hash before a cell counts as verified.

Flags:
  --filter       only judge surfaces whose surfaceId contains this substring
  --model        judge model (default: sonnet)
  --batch        surfaces per judge process (default: 5)
  --votes        independent judges per batch, merged worst-wins (default: 2, min 1)
  --timeout-min  per-judge timeout in minutes (default: 15)
  --concurrency  batches judged at once (default: 4, clamped 1-12). A batch's
                 votes also run together, so up to concurrency x votes judge
                 processes are in flight; output is prefixed per batch because
                 lines interleave.
  --help         this text

Exit codes:
  0  every in-scope surface with artifacts received a verdict
  1  at least one judge call failed or returned no usable verdict
  2  preconditions missing (manifest absent, claude CLI not runnable)
`

function parseArgs(argv) {
  const out = { filter: null, model: "sonnet", batch: 5, votes: 2, timeoutMin: 15, concurrency: 4, help: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--filter" && argv[i + 1]) out.filter = argv[++i]
    else if (argv[i] === "--model" && argv[i + 1]) out.model = argv[++i]
    else if (argv[i] === "--batch" && argv[i + 1]) out.batch = Math.max(1, Number(argv[++i]) || 5)
    else if (argv[i] === "--votes" && argv[i + 1]) out.votes = Math.max(1, Number(argv[++i]) || 2)
    else if (argv[i] === "--timeout-min" && argv[i + 1]) out.timeoutMin = Math.max(1, Number(argv[++i]) || 15)
    else if (argv[i] === "--concurrency" && argv[i + 1]) out.concurrency = Math.min(12, Math.max(1, Number(argv[++i]) || 4))
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
    const key = `${cell.surfaceId}--${cell.state}--${cell.theme}--${cell.locale}`
    const artifactName = `${key}.png`
    const absolutePath = join(ARTIFACT_DIR, artifactName)
    if (!bySurface.has(cell.surfaceId)) {
      bySurface.set(cell.surfaceId, { surfaceId: cell.surfaceId, sourceFile: cell.sourceFile, ownedFiles: cell.ownedFiles ?? [], artifacts: [], missing: [], cellKeys: [] })
    }
    const surface = bySurface.get(cell.surfaceId)
    surface.cellKeys.push(key)
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

  // The known-defect list is deliberately NOT shown to the judge. It used to
  // be, and that made recall unmeasurable: a judge handed the answer key can
  // quote a defect by number instead of seeing it, and one recorded finding is
  // literally the judge saying it CANNOT verify "known defect #2". Calibration
  // (tools/calibrate-judge.mjs) is only meaningful against a judge that was
  // never told what to look for.
  return `You are an ADVERSARIAL visual DEFECT DETECTOR for Orbit's whole-app redesign (#539).
Your job is to find what is WRONG in these rendered surfaces. You did not write this code; do
not be charitable.

You are NOT the completion authority and your verdict cannot mark anything done - a human
signs off on taste. What matters most from you is the findings list: concrete, pixel-grounded
defects a person would agree with on sight.

FIRST read ${DESIGN_MD} in full - it is the spec you judge against (de-decorated navy-violet,
semantic tokens, no decorative glow, no gradient wash, tonal panels, enumerated spacing scale,
restrained accent usage).

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

Reserve "blocker" for something a user would hit: text overflowing or truncated, elements
overlapping, a control that cannot be read or reached, a page rendering the wrong locale, or a
functional failure visible on screen (an error state where content should be). A blocker
WITHHOLDS the cell from completion, so it must be something you can point at in the pixels.
Taste complaints are "minor" - they are advisory and never block.

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
  return new Promise((settle) => {
    const child = spawn("claude", args, { cwd: tmpdir(), env: childEnv(), shell: false })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let overflowed = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, options.timeoutMin * 60 * 1000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      if (stdout.length > MAX_JUDGE_STDOUT) {
        overflowed = true
        child.kill()
      }
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.stdin.on("error", () => child.kill())
    child.on("error", (error) => {
      clearTimeout(timer)
      settle({ error: `judge spawn failed (${error.code})` })
    })
    child.on("close", () => {
      clearTimeout(timer)
      if (timedOut) return settle({ error: "judge timed out" })
      if (overflowed) return settle({ error: "judge spawn failed (ENOBUFS)" })
      let outer
      try {
        outer = JSON.parse(stdout)
      } catch {
        outer = null
      }
      if (!outer || outer.is_error) {
        return settle({ error: "judge process reported an error", raw: String(stdout || stderr || "").slice(-400) })
      }
      const verdicts = parseVerdicts(outer.result ?? "")
      if (!verdicts) return settle({ error: "judge returned no parseable verdict object", raw: String(outer.result ?? "").slice(-400) })
      settle({ verdicts, costUsd: Number(outer.total_cost_usd ?? 0) || 0 })
    })
    child.stdin.end(judgePrompt(surfaces))
  })
}

/** Run one batch's independent votes together and reduce them to store-ready records; a failed or invalid vote leaves the batch's surfaces unjudged (fail closed). */
async function judgeBatch(batch, label, options) {
  const outcomes = await Promise.all(Array.from({ length: options.votes }, () => runJudge(batch, options)))
  const lines = []
  const errors = []
  const voteMaps = []
  let costUsd = 0
  outcomes.forEach((outcome, vote) => {
    if (outcome.error) {
      errors.push(`${label} FAILED: vote ${vote + 1}/${options.votes}: ${outcome.error}${outcome.raw ? `\n${label} tail: ${outcome.raw}` : ""}`)
      return
    }
    costUsd += outcome.costUsd
    voteMaps.push(new Map(outcome.verdicts.map((verdict) => [verdict.surfaceId, verdict])))
  })
  if (voteMaps.length < options.votes) {
    errors.push(`${label} FAILED: batch got ${voteMaps.length}/${options.votes} vote(s) - its surfaces stay unjudged (fail closed)`)
    return { records: [], failures: 1, costUsd, lines, errors }
  }

  const records = []
  let failures = 0
  for (const surface of batch) {
    const surfaceVotes = voteMaps.map((byId) => byId.get(surface.surfaceId))
    if (surfaceVotes.some((verdict) => !verdict || !STATUSES.includes(verdict.status))) {
      failures++
      errors.push(`${label} FAILED: fewer than ${options.votes} valid vote(s) for ${surface.surfaceId} - left unjudged (fail closed)`)
      continue
    }
    const merged = mergeVotes(surfaceVotes)
    const judgedCells = {}
    for (const artifact of surface.artifacts) judgedCells[artifact.name] = sha256File(artifact.path)
    records.push([
      surface.surfaceId,
      {
        status: merged.status,
        findings: merged.findings,
        judgedCells,
        judgedAt: new Date().toISOString(),
        model: options.model,
        votes: options.votes,
        voteStatuses: merged.voteStatuses,
        cellKeys: surface.cellKeys,
      },
    ])
    lines.push(`${label} ${surface.surfaceId}: ${merged.status} [votes: ${merged.voteStatuses.join(" | ")}]${merged.findings.length ? ` (${merged.findings.length} finding(s))` : ""}`)
  }
  return { records, failures, costUsd, lines, errors }
}

/**
 * The single writer of the judge's output: fully synchronous, so a concurrent
 * batch can never interleave with it and drop a verdict. Writes BOTH the
 * per-surface record (kept for history and for tools/calibrate-judge.mjs) and
 * the cell-keyed defect report the completion oracle reads, pinned to each
 * surface's visual signature so a stale report cannot carry forward.
 */
function commitBatch(store, defects, result, signatures) {
  for (const [surfaceId, record] of result.records) {
    store.surfaces[surfaceId] = record
    for (const cellKeyName of record.cellKeys ?? [])
      defects.cells[cellKeyName] = {
        surfaceSignature: signatures.get(surfaceId) ?? "",
        status: record.status,
        findings: record.findings,
        judgedAt: record.judgedAt,
        model: record.model,
      }
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  writeFileSync(VERDICTS_PATH, JSON.stringify(store, null, 2) + "\n", "utf8")
  mkdirSync(dirname(DEFECTS_PATH), { recursive: true })
  writeFileSync(DEFECTS_PATH, JSON.stringify(defects, null, 2) + "\n", "utf8")
  for (const line of result.lines) process.stdout.write(`${line}\n`)
  for (const error of result.errors) process.stderr.write(`${error}\n`)
}

/** Run async thunks through a fixed-width promise pool, preserving input order in the results. */
async function runPool(tasks, width) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, tasks.length) }, worker))
  return results
}

/** Worst-wins merge across independent votes: the surface is only as good as its worst verdict; findings union, deduped by issue text. */
function mergeVotes(surfaceVotes) {
  const voteStatuses = surfaceVotes.map((verdict) => verdict.status)
  const status = voteStatuses.reduce((worst, current) =>
    STATUSES.indexOf(current) > STATUSES.indexOf(worst) ? current : worst,
  )
  const seenIssues = new Set()
  const findings = []
  for (const verdict of surfaceVotes) {
    const verdictFindings = Array.isArray(verdict.findings) ? verdict.findings : []
    for (const finding of verdictFindings) {
      const issue = String(finding?.issue ?? "")
      if (seenIssues.has(issue)) continue
      seenIssues.add(issue)
      findings.push(finding)
    }
  }
  return { status, voteStatuses, findings: findings.slice(0, 20) }
}

function loadExistingVerdicts() {
  try {
    return JSON.parse(readFileSync(VERDICTS_PATH, "utf8"))
  } catch {
    return { version: 1, surfaces: {} }
  }
}

function loadExistingDefects() {
  try {
    const parsed = JSON.parse(readFileSync(DEFECTS_PATH, "utf8"))
    return { version: 1, cells: parsed.cells ?? {} }
  } catch {
    return { version: 1, cells: {} }
  }
}

async function main() {
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

  process.stdout.write(`judging ${judgeable.length} surface(s) with artifacts (model ${options.model}, batch ${options.batch}, votes ${options.votes}, concurrency ${options.concurrency})\n`)
  for (const surface of skipped) {
    process.stdout.write(`  [no artifacts yet] ${surface.surfaceId} - capture it first (npm run surfaces:capture)\n`)
  }
  if (judgeable.length === 0) {
    process.stdout.write("nothing to judge.\n")
    return skipped.length ? 1 : 0
  }

  const store = loadExistingVerdicts()
  const defects = loadExistingDefects()

  // Pin each surface's report to the visual signature of the code that
  // produced the pixels, so the oracle can tell a current report from one
  // describing a surface that has since been rewritten.
  const signatures = new Map()
  for (const surface of judgeable)
    signatures.set(surface.surfaceId, surface.ownedFiles.map((path) => signatureOfFile(join(REPO_ROOT, path)) ?? "?").join("|").slice(0, 4096))

  const batches = []
  for (let i = 0; i < judgeable.length; i += options.batch) batches.push(judgeable.slice(i, i + options.batch))

  const results = await runPool(
    batches.map((batch, index) => async () => {
      const label = `[judge ${index + 1}/${batches.length}]`
      process.stdout.write(`${label} ${batch.map((surface) => surface.surfaceId).join(", ")}\n`)
      const result = await judgeBatch(batch, label, options)
      commitBatch(store, defects, result, signatures)
      return result
    }),
    options.concurrency,
  )
  const failures = results.reduce((sum, result) => sum + result.failures, 0)
  const totalCost = results.reduce((sum, result) => sum + result.costUsd, 0)

  const counts = {}
  for (const surface of judgeable) {
    const status = store.surfaces[surface.surfaceId]?.status ?? "unjudged"
    counts[status] = (counts[status] ?? 0) + 1
  }
  process.stdout.write(
    `\nverdicts: ${Object.entries(counts).sort().map(([status, count]) => `${status}: ${count}`).join(", ")} ($${totalCost.toFixed(2)} judge spend across ${options.votes} vote(s)/batch)\n`,
  )
  process.stdout.write(`wrote ${VERDICTS_PATH.split("\\").join("/")}\nnext: npm run surfaces:check\n`)
  return failures ? 1 : 0
}

process.exit(await main())
