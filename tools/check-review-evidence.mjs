#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REVIEW_MARKER_PREFIX = "<!-- orbit-local-review:"
const MARKER_PATTERN = /^<!-- orbit-local-review:\s*(\{.*\})\s*-->$/
const EXPECTED_KEYS = ["head", "recommendation", "version"]
const RECOMMENDATIONS = new Set(["APPROVE", "NEEDS_WORK"])
const SHA_PATTERN = /^[0-9a-f]{40}$/

const firstNonblankLine = (body) =>
  typeof body === "string" ? body.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "" : ""

const isReviewEvidenceCandidate = (review) => firstNonblankLine(review?.body).startsWith(REVIEW_MARKER_PREFIX)

const result = (ok, status, reason, review = null) => ({ ok, status, reason, review })

const completeConnection = (connection) =>
  connection &&
  typeof connection === "object" &&
  !Array.isArray(connection) &&
  connection.pageInfo &&
  typeof connection.pageInfo.hasNextPage === "boolean" &&
  Array.isArray(connection.nodes)

const effectiveTime = (review) => {
  const values = [review?.submittedAt, review?.updatedAt, review?.lastEditedAt]
    .filter((value) => value !== null && value !== undefined)
    .map((value) => Date.parse(value))
  return values.length > 0 && values.every(Number.isFinite) ? Math.max(...values) : null
}

const parseMarker = (review) => {
  const line = firstNonblankLine(review?.body)
  const match = MARKER_PATTERN.exec(line)
  if (!match) return { ok: false, reason: "latest marker is not a complete orbit-local-review HTML comment" }
  let marker
  try {
    marker = JSON.parse(match[1])
  } catch {
    return { ok: false, reason: "latest marker payload is not valid JSON" }
  }
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return { ok: false, reason: "latest marker payload must be an object" }
  const keys = Object.keys(marker).sort()
  if (keys.length !== EXPECTED_KEYS.length || keys.some((key, index) => key !== EXPECTED_KEYS[index])) {
    return { ok: false, reason: `latest marker keys are ${keys.join(", ") || "absent"}; expected exactly ${EXPECTED_KEYS.join(", ")}` }
  }
  if (marker.version !== 1) return { ok: false, reason: "latest marker version must be 1" }
  if (typeof marker.head !== "string" || !SHA_PATTERN.test(marker.head)) return { ok: false, reason: "latest marker head must be 40 lowercase hexadecimal characters" }
  if (!RECOMMENDATIONS.has(marker.recommendation)) return { ok: false, reason: "latest marker recommendation must be APPROVE or NEEDS_WORK" }
  return { ok: true, marker }
}

const evaluateReviewEvidence = (input, expectedHead) => {
  if (!SHA_PATTERN.test(expectedHead ?? "")) return result(false, "INVALID", "expected head must be 40 lowercase hexadecimal characters")
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return result(false, "INCOMPLETE", "pull request snapshot is missing its complete connection shape")
  }
  if (input.headRefOid !== expectedHead) {
    return result(false, "STALE", `pull request snapshot head is ${input.headRefOid ?? "absent"}; expected ${expectedHead}`)
  }
  const { files, reviews } = input
  if (!completeConnection(files)) {
    return result(false, "INCOMPLETE", "file inventory is missing its complete connection shape")
  }
  if (files.pageInfo.hasNextPage) return result(false, "INCOMPLETE", "file inventory has another page")
  if (!completeConnection(reviews)) {
    return result(false, "INCOMPLETE", "review inventory is missing its complete connection shape")
  }
  if (reviews.pageInfo.hasNextPage) return result(false, "INCOMPLETE", "review inventory has another page")

  const candidates = reviews.nodes.filter(isReviewEvidenceCandidate)
  if (candidates.length === 0) return result(false, "AWAITING_REVIEW", "no marker-bearing local review exists")
  const timed = candidates.map((review) => ({ review, time: effectiveTime(review) }))
  if (timed.some(({ time }) => time === null)) return result(false, "MALFORMED", "a marker-bearing review has no complete parseable timestamp")
  const latestTime = Math.max(...timed.map(({ time }) => time))
  const latest = timed.filter(({ time }) => time === latestTime)
  if (latest.length !== 1) return result(false, "AMBIGUOUS", `${latest.length} marker-bearing reviews tie for latest`)

  const selected = latest[0].review
  const parsed = parseMarker(selected)
  if (!parsed.ok) return result(false, "MALFORMED", parsed.reason, selected)
  if (parsed.marker.head !== expectedHead || selected.commit?.oid !== expectedHead) {
    return result(
      false,
      "STALE",
      `latest marker head is ${parsed.marker.head}; GitHub review commit is ${selected.commit?.oid ?? "absent"}; expected ${expectedHead}`,
      selected,
    )
  }
  if (parsed.marker.recommendation === "NEEDS_WORK") return result(false, "NEEDS_WORK", `latest local review requests work on ${expectedHead}`, selected)

  const nativeApprovals = reviews.nodes.filter((review) => review.state === "APPROVED")
  if (nativeApprovals.length > 0 && !nativeApprovals.some((review) => review.commit?.oid === expectedHead)) {
    return result(false, "STALE_NATIVE_APPROVAL", `native approvals do not name current head ${expectedHead}`, selected)
  }
  return result(true, "APPROVE", `latest local review approves current head ${expectedHead}`, selected)
}

const USAGE = `usage: check-review-evidence.mjs --expected-head <sha>

Reads a GitHub pull-request snapshot containing headRefOid plus complete files and reviews
connections as JSON from stdin.
Prints a JSON review-evidence verdict.
exit codes: 0 approved, 1 held, 2 invalid input`

const runCli = () => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE)
    return 0
  }
  const known = new Set(["--expected-head", "--help", "-h"])
  const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !known.has(value))
  const index = process.argv.indexOf("--expected-head")
  const expectedHead = index === -1 ? null : process.argv[index + 1]
  if (unknown.length > 0 || !SHA_PATTERN.test(expectedHead ?? "")) {
    console.error(`${USAGE}\n\n--expected-head must be a 40-character lowercase hexadecimal SHA`)
    return 2
  }
  let reviews
  try {
    reviews = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    console.error("stdin must contain a JSON reviews connection")
    return 2
  }
  const verdict = evaluateReviewEvidence(reviews, expectedHead)
  console.log(JSON.stringify(verdict, null, 2))
  return verdict.ok ? 0 : 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === resolve(fileURLToPath(import.meta.url))) process.exit(runCli())

export { REVIEW_MARKER_PREFIX, evaluateReviewEvidence, isReviewEvidenceCandidate }
