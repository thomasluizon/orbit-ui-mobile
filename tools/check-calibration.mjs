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
 * 1. `.claude/orchestrator.json` no longer carries a top-level model. The implementer profile is
 *    `workers.<config.worker>.models.default`, resolved the way `launch-worker.mjs:115-122` resolves
 *    it: the ENGINE comes from `config.worker` rather than being named here, and the profile carries
 *    both a `model` and the `args` that hold the reasoning effort. An earlier revision hardcoded
 *    `codex` and read only the model string, which would have compared the wrong profile the moment
 *    the engine switched and would have missed an args-only effort change entirely.
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
    4. the stamp's workerModel and workerArgs match the profile launch-worker.mjs actually resolves,
       which is workers.<config.worker>.models.default, engine included rather than assumed
    5. the stamp's calibratedAt is a real date, is not in the future, and is at most 90 days old, the
       backstop for a model alias whose target moved without its declared string changing

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
/**
 * The profile tier `launch-worker.mjs` resolves the implementer from, at `:122`:
 * `resolveWorkerInvocation(engineName, engine, "default")`.
 *
 * The ENGINE is read from `config.worker` rather than hardcoded, because that is what
 * `launch-worker.mjs:115-116` does (`const engineName = config.worker`, then
 * `config.workers[engineName]`). Naming `codex` here would have compared the wrong profile the moment
 * the engine switched, and read a path that no longer exists.
 *
 * The stamp records the profile's `args` alongside its `model`, because the reasoning effort lives in
 * the args (`model_reasoning_effort="high"`), so a model string that never moves can still have its
 * tuning changed underneath. An args-only edit has to go red too.
 */
const AUTHORITATIVE_TIER = "default"

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
if (typeof stamp.workerEngine !== "string" || stamp.workerEngine === "") fail(2, "check-calibration: workerEngine must be a non-empty string")
if (!Array.isArray(stamp.workerArgs) || stamp.workerArgs.some((argument) => typeof argument !== "string")) {
  fail(2, "check-calibration: workerArgs must be an array of strings, because the reasoning effort lives there")
}
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

const orchestrator = readJson(join(repositoryRoot, ".claude", "orchestrator.json"), "orchestrator config")
const configuredEngine = orchestrator?.worker
if (typeof configuredEngine !== "string" || configuredEngine === "") {
  fail(2, "check-calibration: .claude/orchestrator.json declares no `worker`, so there is no engine to resolve the implementer profile from")
}
const configuredProfile = orchestrator?.workers?.[configuredEngine]?.models?.[AUTHORITATIVE_TIER]
if (typeof configuredProfile?.model !== "string" || configuredProfile.model === "") {
  fail(
    2,
    `check-calibration: .claude/orchestrator.json declares no workers.${configuredEngine}.models.${AUTHORITATIVE_TIER}.model, so the model-match assertion has nothing to compare against`,
  )
}
const configuredModel = configuredProfile.model
const configuredArgs = Array.isArray(configuredProfile.args) ? configuredProfile.args : []
if (stamp.workerEngine !== configuredEngine) {
  problems.push(`the worker engine is ${configuredEngine} and the stamp was taken against ${stamp.workerEngine}; a different engine is a different implementer, so recalibrate`)
}
if (stamp.workerModel !== configuredModel) {
  problems.push(`the worker model is ${configuredModel} and the stamp was taken against ${stamp.workerModel}; recalibrate in the same pull request that moved it`)
}
if (JSON.stringify(stamp.workerArgs) !== JSON.stringify(configuredArgs)) {
  problems.push(
    `the worker args are ${JSON.stringify(configuredArgs)} and the stamp was taken against ${JSON.stringify(stamp.workerArgs)}; the reasoning effort lives here, so an args-only change decays the tuning exactly like a model change`,
  )
}

/**
 * Whole days, from dates rather than a clock, so the verdict cannot change inside one CI run and a
 * stamp taken today is never 0.99 days old.
 */
/**
 * `Date.UTC` NORMALIZES an impossible calendar date rather than refusing it, so `2026-02-31` silently
 * becomes 2026-03-03 and the regex above cannot tell. Round-tripping the parsed date back to the
 * string is what refuses it: only a real date survives.
 *
 * And a FUTURE stamp produced a finite NEGATIVE age, which sailed past a `> MAX_AGE_DAYS` test, so a
 * `9999-12-31` stamp exited 0 at -2912192 days old and turned the alias backstop off entirely. That is
 * precisely the gate-that-cannot-fail this ticket exists to undo, so a stamp dated in the future is a
 * data error rather than a fresh stamp.
 */
const [stampYear, stampMonth, stampDay] = stamp.calibratedAt.split("-").map(Number)
const stampedAt = Date.UTC(stampYear, stampMonth - 1, stampDay)
if (!Number.isFinite(stampedAt) || new Date(stampedAt).toISOString().slice(0, 10) !== stamp.calibratedAt) {
  fail(2, `check-calibration: calibratedAt ${stamp.calibratedAt} is not a real calendar date`)
}
const today = new Date()
const ageDays = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - stampedAt) / 86400000)
if (ageDays < 0) {
  fail(2, `check-calibration: calibratedAt ${stamp.calibratedAt} is ${-ageDays} day(s) in the FUTURE, which would disable the max-age backstop rather than satisfy it`)
}
if (ageDays > MAX_AGE_DAYS) {
  problems.push(`the stamp is ${ageDays} days old, past the ${MAX_AGE_DAYS} day backstop; a model alias can move without changing its declared string, so age is the only signal left`)
}

if (problems.length > 0) {
  console.error(`Calibration stale: ${problems.length} problem(s) against ${files.length} calibrated file(s).`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error("\nRecalibrate: re-read each file named above, decide its model and effort against the running worker model, and rewrite .claude/calibration.json with today's date.")
  process.exit(1)
}

console.log(
  `check-calibration: ${files.length} calibrated file(s) stamped ${stamp.calibratedAt} against ${configuredEngine} ${configuredModel} ${JSON.stringify(configuredArgs)}, ${ageDays} day(s) old.`,
)
