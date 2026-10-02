import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { REPO_ROOT, gitDirectoryOf, isWakeSourceAlive, processStartIdentity } from "./run-state.mjs"

const TERMINAL_WORKFLOW_STATES = new Set(["completed", "failed", "killed"])
const directoryOf = (repoRoot, sessionId) => join(gitDirectoryOf(repoRoot), "orbit-background-runs", encodeURIComponent(sessionId))
const recordPath = (directory, id) => join(directory, `${encodeURIComponent(id)}.json`)
const entries = (directory) => {
  try { return readdirSync(directory).filter((name) => name.endsWith(".json")) }
  catch (error) { if (error.code === "ENOENT") return []; throw error }
}
const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, "utf8")) }
  catch (error) { if (error.code === "ENOENT") return null; throw error }
}

const sessionOwner = (sessionId, claudeDirectory) => {
  for (const name of entries(join(claudeDirectory, "sessions"))) {
    const owner = readJson(join(claudeDirectory, "sessions", name))
    if (owner?.sessionId !== sessionId || !Number.isInteger(owner.pid) || owner.pid <= 0) continue
    const identity = processStartIdentity(owner.pid)
    if (identity) return { pid: owner.pid, processStartIdentity: identity }
  }
  throw new Error("cannot identify the background run's owning session process")
}

const publish = (directory, record) => {
  mkdirSync(directory, { recursive: true })
  const temporaryPath = join(directory, `${randomUUID()}.tmp`)
  writeFileSync(temporaryPath, JSON.stringify(record), { mode: 0o600 })
  renameSync(temporaryPath, recordPath(directory, record.id))
}

/** Launch replies identify work; the owning Stop's complete live set also proves completion. */
export const observeBackgroundRuns = (input, { repoRoot = REPO_ROOT, claudeDirectory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude") } = {}) => {
  const sessionId = input.session_id
  const directory = directoryOf(repoRoot, sessionId)
  if (input.hook_event_name === "Stop" && Array.isArray(input.background_tasks)) {
    const live = input.background_tasks.filter((task) => ["workflow", "subagent"].includes(task.type) && ["running", "pending"].includes(task.status))
    const owner = live.length ? sessionOwner(sessionId, claudeDirectory) : null
    for (const task of live) {
      if (typeof task.id !== "string" || !task.id) throw new Error("background task has no id")
      const previous = readJson(recordPath(directory, task.id))
      publish(directory, { ...previous, id: task.id, type: task.type, sessionId, ...owner })
    }
    const ids = new Set(live.map((task) => task.id))
    for (const name of entries(directory)) {
      const record = readJson(join(directory, name))
      if (record && !ids.has(record.id)) rmSync(join(directory, name), { force: true })
    }
  }
  const response = input.tool_response
  if (input.hook_event_name !== "PostToolUse" || response?.status !== "async_launched") return
  const workflow = input.tool_name === "Workflow"
  if (!workflow && input.tool_name !== "Agent") return
  const id = workflow ? response.taskId : response.agentId
  if (typeof id !== "string" || !id) throw new Error("background launch has no task id")
  const workflowSnapshot = workflow && typeof response.runId === "string" && typeof input.transcript_path === "string"
    ? join(dirname(input.transcript_path), sessionId, "workflows", `${encodeURIComponent(response.runId)}.json`) : undefined
  publish(directory, { id, type: workflow ? "workflow" : "subagent", sessionId, workflowSnapshot, ...sessionOwner(sessionId, claudeDirectory) })
}

/** No age timeout: a long run remains live until completion or loss of its process identity. */
export const readBackgroundRuns = (sessionId, repoRoot = REPO_ROOT) => {
  if (!sessionId) return []
  const directory = directoryOf(repoRoot, sessionId)
  const live = []
  for (const name of entries(directory)) {
    const path = join(directory, name)
    const record = readJson(path)
    if (!record) continue
    const settled = record.workflowSnapshot && TERMINAL_WORKFLOW_STATES.has(readJson(record.workflowSnapshot)?.status)
    if (settled || !isWakeSourceAlive(record)) rmSync(path, { force: true })
    else live.push(record)
  }
  return live
}
