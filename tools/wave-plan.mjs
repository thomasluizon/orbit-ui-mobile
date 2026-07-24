#!/usr/bin/env node
/**
 * The deterministic half of /orchestrate (REBUILD.md 3.2): read a Linear
 * project via the orca CLI, build the explicit blockedBy DAG, and print the
 * wave table. Merge-gated (D3): a ticket is READY only when every blocker is
 * in a completed/canceled state, and completion is granted by Thomas merging
 * the PR, never by an agent. Blockers outside the queried selection are
 * fetched individually and count as blocking unless done; a blocker that
 * cannot be fetched fails closed as blocking. This script only reads; it
 * launches nothing.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const USAGE = `usage: wave-plan.mjs --project "<name>" | --label "<label>" | --all [--json]

  --project "<name>"   plan the issues of one Linear project
  --label "<label>"    plan the issues carrying one label
  --all                plan every non-done issue of the team
  --json               emit the wave table as JSON instead of text
  --help, -h           print this usage and exit 0

exit codes: 0 wave table printed, 1 nothing to plan or a cycle, 2 usage/orca error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const TEAM = "ORB"
const orchestratorConfig = JSON.parse(
  readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8"),
)
const ATTEMPTS_BEFORE_REWRITE = orchestratorConfig.attemptsBeforeRewrite

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
  console.error(USAGE)
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

const toPlanIssue = (detail) => {
  const full = detail.issue ?? detail
  const relations = detail.relations ?? full.relations ?? []
  const labelNames = (full.labels ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name))
  return {
    identifier: full.identifier,
    title: full.title,
    state: full.state?.name ?? full.state,
    stateType: full.state?.type ?? null,
    labels: labelNames,
    attempts: Number((labelNames.find((name) => /^attempts:\d+$/.test(name)) ?? "attempts:0").split(":")[1]),
    blockedBy: relations
      .filter((relation) => relation.relationship === "blockedBy" || relation.type === "blockedBy")
      .map((relation) => relation.relatedIssue?.identifier ?? relation.issue?.identifier ?? relation.identifier)
      .filter(Boolean),
  }
}

const byIdentifier = new Map()
for (const issue of issues) {
  const planIssue = toPlanIssue(orcaJson(["linear", "issue", issue.identifier ?? issue.id, "--relations"]))
  byIdentifier.set(planIssue.identifier, planIssue)
}

const externalBlockers = [...new Set([...byIdentifier.values()].flatMap((issue) => issue.blockedBy))].filter(
  (blocker) => !byIdentifier.has(blocker),
)
for (const blocker of externalBlockers) {
  try {
    const raw = execFileSync(ORCA, ["linear", "issue", blocker, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    const parsed = JSON.parse(raw)
    if (parsed.ok === false) throw new Error(parsed.error?.message ?? "unknown orca error")
    byIdentifier.set(blocker, { ...toPlanIssue(parsed.result ?? parsed), blockedBy: [], external: true })
  } catch (error) {
    console.error(`WARNING: blocker ${blocker} could not be fetched (${error.message}); treating it as blocking`)
    byIdentifier.set(blocker, { identifier: blocker, title: "unresolved external blocker", state: "Unknown", stateType: null, labels: [], attempts: 0, blockedBy: [], external: true })
  }
}

const isDone = (identifier) => {
  const issue = byIdentifier.get(identifier)
  if (!issue) return false
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
  return !issue.external && issue.blockedBy.every(isDone) && issue.stateType !== "started" && issue.attempts < ATTEMPTS_BEFORE_REWRITE
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
      const strikes = issue.attempts >= ATTEMPTS_BEFORE_REWRITE ? "  [TWO STRIKES: rewrite the ticket first (D9)]" : ""
      const external = issue.external ? "  [external]" : ""
      console.log(`  ${identifier}  [${issue.state}]${external}  ${issue.title}${blockers}${strikes}`)
    }
  }
  console.log(`\nLAUNCHABLE NOW (all blockers merged, not started, under the strike limit): ${launchable?.join(", ") || "none"}`)
}
