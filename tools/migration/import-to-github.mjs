#!/usr/bin/env node
/**
 * Import a Linear export into thomasluizon/orbit-tickets and onto its Projects v2 board.
 *
 * Every identifier below was READ from output produced during this migration run and is recorded
 * here so the script addresses only proven targets: the project id, the field ids and the
 * single-select option ids all came from `gh project field-create` / `updateProjectV2Field`
 * responses, never from memory.
 *
 * Resumable. Every completed unit of work is appended to the ledger before the next one starts, so
 * a crash or a rate-limit stop re-runs only what did not finish.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const [exportPath, ledgerPath, mapPath] = process.argv.slice(2)
if (!exportPath || !ledgerPath || !mapPath) {
  console.error("usage: import-to-github.mjs <linear-export.json> <ledger.json> <linear-to-github-map.json>")
  process.exit(2)
}

const REPO = "thomasluizon/orbit-tickets"
const OWNER = "thomasluizon"
const PROJECT_NUMBER = "2"
const PROJECT_ID = "PVT_kwHOBE6dNc4Bfy2y"
const PROJECT_URL = "https://github.com/users/thomasluizon/projects/2"
const FIELD = {
  status: "PVTSSF_lAHOBE6dNc4Bfy2yzhaDLqQ",
  priority: "PVTSSF_lAHOBE6dNc4Bfy2yzhaDLzs",
  estimate: "PVTF_lAHOBE6dNc4Bfy2yzhaDLzw",
  linearId: "PVTF_lAHOBE6dNc4Bfy2yzhaDL0o",
}
const STATUS_OPTION = {
  Backlog: "0489f072",
  Todo: "3e394655",
  "In Progress": "d4daa297",
  "In Review": "f548e367",
  Done: "9e4bdc69",
  Canceled: "43831f60",
  Duplicate: "0b6895d9",
}
// Linear priority is 0 none, 1 urgent, 2 high, 3 medium, 4 low.
const PRIORITY_OPTION = ["6f2828f2", "d10d27b2", "87362450", "6ace929c", "8089f778"]
// Linear state type -> how the issue is closed on GitHub. Open types close nothing.
const CLOSE_REASON = { completed: "completed", canceled: "not planned", duplicate: "duplicate" }

const data = JSON.parse(readFileSync(exportPath, "utf8"))
const issues = data.issues
/**
 * Linear's four stock onboarding tickets. They are tutorial content that Linear wrote, not Orbit
 * work, and Thomas asked for them to stay behind. Verified before dropping: they carry no comments
 * and no relations, and the only ORB-1..ORB-4 strings elsewhere are SYNTHETIC fixture identifiers
 * inside plan-queue's tests on ORB-236, not real cross references.
 */
const EXCLUDED = new Set(["ORB-1", "ORB-2", "ORB-3", "ORB-4"])

// A smoke run over a handful of tickets proves the whole pipeline before 277 irreversible creations.
const limitFlag = process.argv.indexOf("--limit")
const limit = limitFlag === -1 ? Infinity : Number(process.argv[limitFlag + 1])
const identifiers = Object.keys(issues)
  .filter((identifier) => !EXCLUDED.has(identifier))
  .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
  .slice(0, limit)

const ledger = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, "utf8"))
  : { labels: {}, created: {}, comments: {}, refs: {}, deps: {}, closed: {}, board: {} }
const saveLedger = () => {
  ledger.rateWindow = window
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1))
}

/**
 * The documented secondary limit is 80 content-generating requests per minute and 500 per hour, and
 * it counts web, REST and GraphQL together. Staying under BOTH is the only way a run of this size
 * finishes at all, so the budget is enforced here rather than discovered as a 403 halfway through.
 */
const HOURLY_BUDGET = 450
const MIN_GAP_MS = 950
const LIGHT_GAP_MS = 250
/**
 * The spend window lives in the ledger, not just in memory. A restart inside the same hour would
 * otherwise believe it had a full budget, blast straight into GitHub's secondary limit, and burn
 * its retries on a 403 that only time can clear.
 */
const window = (ledger.rateWindow ?? []).filter((at) => Date.now() - at < 3_600_000)
let lastCall = 0
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Creating an issue or a comment is unambiguously content generation and is charged against the
 * hourly budget. Setting a Projects v2 field value is an update to an existing item, which the
 * documented content-creation limit does not obviously cover, so it is only paced. That is a
 * measurement question this script does not get to answer by assertion: if the classification is
 * wrong, the retry path below sees the secondary-limit error and backs off, so being wrong costs
 * time and never correctness.
 */
const throttle = (content) => {
  const now = Date.now()
  while (window.length > 0 && now - window[0] > 3_600_000) window.shift()
  if (content && window.length >= HOURLY_BUDGET) {
    const waitMs = 3_600_000 - (now - window[0]) + 1_000
    console.error(`\nhourly content budget reached; sleeping ${Math.ceil(waitMs / 60_000)} min`)
    sleep(waitMs)
    return throttle(content)
  }
  const minGap = content ? MIN_GAP_MS : LIGHT_GAP_MS
  const gap = Date.now() - lastCall
  if (gap < minGap) sleep(minGap - gap)
  lastCall = Date.now()
  if (content) window.push(lastCall)
}

const gh = (args, { content = true, input } = {}) => {
  throttle(content)
  for (let attempt = 1; ; attempt += 1) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, input })
    } catch (error) {
      const text = `${error.stdout ?? ""}${error.stderr ?? ""}`
      const retryable = /rate limit|secondary|abuse|502|503|timeout|EAI_AGAIN/i.test(text)
      if (attempt >= 4 || !retryable) throw new Error(`gh ${args.slice(0, 4).join(" ")} failed: ${text.slice(0, 500)}`)
      const backoffMs = 60_000 * attempt
      console.error(`\nretryable gh failure, sleeping ${backoffMs / 1000}s: ${text.slice(0, 200)}`)
      sleep(backoffMs)
    }
  }
}

const tmp = `${dirname(ledgerPath)}/body.tmp.md`
mkdirSync(dirname(ledgerPath), { recursive: true })
const withBodyFile = (text, run) => {
  writeFileSync(tmp, text)
  return run(tmp)
}

// ---------------------------------------------------------------- phase 1: labels
const labelColors = new Map()
for (const identifier of identifiers) {
  for (const label of issues[identifier].issue.labels ?? []) {
    labelColors.set(label.name, String(label.color ?? "#ededed").replace(/^#/, ""))
  }
}
console.error(`phase 1: ${labelColors.size} labels`)
for (const [name, color] of labelColors) {
  if (ledger.labels[name]) continue
  try {
    gh(["label", "create", name, "--repo", REPO, "--color", color, "--force"])
  } catch (error) {
    if (!/already exists/i.test(error.message)) throw error
  }
  ledger.labels[name] = true
  saveLedger()
}

// ---------------------------------------------------------------- phase 2: issues
const provenance = (record) => {
  const issue = record.issue
  const lines = [
    "",
    "---",
    `<sub>Migrated from Linear **${issue.identifier}** on ${data.exportedAt.slice(0, 10)}. ` +
      `Original: ${issue.url}. Linear state: ${issue.state.name}.` +
      (issue.project ? ` Linear project: ${issue.project.name}.` : "") +
      (issue.estimate != null ? ` Estimate: ${issue.estimate}.` : "") +
      "</sub>",
  ]
  const soft = (record.relations ?? []).filter((relation) => ["relatedTo", "duplicateOf"].includes(relation.relationship))
  if (soft.length > 0) {
    lines.push("", `<sub>Linear ${soft.map((relation) => `${relation.relationship} ${relation.relatedIssue.identifier}`).join(", ")}.</sub>`)
  }
  return lines.join("\n")
}

console.error(`phase 2: ${identifiers.length} issues`)
let n = 0
for (const identifier of identifiers) {
  n += 1
  if (ledger.created[identifier]) continue
  const record = issues[identifier]
  const body = `${record.issue.description ?? "_No description in Linear._"}\n${provenance(record)}\n`
  const labels = (record.issue.labels ?? []).map((label) => label.name)
  const args = ["issue", "create", "--repo", REPO, "--title", record.issue.title]
  for (const label of labels) args.push("--label", label)
  const url = withBodyFile(body, (path) => gh([...args, "--body-file", path])).trim().split("\n").pop().trim()
  const number = Number(url.split("/").pop())
  if (!Number.isInteger(number) || !url.startsWith(`https://github.com/${REPO}/issues/`)) {
    throw new Error(`${identifier}: gh issue create returned an unusable target: ${JSON.stringify(url)}`)
  }
  ledger.created[identifier] = { number, url }
  saveLedger()
  process.stderr.write(`created ${n}/${identifiers.length} ${identifier} -> #${number}    \r`)
}
console.error("")

const numberOf = (identifier) => ledger.created[identifier]?.number ?? null

// ---------------------------------------------------------------- phase 3: comments
const totalComments = identifiers.reduce((sum, id) => sum + (issues[id].comments?.length ?? 0), 0)
console.error(`phase 3: ${totalComments} comments`)
let commentsDone = 0
for (const identifier of identifiers) {
  const comments = issues[identifier].comments ?? []
  const already = ledger.comments[identifier] ?? 0
  for (let index = already; index < comments.length; index += 1) {
    const comment = comments[index]
    const author = comment.user?.name ?? comment.user?.displayName ?? "unknown"
    const header = `<sub>Linear comment by **${author}** on ${String(comment.createdAt).slice(0, 10)}.</sub>\n\n`
    withBodyFile(`${header}${comment.body}\n`, (path) =>
      gh(["issue", "comment", String(numberOf(identifier)), "--repo", REPO, "--body-file", path]),
    )
    ledger.comments[identifier] = index + 1
    saveLedger()
    commentsDone += 1
    process.stderr.write(`comments ${commentsDone}/${totalComments - already} ${identifier}    \r`)
  }
}
console.error("")

// ---------------------------------------------------------------- phase 4: reference index
// ORB-N text inside a body is a dead reference once Linear is gone. The references are APPENDED as
// an index rather than rewritten in place: a body can contain `/orchestrate ORB-246` inside a code
// fence, and rewriting that would corrupt a runnable command.
const ORB_PATTERN = /\bORB-(\d+)\b/g
/**
 * Fenced and inline code is stripped before the scan. ORB-236 proves why: its body contains
 * `run(TOOL, ["--tickets", "ORB-1", ...])`, where ORB-1 is a SYNTHETIC fixture identifier. Indexing
 * that would manufacture a link between a real ticket and an unrelated one.
 */
const withoutCode = (text) => text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ")

console.error("phase 4: reference index")
for (const identifier of identifiers) {
  if (ledger.refs[identifier]) continue
  const record = issues[identifier]
  const mentioned = [...new Set([...withoutCode(record.issue.description ?? "").matchAll(ORB_PATTERN)].map((match) => `ORB-${match[1]}`))]
    .filter((other) => other !== identifier && numberOf(other))
  if (mentioned.length === 0) {
    ledger.refs[identifier] = true
    saveLedger()
    continue
  }
  const index = [
    "",
    "<details><summary>Tickets referenced above</summary>",
    "",
    ...mentioned.map((other) => `- ${other} -> #${numberOf(other)}`),
    "",
    "</details>",
  ].join("\n")
  const body = `${record.issue.description ?? ""}\n${provenance(record)}\n${index}\n`
  withBodyFile(body, (path) => gh(["issue", "edit", String(numberOf(identifier)), "--repo", REPO, "--body-file", path]))
  ledger.refs[identifier] = true
  saveLedger()
  process.stderr.write(`refs ${identifier}    \r`)
}
console.error("")

// ---------------------------------------------------------------- phase 5: dependencies
// Only `blockedBy` edges are written. Every Linear `blocks` edge has a reciprocal `blockedBy` edge
// on the other issue, so writing one direction reproduces the whole graph; the assertion below
// proves that reciprocity rather than assuming it.
const blockedByEdges = []
const blocksEdges = []
for (const identifier of identifiers) {
  for (const relation of issues[identifier].relations ?? []) {
    if (relation.relationship === "blockedBy") blockedByEdges.push([identifier, relation.relatedIssue.identifier])
    if (relation.relationship === "blocks") blocksEdges.push([relation.relatedIssue.identifier, identifier])
  }
}
const edgeKey = (edge) => edge.join("<-")
const blockedBySet = new Set(blockedByEdges.map(edgeKey))
const missingReciprocal = blocksEdges.filter((edge) => !blockedBySet.has(edgeKey(edge)))
if (missingReciprocal.length > 0) {
  console.error(`WARNING: ${missingReciprocal.length} blocks edges have no reciprocal blockedBy; adding them explicitly`)
  for (const edge of missingReciprocal) if (!blockedBySet.has(edgeKey(edge))) blockedByEdges.push(edge)
}
const byBlocked = new Map()
for (const [blocked, blocker] of blockedByEdges) {
  if (!numberOf(blocked) || !numberOf(blocker)) continue
  if (!byBlocked.has(blocked)) byBlocked.set(blocked, new Set())
  byBlocked.get(blocked).add(blocker)
}
console.error(`phase 5: ${blockedByEdges.length} blockedBy edges over ${byBlocked.size} issues`)
for (const [blocked, blockers] of byBlocked) {
  if (ledger.deps[blocked]) continue
  if (blockers.size > 50) throw new Error(`${blocked} has ${blockers.size} blockers, over GitHub's 50 per relationship limit`)
  const args = ["issue", "edit", String(numberOf(blocked)), "--repo", REPO]
  for (const blocker of blockers) args.push("--add-blocked-by", String(numberOf(blocker)))
  gh(args)
  ledger.deps[blocked] = [...blockers]
  saveLedger()
  process.stderr.write(`deps ${blocked}    \r`)
}
console.error("")

// ---------------------------------------------------------------- phase 6: board
console.error("phase 6: board")
let boardDone = 0
for (const identifier of identifiers) {
  boardDone += 1
  if (ledger.board[identifier]) continue
  const record = issues[identifier]
  const added = JSON.parse(gh(["project", "item-add", PROJECT_NUMBER, "--owner", OWNER, "--url", ledger.created[identifier].url, "--format", "json"], { content: false }))
  const itemId = added.id
  if (typeof itemId !== "string" || !itemId.startsWith("PVTI_")) throw new Error(`${identifier}: item-add returned no item id`)
  const edit = (extra) => gh(["project", "item-edit", "--project-id", PROJECT_ID, "--id", itemId, ...extra], { content: false })
  const statusOption = STATUS_OPTION[record.issue.state.name]
  if (!statusOption) throw new Error(`${identifier}: Linear state "${record.issue.state.name}" has no recorded Status option`)
  edit(["--field-id", FIELD.status, "--single-select-option-id", statusOption])
  edit(["--field-id", FIELD.linearId, "--text", identifier])
  const priorityOption = PRIORITY_OPTION[record.issue.priority ?? 0]
  if (priorityOption) edit(["--field-id", FIELD.priority, "--single-select-option-id", priorityOption])
  if (typeof record.issue.estimate === "number") edit(["--field-id", FIELD.estimate, "--number", String(record.issue.estimate)])
  ledger.board[identifier] = itemId
  saveLedger()
  process.stderr.write(`board ${boardDone}/${identifiers.length} ${identifier}    \r`)
}
console.error("")

// ---------------------------------------------------------------- phase 7: close
console.error("phase 7: closing finished issues")
for (const identifier of identifiers) {
  if (ledger.closed[identifier]) continue
  const reason = CLOSE_REASON[issues[identifier].issue.state.type]
  if (!reason) {
    ledger.closed[identifier] = "open"
    saveLedger()
    continue
  }
  gh(["issue", "close", String(numberOf(identifier)), "--repo", REPO, "--reason", reason])
  ledger.closed[identifier] = reason
  saveLedger()
  process.stderr.write(`closed ${identifier}    \r`)
}
console.error("")

// ---------------------------------------------------------------- phase 8: Linear projects
/**
 * A Linear project is the one piece of structure the first pass dropped. It survived only as prose
 * in the provenance footer, so a ticket in "539 Redesign" looked like any other ticket.
 *
 * A milestone is the exact analogue: an issue belongs to at most one, exactly as in Linear, and
 * GitHub gives it a sidebar slot on the issue, a page of its own with progress, and a field the
 * board can group by. A label would have shown the same string without any of that, and would have
 * let an issue carry two projects at once, which Linear cannot express.
 */
ledger.milestones = ledger.milestones ?? {}
ledger.milestoneOf = ledger.milestoneOf ?? {}
/**
 * The Linear project literally named "Backlog" is a holding pen, not a body of work with an end, so
 * it gets no milestone. A milestone implies something that completes and shows progress; 105
 * unscheduled tickets would show a permanently stalled bar and make every real project harder to
 * read. Those issues keep their board Status and carry no milestone, which is the same shape they
 * had in Linear.
 */
const NOT_A_MILESTONE = new Set(["Backlog"])
// The true Linear project, recorded in the map whether or not it earns a milestone.
const linearProjectOf = (identifier) => issues[identifier].issue.project?.name ?? null
const projectOf = (identifier) => {
  const name = linearProjectOf(identifier)
  return name && !NOT_A_MILESTONE.has(name) ? name : null
}
const projectNames = [...new Set(identifiers.map(projectOf).filter(Boolean))].sort()
console.error(`phase 8: ${projectNames.length} Linear projects as milestones`)
/**
 * Inspect before creating, rather than create and interpret the failure. A duplicate title returns
 * a bare "Validation Failed (HTTP 422)" whose body does not reliably name the cause, so branching on
 * the error text is guessing at an external interface. Listing first is the same number of calls on
 * a fresh run and is correct on a resumed one.
 */
const existingMilestones = new Map(
  JSON.parse(gh(["api", `repos/${REPO}/milestones?state=all&per_page=100`], { content: false })).map((milestone) => [milestone.title, milestone.number]),
)
for (const name of projectNames) {
  if (ledger.milestones[name]) continue
  if (existingMilestones.has(name)) {
    ledger.milestones[name] = existingMilestones.get(name)
    saveLedger()
    continue
  }
  const created = JSON.parse(gh(["api", `repos/${REPO}/milestones`, "-f", `title=${name}`, "-f", "description=Migrated from the Linear project of the same name."]))
  ledger.milestones[name] = created.number
  saveLedger()
}
let milestoned = 0
for (const identifier of identifiers) {
  const name = projectOf(identifier)
  if (!name || ledger.milestoneOf[identifier]) continue
  gh(["issue", "edit", String(numberOf(identifier)), "--repo", REPO, "--milestone", name])
  ledger.milestoneOf[identifier] = name
  saveLedger()
  milestoned += 1
  process.stderr.write(`milestones ${milestoned} ${identifier} -> ${name}          \r`)
}
console.error("")

// ---------------------------------------------------------------- the map
const map = {
  generatedAt: new Date().toISOString(),
  source: { tool: "linear", team: "ORB", workspace: "useorbitai" },
  target: { repository: REPO, projectUrl: PROJECT_URL, projectNumber: Number(PROJECT_NUMBER), projectId: PROJECT_ID },
  fields: FIELD,
  statusOptions: STATUS_OPTION,
  issues: Object.fromEntries(
    identifiers.map((identifier) => [
      identifier,
      {
        number: ledger.created[identifier].number,
        url: ledger.created[identifier].url,
        title: issues[identifier].issue.title,
        linearState: issues[identifier].issue.state.name,
        linearProject: linearProjectOf(identifier),
        milestone: ledger.milestoneOf[identifier] ?? null,
        projectItemId: ledger.board[identifier] ?? null,
      },
    ]),
  ),
}
writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`)
console.log(JSON.stringify({
  issues: identifiers.length,
  comments: totalComments,
  labels: labelColors.size,
  blockedByEdges: blockedByEdges.length,
  closed: Object.values(ledger.closed).filter((value) => value !== "open").length,
  map: mapPath,
  board: PROJECT_URL,
}, null, 2))
