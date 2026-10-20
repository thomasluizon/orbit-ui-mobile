#!/usr/bin/env node

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
    4. the stamp's workerCommand and every workerTiers vector match what launch-worker.mjs actually
       resolves, taken from resolveWorkerInvocation itself rather than rebuilt here. Each args value
       is the WHOLE vector: engine-level args, then the selected profile args, then the model
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
if (typeof stamp.workerEngine !== "string" || stamp.workerEngine === "") fail(2, "check-calibration: workerEngine must be a non-empty string")
if (typeof stamp.workerCommand !== "string" || stamp.workerCommand === "") {
  fail(2, "check-calibration: workerCommand must be a non-empty string, because the executable is what actually runs the work")
}
if (stamp.workerTiers === null || typeof stamp.workerTiers !== "object" || Array.isArray(stamp.workerTiers)) {
  fail(2, "check-calibration: workerTiers must be an object keyed by configured tier")
}
for (const [tier, profile] of Object.entries(stamp.workerTiers)) {
  if (profile === null || typeof profile !== "object" || Array.isArray(profile) || typeof profile.model !== "string" || profile.model === "") {
    fail(2, `check-calibration: workerTiers.${tier}.model must be a non-empty string`)
  }
  if (!Array.isArray(profile.args) || profile.args.some((argument) => typeof argument !== "string")) {
    fail(2, `check-calibration: workerTiers.${tier}.args must be an array of strings`)
  }
}
if (typeof stamp.workerTierVerdict !== "string" || stamp.workerTierVerdict.trim() === "") {
  fail(2, "check-calibration: workerTierVerdict must name which orders use each tier")
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
 * Discover files on every run so a new agent or skill cannot escape calibration.
 */
const calibratedFiles = () => {
  const found = []
  const agentsDirectory = join(repositoryRoot, ".claude", "agents")
  if (existsSync(agentsDirectory)) {
    for (const name of readdirSync(agentsDirectory).sort()) {
      if (name.endsWith(".md")) found.push(`.claude/agents/${name}`)
    }
  }
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
 * Resolved by the CANONICAL resolver, never rebuilt here. Every configured tier is stamped because
 * either can now launch a worker, and omitting one would let its effort drift without failing CI.
 */
const configuredTierNames = Object.keys(orchestrator?.workers?.[configuredEngine]?.models ?? {}).sort()
const configuredTiers = {}
try {
  if (configuredTierNames.length === 0) {
    resolveWorkerInvocation(configuredEngine, orchestrator?.workers?.[configuredEngine])
  }
  for (const tier of configuredTierNames) {
    const invocation = resolveWorkerInvocation(configuredEngine, orchestrator?.workers?.[configuredEngine], tier)
    configuredTiers[tier] = { model: invocation.model, args: invocation.args }
  }
} catch (error) {
  fail(2, `check-calibration: ${error.message}, so the model-match assertion has nothing to compare against`)
}
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
const stampedTierNames = Object.keys(stamp.workerTiers).sort()
if (JSON.stringify(stampedTierNames) !== JSON.stringify(configuredTierNames)) {
  problems.push(`the configured worker tiers are ${configuredTierNames.join(", ") || "none"} and the stamp names ${stampedTierNames.join(", ") || "none"}; recalibrate every selectable launch vector`)
}
for (const tier of configuredTierNames) {
  const configured = configuredTiers[tier]
  const stamped = stamp.workerTiers[tier]
  if (!stamped) continue
  if (stamped.model !== configured.model) {
    problems.push(`the ${tier} tier worker model is ${configured.model} and the stamp was taken against ${stamped.model}; recalibrate in the same pull request that moved it`)
  }
  if (JSON.stringify(stamped.args) !== JSON.stringify(configured.args)) {
    problems.push(`the ${tier} tier worker args are ${JSON.stringify(configured.args)} and the stamp was taken against ${JSON.stringify(stamped.args)}; this is the whole resolved launch vector, engine args included`)
  }
}

if (orchestrator.classifier) {
  if (!stamp.classifier || typeof stamp.classifier !== "object") {
    problems.push("classifier has no calibration block")
  } else {
    if (stamp.classifier.model !== orchestrator.classifier.model) problems.push(`classifier model is ${orchestrator.classifier.model} but the stamp records ${stamp.classifier.model}`)
    const digest = contentDigest("tools/lib/ticket-classifier-prompt.md")
    if (stamp.classifier.promptDigest !== digest) problems.push(`classifier prompt changed since calibration (content ${digest}, stamp ${stamp.classifier.promptDigest})`)
    if (typeof stamp.classifier.verdict !== "string" || !stamp.classifier.verdict.trim()) problems.push("classifier calibration has no verdict")
  }
}

const ageInDays = (date, label, softFuture = false) => {
  const [year, month, day] = date.split("-").map(Number)
  const at = Date.UTC(year, month - 1, day)
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== date) {
    fail(2, `check-calibration: ${label} ${date} is not a real calendar date`)
  }
  const now = new Date()
  const age = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - at) / 86400000)
  if (age < 0) {
    if (softFuture) return age
    fail(2, `check-calibration: ${label} ${date} is ${-age} day(s) in the FUTURE, which would disable the max-age backstop rather than satisfy it`)
  }
  return age
}
const ageDays = ageInDays(stamp.calibratedAt, "calibratedAt")
if (orchestrator.classifier && stamp.classifier) {
  if (typeof stamp.classifier.calibratedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(stamp.classifier.calibratedAt)) {
    problems.push("classifier calibratedAt must be a YYYY-MM-DD date")
  } else {
    const classifierAge = ageInDays(stamp.classifier.calibratedAt, "classifier calibratedAt", true)
    if (classifierAge < 0) problems.push(`classifier calibratedAt is ${-classifierAge} day(s) in the FUTURE`)
    if (classifierAge < ageDays) problems.push("classifier calibration is newer than its stamp pass")
    if (classifierAge > MAX_AGE_DAYS) problems.push(`classifier was calibrated ${classifierAge} days ago, past the ${MAX_AGE_DAYS} day backstop`)
  }
}

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
  `check-calibration: ${files.length} calibrated file(s) stamped ${stamp.calibratedAt} against ${configuredEngine} tiers ${configuredTierNames.join(", ")}, oldest verdict ${oldestVerdictAge} day(s) old.`,
)
