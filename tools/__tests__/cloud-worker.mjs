import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"

import { T, realOrchestratorConfig, root, stage, toolPath } from "./_harness.mjs"

const task = (id, status, filesChanged, updatedAt = "2026-08-31T17:09:28.437758900Z") => ({
  id,
  url: `https://chatgpt.com/codex/tasks/${id}`,
  title: "measured task",
  status,
  updated_at: updatedAt,
  environment_id: null,
  environment_label: "thomasluizon/orbit-ui-mobile",
  summary: { files_changed: filesChanged, lines_added: filesChanged, lines_removed: 0 },
  is_review: false,
  attempt_total: 1,
})

export const fakeCodex = (label) => {
  const directory = join(root, "cloud-codex", label)
  mkdirSync(directory, { recursive: true })
  const script = join(directory, "fake-codex.js")
  writeFileSync(
    script,
    `#!/usr/bin/env node
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
const args = process.argv.slice(2)
if (process.env.ORBIT_FAKE_CODEX_LOG) appendFileSync(process.env.ORBIT_FAKE_CODEX_LOG, JSON.stringify(args) + "\\n")
if (process.env.ORBIT_FAKE_CODEX_CWD_LOG) appendFileSync(process.env.ORBIT_FAKE_CODEX_CWD_LOG, process.cwd() + "\\n")
if (process.env.ORBIT_FAKE_CODEX_WRITES_ERROR_LOG) writeFileSync("error.log", "Codex CLI diagnostic\\n")
if (process.env.ORBIT_FAKE_APPLY_UNTRACKED_PATH && args[1] === "apply") writeFileSync(process.env.ORBIT_FAKE_APPLY_UNTRACKED_PATH, "unexpected\\n")
if (process.env.ORBIT_FAKE_HANG === args[1]) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
if (args[0] === "cloud" && args[1] === "exec") {
  const query = readFileSync(0, "utf8")
  if (process.env.ORBIT_FAKE_STDIN_LOG) writeFileSync(process.env.ORBIT_FAKE_STDIN_LOG, query)
  if (process.env.ORBIT_FAKE_ACCEPTANCE_LOG) writeFileSync(process.env.ORBIT_FAKE_ACCEPTANCE_LOG, process.env.ORBIT_FAKE_EXEC_URL || "accepted")
  if (process.env.ORBIT_FAKE_HANG_AFTER_ACCEPTANCE === "exec") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  const delayMs = Number(process.env.ORBIT_FAKE_EXEC_DELAY_MS || 0)
  if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
  process.stdout.write(process.env.ORBIT_FAKE_EXEC_URL || "")
}
else if (args[0] === "cloud" && args[1] === "list") {
  const delayMs = Number(process.env.ORBIT_FAKE_LIST_DELAY_MS || 0)
  if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
  if (process.env.ORBIT_FAKE_LIST_PUBLICATION_PATH) {
    writeFileSync(process.env.ORBIT_FAKE_LIST_PUBLICATION_PATH, process.env.ORBIT_FAKE_LIST_PUBLICATION_JSON)
  }
  if (process.env.ORBIT_FAKE_LIST_SEQUENCE) {
    const sequence = JSON.parse(process.env.ORBIT_FAKE_LIST_SEQUENCE)
    const index = Number(readFileSync(process.env.ORBIT_FAKE_LIST_INDEX_PATH, "utf8") || 0)
    writeFileSync(process.env.ORBIT_FAKE_LIST_INDEX_PATH, String(index + 1))
    process.stdout.write(sequence[Math.min(index, sequence.length - 1)])
  } else process.stdout.write(process.env.ORBIT_FAKE_LIST || '{"tasks":[],"cursor":null}')
}
else if (args[0] === "cloud" && args[1] === "diff") {
  if (process.env.ORBIT_FAKE_DIFF_FAILURE) {
    process.stderr.write(process.env.ORBIT_FAKE_DIFF_FAILURE)
    process.exit(1)
  }
  if (process.env.ORBIT_FAKE_DIFF === undefined) {
    process.stderr.write("Error: No diff available for task " + args[2] + "; it may still be running.\\n")
    process.exit(1)
  }
  process.stdout.write(process.env.ORBIT_FAKE_DIFF)
}
else if (args[0] === "cloud" && args[1] === "apply") {
  if (process.env.ORBIT_FAKE_APPLY_MODE === "noop") process.exit(0)
  if (process.env.ORBIT_FAKE_APPLY_MODE === "fail-noop") process.exit(23)
  if (process.env.ORBIT_FAKE_APPLY_MODE === "move-head") {
    const committed = spawnSync("git", ["commit", "--allow-empty", "-q", "-m", "fake apply moved head"], { encoding: "utf8" })
    process.exit(committed.status || 0)
  }
  const path = process.env.ORBIT_FAKE_APPLY_PATH || "cloud-landed.txt"
  const contents = process.env.ORBIT_FAKE_APPLY_MODE === "large"
    ? "x".repeat(2 * 1024 * 1024)
    : "landed from cloud\\n"
  writeFileSync(path, contents)
  const added = spawnSync("git", ["add", "--", path], { encoding: "utf8" })
  if (process.env.ORBIT_FAKE_APPLY_RECEIPT_LOCK_PATH) {
    mkdirSync(process.env.ORBIT_FAKE_APPLY_RECEIPT_LOCK_PATH, { recursive: true })
    writeFileSync(
      process.env.ORBIT_FAKE_APPLY_RECEIPT_LOCK_PATH + "/owner.json",
      JSON.stringify({ pid: Number(process.env.ORBIT_FAKE_RECEIPT_LOCK_OWNER_PID) }),
    )
  }
  if (process.env.ORBIT_FAKE_APPLY_MODE === "partial-fail") process.exit(23)
  if (process.env.ORBIT_FAKE_HANG_AFTER_APPLY === "apply") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  process.exit(added.status || 0)
} else process.exit(7)
`,
  )
  if (process.platform === "win32") {
    const shim = join(directory, "codex.cmd")
    writeFileSync(shim, `@echo off\r\n"%_prog%"  "%dp0%\\fake-codex.js" %*\r\n`)
    return { command: shim, script }
  }
  chmodSync(script, 0o755)
  return { command: script, script }
}

export const cloudConfig = (command, overrides = {}) => {
  const real = structuredClone(overrides.real)
  real.workers.codex.command = command
  real.cloud = { environmentId: "env-measured", repositoryKey: "ui" }
  real.caps.cloudParallelTasks = overrides.cloudParallelTasks ?? 4
  real.timeouts.cloudCeilingMinutes = overrides.cloudCeilingMinutes ?? 45
  real.timeouts.cloudCommandMinutes = overrides.cloudCommandMinutes ?? 10
  real.timeouts.receiptLockSeconds = overrides.receiptLockSeconds ?? real.timeouts.receiptLockSeconds
  return real
}

export const taskPage = (tasks) => JSON.stringify({ tasks, cursor: null }, null, 2)
export { task }

export const cases = async () => {
  const cloud = await import(pathToFileURL(toolPath("lib/cloud-worker.mjs")).href)
  const order = "Implement the ticket.\n"
  const completed = cloud.cloudOrder(order)
  T(
    "cloud-worker.mjs: every submitted order ends with the cloud commit and delivery contract",
    completed.endsWith(`${cloud.CLOUD_FINISHING_CONTRACT}\n`) && completed.includes("Without a commit there is no diff"),
    completed,
  )
  T(
    "cloud-worker.mjs: an existing finishing contract is not duplicated",
    cloud.cloudOrder(completed).split("## Cloud finishing contract").length === 2,
    cloud.cloudOrder(completed),
  )

  const parsed = cloud.parseTaskList(taskPage([task("task_e_a1", "pending", 0)]))
  T(
    "cloud-worker.mjs: pretty-printed list JSON is parsed as one document",
    parsed.tasks.length === 1 && parsed.tasks[0].environment_id === null && parsed.cursor === null,
    JSON.stringify(parsed),
  )

  let unknownStatusMessage = ""
  try {
    cloud.parseTaskList(taskPage([task("task_e_a9", "unknown", 0)]))
  } catch (error) {
    unknownStatusMessage = error.message
  }
  T(
    "cloud-worker.mjs: a status outside the Codex TaskStatus type still fails loudly",
    /returned unmeasured status "unknown"/.test(unknownStatusMessage),
    unknownStatusMessage,
  )

  for (const [label, updatedAt] of [["missing", undefined], ["unparseable", "not-a-timestamp"]]) {
    const invalidTask = task("task_e_a2", "pending", 0)
    if (updatedAt === undefined) delete invalidTask.updated_at
    else invalidTask.updated_at = updatedAt
    let validationMessage = ""
    try {
      cloud.parseTaskList(taskPage([invalidTask]))
    } catch (error) {
      validationMessage = error.message
    }
    T(
      `cloud-worker.mjs: ${label} updated_at fails closed`,
      /no parseable ISO updated_at timestamp/.test(validationMessage),
      validationMessage,
    )
  }

  const codex = fakeCodex("list-page-size")
  const invocationLog = stage("cloud-worker/list-page-size.jsonl", "")
  await cloud.listCloudTasks(codex.command, "env-measured", {
    timeoutMs: 5000,
    env: {
      ...process.env,
      ORBIT_FAKE_CODEX_LOG: invocationLog,
      ORBIT_FAKE_LIST: taskPage([]),
    },
  })
  const listArguments = JSON.parse(readFileSync(invocationLog, "utf8").trim())
  const limitIndex = listArguments.indexOf("--limit")
  const limit = Number(listArguments[limitIndex + 1])
  T(
    "cloud-worker.mjs: cloud list requests a CLI-supported positive page size",
    limitIndex !== -1 && Number.isInteger(limit) && limit > 0 && limit <= 20,
    JSON.stringify(listArguments),
  )

  const receipt = {
    taskId: "task_e_a1",
    deadline: "2026-08-31T18:00:00.000Z",
  }
  const abandoned = cloud.refreshReceipt(receipt, task("task_e_a1", "pending", 0), new Date("2026-08-31T18:00:01.000Z"))
  T(
    "cloud-worker.mjs: a pending task past its one wall clock deadline becomes locally abandoned",
    abandoned.abandoned?.lastObservedStatus === "pending" && abandoned.terminal === undefined,
    JSON.stringify(abandoned),
  )
  const late = cloud.refreshReceipt(
    abandoned,
    task("task_e_a1", "ready", 2, "2026-08-31T17:30:00.000Z"),
    new Date("2026-08-31T18:05:00.000Z"),
  )
  T(
    "cloud-worker.mjs: a late ready result remains abandoned and is recorded for quarantine",
    late.abandoned !== undefined && late.lateTerminal?.status === "ready" && late.lateTerminal.summary.files_changed === 2,
    JSON.stringify(late),
  )
  const firstReadyObservation = cloud.refreshReceipt(
    receipt,
    task("task_e_a1", "ready", 2, "2026-08-31T18:30:00.000Z"),
    new Date("2026-08-31T17:59:00.000Z"),
  )
  const observedOnTime = cloud.refreshReceipt(
    firstReadyObservation,
    task("task_e_a1", "ready", 2, "2026-08-31T19:30:00.000Z"),
    new Date("2026-08-31T19:00:00.000Z"),
  )
  T(
    "cloud-worker.mjs: a first ready observation before the deadline remains on time after later refreshes",
    observedOnTime.abandoned === undefined &&
      observedOnTime.firstReadyObservedAt === "2026-08-31T17:59:00.000Z" &&
      observedOnTime.terminal?.at === "2026-08-31T17:59:00.000Z" &&
      observedOnTime.terminal?.observedAt === "2026-08-31T19:00:00.000Z" &&
      observedOnTime.lastObserved?.updatedAt === "2026-08-31T19:30:00.000Z",
    JSON.stringify(observedOnTime),
  )
  const firstSeenLate = cloud.refreshReceipt(
    receipt,
    task("task_e_a1", "ready", 2, "2026-08-31T17:30:00.000Z"),
    new Date("2026-08-31T18:05:00.000Z"),
  )
  T(
    "cloud-worker.mjs: a first ready observation after the deadline is abandoned and quarantined",
    firstSeenLate.abandoned?.lastObservedStatus === "ready" &&
      firstSeenLate.firstReadyObservedAt === "2026-08-31T18:05:00.000Z" &&
      firstSeenLate.terminal?.updatedAt === "2026-08-31T17:30:00.000Z" &&
      firstSeenLate.lateTerminal?.at === "2026-08-31T18:05:00.000Z",
    JSON.stringify(firstSeenLate),
  )
  const materialized = cloud.refreshReceipt(
    {
      ...receipt,
      materialized: { at: "2026-08-31T17:45:00.000Z", status: "M  landed.txt\n", stagedStat: "1 file changed\n" },
    },
    task("task_e_a1", "pending", 0),
    new Date("2026-08-31T18:05:00.000Z"),
  )
  T(
    "cloud-worker.mjs: a successfully materialized receipt is never abandoned by a later refresh",
    materialized.abandoned === undefined && materialized.materialized?.at === "2026-08-31T17:45:00.000Z",
    JSON.stringify(materialized),
  )
  const fleet = cloud.refreshReceipts(
    [receipt, { ...receipt, taskId: "task_e_b2", deadline: "2026-08-31T17:00:00.000Z" }],
    [task("task_e_a1", "pending", 0), task("task_e_b2", "pending", 0)],
    new Date("2026-08-31T17:30:00.000Z"),
  )
  T(
    "cloud-worker.mjs: local abandonment keeps a remote pending task in fleet capacity and ticket admission",
    fleet.inFlight.map((entry) => entry.taskId).join(",") === "task_e_a1,task_e_b2" &&
      cloud.receiptBlocksTicketAdmission(fleet.receipts[1]),
    JSON.stringify(fleet),
  )
  T(
    "cloud-worker.mjs: terminal observation releases an abandoned task from Cloud ownership",
    !cloud.receiptConsumesFleetCapacity(late) && !cloud.receiptBlocksTicketAdmission(late),
    JSON.stringify(late),
  )
  const readyReceipt = cloud.refreshReceipt(
    { ...receipt, taskId: "task_e_b3" },
    task("task_e_b3", "ready", 1),
    new Date("2026-08-31T17:30:00.000Z"),
  )
  T(
    "cloud-worker.mjs: ready releases fleet capacity but still blocks same ticket admission",
    !cloud.receiptConsumesFleetCapacity(readyReceipt) && cloud.receiptBlocksTicketAdmission(readyReceipt),
    JSON.stringify(readyReceipt),
  )
  const terminalFleet = cloud.refreshReceipts(
    [
      { ...receipt, taskId: "task_e_c4" },
      { ...receipt, taskId: "task_e_d5" },
    ],
    [task("task_e_c4", "applied", 2), task("task_e_d5", "error", 0)],
    new Date("2026-08-31T17:30:00.000Z"),
  )
  T(
    "cloud-worker.mjs: applied and error both become terminal and release fleet capacity",
    terminalFleet.receipts[0].terminal?.status === "applied" &&
      terminalFleet.receipts[1].terminal?.status === "error" &&
      terminalFleet.inFlight.length === 0,
    JSON.stringify(terminalFleet),
  )
  const reservation = cloud.refreshReceipts(
    [{
      kind: "submission-reservation",
      reservationId: "00000000-0000-0000-0000-000000000001",
      submissionState: "submitting",
      ticket: "#398",
    }],
    [],
    new Date("2026-08-31T19:00:00.000Z"),
  )
  T(
    "cloud-worker.mjs: an interrupted submission becomes durable uncertainty and remains in flight",
    reservation.inFlight.length === 1 &&
      reservation.receipts[0].submissionState === "unknown" &&
      reservation.receipts[0].unknownAt === "2026-08-31T19:00:00.000Z",
    JSON.stringify(reservation),
  )
  T(
    "cloud-worker.mjs: a human released reservation no longer consumes capacity or blocks its ticket",
    !cloud.receiptConsumesFleetCapacity({ ...reservation.receipts[0], released: { at: "2026-08-31T19:05:00.000Z" } }) &&
      !cloud.receiptBlocksTicketAdmission({ ...reservation.receipts[0], released: { at: "2026-08-31T19:05:00.000Z" } }),
    JSON.stringify(reservation),
  )

  const interruptedMirror = stage("cloud-worker/interrupted-mirror.json", "{}\n")
  const blockedReplicaParent = stage("cloud-worker/blocked-replica", "not a directory\n")
  const recoveryState = {
    taskId: "task_e_a1",
    abandoned: { at: "2026-08-31T18:00:00.000Z", lastObservedStatus: "pending" },
    terminal: { at: "2026-08-31T17:59:00.000Z", observedAt: "2026-08-31T18:01:00.000Z", status: "ready" },
    materialized: { at: "2026-08-31T18:02:00.000Z", status: "M  landed.txt\n", stagedStat: "1 file changed\n" },
  }
  let replicaFailure = ""
  try {
    cloud.persistReceipt(recoveryState, interruptedMirror, [join(blockedReplicaParent, "receipt.json")])
  } catch (error) {
    replicaFailure = error.message
  }
  const recovered = JSON.parse(readFileSync(interruptedMirror, "utf8"))
  T(
    "cloud-worker.mjs: an interruption before the replica write leaves every recovery marker in the mirror",
    replicaFailure.length > 0 &&
      recovered.abandoned?.at === recoveryState.abandoned.at &&
      recovered.terminal?.observedAt === recoveryState.terminal.observedAt &&
      recovered.materialized?.at === recoveryState.materialized.at,
    `${replicaFailure}\n${JSON.stringify(recovered)}`,
  )

  const reconciled = cloud.reconcileReceiptCopies(
    recoveryState,
    { taskId: recoveryState.taskId },
  )
  T(
    "cloud-worker.mjs: a stale mirror cannot erase newer scratch recovery markers",
    reconciled.abandoned?.at === recoveryState.abandoned.at &&
      reconciled.terminal?.at === recoveryState.terminal.at &&
      reconciled.terminal?.observedAt === recoveryState.terminal.observedAt &&
      reconciled.materialized?.at === recoveryState.materialized.at,
    JSON.stringify(reconciled),
  )

  const onTimeReady = {
    taskId: "task_e_a2",
    deadline: "2026-08-31T18:00:00.000Z",
    firstReadyObservedAt: "2026-08-31T17:59:00.000Z",
    terminal: { at: "2026-08-31T17:59:00.000Z", observedAt: "2026-08-31T17:59:00.000Z", status: "ready" },
  }
  const staleAbandonment = {
    taskId: "task_e_a2",
    deadline: "2026-08-31T18:00:00.000Z",
    abandoned: { at: "2026-08-31T18:01:00.000Z", lastObservedStatus: "pending" },
  }
  for (const [label, first, second] of [
    ["ready then abandonment", onTimeReady, staleAbandonment],
    ["abandonment then ready", staleAbandonment, onTimeReady],
  ]) {
    const deadlineMirror = stage(`cloud-worker/${label.replaceAll(" ", "-")}.json`, `${JSON.stringify(first)}\n`)
    const deadlineResult = cloud.persistReconciledReceipt(second, deadlineMirror, [], { lockTimeoutMs: 1000 })
    T(
      `cloud-worker.mjs: ${label} reconciliation keeps the on-time terminal classification`,
      deadlineResult.firstReadyObservedAt === onTimeReady.firstReadyObservedAt &&
        deadlineResult.terminal?.at === onTimeReady.terminal.at &&
        deadlineResult.abandoned === undefined &&
        deadlineResult.lateTerminal === undefined,
      JSON.stringify(deadlineResult),
    )
  }

  const writerDirectory = join(root, "cloud-worker", "interleaved-receipt-writers")
  mkdirSync(writerDirectory, { recursive: true })
  const interleavedMirror = join(writerDirectory, "task_e_a3.json")
  const writerScript = stage(
    "cloud-worker/interleaved-receipt-writer.mjs",
    `import { parentPort, workerData } from "node:worker_threads"
const cloud = await import(${JSON.stringify(pathToFileURL(toolPath("lib/cloud-worker.mjs")).href)})
const signal = new Int32Array(workerData.signal)
const receipt = {
  ...workerData.receipt,
  get interleave() {
    parentPort.postMessage("inside persistence")
    while (Atomics.load(signal, 0) === 0) Atomics.wait(signal, 0, 0)
    return "released"
  },
}
cloud.persistReconciledReceipt(receipt, workerData.mirrorPath, [], { lockTimeoutMs: workerData.lockTimeoutMs })
`,
  )
  const receiptLockTimeoutMs = realOrchestratorConfig().timeouts.receiptLockSeconds * 1000
  const firstSignal = new SharedArrayBuffer(4)
  const secondSignal = new SharedArrayBuffer(4)
  const startWriter = (receiptValue, signal) => {
    const worker = new Worker(writerScript, {
      workerData: { mirrorPath: interleavedMirror, receipt: receiptValue, signal, lockTimeoutMs: receiptLockTimeoutMs },
    })
    return {
      inside: new Promise((resolveMessage, rejectMessage) => {
        worker.once("message", resolveMessage)
        worker.once("error", rejectMessage)
      }),
      exited: new Promise((resolveExit, rejectExit) => {
        worker.once("error", rejectExit)
        worker.once("exit", resolveExit)
      }),
    }
  }
  const releaseWriter = (signal) => {
    const view = new Int32Array(signal)
    Atomics.store(view, 0, 1)
    Atomics.notify(view, 0)
  }
  const firstWriter = startWriter({
    taskId: "task_e_a3",
    terminal: { at: "2026-08-31T17:59:00.000Z", observedAt: "2026-08-31T18:01:00.000Z", status: "ready" },
  }, firstSignal)
  await firstWriter.inside
  const secondWriter = startWriter({
    taskId: "task_e_a3",
    firstReadyObservedAt: "2026-08-31T17:59:00.000Z",
    materialized: { at: "2026-08-31T18:02:00.000Z", status: "M  landed.txt\n", stagedStat: "1 file changed\n" },
  }, secondSignal)
  const secondEnteredUnlockedPersistence = await Promise.race([
    secondWriter.inside.then(() => true),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 500)),
  ])
  if (secondEnteredUnlockedPersistence) {
    releaseWriter(secondSignal)
    await secondWriter.exited
    releaseWriter(firstSignal)
    await firstWriter.exited
  } else {
    releaseWriter(firstSignal)
    await firstWriter.exited
    await secondWriter.inside
    releaseWriter(secondSignal)
    await secondWriter.exited
  }
  const interleavedReceipt = JSON.parse(readFileSync(interleavedMirror, "utf8"))
  T(
    "cloud-worker.mjs: overlapping receipt writers preserve both publications",
    interleavedReceipt.terminal?.observedAt === "2026-08-31T18:01:00.000Z" &&
      interleavedReceipt.firstReadyObservedAt === "2026-08-31T17:59:00.000Z" &&
      interleavedReceipt.materialized?.at === "2026-08-31T18:02:00.000Z",
    JSON.stringify(interleavedReceipt),
  )

  const liveOwnerDirectory = join(root, "cloud-worker", "live-receipt-lock-owner")
  const liveOwnerMirror = join(liveOwnerDirectory, "receipts", "task_e_a4.json")
  const liveOwnerLock = join(liveOwnerDirectory, "receipt-task_e_a4.json.lock")
  mkdirSync(liveOwnerLock, { recursive: true })
  writeFileSync(
    join(liveOwnerLock, "owner.json"),
    `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`,
  )
  const blockedWriterScript = stage(
    "cloud-worker/blocked-receipt-writer.mjs",
    `import { parentPort, workerData } from "node:worker_threads"
const cloud = await import(${JSON.stringify(pathToFileURL(toolPath("lib/cloud-worker.mjs")).href)})
const startedAt = performance.now()
try {
  cloud.persistReconciledReceipt({ taskId: "task_e_a4" }, workerData.mirrorPath, [], {
    lockTimeoutMs: workerData.lockTimeoutMs,
  })
  parentPort.postMessage({ outcome: "acquired" })
} catch (error) {
  parentPort.postMessage({
    outcome: "failed",
    name: error.name,
    code: error.code,
    timeoutMs: error.timeoutMs,
    ownerPid: error.ownerPid,
    elapsedMs: performance.now() - startedAt,
  })
}
`,
  )
  const blockedWriter = new Worker(blockedWriterScript, {
    workerData: { mirrorPath: liveOwnerMirror, lockTimeoutMs: receiptLockTimeoutMs },
  })
  const blockedResult = await Promise.race([
    new Promise((resolveMessage, rejectMessage) => {
      blockedWriter.once("message", resolveMessage)
      blockedWriter.once("error", rejectMessage)
    }),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(null), receiptLockTimeoutMs + 1000)),
  ])
  if (blockedResult === null) await blockedWriter.terminate()
  T(
    "cloud-worker.mjs: a receipt lock naming a live owner fails within its configured bound",
    blockedResult?.outcome === "failed" &&
      blockedResult.name === "ReceiptLockTimeoutError" &&
      blockedResult.code === "RECEIPT_LOCK_TIMEOUT" &&
      blockedResult.timeoutMs === receiptLockTimeoutMs &&
      blockedResult.ownerPid === process.pid &&
      blockedResult.elapsedMs >= receiptLockTimeoutMs &&
      blockedResult.elapsedMs < receiptLockTimeoutMs + 500,
    JSON.stringify(blockedResult),
  )

  const badShim = stage("cloud-worker/bad-codex.cmd", "@echo off\r\nexit /b 0\r\n")
  let message = ""
  try {
    cloud.resolveCodexCommand(badShim)
  } catch (error) {
    message = error.message
  }
  T(
    "cloud-worker.mjs: an unrecognised Windows shim shape fails closed",
    /no "%dp0%\.\.\.js" script line was found/.test(message),
    message,
  )

  const hanging = fakeCodex("bounded-list")
  const timed = await cloud.runCodex(hanging.command, ["cloud", "list"], {
    timeoutMs: 250,
    env: { ...process.env, ORBIT_FAKE_HANG: "list" },
  })
  T(
    "cloud-worker.mjs: a stalled Codex child returns a distinct timeout result",
    timed.timedOut && timed.status !== 0,
    JSON.stringify(timed),
  )
}
