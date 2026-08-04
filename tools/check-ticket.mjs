#!/usr/bin/env node
/**
 * The ticket-template checker (D2, the ticket IS the prompt): a ticket a fresh agent cannot
 * execute is a defective ticket, and a checker rejects it BEFORE a worker
 * burns a worktree discovering that. Validates one Linear issue (fetched via
 * the orca CLI) or a local markdown body.
 */

import { execFileSyncHidden as execFileSync } from "./lib/subprocess-options.mjs"
import { existsSync, readFileSync } from "node:fs"
import { request } from "node:https"
import { homedir } from "node:os"
import { join } from "node:path"

import { affectedFilesOf } from "./lib/affected-files.mjs"
import { affectedScopeOf } from "./lib/affected-files.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: check-ticket.mjs --issue ORB-12 | --file body.md

  --issue ORB-12   validate a Linear issue (body + labels + relations, fetched via the orca CLI)
  --file body.md   validate a drafted body before creation (no labels/relations checks)
  --help, -h       print this usage and exit 0

Affected modules / files must name at least ONE parseable path or broad scope, not merely carry the
heading. A ticket with no path list collides with everything, because silence must not buy
parallelism: the wave collision report can only intersect paths it can read. A wildcard or directory
scope is retained as an unknown affected scope and is serialized conservatively by wave-plan.mjs.
The parser is tools/lib/affected-files.mjs, the same module wave-plan.mjs reads, so what this gate
accepts is exactly what that report classifies.

Harness root causes (D5/D5a). tools/harness-roots.json is the registry and the ONLY enumeration
source; neither Linear path in this tool can list the board. A "Root cause:" line must name an id
the registry carries. An id is lowercase kebab-case, the shape every registered id is required to
carry, so a prose sentence after the colon is refused as not being an id at all rather than as an
unregistered one. The literal value "exempt" claims no root and is accepted. When the named
root is already owned by a ticket that is still open, this exits 1 naming that ticket: add to it
rather than filing a second ticket for the same root. This tool acquires no write capability;
appending a root is a one-line edit to tools/harness-roots.json in the SAME pull request as the
ticket that needs it, performed by the /ticket and /feature skills, never here.

  --issue  applies the root-cause check to every issue carrying the "harness" label. Such an issue
           with NO "Root cause:" line is REFUSED: the point of the gate is to force the
           classification, not to check the spelling of one somebody volunteered.
  --file   cannot read Linear labels, so it reads the drafted "Labels:" line the 6.2 body opens
           with and applies the check only to a draft whose labels name "harness". A draft with no
           such line, or one that does not claim that label, SKIPS the check and says so on stderr:
           fail-open by necessity, and the reason an ordinary root-cause hypothesis in Technical
           details is never read as a registry id. --file also cannot confirm whether the owning
           ticket is still open, so a registered id is warned about on stderr and exits 0 for that
           sub-case. Re-run with --issue once the ticket exists.

exit codes: 0 ticket ok, 1 defective ticket (problems listed on stderr), 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

let orchestratorConfig
try {
  orchestratorConfig = readOrchestratorConfig()
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
const TEAM_KEY = orchestratorConfig.linear?.team
if (typeof TEAM_KEY !== "string" || !/^[A-Za-z0-9]+$/.test(TEAM_KEY)) {
  console.error(`.claude/orchestrator.json must declare linear.team as an alphanumeric key; got ${JSON.stringify(TEAM_KEY)}`)
  process.exit(2)
}

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
const NEGATED_BLOCKING_CLAIM =
  /\b(?:cannot|neither|never|no|nobody|none|nor|not|nothing|nowhere|without)\b|\b\w+n['’]t\b|\bfrom\s+(?:being|getting)\s+blocked\b/i
const AFFIRMATIVE_BLOCKING_CLAIM =
  /^blocked\s+(?:the|a|an)\s+\S(?:.*\S)?$|^(?:the|a|an)\s+\S(?:.*\S)?\s+(?:was|were)\s+blocked$/i

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

/**
 * `\b` treats a hyphen as a word boundary, so the plain word list matched inside identifiers:
 * "Root cause: string-not-act" made a pure tooling ticket demand screenshots and a critique
 * artifact. A hyphenated compound is its own token, never the bare word, so the boundaries
 * exclude a hyphen on either side. Everything the plain word list caught it still catches.
 */
const VISIBLE_EFFECT_WORD =
  /(?<![\w-])(?:screen|page|component|modal|sheet|button|copy|string|animation|style|design)(?![\w-])/i

const problems = []
const require_ = (condition, message) => {
  if (!condition) problems.push(message)
}

const AFFECTED_SECTION = REQUIRED_SECTIONS.find((section) => section.name === "Affected modules / files")

const validateBody = (body) => {
  for (const section of REQUIRED_SECTIONS) {
    require_(section.pattern.test(body), `missing section: ${section.name}`)
  }
  if (AFFECTED_SECTION.pattern.test(body)) {
    require_(
      affectedFilesOf(body).length >= 1 || affectedScopeOf(body).unknown,
      `${AFFECTED_SECTION.name} carries the heading but names no parseable path or broad scope. A ticket with no path list collides with everything, because silence must not buy parallelism: wave-plan.mjs can only intersect paths it can read. List each path on its own line, backticked or as a list item`,
    )
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
  const visibleEffect = VISIBLE_EFFECT_WORD.test(body)
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

/**
 * The whole pattern used to carry /i, which case-folded the IDENTIFIER as well as the signal
 * words, so any lowercase hyphen-and-digit token within 80 characters of a signal word read as a
 * named dependency: "after feature/orb-163-c2-split-test-file is merged", "once
 * orb-164-c2-rubric-twin exists", "depends on expo-sdk-54", "blocked by node-24" all tripped it,
 * and every one of those is a branch slug or a package pin, not a ticket. JavaScript has no
 * inline case-insensitivity scope, so the signal words are folded one letter at a time and the
 * identifier is built from the team key the configuration declares instead of any uppercase run.
 */
const caseFolded = (phrase) => phrase.replace(/[a-z]/g, (letter) => `[${letter}${letter.toUpperCase()}]`)
const DEPENDENCY_SIGNALS = ["after", "once", "depends on", "blocked by"]
const ISSUE_IDENTIFIER = new RegExp(`\\b${TEAM_KEY}-\\d+\\b`)
const SIGNAL_NAMING_ISSUE = new RegExp(
  `\\b(?:${DEPENDENCY_SIGNALS.map(caseFolded).join("|")})\\b[^\\n.!?]{0,80}\\b${TEAM_KEY}-\\d+\\b`,
)

const mentionsIssueDependency = (body) => {
  const dependencySection = body
    .split(/(?=^#+[ \t]+)/m)
    .find((section) => /^#+\s*dependencies\b/im.test(section))
  const dependencyProse = dependencySection?.replace(/^#+[^\n]*(?:\n|$)/, "") ?? ""
  return ISSUE_IDENTIFIER.test(dependencyProse) || SIGNAL_NAMING_ISSUE.test(body)
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
  if (NEGATED_BLOCKING_CLAIM.test(blockingClaim) || !AFFIRMATIVE_BLOCKING_CLAIM.test(blockingClaim)) {
    problems.push(`ledger child blocking value must be literal no or an affirmative claim naming what it blocked`)
  }
}

/**
 * D5/D5a, the filing gate. The taxonomy of harness root causes is OPEN, so the gate cannot be a
 * closed list compiled into this file; it is tools/harness-roots.json, a committed registry that
 * grows by a one-line edit in the same pull request as the ticket that needs the new root. The
 * registry is also the only enumeration source available: both Linear paths in this tool are keyed
 * to a single known identifier and neither can list the board.
 */
const HARNESS_ROOTS_URL = new URL("./harness-roots.json", import.meta.url)
const HARNESS_ROOTS_NAME = "tools/harness-roots.json"
const HARNESS_LABEL = "harness"
/** The one value that claims no root. Reserved, so it can never be registered as one. */
const ROOT_CAUSE_EXEMPT = "exempt"
const ROOT_CAUSE_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?[Rr]oot [Cc]ause(?:\*\*)?:[ \t]*([^\s.,;]+)/m
/**
 * The only place a DRAFT can express its intended labels: a 6.2 body opens with a pipe-separated
 * `Labels:` line, read live from ORB-163 ("Labels: repo:ui | parity:no | Improvement | Estimate: 8
 * points") and ORB-164 on 2026-07-31. Without this scope --file applied the registry check to
 * every drafted body, and the /ticket skill puts a root-cause hypothesis in Technical details for
 * EVERY defect, so "Root cause: A race condition in the token refresh handler." was read as the
 * claim "A" and blocked an ordinary bug ticket from ever being created.
 */
const DRAFT_LABELS_LINE = /^[ \t]*(?:\*\*)?Labels(?:\*\*)?:[ \t]*([^\r\n]+)$/m
const draftClaimsHarness = (body) =>
  (DRAFT_LABELS_LINE.exec(body)?.[1].split("|") ?? []).some((label) => label.trim() === HARNESS_LABEL)
/**
 * The shape every registered id already carries. readHarnessRoots enforces it ON the registry as
 * well, so the pattern a claim is measured against and the ids the registry may hold cannot drift
 * apart. A captured token that is not id-shaped is prose, and saying "not registered" about prose
 * sends the author to the registry to fix a sentence.
 */
const ROOT_ID_SHAPE = /^[a-z]+(?:-[a-z]+)*$/
const DONE_STATE_TYPES = new Set(["completed", "canceled", "duplicate"])

const toolFailure = (message) => {
  console.error(`check-ticket: ${message}`)
  process.exit(2)
}

const readHarnessRoots = () => {
  let registry
  try {
    registry = JSON.parse(readFileSync(HARNESS_ROOTS_URL, "utf8"))
  } catch (error) {
    toolFailure(`${HARNESS_ROOTS_NAME} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(registry.roots) || registry.roots.length === 0) {
    toolFailure(`${HARNESS_ROOTS_NAME} must carry a non-empty roots array`)
  }
  const byId = new Map()
  for (const entry of registry.roots) {
    const complete = ["id", "definition", "owner"].every(
      (field) => typeof entry?.[field] === "string" && entry[field].trim() !== "",
    )
    if (!complete) toolFailure(`every ${HARNESS_ROOTS_NAME} entry needs a non-empty id, definition and owner; got ${JSON.stringify(entry)}`)
    if (!ROOT_ID_SHAPE.test(entry.id)) toolFailure(`every ${HARNESS_ROOTS_NAME} id must be lowercase kebab-case (${ROOT_ID_SHAPE.source}), which is the same shape a claimed root is held to; got ${JSON.stringify(entry.id)}`)
    if (entry.id === ROOT_CAUSE_EXEMPT) toolFailure(`${HARNESS_ROOTS_NAME} must not register the reserved id ${ROOT_CAUSE_EXEMPT}`)
    if (byId.has(entry.id)) toolFailure(`${HARNESS_ROOTS_NAME} registers the id ${entry.id} twice`)
    byId.set(entry.id, entry)
  }
  return byId
}

const unregisteredRootProblem = (claim, roots) =>
  `Root cause: ${claim} is not registered in ${HARNESS_ROOTS_NAME} (registered: ${[...roots.keys()].join(", ")}; the literal ${ROOT_CAUSE_EXEMPT} claims no root). Adding a root is a one-line edit to that file in the SAME pull request as this ticket`

const notAnIdProblem = (claim, roots) =>
  `Root cause: ${claim} is not a root-cause id, so ${HARNESS_ROOTS_NAME} is not where this is fixed. An id is lowercase kebab-case (${ROOT_ID_SHAPE.source}), the shape every id in that registry carries; the first word of a prose hypothesis is not one. Name a registered id (${[...roots.keys()].join(", ")}), or the literal ${ROOT_CAUSE_EXEMPT} if this ticket instantiates no root`

/** The shared verdict on a claimed root, so both modes refuse the same things for the same reason. */
const rootCauseProblem = (claim, roots) => {
  if (!ROOT_ID_SHAPE.test(claim)) return notAnIdProblem(claim, roots)
  return roots.has(claim) ? null : unregisteredRootProblem(claim, roots)
}

const issueStateType = (identifier) => {
  const raw = execFileSync(ORCA, ["linear", "issue", identifier, "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  const parsed = JSON.parse(raw)
  if (parsed.ok === false) throw new Error(parsed.error?.message ?? "unknown orca error")
  const parsedResult = parsed.result
  const state = parsedResult.issue.state
  const type = state.type
  if (typeof type !== "string") throw new Error(`the payload for ${identifier} carries no state.type`)
  return type
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
  if (!draftClaimsHarness(body)) {
    console.error(`check-ticket: this draft's "Labels:" line does not name ${HARNESS_LABEL}, so the D5/D5a root-cause registry check was NOT applied and any "Root cause:" line here was read as ordinary prose. Re-run with --issue once the ticket exists and Linear owns its labels`)
  } else {
    const claim = ROOT_CAUSE_LINE.exec(body)?.[1] ?? null
    if (claim === null) {
      problems.push(`this draft claims the ${HARNESS_LABEL} label but carries no "Root cause:" line. Name a root id registered in ${HARNESS_ROOTS_NAME}, or the literal ${ROOT_CAUSE_EXEMPT} if this ticket instantiates no root`)
    } else if (claim !== ROOT_CAUSE_EXEMPT) {
      const roots = readHarnessRoots()
      const problem = rootCauseProblem(claim, roots)
      if (problem) problems.push(problem)
      else {
        const owner = roots.get(claim).owner
        console.error(`check-ticket: root cause ${claim} is owned by ${owner}. --file reads no Linear, so whether ${owner} is still open was NOT checked; re-run with --issue once this ticket exists`)
      }
    }
  }
} else if (mode === "--issue") {
  const raw = execFileSync(ORCA, ["linear", "issue", target, "--relations", "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  const parsed = JSON.parse(raw)
  const parsedResult = parsed.result
  const issue = parsedResult.issue
  const title = issue.title ?? ""
  const body = issue.description ?? ""
  const labels = (issue.labels ?? []).map((label) => label.name)
  validateTitle(title)
  validateBody(body)
  validateLabels(labels)
  const relations = parsedResult.relations
  /**
   * Linear is the ONLY source of the parent. `orca linear issue <id> --relations --json` returns
   * no `parent` key at all, and orca's relation vocabulary is blocks / blocked-by / related /
   * duplicate-of, so a parent is not expressible as a relation either: verified against ORB-150,
   * whose payload carries 17 issue keys, no `parent`, and `relations: []`, while Linear reports
   * its parent as ORB-140. Reading the orca payload for a parent therefore proves nothing, and a
   * lookup that fails is a refusal rather than an assumed absence.
   */
  let parent
  try {
    parent = await readLinearParent(issue)
  } catch (error) {
    console.error(`check-ticket: could not read the Linear parent relation: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
  if (isLedgerParent(parent)) validateLedgerOccurrence(body)
  const blockedBy = relations.filter((r) => r.relationship === "blockedBy")
  if (mentionsIssueDependency(body) && blockedBy.length === 0) {
    problems.push("body PROSE mentions a dependency but the issue has no blockedBy relation; the DAG is explicit, never inferred from titles (6.2)")
  }
  if (labels.includes(HARNESS_LABEL)) {
    const identifier = issue.identifier
    const claim = ROOT_CAUSE_LINE.exec(body)?.[1] ?? null
    if (claim === null) {
      problems.push(`${identifier} carries the ${HARNESS_LABEL} label but no "Root cause:" line. Name a root id registered in ${HARNESS_ROOTS_NAME}, or the literal ${ROOT_CAUSE_EXEMPT} if this ticket instantiates no root`)
    } else if (claim !== ROOT_CAUSE_EXEMPT) {
      const roots = readHarnessRoots()
      const problem = rootCauseProblem(claim, roots)
      const registered = roots.get(claim)
      if (problem) problems.push(problem)
      else if (registered.owner !== identifier) {
        let ownerState
        try {
          ownerState = issueStateType(registered.owner)
        } catch (error) {
          toolFailure(`could not read the state of ${registered.owner}, the ticket ${HARNESS_ROOTS_NAME} records as owning root cause ${claim}: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (!DONE_STATE_TYPES.has(ownerState)) {
          problems.push(`root cause ${claim} is already filed as ${registered.owner}, which is still open (${ownerState}); add to ${registered.owner} rather than filing a second ticket for the same root`)
        }
      }
    }
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
