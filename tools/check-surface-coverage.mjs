#!/usr/bin/env node
// The completion oracle for a whole-app visual pass.
//
// ARCHITECTURE (rebuilt 2026-07-19, after six sessions of a harness that
// reported a false "done"). The old oracle asked ONE question - "did an
// independent vision judge call this surface `transformed`?" - and used the
// answer to GRANT completion. That is not a question a vision model can
// answer. Measured here: `route-explore`, byte-identical to the pre-#539
// baseline, scored `transformed` on both votes while genuinely redesigned
// surfaces scored `broken`. The published evidence says the same thing:
// MLLM UI judges score F1 20-31% on the very defect classes at issue
// (UI-Lens, CVPR 2026), sit near chance when two UIs are close in quality
// (arXiv 2510.08783), and need >=11 trials for 95% reliability where this
// harness used 2 (arXiv 2606.13685).
//
// So nothing automatic GRANTS completion any more. The oracle now combines
// three independent facts, and only a human can supply the one that grants:
//
//   touched      DETERMINISTIC VETO. Enough of this surface's render-affecting
//                content actually MOVED since the baseline - measured as the
//                multiset distance between its VISUAL SIGNATURE token streams
//                (tools/visual-signature.mjs), against REDESIGN_DEPTH_FLOOR.
//                It was a boolean until 2026-07-19, and a boolean let a surface
//                with four edited lines report exactly what a rebuilt screen
//                reports. Measured that day: 89% of the app sat under 15%
//                changed while the oracle called 608/804 cells touched, and the
//                owner kept opening the calendar (9.6%) and Today (0.0%) and
//                finding them unchanged. Still a necessary condition and never
//                a sufficient one - a large mechanical sweep can clear it,
//                which is exactly why it vetoes and never grants.
//   defectClear  RECORDED VETO. An independent judge report exists for the
//                cell, keyed to that signature, carrying no blocker finding.
//                The judge detects defects; it never certifies taste.
//   signed       THE ONLY GRANT. A human tick in .claude/manifests/signoff.json,
//                which agents are structurally blocked from writing
//                (forbid-gate-tamper). Taste is a human verdict, recorded.
//
// DETERMINISM. This tool only READS files and hashes file contents. It calls
// no model, consults no clock, and never looks at mtime (mtime is what made
// the old count drift 16 -> 20 -> 19 -> 20 with nobody editing, and what made
// a shared-component edit un-verify unrelated surfaces). Two runs on an
// unchanged tree produce byte-identical output, by construction.
//
// HONESTY. Every run prints its own scope - platforms, states, and which
// axes actually have evidence - so no reader can mistake a partial number for
// whole-app coverage. That is enforced by test-hooks, not by prose.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extractTokens, signatureOfFile, signatureOfSource, tokenDistance } from "./visual-signature.mjs"

/**
 * How much of a surface's render-affecting token stream must move before it counts
 * as redesigned. NOT a taste judgement: it is the floor for "somebody actually did
 * the work here", which is the question a human cannot answer by reading a diff of
 * 750 files and should never be asked to.
 *
 * Set from measurement, not taste. Across all 171 surfaces at the pre-#539 baseline:
 * 42 sat at exactly 0%, 57 more under 5%, 53 more under 15% - 89% of the app under
 * 15% - while the old boolean reported 608/804 cells "touched". route-calendar came
 * back 9.6% and view-today 0.0%, which is precisely what "I opened the calendar and
 * it looks the same" means, ten times over.
 *
 * Override with ORBIT_REDESIGN_DEPTH (0..1) to tighten or loosen deliberately.
 */
export const REDESIGN_DEPTH_FLOOR = Number(process.env.ORBIT_REDESIGN_DEPTH ?? 0.3)

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const DEFECTS_PATH = join(REPO_ROOT, ".claude", "manifests", "defects.json")
const SIGNOFF_PATH = join(REPO_ROOT, ".claude", "manifests", "signoff.json")

const USAGE = `check-surface-coverage - derive visual-pass completion from evidence on disk.

Usage:
  node tools/check-surface-coverage.mjs [--json] [--filter <s>] [--platform web|mobile]
                                        [--explain <surfaceId>] [--help]

A cell is DONE only when all three hold:
  touched      the surface's render-affecting content moved by at least the
               redesign depth floor since the baseline commit (edited != redesigned)
  defectClear  a judge report exists for that signature with no blocker finding
  signed       a human tick in .claude/manifests/signoff.json (the only grant)

Reads only files. No model call, no clock, no mtime: two runs on an unchanged
tree are byte-identical.

Flags:
  --json      machine-readable verdict on stdout
  --filter    only cells whose surfaceId contains this substring
  --platform  only cells for this platform
  --explain   print the full evidence trail for one surface
  --help      this text

Exit codes:
  0  every cell in scope is done
  1  at least one cell in scope is not done
  2  the manifest is absent or unreadable
`

/** Artifact path (repo-relative, POSIX) for one manifest cell. */
export function artifactPathFor(cell) {
  return `.artifacts/surfaces/${cell.surfaceId}--${cell.state}--${cell.theme}--${cell.locale}.png`
}

/** Stable key identifying one cell across the evidence files. */
export function cellKey(cell) {
  return `${cell.surfaceId}--${cell.state}--${cell.theme}--${cell.locale}`
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

/** Source of a repo-relative path at a git ref, or null when it did not exist there. */
function sourceAtRef(relativePath, ref) {
  try {
    return execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

/** Source of a file at HEAD, or null when unreadable. */
function readSource(absolutePath) {
  try {
    return readFileSync(absolutePath, "utf8")
  } catch {
    return null
  }
}

/** Visual signature of a repo-relative path as it existed at a git ref, or null when absent/unparseable. */
export function signatureAtRef(relativePath, ref) {
  const source = sourceAtRef(relativePath, ref)
  if (source === null) return null
  return signatureOfSource(source, relativePath)
}

/**
 * Whether deliberate visual work landed on this surface since the baseline.
 * A file that is ABSENT at the baseline counts as work (it is new); a file
 * that cannot be parsed at either end counts as UNKNOWN and never as work,
 * so an extractor bug can never grant a surface.
 */
function evaluateTouched(surface, baselineRef, signatureCache) {
  const changed = []
  let unknown = 0
  const baselineTokens = []
  const headTokens = []
  for (const relativePath of surface.ownedFiles) {
    const cacheKey = relativePath
    let entry = signatureCache.get(cacheKey)
    if (!entry) {
      const absolutePath = join(REPO_ROOT, relativePath)
      const headSource = readSource(absolutePath)
      const baseSource = sourceAtRef(relativePath, baselineRef)
      entry = {
        head: signatureOfFile(absolutePath),
        base: signatureAtRef(relativePath, baselineRef),
        headTokens: headSource === null ? null : extractTokens(headSource, relativePath),
        baseTokens: baseSource === null ? null : extractTokens(baseSource, relativePath),
      }
      signatureCache.set(cacheKey, entry)
    }
    if (entry.head === null) {
      unknown += 1
      continue
    }
    // A file absent at the baseline is entirely new, so all of its tokens are new
    // work and none are shared: pushing only the head side says exactly that.
    if (entry.baseTokens) baselineTokens.push(...entry.baseTokens)
    if (entry.headTokens) headTokens.push(...entry.headTokens)
    if (entry.base === null || entry.base !== entry.head) changed.push(relativePath)
  }
  const depth = tokenDistance(baselineTokens, headTokens)
  return {
    // Depth, not existence. `changed.length > 0` let four edited lines report the
    // same as a rebuilt screen, which is how ten runs reported done over an app
    // that was 89% untouched.
    touched: changed.length > 0 && depth >= REDESIGN_DEPTH_FLOOR,
    depth,
    changedFiles: changed,
    unknownFiles: unknown,
  }
}

/** Signature of the surface as a whole: the ordered signatures of its owned files. */
function surfaceSignature(surface, signatureCache) {
  return surface.ownedFiles.map((path) => signatureCache.get(path)?.head ?? "?").join("|").slice(0, 4096)
}

function evaluateCell(cell, context) {
  const { baselineRef, defects, signoff, signatureCache } = context
  const key = cellKey(cell)
  const reasons = []
  const signature = () => surfaceSignature(cell, signatureCache)

  const { touched, depth, changedFiles, unknownFiles } = evaluateTouched(cell, baselineRef, signatureCache)
  const depthPercent = `${(depth * 100).toFixed(1)}%`
  const floorPercent = `${(REDESIGN_DEPTH_FLOOR * 100).toFixed(0)}%`
  if (!touched) {
    if (changedFiles.length === 0) {
      reasons.push(
        unknownFiles > 0
          ? `untouched: no owned file changed since ${baselineRef} (${unknownFiles} unparseable, counted as unknown)`
          : `untouched: no owned file's visual signature differs from ${baselineRef}`,
      )
    } else {
      // The failure mode this exists for: files were edited, so the old boolean
      // said "worked on", but only a sliver of the surface actually moved.
      reasons.push(
        `too-shallow: only ${depthPercent} of this surface's render-affecting content changed since ${baselineRef} ` +
          `(floor ${floorPercent}); ${changedFiles.length} file(s) edited. Edited is not redesigned.`,
      )
    }
  }

  // The judge can only VETO, and it can only veto what it could actually see.
  // Demanding a report for a cell with no obtainable pixels (every mobile cell,
  // every non-default state) made `done` mathematically unreachable for 348 of
  // 804 cells - an unsatisfiable gate, not a strict one. Those cells rest on
  // the human tick alone, and the scope banner says so.
  const report = defects?.cells?.[key]
  const blockers = report?.findings?.filter((finding) => finding.severity === "blocker") ?? []
  const judgeCouldNotSee = report?.status === "no-artifact"
  if (!report) {
    if (cell.pixelEvidence !== "none")
      reasons.push("unjudged: no defect report for this cell - run: npm run surfaces:judge")
  } else if (report.surfaceSignature !== surfaceSignature(cell, signatureCache))
    reasons.push("judge-stale: the surface changed since it was judged - re-run: npm run surfaces:judge")
  else if (judgeCouldNotSee)
    reasons.push("no-artifact: the judge could not see this surface (login/redirect/blank), so it is UNKNOWN, not clean")
  else if (report.status === "broken") reasons.push(`broken: the judge recorded a broken surface${report.findings?.[0] ? ` - ${report.findings[0].issue}` : ""}`)
  else if (blockers.length > 0) reasons.push(`blocker: ${blockers[0].issue}`)

  const tick = signoff?.cells?.[key]
  if (!tick) reasons.push("unsigned: no human sign-off (only a human can grant a surface)")
  else if (tick.surfaceSignature !== surfaceSignature(cell, signatureCache))
    reasons.push("signoff-stale: the surface changed after it was signed off")

  return {
    key,
    surfaceId: cell.surfaceId,
    platform: cell.platform,
    kind: cell.kind,
    state: cell.state,
    theme: cell.theme,
    locale: cell.locale,
    sourceFile: cell.sourceFile,
    artifact: artifactPathFor(cell),
    surfaceSignature: signature(),
    touched,
    changedFiles,
    pixelEvidence: cell.pixelEvidence ?? "web-capture",
    defectClear: !reasons.some(
      (reason) =>
        reason.startsWith("blocker") ||
        reason.startsWith("judge-stale") ||
        reason.startsWith("unjudged") ||
        reason.startsWith("broken") ||
        reason.startsWith("no-artifact"),
    ),
    signed: Boolean(tick) && !reasons.some((reason) => reason.startsWith("signoff-stale")),
    done: reasons.length === 0,
    reasons,
  }
}

/** True when the baseline ref actually resolves in this tree. */
function baselineResolves(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "ignore", "ignore"],
    })
    return true
  } catch {
    return false
  }
}

/** Full verdict for a manifest: per-cell results plus the derived counts. */
export function evaluateManifest(manifest, options = {}) {
  const context = {
    baselineRef: options.baselineRef ?? manifest.baselineSha ?? manifest.baselineRef,
    defects: options.defects ?? readJson(DEFECTS_PATH, null),
    signoff: options.signoff ?? readJson(SIGNOFF_PATH, null),
    signatureCache: new Map(),
  }

  // An unresolvable baseline makes every owned file look absent-at-baseline,
  // i.e. brand new, i.e. touched - which would silently satisfy the touched
  // axis for the whole app. That must fail CLOSED and loudly, not quietly
  // grant. (A verifier that errors is UNKNOWN, never a clean pass.)
  const baselineOk = baselineResolves(context.baselineRef)
  const results = manifest.cells.map((cell) => {
    const result = evaluateCell(cell, context)
    if (baselineOk) return result
    return {
      ...result,
      touched: false,
      done: false,
      reasons: [`baseline-unresolvable: cannot resolve "${context.baselineRef}" in this tree, so "was this worked on" is UNKNOWN`, ...result.reasons],
    }
  })
  const count = (predicate) => results.filter(predicate).length
  return {
    generatedFrom: manifest.generatedFrom,
    baselineRef: manifest.baselineRef,
    total: results.length,
    touched: count((result) => result.touched),
    defectClear: count((result) => result.defectClear),
    signed: count((result) => result.signed),
    verified: count((result) => result.done),
    complete: results.every((result) => result.done),
    results,
    failures: results.filter((result) => !result.done),
  }
}

/**
 * The scope banner. Printed on EVERY run so a partial number can never be read
 * as whole-app coverage; test-hooks asserts its presence rather than trusting
 * a prose rule to survive.
 */
export function scopeLines(manifest, verdict) {
  const lines = []
  const platforms = [...new Set(manifest.cells.map((cell) => cell.platform))].sort()
  lines.push(`SCOPE: ${verdict.total} cells = ${new Set(manifest.cells.map((c) => c.surfaceId)).size} surfaces x state x theme x locale`)
  for (const platform of platforms) {
    const cells = manifest.cells.filter((cell) => cell.platform === platform)
    const done = verdict.results.filter((result) => result.platform === platform && result.done).length
    lines.push(`  ${platform.padEnd(7)} ${String(done).padStart(4)}/${String(cells.length).padEnd(4)} cells done`)
  }
  const noPixels = manifest.cells.filter((cell) => cell.pixelEvidence === "none").length
  if (noPixels > 0)
    lines.push(
      `  ${noPixels}/${verdict.total} cells can NEVER have a screenshot (every mobile cell; every non-default state).\n` +
        "  For those the judge is silent by construction and the human tick is the WHOLE verdict - no\n" +
        "  automated evidence backs them at all. Do not read them as machine-verified.",
    )
  lines.push(`  baseline ${manifest.baselineRef} (${String(manifest.baselineSha ?? "").slice(0, 8)})   HEAD ${String(manifest.generatedFrom).slice(0, 8)}`)
  return lines
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  const asJson = args.includes("--json")
  const valueOf = (flag) => (args.indexOf(flag) !== -1 ? args[args.indexOf(flag) + 1] : null)
  const filter = valueOf("--filter")
  const platform = valueOf("--platform")
  const explain = valueOf("--explain")

  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  } catch (error) {
    const message = `check-surface-coverage: cannot read .claude/manifests/surfaces.json (${error.message}). Run: npm run surfaces:manifest\n`
    if (asJson) process.stdout.write(JSON.stringify({ error: message.trim() }) + "\n")
    else process.stderr.write(message)
    return 2
  }

  const scoped = {
    ...manifest,
    cells: manifest.cells.filter(
      (cell) =>
        (!filter || cell.surfaceId.includes(filter)) &&
        (!platform || cell.platform === platform) &&
        (!explain || cell.surfaceId === explain),
    ),
  }
  const verdict = evaluateManifest(scoped)

  if (asJson) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n")
    return verdict.complete ? 0 : 1
  }

  process.stdout.write(`${verdict.verified}/${verdict.total} cells DONE (touched AND defect-clear AND human-signed)\n`)
  process.stdout.write(
    `  touched      ${String(verdict.touched).padStart(4)}/${verdict.total}   >=${(REDESIGN_DEPTH_FLOOR * 100).toFixed(0)}% of the surface actually changed since ${manifest.baselineRef} (edited != redesigned)\n`,
  )
  const unjudgeable = verdict.results.filter((result) => result.defectClear && result.pixelEvidence === "none").length
  process.stdout.write(
    `  defect-clear ${String(verdict.defectClear).padStart(4)}/${verdict.total}   no blocker recorded` +
      (unjudgeable > 0 ? `  (${unjudgeable} of these have NO obtainable screenshot, so nothing was actually judged)` : "") +
      "\n",
  )
  process.stdout.write(`  human-signed ${String(verdict.signed).padStart(4)}/${verdict.total}   the ONLY axis that grants completion\n`)
  for (const line of scopeLines(scoped, verdict)) process.stdout.write(`${line}\n`)

  if (explain) {
    process.stdout.write(`\nEVIDENCE TRAIL for ${explain}:\n`)
    for (const result of verdict.results) {
      process.stdout.write(`  ${result.key}\n`)
      process.stdout.write(`    owned files changed since baseline: ${result.changedFiles.length}\n`)
      for (const file of result.changedFiles.slice(0, 5)) process.stdout.write(`      ${file}\n`)
      for (const reason of result.reasons) process.stdout.write(`    NOT DONE - ${reason}\n`)
      if (result.done) process.stdout.write("    DONE\n")
    }
    return verdict.complete ? 0 : 1
  }

  if (verdict.complete) {
    process.stdout.write("every cell in scope is touched, judged clear, and human-signed.\n")
    return 0
  }

  const byReason = {}
  for (const failure of verdict.failures) {
    const head = failure.reasons[0].split(":")[0]
    byReason[head] = (byReason[head] ?? 0) + 1
  }
  process.stdout.write(`\nSHORTFALL: ${verdict.failures.length} cell(s) not done`)
  process.stdout.write(` (${Object.entries(byReason).sort().map(([reason, count]) => `${reason}: ${count}`).join(", ")})\n`)
  process.stderr.write(`check-surface-coverage: ${verdict.failures.length}/${verdict.total} cells not done\n`)
  return 1
}

/** The manifest this oracle reads, or null when it is absent/unreadable. */
export function loadManifest() {
  return readJson(MANIFEST_PATH, null)
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exit(main())
