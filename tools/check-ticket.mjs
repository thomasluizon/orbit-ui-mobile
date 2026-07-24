#!/usr/bin/env node
/**
 * The ticket-template checker (REBUILD.md 6.2): a ticket a fresh agent cannot
 * execute is a defective ticket, and a checker rejects it BEFORE a worker
 * burns a worktree discovering that. Validates one Linear issue (fetched via
 * the orca CLI) or a local markdown body.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const USAGE = `usage: check-ticket.mjs --issue ORB-12 | --file body.md

  --issue ORB-12   validate a Linear issue (body + labels + relations, fetched via the orca CLI)
  --file body.md   validate a drafted body before creation (no labels/relations checks)
  --help, -h       print this usage and exit 0

exit codes: 0 ticket ok, 1 defective ticket (problems listed on stderr), 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

/** Section names the body must carry as markdown headings (any level). */
const REQUIRED_SECTIONS = [
  { pattern: /^#+\s*(problem|why)\b/im, name: "Problem / why it matters" },
  { pattern: /^#+\s*scope\b/im, name: "Scope" },
  { pattern: /^#+\s*out of scope\b/im, name: "Out of scope" },
  { pattern: /^#+\s*(expected behaviou?r|behaviou?r)\b/im, name: "Expected behaviour" },
  { pattern: /^#+\s*(technical details|approach)\b/im, name: "Technical details" },
  { pattern: /^#+\s*(affected|files|modules)\b/im, name: "Affected modules / files" },
  { pattern: /^#+\s*acceptance criteria\b/im, name: "Acceptance criteria" },
  { pattern: /^#+\s*test scenarios\b/im, name: "Test scenarios" },
]

/** D4: one ticket = one repo. repo:both is a defect, not a label. */
const REPO_LABELS = ["repo:ui", "repo:api", "repo:landing"]

const problems = []
const require_ = (condition, message) => {
  if (!condition) problems.push(message)
}

const validateBody = (body) => {
  for (const section of REQUIRED_SECTIONS) {
    require_(section.pattern.test(body), `missing section: ${section.name}`)
  }
  const criteria = body.split(/^#+[ \t]+/m).find((chunk) => /^acceptance criteria/i.test(chunk)) ?? ""
  require_(
    (criteria.match(/^\s*[-*]\s+|^\s*\d+\.\s+/gm) || []).length >= 2,
    "acceptance criteria needs at least 2 checkable items",
  )
  require_(!/\b(TBD|TODO|FIXME|\?\?\?)\b/.test(body), "body carries TBD/TODO placeholders; resolve before dispatch")
  require_(!/\u2014/.test(body), "body carries an em dash (banned everywhere)")
  const visibleEffect = /\b(screen|page|component|modal|sheet|button|copy|string|animation|style|design)\b/i.test(body)
  if (visibleEffect) {
    require_(
      /visible-effect|screenshot|pixel evidence/i.test(body),
      "body smells user-visible but does not carry the visible-effect evidence contract (D7): state that a screenshot is required to reach In Review",
    )
  }
}

const validateTitle = (title) => {
  require_(title.length >= 12, "title too short to be executable")
  require_(!/\b(maybe|somehow|stuff|things|misc)\b/i.test(title), "title is vague")
  require_(!/\u2014/.test(title), "title carries an em dash")
}

const validateLabels = (labels) => {
  const repoLabels = labels.filter((label) => REPO_LABELS.includes(label))
  require_(repoLabels.length === 1, `exactly ONE repo label required (${REPO_LABELS.join(", ")}); found: ${repoLabels.join(", ") || "none"}. Cross-repo work is TWO tickets, api blocks ui (D4)`)
  require_(!labels.includes("repo:both"), "repo:both is banned (D4): split into an api ticket that blocks a ui ticket")
  if (repoLabels[0] === "repo:ui") {
    require_(
      labels.includes("parity:yes") || labels.includes("parity:no"),
      "ui tickets must declare parity:yes (web+mobile in one PR) or parity:no (with the adapter-only justification in the body)",
    )
  }
}

const mode = process.argv[2]
const target = process.argv[3]

if (mode === "--file") {
  const body = readFileSync(target, "utf8")
  const firstLine = body.split("\n")[0].replace(/^#\s*/, "")
  validateTitle(firstLine)
  validateBody(body)
} else if (mode === "--issue") {
  const raw = execFileSync(ORCA, ["linear", "issue", target, "--relations", "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  const parsed = JSON.parse(raw)
  const parsedResult = parsed.result ?? parsed
  const issue = parsedResult.issue ?? parsedResult
  const title = issue.title ?? ""
  const body = issue.description ?? ""
  const labels = (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name))
  validateTitle(title)
  validateBody(body)
  validateLabels(labels)
  const relations = parsedResult.relations ?? issue.relations ?? []
  const blockedBy = relations.filter((r) => r.relationship === "blockedBy" || r.type === "blockedBy")
  if (/\b(after|once|depends on|blocked by)\b/i.test(body) && blockedBy.length === 0) {
    problems.push("body PROSE mentions a dependency but the issue has no blockedBy relation; the DAG is explicit, never inferred from titles (6.2)")
  }
} else {
  console.error(USAGE)
  process.exit(2)
}

if (problems.length) {
  console.error(`DEFECTIVE TICKET (${problems.length} problems). A fresh agent with no session history could not execute it:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log("ticket ok")
