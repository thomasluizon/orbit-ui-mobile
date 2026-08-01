#!/usr/bin/env node
/**
 * Keep the launcher's completion authority outside the worker process. The worker receives only
 * the ticket pointer. This supervisor keeps the signing key in its own memory, starts the
 * configured headless engine after launch-worker has recorded the launch, and signs the exact
 * HEAD observed after that process exits.
 */

import { execFileSync, spawn } from "node:child_process"
import { createPrivateKey, sign } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"

import {
  recordWorkerLaunch,
  workerCompletionSigningPayload,
} from "./lib/worker-launch-provenance.mjs"

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

const removeIfPresent = (path) => {
  try {
    unlinkSync(path)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
}

const payload = JSON.parse(readFileSync(payloadPath, "utf8"))
const privateKeyPem = readFileSync(3, "utf8").trim()
const privateKey = createPrivateKey(privateKeyPem)

const waitForGate = (path, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs
  while (!existsSync(path) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
  }
  return existsSync(path)
}

const readHead = () => {
  try {
    const head = execFileSync("git", ["-C", payload.worktreePath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    return /^[0-9a-f]{40}$/.test(head) ? head : null
  } catch {
    return null
  }
}

const run = async () => {
  if (!waitForGate(payload.startGate)) return 3
  removeIfPresent(payload.startGate)
  const child = spawn(payload.executable, [...payload.scriptArgs, ...payload.engineArgs, payload.pointer], {
    cwd: payload.worktreePath,
    detached: false,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ORBIT_LAUNCH_WORKER: "1", ORBIT_WORKER_LAUNCH_ID: payload.launchRecord.launchId },
  })
  const result = await new Promise((resolve) => {
    child.once("error", () => resolve({ code: 1 }))
    child.once("close", (code) => resolve({ code: Number.isInteger(code) ? code : 1 }))
  })
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
  mkdirSync(dirname(payload.markerPath), { recursive: true })
  appendFileSync(payload.markerPath, `${JSON.stringify(completedRecord)}\n`, { encoding: "utf8", mode: 0o600 })
  recordWorkerLaunch(completedRecord, payload.ledgerPath)
  return result.code
}

try {
  const status = await run()
  removeIfPresent(payload.payloadPath)
  process.exitCode = status
} catch (error) {
  try {
    removeIfPresent(payload.startGate)
    removeIfPresent(payload.payloadPath)
  } catch {
    /* cleanup must not replace the supervisor failure */
  }
  console.error(`worker supervisor failed: ${error.message}`)
  process.exitCode = 3
}
