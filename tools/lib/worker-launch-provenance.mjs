import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

export const WORKER_LAUNCH_LEDGER_ENV = "ORBIT_WORKER_LAUNCH_LEDGER"
export const WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV = "ORBIT_WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY"
export const WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY_ENV = "ORBIT_WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY"
export const WORKER_LAUNCH_VERSION = 1
export const WORKER_SUPERVISOR_ENVELOPE_VERSION = 1
export const WORKER_LAUNCH_MODES = new Set(["new-worktree", "existing-worktree", "repair"])
export const WORKER_TIMEOUTS_MS = Object.freeze({
  "new-worktree": 90 * 60 * 1000,
  "existing-worktree": 30 * 60 * 1000,
  repair: 45 * 60 * 1000,
})
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

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string")

const isSupervisorEnvelope = (envelope) =>
  envelope &&
  typeof envelope === "object" &&
  !Array.isArray(envelope) &&
  envelope.version === WORKER_SUPERVISOR_ENVELOPE_VERSION &&
  typeof envelope.payloadPath === "string" &&
  envelope.payloadPath.length > 0 &&
  typeof envelope.executable === "string" &&
  envelope.executable.length > 0 &&
  isStringArray(envelope.scriptArgs) &&
  isStringArray(envelope.engineArgs) &&
  typeof envelope.pointer === "string" &&
  typeof envelope.worktreePath === "string" &&
  envelope.worktreePath.length > 0 &&
  typeof envelope.markerPath === "string" &&
  envelope.markerPath.length > 0 &&
  typeof envelope.ledgerPath === "string" &&
  envelope.ledgerPath.length > 0 &&
  typeof envelope.startGate === "string" &&
  envelope.startGate.length > 0 &&
  Number.isSafeInteger(envelope.timeoutMs) &&
  envelope.timeoutMs > 0 &&
  Number.isFinite(Date.parse(envelope.deadlineAt))

const supervisorEnvelopeSigningPayload = (envelope) => ({
  version: envelope.version,
  payloadPath: envelope.payloadPath,
  executable: envelope.executable,
  scriptArgs: envelope.scriptArgs,
  engineArgs: envelope.engineArgs,
  pointer: envelope.pointer,
  worktreePath: envelope.worktreePath,
  markerPath: envelope.markerPath,
  ledgerPath: envelope.ledgerPath,
  startGate: envelope.startGate,
  timeoutMs: envelope.timeoutMs,
  deadlineAt: envelope.deadlineAt,
})

const isCompletion = (completion) =>
  completion &&
  typeof completion === "object" &&
  !Array.isArray(completion) &&
  Number.isFinite(Date.parse(completion.completedAt)) &&
  (completion.completedHead === null || (typeof completion.completedHead === "string" && SHA1.test(completion.completedHead))) &&
  Number.isInteger(completion.exitCode) &&
  typeof completion.signature === "string" &&
  BASE64.test(completion.signature)

const parseAuthorityPublicKey = (encoded) => {
  if (typeof encoded !== "string" || encoded.trim().length === 0 || !BASE64.test(encoded.trim())) return null
  try {
    const key = createPublicKey({
      key: Buffer.from(encoded.trim(), "base64"),
      format: "der",
      type: "spki",
    })
    if (key.asymmetricKeyType !== "ed25519") return null
    const canonical = key.export({ format: "der", type: "spki" }).toString("base64")
    return canonical === encoded.trim() ? { encoded: canonical, key } : null
  } catch {
    return null
  }
}

export const isWorkerAuthorityPublicKey = (encoded) => parseAuthorityPublicKey(encoded) !== null

const signingKey = (privateKey) => {
  if (privateKey && typeof privateKey === "object" && privateKey.type === "private") return privateKey
  if (typeof privateKey === "string" && privateKey.trim().length > 0) return createPrivateKey(privateKey)
  throw new Error("worker launch signing key is unavailable; only the launcher may issue worker provenance")
}

export const workerAuthorityPublicKeyFromPrivateKey = (privateKey) => {
  const key = signingKey(privateKey)
  const publicKey = createPublicKey(key)
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("worker launch signing key must be Ed25519")
  return publicKey.export({ format: "der", type: "spki" }).toString("base64")
}

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
  isCompletionAttestation(record.completionAttestation) &&
  (!Object.hasOwn(record, "supervisorEnvelope") || (
    isSupervisorEnvelope(record.supervisorEnvelope) &&
    record.supervisorEnvelope.worktreePath === record.worktreePath
  )) &&
  typeof record.launchSignature === "string" &&
  BASE64.test(record.launchSignature) &&
  (!Object.hasOwn(record, "completion") || isCompletion(record.completion))

export const workerLaunchSigningPayload = (record) => {
  const payload = {
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
    completionAttestation: {
      algorithm: record.completionAttestation?.algorithm,
      publicKey: record.completionAttestation?.publicKey,
    },
  }
  if (record.supervisorEnvelope) payload.supervisorEnvelope = supervisorEnvelopeSigningPayload(record.supervisorEnvelope)
  return JSON.stringify(payload)
}

export const signWorkerLaunchRecord = (record, privateKey) => {
  if (!isWorkerLaunchRecord({ ...record, launchSignature: "placeholder" })) {
    throw new Error("worker launch provenance record is incomplete")
  }
  const launchSignature = sign(
    null,
    Buffer.from(workerLaunchSigningPayload(record), "utf8"),
    signingKey(privateKey),
  ).toString("base64")
  return { ...record, launchSignature }
}

export const verifyWorkerLaunchRecord = (record, expectedAuthorityPublicKey) => {
  const authority = parseAuthorityPublicKey(expectedAuthorityPublicKey)
  if (!authority || !isWorkerLaunchRecord(record) || record.completionAttestation.publicKey !== authority.encoded) return false
  try {
    return verify(
      null,
      Buffer.from(workerLaunchSigningPayload(record), "utf8"),
      authority.key,
      Buffer.from(record.launchSignature, "base64"),
    )
  } catch {
    return false
  }
}

const signingPayload = (record, completion = record.completion) => JSON.stringify({
  launch: JSON.parse(workerLaunchSigningPayload(record)),
  completion: completion
    ? {
        completedAt: completion.completedAt,
        completedHead: completion.completedHead,
        exitCode: completion.exitCode,
      }
    : null,
})

export const workerCompletionSigningPayload = (record, completion) => signingPayload(record, completion)

const supervisorPayloadFields = (payload) => ({
  payloadPath: payload?.payloadPath,
  executable: payload?.executable,
  scriptArgs: payload?.scriptArgs,
  engineArgs: payload?.engineArgs,
  pointer: payload?.pointer,
  worktreePath: payload?.worktreePath,
  markerPath: payload?.markerPath,
  ledgerPath: payload?.ledgerPath,
  startGate: payload?.startGate,
  timeoutMs: payload?.timeoutMs,
  deadlineAt: payload?.deadlineAt,
})

export const sameWorkerSupervisorPayload = (payload, launchRecord) =>
  isSupervisorEnvelope(launchRecord?.supervisorEnvelope) &&
  JSON.stringify(supervisorPayloadFields(payload)) === JSON.stringify(supervisorPayloadFields(launchRecord.supervisorEnvelope))

export const verifyWorkerLaunchCompletion = (record, expectedAuthorityPublicKey) => {
  const authority = parseAuthorityPublicKey(expectedAuthorityPublicKey)
  if (!authority || !verifyWorkerLaunchRecord(record, authority.encoded) || !isCompletion(record.completion)) return false
  try {
    return verify(
      null,
      Buffer.from(signingPayload(record, record.completion), "utf8"),
      authority.key,
      Buffer.from(record.completion.signature, "base64"),
    )
  } catch {
    return false
  }
}

export const recordWorkerLaunch = (record, ledgerPath, expectedAuthorityPublicKey) => {
  if (!verifyWorkerLaunchRecord(record, expectedAuthorityPublicKey)) throw new Error("worker launch provenance record is not authenticated by the expected launcher authority")
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
  sameAttestation(left, right) &&
  left.launchSignature === right.launchSignature

export const workerDeliveryEvidence = ({ issue, branch, head, worktreePath, invocation, ledgerPath, records, authorityPublicKey } = {}) => {
  if (typeof issue !== "string" || !/^[A-Z]+-\d+$/.test(issue)) return { ok: false, status: "INVALID", reason: "issue is not a Linear identifier" }
  if (typeof branch !== "string" || branch.length === 0) return { ok: false, status: "INVALID", reason: "branch is missing" }
  if (typeof head !== "string" || !SHA1.test(head)) return { ok: false, status: "INVALID", reason: "head is not a full commit SHA" }
  const expectedAuthority = parseAuthorityPublicKey(authorityPublicKey)
  if (!expectedAuthority) return { ok: false, status: "UNAUTHENTICATED", reason: "expected launcher authority public key is absent or malformed" }
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
    verifyWorkerLaunchCompletion(record, expectedAuthority.encoded),
  )
  if (completed) return { ok: true, status: "COMPLETED", reason: `launcher-supervised worker completed ${head}`, record: completed }
  if (candidates.some((record) => record.completion)) {
    return { ok: false, status: "STALE", reason: `no authenticated worker completion receipt matches ${head}` }
  }
  return { ok: false, status: "ABSENT", reason: `no launcher-supervised worker completion receipt exists for ${issue} on ${branch}` }
}
