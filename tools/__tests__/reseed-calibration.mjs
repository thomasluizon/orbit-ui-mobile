import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, check, root } from "./_harness.mjs"

const TOOL = "reseed-calibration.mjs"

const AGENT = ["---", "name: design-reviewer", "model: sonnet", "effort: medium", "---", "", "body", ""].join("\n")
const SKILL = ["---", "name: ticket", "effort: high", "---", "", "body", ""].join("\n")
const POINTER = ["---", "name: ticket", "description: pointer", "---", "", "The canonical definition is .claude/skills/ticket/SKILL.md.", ""].join("\n")
const CLASSIFIER_PROMPT = "Classify the ticket.\n"
const digestOf = (body) => createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16)

const write = (path, body) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body, "utf8")
  return path
}

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

/**
 * Every path the pass will glob, derived from the REAL tree rather than written down.
 *
 * The tool refuses a verdict naming a file that is not in the tree, which is the guard that catches a
 * deleted skill whose verdict was left behind. A hand-picked three-file fixture therefore cannot run
 * it at all: 25 of its verdicts would name files the fixture does not have. Deriving the inventory
 * keeps the fixture complete by construction and never churns when a skill is added.
 */
const inventory = () => {
  const found = []
  for (const name of readdirSync(join(REPO_ROOT, ".claude", "agents")).sort()) {
    if (name.endsWith(".md")) found.push({ path: `.claude/agents/${name}`, body: AGENT })
  }
  for (const relativeRoot of [".claude/skills", ".agents/skills"]) {
    const absolute = join(REPO_ROOT, ...relativeRoot.split("/"))
    if (!existsSync(absolute)) continue
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isDirectory() && existsSync(join(absolute, entry.name, "SKILL.md"))) {
        found.push({ path: `${relativeRoot}/${entry.name}/SKILL.md`, body: relativeRoot === ".agents/skills" ? POINTER : SKILL })
      }
    }
  }
  return found
}

/** Resolved inside cases(), never at import time: REPO_ROOT is set by the runner's configure() call
 * and a module-level read would depend on that happening first. */
let FILES = []
let COUNT = 0
let A_SKILL = ""
let A_POINTER = null

const stage = (label, stamp) => {
  const fixture = join(root, "reseed-calibration", label)
  for (const file of FILES) write(join(fixture, ...file.path.split("/")), file.body)
  write(join(fixture, "tools", "lib", "ticket-classifier-prompt.md"), CLASSIFIER_PROMPT)
  const casesText = readFileSync(join(REPO_ROOT, "tools", "__fixtures__", "ticket-classifier-cases.json"), "utf8")
  const responsesText = readFileSync(join(REPO_ROOT, "tools", "__fixtures__", "ticket-classifier-responses.json"), "utf8")
  const caseCount = JSON.parse(casesText).length
  write(join(fixture, "tools", "__fixtures__", "ticket-classifier-cases.json"), casesText)
  write(join(fixture, "tools", "__fixtures__", "ticket-classifier-responses.json"), responsesText)
  write(join(fixture, "tools", "__fixtures__", "ticket-classifier-calibration.json"), `${JSON.stringify({
    model: "gpt-6-luna", promptDigest: digestOf(CLASSIFIER_PROMPT), casesDigest: digestOf(casesText),
    responsesDigest: digestOf(responsesText), calibratedAt: daysAgo(0), agreement: `${caseCount}/${caseCount}`,
    verdict: `classifier matched all ${caseCount} recorded ticket cases`,
  }, null, 2)}\n`)
  write(
    join(fixture, ".claude", "orchestrator.json"),
    `${JSON.stringify(
      { worker: "codex", classifier: { model: "gpt-6-luna" }, workers: { codex: { command: "codex", args: ["exec"], models: { default: { model: "gpt-5.6-sol", args: [] }, mechanical: { model: "gpt-5.6-sol", args: ["-c", 'model_reasoning_effort="medium"'] } } } } },
      null,
      2,
    )}\n`,
  )
  if (stamp) write(join(fixture, ".claude", "calibration.json"), `${JSON.stringify(stamp, null, 2)}\n`)
  return fixture
}

/** Never throws: a crash inside a case module aborts the WHOLE harness run and hides every case
 * after it, so a missing stamp fails its own assertion instead. */
const stampOf = (fixture) => {
  try {
    return JSON.parse(readFileSync(join(fixture, ".claude", "calibration.json"), "utf8"))
  } catch {
    return { entries: {} }
  }
}

/** The same stamp with the pass and every verdict backdated. */
const backdated = (stamp, days, overrides = {}) => ({
  ...stamp,
  calibratedAt: daysAgo(days),
  entries: Object.fromEntries(Object.entries(stamp.entries).map(([path, entry]) => [path, { ...entry, calibratedAt: daysAgo(days) }])),
  ...overrides,
})

export const cases = () => {
  FILES = inventory()
  COUNT = FILES.length
  A_SKILL = FILES.find((file) => file.path.startsWith(".claude/skills/"))?.path ?? ""
  A_POINTER = FILES.find((file) => file.path.startsWith(".agents/skills/"))?.path ?? null

  T(`${TOOL}: the derived inventory found something to stamp`, COUNT > 0 && A_POINTER !== null, `found ${COUNT} file(s), pointer ${A_POINTER}`)

  /**
   * The denominator is a glob over BOTH skill roots, so the host entrypoint the Codex host discovers
   * is stamped alongside the canonical definition it points at. A pass that wrote only `.claude` left
   * the file that decides WHICH prompt runs outside the gate entirely.
   */
  const fresh = stage("fresh")
  check(TOOL, "a first pass stamps every agent, skill and host entrypoint it finds", ["--root", fresh], {
    status: 0,
    stdout: new RegExp(`stamped ${COUNT} file\\(s\\)`),
  })
  const first = stampOf(fresh)
  T(`${TOOL}: a first pass stamps the classifier model and prompt`, first.classifier?.model === "gpt-6-luna" && first.classifier.promptDigest === createHash("sha256").update(CLASSIFIER_PROMPT).digest("hex").slice(0, 16) && typeof first.classifier.verdict === "string")
  T(
    `${TOOL}: the first pass stamped the .agents host entrypoints, not only the .claude definitions`,
    Object.keys(first.entries).includes(A_POINTER),
    `entries were ${Object.keys(first.entries).join(", ")}`,
  )
  T(
    `${TOOL}: every entry carries its own calibratedAt, which is what the per-verdict backstop reads`,
    Object.values(first.entries).every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.calibratedAt)),
    `entries were ${JSON.stringify(Object.values(first.entries)[0])}`,
  )

  /**
   * The reason a verdict carries its own date. A pass that renewed every date on every run let
   * ordinary prompt churn hold the whole stamp permanently under the 90-day alias backstop, so an
   * untouched verdict has to come back with the date it already had.
   */
  const aged = stage("aged", backdated(first, 200, { classifier: { ...first.classifier, calibratedAt: daysAgo(30) } }))
  check(TOOL, "an unchanged verdict keeps its own date rather than being renewed", ["--root", aged], {
    status: 0,
    stdout: new RegExp(`0 verdict\\(s\\) renewed, ${COUNT} carried forward`),
  })
  T(
    `${TOOL}: the carried-forward date is the OLD one, so the backstop still sees the age`,
    stampOf(aged).entries[A_SKILL].calibratedAt === daysAgo(200),
    `the entry date was ${stampOf(aged).entries[A_SKILL].calibratedAt}, expected ${daysAgo(200)}`,
  )
  T(`${TOOL}: an unchanged classifier keeps its own calibration date`, stampOf(aged).classifier.calibratedAt === daysAgo(30))
  const classifierMoved = stage("classifier-model-moved", first)
  const movedConfigPath = join(classifierMoved, ".claude", "orchestrator.json")
  const movedConfig = JSON.parse(readFileSync(movedConfigPath, "utf8"))
  movedConfig.classifier.model = "gpt-6-next"
  write(movedConfigPath, `${JSON.stringify(movedConfig, null, 2)}\n`)
  check(TOOL, "model drift cannot be reseeded without a matching live classifier run", ["--root", classifierMoved], {
    nonZero: true,
    stderr: /classifier.*record/i,
  })
  T(`${TOOL}: failed model reseed preserves the old stamp`, stampOf(classifierMoved).classifier.model === "gpt-6-luna")
  const movedRecordPath = join(classifierMoved, "tools", "__fixtures__", "ticket-classifier-calibration.json")
  const movedRecord = JSON.parse(readFileSync(movedRecordPath, "utf8"))
  movedRecord.model = "gpt-6-next"
  write(movedRecordPath, `${JSON.stringify(movedRecord, null, 2)}\n`)
  check(TOOL, "matching recorder evidence permits model recalibration", ["--root", classifierMoved], { status: 0, stdout: /stamped/ })
  T(`${TOOL}: matching model evidence supplies the verdict and date`, stampOf(classifierMoved).classifier.model === "gpt-6-next" && stampOf(classifierMoved).classifier.verdict === movedRecord.verdict && stampOf(classifierMoved).classifier.calibratedAt === movedRecord.calibratedAt)
  const classifierPromptMoved = stage("classifier-prompt-moved", first)
  write(join(classifierPromptMoved, "tools", "lib", "ticket-classifier-prompt.md"), `${CLASSIFIER_PROMPT}Changed.\n`)
  check(TOOL, "prompt drift cannot be reseeded without a matching live classifier run", ["--root", classifierPromptMoved], {
    nonZero: true,
    stderr: /classifier.*record/i,
  })
  T(`${TOOL}: failed prompt reseed preserves the old stamp`, stampOf(classifierPromptMoved).classifier.promptDigest === first.classifier.promptDigest)
  const staleResponses = stage("classifier-stale-responses", first)
  const staleConfigPath = join(staleResponses, ".claude", "orchestrator.json")
  const staleConfig = JSON.parse(readFileSync(staleConfigPath, "utf8"))
  staleConfig.classifier.model = "gpt-6-next"
  write(staleConfigPath, `${JSON.stringify(staleConfig, null, 2)}\n`)
  const staleRecordPath = join(staleResponses, "tools", "__fixtures__", "ticket-classifier-calibration.json")
  const staleRecord = JSON.parse(readFileSync(staleRecordPath, "utf8"))
  staleRecord.model = "gpt-6-next"
  write(staleRecordPath, `${JSON.stringify(staleRecord, null, 2)}\n`)
  write(join(staleResponses, "tools", "__fixtures__", "ticket-classifier-responses.json"), "{}\n")
  check(TOOL, "changed responses invalidate an otherwise matching recorder record", ["--root", staleResponses], { nonZero: true, stderr: /classifier recorder record does not match/ })

  /** A file whose CONTENT moved is the one case that must be renewed, and only that file. */
  const edited = stage("edited", backdated(first, 200))
  write(join(edited, ...A_SKILL.split("/")), `${SKILL}a rewritten body\n`)
  check(TOOL, "only the file whose content moved is renewed", ["--root", edited], {
    status: 0,
    stdout: new RegExp(`1 verdict\\(s\\) renewed, ${COUNT - 1} carried forward`),
  })

  /** A changed HOST ENTRYPOINT is renewed too, which is the file the old denominator could not see. */
  const pointerEdited = stage("pointer-edited", backdated(first, 200))
  write(join(pointerEdited, ...A_POINTER.split("/")), `${POINTER}a changed pointer\n`)
  check(TOOL, "a changed .agents host entrypoint is renewed, so its verdict cannot ride the old text", ["--root", pointerEdited], {
    status: 0,
    stdout: new RegExp(`1 verdict\\(s\\) renewed, ${COUNT - 1} carried forward`),
  })

  /**
   * A worker change decays EVERY verdict at once, because each one is a judgement about a file
   * against the model that reads it. Carrying dates forward there would be the same silent renewal
   * in the opposite direction.
   */
  const moved = stage("worker-moved", backdated(first, 200, {
    workerTiers: { ...first.workerTiers, default: { ...first.workerTiers.default, model: "gpt-6-next" } },
  }))
  check(TOOL, "a moved worker model renews every verdict, because it decays all of them at once", ["--root", moved], {
    status: 0,
    stdout: new RegExp(`${COUNT} verdict\\(s\\) renewed, 0 carried forward`),
  })

  /** A file with no written verdict is refused rather than stamped with a guess. */
  const unverdicted = stage("unverdicted")
  write(join(unverdicted, ".claude", "skills", "not-a-real-skill", "SKILL.md"), SKILL)
  check(TOOL, "a file with no written verdict is refused rather than stamped with a guess", ["--root", unverdicted], {
    nonZero: true,
    stderr: /no verdict written for: \.claude\/skills\/not-a-real-skill\/SKILL\.md/,
  })

  /**
   * The other direction, and the one that catches a deleted skill: a verdict left behind in the
   * table after its file is gone would otherwise rot there unnoticed, because the stamp is built from
   * the tree and simply never writes it.
   */
  const deleted = join(root, "reseed-calibration", "deleted-file")
  for (const file of FILES.filter((entry) => entry.path !== A_SKILL)) write(join(deleted, ...file.path.split("/")), file.body)
  write(
    join(deleted, ".claude", "orchestrator.json"),
    `${JSON.stringify({ worker: "codex", workers: { codex: { command: "codex", args: ["exec"], models: { default: { model: "gpt-5.6-sol", args: [] }, mechanical: { model: "gpt-5.6-sol", args: ["-c", 'model_reasoning_effort="medium"'] } } } } }, null, 2)}\n`,
  )
  check(TOOL, "a verdict whose file is gone is refused, so a deleted skill cannot leave one behind", ["--root", deleted], {
    nonZero: true,
    stderr: new RegExp(`verdict written for a file that is not in the tree: ${A_SKILL.replaceAll("/", "\\/").replaceAll(".", "\\.")}`),
  })
}
