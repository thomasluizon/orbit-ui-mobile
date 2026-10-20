import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { observeBackgroundRuns, readBackgroundRuns } from "../lib/background-runs.mjs"
import { processStartIdentity } from "../lib/run-state.mjs"
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
}
