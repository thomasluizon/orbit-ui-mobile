#!/usr/bin/env node
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
  once. An expired classifier stamp also renews from a fresh matching recorder record. Renewing every
  date on every run is what let ordinary prompt churn hold the stamp under the 90-day backstop.

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
    "undeclared, inherits the session: the debt audit makes judgment calls and opens tickets; an explicit high effort would change cost.",
  ".claude/skills/audit-performance/SKILL.md":
    "undeclared, inherits the session: the performance audit makes judgment calls and opens tickets.",
  ".claude/skills/audit-security/SKILL.md":
    "undeclared, inherits the session: security findings need judgment because missed authorization gaps may be invisible in output.",
  ".claude/skills/audit-tests/SKILL.md":
    "undeclared, inherits the session: the test audit judges coverage and opens tickets.",
  ".claude/skills/deep-research/SKILL.md":
    "undeclared, inherits the session: it fans out web-researcher subagents that carry their own sonnet/medium tuning, so the orchestrating half inheriting the session is defensible today.",
  ".claude/skills/dev-server/SKILL.md":
    "current: brings up Docker, the API and the web server in dependency order with readiness gates, which is mechanical, so low effort is right.",
  ".claude/skills/drift-review/SKILL.md":
    "undeclared, inherits the session: it judges repeated evidence against the current workflow files, but every result remains a staged candidate for human review.",
  ".claude/skills/handoff/SKILL.md":
    "current: high effort; the skill decides which durable rules enter the spec and when handoff must end the session.",
  ".claude/skills/investigate/SKILL.md":
    "undeclared, inherits the session: root-causing a production incident across Sentry, Render, Postgres and the LSP is judgement, so this is a follow-up candidate.",
  ".claude/skills/lesson/SKILL.md":
    "undeclared, inherits the session: it graduates a correction into a rule, which is judgement, but it always runs with the owner present, so an inherited effort is checked by a human in the moment.",
  ".claude/skills/merge-prs/SKILL.md":
    "undeclared, inherits the session: the dangerous half of this skill is mechanical (an exact-head preflight, an ordered admin squash), and its safety comes from the preflight rather than from reasoning depth.",
  ".claude/skills/orchestrate/SKILL.md":
    "current: high effort; the skill plans the queue, verifies each pull request disposition and merge commit, interprets gate results, and controls merge authority.",
  ".claude/skills/prod-readiness/SKILL.md":
    "undeclared, inherits the session: it judges four child audits before producing a launch verdict.",
  ".claude/skills/progress/SKILL.md":
    "current: medium effort; it reads live git and ticket state, resolves integration per repository, and distinguishes ancestry from stacked squash boundaries.",
  ".claude/skills/questions/SKILL.md":
    "current: high effort, because the filter decides what NOT to ask, and a wrong call either wastes the owner's attention or ships a guess as a decision.",
  ".claude/skills/second-opinion/SKILL.md":
    "current with nothing to declare: the reasoning happens in the other model, by construction. Declaring an effort here would tune the wrong side of the call.",
  ".claude/skills/sleep/SKILL.md":
    "undeclared, inherits the session: it makes overnight queue decisions, including whether configured lanes are available.",
  ".claude/skills/ticket/SKILL.md":
    "current: high effort, and it earns it: a ticket is the prompt (D2), so a shallow ticket is a shallow implementation, and the cost lands on whoever executes it.",
  ".claude/skills/validate/SKILL.md":
    "current: runs lint, type-check and tests across both repos, so low effort is right.",
  ".claude/skills/wrap-up/SKILL.md":
    "current: medium effort; the skill invokes three steps in order and waits for the owner between handovers, including under --sleep.",
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
// The ENGINE comes from config.worker, the same key launch-worker.mjs:129 reads. The invocation comes
// from resolveWorkerInvocation itself rather than being rebuilt here, so the stamp records the WHOLE
// vector that launches: engine args, then the selected profile args, then the model.
const workerEngine = config.worker
// The executable itself, which resolveWorkerInvocation does not return: launch-worker.mjs spawns
// engine.command and the invocation only describes what is passed TO it.
const workerCommand = config.workers[workerEngine].command
const workerTiers = Object.fromEntries(Object.keys(config.workers[workerEngine].models).sort().map((tier) => {
  const invocation = resolveWorkerInvocation(workerEngine, config.workers[workerEngine], tier)
  return [tier, { model: invocation.model, args: invocation.args }]
}))
const workerTierVerdict = "default handles product, design, architecture, and ambiguous orders requiring judgment; mechanical handles merge-forward work, known conflict lists, and reviewer-directed test experiments"

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
  JSON.stringify(previous.workerTiers) !== JSON.stringify(workerTiers) ||
  previous.workerTierVerdict !== workerTierVerdict

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

const digest = (body) => createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16)
const classifierDigest = digest(readFileSync(join(root, "tools/lib/ticket-classifier-prompt.md"), "utf8"))
const oldestValidClassifierDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90)).toISOString().slice(0, 10)
const validClassifierDate = (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date &&
  date >= oldestValidClassifierDate && date <= calibratedAt
const classifierUnchanged = previous.classifier?.model === config.classifier.model &&
  previous.classifier.promptDigest === classifierDigest &&
  validClassifierDate(previous.classifier.calibratedAt) &&
  typeof previous.classifier.verdict === "string" && previous.classifier.verdict.trim()
let classifierCalibration = previous.classifier
if (!classifierUnchanged) {
  const recordPath = join(root, "tools/__fixtures__/ticket-classifier-calibration.json")
  if (!existsSync(recordPath)) throw new Error("classifier calibration needs a live recorder record; run node tools/record-classifier-fixtures.mjs")
  const record = JSON.parse(readFileSync(recordPath, "utf8"))
  const casesText = readFileSync(join(root, "tools/__fixtures__/ticket-classifier-cases.json"), "utf8")
  const responsesText = readFileSync(join(root, "tools/__fixtures__/ticket-classifier-responses.json"), "utf8")
  const count = JSON.parse(casesText).length
  const date = record.calibratedAt
  if (record.model !== config.classifier.model || record.promptDigest !== classifierDigest ||
    record.casesDigest !== digest(casesText) || record.responsesDigest !== digest(responsesText) ||
    record.agreement !== `${count}/${count}` || record.verdict !== `classifier matched all ${count} recorded ticket cases` || !validClassifierDate(date)) {
    throw new Error("classifier recorder record does not match the configured model, prompt, cases, responses and complete agreement")
  }
  classifierCalibration = { model: record.model, promptDigest: record.promptDigest, calibratedAt: date, verdict: record.verdict }
}
const stamp = {
  calibratedAt,
  classifier: classifierCalibration,
  workerEngine,
  workerCommand,
  workerTiers,
  workerTierVerdict,
  workerModelSource:
    "resolveWorkerInvocation(config.worker, ..., tier) in tools/lib/orchestrator-config.mjs for every configured tier, with each exact launch vector: engine args, then selected profile args, then the model",
  entries,
}

writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
console.log(
  `stamped ${files.length} file(s) at ${calibratedAt} against ${workerEngine} tiers ${Object.keys(workerTiers).join(", ")}; ${renewed} verdict(s) renewed, ${files.length - renewed} carried forward.`,
)
