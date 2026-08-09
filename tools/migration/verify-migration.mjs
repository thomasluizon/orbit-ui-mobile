#!/usr/bin/env node
/**
 * The migration's acceptance test. It reads the Linear export and the LIVE GitHub state and refuses
 * to agree they match unless every field it knows about matches.
 *
 * This exists because two real defects shipped before it did: the `visible-effect` label was copied
 * into the new repository after the concept was deleted, and Linear projects were flattened into
 * prose in a footer. Both were mechanically checkable and neither was checked. A migration that
 * only reports what it did cannot tell you what it dropped.
 *
 * Exit 0 means every assertion held. Any drift is printed and exits 1.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const [exportPath, mapPath] = process.argv.slice(2)
if (!exportPath || !mapPath) {
  console.error("usage: verify-migration.mjs <linear-export.json> <linear-to-github-map.json>")
  process.exit(2)
}

const REPO = "thomasluizon/orbit-tickets"
const OWNER = "thomasluizon"
const PROJECT_NUMBER = "2"
// Deliberately not carried over: the concept was deleted from the harness in the same pass.
const DELETED_LABELS = new Set(["visible-effect"])
// A Linear project that is a holding pen, not a body of work, so it earns no milestone.
const NOT_A_MILESTONE = new Set(["Backlog"])
const CLOSED_TYPES = { completed: "COMPLETED", canceled: "NOT_PLANNED", duplicate: "DUPLICATE" }

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })

const data = JSON.parse(readFileSync(exportPath, "utf8"))
const map = JSON.parse(readFileSync(mapPath, "utf8"))
const identifiers = Object.keys(map.issues)

console.error(`reading ${identifiers.length} live issues`)
const live = new Map()
for (const issue of JSON.parse(gh(["issue", "list", "--repo", REPO, "--state", "all", "--limit", "1000", "--json", "number,title,state,stateReason,labels,milestone,comments"]))) {
  live.set(issue.number, issue)
}
console.error(`reading the board`)
const board = new Map()
for (const item of JSON.parse(gh(["project", "item-list", PROJECT_NUMBER, "--owner", OWNER, "--format", "json", "--limit", "1000"])).items) {
  if (item.content?.number) board.set(item.content.number, item)
}

const drift = []
const note = (identifier, what, expected, actual) =>
  drift.push(`${identifier} (#${map.issues[identifier].number}) ${what}: expected ${JSON.stringify(expected)}, live ${JSON.stringify(actual)}`)

for (const identifier of identifiers) {
  const source = data.issues[identifier].issue
  const record = map.issues[identifier]
  const issue = live.get(record.number)
  if (!issue) {
    drift.push(`${identifier} (#${record.number}) is missing from GitHub entirely`)
    continue
  }

  if (issue.title !== source.title) note(identifier, "title", source.title, issue.title)

  const expectedLabels = [...new Set((source.labels ?? []).map((label) => label.name).filter((name) => !DELETED_LABELS.has(name)))].sort()
  const actualLabels = [...new Set((issue.labels ?? []).map((label) => label.name))].sort()
  if (expectedLabels.join("|") !== actualLabels.join("|")) note(identifier, "labels", expectedLabels, actualLabels)
  for (const deleted of DELETED_LABELS) {
    if (actualLabels.includes(deleted)) drift.push(`${identifier} (#${record.number}) still carries the deleted label ${deleted}`)
  }

  const expectedState = CLOSED_TYPES[source.state.type] ? "CLOSED" : "OPEN"
  if (issue.state !== expectedState) note(identifier, "state", expectedState, issue.state)
  const expectedReason = CLOSED_TYPES[source.state.type] ?? null
  const actualReason = issue.stateReason === "" ? null : issue.stateReason
  if (expectedReason !== actualReason) note(identifier, "stateReason", expectedReason, actualReason)

  const projectName = source.project?.name ?? null
  const expectedMilestone = projectName && !NOT_A_MILESTONE.has(projectName) ? projectName : null
  const actualMilestone = issue.milestone?.title ?? null
  if (expectedMilestone !== actualMilestone) note(identifier, "milestone", expectedMilestone, actualMilestone)

  /**
   * Only comments this migration wrote are counted, identified by the provenance header it stamps
   * on every one. A bare count is wrong: GitHub integrations comment on new issues by themselves,
   * and the Codex app had already added one here. Counting those made a faithful issue look like it
   * had gained a duplicate.
   */
  const expectedComments = (data.issues[identifier].comments ?? []).length
  const actualComments = (issue.comments ?? []).filter((comment) => comment.body?.startsWith("<sub>Linear comment by")).length
  if (expectedComments !== actualComments) note(identifier, "comment count", expectedComments, actualComments)

  const item = board.get(record.number)
  if (!item) drift.push(`${identifier} (#${record.number}) is not on the board`)
  else if (item.status !== source.state.name) note(identifier, "board Status", source.state.name, item.status)
}

/**
 * The dependency graph is checked as a whole rather than per issue, because a blockedBy edge that
 * landed on the wrong issue is invisible when you only count edges per issue.
 */
const expectedEdges = new Set()
for (const identifier of identifiers) {
  for (const relation of data.issues[identifier].relations ?? []) {
    const other = relation.relatedIssue.identifier
    if (!map.issues[other]) continue
    if (relation.relationship === "blockedBy") expectedEdges.add(`${map.issues[identifier].number}<-${map.issues[other].number}`)
    if (relation.relationship === "blocks") expectedEdges.add(`${map.issues[other].number}<-${map.issues[identifier].number}`)
  }
}
console.error(`checking ${expectedEdges.size} dependency edges`)
const actualEdges = new Set()
for (const issue of JSON.parse(gh(["issue", "list", "--repo", REPO, "--state", "all", "--limit", "1000", "--json", "number,blockedBy"]))) {
  for (const blocker of issue.blockedBy?.nodes ?? []) actualEdges.add(`${issue.number}<-${blocker.number}`)
}
for (const edge of expectedEdges) if (!actualEdges.has(edge)) drift.push(`missing dependency edge ${edge} (blocked<-blocker)`)
for (const edge of actualEdges) if (!expectedEdges.has(edge)) drift.push(`unexpected dependency edge ${edge} (blocked<-blocker)`)

const migratedCount = identifiers.length
const exportedCount = Object.keys(data.issues).length
console.log(
  JSON.stringify(
    {
      exportedFromLinear: exportedCount,
      migrated: migratedCount,
      deliberatelyNotMigrated: Object.keys(map.notMigrated ?? {}),
      liveIssues: live.size,
      onBoard: board.size,
      dependencyEdges: expectedEdges.size,
      drift: drift.length,
    },
    null,
    2,
  ),
)
if (drift.length > 0) {
  console.error(`\n${drift.length} DRIFT:`)
  for (const line of drift.slice(0, 500)) console.error(`  ${line}`)
  if (drift.length > 500) console.error(`  ... and ${drift.length - 60} more`)
  process.exit(1)
}
console.error("\nno drift: every migrated field matches the Linear export")
