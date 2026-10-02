import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { observeBackgroundRuns, readBackgroundRuns } from "../lib/background-runs.mjs"
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
  for (const status of ["completed", "failed", "killed", "paused"]) {
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
}
