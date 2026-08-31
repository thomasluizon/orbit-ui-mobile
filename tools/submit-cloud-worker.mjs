#!/usr/bin/env node
/** Submit one cloud implementation and persist the state needed to recover it after a crash. */

import { createHash, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"

import { dashFindings } from "./check-dashes.mjs"
import {
  CodexTimeoutError,
  ReceiptLockTimeoutError,
  acquireSubmissionLock,
  assertSameGitRepository,
  cloudOrder,
  cloudStateRoot,
  listCloudTasks,
  mirrorPathFor,
  parseTaskUrl,
  persistReceipt,
  persistReconciledReceipt,
  readJsonFile,
  refreshReceipts,
  reservationPathFor,
  runCodex,
} from "./lib/cloud-worker.mjs"
import { resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: submit-cloud-worker.mjs --issue <ORB-N|#N|N> --env <environment-id> --branch <name> --order <file> --worktree <path>
       submit-cloud-worker.mjs --clear-unknown <reservation-file>

Submits one task with the order as one shell-free argument, then writes a receipt beside the order
and mirrors it under the repository's shared Git directory. It checks the stable receipts once to
derive the current in-flight set and enforce caps.cloudParallelTasks. The worktree must belong to
the repository bound to the cloud environment. The named remote branch is resolved first, and the
cloud checkout is pinned to that commit while the receipt keeps the branch as context. An unresolved receipt blocks the same ticket.
It never waits for completion, applies a diff, commits, pushes, or opens a pull request.

A reservation is persisted before the remote write. If submission ends without a confirmed task
URL, that unknown attempt consumes capacity and blocks the same ticket. --clear-unknown lists the
environment and refuses to remove the reservation while any non terminal task lacks an existing
receipt. Any orphaned cloud task is abandoned rather than adopted, and its diff is never applied.

exit codes: 0 submitted and receipt persisted, 1 cloud or Git command failed,
            2 usage, configuration, order, or worktree error,
            3 cloud capacity is full or recovery safety blocks clearing,
            4 a Codex cloud command timed out, 5 receipt lock acquisition timed out

  --clear-unknown <file>      remove an unknown reservation once no possible live orphan remains
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
  "--clear-unknown",
])
const knownFlags = new Set([...valueFlags, "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !knownFlags.has(value) && !valueFlags.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
const argOf = (flag) => {
  const index = argv.indexOf(flag)
  return index === -1 ? null : argv[index + 1]
}

const clearArgument = argOf("--clear-unknown")
if (clearArgument) {
  const submissionFlags = ["--issue", "--env", "--branch", "--order", "--worktree"]
  if (submissionFlags.some((flag) => argOf(flag))) {
    fail(2, `${USAGE}\n\n--clear-unknown cannot be combined with a new submission`)
  }

  const reservationFile = resolve(clearArgument)
  if (!existsSync(reservationFile) || !statSync(reservationFile).isFile()) {
    fail(2, `cloud submission reservation not found: ${reservationFile}`)
  }
  let reservation
  try {
    reservation = readJsonFile(reservationFile, "cloud submission reservation")
  } catch (error) {
    fail(2, error.message)
  }
  if (
    reservation.kind !== "submission-reservation" ||
    !["submitting", "unknown"].includes(reservation.submissionState)
  ) {
    fail(2, `${reservationFile} is not an unknown cloud submission reservation`)
  }
  let reservationStateRoot
  try {
    reservationStateRoot = cloudStateRoot(reservation.worktree)
    const expectedPath = reservationPathFor(reservationStateRoot, reservation.reservationId)
    if (resolve(expectedPath) !== reservationFile) {
      fail(2, `reservation must be managed through its stable path: ${expectedPath}`)
    }
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
  const receiptsDirectory = join(reservationStateRoot, "receipts")
  let accountedTaskIds
  try {
    const receipts = readdirSync(receiptsDirectory)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFile(join(receiptsDirectory, entry), "cloud receipt"))
      .filter((receipt) => receipt.environmentId === reservation.environmentId)
    accountedTaskIds = new Set(
      receipts
        .map((receipt) => receipt.taskId)
        .filter((taskId) => typeof taskId === "string"),
    )
  } catch (error) {
    fail(2, error.message)
  }

  try {
    const tasks = await listCloudTasks(codexCommand, reservation.environmentId, {
      timeoutMs: config.timeouts.cloudCommandMinutes * 60 * 1000,
    })
    const possibleOrphans = tasks.filter((task) =>
      task.status !== "ready" && !accountedTaskIds.has(task.id),
    )
    if (possibleOrphans.length > 0) {
      const taskLabel = possibleOrphans.length === 1 ? "task" : "tasks"
      fail(
        3,
        `refusing to clear unknown submission reservation: saw ${possibleOrphans.length} ` +
        `unaccounted non terminal ${taskLabel}; wait for them to finish or identify them in ` +
        `codex cloud list before clearing`,
      )
    }
  } catch (error) {
    if (error instanceof CodexTimeoutError) fail(4, error.message)
    fail(1, error.message)
  }

  unlinkSync(reservationFile)
  releaseReservationLock()
  console.log(JSON.stringify({ outcome: "UNKNOWN_SUBMISSION_CLEARED", reservationId: reservation.reservationId }))
  process.exit(0)
}

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

const remote = spawnSync("git", ["-C", worktree, "ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], {
  encoding: "utf8",
  windowsHide: true,
})
if (remote.error || remote.status !== 0) {
  fail(1, `git ls-remote could not resolve origin/${branch}: ${(remote.stderr || remote.error?.message || "unknown error").trim()}`)
}
const remoteLines = remote.stdout.trim().split(/\r?\n/).filter(Boolean)
const remoteMatch = remoteLines.length === 1 ? /^([0-9a-f]{40})\s+refs\/heads\/(.+)$/.exec(remoteLines[0]) : null
if (!remoteMatch || remoteMatch[2] !== branch) fail(1, `git ls-remote returned an unexpected response for origin/${branch}`)
const baseSha = remoteMatch[1]

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
    existingReceipts = readdirSync(receiptsDirectory)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFile(join(receiptsDirectory, entry), "cloud receipt"))
      .filter((receipt) => receipt.environmentId === environmentId)
  } catch (error) {
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
    const blockedTicket = reconciledReceipts.find((receipt) =>
      receipt.ticket === ticket && !receipt.abandoned && !receipt.materialized,
    )
    if (blockedTicket) {
      const blockedState = blockedTicket.kind === "submission-reservation"
        ? `unknown submission reservation at ${blockedTicket.mirrorPath}`
        : blockedTicket.terminal?.status === "ready"
          ? `task ${blockedTicket.taskId} is ready but not materialized`
          : `task ${blockedTicket.taskId} is ${blockedTicket.lastObserved?.status ?? "unresolved"}`
      const nextAction = blockedTicket.kind === "submission-reservation"
        ? "clear it after inspecting cloud tasks"
        : blockedTicket.terminal?.status === "ready"
          ? "materialize it"
          : "wait for it to finish"
      fail(
        3,
        `ticket ${ticket} already has ${blockedState}; ${nextAction} before resubmitting`,
      )
    }
    const inFlight = reconciledReceipts.filter((receipt) =>
      !receipt.abandoned && receipt.terminal?.status !== "ready",
    )
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
const result = await runCodex(codexCommand, ["cloud", "exec", "--env", environmentId, "--branch", baseSha, submittedOrder], {
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
}
delete receipt.reservationId
try {
  persistReceipt(receipt, mirrorPath, [receiptPath])
  unlinkSync(reservationPath)
} catch (error) {
  fail(1, `cloud task ${task.taskId} was submitted but its receipt could not be persisted: ${error.message}`)
}
releaseLock()
console.log(JSON.stringify(receipt))
