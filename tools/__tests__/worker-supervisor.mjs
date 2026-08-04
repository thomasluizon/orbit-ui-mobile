import { generateKeyPairSync } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  signWorkerLaunchRecord,
  WORKER_SUPERVISOR_ENVELOPE_VERSION,
} from "../lib/worker-launch-provenance.mjs"
import { spawnHidden as spawn } from "../lib/subprocess-options.mjs"
import {
  REPO_ROOT,
  T,
  WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY_ENV,
  WORKER_LAUNCH_LEDGER,
  check,
  root,
} from "./_harness.mjs"

const readRows = (path) => (existsSync(path)
  ? readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : [])

const launchSupervisor = (payloadPath, privateKey) => {
  const environment = { ...process.env, ORBIT_WORKER_LAUNCH_LEDGER: WORKER_LAUNCH_LEDGER }
  delete environment[WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY_ENV]
  const child = spawn(process.execPath, [join(REPO_ROOT, "tools", "worker-supervisor.mjs"), payloadPath], {
    cwd: REPO_ROOT,
    env: environment,
    stdio: ["ignore", "ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  child.stdio[3].end(privateKey.export({ format: "pem", type: "pkcs8" }))
  return new Promise((resolve) => {
    child.on("error", (error) => resolve({ status: `spawn error: ${error.message}`, stderr }))
    child.on("close", (status) => resolve({ status, stderr }))
  })
}

const adversarialPayloadCase = async () => {
  const base = join(root, "supervisor-envelope-red")
  mkdirSync(base, { recursive: true })
  const launchId = `supervisor-envelope-${Date.now()}`
  const payloadPath = join(base, `orbit-worker-${launchId}.json`)
  const startGate = join(base, `orbit-worker-${launchId}.ready`)
  const alteredGate = join(base, "altered.ready")
  const markerPath = join(base, "trusted-marker.jsonl")
  const alteredMarkerPath = join(base, "altered-marker.jsonl")
  const alteredLedgerPath = join(base, "altered-ledger.jsonl")
  const trustedWorker = join(base, "trusted-worker.mjs")
  const alteredWorker = join(base, "altered-worker.mjs")
  const alteredPayloadPath = join(base, "attacker-payload.json")
  const startedPath = join(base, "trusted-started")
  const alteredStartedPath = join(base, "altered-started")
  writeFileSync(trustedWorker, `import { writeFileSync } from "node:fs"\nwriteFileSync(${JSON.stringify(startedPath)}, "trusted\\n")\n`)
  writeFileSync(alteredWorker, `import { writeFileSync } from "node:fs"\nwriteFileSync(${JSON.stringify(alteredStartedPath)}, "altered\\n")\n`)
  const completionKeys = generateKeyPairSync("ed25519")
  const supervisorEnvelope = {
    version: WORKER_SUPERVISOR_ENVELOPE_VERSION,
    payloadPath,
    executable: process.execPath,
    scriptArgs: [trustedWorker],
    engineArgs: ["trusted-engine-argument"],
    pointer: "trusted-pointer",
    worktreePath: REPO_ROOT,
    markerPath,
    ledgerPath: WORKER_LAUNCH_LEDGER,
    startGate,
    timeoutMs: 60_000,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  }
  let launchRecord = {
    version: 1,
    launchId,
    issue: "ORB-166",
    worktreePath: REPO_ROOT,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    launchMode: "repair",
    engine: "codex",
    invocation: { command: "codex", args: ["exec"] },
    branch: "fix/orb-166-supervisor-envelope",
    launcherPid: process.pid,
    issuedAt: new Date().toISOString(),
    completionAttestation: {
      algorithm: "ed25519",
      publicKey: completionKeys.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    },
    supervisorEnvelope,
  }
  launchRecord = signWorkerLaunchRecord(launchRecord, completionKeys.privateKey)
  const payload = {
    payloadPath,
    launchRecord,
    ...supervisorEnvelope,
  }
  writeFileSync(payloadPath, `${JSON.stringify(payload)}\n`)

  const supervisor = launchSupervisor(payloadPath, completionKeys.privateKey)
  const alteredPayload = {
    ...payload,
    payloadPath: alteredPayloadPath,
    scriptArgs: [alteredWorker],
    engineArgs: ["altered-engine-argument"],
    pointer: "altered-pointer",
    worktreePath: root,
    markerPath: alteredMarkerPath,
    ledgerPath: alteredLedgerPath,
    startGate: alteredGate,
  }
  writeFileSync(payloadPath, `${JSON.stringify(alteredPayload)}\n`)
  writeFileSync(startGate, "ready\n")
  writeFileSync(alteredGate, "ready\n")
  const result = await supervisor
  const completionRows = [markerPath, alteredMarkerPath, WORKER_LAUNCH_LEDGER, alteredLedgerPath]
    .flatMap((path) => readRows(path))
    .filter((row) => row.launchId === launchId && row.completion)
  T(
    "worker-supervisor.mjs: a payload mutation before readiness cannot start altered work or issue a completion receipt",
    result.status === 3 &&
      !existsSync(startedPath) &&
      !existsSync(alteredStartedPath) &&
      completionRows.length === 0,
    `exit ${result.status}\n     stderr: ${result.stderr}\n     completion rows: ${JSON.stringify(completionRows)}`,
  )
}

export const cases = async () => {
  check("worker-supervisor.mjs", "requires a launcher payload", [], { status: 2, stderr: /launcher-payload/ })
  T("worker-supervisor.mjs: a missing payload is refused before a worker can start", true)
  await adversarialPayloadCase()
}
