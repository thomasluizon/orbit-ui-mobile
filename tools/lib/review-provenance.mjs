import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

export const REVIEW_PROVENANCE_LEDGER_ENV = "ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER"
export const REVIEW_PROVENANCE_ISSUER = "tools/launch-pr-review.mjs"
export const REVIEW_PROVENANCE_VERSION = 1
export const REVIEW_AUTHORITY_PUBLIC_KEY_ENV = "ORBIT_REVIEW_AUTHORITY_PUBLIC_KEY"
export const REVIEW_AUTHORITY_PRIVATE_KEY_ENV = "ORBIT_REVIEW_AUTHORITY_PRIVATE_KEY"

const SHA1 = /^[0-9a-f]{40}$/
const FINDING_ID = /^finding-[0-9a-f]{32}$/
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const digest = (value) => createHash("sha256").update(value).digest("hex")

const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase()

export const stableFindingIdentity = (finding) => {
  const path = normalizeText(finding?.path)
  const title = normalizeText(finding?.title)
  return `finding-${digest(`${path}\n${title}`).slice(0, 32)}`
}

export const reviewProvenanceLedgerPath = (override = process.env[REVIEW_PROVENANCE_LEDGER_ENV]) => {
  if (override !== undefined && override.trim().length === 0) {
    throw new Error(`${REVIEW_PROVENANCE_LEDGER_ENV} must not be empty`)
  }
  return resolve(override ?? resolve(homedir(), ".orbit", "local-review-provenance.jsonl"))
}

const configuredPublicKey = () => {
  const encoded = process.env[REVIEW_AUTHORITY_PUBLIC_KEY_ENV]?.trim()
  if (!encoded || !BASE64.test(encoded)) throw new Error(`${REVIEW_AUTHORITY_PUBLIC_KEY_ENV} is unavailable or malformed`)
  return encoded
}

const authorityPublicKey = () =>
  createPublicKey({
    key: Buffer.from(configuredPublicKey(), "base64"),
    format: "der",
    type: "spki",
  })

const authorityPrivateKey = (privateKeyPem = process.env[REVIEW_AUTHORITY_PRIVATE_KEY_ENV]) => {
  if (typeof privateKeyPem !== "string" || privateKeyPem.trim().length === 0) {
    throw new Error(`${REVIEW_AUTHORITY_PRIVATE_KEY_ENV} is unavailable; only the independent reviewer may issue evidence`)
  }
  const privateKey = createPrivateKey(privateKeyPem)
  const derivedPublicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64")
  if (derivedPublicKey !== configuredPublicKey()) {
    throw new Error("review authority private key does not match the trusted public key")
  }
  return privateKey
}

export const assertReviewAuthority = (privateKeyPem = process.env[REVIEW_AUTHORITY_PRIVATE_KEY_ENV]) => {
  authorityPrivateKey(privateKeyPem)
  return true
}

const normalizedFindingIds = (findingIds) => {
  if (!Array.isArray(findingIds) || findingIds.some((id) => !FINDING_ID.test(id))) {
    throw new Error("review provenance findingIds must contain stable finding identities")
  }
  return [...new Set(findingIds)].sort()
}

const signingPayload = (receipt) => JSON.stringify({
  version: receipt.version,
  issuer: receipt.issuer,
  evidenceId: receipt.evidenceId,
  head: receipt.head,
  recommendation: receipt.recommendation,
  findingIds: receipt.findingIds,
  issuedAt: receipt.issuedAt,
})

export const issueReviewProvenance = ({
  head,
  recommendation,
  findingIds = [],
  ledgerPath,
  issuedAt = new Date().toISOString(),
  privateKey,
}) => {
  if (!SHA1.test(head ?? "")) throw new Error("review provenance head must be a 40-character lowercase SHA")
  if (!new Set(["APPROVE", "NEEDS_WORK"]).has(recommendation)) {
    throw new Error("review provenance recommendation must be APPROVE or NEEDS_WORK")
  }
  const normalizedIds = normalizedFindingIds(findingIds)
  if (!Number.isFinite(Date.parse(issuedAt))) throw new Error("review provenance issuedAt must be an ISO timestamp")
  const evidenceId = randomUUID()
  const receipt = {
    version: REVIEW_PROVENANCE_VERSION,
    issuer: REVIEW_PROVENANCE_ISSUER,
    evidenceId,
    head,
    recommendation,
    findingIds: normalizedIds,
    issuedAt,
  }
  receipt.signature = sign(null, Buffer.from(signingPayload(receipt), "utf8"), authorityPrivateKey(privateKey)).toString("base64")
  const target = reviewProvenanceLedgerPath(ledgerPath)
  mkdirSync(dirname(target), { recursive: true })
  appendFileSync(target, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 })
  return {
    version: REVIEW_PROVENANCE_VERSION,
    issuer: REVIEW_PROVENANCE_ISSUER,
    evidenceId,
    findingIds: normalizedIds,
    signature: receipt.signature,
  }
}

export const readReviewProvenanceReceipts = (ledgerPath) => {
  const target = reviewProvenanceLedgerPath(ledgerPath)
  let raw
  try {
    raw = readFileSync(target, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw new Error(`could not read review provenance ledger ${target}: ${error.message}`)
  }
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`review provenance ledger ${target} line ${index + 1} is not JSON: ${error.message}`)
    }
  })
}

const receiptMatches = (receipt, { head, recommendation, findingIds }) =>
  receipt &&
  receipt.version === REVIEW_PROVENANCE_VERSION &&
  receipt.issuer === REVIEW_PROVENANCE_ISSUER &&
  receipt.head === head &&
  receipt.recommendation === recommendation &&
  Array.isArray(receipt.findingIds) &&
  JSON.stringify(receipt.findingIds) === JSON.stringify(normalizedFindingIds(findingIds)) &&
  typeof receipt.evidenceId === "string" &&
  typeof receipt.signature === "string" &&
  BASE64.test(receipt.signature) &&
  Number.isFinite(Date.parse(receipt.issuedAt))

export const verifyReviewProvenance = ({ provenance, head, recommendation, findingIds = [], ledgerPath }) => {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return false
  const keys = Object.keys(provenance).sort()
  const expectedKeys = ["evidenceId", "findingIds", "issuer", "signature", "version"]
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return false
  if (provenance.version !== REVIEW_PROVENANCE_VERSION || provenance.issuer !== REVIEW_PROVENANCE_ISSUER) return false
  if (typeof provenance.evidenceId !== "string" || typeof provenance.signature !== "string" || !BASE64.test(provenance.signature)) return false
  let normalizedIds
  try {
    normalizedIds = normalizedFindingIds(findingIds)
    if (JSON.stringify(provenance.findingIds) !== JSON.stringify(normalizedIds)) return false
    if (JSON.stringify(provenance.findingIds) !== JSON.stringify(normalizedFindingIds(provenance.findingIds))) return false
    return readReviewProvenanceReceipts(ledgerPath).some((receipt) =>
      receipt.evidenceId === provenance.evidenceId &&
      receiptMatches(receipt, { head, recommendation, findingIds: normalizedIds }) &&
      receipt.signature === provenance.signature &&
      verify(null, Buffer.from(signingPayload(receipt), "utf8"), authorityPublicKey(), Buffer.from(receipt.signature, "base64")),
    )
  } catch {
    return false
  }
}

export { FINDING_ID }
