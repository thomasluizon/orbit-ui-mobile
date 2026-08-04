#!/usr/bin/env node
/**
 * Keep the launcher's per-launch signing authority outside the worker process. The worker receives
 * only the ticket pointer. This supervisor keeps the signing key in its own memory, starts the
 * configured headless engine after launch-worker has recorded the launch, and signs the exact HEAD
 * observed after that process exits.
 */

import { execFileSyncHidden as execFileSync, spawnHidden as spawn, spawnSyncHidden as spawnSync } from "./lib/subprocess-options.mjs"
import { createPrivateKey, sign } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs"
import { basename, dirname, join } from "node:path"

import {
  recordWorkerLaunch,
  sameWorkerSupervisorPayload,
  verifyWorkerLaunchRecord,
  workerCompletionSigningPayload,
} from "./lib/worker-launch-provenance.mjs"
import { minimalChildEnvironment } from "./lib/child-environment.mjs"

const USAGE = "usage: worker-supervisor.mjs <launcher-payload>"
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const payloadPath = process.argv[2]
if (!payloadPath || process.argv.length !== 3 || payloadPath.startsWith("-")) {
  console.error(USAGE)
  process.exit(2)
}

const payloadName = basename(payloadPath)
const payloadMatch = /^orbit-worker-(.+)\.json$/.exec(payloadName)
if (!payloadMatch) {
  console.error("launcher payload path does not carry a launch id")
  process.exit(2)
}
const startGate = join(dirname(payloadPath), `orbit-worker-${payloadMatch[1]}.ready`)

const removeIfPresent = (path) => {
  try {
    unlinkSync(path)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
}

const privateKeyPem = readFileSync(3, "utf8").trim()
const privateKey = createPrivateKey(privateKeyPem)
let payload = null
let supervisorEnvelope = null

const waitForGate = (path, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs
  while (!existsSync(path) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
  }
  return existsSync(path)
}

const readHead = () => {
  try {
    const head = execFileSync("git", ["-C", supervisorEnvelope.worktreePath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    return /^[0-9a-f]{40}$/.test(head) ? head : null
  } catch {
    return null
  }
}

const terminateProcessTree = (pid) => {
  if (!Number.isInteger(pid) || pid < 1) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8", windowsHide: true })
    return
  }
  try {
    process.kill(-pid, "SIGTERM")
  } catch (error) {
    if (error.code !== "ESRCH") throw error
    try {
      process.kill(pid, "SIGTERM")
    } catch (fallbackError) {
      if (fallbackError.code !== "ESRCH") throw fallbackError
    }
  }
}

const runChild = (envelope, environment) => new Promise((resolve) => {
  let timedOut = false
  let settled = false
  let deadlineTimer = null
  let killTimer = null
  const finish = (code) => {
    if (settled) return
    settled = true
    if (deadlineTimer) clearTimeout(deadlineTimer)
    if (killTimer) clearTimeout(killTimer)
    resolve({ code: timedOut ? 124 : code, timedOut })
  }
  let child
  try {
    child = spawn(envelope.executable, [...envelope.scriptArgs, ...envelope.engineArgs, envelope.pointer], {
      cwd: envelope.worktreePath,
      // The supervisor is already detached from the launcher. Keep the engine in its process
      // tree so Windows taskkill can terminate every descendant at the signed deadline.
      detached: false,
      stdio: "ignore",
      windowsHide: true,
      env: environment,
    })
  } catch {
    finish(1)
    return
  }
  child.once("error", () => finish(1))
  child.once("close", (code) => finish(Number.isInteger(code) ? code : 1))
  const remainingMs = Date.parse(envelope.deadlineAt) - Date.now()
  deadlineTimer = setTimeout(() => {
    timedOut = true
    try {
      terminateProcessTree(child.pid)
    } catch {
      /* The completion still fails closed with timeout 124. */
    }
    killTimer = setTimeout(() => finish(124), 10_000)
  }, Math.max(1, remainingMs))
})

const run = async () => {
  if (!waitForGate(startGate)) return 3
  payload = JSON.parse(readFileSync(payloadPath, "utf8"))
  if (!verifyWorkerLaunchRecord(payload.launchRecord)) throw new Error("launcher payload is not root-authenticated")
  if (!sameWorkerSupervisorPayload(payload, payload.launchRecord)) throw new Error("launcher supervisor payload does not match its authenticated envelope")
  supervisorEnvelope = payload.launchRecord.supervisorEnvelope
  if (supervisorEnvelope.payloadPath !== payloadPath || supervisorEnvelope.startGate !== startGate) {
    throw new Error("launcher supervisor envelope does not match its payload path")
  }
  removeIfPresent(startGate)
  const workerEnvironment = minimalChildEnvironment("worker", {
    ...process.env,
    ORBIT_LAUNCH_WORKER: "1",
    ORBIT_WORKER_LAUNCH_ID: payload.launchRecord.launchId,
  })
  if (Date.parse(supervisorEnvelope.deadlineAt) <= Date.now()) {
    const completion = {
      completedAt: new Date().toISOString(),
      completedHead: readHead(),
      exitCode: 124,
    }
    completion.signature = sign(
      null,
      Buffer.from(workerCompletionSigningPayload(payload.launchRecord, completion), "utf8"),
      privateKey,
    ).toString("base64")
    const completedRecord = { ...payload.launchRecord, completion }
    mkdirSync(dirname(supervisorEnvelope.markerPath), { recursive: true })
    appendFileSync(supervisorEnvelope.markerPath, `${JSON.stringify(completedRecord)}\n`, { encoding: "utf8", mode: 0o600 })
    recordWorkerLaunch(completedRecord, supervisorEnvelope.ledgerPath)
    return 124
  }
  const result = await runChild(supervisorEnvelope, workerEnvironment)
  const completion = {
    completedAt: new Date().toISOString(),
    completedHead: readHead(),
    exitCode: result.code,
  }
  completion.signature = sign(
    null,
    Buffer.from(workerCompletionSigningPayload(payload.launchRecord, completion), "utf8"),
    privateKey,
  ).toString("base64")
  const completedRecord = { ...payload.launchRecord, completion }
  mkdirSync(dirname(supervisorEnvelope.markerPath), { recursive: true })
  appendFileSync(supervisorEnvelope.markerPath, `${JSON.stringify(completedRecord)}\n`, { encoding: "utf8", mode: 0o600 })
  recordWorkerLaunch(completedRecord, supervisorEnvelope.ledgerPath)
  return result.code
}

try {
  const status = await run()
  removeIfPresent(payloadPath)
  process.exitCode = status
} catch (error) {
  try {
    removeIfPresent(startGate)
    removeIfPresent(payloadPath)
  } catch {
    /* cleanup must not replace the supervisor failure */
  }
  console.error(`worker supervisor failed: ${error.message}`)
  process.exitCode = 3
}
