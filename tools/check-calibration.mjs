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

import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: check-calibration.mjs [--root <path>]

  Fails when .claude/calibration.json has gone stale against the harness it stamps.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

  Five assertions, all blocking. There is deliberately no --report-only flag and no way to make this
  tool pass on drift; the escape hatch is the calibration:reseed label on the guards.yml job.

    1. every .claude/agents/*.md, .claude/skills/*/SKILL.md and .agents/skills/*/SKILL.md has a
       stamp entry. Both skill roots, because .claude holds the canonical definitions and .agents
       holds the entrypoints the Codex host discovers
    2. no stamp entry names a file that no longer exists
    3. each entry's recorded model and effort match what the file declares today, AND its recorded
       digest matches the file's complete normalized content, so rewriting a prompt body invalidates
       the verdict that was written about the old text
    4. the stamp's workerCommand, workerModel and workerArgs match what launch-worker.mjs actually
       resolves, taken from resolveWorkerInvocation itself rather than rebuilt here, so workerArgs is
       the WHOLE argument vector: engine-level args, then the models.default profile args, then the
       model. Comparing the profile half alone let engine-level tuning move without reseeding
    5. EVERY entry's own calibratedAt is a real date, is not in the future, is no older than the
       stamp date, and is at most 90 days old, the backstop for a model alias whose target moved
       without its declared string changing. Per entry rather than stamp-wide, because one date for
       the whole file meant reseeding one changed prompt renewed every untouched verdict beside it

  Reseed with: node tools/reseed-calibration.mjs, which carries an unchanged verdict's date
  forward rather than renewing it.

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
 * The stamp records the RESOLVED argument vector alongside its `model`, because the reasoning effort
 * lives in the args (`model_reasoning_effort="high"`), so a model string that never moves can still
 * have its tuning changed underneath. An args-only edit has to go red too.
 *
 * The whole vector, not the profile half: `resolveWorkerInvocation` launches
 * `[...engine.args, ...profile.args, "--model", model]`, so tuning declared at the ENGINE level is
 * just as load-bearing as tuning declared in the profile. Stamping only `models.default.args` left
 * engine-level effort outside the gate entirely.
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
if (typeof stamp.workerCommand !== "string" || stamp.workerCommand === "") {
  fail(2, "check-calibration: workerCommand must be a non-empty string, because the executable is what actually runs the work")
}
if (!Array.isArray(stamp.workerArgs) || stamp.workerArgs.some((argument) => typeof argument !== "string")) {
  fail(2, "check-calibration: workerArgs must be an array of strings, because it is the resolved launch vector and the reasoning effort lives in it")
}
if (stamp.entries === null || typeof stamp.entries !== "object" || Array.isArray(stamp.entries)) {
  fail(2, "check-calibration: entries must be an object keyed by repository-relative path")
}
for (const [path, entry] of Object.entries(stamp.entries)) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) fail(2, `check-calibration: entry ${path} must be an object`)
  if (typeof entry.verdict !== "string" || entry.verdict === "") fail(2, `check-calibration: entry ${path} carries no verdict`)
  if (typeof entry.calibratedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.calibratedAt)) {
    fail(2, `check-calibration: entry ${path} must carry its own calibratedAt YYYY-MM-DD date, got ${JSON.stringify(entry.calibratedAt)}`)
  }
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
  /**
   * BOTH skill roots, because both are read by a host at runtime. `.claude/skills/**` holds the
   * canonical definitions and `.agents/skills/**` holds the entrypoints Codex discovers, each one a
   * pointer whose frontmatter carries the name and description the host lists the skill by and whose
   * body names the canonical file. Changing an entrypoint changes which prompt runs, or stops the
   * skill being discovered at all, while every `.claude` digest stays untouched and this gate stayed
   * green. A pointer declares no `model:` and no `effort:`, so its verdict is a judgement about the
   * pointer itself and its digest is what pins it.
   */
  for (const root of [join(repositoryRoot, ".claude", "skills"), join(repositoryRoot, ".agents", "skills")]) {
    if (!existsSync(root)) continue
    const relativeRoot = root === join(repositoryRoot, ".claude", "skills") ? ".claude/skills" : ".agents/skills"
    for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(root, entry.name, "SKILL.md"))) found.push(`${relativeRoot}/${entry.name}/SKILL.md`)
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

/**
 * A digest of the file's COMPLETE normalized content, not just its two tuning scalars.
 *
 * The verdict in the stamp is a judgement about what the file ASKS THE MODEL TO DO. Rewriting a
 * skill's body makes it materially more or less demanding while `model:` and `effort:` never move, so
 * a tuning-only comparison kept blessing a verdict that was reconsidered for different text. PR #640
 * proved that miss and fixed it with full-content fingerprints; the #188 re-derivation dropped them,
 * which is how the same hole reopened. The 90-day age assertion is not a substitute: it would let a
 * rewritten prompt ride an old verdict for up to three months.
 *
 * Line endings are normalized so a CRLF checkout is not a false mismatch, and the digest is truncated
 * to 16 hex characters, which is 64 bits and far past what an accidental collision needs.
 */
const contentDigest = (relativePath) =>
  createHash("sha256").update(readFileSync(join(repositoryRoot, relativePath), "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 16)

const problems = []

const files = calibratedFiles()
if (files.length === 0) fail(2, `check-calibration: ${repositoryRoot} holds no .claude/agents/*.md, no .claude/skills/*/SKILL.md and no .agents/skills/*/SKILL.md, so this gate would prove nothing`)

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
  /**
   * The verdict is a judgement about what this file asks the model to do, so ANY content change
   * invalidates it, not only a change to the two tuning scalars. Without this, a rewritten prompt rode
   * its old verdict until the 90-day age backstop expired.
   */
  const digest = contentDigest(relativePath)
  if (typeof entry.digest !== "string" || entry.digest === "") {
    problems.push(`${relativePath} has no recorded digest, so its verdict cannot be tied to the text it was written about`)
  } else if (entry.digest !== digest) {
    problems.push(`${relativePath} changed since it was calibrated (content ${digest}, stamp ${entry.digest}); reconsider its verdict and reseed, because model and effort alone cannot see a rewritten prompt`)
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
/**
 * Resolved by the CANONICAL resolver, never rebuilt here. `resolveWorkerInvocation` prepends the
 * engine's own args before the profile's, so reading `models.default.args` alone stamped half of what
 * launches: an engine-level `-c model_reasoning_effort="low"` beside an empty profile args array left
 * this gate green while every worker launched at low effort. A gate that cannot see the tuning it
 * exists to pin is the gate-that-cannot-fail this tool was written to undo.
 */
let configuredInvocation
try {
  configuredInvocation = resolveWorkerInvocation(configuredEngine, orchestrator?.workers?.[configuredEngine], AUTHORITATIVE_TIER)
} catch (error) {
  fail(2, `check-calibration: ${error.message}, so the model-match assertion has nothing to compare against`)
}
const configuredModel = configuredInvocation.model
const configuredArgs = configuredInvocation.args
/**
 * The EXECUTABLE, which `resolveWorkerInvocation` does not return: `launch-worker.mjs:194` spawns
 * `engine.command` and the invocation only describes what is passed TO it. Swapping that command while
 * the engine key, model and args all stay put replaces the implementer entirely, and a stamp blind to
 * it stayed green across the substitution.
 */
const configuredCommand = orchestrator?.workers?.[configuredEngine]?.command
if (stamp.workerEngine !== configuredEngine) {
  problems.push(`the worker engine is ${configuredEngine} and the stamp was taken against ${stamp.workerEngine}; a different engine is a different implementer, so recalibrate`)
}
if (stamp.workerCommand !== configuredCommand) {
  problems.push(`the worker command is ${JSON.stringify(configuredCommand ?? null)} and the stamp was taken against ${JSON.stringify(stamp.workerCommand)}; a different executable is a different implementer, so recalibrate`)
}
if (stamp.workerModel !== configuredModel) {
  problems.push(`the worker model is ${configuredModel} and the stamp was taken against ${stamp.workerModel}; recalibrate in the same pull request that moved it`)
}
if (JSON.stringify(stamp.workerArgs) !== JSON.stringify(configuredArgs)) {
  problems.push(
    `the worker args are ${JSON.stringify(configuredArgs)} and the stamp was taken against ${JSON.stringify(stamp.workerArgs)}; this is the whole resolved launch vector, engine args included, so an args-only change decays the tuning exactly like a model change`,
  )
}

/**
 * Whole days, from dates rather than a clock, so the verdict cannot change inside one CI run and a
 * stamp taken today is never 0.99 days old.
 *
 * Parsed and refused HERE for every date in the file, entry dates included, because a date this
 * function accepts is a date the backstop trusts.
 */
const ageInDays = (date, label) => {
  const [year, month, day] = date.split("-").map(Number)
  const at = Date.UTC(year, month - 1, day)
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== date) {
    fail(2, `check-calibration: ${label} ${date} is not a real calendar date`)
  }
  const now = new Date()
  const age = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - at) / 86400000)
  if (age < 0) {
    fail(2, `check-calibration: ${label} ${date} is ${-age} day(s) in the FUTURE, which would disable the max-age backstop rather than satisfy it`)
  }
  return age
}
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
const ageDays = ageInDays(stamp.calibratedAt, "calibratedAt")

/**
 * The backstop is PER VERDICT, never stamp-wide.
 *
 * One date for the whole file meant recalibrating a single changed prompt and advancing that date
 * renewed every untouched verdict beside it. Ordinary prompt churn therefore held the whole stamp
 * permanently under 90 days, which is exactly the case the backstop exists for: a model alias moves
 * while every declared string stays put, and age is the only signal left. A verdict is a judgement
 * about ONE file against the model of the day, so only re-reading THAT file may renew it.
 *
 * The stamp-wide date stays, and it is the date of the last pass rather than a verdict of its own. A
 * verdict is OLDER than it whenever that verdict was carried forward, which is the ordinary case and
 * the whole point. What cannot happen is a verdict dated AFTER the pass that wrote it, so that is the
 * direction this refuses.
 */
for (const relativePath of Object.keys(stamp.entries).sort()) {
  const entryAge = ageInDays(stamp.entries[relativePath].calibratedAt, `entry ${relativePath} calibratedAt`)
  if (entryAge < ageDays) {
    problems.push(`${relativePath} is stamped ${stamp.entries[relativePath].calibratedAt}, NEWER than the ${stamp.calibratedAt} pass that wrote it; a verdict cannot be decided after its own pass, so one of the two dates is wrong`)
  }
  if (entryAge > MAX_AGE_DAYS) {
    problems.push(`${relativePath} was calibrated ${entryAge} days ago, past the ${MAX_AGE_DAYS} day backstop; a model alias can move without changing its declared string, so age is the only signal left, and reseeding a different entry does not renew this one`)
  }
}

if (problems.length > 0) {
  console.error(`Calibration stale: ${problems.length} problem(s) against ${files.length} calibrated file(s).`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error("\nRecalibrate: re-read each file named above, decide its model and effort against the running worker model, and rewrite .claude/calibration.json with today's date.")
  process.exit(1)
}

const oldestVerdictAge = Object.values(stamp.entries).reduce((oldest, entry) => Math.max(oldest, ageInDays(entry.calibratedAt, "entry calibratedAt")), 0)
console.log(
  `check-calibration: ${files.length} calibrated file(s) stamped ${stamp.calibratedAt} against ${configuredEngine} ${configuredModel} ${JSON.stringify(configuredArgs)}, oldest verdict ${oldestVerdictAge} day(s) old.`,
)
