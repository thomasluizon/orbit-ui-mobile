#!/usr/bin/env node
/**
 * The ticket-template checker (D2, the ticket IS the prompt): a ticket a fresh agent cannot
 * execute is a defective ticket, and a checker rejects it BEFORE a worker
 * burns a worktree discovering that. Validates one Linear issue (fetched via
 * the orca CLI) or a local markdown body.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { request } from "node:https"
import { homedir } from "node:os"
import { join } from "node:path"

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
const LEDGER_OCCURRENCE_THRESHOLD = 3
const LEDGER_OCCURRENCE_FORMAT = "Ledger occurrence: <count>; blocked: no|<what it blocked>"
const LEDGER_PARENT_MARKER = /\bHarness defect ledger\b/i
const LINEAR_PARENT_TIMEOUT_MS = 5_000
const AFFIRMATIVE_BLOCKING_CLAIM =
  /\b(?:could not|couldn't|cannot|can't|failed to|(?:was|were) unable to)\s+\S+|\b(?:blocked|halted|stopped|prevented)\s+(?:the|a|an)\s+\S+|\b(?:the|a|an)\s+\S+(?:\s+\S+){0,6}\s+(?:was|were)\s+(?:blocked|halted|stopped|prevented)\b/i

/**
 * A criterion that quantifies over an OPEN set has no provable finish line, so review can never
 * converge: every round the reviewer legitimately finds one more member of the set and is right.
 * Measured on ORB-122 ("block raw command surfacing"), which took 24 review rounds over 12 hours
 * because "every phrasing" is not a set anyone can enumerate. See PR #633.
 */
const UNBOUNDED_QUANTIFIER = /\b(?:every|all|any|each)\b(?!-)/i
/** Evidence in the SAME criterion that the quantifier ranges over an enumerated set. */
const BOUNDED_BY =
  /\b\d+\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|both)\b|`[^`]+`|\.(?:mjs|cjs|js|ts|tsx|json|md|cs|yml|yaml|sh)\b|\b(?:listed|enumerated|named|above|below)\b|\bin (?:the )?(?:table|list|fixture|corpus|manifest)\b/i
/** An explicit "and more of the same, unspecified" tail is unbounded however it is phrased. */
const OPEN_ENDED_TAIL = /\b(?:etc\.?|and so on|and similar|or similar|among others)\b|…|\.\.\./i
/**
 * The bound must govern the quantifier, not merely share a line with it: searching the whole
 * criterion lets an unrelated exit code rescue an unbounded claim, as in "every phrasing a worker
 * could emit is blocked and the command exits 1" (PR #638 review). Scoping to the clause is the
 * same fix this gate prescribes for the tickets it rejects.
 */
const isBounded = (text) => {
  const clauses = text
    .replace(/`[^`]+`/g, "`x`")
    .replace(/[\w./\\-]+\.(?:mjs|cjs|js|ts|tsx|json|md|cs|yml|yaml|sh)\b/g, "`x`")
    .split(/[.;:,]|\band\b|\bor\b/i)
  return clauses.every(
    (clause, index) => !UNBOUNDED_QUANTIFIER.test(clause) || clauses.slice(0, index + 1).some((c) => BOUNDED_BY.test(c)),
  )
}
const TYPE_LABELS = ["Feature", "Bug", "Improvement"]

const problems = []
const require_ = (condition, message) => {
  if (!condition) problems.push(message)
}

const validateBody = (body) => {
  for (const section of REQUIRED_SECTIONS) {
    require_(section.pattern.test(body), `missing section: ${section.name}`)
  }
  const criteria = body.split(/^#+[ \t]+/m).find((chunk) => /^acceptance criteria/i.test(chunk)) ?? ""
  const criteriaItems = criteria.match(/^[ \t]*(?:[-*]|\d+\.)[ \t]+.*$/gm) || []
  require_(criteriaItems.length >= 2, "acceptance criteria needs at least 2 checkable items")
  for (const item of criteriaItems) {
    const text = item.replace(/^[ \t]*(?:[-*]|\d+\.)[ \t]+/, "")
    require_(
      !OPEN_ENDED_TAIL.test(text),
      `acceptance criterion has no finish line, it trails off into an unnamed remainder: "${text.trim().slice(0, 90)}". Enumerate the remainder or delete it`,
    )
    require_(
      !UNBOUNDED_QUANTIFIER.test(text) || isBounded(text),
      `acceptance criterion quantifies over an open set, so it can never be proven done: "${text.trim().slice(0, 90)}". Bound it: give a count, a named list, a file, or a backticked command that decides it`,
    )
  }
  require_(!/\b(TBD|TODO|FIXME|\?\?\?)\b/.test(body), "body carries TBD/TODO placeholders; resolve before dispatch")
  require_(!/\u2014/.test(body), "body carries an em dash (banned everywhere)")
  const visibleEffect = /\b(screen|page|component|modal|sheet|button|copy|string|animation|style|design)\b/i.test(body)
  if (visibleEffect) {
    require_(
      /screenshot|pixel evidence/i.test(body),
      "body smells user-visible but does not carry the visible-effect evidence contract (D7): state that final screenshots are attached before In Review",
    )
    require_(
      /\bcritique\b/i.test(body),
      "body smells user-visible but does not carry the visible-effect evidence contract (D7): state that the critique artifact is attached before In Review",
    )
  }
}

const mentionsIssueDependency = (body) => {
  const dependencySection = body
    .split(/(?=^#+[ \t]+)/m)
    .find((section) => /^#+\s*dependencies\b/im.test(section))
  const dependencyProse = dependencySection?.replace(/^#+[^\n]*(?:\n|$)/, "") ?? ""
  const issueIdentifier = /\b[A-Z][A-Z0-9]+-\d+\b/
  const signalNamingIssue = /\b(after|once|depends on|blocked by)\b[^\n.!?]{0,80}\b[A-Z][A-Z0-9]+-\d+\b/i
  return issueIdentifier.test(dependencyProse) || signalNamingIssue.test(body)
}

const validateTitle = (title) => {
  require_(title.length >= 12, "title too short to be executable")
  require_(!/\b(maybe|somehow|stuff|things|misc)\b/i.test(title), "title is vague")
  require_(!/\u2014/.test(title), "title carries an em dash")
}

const validateLabels = (labels) => {
  const repoLabels = labels.filter((label) => REPO_LABELS.includes(label))
  const typeLabels = labels.filter((label) => TYPE_LABELS.includes(label))
  require_(repoLabels.length === 1, `exactly ONE repo label required (${REPO_LABELS.join(", ")}); found: ${repoLabels.join(", ") || "none"}. Cross-repo work is TWO tickets, api blocks ui (D4)`)
  require_(typeLabels.length === 1, `exactly ONE type label required (${TYPE_LABELS.join(", ")}); found: ${typeLabels.join(", ") || "none"}. Type is explicit, never guessed`)
  require_(!labels.includes("repo:both"), "repo:both is banned (D4): split into an api ticket that blocks a ui ticket")
  if (repoLabels[0] === "repo:ui") {
    require_(
      labels.includes("parity:yes") || labels.includes("parity:no"),
      "ui tickets must declare parity:yes (web+mobile in one PR) or parity:no (with the adapter-only justification in the body)",
    )
  }
}

const parentFromOrca = (issue, relations) => {
  if (Object.hasOwn(issue, "parent")) return issue.parent
  const parentRelation = relations.find((relation) => {
    const relationship = relation.relationship ?? relation.type
    return relationship === "parent" || relationship === "childOf"
  })
  return parentRelation
    ? parentRelation.relatedIssue ?? parentRelation.issue ?? parentRelation
    : null
}

const isLedgerParent = (parent) => {
  return LEDGER_PARENT_MARKER.test(`${parent?.title ?? ""}\n${parent?.description ?? ""}`)
}

const readLinearParent = async (issue) => {
  if (!issue.id) return null
  const keyPath = join(process.env.USERPROFILE || homedir(), ".linear-api-key")
  if (!existsSync(keyPath)) throw new Error(`missing ${keyPath}`)
  const apiKey = readFileSync(keyPath, "utf8").trim()
  if (!apiKey) throw new Error(`${keyPath} is empty`)
  const requestBody = JSON.stringify({
    query: "query($id: String!) { issue(id: $id) { parent { id identifier title description } } }",
    variables: { id: issue.id },
  })
  const response = await new Promise((resolve, reject) => {
    const linearRequest = request("https://api.linear.app/graphql", {
      method: "POST",
      agent: false,
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
      timeout: LINEAR_PARENT_TIMEOUT_MS,
    }, (linearResponse) => {
      const chunks = []
      linearResponse.on("data", (chunk) => chunks.push(chunk))
      linearResponse.on("end", () => resolve({
        status: linearResponse.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }))
    })
    linearRequest.on("error", reject)
    linearRequest.on("timeout", () => {
      linearRequest.destroy(new Error(`Linear parent lookup timed out after ${LINEAR_PARENT_TIMEOUT_MS}ms`))
    })
    linearRequest.end(requestBody)
  })
  const payload = JSON.parse(response.body)
  if (response.status < 200 || response.status >= 300 || payload.errors) {
    throw new Error(payload.errors?.[0]?.message ?? `HTTP ${response.status}`)
  }
  return payload.data?.issue?.parent ?? null
}

const validateLedgerOccurrence = (body) => {
  const occurrenceLine = body.split(/\r?\n/).find((line) => line.startsWith("Ledger occurrence:"))
  if (!occurrenceLine) {
    problems.push(`ledger child is missing the fixed line: ${LEDGER_OCCURRENCE_FORMAT}`)
    return
  }
  const parsedLine = occurrenceLine.match(/^Ledger occurrence: (\d+); blocked: ([^\r\n]+)$/)
  if (!parsedLine) {
    problems.push(`ledger occurrence line is unparseable; expected: ${LEDGER_OCCURRENCE_FORMAT}`)
    return
  }
  const occurrenceCount = Number(parsedLine[1])
  const blockingClaim = parsedLine[2].trim()
  if (blockingClaim === "no") {
    if (occurrenceCount < LEDGER_OCCURRENCE_THRESHOLD) {
      problems.push(`ledger child states ${occurrenceCount} occurrences, below the threshold of ${LEDGER_OCCURRENCE_THRESHOLD}, without an affirmative blocking claim naming what it blocked`)
    }
    return
  }
  if (!AFFIRMATIVE_BLOCKING_CLAIM.test(blockingClaim)) {
    problems.push(`ledger child blocking value must be literal no or an affirmative claim naming what it blocked`)
  }
}

const mode = process.argv[2]
const target = process.argv[3]

if (mode === "--file") {
  if (!target || !existsSync(target)) {
    console.error(`check-ticket: body file not found: ${target ?? "(none given)"}\n`)
    console.error(USAGE)
    process.exit(2)
  }
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
  let parent = parentFromOrca(issue, relations)
  const parentIsClassifiable = parent === null ||
    typeof parent?.title === "string" ||
    typeof parent?.description === "string"
  if (!parentIsClassifiable) {
    try {
      parent = await readLinearParent(issue)
    } catch (error) {
      console.error(`check-ticket: could not read the Linear parent relation: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(2)
    }
  }
  if (isLedgerParent(parent)) validateLedgerOccurrence(body)
  const blockedBy = relations.filter((r) => r.relationship === "blockedBy" || r.type === "blockedBy")
  if (mentionsIssueDependency(body) && blockedBy.length === 0) {
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
