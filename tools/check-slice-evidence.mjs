#!/usr/bin/env node
/**
 * Prove that a coordinator's slices really ran CONCURRENTLY, and that every one of them was paid
 * for, from artifacts on disk alone.
 *
 * Wall clock cannot do this job twice over: a hermetic test may not invoke the model, and a
 * timing assertion over a real run flakes. So the evidence is structural. Two facts, both
 * recorded by the engine itself rather than claimed by the agent that spent the money:
 *
 *   one engine rollout per slice process, and two of their [startedAt, endedAt] intervals OVERLAP
 *   one automation-budget reserve AND one record per slice, each a distinct reservation whose own
 *   window CONTAINS that slice process's start
 *
 * The second half is not decoration. Measured on ORB-153: three `spawn_agent` children burned
 * 160,505 uncached input tokens that the ledger never saw, because the fan-out happened inside a
 * session the launcher had already reserved once. A concurrency gate that only counted rollouts
 * would have called that run green.
 *
 * Containment, rather than "any earlier reservation", is what binds the ledger to THIS run. No
 * field is shared between a ledger row and a rollout: the ledger identity is
 * `<issue>:<invocation start>:<uuid>` and the rollout carries only its thread id, cwd and branch,
 * so an explicit run identity does not exist to key on. The interval does. `reserve` stamps
 * startedAt just before the launch mutation and the closing `record` stamps endedAt at the
 * provider observation that ends the session, so a live slice process starts inside its own
 * reservation's window and outside every earlier one. Matching on "the earliest reservation that
 * merely precedes this rollout" let last week's completed launches pay for a fan-out that
 * reserved nothing at all.
 *
 * Both shapes of fan-out are accepted, because both really ship: separate slice PROCESSES in one
 * coordinator worktree (`launch-worker.mjs --existing-worktree`), and the in-session
 * `spawn_agent` fallback. The rollout home is read from the WORKER's environment and never
 * assumed: Orca redirects CODEX_HOME to %APPDATA%\orca\codex-runtime-home\home, so a gate that
 * looked in ~/.codex would find nothing and report it as "no slices ran". The rollout location is
 * a property of the resolved engine, so it lives in ENGINE_ROLLOUTS rather than being hardcoded.
 *
 * This tool only reads. It launches nothing, records nothing, and moves no ticket.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, join, resolve } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: check-slice-evidence.mjs --issue ORB-N --slices <path> [--engine-home <path>] [--ledger <path>] [--json]

  --issue ORB-N       the ticket whose slice run is being proved (required)
  --slices <path>     JSON declaring the slice plan that was executed (required):
                      { "slices": [ { "name": "<slice>", "files": ["<path>", ...] }, ... ] }
                      A slice declaring no file set FAILS: an undeclared file set cannot be
                      proved disjoint, and silence must not buy parallelism
  --engine-home <path>
                      the worker's resolved engine home holding sessions/YYYY/MM/DD/rollout-*.jsonl.
                      Defaults to the resolved engine's home environment variable (CODEX_HOME for
                      codex) and is NEVER assumed: Orca redirects it away from ~/.codex
  --ledger <path>     automation-budget JSONL; defaults to ORBIT_AUTOMATION_BUDGET_LEDGER
  --json              emit the verdict as JSON instead of text
  --help, -h          print this usage and exit 0

The verdict is structural, never wall clock. It passes when, for the given issue:
  every declared slice names at least one file, and no two slices share one
  each slice process left its own engine rollout, matched by branch or worktree path
  two or more of those rollouts have OVERLAPPING [startedAt, endedAt] intervals
  each slice process maps to its own budget reservation carrying a reserve AND a record row,
    whose reserve-to-record window CONTAINS that process's start, so a completed earlier run's
    reservations cannot pay for a later fan-out that reserved nothing
In the in-session fallback shape, the slice processes are the \`spawn_agent\` children of one
parent rollout, each corroborated by a child rollout carrying "thread_source":"subagent", the
parent's thread id, and "agent_path":"/root/<slice>". Their concurrency is proved by the SAME
overlapping child intervals as the multi-process shape, never by a synchronisation event.

exit codes: 0 the slice run is proved concurrent and fully reserved,
            1 the evidence does not prove it, with every shortfall named,
            2 usage, slice-plan or engine-profile error,
            3 an engine home or ledger could not be read`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const KNOWN_FLAGS = new Set(["--issue", "--slices", "--engine-home", "--ledger", "--json"])
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}
for (const argument of process.argv.slice(2)) {
  if (argument.startsWith("--") && !KNOWN_FLAGS.has(argument)) fail(2, `${USAGE}\n\nunknown flag: ${argument}`)
}

const issue = argOf("--issue")
const slicesArgument = argOf("--slices")
const json = process.argv.includes("--json")
if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-163`)
if (!slicesArgument) fail(2, `${USAGE}\n\n--slices is required`)

/**
 * Where each engine writes the run record a slice process cannot forge, keyed by the engine
 * .claude/orchestrator.json resolves. An engine with no entry is REFUSED rather than assumed to
 * look like codex: a gate that guessed a path would report "no slices ran" for a real run.
 */
const ENGINE_ROLLOUTS = {
  codex: { homeEnvironmentVariable: "CODEX_HOME", sessionsDirectory: "sessions" },
}

let engineName
try {
  engineName = readOrchestratorConfig().worker
} catch (error) {
  fail(2, error.message)
}
const engineProfile = ENGINE_ROLLOUTS[engineName]
if (!engineProfile) {
  fail(
    2,
    `.claude/orchestrator.json resolves the worker engine "${engineName}", which tools/check-slice-evidence.mjs has no rollout profile for. Add one to ENGINE_ROLLOUTS naming that engine's home environment variable and its sessions directory. Known: ${Object.keys(ENGINE_ROLLOUTS).join(", ")}`,
  )
}

const engineHomeArgument = argOf("--engine-home") ?? process.env[engineProfile.homeEnvironmentVariable]
if (!engineHomeArgument || engineHomeArgument.trim().length === 0) {
  fail(
    2,
    `no engine home: pass --engine-home or set ${engineProfile.homeEnvironmentVariable} to the value the WORKER runs with. It is never assumed to be a default home, because Orca redirects ${engineProfile.homeEnvironmentVariable} for the terminals it spawns and a run recorded elsewhere would read as no run at all.`,
  )
}
const engineHome = resolve(engineHomeArgument)

const readJsonFile = (path, label) => {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch (error) {
    fail(3, `could not read ${label} ${path}: ${error.message}`)
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    fail(2, `${label} ${path} is not JSON: ${error.message}`)
  }
}

const slicePlan = readJsonFile(resolve(slicesArgument), "the slice plan")
const declaredSlices = slicePlan?.slices
if (!Array.isArray(declaredSlices) || declaredSlices.length === 0) {
  fail(2, `the slice plan ${slicesArgument} declares no slices array`)
}
for (const slice of declaredSlices) {
  if (typeof slice?.name !== "string" || slice.name.trim().length === 0) {
    fail(2, `the slice plan ${slicesArgument} carries a slice with no name`)
  }
}

const shortfalls = []

/** An undeclared file set is the silence case: it cannot be proved disjoint from anything. */
for (const slice of declaredSlices) {
  const files = Array.isArray(slice.files) ? slice.files.filter((file) => typeof file === "string" && file.trim()) : []
  if (files.length === 0) shortfalls.push(`slice "${slice.name}" declares no file set, so its disjointness cannot be proved`)
}
for (let left = 0; left < declaredSlices.length; left++) {
  for (let right = left + 1; right < declaredSlices.length; right++) {
    const rightFiles = new Set(declaredSlices[right].files ?? [])
    const shared = (declaredSlices[left].files ?? []).filter((file) => rightFiles.has(file))
    if (shared.length) {
      shortfalls.push(`slices "${declaredSlices[left].name}" and "${declaredSlices[right].name}" both claim ${shared.join(", ")}`)
    }
  }
}

const rolloutFilesUnder = (directory) => {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    fail(3, `could not read the engine sessions directory ${directory}: ${error.message}`)
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return rolloutFilesUnder(path)
    return /^rollout-.*\.jsonl$/.test(entry.name) ? [path] : []
  })
}

/**
 * One rollout, reduced to what the verdict needs. `payload.id` is the thread's OWN id while
 * `payload.session_id` on a subagent rollout carries its PARENT's, measured on the real
 * 2026-07-27 pair; reading session_id as identity would make every child look like its parent.
 */
const readRollout = (path) => {
  let lines
  try {
    lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean)
  } catch (error) {
    fail(3, `could not read the rollout ${path}: ${error.message}`)
  }
  const events = lines.map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      fail(3, `rollout ${path} line ${index + 1} is not JSON: ${error.message}`)
    }
  })
  const meta = events.find((event) => event.type === "session_meta")
  if (!meta) return null
  /**
   * Only `spawn_agent` is counted, and only because it was OBSERVED: 143 real function_call
   * events carrying "name":"spawn_agent","namespace":"collaboration" across 36 of the 275 codex
   * rollouts on this machine. No synchronisation event is read. `close_agent` is a real tool in
   * the installed engine (codex 0.146.0 names core/src/tools/handlers/multi_agents/close_agent.rs)
   * but it appears as a rollout event ZERO times in those 275, and treating one between two
   * spawns as proof of a serial fan-out would be unsound even where it does fire: closing a
   * finished child before spawning the next is an ordinary concurrent pipeline. Overlapping
   * child intervals prove the same thing from data every rollout carries.
   */
  const spawns = events.filter((event) => event.payload?.type === "function_call" && event.payload?.name === "spawn_agent")
  return {
    path,
    file: basename(path),
    threadId: meta.payload?.id ?? meta.payload?.session_id ?? null,
    parentThreadId: meta.payload?.parent_thread_id ?? null,
    threadSource: meta.payload?.thread_source ?? null,
    agentPath: meta.payload?.agent_path ?? null,
    cwd: meta.payload?.cwd ?? "",
    branch: meta.payload?.git?.branch ?? "",
    startedAt: Date.parse(meta.payload?.timestamp ?? meta.timestamp),
    endedAt: Date.parse(events.at(-1).timestamp ?? meta.timestamp),
    spawnAgentCalls: spawns.length,
  }
}

const sessionsRoot = join(engineHome, engineProfile.sessionsDirectory)
if (!existsSync(sessionsRoot) || !statSync(sessionsRoot).isDirectory()) {
  fail(3, `the resolved engine home ${engineHome} has no ${engineProfile.sessionsDirectory} directory, so no run record exists to read`)
}
const ticketMarker = issue.toLowerCase()
const rollouts = rolloutFilesUnder(sessionsRoot)
  .map(readRollout)
  .filter(Boolean)
  .filter(
    (rollout) =>
      rollout.branch.toLowerCase().includes(ticketMarker) || rollout.cwd.toLowerCase().replaceAll("\\", "/").includes(ticketMarker),
  )
  .sort((left, right) => left.startedAt - right.startedAt)

const children = rollouts.filter((rollout) => rollout.threadSource === "subagent" && rollout.parentThreadId)
const shape = children.length > 0 ? "in-session-fanout" : "multi-process"

let sliceProcesses = rollouts.filter((rollout) => rollout.threadSource !== "subagent")
if (shape === "in-session-fanout") {
  const parentIds = new Set(children.map((child) => child.parentThreadId))
  if (parentIds.size !== 1) {
    shortfalls.push(`the subagent rollouts name ${parentIds.size} different parent threads (${[...parentIds].join(", ")}); one fan-out has one parent`)
  }
  const parent = rollouts.find((rollout) => parentIds.has(rollout.threadId) && rollout.threadSource !== "subagent")
  if (!parent) {
    shortfalls.push(`no parent rollout for subagent thread(s) ${[...parentIds].join(", ")} under ${engineHome}`)
  } else {
    if (parent.spawnAgentCalls < 2) {
      shortfalls.push(`parent rollout ${parent.file} carries ${parent.spawnAgentCalls} spawn_agent call(s); a fan-out needs at least two`)
    }
    for (const slice of declaredSlices) {
      const expected = `/root/${slice.name}`
      if (!children.some((child) => child.agentPath === expected && child.parentThreadId === parent.threadId)) {
        shortfalls.push(`no subagent rollout carrying agent_path "${expected}" under parent ${parent.threadId}`)
      }
    }
  }
  sliceProcesses = children
}

if (sliceProcesses.length < declaredSlices.length) {
  shortfalls.push(
    `${declaredSlices.length} slice(s) declared but only ${sliceProcesses.length} ${shape} rollout(s) for ${issue} under ${engineHome}; a slice with no run record did not run`,
  )
}

const overlapping = []
for (let left = 0; left < sliceProcesses.length; left++) {
  for (let right = left + 1; right < sliceProcesses.length; right++) {
    if (sliceProcesses[left].startedAt < sliceProcesses[right].endedAt && sliceProcesses[right].startedAt < sliceProcesses[left].endedAt) {
      overlapping.push([sliceProcesses[left].file, sliceProcesses[right].file])
    }
  }
}
if (overlapping.length === 0) {
  shortfalls.push(
    `no two of the ${sliceProcesses.length} slice rollout(s) for ${issue} have overlapping intervals, so they ran one after another rather than concurrently`,
  )
}

const ledgerPath = resolve(argOf("--ledger") ?? process.env.ORBIT_AUTOMATION_BUDGET_LEDGER ?? join(engineHome, "automation-budget.jsonl"))
let ledgerRows = []
if (existsSync(ledgerPath)) {
  let raw
  try {
    raw = readFileSync(ledgerPath, "utf8")
  } catch (error) {
    fail(3, `could not read the budget ledger ${ledgerPath}: ${error.message}`)
  }
  ledgerRows = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        fail(3, `budget ledger ${ledgerPath} line ${index + 1} is not JSON: ${error.message}`)
      }
    })
} else {
  shortfalls.push(`no budget ledger at ${ledgerPath}, so no slice can be shown to have been paid for`)
}

/**
 * A reservation counts only when it is CLOSED: `reserve` appends a pending row and `record`
 * appends the measured one. A pending row on its own is a launch nobody ever measured, which is
 * the stranded reservation the fuse already fails closed on; it must not read as evidence here.
 *
 * The pair also delimits the WINDOW the reservation paid for. `reserve` stamps startedAt at the
 * invocation start it was gating and the closing `record` stamps endedAt at the provider
 * observation that ends that invocation, so [reserve.startedAt, record.endedAt] spans exactly the
 * run. Appends are append-only with the latest record authoritative, so the last measured row is
 * the one that closes the window.
 */
const reservations = []
for (const identity of new Set(ledgerRows.map((row) => row.identity).filter((value) => typeof value === "string"))) {
  if (!identity.startsWith(`${issue}:`)) continue
  const rows = ledgerRows.filter((row) => row.identity === identity)
  const reserved = rows.find((row) => row.pending === true)
  const recorded = rows.findLast(
    (row) => row.pending !== true && row.cancelled !== true && Number.isFinite(row.inputTokens) && Number.isFinite(row.outputTokens),
  )
  if (!reserved) {
    shortfalls.push(`budget identity ${identity} has a record but no reserve row, so its slice was never gated by the fuse`)
    continue
  }
  if (!recorded) {
    shortfalls.push(`budget identity ${identity} reserved but never recorded measured tokens, so its slice spend is unknown`)
    continue
  }
  reservations.push({ identity, startedAt: Date.parse(reserved.startedAt), endedAt: Date.parse(recorded.endedAt) })
}
reservations.sort((left, right) => left.startedAt - right.startedAt)

/**
 * A reservation is appended moments before its process starts and closed once that process has
 * finished, so a slice process is claimed only by a reservation whose window CONTAINS its start.
 * "The earliest reservation that merely precedes it" is what let an issue's earlier completed
 * launches pay for a later fan-out that reserved nothing.
 */
const claimed = new Set()
const unreserved = []
for (const process_ of sliceProcesses) {
  const match = reservations.find(
    (reservation) =>
      !claimed.has(reservation.identity) && reservation.startedAt <= process_.startedAt && process_.startedAt <= reservation.endedAt,
  )
  if (!match) {
    unreserved.push(process_)
    continue
  }
  claimed.add(match.identity)
}
for (const process_ of unreserved) {
  shortfalls.push(
    `unreserved slice process: rollout ${process_.file} (thread ${process_.threadId}${process_.agentPath ? `, ${process_.agentPath}` : ""}) started ${new Date(process_.startedAt).toISOString()} inside no automation-budget reservation window for ${issue}; its spend is invisible to the fuse`,
  )
}

const verdict = {
  issue,
  engine: engineName,
  engineHome,
  shape,
  declaredSlices: declaredSlices.map((slice) => slice.name),
  sliceRollouts: sliceProcesses.map((process_) => ({
    file: process_.file,
    threadId: process_.threadId,
    agentPath: process_.agentPath,
    startedAt: new Date(process_.startedAt).toISOString(),
    endedAt: new Date(process_.endedAt).toISOString(),
  })),
  overlappingPairs: overlapping,
  reservations: reservations.map((reservation) => reservation.identity),
  shortfalls,
}

if (json) {
  console.log(JSON.stringify(verdict, null, 2))
} else {
  console.log(`${issue}: ${shape}, ${sliceProcesses.length} slice rollout(s), ${overlapping.length} overlapping pair(s), ${reservations.length} closed reservation(s)`)
  for (const shortfall of shortfalls) console.log(`  SHORTFALL ${shortfall}`)
  if (shortfalls.length === 0) console.log("  slice concurrency proved structurally, every slice reserved and recorded")
}
process.exit(shortfalls.length === 0 ? 0 : 1)
