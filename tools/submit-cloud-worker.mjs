#!/usr/bin/env node
/** Submit one cloud implementation and persist the state needed to recover it after a crash. */

import { createHash, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { setTimeout as wait } from "node:timers/promises"

import { dashFindings } from "./check-dashes.mjs"
import {
  CodexTimeoutError,
  ReceiptLockTimeoutError,
  acquireSubmissionLock,
  assertSameGitRepository,
  cloudOrder,
  cloudStateRoot,
  isCloudTaskId,
  isTerminalTaskStatus,
  listCloudTasks,
  mirrorPathFor,
  parseTaskUrl,
  persistReceipt,
  persistReconciledReceipt,
  readJsonFile,
  reconcileReceiptCopies,
  receiptBlocksTicketAdmission,
  receiptConsumesFleetCapacity,
  refreshReceipts,
  refreshReceipt,
  reservationPathFor,
  runCodex,
} from "./lib/cloud-worker.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: submit-cloud-worker.mjs --issue <ORB-N|#N|N> --env <environment-id> --branch <name> --order <file> --worktree <path>
       submit-cloud-worker.mjs --watch <receipt-file>
       submit-cloud-worker.mjs --clear-unknown <reservation-file> --assert-no-task-exists
       submit-cloud-worker.mjs --abandon-known <reservation-file> --task-id <task_e_id>

Submits one task with the order through stdin, then writes a receipt beside the order
and mirrors it under the repository's shared Git directory. It checks the stable receipts once to
derive the current in-flight set and enforce caps.cloudParallelTasks. The worktree must belong to
the repository bound to the cloud environment. The named remote branch is resolved first, and the
remote SHA must match the worktree HEAD. The cloud checkout is pinned to that commit while the
receipt keeps the branch as context. An unresolved receipt blocks the same ticket.
Submission mode never waits for completion, applies a diff, commits, pushes, or opens a pull request.

--watch is the separate unattended wake source. It registers its own PID, refreshes the named
receipt until the task is terminal or locally abandoned, then exits so the scheduler resumes.

A reservation is persisted before the remote write. If submission ends without a confirmed task
URL, that unknown attempt consumes capacity and blocks the same ticket. Task absence cannot be
proven from codex cloud list. --clear-unknown alone refuses and instructs the operator to inspect the
Codex UI. --assert-no-task-exists records the operator's assertion and releases the reservation.
Any orphaned cloud task is abandoned rather than adopted, and its diff is never applied.
A known task remains a reservation until the scheduler observes a terminal status.

exit codes: 0 submitted and receipt persisted, 1 cloud or Git command failed,
            2 usage, configuration, order, or worktree error,
            3 cloud capacity is full or recovery safety blocks clearing,
            4 a Codex cloud command timed out, 5 receipt lock acquisition timed out

  --clear-unknown <file>      select an unknown reservation for explicit human release
  --assert-no-task-exists     assert that the Codex UI shows no task for that reservation
  --abandon-known <file>      bind a visible task to a reservation for terminal-only tracking
  --task-id <task_e_id>       the visible task that must finish before its reservation releases
  --help, -h                  print this usage and exit 0`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const valueFlags = new Set([
  "--issue",
  "--env",
  "--branch",
  "--order",
  "--worktree",
  "--watch",
  "--clear-unknown",
  "--abandon-known",
  "--task-id",
])
const knownFlags = new Set([...valueFlags, "--assert-no-task-exists", "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !knownFlags.has(value) && !valueFlags.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
const argOf = (flag) => {
  const index = argv.indexOf(flag)
  return index === -1 ? null : argv[index + 1]
}

const clearArgument = argOf("--clear-unknown")
const abandonArgument = argOf("--abandon-known")
const watchArgument = argOf("--watch")
if ([clearArgument, abandonArgument, watchArgument].filter(Boolean).length > 1) {
  fail(2, `${USAGE}\n\n--watch, --clear-unknown, and --abandon-known are mutually exclusive`)
}
if (watchArgument) {
  const incompatibleFlags = [
    "--issue",
    "--env",
    "--branch",
    "--order",
    "--worktree",
    "--clear-unknown",
    "--abandon-known",
    "--task-id",
  ]
  if (incompatibleFlags.some((flag) => argOf(flag)) || argv.includes("--assert-no-task-exists")) {
    fail(2, `${USAGE}\n\n--watch cannot be combined with submission or recovery options`)
  }

  const receiptFile = resolve(watchArgument)
  if (!existsSync(receiptFile) || !statSync(receiptFile).isFile()) {
    fail(2, `cloud task receipt not found: ${receiptFile}`)
  }
  let config
  try {
    config = readOrchestratorConfig()
  } catch (error) {
    fail(2, error.message)
  }
  const codexCommand = config.workers.codex?.command
  if (typeof codexCommand !== "string" || codexCommand.length === 0) {
    fail(2, ".claude/orchestrator.json declares no codex command")
  }
  const codexTimeoutMs = config.timeouts.cloudCommandMinutes * 60 * 1000
  const pollMs = config.timeouts.pollSeconds * 1000
  const receiptLockOptions = { lockTimeoutMs: config.timeouts.receiptLockSeconds * 1000 }

  const readCurrentReceipt = () => {
    const scratchReceipt = readJsonFile(receiptFile, "cloud task receipt")
    if (scratchReceipt.kind !== "task-receipt" || scratchReceipt.submissionState !== "confirmed") {
      throw new Error(`${receiptFile} is not a confirmed cloud task receipt`)
    }
    if (!isCloudTaskId(scratchReceipt.taskId)) throw new Error(`${receiptFile} carries an invalid cloud task id`)
    if (typeof scratchReceipt.worktree !== "string" || scratchReceipt.worktree.length === 0) {
      throw new Error(`${receiptFile} carries no worktree`)
    }
    if (typeof scratchReceipt.receiptPath !== "string" || scratchReceipt.receiptPath.length === 0) {
      throw new Error(`${receiptFile} carries no receiptPath`)
    }
    if (typeof scratchReceipt.mirrorPath !== "string" || scratchReceipt.mirrorPath.length === 0) {
      throw new Error(`${receiptFile} carries no mirrorPath`)
    }
    if (scratchReceipt.environmentId !== config.cloud.environmentId) {
      throw new Error(`receipt environment ${scratchReceipt.environmentId} does not match configured environment ${config.cloud.environmentId}`)
    }
    if (scratchReceipt.repositoryKey !== config.cloud.repositoryKey) {
      throw new Error(`receipt repository ${scratchReceipt.repositoryKey} does not match configured repository ${config.cloud.repositoryKey}`)
    }
    assertSameGitRepository(scratchReceipt.worktree, config.repos[scratchReceipt.repositoryKey], scratchReceipt.repositoryKey)
    const stateRoot = cloudStateRoot(scratchReceipt.worktree)
    const expectedMirror = mirrorPathFor(stateRoot, scratchReceipt.taskId)
    if (resolve(scratchReceipt.mirrorPath) !== resolve(expectedMirror)) {
      throw new Error(`receipt must use its stable mirror path: ${expectedMirror}`)
    }
    const allowedPaths = new Set([resolve(expectedMirror), resolve(scratchReceipt.receiptPath)])
    if (!allowedPaths.has(receiptFile)) {
      throw new Error(`watch target must be the receipt or its stable mirror: ${scratchReceipt.receiptPath}`)
    }
    const mirroredReceipt = existsSync(expectedMirror)
      ? readJsonFile(expectedMirror, "mirrored cloud task receipt")
      : scratchReceipt
    return {
      receipt: reconcileReceiptCopies(scratchReceipt, mirroredReceipt),
      mirrorPath: expectedMirror,
      replicaPaths: [scratchReceipt.receiptPath],
      stateRoot,
    }
  }
  const watchOutcome = (receipt) => {
    if (receipt.abandoned && isTerminalTaskStatus(receipt.terminal?.status)) {
      return `ABANDONED_TERMINAL_${receipt.terminal.status.toUpperCase()}`
    }
    if (receipt.materialized || receipt.released || receipt.unusable) return "RESOLVED"
    if (isTerminalTaskStatus(receipt.terminal?.status)) return `TERMINAL_${receipt.terminal.status.toUpperCase()}`
    return null
  }

  let watched
  try {
    watched = readCurrentReceipt()
  } catch (error) {
    fail(2, error.message)
  }
  registerWakeSource({
    pid: process.pid,
    what: `cloud task ${watched.receipt.taskId}`,
    taskId: watched.receipt.taskId,
    receiptPath: receiptFile,
    startedAt: new Date().toISOString(),
  })
  process.once("exit", () => clearWakeSource(process.pid))

  while (true) {
    try {
      watched = readCurrentReceipt()
    } catch (error) {
      fail(2, error.message)
    }
    const existingOutcome = watchOutcome(watched.receipt)
    if (existingOutcome) {
      console.log(JSON.stringify({ outcome: existingOutcome, taskId: watched.receipt.taskId, receiptPath: receiptFile }))
      process.exit(0)
    }

    let tasks = null
    try {
      tasks = await listCloudTasks(codexCommand, watched.receipt.environmentId, {
        cwd: watched.stateRoot,
        timeoutMs: codexTimeoutMs,
      })
    } catch (error) {
      console.error(`cloud receipt watcher will retry after list failure: ${error.message}`)
    }
    const task = tasks?.find((candidate) => candidate.id === watched.receipt.taskId)
    let refreshed = refreshReceipt(watched.receipt, task, new Date())
    let persisted = false
    try {
      refreshed = persistReconciledReceipt(
        refreshed,
        watched.mirrorPath,
        watched.replicaPaths,
        receiptLockOptions,
      )
      persisted = true
    } catch (error) {
      if (error instanceof ReceiptLockTimeoutError) {
        console.error(`cloud receipt watcher will retry after receipt lock timeout: ${error.message}`)
      } else {
        fail(1, `cloud receipt watcher could not persist task ${watched.receipt.taskId}: ${error.message}`)
      }
    }
    const refreshedOutcome = persisted ? watchOutcome(refreshed) : null
    if (refreshedOutcome) {
      console.log(JSON.stringify({ outcome: refreshedOutcome, taskId: refreshed.taskId, receiptPath: receiptFile }))
      process.exit(0)
    }
    await wait(pollMs)
  }
}
if (clearArgument) {
  const submissionFlags = ["--issue", "--env", "--branch", "--order", "--worktree"]
  if (submissionFlags.some((flag) => argOf(flag)) || argOf("--task-id")) {
    fail(2, `${USAGE}\n\n--clear-unknown cannot be combined with a new submission or --task-id`)
  }
  if (!argv.includes("--assert-no-task-exists")) {
    fail(
      3,
      "task absence cannot be proven from codex cloud list. Open the task list in the Codex UI, " +
      "confirm that no task exists for this reservation, then rerun with --assert-no-task-exists",
    )
  }

  const reservationFile = resolve(clearArgument)
  if (!existsSync(reservationFile) || !statSync(reservationFile).isFile()) {
    fail(2, `cloud submission reservation not found: ${reservationFile}`)
  }
  const reservationStateRoot = dirname(dirname(reservationFile))
  let releaseReservationLock
  try {
    releaseReservationLock = acquireSubmissionLock(reservationStateRoot)
  } catch (error) {
    fail(2, error.message)
  }
  process.once("exit", releaseReservationLock)
  if (!existsSync(reservationFile)) {
    fail(2, `cloud submission reservation disappeared while acquiring its lock: ${reservationFile}; no receipt was changed`)
  }
  let reservation
  try {
    reservation = readJsonFile(reservationFile, "cloud submission reservation")
    if (
      reservation.kind !== "submission-reservation" ||
      !["submitting", "unknown"].includes(reservation.submissionState)
    ) {
      fail(2, `${reservationFile} is not an unknown cloud submission reservation`)
    }
    const expectedStateRoot = cloudStateRoot(reservation.worktree)
    const expectedPath = reservationPathFor(expectedStateRoot, reservation.reservationId)
    if (resolve(expectedStateRoot) !== resolve(reservationStateRoot) || resolve(expectedPath) !== reservationFile) {
      fail(2, `reservation must be managed through its stable path: ${expectedPath}`)
    }
  } catch (error) {
    fail(2, error.message)
  }

  reservation.submissionState = "released"
  reservation.released = {
    at: new Date().toISOString(),
    by: "human",
    assertion: "no task exists for this reservation in the Codex UI",
  }
  try {
    persistReceipt(reservation, reservationFile)
  } catch (error) {
    fail(1, `unknown submission release could not be recorded: ${error.message}`)
  }
  releaseReservationLock()
  console.log(JSON.stringify({
    outcome: "UNKNOWN_SUBMISSION_CLEARED",
    reservationId: reservation.reservationId,
    released: reservation.released,
  }))
  process.exit(0)
}

if (abandonArgument) {
  const submissionFlags = ["--issue", "--env", "--branch", "--order", "--worktree"]
  if (submissionFlags.some((flag) => argOf(flag)) || argv.includes("--assert-no-task-exists")) {
    fail(2, `${USAGE}\n\n--abandon-known cannot be combined with a new submission or --assert-no-task-exists`)
  }
  const taskId = argOf("--task-id")
  if (!isCloudTaskId(taskId)) fail(2, `${USAGE}\n\n--task-id must be a Codex cloud task id`)
  const reservationFile = resolve(abandonArgument)
  if (!existsSync(reservationFile) || !statSync(reservationFile).isFile()) {
    fail(2, `cloud submission reservation not found: ${reservationFile}`)
  }
  const reservationStateRoot = dirname(dirname(reservationFile))
  let config
  try {
    config = readOrchestratorConfig()
  } catch (error) {
    fail(2, error.message)
  }
  let releaseReservationLock
  try {
    releaseReservationLock = acquireSubmissionLock(reservationStateRoot)
  } catch (error) {
    fail(2, error.message)
  }
  process.once("exit", releaseReservationLock)
  if (!existsSync(reservationFile)) {
    fail(2, `cloud submission reservation disappeared while acquiring its lock: ${reservationFile}; no receipt was changed`)
  }
  let reservation
  try {
    reservation = readJsonFile(reservationFile, "cloud submission reservation")
    if (
      reservation.kind !== "submission-reservation" ||
      !["submitting", "unknown", "known-task-abandoned"].includes(reservation.submissionState)
    ) {
      fail(2, `${reservationFile} is not an unresolved cloud submission reservation`)
    }
    if (reservation.taskId && reservation.taskId !== taskId) {
      fail(2, `reservation is already bound to task ${reservation.taskId}`)
    }
    if (reservation.environmentId !== config.cloud.environmentId) {
      fail(2, `reservation environment ${reservation.environmentId} does not match configured environment ${config.cloud.environmentId}`)
    }
    if (reservation.repositoryKey !== config.cloud.repositoryKey) {
      fail(2, `reservation repository ${reservation.repositoryKey} does not match configured repository ${config.cloud.repositoryKey}`)
    }
    assertSameGitRepository(reservation.worktree, config.repos[reservation.repositoryKey], reservation.repositoryKey)
    const expectedStateRoot = cloudStateRoot(reservation.worktree)
    const expectedPath = reservationPathFor(expectedStateRoot, reservation.reservationId)
    if (resolve(expectedStateRoot) !== resolve(reservationStateRoot) || resolve(expectedPath) !== reservationFile) {
      fail(2, `reservation must be managed through its stable path: ${expectedPath}`)
    }
  } catch (error) {
    fail(2, error.message)
  }
  const codexCommand = config.workers.codex?.command
  const codexTimeoutMs = config.timeouts.cloudCommandMinutes * 60 * 1000
  let tasks
  try {
    tasks = await listCloudTasks(codexCommand, reservation.environmentId, {
      cwd: reservationStateRoot,
      timeoutMs: codexTimeoutMs,
    })
  } catch (error) {
    if (error instanceof CodexTimeoutError) fail(4, error.message)
    fail(1, error.message)
  }
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (!task) fail(3, `task ${taskId} was not returned by codex cloud list; the reservation was not changed`)
  reservation.taskId = taskId
  reservation.submissionState = "known-task-abandoned"
  reservation.knownTaskAbandonment ??= {
    at: new Date().toISOString(),
    by: "human",
    reason: "visible task belongs to an uncertain submission and must never be materialized",
  }
  reservation = refreshReceipt(reservation, task)
  try {
    persistReceipt(reservation, reservationFile)
  } catch (error) {
    fail(1, `known task abandonment could not be recorded: ${error.message}`)
  }
  releaseReservationLock()
  console.log(JSON.stringify({
    outcome: reservation.released ? "KNOWN_TASK_TERMINATED" : "KNOWN_TASK_ABANDONED",
    reservationId: reservation.reservationId,
    taskId,
    status: task.status,
  }))
  process.exit(0)
}

if (argv.includes("--assert-no-task-exists")) {
  fail(2, `${USAGE}\n\n--assert-no-task-exists requires --clear-unknown <reservation-file>`)
}
if (argOf("--task-id")) fail(2, `${USAGE}\n\n--task-id requires --abandon-known <reservation-file>`)

let ticket
try {
  const resolved = resolveTicket(argOf("--issue"))
  ticket = resolved.identifier ?? `#${resolved.number}`
} catch (error) {
  fail(2, `${USAGE}\n\n--issue must be ORB-N, #N, or N: ${error.message}`)
}
const environmentId = argOf("--env")
const branch = argOf("--branch")
const orderArgument = argOf("--order")
const worktreeArgument = argOf("--worktree")
for (const [flag, value] of [["--env", environmentId], ["--branch", branch], ["--order", orderArgument], ["--worktree", worktreeArgument]]) {
  if (!value || value.startsWith("--")) fail(2, `${USAGE}\n\n${flag} is required`)
}

const worktree = resolve(worktreeArgument)
const orderFile = resolve(orderArgument)
if (!existsSync(worktree) || !statSync(worktree).isDirectory()) fail(2, `worktree not found: ${worktree}`)
if (!existsSync(orderFile) || !statSync(orderFile).isFile()) fail(2, `order file not found: ${orderFile}`)
const orderRelative = relative(worktree, orderFile)
const orderIsInsideWorktree = orderRelative === "" || (
  orderRelative !== ".." && !orderRelative.startsWith(`..${sep}`) && !isAbsolute(orderRelative)
)
if (orderIsInsideWorktree) {
  fail(2, `order file lives inside ${worktree}; cloud work orders belong in the session scratchpad`)
}

const orderText = readFileSync(orderFile, "utf8")
if (orderText.length === 0) fail(2, `order file is empty: ${orderFile}`)
const findings = dashFindings(orderText, { allowNumericRanges: false })
if (findings.length > 0) {
  const kinds = [...new Set(findings.map((finding) => finding.kind))].join(", ")
  fail(2, `order file contains a banned ${kinds}; it would fail the container commit before producing a diff`)
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
if (config.cloud.environmentId !== environmentId) {
  fail(2, `--env must match .claude/orchestrator.json cloud.environmentId (${config.cloud.environmentId})`)
}
const codexCommand = config.workers.codex?.command
if (typeof codexCommand !== "string" || codexCommand.length === 0) fail(2, ".claude/orchestrator.json declares no codex command")
const codexTimeoutMs = config.timeouts.cloudCommandMinutes * 60 * 1000
const receiptLockOptions = { lockTimeoutMs: config.timeouts.receiptLockSeconds * 1000 }
const repositoryKey = config.cloud.repositoryKey

let stateRoot
try {
  assertSameGitRepository(worktree, config.repos[repositoryKey], repositoryKey)
  stateRoot = cloudStateRoot(worktree)
} catch (error) {
  fail(2, error.message)
}

const remoteTimeoutMs = config.timeouts.gitRemoteSeconds * 1000
const remote = await runBounded("git", ["-C", worktree, "ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], {
  env: process.env,
  maxBuffer: 1024 * 1024,
  timeoutMs: remoteTimeoutMs,
})
if (remote.timedOut) fail(4, `git ls-remote timed out after ${remoteTimeoutMs}ms resolving origin/${branch}`)
if (remote.error || remote.status !== 0) {
  fail(1, `git ls-remote could not resolve origin/${branch}: ${(remote.stderr || remote.error?.message || "unknown error").trim()}`)
}
const remoteLines = remote.stdout.trim().split(/\r?\n/).filter(Boolean)
const remoteMatch = remoteLines.length === 1 ? /^([0-9a-f]{40})\s+refs\/heads\/(.+)$/.exec(remoteLines[0]) : null
if (!remoteMatch || remoteMatch[2] !== branch) fail(1, `git ls-remote returned an unexpected response for origin/${branch}`)
const baseSha = remoteMatch[1]
const localHead = spawnSync("git", ["-C", worktree, "rev-parse", "--verify", "HEAD^{commit}"], {
  encoding: "utf8",
  windowsHide: true,
})
if (localHead.error || localHead.status !== 0) {
  fail(1, `git rev-parse could not resolve the worktree HEAD: ${(localHead.stderr || localHead.error?.message || "unknown error").trim()}`)
}
const localSha = localHead.stdout.trim()
if (!/^[0-9a-f]{40}$/.test(localSha)) fail(1, "git rev-parse returned an unexpected response for the worktree HEAD")
if (baseSha !== localSha) {
  fail(1, `origin/${branch} is at ${baseSha}, but the worktree HEAD is ${localSha}; publish the worktree HEAD before submission`)
}

let releaseLock
try {
  releaseLock = acquireSubmissionLock(stateRoot)
} catch (error) {
  fail(2, error.message)
}
process.once("exit", releaseLock)

const receiptsDirectory = join(stateRoot, "receipts")
let existingReceipts = []
if (existsSync(receiptsDirectory)) {
  try {
    const receiptEntries = readdirSync(receiptsDirectory)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => ({ path: join(receiptsDirectory, entry), receipt: readJsonFile(join(receiptsDirectory, entry), "cloud receipt") }))
      .filter((entry) => entry.receipt.environmentId === environmentId)
    for (const entry of receiptEntries) {
      if (entry.receipt.kind !== "submission-reservation" || entry.receipt.submissionState !== "confirmed") {
        existingReceipts.push(entry.receipt)
        continue
      }
      const confirmed = entry.receipt
      const confirmedReceipt = { ...confirmed, kind: "task-receipt", transitionReservationId: confirmed.reservationId }
      delete confirmedReceipt.reservationId
      const finalized = persistReconciledReceipt(
        confirmedReceipt,
        mirrorPathFor(stateRoot, confirmed.taskId),
        [confirmed.receiptPath],
        receiptLockOptions,
      )
      unlinkSync(entry.path)
      existingReceipts.push(finalized)
    }
    existingReceipts = existingReceipts.map((receipt) => (
      receipt.kind === "submission-reservation"
        ? receipt
        : readJsonFile(mirrorPathFor(stateRoot, receipt.taskId), "cloud receipt")
    ))
    existingReceipts = [...new Map(existingReceipts.map((receipt) => [
      receipt.kind === "submission-reservation" ? `reservation:${receipt.reservationId}` : `task:${receipt.taskId}`,
      receipt,
    ])).values()]
  } catch (error) {
    if (error instanceof ReceiptLockTimeoutError) fail(5, error.message)
    fail(2, error.message)
  }
}

if (existingReceipts.length > 0) {
  try {
    const tasks = await listCloudTasks(codexCommand, environmentId, { timeoutMs: codexTimeoutMs })
    const refreshed = refreshReceipts(existingReceipts, tasks)
    const reconciledReceipts = refreshed.receipts.map((receipt) => {
      const stablePath = receipt.kind === "submission-reservation"
        ? reservationPathFor(stateRoot, receipt.reservationId)
        : mirrorPathFor(stateRoot, receipt.taskId)
      if (receipt.kind !== "submission-reservation") {
        return persistReconciledReceipt(receipt, stablePath, [], receiptLockOptions)
      }
      persistReceipt(receipt, stablePath)
      return receipt
    })
    const blockedTicket = reconciledReceipts.find((receipt) => (
      receipt.ticket === ticket && receiptBlocksTicketAdmission(receipt)
    ))
    if (blockedTicket) {
      const blockedState = blockedTicket.kind === "submission-reservation"
        ? blockedTicket.submissionState === "known-task-abandoned"
          ? `known abandoned task ${blockedTicket.taskId} is ${blockedTicket.lastObserved?.status ?? "unresolved"}`
          : `unknown submission reservation at ${blockedTicket.mirrorPath}`
        : `task ${blockedTicket.taskId} is ${blockedTicket.lastObserved?.status ?? "unresolved"}`
      const nextAction = blockedTicket.kind === "submission-reservation"
        ? blockedTicket.submissionState === "known-task-abandoned"
          ? "wait for its terminal status"
          : "release it only after confirming in the Codex UI that no task exists"
        : blockedTicket.terminal
          ? "resolve that receipt before resubmitting"
          : "wait for it to finish"
      fail(
        3,
        `ticket ${ticket} already has ${blockedState}; ${nextAction} before resubmitting`,
      )
    }
    const inFlight = reconciledReceipts.filter(receiptConsumesFleetCapacity)
    if (inFlight.length >= config.caps.cloudParallelTasks) {
      fail(
        3,
        `cloud capacity is full: ${inFlight.length}/${config.caps.cloudParallelTasks} tasks are in flight`,
      )
    }
  } catch (error) {
    if (error instanceof CodexTimeoutError) fail(4, error.message)
    if (error instanceof ReceiptLockTimeoutError) fail(5, error.message)
    fail(1, error.message)
  }
}

const submittedOrder = cloudOrder(orderText)
const submittedAt = new Date()
const orderName = basename(orderFile, extname(orderFile))
const reservationId = randomUUID()
const reservationPath = reservationPathFor(stateRoot, reservationId)
const reservation = {
  kind: "submission-reservation",
  reservationId,
  submissionState: "submitting",
  environmentId,
  repositoryKey,
  ticket,
  branch,
  baseSha,
  orderSha256: createHash("sha256").update(orderText).digest("hex"),
  submittedOrderSha256: createHash("sha256").update(submittedOrder).digest("hex"),
  orderFile,
  worktree,
  submittedAt: submittedAt.toISOString(),
  deadline: new Date(submittedAt.getTime() + config.timeouts.cloudCeilingMinutes * 60 * 1000).toISOString(),
  mirrorPath: reservationPath,
}
try {
  persistReceipt(reservation, reservationPath)
} catch (error) {
  fail(1, `cloud submission reservation could not be persisted: ${error.message}`)
}
const result = await runCodex(codexCommand, ["cloud", "exec", "--env", environmentId, "--branch", baseSha], {
  input: submittedOrder,
  timeoutMs: codexTimeoutMs,
})
const retainUnknownReservation = (reason) => {
  reservation.submissionState = "unknown"
  reservation.unknownAt = new Date().toISOString()
  reservation.unknownReason = reason
  try {
    persistReceipt(reservation, reservationPath)
  } catch (error) {
    fail(1, `cloud submission became uncertain and its reservation could not be updated: ${error.message}`)
  }
}
if (result.timedOut) {
  retainUnknownReservation(`codex cloud exec timed out after ${codexTimeoutMs}ms`)
  fail(
    4,
    `codex cloud exec timed out after ${codexTimeoutMs}ms; the unknown submission still consumes ` +
    `capacity at ${reservationPath}`,
  )
}
if (result.error || result.status !== 0) {
  retainUnknownReservation(`codex cloud exec failed with exit ${result.status ?? "spawn"}`)
  fail(1, `codex cloud exec failed with exit ${result.status ?? "spawn"}: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`)
}

let task
try {
  task = parseTaskUrl(result.stdout)
} catch (error) {
  retainUnknownReservation(error.message)
  fail(1, error.message)
}
const receiptPath = join(dirname(orderFile), `${orderName}-${task.taskId}.cloud-receipt.json`)
const mirrorPath = mirrorPathFor(stateRoot, task.taskId)
const receipt = {
  ...reservation,
  kind: "task-receipt",
  submissionState: "confirmed",
  taskId: task.taskId,
  taskUrl: task.taskUrl,
  receiptPath,
  mirrorPath,
  transitionReservationId: reservation.reservationId,
}
delete receipt.reservationId
try {
  persistReceipt({ ...reservation, submissionState: "confirmed", taskId: task.taskId, taskUrl: task.taskUrl, receiptPath, mirrorPath }, reservationPath)
  persistReconciledReceipt(receipt, mirrorPath, [receiptPath], receiptLockOptions)
  unlinkSync(reservationPath)
} catch (error) {
  fail(1, `cloud task ${task.taskId} was submitted but its receipt could not be persisted: ${error.message}`)
}
releaseLock()
console.log(JSON.stringify(receipt))
