#!/usr/bin/env node
/**
 * Fail when the harness's own per-agent and per-skill tuning has gone stale relative to the model
 * that actually runs the work.
 *
 * ORB-120 (#126) shipped this capability on 2026-07-28 and the harness rebuild deleted it on
 * 2026-08-04 as an orphan, correctly: the rebuild replaced the skills and agents the stamp indexed.
 * The capability had no replacement, so nothing has gone red since when the configuration drifted.
 * This is the re-derivation (#188), and three facts made a verbatim restore wrong.
 *
 * 1. `.claude/orchestrator.json` no longer carries a top-level model. The worker model lives at
 *    `workers.codex.models.default.model`. That `default` profile is THE authoritative one: it is
 *    the only profile the config declares, and `launch-worker.mjs` resolves the implementer from it.
 * 2. The denominators moved. ORB-120 assumed 24 skills and 9 or more agents; today the tree holds
 *    7 agent files and 18 skill files. So the denominator is derived from a glob on every run and
 *    never written down, the pattern `tools/CONVENTIONS.md` documents and `redesign-coverage.mjs`
 *    implements.
 * 3. **It ships BLOCKING, with no `--report-only` anywhere.** ORB-120 shipped report-only "through
 *    2026-08-11" as a safety measure, and the measured result was a gate that was red on `main` and
 *    green in CI for days without anyone noticing, because the CI step passed `--report-only` and
 *    that flag exits 0 on drift by design. It had failed silently since the `quota` skill arrived and
 *    was never added to the calibration. A gate that cannot fail is not a gate, so this one has no
 *    such flag to pass.
 *
 * THE ALIAS GAP, recorded so it is not rediscovered. A declared model may be an alias, so a newer
 * model behind the same alias never changes `orchestrator.json` and the model-match assertion stays
 * green while the tuning underneath it decays. The 90-day max-age assertion is the backstop for
 * exactly that. It is not decoration, and the event trigger is not complete on its own.
 *
 * The escape hatch is the `calibration:reseed` GitHub label, mirroring `ratchet:reseed`. It lives in
 * the `guards.yml` job condition, never here: a tool that can be told to pass is the report-only
 * failure wearing a different hat.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-calibration.mjs [--root <path>]

  Fails when .claude/calibration.json has gone stale against the harness it stamps.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

  Five assertions, all blocking. There is deliberately no --report-only flag and no way to make this
  tool pass on drift; the escape hatch is the calibration:reseed label on the guards.yml job.

    1. every .claude/agents/*.md and .claude/skills/*/SKILL.md has a stamp entry
    2. no stamp entry names a file that no longer exists
    3. each entry's recorded model and effort match what the file declares today
    4. the stamp's workerModel matches workers.codex.models.default.model in .claude/orchestrator.json
    5. the stamp's calibratedAt is at most 90 days old, the backstop for a model alias that moved

exit codes: 0 the stamp is current, 1 the stamp is stale, 2 usage error or an unreadable stamp`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

/** The backstop for a model alias whose target moved without the declared string changing. */
const MAX_AGE_DAYS = 90
/** The one profile the config declares, and the one launch-worker.mjs resolves the implementer from. */
const AUTHORITATIVE_PROFILE = ["workers", "codex", "models", "default", "model"]

let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const positional = process.argv.slice(2)
while (positional.length > 0) {
  const flag = positional.shift()
  if (flag !== "--root" || positional.length === 0) fail(2, `check-calibration: invalid arguments: ${process.argv.slice(2).join(" ")}\n\n${USAGE}`)
  repositoryRoot = resolve(positional.shift())
}

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(2, `check-calibration: cannot read the ${label} at ${path}: ${error.message}`)
  }
}

const stampPath = join(repositoryRoot, ".claude", "calibration.json")
const stamp = readJson(stampPath, "calibration stamp")
if (stamp === null || typeof stamp !== "object" || Array.isArray(stamp)) fail(2, `check-calibration: ${stampPath} must be an object`)
if (typeof stamp.calibratedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(stamp.calibratedAt)) {
  fail(2, `check-calibration: calibratedAt must be a YYYY-MM-DD date, got ${JSON.stringify(stamp.calibratedAt)}`)
}
if (typeof stamp.workerModel !== "string" || stamp.workerModel === "") fail(2, "check-calibration: workerModel must be a non-empty string")
if (stamp.entries === null || typeof stamp.entries !== "object" || Array.isArray(stamp.entries)) {
  fail(2, "check-calibration: entries must be an object keyed by repository-relative path")
}
for (const [path, entry] of Object.entries(stamp.entries)) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) fail(2, `check-calibration: entry ${path} must be an object`)
  if (typeof entry.verdict !== "string" || entry.verdict === "") fail(2, `check-calibration: entry ${path} carries no verdict`)
  for (const field of ["model", "effort"]) {
    if (entry[field] !== null && typeof entry[field] !== "string") fail(2, `check-calibration: entry ${path} declares a non-string ${field}`)
  }
}

/**
 * The denominator is a glob on every run, never a written-down number. A hardcoded count stops
 * covering a file the moment one is added, which is how ORB-120's stamp missed the `quota` skill.
 */
const calibratedFiles = () => {
  const found = []
  const agentsDirectory = join(repositoryRoot, ".claude", "agents")
  if (existsSync(agentsDirectory)) {
    for (const name of readdirSync(agentsDirectory).sort()) {
      if (name.endsWith(".md")) found.push(`.claude/agents/${name}`)
    }
  }
  const skillsDirectory = join(repositoryRoot, ".claude", "skills")
  if (existsSync(skillsDirectory)) {
    for (const entry of readdirSync(skillsDirectory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(skillsDirectory, entry.name, "SKILL.md"))) found.push(`.claude/skills/${entry.name}/SKILL.md`)
    }
  }
  return found
}

/**
 * The declared `model:` and `effort:` from a file's YAML frontmatter, read as flat scalars because
 * that is all these two fields ever are. A full YAML parse would add a dependency to read two lines.
 */
const declaredTuning = (relativePath) => {
  const body = readFileSync(join(repositoryRoot, relativePath), "utf8")
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { model: null, effort: null }
  const tuning = { model: null, effort: null }
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(model|effort):\s*(\S.*?)\s*$/)
    if (field) tuning[field[1]] = field[2].replace(/^["']|["']$/g, "")
  }
  return tuning
}

const problems = []

const files = calibratedFiles()
if (files.length === 0) fail(2, `check-calibration: ${repositoryRoot} holds no .claude/agents/*.md and no .claude/skills/*/SKILL.md, so this gate would prove nothing`)

for (const relativePath of files) {
  const entry = stamp.entries[relativePath]
  if (!entry) {
    problems.push(`no calibration entry for ${relativePath}; it was added without a verdict`)
    continue
  }
  const declared = declaredTuning(relativePath)
  for (const field of ["model", "effort"]) {
    if ((entry[field] ?? null) !== (declared[field] ?? null)) {
      problems.push(`${relativePath} declares ${field} ${JSON.stringify(declared[field])} but the stamp recorded ${JSON.stringify(entry[field] ?? null)}`)
    }
  }
}

for (const relativePath of Object.keys(stamp.entries).sort()) {
  if (!files.includes(relativePath)) problems.push(`the stamp names ${relativePath}, which is not an agent or skill in this tree`)
}

let configuredModel = readJson(join(repositoryRoot, ".claude", "orchestrator.json"), "orchestrator config")
for (const key of AUTHORITATIVE_PROFILE) configuredModel = configuredModel?.[key]
if (typeof configuredModel !== "string" || configuredModel === "") {
  fail(2, `check-calibration: .claude/orchestrator.json declares no ${AUTHORITATIVE_PROFILE.join(".")}, so the model-match assertion has nothing to compare against`)
}
if (stamp.workerModel !== configuredModel) {
  problems.push(`the worker model is ${configuredModel} and the stamp was taken against ${stamp.workerModel}; recalibrate in the same pull request that moved it`)
}

/**
 * Whole days, from dates rather than a clock, so the verdict cannot change inside one CI run and a
 * stamp taken today is never 0.99 days old.
 */
const stampedAt = Date.UTC(...stamp.calibratedAt.split("-").map(Number).map((part, index) => (index === 1 ? part - 1 : part)))
const today = new Date()
const ageDays = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - stampedAt) / 86400000)
if (!Number.isFinite(ageDays)) fail(2, `check-calibration: calibratedAt ${stamp.calibratedAt} is not a real date`)
if (ageDays > MAX_AGE_DAYS) {
  problems.push(`the stamp is ${ageDays} days old, past the ${MAX_AGE_DAYS} day backstop; a model alias can move without changing its declared string, so age is the only signal left`)
}

if (problems.length > 0) {
  console.error(`Calibration stale: ${problems.length} problem(s) against ${files.length} calibrated file(s).`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error("\nRecalibrate: re-read each file named above, decide its model and effort against the running worker model, and rewrite .claude/calibration.json with today's date.")
  process.exit(1)
}

console.log(`check-calibration: ${files.length} calibrated file(s) stamped ${stamp.calibratedAt} against ${configuredModel}, ${ageDays} day(s) old.`)
