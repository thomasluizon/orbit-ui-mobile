#!/usr/bin/env node
/**
 * The calibration pass: the producer of `.claude/calibration.json`, which `check-calibration.mjs`
 * is the consumer of.
 *
 * Every `model`, `effort` and digest in the stamp is READ from the tree, so the committed stamp is
 * the real output of a run rather than a hand-written table. The VERDICTS below are the judgement
 * half, one per file, and they are the only part a person writes.
 *
 * It lives here rather than beside the pull request that first needed it, because a producer kept
 * outside the repository is a producer nobody can rerun: the gate then says "reseed" and names no
 * command that does it.
 *
 * A verdict keeps its OWN `calibratedAt`, and this pass renews that date only for a file whose
 * content, model or effort actually moved. Renewing every date on every run is what let ordinary
 * prompt churn hold the whole stamp permanently under the 90-day alias backstop.
 *
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"

import { resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: reseed-calibration.mjs [--root <path>]

  Rewrites .claude/calibration.json from the tree, so the stamp check-calibration.mjs reads is the
  real output of a pass rather than a hand-written table.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

  Every model, effort and content digest is READ from the file it describes. The verdicts are the
  judgement half and live in this file, one per agent, skill and host entrypoint; a file with no
  verdict, or a verdict naming a file that is not in the tree, is refused rather than guessed.

  A verdict keeps its OWN calibratedAt and this pass renews that date only when the file's content,
  model, effort or verdict moved, or when the worker launch vector moved and decayed all of them at
  once. Renewing every date on every run is what let ordinary prompt churn hold the whole stamp
  permanently under the 90-day alias backstop.

exit codes: 0 the stamp was written, 1 a file has no verdict or a verdict names no file, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const argv = process.argv.slice(2)
const rootFlag = argv.indexOf("--root")
// `rootFlag + 1` is 0 when the flag is absent, which silently whitelisted the FIRST argument, so the
// allowed positions only exist when the flag itself does.
const allowed = rootFlag === -1 ? [] : [rootFlag, rootFlag + 1]
if (argv.some((argument, index) => !allowed.includes(index)) || (rootFlag !== -1 && argv[rootFlag + 1] === undefined)) {
  console.error(`reseed-calibration: invalid arguments

${USAGE}`)
  process.exit(2)
}

const root = resolve(rootFlag === -1 ? join(dirname(fileURLToPath(import.meta.url)), "..") : argv[rootFlag + 1])

const VERDICTS = {
  ".claude/agents/audit-readonly.md":
    "current: a read-only fan-out finder over Read/Grep/Glob, so haiku is the right floor and no effort is declared because the work is enumeration rather than judgement.",
  ".claude/agents/completeness-critic.md":
    "current: its whole job is to falsify a completion claim across a surface inventory, which is judgement, so sonnet at high effort is right and must not fall to haiku.",
  ".claude/agents/design-reviewer.md":
    "current: judges a diff against DESIGN.md with the spec in front of it, so sonnet at medium effort is right; the rules are written down, which is what keeps it off high.",
  ".claude/agents/design-specialist.md":
    "current: shapes the UI half of a ticket and must refuse to improvise where the design system cannot meet a need, so it inherits the session model at high effort deliberately.",
  ".claude/agents/Explore.md":
    "current: locates code and returns excerpts, never reviews it, so haiku is the right floor and effort is undeclared because breadth is passed in the prompt.",
  ".claude/agents/product-manager.md":
    "current: runs the eight-category edge-case pass and decides how many tickets a request becomes, so it inherits the session model at high effort.",
  ".claude/agents/web-researcher.md":
    "current: verifies load-bearing facts against live pages for one narrow slice, so sonnet at medium effort is right; it has no Agent tool, which is the structural cap that matters more than the model.",
  ".claude/skills/android-generate/SKILL.md":
    "current: a mechanical gradle build and emulator install, so low effort is right.",
  ".claude/skills/android-release/SKILL.md":
    "current: dispatches one workflow with computed version numbers, so low effort is right.",
  ".claude/skills/audit-code-quality/SKILL.md":
    "undeclared, inherits the session: a judgement-level debt audit that opens tickets, which argues for an explicit high. Left undeclared in this first pass because declaring it changes behaviour and cost, and eleven skills are in the same position; that is the follow-up this pass names rather than a change smuggled into the mechanism.",
  ".claude/skills/audit-performance/SKILL.md":
    "undeclared, inherits the session: same shape as audit-code-quality and the same follow-up.",
  ".claude/skills/audit-security/SKILL.md":
    "undeclared, inherits the session: same shape as audit-code-quality and the same follow-up. This is the one where an inherited low effort would cost the most, because a missed authz hole is not visible in the output.",
  ".claude/skills/audit-tests/SKILL.md":
    "undeclared, inherits the session: same shape as audit-code-quality and the same follow-up.",
  ".claude/skills/deep-research/SKILL.md":
    "undeclared, inherits the session: it fans out web-researcher subagents that carry their own sonnet/medium tuning, so the orchestrating half inheriting the session is defensible today.",
  ".claude/skills/dev-server/SKILL.md":
    "current: brings up Docker, the API and the web server in dependency order with readiness gates, which is mechanical, so low effort is right.",
  ".claude/skills/handoff/SKILL.md":
    "current: high effort, and it earns it: it decides what a fresh session cannot rediscover, and under-thinking it is how a handoff loses the one fact written nowhere else.",
  ".claude/skills/investigate/SKILL.md":
    "undeclared, inherits the session: root-causing a production incident across Sentry, Render, Postgres and the LSP is judgement, so this is a follow-up candidate.",
  ".claude/skills/lesson/SKILL.md":
    "undeclared, inherits the session: it graduates a correction into a rule, which is judgement, but it always runs with Thomas present, so an inherited effort is checked by a human in the moment.",
  ".claude/skills/merge-prs/SKILL.md":
    "undeclared, inherits the session: the dangerous half of this skill is mechanical (an exact-head preflight, an ordered admin squash), and its safety comes from the preflight rather than from reasoning depth.",
  ".claude/skills/orchestrate/SKILL.md":
    "current: high effort, and it earns it: it plans the queue, verifies delivery from artifacts and clears the review, and it is the entry point every other piece of work passes through.",
  ".claude/skills/prod-readiness/SKILL.md":
    "undeclared, inherits the session: it consolidates four child audits into one honest launch verdict, which is judgement, so this is a follow-up candidate.",
  ".claude/skills/second-opinion/SKILL.md":
    "current with nothing to declare: the reasoning happens in the other model, by construction. Declaring an effort here would tune the wrong side of the call.",
  ".claude/skills/sleep/SKILL.md":
    "undeclared, inherits the session: it takes every decision alone overnight, which is the strongest argument for an explicit high in the follow-up, and the weakest place to guess it in this pass.",
  ".claude/skills/ticket/SKILL.md":
    "current: high effort, and it earns it: a ticket is the prompt (D2), so a shallow ticket is a shallow implementation, and the cost lands on whoever executes it.",
  ".claude/skills/validate/SKILL.md":
    "current: runs lint, type-check and tests across both repos, so low effort is right.",
  ".agents/skills/merge-prs/SKILL.md":
    "current: a pointer with no behaviour, so it declares no model and no effort and inherits whatever the Codex host runs. Its digest is the whole verdict: the frontmatter name and description decide whether Codex finds this skill at all, and the body names the one canonical definition both hosts read.",
  ".agents/skills/orchestrate/SKILL.md":
    "current: a pointer with no behaviour, so it declares no model and no effort and inherits whatever the Codex host runs. Its digest is the whole verdict, and it matters most here: orchestrate is the entry point every other piece of work passes through, so a pointer that stops resolving takes the whole queue with it.",
  ".agents/skills/ticket/SKILL.md":
    "current: a pointer with no behaviour, so it declares no model and no effort and inherits whatever the Codex host runs. Its digest is the whole verdict, because a ticket is the prompt (D2) and a host that reads a forked definition writes a forked ticket.",
}

const tuningOf = (relativePath) => {
  const body = readFileSync(join(root, relativePath), "utf8")
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const tuning = { model: null, effort: null }
  if (!match) return tuning
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(model|effort):\s*(\S.*?)\s*$/)
    if (field) tuning[field[1]] = field[2].replace(/^["']|["']$/g, "")
  }
  return tuning
}

/** The same denominator `check-calibration.mjs` derives, including BOTH skill roots: `.claude` holds
 * the canonical definitions and `.agents` holds the entrypoints the Codex host discovers. */
const files = []
for (const name of readdirSync(join(root, ".claude", "agents")).sort()) {
  if (name.endsWith(".md")) files.push(`.claude/agents/${name}`)
}
for (const relativeRoot of [".claude/skills", ".agents/skills"]) {
  const absolute = join(root, ...relativeRoot.split("/"))
  if (!existsSync(absolute)) continue
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory() && existsSync(join(absolute, entry.name, "SKILL.md"))) {
      files.push(`${relativeRoot}/${entry.name}/SKILL.md`)
    }
  }
}

const missing = files.filter((file) => !VERDICTS[file])
if (missing.length > 0) throw new Error(`no verdict written for: ${missing.join(", ")}`)
const extra = Object.keys(VERDICTS).filter((file) => !files.includes(file))
if (extra.length > 0) throw new Error(`verdict written for a file that is not in the tree: ${extra.join(", ")}`)

const config = JSON.parse(readFileSync(join(root, ".claude", "orchestrator.json"), "utf8"))
// The ENGINE comes from config.worker, the same key launch-worker.mjs:115 reads. The invocation comes
// from resolveWorkerInvocation itself rather than being rebuilt here, so the stamp records the WHOLE
// vector that launches: engine args, then the models.default profile args, then the model. Reading
// models.default.args alone left engine-level reasoning effort outside the gate entirely.
/**
 * The canonical resolver, imported from THIS tool's own directory rather than from `--root`. Loading
 * it out of the target tree made the pass unrunnable against any root that is not a full checkout,
 * its own test fixtures included, and it was never the right source anyway: the resolver that decides
 * what a worker launches is the one shipped beside the launcher, not one found next to the files
 * being stamped.
 */
const workerEngine = config.worker
const invocation = resolveWorkerInvocation(workerEngine, config.workers[workerEngine], "default")
// The executable itself, which resolveWorkerInvocation does not return: launch-worker.mjs spawns
// engine.command and the invocation only describes what is passed TO it.
const workerCommand = config.workers[workerEngine].command
const workerModel = invocation.model
const workerArgs = invocation.args

const now = new Date()
const calibratedAt = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`

const stampPath = join(root, ".claude", "calibration.json")
const previous = existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, "utf8")) : { entries: {} }
/**
 * A worker change decays EVERY verdict at once, because each one is a judgement about a file against
 * the model that reads it. A file change decays only its own. So the whole stamp is re-dated when the
 * launch vector moves, and otherwise a date is carried forward untouched.
 */
const workerMoved =
  previous.workerEngine !== workerEngine ||
  previous.workerCommand !== workerCommand ||
  previous.workerModel !== workerModel ||
  JSON.stringify(previous.workerArgs) !== JSON.stringify(workerArgs)

const entries = {}
let renewed = 0
for (const file of files) {
  const tuning = tuningOf(file)
  const digest = createHash("sha256")
    .update(readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 16)
  const before = previous.entries?.[file]
  const unchanged =
    !workerMoved &&
    typeof before?.calibratedAt === "string" &&
    before.digest === digest &&
    (before.model ?? null) === (tuning.model ?? null) &&
    (before.effort ?? null) === (tuning.effort ?? null) &&
    before.verdict === VERDICTS[file]
  if (!unchanged) renewed += 1
  entries[file] = {
    model: tuning.model,
    effort: tuning.effort,
    digest,
    calibratedAt: unchanged ? before.calibratedAt : calibratedAt,
    verdict: VERDICTS[file],
  }
}

const stamp = {
  calibratedAt,
  workerEngine,
  workerCommand,
  workerModel,
  workerArgs,
  workerModelSource:
    'resolveWorkerInvocation(config.worker, ..., "default") in tools/lib/orchestrator-config.mjs, the exact vector launch-worker.mjs launches: engine args, then models.default args, then the model',
  entries,
}

writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
console.log(
  `stamped ${files.length} file(s) at ${calibratedAt} against ${workerEngine} ${workerModel} ${JSON.stringify(workerArgs)}; ${renewed} verdict(s) renewed, ${files.length - renewed} carried forward.`,
)
