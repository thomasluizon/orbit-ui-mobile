import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import { REPO_ROOT, claudeConfigDirectory, gitDirectoryOf, isWakeSourceAlive, liveSessionProcess, readRunState, updateRunState } from "./run-state.mjs"

const TERMINAL_WORKFLOW_STATES = new Set(["completed", "failed", "killed"])
/** A background run with no transcript progress for this long is stuck: a prompt that no person answers looks exactly like this. */
export const STUCK_RUN_MILLISECONDS = 30 * 60_000
const TRANSCRIPT_TAIL_BYTES = 65_536
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
  const owner = liveSessionProcess(sessionId, claudeDirectory)
  if (!owner) throw new Error("cannot identify the background run's owning session process")
  return { pid: owner.pid, processStartIdentity: owner.processStartIdentity }
}

const publish = (directory, record) => {
  mkdirSync(directory, { recursive: true })
  const temporaryPath = join(directory, `${randomUUID()}.tmp`)
  writeFileSync(temporaryPath, JSON.stringify(record), { mode: 0o600 })
  renameSync(temporaryPath, recordPath(directory, record.id))
}

/** Claude Code writes a subagent's transcript beside its session's transcript, as `<session id>/subagents/agent-<agent id>.jsonl`. */
const subagentTranscript = (input, id) => typeof input.transcript_path === "string"
  ? join(dirname(input.transcript_path), input.session_id, "subagents", `agent-${id}.jsonl`) : undefined

/** The live background workflows and subagents that a Stop payload names. */
export const liveBackgroundTasks = (input) => input.background_tasks.filter((task) => ["workflow", "subagent"].includes(task.type) && ["running", "pending"].includes(task.status))

/** Launch replies identify work; the owning Stop's complete live set also proves completion. */
export const observeBackgroundRuns = (input, { repoRoot = REPO_ROOT, claudeDirectory = claudeConfigDirectory(), now = Date.now() } = {}) => {
  const sessionId = input.session_id
  const directory = directoryOf(repoRoot, sessionId)
  const observedAt = new Date(now).toISOString()
  if (input.hook_event_name === "Stop" && Array.isArray(input.background_tasks)) {
    const live = liveBackgroundTasks(input)
    for (const task of live) {
      if (typeof task.id !== "string" || !task.id) throw new Error("background task has no id")
      const previous = readJson(recordPath(directory, task.id))
      const transcript = task.type === "subagent" ? subagentTranscript(input, task.id) : undefined
      publish(directory, { observedAt, transcript, ...previous, id: task.id, type: task.type, sessionId })
    }
    const ids = new Set(live.map((task) => task.id))
    for (const name of entries(directory)) {
      const record = readJson(join(directory, name))
      if (record && !ids.has(record.id)) rmSync(join(directory, name), { force: true })
    }
    if (live.length) {
      const owner = sessionOwner(sessionId, claudeDirectory)
      for (const task of live) publish(directory, { ...readJson(recordPath(directory, task.id)), ...owner })
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
  const transcript = workflow ? (typeof response.transcriptDir === "string" && response.transcriptDir ? response.transcriptDir : undefined) : subagentTranscript(input, id)
  const record = { id, type: workflow ? "workflow" : "subagent", sessionId, workflowSnapshot, observedAt, transcript }
  // Publish before the identity probe so its hook timeout cannot erase an observed launch.
  publish(directory, record)
  publish(directory, { ...record, ...sessionOwner(sessionId, claudeDirectory) })
}

/** Unresolved launches wait for the owning Stop or a terminal snapshot; identified owners also prove staleness. */
export const readBackgroundRuns = (sessionId, repoRoot = REPO_ROOT) => {
  if (!sessionId) return []
  const directory = directoryOf(repoRoot, sessionId)
  const live = []
  for (const name of entries(directory)) {
    const path = join(directory, name)
    const record = readJson(path)
    if (!record) continue
    const settled = record.workflowSnapshot && TERMINAL_WORKFLOW_STATES.has(readJson(record.workflowSnapshot)?.status)
    if (settled || (record.processStartIdentity !== undefined && !isWakeSourceAlive(record))) rmSync(path, { force: true })
    else live.push(record)
  }
  return live
}

const changedAt = (path) => {
  try { return statSync(path).mtimeMs }
  catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return null; throw error }
}

/** The transcript files of a run: the file of a subagent, or each file in the directory of a workflow. */
const transcriptFiles = (run) => {
  if (typeof run.transcript !== "string") return []
  try { return readdirSync(run.transcript).map((name) => join(run.transcript, name)) }
  catch (error) { if (error.code === "ENOTDIR") return [run.transcript]; if (error.code === "ENOENT") return []; throw error }
}

/** The time of the last transcript write, and never earlier than the first observation; null while no transcript exists. */
export const lastProgressOf = (run) => {
  const written = transcriptFiles(run).map(changedAt).filter((time) => time !== null)
  if (written.length === 0) return null
  const observed = Date.parse(run.observedAt)
  return Math.max(...written, Number.isFinite(observed) ? observed : 0)
}

/** A run with no transcript on disk cannot show a missing write, so it keeps the wait: a wrong verdict would abandon live work. */
const isStuck = (run, now) => {
  const progress = lastProgressOf(run)
  return progress !== null && now - progress >= STUCK_RUN_MILLISECONDS
}

/** The `cwd` of the newest transcript line that names one. Claude Code writes `cwd` on each transcript entry. */
const transcriptDirectory = (run) => {
  const newest = transcriptFiles(run).map((path) => ({ path, changed: changedAt(path) })).filter((file) => file.changed !== null).sort((left, right) => right.changed - left.changed)[0]
  if (!newest) return null
  const file = openSync(newest.path, "r")
  try {
    const size = fstatSync(file).size
    const tail = Buffer.alloc(Math.min(size, TRANSCRIPT_TAIL_BYTES))
    readSync(file, tail, 0, tail.length, size - tail.length)
    for (const line of tail.toString("utf8").split("\n").reverse()) {
      try {
        const entry = JSON.parse(line)
        if (typeof entry?.cwd === "string" && entry.cwd) return entry.cwd
      } catch { /* the tail can start inside a line, and the last line can be incomplete */ }
    }
    return null
  } finally { closeSync(file) }
}

const gitValue = (worktree, args) => {
  const result = spawnSync("git", ["-C", worktree, ...args], { encoding: "utf8", timeout: 3000, windowsHide: true })
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null
}

/** What the successor needs to recover a stuck run: where it worked, on which branch, and its last commit. */
const describeStuckRun = (run, now) => {
  const worktree = transcriptDirectory(run)
  return {
    id: run.id, type: run.type, worktree,
    branch: worktree ? gitValue(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]) : null,
    lastCommit: worktree ? gitValue(worktree, ["rev-parse", "HEAD"]) : null,
    lastProgressAt: new Date(lastProgressOf(run)).toISOString(), stuckAt: new Date(now).toISOString(),
  }
}

/**
 * The background runs that a turn end or a relay drain still waits on, and the stuck ones it stops waiting on.
 * Each stuck run is written once to `stuckBackgroundRuns` in the run state, which the relay successor inherits.
 */
export const readDrainBlockers = (sessionId, repoRoot = REPO_ROOT, now = Date.now()) => {
  const runs = readBackgroundRuns(sessionId, repoRoot)
  const stuck = runs.filter((run) => isStuck(run, now))
  if (stuck.length === 0) return { waiting: runs, stuck: [] }
  const ids = new Set(stuck.map((run) => run.id))
  const recorded = (readRunState(repoRoot)?.stuckBackgroundRuns ?? []).filter((entry) => ids.has(entry.id))
  // The git reads stay outside the run state lock, so a slow repository cannot hold another writer.
  const added = stuck.filter((run) => !recorded.some((entry) => entry.id === run.id)).map((run) => describeStuckRun(run, now))
  if (added.length) {
    updateRunState((state) => state?.sessionId !== sessionId ? undefined
      : { ...state, stuckBackgroundRuns: [...(state.stuckBackgroundRuns ?? []).filter((entry) => !added.some((run) => run.id === entry.id)), ...added] }, repoRoot, { sessionId })
  }
  return { waiting: runs.filter((run) => !ids.has(run.id)), stuck: [...recorded, ...added] }
}
