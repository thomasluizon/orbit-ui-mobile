#!/usr/bin/env node
/**
 * The deterministic half of /orchestrate: read a Linear
 * project via the orca CLI, build the explicit blockedBy DAG, and print the
 * wave table. Merge-gated (D3): a ticket is READY only when every blocker is
 * in a completed/canceled state, and completion is granted by Thomas merging
 * the PR, never by an agent. Blockers outside the queried selection are
 * fetched individually and count as blocking unless done; a blocker that
 * cannot be fetched fails closed as blocking. This script only reads; it
 * launches nothing.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFileSync } from "node:fs"

const USAGE = `usage: wave-plan.mjs --project "<name>" | --label "<label>" | --all | --issues "ORB-a,ORB-b" [--json]

  --project "<name>"   plan the issues of one Linear project
  --label "<label>"    plan the issues carrying one label
  --all                plan every non-done issue of the team
  --issues "ORB-a,..." plan only these issues, resolving their complete blocker DAG
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
const RELATION_FETCH_CONCURRENCY = 8
const execFileAsync = promisify(execFile)

const failureReason = (error) => {
  const output = error.stdout?.toString().trim()
  if (output) {
    try {
      const parsed = JSON.parse(output)
      if (parsed.error?.message) return parsed.error.message
    } catch {
      return output.slice(0, 400)
    }
  }
  if (error.signal) return `terminated by ${error.signal}`
  if (error.stderr?.toString().trim()) return error.stderr.toString().trim().slice(0, 400)
  return error.message
}

const orcaJson = async (args, identifier) => {
  let raw
  try {
    ;({ stdout: raw } = await execFileAsync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }))
  } catch (error) {
    throw new Error(`failed to fetch ${identifier}: ${failureReason(error)}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`failed to fetch ${identifier}: orca returned unparseable JSON`)
  }
  if (parsed.ok === false) throw new Error(`failed to fetch ${identifier}: ${parsed.error?.message ?? "unknown orca error"}`)
  return parsed.result ?? parsed
}

const mapBounded = async (items, mapper) => {
  const results = new Array(items.length)
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(RELATION_FETCH_CONCURRENCY, items.length) }, worker))
  return results
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const project = argOf("--project")
const label = argOf("--label")
const all = process.argv.includes("--all")
const issuesArgument = argOf("--issues")
const issuesMode = issuesArgument !== null
const requestedIdentifiers = typeof issuesArgument === "string" ? [...new Set(issuesArgument.split(",").map((identifier) => identifier.trim()).filter(Boolean))] : []
if (issuesMode && (project || label || all)) {
  console.error("--issues cannot be combined with --project, --label, or --all")
  process.exit(2)
}
if (!project && !label && !all && !issuesMode) {
  console.error(USAGE)
  process.exit(2)
}
if (issuesMode && (!issuesArgument || issuesArgument.startsWith("--") || requestedIdentifiers.length === 0)) {
  console.error("--issues requires at least one identifier")
  process.exit(2)
}

let issues
if (issuesMode) {
  issues = requestedIdentifiers.map((identifier) => ({ identifier }))
} else {
  const listArgs = ["linear", "list-issues", "--team", TEAM, "--limit", "250"]
  if (project) listArgs.push("--project", project)
  if (label) listArgs.push("--label", label)
  let listed
  try {
    listed = await orcaJson(listArgs, project ?? label ?? "the requested issue list")
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  issues = listed.issues ?? listed.nodes ?? listed
  if (!Array.isArray(issues) || issues.length === 0) {
    console.error("no issues matched; nothing to plan")
    process.exit(1)
  }
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

let planIssues
if (issuesMode) {
  const requested = await mapBounded(issues, async (issue) => {
    const identifier = issue.identifier ?? issue.id
    try {
      return { identifier, issue: toPlanIssue(await orcaJson(["linear", "issue", identifier, "--relations"], identifier)) }
    } catch {
      return { identifier, error: true }
    }
  })
  const unresolved = requested.filter((result) => result.error).map((result) => result.identifier)
  const done = requested.filter((result) => !result.error && (DONE_TYPES.has(result.issue.stateType) || result.issue.state === "Done")).map((result) => result.identifier)
  if (unresolved.length || done.length) {
    if (unresolved.length) console.error(`unresolved requested identifier(s): ${unresolved.join(", ")}`)
    if (done.length) console.error(`Done requested identifier(s): ${done.join(", ")}`)
    process.exit(1)
  }
  let listed
  try {
    listed = await orcaJson(["linear", "list-issues", "--team", TEAM, "--limit", "250"], "the complete team issue list")
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  const teamIssues = listed.issues ?? listed.nodes ?? listed
  if (!Array.isArray(teamIssues)) {
    console.error("failed to fetch the complete team issue list: orca returned no issue list")
    process.exit(2)
  }
  const requestedByIdentifier = new Map(requested.map((result) => [result.identifier, result.issue]))
  try {
    const remainingTeamIssues = teamIssues.filter((issue) => !requestedByIdentifier.has(issue.identifier ?? issue.id))
    const remainingPlanIssues = await mapBounded(remainingTeamIssues, async (issue) => {
      const identifier = issue.identifier ?? issue.id
      return toPlanIssue(await orcaJson(["linear", "issue", identifier, "--relations"], identifier))
    })
    planIssues = [...requestedByIdentifier.values(), ...remainingPlanIssues]
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
} else {
  try {
    planIssues = await mapBounded(issues, async (issue) => {
      const identifier = issue.identifier ?? issue.id
      return toPlanIssue(await orcaJson(["linear", "issue", identifier, "--relations"], identifier))
    })
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
const byIdentifier = new Map(planIssues.map((issue) => [issue.identifier, issue]))

const externalBlockers = [...new Set([...byIdentifier.values()].flatMap((issue) => issue.blockedBy))].filter(
  (blocker) => !byIdentifier.has(blocker),
)
const blockers = await mapBounded(externalBlockers, async (identifier) => {
  try {
    return { ...toPlanIssue(await orcaJson(["linear", "issue", identifier], identifier)), blockedBy: [], external: true }
  } catch (error) {
    console.error(`WARNING: blocker ${identifier} could not be fetched (${error.message}); treating it as blocking`)
    return { identifier, title: "unresolved external blocker", state: "Unknown", stateType: null, labels: [], attempts: 0, blockedBy: [], external: true }
  }
})
for (const blocker of blockers) byIdentifier.set(blocker.identifier, blocker)

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

const twoStrikes = [...byIdentifier.values()]
  .filter((issue) => !isDone(issue.identifier) && issue.attempts >= ATTEMPTS_BEFORE_REWRITE)
  .map((issue) => issue.identifier)
  .sort()

const dependents = new Map()
for (const issue of byIdentifier.values()) {
  for (const blocker of issue.blockedBy) {
    if (!dependents.has(blocker)) dependents.set(blocker, [])
    dependents.get(blocker).push(issue.identifier)
  }
}

const reachOf = (identifier) => {
  const seen = new Set()
  const queue = [...(dependents.get(identifier) ?? [])]
  while (queue.length) {
    const next = queue.shift()
    if (seen.has(next) || isDone(next)) continue
    seen.add(next)
    queue.push(...(dependents.get(next) ?? []))
  }
  return seen.size
}

const visibleWaves = issuesMode
  ? waves.map((wave, index) => ({ wave: index + 1, issues: wave.filter((identifier) => requestedIdentifiers.includes(identifier)) })).filter(({ issues: wave }) => wave.length)
  : waves.map((wave, index) => ({ wave: index + 1, issues: wave }))
const visibleLaunchable = issuesMode
  ? requestedIdentifiers.filter((identifier) => {
      const issue = byIdentifier.get(identifier)
      return issue.blockedBy.every(isDone) && issue.stateType !== "started" && issue.attempts < ATTEMPTS_BEFORE_REWRITE
    })
  : launchable
const visibleTwoStrikes = issuesMode ? twoStrikes.filter((identifier) => requestedIdentifiers.includes(identifier)) : twoStrikes
const blockerStateOf = (issue) => {
  const blocking = issue.blockedBy.filter((identifier) => !isDone(identifier))
  return blocking.length ? `blocked by ${blocking.join(", ")}` : "clear"
}
const visibleIssue = (identifier) => {
  const issue = byIdentifier.get(identifier)
  if (!issuesMode) return { ...issue, reach: reachOf(identifier) }
  return {
    ...issue,
    reach: reachOf(identifier),
    blockerState: blockerStateOf(issue),
    launchable: visibleLaunchable.includes(identifier),
  }
}

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        waves: visibleWaves.map(({ wave, issues: waveIssues }) => ({
          wave,
          issues: waveIssues.map(visibleIssue),
        })),
        launchable: visibleLaunchable,
        twoStrikes: visibleTwoStrikes,
      },
      null,
      2,
    ),
  )
} else {
  for (const { wave, issues: waveIssues } of visibleWaves) {
    console.log(`WAVE ${wave}`)
    for (const identifier of waveIssues) {
      const issue = byIdentifier.get(identifier)
      const blockers = issue.blockedBy.length ? `  blockedBy: ${issue.blockedBy.join(", ")}` : ""
      const strikes = issue.attempts >= ATTEMPTS_BEFORE_REWRITE ? "  [TWO STRIKES: rewrite the ticket first (D9)]" : ""
      const external = issue.external ? "  [external]" : ""
      const restriction = issuesMode ? `  blockerState: ${blockerStateOf(issue)}  launchable: ${visibleLaunchable.includes(identifier) ? "yes" : "no"}` : ""
      console.log(`  ${identifier}  [${issue.state}]${external}  ${issue.title}${blockers}${restriction}${strikes}`)
    }
  }
  console.log(`\nLAUNCHABLE NOW (all blockers merged, not started, under the strike limit): ${visibleLaunchable?.join(", ") || "none"}`)
}
