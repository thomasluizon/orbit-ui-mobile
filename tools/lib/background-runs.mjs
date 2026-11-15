import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { dirname, isAbsolute, join } from "node:path"
import { REPO_ROOT, claudeConfigDirectory, gitDirectoryOf, isWakeSourceAlive, liveSessionProcess, readRunState, updateRunState } from "./run-state.mjs"

const TERMINAL_WORKFLOW_STATES = new Set(["completed", "failed", "killed"])
/** A background run with no transcript progress for this long is stuck: a prompt that no person answers looks exactly like this. */
export const STUCK_RUN_MILLISECONDS = 30 * 60_000
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

/** Claude Code keeps the agent transcripts of a session in `<session id>/subagents/`, beside the session transcript. */
const subagentsDirectory = (input) => typeof input.transcript_path === "string" ? join(dirname(input.transcript_path), input.session_id, "subagents") : undefined
/** A subagent transcript is `agent-<agent id>.jsonl` in that directory. */
const subagentTranscript = (input, id) => subagentsDirectory(input) && join(subagentsDirectory(input), `agent-${id}.jsonl`)
/**
 * A workflow writes its agent transcripts to `workflows/<run id>/` in that directory. A Stop payload names the task
 * and not the run, so a workflow first seen at a Stop takes the transcripts of every workflow of the session.
 */
const sessionWorkflowTranscripts = (input) => subagentsDirectory(input) && join(subagentsDirectory(input), "workflows")

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
      const transcript = task.type === "subagent" ? subagentTranscript(input, task.id) : sessionWorkflowTranscripts(input)
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
const changeTimes = (paths) => paths.map(changedAt).filter((time) => time !== null)

/** Every file below `path`, or `path` itself when it is a file. */
const filesBelow = (path) => {
  let names
  try { names = readdirSync(path, { withFileTypes: true }) }
  catch (error) { if (error.code === "ENOTDIR") return [path]; if (error.code === "ENOENT") return []; throw error }
  return names.flatMap((entry) => entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)])
}

/** The transcript files of a run: the file of a subagent, or each file below the directory of a workflow. */
const transcriptFiles = (run) => typeof run.transcript === "string" ? filesBelow(run.transcript) : []

/** The lines of a transcript. Another process writes the file, so its last line can be incomplete. */
const transcriptLines = (path) => {
  try { return readFileSync(path, "utf8").split("\n") }
  catch (error) { if (error.code === "ENOENT") return []; throw error }
}

/** The lines that hold `marker`, parsed. A line that does not parse is the incomplete last line. */
const entriesWith = (lines, marker) => lines.filter((line) => line.includes(marker)).flatMap((line) => {
  try { return [JSON.parse(line)] } catch { return [] }
})

/**
 * The time of the last transcript write of a run, and never earlier than its first observation. A run with no
 * transcript on disk counts from that observation, so no run waits without a limit. Null only for a record with
 * neither: the next Stop gives such a record its observation time.
 */
export const lastProgressOf = (run) => {
  const observed = Date.parse(run.observedAt)
  const times = [...changeTimes(transcriptFiles(run)), ...(Number.isFinite(observed) ? [observed] : [])]
  return times.length ? Math.max(...times) : null
}

/**
 * The transcripts of the agents that a subagent launched, at any depth. Claude Code writes `parentAgentId` into the
 * `agent-<agent id>.meta.json` file beside the transcript of each agent that another agent launched.
 */
const descendantTranscripts = (run) => {
  const directory = dirname(run.transcript)
  const children = new Map()
  for (const name of entries(directory)) {
    const id = /^agent-(.+)\.meta\.json$/.exec(name)?.[1]
    if (!id) continue
    let parent
    try { parent = readJson(join(directory, name))?.parentAgentId } catch (error) { if (!(error instanceof SyntaxError)) throw error }
    if (typeof parent === "string") children.set(parent, [...(children.get(parent) ?? []), id])
  }
  const found = []
  for (const pending = [run.id]; pending.length;) {
    const parent = pending.pop()
    for (const id of children.get(parent) ?? []) { found.push(join(directory, `agent-${id}.jsonl`)); pending.push(id) }
    children.delete(parent)
  }
  return found
}

/** The text of a launch reply names the output file of a background shell, the same as the Bash tool tells the agent. */
const SHELL_OUTPUT = /Output is being written to: (\S+\.output)(?=\.?(?:\s|$))/g
const textsOf = (content) => typeof content === "string" ? [content]
  : Array.isArray(content) ? content.flatMap((block) => typeof block === "string" ? [block] : textsOf(block?.content ?? block?.text)) : []

/**
 * The files that show the progress of the background work an agent launched: each file below the transcript directory of a
 * workflow, and the output file of a shell. Its transcript holds each launch reply as `toolUseResult`.
 */
const launchedWorkFiles = (transcript) => {
  const lines = transcriptLines(transcript)
  const workflows = entriesWith(lines, '"transcriptDir"').map((entry) => entry.toolUseResult?.transcriptDir)
    .filter((directory) => typeof directory === "string" && directory).flatMap(filesBelow)
  const shells = entriesWith(lines, '"backgroundTaskId"').filter((entry) => typeof entry.toolUseResult?.backgroundTaskId === "string")
    .flatMap((entry) => textsOf(entry.message?.content).flatMap((text) => [...text.matchAll(SHELL_OUTPUT)].map((match) => match[1])))
  return [...workflows, ...shells]
}

/**
 * The last progress of a subagent and of the work it waits on. A subagent that waits on an agent, a workflow or a
 * shell of its own writes nothing to its own transcript, so that work counts as its progress.
 */
const lastProgressWithDescendants = (run, own) => {
  if (run.type !== "subagent" || typeof run.transcript !== "string") return own
  const agents = descendantTranscripts(run)
  return Math.max(own, ...changeTimes([...agents, ...[run.transcript, ...agents].flatMap(launchedWorkFiles)]))
}

/** The last progress of a stuck run, or null while the run still holds the wait. The descendants are read only for a silent run. */
const stuckSince = (run, now) => {
  const own = lastProgressOf(run)
  if (own === null || now - own < STUCK_RUN_MILLISECONDS) return null
  const progress = lastProgressWithDescendants(run, own)
  return now - progress < STUCK_RUN_MILLISECONDS ? null : progress
}

/** The checkout that holds `path`: the nearest directory with a `.git` entry, which a linked worktree also has. */
const checkoutOf = (path) => {
  for (let current = path; isAbsolute(current); current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return current
    if (dirname(current) === current) return null
  }
  return null
}

const SHELL_TOOLS = new Set(["Bash", "Monitor"])
const FILE_TOOLS = new Set(["Edit", "Write"])
const SHELL_DIRECTORY = /(?:^|[\s;&|(])cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)|\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g

/** The directories that one tool call names as its place of work: each `cd` and `git -C` target, and the directory of an edited file. */
const directoriesOf = (toolUse) => {
  if (SHELL_TOOLS.has(toolUse.name) && typeof toolUse.input?.command === "string") {
    return [...toolUse.input.command.matchAll(SHELL_DIRECTORY)].map((match) => (match[1] ?? match[2]).replace(/^(["'])(.*)\1$/, "$2"))
  }
  return FILE_TOOLS.has(toolUse.name) && typeof toolUse.input?.file_path === "string" ? [dirname(toolUse.input.file_path)] : []
}

/** The `cwd` of the newest transcript entry that carries one. */
const entryDirectory = (lines) => {
  for (let index = lines.length - 1; index >= 0; index--) {
    const [entry] = entriesWith([lines[index]], '"cwd"')
    if (typeof entry?.cwd === "string" && entry.cwd) return entry.cwd
  }
  return null
}

/**
 * The checkout where a run worked. The `cwd` of a transcript entry is the directory of the session, and an agent
 * reaches its worktree through `cd`, `git -C` and absolute file paths. So the checkout that the most tool calls
 * name is the answer, and the newest one on a tie. The `cwd` is the answer only for a run that names no checkout.
 */
const workingDirectoryOf = (run) => {
  const references = new Map()
  const checkouts = new Map()
  const transcripts = transcriptFiles(run).filter((path) => path.endsWith(".jsonl")).sort((left, right) => (changedAt(left) ?? 0) - (changedAt(right) ?? 0)).map(transcriptLines)
  for (const lines of transcripts) {
    // An `api-request-blob` entry repeats the tool calls of an `assistant` entry, so only the second kind counts.
    const toolUses = entriesWith(lines, '"tool_use"').filter((entry) => entry.type === "assistant" && Array.isArray(entry.message?.content))
      .flatMap((entry) => entry.message.content.filter((block) => block?.type === "tool_use"))
    for (const directory of toolUses.flatMap(directoriesOf)) {
      if (!checkouts.has(directory)) checkouts.set(directory, checkoutOf(directory))
      const checkout = checkouts.get(directory)
      if (!checkout) continue
      const count = (references.get(checkout) ?? 0) + 1
      references.delete(checkout)
      references.set(checkout, count)
    }
  }
  const named = [...references].reverse().sort((left, right) => right[1] - left[1])[0]?.[0]
  return named ?? transcripts.reverse().map(entryDirectory).find((directory) => directory !== null) ?? null
}

/** No optional lock: the read must not hold the index while the agent of that worktree runs git. */
const git = (worktree, args) => spawnSync("git", ["-C", worktree, "--no-optional-locks", ...args], { encoding: "utf8", timeout: 3000, windowsHide: true })
const gitFailure = (result) => result.error?.message ?? (result.stderr.trim().split("\n")[0] || `git exit ${result.status}`)

/**
 * What a lost worktree would lose: its uncommitted paths, and the commits that its upstream does not hold, or that no
 * remote branch holds when it has no upstream. One `git status` also gives the branch and the last commit.
 */
const readWorkState = (worktree) => {
  const unread = (reason) => ({ branch: null, lastCommit: null, upstream: null, uncommittedChanges: null, unpushedCommits: null, workStateError: reason })
  if (!worktree) return unread("no worktree is known")
  const status = git(worktree, ["status", "--porcelain=v2", "--branch"])
  if (status.status !== 0) return unread(`git could not read ${worktree}: ${gitFailure(status)}`)
  const lines = status.stdout.split("\n").filter(Boolean)
  const header = Object.fromEntries(lines.filter((line) => line.startsWith("# branch.")).map((line) => [line.slice(2).split(" ")[0], line.slice(2).split(" ").slice(1).join(" ")]))
  const lastCommit = /^[0-9a-f]+$/.test(header["branch.oid"] ?? "") ? header["branch.oid"] : null
  const ahead = /^\+(\d+) -\d+$/.exec(header["branch.ab"] ?? "")
  // An upstream that no longer resolves prints no `branch.ab` line, so the remote branches decide.
  const unpushed = ahead || !lastCommit ? null : git(worktree, ["rev-list", "--count", "HEAD", "--not", "--remotes"])
  if (unpushed && unpushed.status !== 0) return unread(`git could not read ${worktree}: ${gitFailure(unpushed)}`)
  return {
    branch: header["branch.head"] ?? null, lastCommit, upstream: header["branch.upstream"] ?? null,
    uncommittedChanges: lines.filter((line) => !line.startsWith("#")).length,
    unpushedCommits: ahead ? Number(ahead[1]) : unpushed ? Number(unpushed.stdout.trim()) : 0,
  }
}

/** What the successor needs to recover a stuck run: where it worked, on which branch, its last commit, and the work that is only there. */
const describeStuckRun = (run, lastProgress, now) => {
  const worktree = workingDirectoryOf(run)
  return {
    id: run.id, type: run.type, sessionId: run.sessionId, worktree, ...readWorkState(worktree),
    lastProgressAt: new Date(lastProgress).toISOString(), stuckAt: new Date(now).toISOString(),
  }
}

/**
 * An entry of an earlier session names work to recover. That work is gone when its worktree no longer exists, and it
 * is carried when the worktree holds no uncommitted change and no unpushed commit. An unknown or unreadable worktree
 * proves neither, so its entry stays.
 */
const workIsSettled = (entry) => {
  if (typeof entry.worktree !== "string" || !entry.worktree) return false
  if (!existsSync(entry.worktree)) return true
  const work = readWorkState(entry.worktree)
  return work.uncommittedChanges === 0 && work.unpushedCommits === 0
}
const entryKey = (entry) => JSON.stringify([entry.sessionId, entry.id])

/**
 * The background runs that a turn end or a relay drain still waits on, and the stuck ones it stops waiting on.
 * `stuckBackgroundRuns` in the run state names each run of this session that is stuck now: a run that makes
 * progress again, or that ends, leaves it. The relay successor inherits the entries of an earlier session as work
 * to recover, and an inherited entry leaves when that work is gone or carried.
 */
export const readDrainBlockers = (sessionId, repoRoot = REPO_ROOT, now = Date.now()) => {
  const runs = readBackgroundRuns(sessionId, repoRoot)
  const stuck = new Map(runs.flatMap((run) => {
    const since = stuckSince(run, now)
    return since === null ? [] : [[run.id, since]]
  }))
  const state = readRunState(repoRoot)
  const recorded = state?.sessionId === sessionId ? state.stuckBackgroundRuns ?? [] : []
  const current = (entry) => entry.sessionId === sessionId && stuck.has(entry.id)
  // The git reads stay outside the run state lock, so a slow repository cannot hold another writer.
  const added = runs.filter((run) => stuck.has(run.id) && !recorded.some((entry) => current(entry) && entry.id === run.id)).map((run) => describeStuckRun(run, stuck.get(run.id), now))
  const settled = new Set(recorded.filter((entry) => entry.sessionId !== sessionId && workIsSettled(entry)).map(entryKey))
  const stale = recorded.some((entry) => entry.sessionId === sessionId && !stuck.has(entry.id))
  if (added.length || stale || settled.size) {
    updateRunState((latest) => {
      if (latest?.sessionId !== sessionId) return undefined
      const { stuckBackgroundRuns = [], ...rest } = latest
      const kept = stuckBackgroundRuns.filter((entry) => entry.sessionId !== sessionId ? !settled.has(entryKey(entry)) : stuck.has(entry.id) && !added.some((run) => run.id === entry.id))
      return kept.length + added.length ? { ...rest, stuckBackgroundRuns: [...kept, ...added] } : rest
    }, repoRoot, { sessionId })
  }
  return { waiting: runs.filter((run) => !stuck.has(run.id)), stuck: [...recorded.filter(current), ...added] }
}
