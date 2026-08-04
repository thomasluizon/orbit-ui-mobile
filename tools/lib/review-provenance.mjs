import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"

export const REVIEW_PROVENANCE_LEDGER_ENV = "ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER"
export const REVIEW_PROVENANCE_ISSUER = "tools/launch-pr-review.mjs"
export const REVIEW_PROVENANCE_VERSION = 1

const SHA1 = /^[0-9a-f]{40}$/
const FINDING_ID = /^finding-[0-9a-f]{32}$/
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

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

const publicKeyEncoding = (key) => key.export({ format: "der", type: "spki" }).toString("base64")

const parseReviewAuthorityPublicKey = (encoded) => {
  if (typeof encoded !== "string" || !BASE64.test(encoded.trim())) return null
  try {
    const key = createPublicKey({
      key: Buffer.from(encoded.trim(), "base64"),
      format: "der",
      type: "spki",
    })
    if (key.asymmetricKeyType !== "ed25519") return null
    const canonical = publicKeyEncoding(key)
    return canonical === encoded.trim() ? { encoded: canonical, key } : null
  } catch {
    return null
  }
}

export const isReviewAuthorityPublicKey = (encoded) => Boolean(parseReviewAuthorityPublicKey(encoded))

export const createReviewAuthority = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  return { privateKey, publicKey: publicKeyEncoding(publicKey) }
}

const signingKey = (privateKey) => {
  let parsed = privateKey
  if (typeof privateKey === "string" && privateKey.trim().length > 0) parsed = createPrivateKey(privateKey)
  if (!parsed || typeof parsed !== "object" || parsed.type !== "private" || parsed.asymmetricKeyType !== "ed25519") {
    throw new Error("review authority signing key is unavailable or is not Ed25519")
  }
  return parsed
}

const normalizedFindingIds = (findingIds) => {
  if (!Array.isArray(findingIds) || findingIds.some((id) => !FINDING_ID.test(id))) {
    throw new Error("review provenance findingIds must contain stable finding identities")
  }
  return [...new Set(findingIds)].sort()
}

const validReviewContext = (repository, pullRequest) =>
  typeof repository === "string" &&
  REPOSITORY.test(repository) &&
  Number.isSafeInteger(pullRequest) &&
  pullRequest > 0

const signingPayload = (receipt) => JSON.stringify({
  version: receipt.version,
  issuer: receipt.issuer,
  evidenceId: receipt.evidenceId,
  repository: receipt.repository,
  pullRequest: receipt.pullRequest,
  head: receipt.head,
  reviewNodeId: receipt.reviewNodeId,
  recommendation: receipt.recommendation,
  findingIds: receipt.findingIds,
  issuedAt: receipt.issuedAt,
})

export const issueReviewProvenance = ({
  repository,
  pullRequest,
  head,
  reviewNodeId,
  recommendation,
  findingIds = [],
  ledgerPath,
  issuedAt = new Date().toISOString(),
  privateKey,
}) => {
  if (!validReviewContext(repository, pullRequest)) throw new Error("review provenance repository and pullRequest are invalid")
  if (!SHA1.test(head ?? "")) throw new Error("review provenance head must be a 40-character lowercase SHA")
  if (typeof reviewNodeId !== "string" || reviewNodeId.trim().length === 0) throw new Error("review provenance reviewNodeId must be a non-empty GitHub review node id")
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
    repository,
    pullRequest,
    head,
    reviewNodeId,
    recommendation,
    findingIds: normalizedIds,
    issuedAt,
  }
  receipt.signature = sign(null, Buffer.from(signingPayload(receipt), "utf8"), signingKey(privateKey)).toString("base64")
  const target = reviewProvenanceLedgerPath(ledgerPath)
  mkdirSync(dirname(target), { recursive: true })
  appendFileSync(target, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 })
  return {
    version: REVIEW_PROVENANCE_VERSION,
    issuer: REVIEW_PROVENANCE_ISSUER,
    evidenceId,
    repository,
    pullRequest,
    head,
    reviewNodeId,
    recommendation,
    issuedAt,
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

const receiptMatches = (receipt, { repository, pullRequest, head, reviewNodeId, recommendation, findingIds } = {}) => {
  if (!receipt ||
    receipt.version !== REVIEW_PROVENANCE_VERSION ||
    receipt.issuer !== REVIEW_PROVENANCE_ISSUER ||
    receipt.repository !== repository ||
    receipt.pullRequest !== pullRequest ||
    receipt.head !== head ||
    receipt.reviewNodeId !== reviewNodeId ||
    typeof receipt.reviewNodeId !== "string" ||
    receipt.reviewNodeId.trim().length === 0 ||
    !["APPROVE", "NEEDS_WORK"].includes(receipt.recommendation) ||
    !Array.isArray(receipt.findingIds) ||
    typeof receipt.evidenceId !== "string" ||
    typeof receipt.signature !== "string" ||
    !BASE64.test(receipt.signature) ||
    !Number.isFinite(Date.parse(receipt.issuedAt))) return false
  try {
    if (recommendation !== undefined && receipt.recommendation !== recommendation) return false
    if (findingIds !== undefined && JSON.stringify(receipt.findingIds) !== JSON.stringify(normalizedFindingIds(findingIds))) return false
    return JSON.stringify(receipt.findingIds) === JSON.stringify(normalizedFindingIds(receipt.findingIds))
  } catch {
    return false
  }
}

export const verifyReviewProvenance = ({ repository, pullRequest, provenance, head, reviewNodeId, recommendation, findingIds = [], expectedAuthorityPublicKey }) => {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return false
  if (!validReviewContext(repository, pullRequest)) return false
  const authority = parseReviewAuthorityPublicKey(expectedAuthorityPublicKey)
  if (!authority) return false
  const keys = Object.keys(provenance).sort()
  const expectedKeys = ["evidenceId", "findingIds", "head", "issuedAt", "issuer", "pullRequest", "recommendation", "repository", "reviewNodeId", "signature", "version"]
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return false
  if (provenance.version !== REVIEW_PROVENANCE_VERSION || provenance.issuer !== REVIEW_PROVENANCE_ISSUER) return false
  if (provenance.repository !== repository || provenance.pullRequest !== pullRequest) return false
  if (provenance.head !== head || !SHA1.test(provenance.head)) return false
  if (provenance.reviewNodeId !== reviewNodeId || typeof provenance.reviewNodeId !== "string" || provenance.reviewNodeId.trim().length === 0) return false
  if (provenance.recommendation !== recommendation || !["APPROVE", "NEEDS_WORK"].includes(provenance.recommendation)) return false
  if (!Number.isFinite(Date.parse(provenance.issuedAt))) return false
  if (typeof provenance.evidenceId !== "string" || typeof provenance.signature !== "string" || !BASE64.test(provenance.signature)) return false
  let normalizedIds
  try {
    normalizedIds = normalizedFindingIds(findingIds)
    if (JSON.stringify(provenance.findingIds) !== JSON.stringify(normalizedIds)) return false
    if (JSON.stringify(provenance.findingIds) !== JSON.stringify(normalizedFindingIds(provenance.findingIds))) return false
    const receipt = { ...provenance }
    return receiptMatches(receipt, { repository, pullRequest, head, reviewNodeId, recommendation, findingIds: normalizedIds }) &&
      verify(null, Buffer.from(signingPayload(receipt), "utf8"), authority.key, Buffer.from(receipt.signature, "base64"))
  } catch {
    return false
  }
}

export { FINDING_ID }
