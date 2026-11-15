import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { STUCK_RUN_MILLISECONDS, observeBackgroundRuns, readBackgroundRuns, readDrainBlockers } from "../lib/background-runs.mjs"
import { processStartIdentity, readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, stageRepo } from "./_harness.mjs"

const launches = JSON.parse(readFileSync(new URL("./fixtures/claude-background-launches.json", import.meta.url), "utf8"))

export const cases = async () => {
  const repoRoot = stageRepo("background-runs").path
  const claudeDirectory = join(repoRoot, ".git", "claude")
  mkdirSync(join(claudeDirectory, "sessions"), { recursive: true })
  writeFileSync(join(claudeDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "parent" }))
  const options = { repoRoot, claudeDirectory }
  const input = { session_id: "parent", transcript_path: join(claudeDirectory, "parent.jsonl"), hook_event_name: "PostToolUse" }
  for (const [type, tool] of [["workflow", "Workflow"], ["subagent", "Agent"]]) {
    observeBackgroundRuns({ ...input, tool_name: tool, tool_response: launches[type] }, options)
  }
  T("background-runs: both observed launches survive until completion", readBackgroundRuns("parent", repoRoot).length === 2)
  T("background-runs: another session cannot borrow live work", readBackgroundRuns("other", repoRoot).length === 0)
  observeBackgroundRuns({ ...input, hook_event_name: "SubagentStop", background_tasks: [] }, options)
  T("background-runs: a subagent Stop is not parent completion evidence", readBackgroundRuns("parent", repoRoot).length === 2)
  const workflowDirectory = join(claudeDirectory, "parent", "workflows")
  mkdirSync(workflowDirectory, { recursive: true })
  for (const status of ["completed", "failed", "killed"]) {
    observeBackgroundRuns({ ...input, tool_name: "Workflow", tool_response: launches.workflow }, options)
    writeFileSync(join(workflowDirectory, "wf_fixture.json"), JSON.stringify({ status }))
    T(`background-runs: persisted ${status} workflow does not strand the drain`, readBackgroundRuns("parent", repoRoot).map((run) => run.type).join() === "subagent")
  }
  const recordPath = join(repoRoot, ".git", "orbit-background-runs", "parent", "agent-task.json")
  const record = JSON.parse(readFileSync(recordPath, "utf8"))
  writeFileSync(recordPath, JSON.stringify({ ...record, processStartIdentity: "previous process" }))
  T("background-runs: reused pid with a different start identity is stale", readBackgroundRuns("parent", repoRoot).length === 0)
  observeBackgroundRuns({ ...input, tool_name: "Agent", tool_response: launches.subagent }, options)
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: [] }, options)
  T("background-runs: empty owning Stop clears the remaining work", readBackgroundRuns("parent", repoRoot).length === 0)
  let invalidLaunch = false
  try { observeBackgroundRuns({ ...input, tool_name: "Agent", tool_response: { ...launches.subagent, agentId: "" } }, options) }
  catch (error) { invalidLaunch = /no task id/.test(error.message) }
  T("background-runs: a launch with no id is rejected", invalidLaunch)
  const unresolved = { ...input, session_id: "unresolved" }
  for (const [type, tool] of [["workflow", "Workflow"], ["subagent", "Agent"]]) {
    let ownerMissing = false
    try { observeBackgroundRuns({ ...unresolved, tool_name: tool, tool_response: launches[type] }, options) }
    catch (error) { ownerMissing = /cannot identify/.test(error.message) }
    T(`background-runs: ${type} identity probe failure is reported`, ownerMissing)
  }
  T("background-runs: failed identity probes retain both launches", readBackgroundRuns("unresolved", repoRoot).length === 2)
  const unresolvedWorkflows = join(claudeDirectory, "unresolved", "workflows")
  mkdirSync(unresolvedWorkflows, { recursive: true })
  writeFileSync(join(unresolvedWorkflows, "wf_fixture.json"), JSON.stringify({ status: "killed" }))
  T("background-runs: terminal snapshot settles a workflow without identity", readBackgroundRuns("unresolved", repoRoot).map((run) => run.type).join() === "subagent")
  observeBackgroundRuns({ ...unresolved, hook_event_name: "Stop", background_tasks: [] }, options)
  T("background-runs: empty owning Stop settles launches without identity", readBackgroundRuns("unresolved", repoRoot).length === 0)
  const liveTasks = [{ id: "agent-task", type: "subagent", status: "running", description: "Background work" }]
  try { observeBackgroundRuns({ ...unresolved, hook_event_name: "Stop", background_tasks: liveTasks }, options) }
  catch (error) { if (!/cannot identify/.test(error.message)) throw error }
  T("background-runs: owning Stop publishes live inventory before its identity probe", readBackgroundRuns("unresolved", repoRoot).length === 1)
  writeFileSync(join(claudeDirectory, "sessions", "unresolved.json"), JSON.stringify({ pid: process.pid, sessionId: "unresolved" }))
  observeBackgroundRuns({ ...unresolved, hook_event_name: "Stop", background_tasks: liveTasks }, options)
  const enriched = readBackgroundRuns("unresolved", repoRoot)[0]
  T("background-runs: subsequent owning Stop enriches the surviving launch", enriched?.processStartIdentity === processStartIdentity(process.pid))
  const enrichedPath = join(repoRoot, ".git", "orbit-background-runs", "unresolved", "agent-task.json")
  writeFileSync(enrichedPath, JSON.stringify({ ...enriched, processStartIdentity: "previous process" }))
  T("background-runs: enriched launches retain stale-owner recovery", readBackgroundRuns("unresolved", repoRoot).length === 0)
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  const childIdentity = processStartIdentity(child.pid)
  try {
    T("background-runs: stale-process fixture starts with a real live owner", childIdentity !== null)
    writeFileSync(recordPath, JSON.stringify({ ...record, pid: child.pid, processStartIdentity: childIdentity }))
    T("background-runs: real running owner holds the drain", readBackgroundRuns("parent", repoRoot).length === 1)
  } finally { child.kill(); await exited }
  T("background-runs: exited owning process clears a stale run", readBackgroundRuns("parent", repoRoot).length === 0)
  await stuckCases()
}

/** A subagent that waits on a prompt writes nothing more to its transcript, so the limit ends the wait on it. */
const stuckCases = async () => {
  const repo = stageRepo("background-stuck")
  const repoRoot = repo.path
  const claudeDirectory = join(repoRoot, ".git", "claude")
  mkdirSync(join(claudeDirectory, "sessions"), { recursive: true })
  writeFileSync(join(claudeDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "coordinator" }))
  writeRunState({ sessionId: "coordinator", sleep: true, remaining: [] }, repoRoot)
  const launchedAt = Date.parse("2026-01-05T10:00:00.000Z")
  const input = { session_id: "coordinator", transcript_path: join(claudeDirectory, "coordinator.jsonl"), hook_event_name: "PostToolUse" }
  const options = { repoRoot, claudeDirectory, now: launchedAt }
  observeBackgroundRuns({ ...input, tool_name: "Agent", tool_response: launches.subagent }, options)
  const transcript = join(claudeDirectory, "coordinator", "subagents", "agent-agent-task.jsonl")
  const record = readBackgroundRuns("coordinator", repoRoot)[0]
  T("background-runs: a launch records the transcript that Claude Code writes for the subagent", record.transcript === transcript && record.observedAt === new Date(launchedAt).toISOString(), JSON.stringify(record))
  const minutes = (count) => launchedAt + count * 60_000
  const drain = (now) => readDrainBlockers("coordinator", repoRoot, now)
  T("background-runs: the limit is 30 minutes", STUCK_RUN_MILLISECONDS === 30 * 60_000)
  T("background-runs: a subagent with no transcript on disk keeps the wait at any age", drain(minutes(600)).waiting.length === 1 && drain(minutes(600)).stuck.length === 0)
  mkdirSync(dirname(transcript), { recursive: true })
  const head = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(transcript, `${JSON.stringify({ type: "user", agentId: "agent-task", cwd: repoRoot, gitBranch: "main" })}\n{"type":"assistant","partial`)
  const touch = (path, time) => utimesSync(path, new Date(time), new Date(time))
  touch(transcript, minutes(20))
  T("background-runs: transcript progress restarts the limit", drain(minutes(49)).waiting.length === 1 && readRunState(repoRoot).stuckBackgroundRuns === undefined)
  const stuck = drain(minutes(50))
  T("background-runs: 30 minutes with no transcript progress leaves the wait", stuck.waiting.length === 0 && stuck.stuck.length === 1, JSON.stringify(stuck))
  const recorded = readRunState(repoRoot).stuckBackgroundRuns
  T("background-runs: the run state records the worktree, branch and last commit of a stuck run", recorded.length === 1 && recorded[0].id === "agent-task" && recorded[0].type === "subagent" &&
    recorded[0].worktree === repoRoot && recorded[0].branch === "main" && recorded[0].lastCommit === head && recorded[0].lastProgressAt === new Date(minutes(20)).toISOString() &&
    recorded[0].stuckAt === new Date(minutes(50)).toISOString(), JSON.stringify(recorded))
  T("background-runs: a later read returns the stuck record and writes it once", drain(minutes(60)).stuck[0].lastCommit === head && readRunState(repoRoot).stuckBackgroundRuns.length === 1)
  T("background-runs: a stuck run stays on record until its owner ends it", readBackgroundRuns("coordinator", repoRoot).length === 1)
  touch(transcript, minutes(61))
  T("background-runs: a run that makes progress again holds the wait again", drain(minutes(62)).waiting.length === 1 && drain(minutes(62)).stuck.length === 0)
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: [] }, options)
  // A subagent first seen at a Stop gets the same transcript path and its own first observation time.
  const seenAt = minutes(100)
  const liveTasks = [{ id: "late-task", type: "subagent", status: "running", description: "Background work" }, { id: "late-workflow", type: "workflow", status: "running", description: "Background work" }]
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: liveTasks }, { ...options, now: seenAt })
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: liveTasks }, { ...options, now: seenAt + 10 * 60_000 })
  const late = readBackgroundRuns("coordinator", repoRoot).find((run) => run.id === "late-task")
  T("background-runs: a Stop keeps the first observation time of a live run", late.observedAt === new Date(seenAt).toISOString() && late.transcript.endsWith(join("subagents", "agent-late-task.jsonl")), JSON.stringify(late))
  writeFileSync(late.transcript, `${JSON.stringify({ type: "assistant", agentId: "late-task" })}\n`)
  touch(late.transcript, minutes(60))
  T("background-runs: a transcript older than the first observation counts from the observation", readDrainBlockers("coordinator", repoRoot, seenAt + 29 * 60_000).stuck.length === 0)
  const lateDrain = readDrainBlockers("coordinator", repoRoot, seenAt + 30 * 60_000)
  T("background-runs: a silent subagent first seen at a Stop is stuck after the limit", lateDrain.stuck.map((run) => run.id).join() === "late-task")
  T("background-runs: a transcript that names no directory records an unknown worktree", lateDrain.stuck[0].worktree === null && lateDrain.stuck[0].branch === null && lateDrain.stuck[0].lastCommit === null)
  T("background-runs: a workflow with no transcript on record never counts as stuck", lateDrain.waiting.map((run) => run.id).join() === "late-workflow")
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: [] }, options)
  const workflowDirectory = join(claudeDirectory, "coordinator", "subagents", "workflows", "wf_fixture")
  mkdirSync(workflowDirectory, { recursive: true })
  observeBackgroundRuns({ ...input, tool_name: "Workflow", tool_response: { ...launches.workflow, transcriptDir: workflowDirectory } }, options)
  for (const [name, time] of [["agent-one.jsonl", minutes(5)], ["agent-two.jsonl", minutes(40)]]) {
    writeFileSync(join(workflowDirectory, name), `${JSON.stringify({ type: "user", cwd: repoRoot })}\n`)
    touch(join(workflowDirectory, name), time)
  }
  T("background-runs: a workflow waits while one of its agents makes progress", drain(minutes(69)).waiting.length === 1)
  const workflowStuck = drain(minutes(70))
  T("background-runs: a workflow with no agent progress for the limit is stuck", workflowStuck.waiting.length === 0 && workflowStuck.stuck.some((run) => run.id === "workflow-task" && run.worktree === repoRoot && run.lastCommit === head), JSON.stringify(workflowStuck))
  T("background-runs: another session's read records nothing", readDrainBlockers("other", repoRoot, minutes(500)).stuck.length === 0)
}
