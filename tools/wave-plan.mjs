#!/usr/bin/env node
// The deterministic half of /orchestrate (REBUILD.md 3.2): read a Linear
// project via the orca CLI, build the explicit blockedBy DAG, and print the
// wave table. Merge-gated (D3): a ticket is READY only when every blocker is
// in a completed/canceled state, and completion is granted by Thomas merging
// the PR, never by an agent. This script only reads; it launches nothing.
//
// Usage:
//   node tools/wave-plan.mjs --project "<name>" [--json]
//   node tools/wave-plan.mjs --label "<label>" [--json]

import { execFileSync } from "node:child_process"

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const TEAM = "ORB"

const orcaJson = (args) => {
  const raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const parsed = JSON.parse(raw)
  if (parsed.ok === false) {
    console.error(`orca ${args.join(" ")} failed: ${parsed.error?.message}`)
    process.exit(2)
  }
  return parsed.result ?? parsed
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const project = argOf("--project")
const label = argOf("--label")
const all = process.argv.includes("--all")
if (!project && !label && !all) {
  console.error('usage: wave-plan.mjs --project "<name>" | --label "<label>" | --all [--json]')
  process.exit(2)
}

const listArgs = ["linear", "list-issues", "--team", TEAM, "--limit", "250"]
if (project) listArgs.push("--project", project)
if (label) listArgs.push("--label", label)
const listed = orcaJson(listArgs)
const issues = listed.issues ?? listed.nodes ?? listed
if (!Array.isArray(issues) || issues.length === 0) {
  console.error("no issues matched; nothing to plan")
  process.exit(1)
}

const DONE_TYPES = new Set(["completed", "canceled", "duplicate"])

const byIdentifier = new Map()
for (const issue of issues) {
  const detail = orcaJson(["linear", "issue", issue.identifier ?? issue.id, "--relations"])
  const full = detail.issue ?? detail
  const relations = detail.relations ?? full.relations ?? []
  byIdentifier.set(full.identifier, {
    identifier: full.identifier,
    title: full.title,
    state: full.state?.name ?? full.state,
    stateType: full.state?.type ?? null,
    labels: (full.labels ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name)),
    attempts: Number(((full.labels ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name)).find((name) => /^attempts:\d+$/.test(name)) ?? "attempts:0").split(":")[1]),
    blockedBy: relations
      .filter((relation) => relation.relationship === "blockedBy" || relation.type === "blockedBy")
      .map((relation) => relation.relatedIssue?.identifier ?? relation.issue?.identifier ?? relation.identifier)
      .filter(Boolean),
  })
}

const isDone = (identifier) => {
  const issue = byIdentifier.get(identifier)
  if (!issue) return true
  return DONE_TYPES.has(issue.stateType) || issue.state === "Done"
}

const waves = []
const assigned = new Map()
let frontier = [...byIdentifier.values()].filter((issue) => !isDone(issue.identifier))
let waveNumber = 1
while (frontier.length) {
  const ready = frontier.filter((issue) =>
    issue.blockedBy.every((blocker) => isDone(blocker) || (assigned.get(blocker) ?? Infinity) < waveNumber),
  )
  if (ready.length === 0) {
    console.error(`CYCLE or unresolvable blockers among: ${frontier.map((issue) => issue.identifier).join(", ")}`)
    process.exit(1)
  }
  for (const issue of ready) assigned.set(issue.identifier, waveNumber)
  waves.push(ready.map((issue) => issue.identifier).sort())
  frontier = frontier.filter((issue) => !assigned.has(issue.identifier))
  waveNumber++
}

const launchable = waves[0]?.filter((identifier) => {
  const issue = byIdentifier.get(identifier)
  return issue.blockedBy.every(isDone) && issue.stateType !== "started" && issue.attempts < 2
})

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        waves: waves.map((wave, index) => ({
          wave: index + 1,
          issues: wave.map((identifier) => byIdentifier.get(identifier)),
        })),
        launchable,
      },
      null,
      2,
    ),
  )
} else {
  for (const [index, wave] of waves.entries()) {
    console.log(`WAVE ${index + 1}`)
    for (const identifier of wave) {
      const issue = byIdentifier.get(identifier)
      const blockers = issue.blockedBy.length ? `  blockedBy: ${issue.blockedBy.join(", ")}` : ""
      const strikes = issue.attempts >= 2 ? "  [TWO STRIKES: rewrite the ticket first (D9)]" : ""
      console.log(`  ${identifier}  [${issue.state}]  ${issue.title}${blockers}${strikes}`)
    }
  }
  console.log(`\nLAUNCHABLE NOW (all blockers merged, not started, under the strike limit): ${launchable?.join(", ") || "none"}`)
}
