import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { createPublicKey, verify } from "node:crypto"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

export const WORKER_LAUNCH_LEDGER_ENV = "ORBIT_WORKER_LAUNCH_LEDGER"
export const WORKER_LAUNCH_VERSION = 1
export const WORKER_LAUNCH_MODES = new Set(["new-worktree", "existing-worktree", "repair"])
const SHA1 = /^[0-9a-f]{40}$/
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export const workerLaunchLedgerPath = (override = process.env[WORKER_LAUNCH_LEDGER_ENV]) => {
  if (override !== undefined && override.trim().length === 0) {
    throw new Error(`${WORKER_LAUNCH_LEDGER_ENV} must not be empty`)
  }
  return resolve(override ?? resolve(homedir(), ".orbit", "worker-launches.jsonl"))
}

const normalizedPath = (value) => resolve(String(value ?? "")).toLowerCase()
const sameArray = (left, right) => Array.isArray(left) && Array.isArray(right) && JSON.stringify(left) === JSON.stringify(right)
const sameAttestation = (left, right) =>
  (left?.completionAttestation?.publicKey ?? null) === (right?.completionAttestation?.publicKey ?? null)

const isCompletionAttestation = (attestation) =>
  attestation &&
  typeof attestation === "object" &&
  !Array.isArray(attestation) &&
  attestation.algorithm === "ed25519" &&
  typeof attestation.publicKey === "string" &&
  BASE64.test(attestation.publicKey)

const isCompletion = (completion) =>
  completion &&
  typeof completion === "object" &&
  !Array.isArray(completion) &&
  Number.isFinite(Date.parse(completion.completedAt)) &&
  (completion.completedHead === null || (typeof completion.completedHead === "string" && SHA1.test(completion.completedHead))) &&
  Number.isInteger(completion.exitCode) &&
  typeof completion.signature === "string" &&
  BASE64.test(completion.signature)

export const isWorkerLaunchRecord = (record) =>
  record &&
  typeof record === "object" &&
  !Array.isArray(record) &&
  record.version === WORKER_LAUNCH_VERSION &&
  typeof record.launchId === "string" &&
  record.launchId.length > 0 &&
  typeof record.issue === "string" &&
  /^[A-Z]+-\d+$/.test(record.issue) &&
  typeof record.worktreePath === "string" &&
  record.worktreePath.length > 0 &&
  Number.isInteger(record.pid) &&
  record.pid > 0 &&
  Number.isFinite(Date.parse(record.startedAt)) &&
  WORKER_LAUNCH_MODES.has(record.launchMode) &&
  ["claude", "codex"].includes(record.engine) &&
  record.invocation &&
  typeof record.invocation.command === "string" &&
  Array.isArray(record.invocation.args) &&
  record.invocation.args.every((arg) => typeof arg === "string") &&
  typeof record.branch === "string" &&
  record.branch.length > 0 &&
  Number.isInteger(record.launcherPid) &&
  record.launcherPid > 0 &&
  Number.isFinite(Date.parse(record.issuedAt)) &&
  (!Object.hasOwn(record, "completionAttestation") || isCompletionAttestation(record.completionAttestation)) &&
  (!Object.hasOwn(record, "completion") || isCompletion(record.completion))

const signingPayload = (record, completion = record.completion) => JSON.stringify({
  version: record.version,
  launchId: record.launchId,
  issue: record.issue,
  worktreePath: record.worktreePath,
  pid: record.pid,
  startedAt: record.startedAt,
  launchMode: record.launchMode,
  engine: record.engine,
  invocation: { command: record.invocation.command, args: record.invocation.args },
  branch: record.branch,
  launcherPid: record.launcherPid,
  issuedAt: record.issuedAt,
  completion: completion
    ? {
        completedAt: completion.completedAt,
        completedHead: completion.completedHead,
        exitCode: completion.exitCode,
      }
    : null,
})

export const workerCompletionSigningPayload = (record, completion) => signingPayload(record, completion)

export const verifyWorkerLaunchCompletion = (record) => {
  if (!isWorkerLaunchRecord(record) || !isCompletionAttestation(record.completionAttestation) || !isCompletion(record.completion)) return false
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(record.completionAttestation.publicKey, "base64"),
      format: "der",
      type: "spki",
    })
    return verify(
      null,
      Buffer.from(signingPayload(record, record.completion), "utf8"),
      publicKey,
      Buffer.from(record.completion.signature, "base64"),
    )
  } catch {
    return false
  }
}

export const recordWorkerLaunch = (record, ledgerPath) => {
  if (!isWorkerLaunchRecord(record)) throw new Error("worker launch provenance record is incomplete")
  const target = workerLaunchLedgerPath(ledgerPath)
  mkdirSync(dirname(target), { recursive: true })
  appendFileSync(target, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 })
}

export const readWorkerLaunchRecords = (ledgerPath) => {
  const target = workerLaunchLedgerPath(ledgerPath)
  let raw
  try {
    raw = readFileSync(target, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw new Error(`could not read worker launch ledger ${target}: ${error.message}`)
  }
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      throw new Error(`worker launch ledger ${target} line ${index + 1} is not JSON: ${error.message}`)
    }
    if (!isWorkerLaunchRecord(record)) throw new Error(`worker launch ledger ${target} line ${index + 1} is incomplete`)
    return record
  })
}

export const sameWorkerLaunch = (left, right) =>
  isWorkerLaunchRecord(left) &&
  isWorkerLaunchRecord(right) &&
  left.version === right.version &&
  left.launchId === right.launchId &&
  left.issue === right.issue &&
  normalizedPath(left.worktreePath) === normalizedPath(right.worktreePath) &&
  left.pid === right.pid &&
  left.startedAt === right.startedAt &&
  left.launchMode === right.launchMode &&
  left.engine === right.engine &&
  left.invocation.command === right.invocation.command &&
  sameArray(left.invocation.args, right.invocation.args) &&
  left.branch === right.branch &&
  left.launcherPid === right.launcherPid &&
  left.issuedAt === right.issuedAt &&
  sameAttestation(left, right)

export const workerDeliveryEvidence = ({ issue, branch, head, worktreePath, invocation, ledgerPath, records } = {}) => {
  if (typeof issue !== "string" || !/^[A-Z]+-\d+$/.test(issue)) return { ok: false, status: "INVALID", reason: "issue is not a Linear identifier" }
  if (typeof branch !== "string" || branch.length === 0) return { ok: false, status: "INVALID", reason: "branch is missing" }
  if (typeof head !== "string" || !SHA1.test(head)) return { ok: false, status: "INVALID", reason: "head is not a full commit SHA" }
  let launches
  try {
    launches = records ?? readWorkerLaunchRecords(ledgerPath)
  } catch (error) {
    return { ok: false, status: "UNREADABLE", reason: error.message }
  }
  const candidates = launches.filter((record) =>
    record.issue === issue &&
    record.branch === branch &&
    (!worktreePath || normalizedPath(record.worktreePath) === normalizedPath(worktreePath)) &&
    (!invocation || (
      record.engine === invocation.engine &&
      record.invocation.command === invocation.command &&
      sameArray(record.invocation.args, invocation.args)
    )),
  )
  const completed = candidates.find((record) =>
    record.completion?.completedHead === head &&
    record.completion.exitCode === 0 &&
    verifyWorkerLaunchCompletion(record),
  )
  if (completed) return { ok: true, status: "COMPLETED", reason: `launcher-supervised worker completed ${head}`, record: completed }
  if (candidates.some((record) => record.completion)) {
    return { ok: false, status: "STALE", reason: `no authenticated worker completion receipt matches ${head}` }
  }
  return { ok: false, status: "ABSENT", reason: `no launcher-supervised worker completion receipt exists for ${issue} on ${branch}` }
}
