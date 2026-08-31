import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path"

import { runBounded } from "./bounded-process.mjs"

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
// The Codex CLI documents 20 as the maximum cloud list page size.
const CLOUD_LIST_PAGE_SIZE = 20
const NPM_SHIM_SCRIPT = /"%dp0%\\+([^"]+\.js)"/i
const TASK_ID = /^task_e_[0-9a-f]+$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const OBSERVED_STATUSES = new Set(["pending", "ready"])

export const CLOUD_FINISHING_CONTRACT = `## Cloud finishing contract

- Edit and test the change in the container.
- Then \`git add\` the named paths and \`git commit\`. Without a commit there is no diff and the work is lost.
- Never \`--no-verify\`. If a pre-commit hook rejects the commit, report the exact hook output and stop, leaving the changes in place. Never edit a hook or a gate baseline to get past it.
- Never push, never create a branch, never open a pull request. Delivery happens outside the container.`

export const cloudOrder = (order) => {
  const trimmed = order.trimEnd()
  return trimmed.endsWith(CLOUD_FINISHING_CONTRACT)
    ? `${trimmed}\n`
    : `${trimmed}\n\n${CLOUD_FINISHING_CONTRACT}\n`
}

export const resolveOnPath = (command, options = {}) => {
  if (command.includes("/") || command.includes("\\")) {
    return existsSync(command) ? resolve(command) : null
  }
  const platform = options.platform ?? process.platform
  const pathValue = options.path ?? process.env.PATH ?? ""
  const pathExtensions = platform === "win32"
    ? (options.pathExt ?? process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""]
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of pathExtensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
  }
  return null
}

export const resolveCodexCommand = (command, options = {}) => {
  const resolved = resolveOnPath(command, options)
  if (!resolved) throw new Error(`could not resolve the codex executable "${command}" on PATH`)
  if (!/\.(?:cmd|bat)$/i.test(resolved)) return { executable: resolved, argsPrefix: [] }

  let shim
  try {
    shim = readFileSync(resolved, "utf8")
  } catch (error) {
    throw new Error(`could not read the codex shim ${resolved}: ${error.message}`)
  }
  const match = shim.match(NPM_SHIM_SCRIPT)
  if (!match) {
    throw new Error(
      `${resolved} is a ${extname(resolved)} shim that cannot be run without a shell: ` +
      `no "%dp0%...js" script line was found`,
    )
  }
  const script = resolve(dirname(resolved), match[1])
  if (!existsSync(script)) throw new Error(`${resolved} names the script ${script}, which does not exist`)
  return { executable: process.execPath, argsPrefix: [script] }
}

export class CodexTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = "CodexTimeoutError"
  }
}

export const runCodex = async (command, args, options = {}) => {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("runCodex requires a positive timeoutMs")
  }
  const invocation = resolveCodexCommand(command, options.resolution)
  const result = await runBounded(invocation.executable, [...invocation.argsPrefix, ...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    maxBuffer: MAX_OUTPUT_BYTES,
    timeoutMs: options.timeoutMs,
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    error: result.error ?? (result.overflowed ? new Error(`codex output exceeded ${MAX_OUTPUT_BYTES} bytes`) : null),
  }
}

export const parseTaskUrl = (stdout) => {
  const value = stdout.trim()
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`codex cloud exec returned a value that is not a task URL: ${JSON.stringify(value)}`)
  }
  const taskId = url.pathname.split("/").filter(Boolean).at(-1) ?? ""
  if (!TASK_ID.test(taskId)) {
    throw new Error(`codex cloud exec returned a URL with an invalid task id: ${JSON.stringify(value)}`)
  }
  return { taskId, taskUrl: value }
}

const validateTask = (task) => {
  if (task === null || typeof task !== "object" || Array.isArray(task)) {
    throw new Error("codex cloud list returned a non-object task")
  }
  if (typeof task.id !== "string" || !TASK_ID.test(task.id)) {
    throw new Error("codex cloud list returned a task with an invalid id")
  }
  if (typeof task.status !== "string") {
    throw new Error(`codex cloud list task ${task.id} carries no string status`)
  }
  if (
    typeof task.updated_at !== "string" ||
    !ISO_TIMESTAMP.test(task.updated_at) ||
    !Number.isFinite(Date.parse(task.updated_at))
  ) {
    throw new Error(`codex cloud list task ${task.id} carries no parseable ISO updated_at timestamp`)
  }
  if (
    task.summary === null ||
    typeof task.summary !== "object" ||
    Array.isArray(task.summary) ||
    !Number.isInteger(task.summary.files_changed) ||
    task.summary.files_changed < 0
  ) {
    throw new Error(`codex cloud list task ${task.id} carries no non-negative summary.files_changed`)
  }
  return task
}

export const parseTaskList = (stdout) => {
  let page
  try {
    page = JSON.parse(stdout)
  } catch (error) {
    throw new Error(`codex cloud list returned invalid JSON: ${error.message}`)
  }
  if (page === null || typeof page !== "object" || Array.isArray(page) || !Array.isArray(page.tasks)) {
    throw new Error("codex cloud list returned no tasks array")
  }
  if (page.cursor !== null && typeof page.cursor !== "string") {
    throw new Error("codex cloud list returned a cursor that is neither a string nor null")
  }
  return { tasks: page.tasks.map(validateTask), cursor: page.cursor }
}

export const listCloudTasks = async (command, environmentId, options = {}) => {
  const tasks = []
  const taskIds = new Set()
  const cursors = new Set()
  let cursor = null
  do {
    const args = ["cloud", "list", "--env", environmentId, "--json", "--limit", String(CLOUD_LIST_PAGE_SIZE)]
    if (cursor !== null) args.push("--cursor", cursor)
    const result = await runCodex(command, args, options)
    if (result.timedOut) throw new CodexTimeoutError("codex cloud list", options.timeoutMs)
    if (result.error || result.status !== 0) {
      const detail = (result.stderr || result.stdout || result.error?.message || "unknown error").trim()
      throw new Error(`codex cloud list failed with exit ${result.status ?? "spawn"}: ${detail}`)
    }
    const page = parseTaskList(result.stdout)
    for (const task of page.tasks) {
      if (taskIds.has(task.id)) throw new Error(`codex cloud list returned duplicate task ${task.id}`)
      taskIds.add(task.id)
      tasks.push(task)
    }
    cursor = page.cursor
    if (cursor !== null) {
      if (cursors.has(cursor)) throw new Error(`codex cloud list repeated cursor ${cursor}`)
      cursors.add(cursor)
    }
  } while (cursor !== null)
  return tasks
}

export const readJsonFile = (path, label) => {
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    throw new Error(`${label} could not be read at ${path}: ${error.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} at ${path} is invalid JSON: ${error.message}`)
  }
}

export const writeJsonAtomic = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  renameSync(temporary, path)
}

export const cloudStateRoot = (worktree) => {
  const result = spawnSync("git", ["-C", worktree, "rev-parse", "--git-common-dir"], {
    encoding: "utf8",
    windowsHide: true,
  })
  if (result.error || result.status !== 0) throw new Error(`${worktree} is not a git worktree`)
  const commonDirectory = result.stdout.trim()
  if (!commonDirectory) throw new Error(`git returned no common directory for ${worktree}`)
  const absolute = isAbsolute(commonDirectory) ? commonDirectory : resolve(worktree, commonDirectory)
  return join(absolute, "orbit-cloud")
}

export const mirrorPathFor = (stateRoot, taskId) => {
  if (!TASK_ID.test(taskId)) throw new Error(`invalid cloud task id: ${taskId}`)
  return join(stateRoot, "receipts", `${taskId}.json`)
}

export const reservationPathFor = (stateRoot, reservationId) => {
  if (typeof reservationId !== "string" || !/^[0-9a-f-]{36}$/.test(reservationId)) {
    throw new Error(`invalid cloud submission reservation id: ${reservationId}`)
  }
  return join(stateRoot, "receipts", `reservation-${reservationId}.json`)
}

export const persistReceipt = (receipt, paths) => {
  const unique = new Set(paths.map((path) => resolve(path)))
  for (const path of unique) writeJsonAtomic(path, receipt)
}

const deadlinePassed = (receipt, now) => {
  const deadline = Date.parse(receipt.deadline)
  if (!Number.isFinite(deadline)) throw new Error(`receipt ${receipt.taskId} carries an invalid deadline`)
  return now.getTime() > deadline
}

const observedReadyByDeadline = (receipt) => {
  const deadline = Date.parse(receipt.deadline)
  if (!Number.isFinite(deadline)) throw new Error(`receipt ${receipt.taskId} carries an invalid deadline`)
  return typeof receipt.firstReadyObservedAt === "string" && Date.parse(receipt.firstReadyObservedAt) <= deadline
}

export const refreshReceipt = (receipt, task, now = new Date()) => {
  const observedAt = now.toISOString()
  const updated = { ...receipt }
  if (updated.kind === "submission-reservation") {
    if (updated.submissionState === "submitting") {
      updated.submissionState = "unknown"
      updated.unknownAt = observedAt
      updated.unknownReason = "submission ended without a confirmed task URL"
    }
    return updated
  }
  if (task) {
    if (!OBSERVED_STATUSES.has(task.status)) {
      throw new Error(`task ${task.id} returned unmeasured status ${JSON.stringify(task.status)}`)
    }
    updated.lastObserved = { at: observedAt, updatedAt: task.updated_at, status: task.status, summary: task.summary }
    if (task.status === "ready") {
      updated.firstReadyObservedAt ??= observedAt
      updated.terminal = {
        at: updated.firstReadyObservedAt,
        observedAt,
        updatedAt: task.updated_at,
        status: task.status,
        summary: task.summary,
      }
    }
  }
  if (
    !updated.abandoned &&
    !updated.materialized &&
    deadlinePassed(updated, now) &&
    !observedReadyByDeadline(updated)
  ) {
    updated.abandoned = {
      at: observedAt,
      lastObservedStatus: task?.status ?? updated.lastObserved?.status ?? "not_listed",
    }
  }
  if (task?.status === "ready") {
    if (updated.abandoned) {
      updated.lateTerminal = {
        at: updated.firstReadyObservedAt,
        observedAt,
        updatedAt: task.updated_at,
        status: task.status,
        summary: task.summary,
      }
    }
  }
  return updated
}

export const refreshReceipts = (receipts, tasks, now = new Date()) => {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const updated = receipts.map((receipt) => refreshReceipt(receipt, taskById.get(receipt.taskId), now))
  const inFlight = updated.filter((receipt) => !receipt.abandoned && receipt.terminal?.status !== "ready")
  return { receipts: updated, inFlight }
}

const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const acquireCloudLock = (stateRoot, lockName, operation) => {
  const lockDirectory = join(stateRoot, lockName)
  const ownerPath = join(lockDirectory, "owner.json")
  mkdirSync(stateRoot, { recursive: true })
  const publishOwner = () => {
    const candidate = join(stateRoot, `${lockName}.${process.pid}.${randomUUID()}.candidate`)
    mkdirSync(candidate, { recursive: false })
    writeJsonAtomic(join(candidate, "owner.json"), { pid: process.pid, acquiredAt: new Date().toISOString() })
    try {
      renameSync(candidate, lockDirectory)
      return true
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true })
      if (existsSync(lockDirectory)) return false
      throw error
    }
  }

  while (!publishOwner()) {
    let owner = null
    try {
      owner = readJsonFile(ownerPath, `${operation} lock`)
    } catch {
      owner = null
    }
    if (processIsAlive(owner?.pid)) {
      throw new Error(`${operation} is already running in process ${owner.pid}`)
    }
    const staleDirectory = join(stateRoot, `${lockName}.${process.pid}.${randomUUID()}.stale`)
    try {
      renameSync(lockDirectory, staleDirectory)
    } catch (error) {
      if (!existsSync(lockDirectory)) continue
      throw error
    }
    rmSync(staleDirectory, { recursive: true, force: true })
  }
  let released = false
  return () => {
    if (released) return
    released = true
    rmSync(lockDirectory, { recursive: true, force: true })
  }
}

export const acquireMaterializationLock = (stateRoot) =>
  acquireCloudLock(stateRoot, "materialize.lock", "cloud materialization")

export const acquireSubmissionLock = (stateRoot) =>
  acquireCloudLock(stateRoot, "submit.lock", "cloud submission")
