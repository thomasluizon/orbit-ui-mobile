#!/usr/bin/env node
/** Validate and apply one terminal cloud task into the exact worktree captured at submission. */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, unlinkSync } from "node:fs"
import { join, resolve } from "node:path"

import {
  CodexTimeoutError,
  ReceiptLockTimeoutError,
  acquireMaterializationLock,
  assertSameGitRepository,
  cloudStateRoot,
  listCloudTasks,
  mirrorPathFor,
  persistReceipt,
  persistReconciledReceipt,
  readJsonFile,
  reconcileReceiptCopies,
  refreshReceipt,
  runCodex,
} from "./lib/cloud-worker.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

// The Codex CLI writes this diagnostic file into its working directory.
const CODEX_DIAGNOSTIC_FILENAME = "error.log"

const USAGE = `usage: materialize-cloud-result.mjs --receipt <file> [--allow-abandoned]

Reads terminal state through codex cloud list, then applies one non-empty ready task in the receipt's
worktree. The receipt and worktree must still match the repository bound to the cloud environment.
The worktree must be clean and still at the receipt's exact base SHA. Abandoned tasks are quarantined
unless --allow-abandoned is explicit. Materialization is serial across the repository.
It never commits, pushes, opens a pull request, or merges.

If exit 9 reports APPLIED_RECEIPT_WRITE_FAILED, the diff is already applied and staged. Leave the
worktree unchanged and rerun this same command with the same receipt. The recovery marker lets the
retry record materialization without running cloud apply again.

exit codes: 0 applied, 1 cloud or Git command failed, 2 usage/receipt/worktree precondition failed,
            3 task cannot be materialized, 4 ready task produced no committed diff, 5 task is abandoned,
            6 a Codex cloud command timed out, 7 cloud apply produced an invalid Git landing,
            8 receipt lock acquisition timed out before apply,
            9 diff applied and staged but the receipt write lock timed out

  --help, -h          print this usage and exit 0
  --allow-abandoned   permit a late terminal result to proceed, while keeping the base SHA check`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message, outcome = null) => {
  if (outcome) console.log(JSON.stringify({ outcome, message }))
  else console.error(message)
  process.exit(code)
}
const valueFlags = new Set(["--receipt"])
const knownFlags = new Set([...valueFlags, "--allow-abandoned", "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !knownFlags.has(value) && !valueFlags.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
const receiptIndex = argv.indexOf("--receipt")
const receiptArgument = receiptIndex === -1 ? null : argv[receiptIndex + 1]
if (!receiptArgument || receiptArgument.startsWith("--")) fail(2, `${USAGE}\n\n--receipt is required`)
const allowAbandoned = argv.includes("--allow-abandoned")
const receiptPath = resolve(receiptArgument)
if (!existsSync(receiptPath)) fail(2, `receipt not found: ${receiptPath}`)

let receipt
try {
  receipt = readJsonFile(receiptPath, "cloud receipt")
} catch (error) {
  fail(2, error.message)
}
for (const field of ["taskId", "environmentId", "repositoryKey", "baseSha", "worktree", "deadline"]) {
  if (typeof receipt[field] !== "string" || receipt[field].length === 0) fail(2, `cloud receipt carries no ${field}`)
}
if (!/^[0-9a-f]{40}$/.test(receipt.baseSha)) fail(2, "cloud receipt carries an invalid baseSha")
const worktree = resolve(receipt.worktree)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
if (receipt.environmentId !== config.cloud.environmentId) {
  fail(2, `cloud receipt environment ${receipt.environmentId} does not match configured environment ${config.cloud.environmentId}`)
}
if (receipt.repositoryKey !== config.cloud.repositoryKey) {
  fail(2, `cloud receipt repository ${receipt.repositoryKey} does not match configured cloud repository ${config.cloud.repositoryKey}`)
}
try {
  assertSameGitRepository(worktree, config.repos[receipt.repositoryKey], receipt.repositoryKey)
} catch (error) {
  fail(2, error.message)
}

let stateRoot
try {
  stateRoot = cloudStateRoot(worktree)
} catch (error) {
  fail(2, error.message)
}
const mirrorPath = mirrorPathFor(stateRoot, receipt.taskId)
const recoveryPath = join(stateRoot, `materialization-recovery-${receipt.taskId}.json`)
const receiptLockOptions = { lockTimeoutMs: config.timeouts.receiptLockSeconds * 1000 }
const persistConfiguredReceipt = (value, appliedDiffIsStaged = false) => {
  try {
    return persistReconciledReceipt(value, mirrorPath, [receiptPath], receiptLockOptions)
  } catch (error) {
    if (error instanceof ReceiptLockTimeoutError && appliedDiffIsStaged) {
      fail(
        9,
        `the cloud diff is applied and staged in ${worktree}, and only the receipt write failed. ` +
        `Leave the worktree unchanged and rerun: node tools/materialize-cloud-result.mjs --receipt ${JSON.stringify(receiptPath)}`,
        "APPLIED_RECEIPT_WRITE_FAILED",
      )
    }
    if (error instanceof ReceiptLockTimeoutError) fail(8, error.message, "RECEIPT_LOCK_TIMEOUT")
    fail(2, error.message)
  }
}
const recordUnusableReceipt = (status, reason) => {
  receipt.unusable = { at: new Date().toISOString(), status, reason }
  receipt = persistConfiguredReceipt(receipt)
}
const recordApplyAttempt = (attemptedAt) => {
  try {
    persistReceipt({
      taskId: receipt.taskId,
      baseSha: receipt.baseSha,
      worktree: receipt.worktree,
      attemptedAt,
    }, recoveryPath)
  } catch (error) {
    fail(2, `could not record the cloud apply attempt; cloud apply was not run: ${error.message}`)
  }
}
let releaseLock
try {
  releaseLock = acquireMaterializationLock(stateRoot)
} catch (error) {
  fail(2, error.message)
}
process.once("exit", releaseLock)

if (existsSync(mirrorPath) && resolve(mirrorPath) !== receiptPath) {
  let mirrored
  try {
    mirrored = readJsonFile(mirrorPath, "mirrored cloud receipt")
  } catch (error) {
    fail(2, error.message)
  }
  const mismatched = ["taskId", "environmentId", "repositoryKey", "baseSha", "worktree"].filter((field) => mirrored[field] !== receipt[field])
  if (mismatched.length > 0) {
    fail(2, `mirrored cloud receipt changed immutable field(s): ${mismatched.join(", ")}`)
  }
  receipt = reconcileReceiptCopies(receipt, mirrored)
}
receipt = persistConfiguredReceipt(receipt)
if (receipt.materialized) {
  fail(2, `task ${receipt.taskId} was already materialized at ${receipt.materialized.at}; cloud apply was not run`)
}

const git = (args) => spawnSync("git", ["-C", worktree, ...args], { encoding: "utf8", windowsHide: true })
const readLocalLanding = () => {
  const status = git(["status", "--porcelain"])
  if (status.error || status.status !== 0) fail(2, `could not read worktree status: ${(status.stderr || status.error?.message || "unknown error").trim()}`)
  const head = git(["rev-parse", "HEAD"])
  if (head.error || head.status !== 0) fail(2, `could not read worktree HEAD: ${(head.stderr || head.error?.message || "unknown error").trim()}`)
  const stagedStat = git(["diff", "--cached", "--stat"])
  const stagedDiff = git(["diff", "--cached", "--quiet", "--exit-code"])
  const stagedPatch = git(["diff", "--cached", "--binary"])
  if (
    stagedStat.error || stagedStat.status !== 0 ||
    stagedDiff.error || ![0, 1].includes(stagedDiff.status) ||
    stagedPatch.error || stagedPatch.status !== 0
  ) {
    fail(1, "the local Git landing could not be read", "REPORT_FAILED")
  }
  return { head, status, stagedStat, stagedDiff, stagedPatch }
}

const assertExpectedLanding = (landing) => {
  if (landing.head.stdout.trim() !== receipt.baseSha) {
    fail(
      7,
      `cloud apply moved HEAD from receipt base SHA ${receipt.baseSha} to ${landing.head.stdout.trim()}`,
      "APPLY_MOVED_HEAD",
    )
  }
  if (landing.stagedDiff.status === 0 || landing.stagedStat.stdout.trim().length === 0) {
    fail(7, "cloud apply exited successfully but produced no staged diff", "APPLY_NO_CHANGES")
  }
  const unexpectedStatus = landing.status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !/^[MADRCT] /.test(line))
  if (unexpectedStatus.length > 0) {
    fail(
      7,
      `cloud apply left changes outside the expected staged-only shape:\n${unexpectedStatus.join("\n")}`,
      "APPLY_INVALID_SHAPE",
    )
  }
}

const assertCleanPreconditionsOrReadRecovery = () => {
  const landing = readLocalLanding()
  if (landing.status.stdout.length === 0) {
    if (landing.head.stdout.trim() !== receipt.baseSha) {
      fail(2, `worktree HEAD ${landing.head.stdout.trim()} does not equal receipt base SHA ${receipt.baseSha}; cloud apply was not run`)
    }
    return null
  }
  if (!existsSync(recoveryPath)) {
    fail(2, `worktree is dirty; cloud apply was not run:\n${landing.status.stdout.trimEnd()}`)
  }
  const recovery = readJsonFile(recoveryPath, "cloud materialization recovery marker")
  const mismatched = ["taskId", "baseSha", "worktree"].filter((field) => recovery[field] !== receipt[field])
  if (mismatched.length > 0) {
    fail(2, `cloud materialization recovery marker changed immutable field(s): ${mismatched.join(", ")}`)
  }
  if (typeof (recovery.attemptedAt ?? recovery.at) !== "string") {
    fail(2, "cloud materialization recovery marker carries no apply attempt timestamp")
  }
  assertExpectedLanding(landing)
  const stagedDiffSha256 = createHash("sha256").update(landing.stagedPatch.stdout).digest("hex")
  if (recovery.stagedDiffSha256 && recovery.stagedDiffSha256 !== stagedDiffSha256) {
    fail(2, "the staged diff no longer matches the cloud materialization recovery marker; leave the worktree unchanged for recovery")
  }
  return recovery
}

const recovery = assertCleanPreconditionsOrReadRecovery()

const codexCommand = config.workers.codex?.command
if (typeof codexCommand !== "string" || codexCommand.length === 0) fail(2, ".claude/orchestrator.json declares no codex command")
const codexTimeoutMs = config.timeouts.cloudCommandMinutes * 60 * 1000

try {
  let tasks
  try {
    tasks = await listCloudTasks(codexCommand, receipt.environmentId, { cwd: stateRoot, timeoutMs: codexTimeoutMs })
  } catch (error) {
    if (error instanceof CodexTimeoutError) fail(6, error.message)
    fail(1, error.message)
  }
  const task = tasks.find((candidate) => candidate.id === receipt.taskId)
  try {
    receipt = refreshReceipt(receipt, task)
  } catch (error) {
    fail(2, error.message)
  }
  receipt = persistConfiguredReceipt(receipt)

  if (recovery) {
    const recoveredLanding = readLocalLanding()
    assertExpectedLanding(recoveredLanding)
    const stagedDiffSha256 = createHash("sha256").update(recoveredLanding.stagedPatch.stdout).digest("hex")
    if (recovery.stagedDiffSha256 && recovery.stagedDiffSha256 !== stagedDiffSha256) {
      fail(2, "the staged diff changed during cloud materialization recovery; receipt was not updated")
    }
    const recoveredAt = recovery.materializedAt ?? recovery.at ?? new Date().toISOString()
    receipt.materialized = {
      at: recoveredAt,
      status: recoveredLanding.status.stdout,
      stagedStat: recoveredLanding.stagedStat.stdout,
    }
    receipt = persistConfiguredReceipt(receipt, true)
    unlinkSync(recoveryPath)
    console.log(JSON.stringify({
      outcome: "MATERIALIZED",
      recovered: true,
      taskId: receipt.taskId,
      worktree,
      status: recoveredLanding.status.stdout,
      stagedStat: recoveredLanding.stagedStat.stdout,
    }))
    process.exit(0)
  }

  if (task?.status === "error") {
    recordUnusableReceipt(task.status, "task failed")
    fail(3, `cloud task ${receipt.taskId} failed; no diff will exist`, "CLOUD_TASK_ERROR")
  }
  if (task?.status === "applied") {
    recordUnusableReceipt(task.status, "task was already applied elsewhere")
    fail(3, `cloud task ${receipt.taskId} was already applied elsewhere; it will not be applied again`, "CLOUD_TASK_APPLIED")
  }
  if (receipt.abandoned && !allowAbandoned) {
    fail(5, `task ${receipt.taskId} was abandoned at ${receipt.abandoned.at}; late results are quarantined`, "ABANDONED")
  }
  if (!task) fail(3, `task ${receipt.taskId} was not returned by codex cloud list`, "NOT_LISTED")
  if (task.status !== "ready") fail(3, `task ${receipt.taskId} is ${task.status}`, "PENDING")
  if (task.summary.files_changed === 0) {
    recordUnusableReceipt(task.status, "ready task committed no files")
    fail(
      4,
      `task ${receipt.taskId} reached ready with summary.files_changed == 0; inspect the task page for a blocked container commit`,
      "READY_WITHOUT_COMMIT",
    )
  }

  const cleanLanding = readLocalLanding()
  if (cleanLanding.status.stdout.length > 0) {
    fail(2, `worktree became dirty before cloud apply; cloud apply was not run:\n${cleanLanding.status.stdout.trimEnd()}`)
  }
  if (cleanLanding.head.stdout.trim() !== receipt.baseSha) {
    fail(2, `worktree HEAD ${cleanLanding.head.stdout.trim()} does not equal receipt base SHA ${receipt.baseSha}; cloud apply was not run`)
  }
  const codexDiagnosticPath = resolve(worktree, CODEX_DIAGNOSTIC_FILENAME)
  const codexDiagnosticExisted = existsSync(codexDiagnosticPath)
  const applyAttemptedAt = new Date().toISOString()
  recordApplyAttempt(applyAttemptedAt)
  const applied = await runCodex(codexCommand, ["cloud", "apply", receipt.taskId], {
    cwd: worktree,
    timeoutMs: codexTimeoutMs,
  })
  if (!codexDiagnosticExisted && existsSync(codexDiagnosticPath)) {
    try {
      unlinkSync(codexDiagnosticPath)
    } catch (error) {
      fail(1, `could not remove Codex diagnostic ${codexDiagnosticPath}: ${error.message}`, "CLEANUP_FAILED")
    }
  }
  if (applied.timedOut) {
    fail(6, `codex cloud apply timed out after ${codexTimeoutMs}ms`, "APPLY_TIMEOUT")
  }
  if (applied.error || applied.status !== 0) {
    fail(1, `codex cloud apply failed with exit ${applied.status ?? "spawn"}: ${(applied.stderr || applied.stdout || applied.error?.message || "unknown error").trim()}`, "APPLY_FAILED")
  }
  const landing = readLocalLanding()
  assertExpectedLanding(landing)
  const materializedAt = new Date().toISOString()
  try {
    persistReceipt({
      taskId: receipt.taskId,
      baseSha: receipt.baseSha,
      worktree: receipt.worktree,
      attemptedAt: applyAttemptedAt,
      materializedAt,
      stagedDiffSha256: createHash("sha256").update(landing.stagedPatch.stdout).digest("hex"),
    }, recoveryPath)
  } catch (error) {
    fail(
      1,
      `cloud apply succeeded and staged its diff, but the recovery marker update failed: ${error.message}. ` +
      `Leave the worktree unchanged and rerun with --receipt ${JSON.stringify(receiptPath)}`,
      "APPLIED_RECOVERY_MARKER_WRITE_FAILED",
    )
  }
  receipt.materialized = { at: materializedAt, status: landing.status.stdout, stagedStat: landing.stagedStat.stdout }
  receipt = persistConfiguredReceipt(receipt, true)
  unlinkSync(recoveryPath)
  console.log(JSON.stringify({
    outcome: "MATERIALIZED",
    taskId: receipt.taskId,
    worktree,
    status: landing.status.stdout,
    stagedStat: landing.stagedStat.stdout,
  }))
} finally {
  releaseLock()
}
