#!/usr/bin/env node
import { createSign } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"
import { googleToken } from "./lib/auto-work-google.mjs"
import { acknowledgeIntake, intakeSource, saveIntakeSource } from "./lib/auto-work-intake.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

export const PLAY_PACKAGES = ["org.useorbit.app", "org.useorbit.app.staging"]
const USAGE = `usage: orbit-play-reviews.mjs <--collect --output <absolute file> | --import <absolute file> | --ack>
--collect runs in trusted GitHub Actions using GOOGLE_PLAY_SERVICE_ACCOUNT_JSON from the environment.
Lists every available review page for both Orbit packages; writes a private artifact, never a key.
Google returns commented production reviews created or modified within the last week only.
--import loads that artifact into the owning auto-work run; ids include the review modification time.
--ack reads stdin JSON {id, classification, person, ticket?, reply?}; a person needs a saved reply.
Classifications: bug, feature request, question, billing, praise, spam, noise.
No review reply operation exists. Prints counts or the pending review list.
--help, -h print usage
exit codes: 0 success; 1 API, state or receipt failure (partial collection still writes an artifact); 2 invalid arguments or stdin`

export const reviewItem = (packageName, review, comment) => {
  const seconds = comment.lastModified?.seconds
  const nanos = comment.lastModified?.nanos ?? 0
  if (typeof review.reviewId !== "string" || !review.reviewId || !/^\d+$/.test(seconds ?? "") ||
      !Number.isInteger(nanos) || nanos < 0 || nanos > 999999999 || typeof comment.text !== "string") throw new Error("Invalid Play review response")
  const version = `${seconds}.${String(nanos).padStart(9, "0")}`
  return { id: `${packageName}:${review.reviewId}:${version}`, packageName, reviewId: review.reviewId,
    version, text: comment.text, language: comment.reviewerLanguage ?? null, stars: comment.starRating ?? null,
    author: review.authorName ?? null }
}

export const readPlayReviews = async (accessToken, request = fetch) => {
  const result = { collectedAt: new Date().toISOString(), packages: PLAY_PACKAGES, reviews: [], failures: [] }
  for (const packageName of PLAY_PACKAGES) {
    let token
    try {
      do {
        const url = new URL(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/reviews`)
        url.search = new URLSearchParams({ maxResults: "100", ...(token ? { token } : {}) }).toString()
        const response = await request(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`Play reviews failed (HTTP ${response.status})`)
        const page = await response.json()
        for (const review of page.reviews ?? []) for (const comment of review.comments ?? []) {
          if (comment.userComment) result.reviews.push(reviewItem(packageName, review, comment.userComment))
        }
        token = page.tokenPagination?.nextPageToken
      } while (token)
    } catch (error) { result.failures.push({ packageName, reason: error.message }) }
  }
  return result
}

export const playAccessToken = async (key, request = fetch) => {
  if (!key?.client_email || !key.private_key) throw new Error("Publishing service account is missing")
  const issuedAt = Math.floor(Date.now() / 1000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const assertion = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: key.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: issuedAt, exp: issuedAt + 3600 })}`
  const signature = createSign("RSA-SHA256").update(assertion).sign(key.private_key, "base64url")
  return (await googleToken({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${assertion}.${signature}` }, request)).access_token
}

export const importPlayReviews = (snapshot, repoRoot = REPO_ROOT) => {
  if (!Array.isArray(snapshot?.reviews) || !Array.isArray(snapshot.failures) ||
      !Array.isArray(snapshot.packages) || PLAY_PACKAGES.some((name) => !snapshot.packages.includes(name)) || !Number.isFinite(Date.parse(snapshot.collectedAt))) throw new Error("Invalid review artifact")
  const current = intakeSource("play", repoRoot)
  const pending = { ...current.pending }
  const highWater = { ...current.highWater }
  for (const item of snapshot.reviews) {
    if (!PLAY_PACKAGES.includes(item.packageName) || typeof item.id !== "string" || !/^\d+\.\d{9}$/.test(item.version) || typeof item.text !== "string") throw new Error("Invalid artifact review")
    if (!current.completed[item.id] && !pending[item.id]) pending[item.id] = item
    if (BigInt(item.version.replace(".", "")) > BigInt((highWater[item.packageName] ?? "0.000000000").replace(".", ""))) highWater[item.packageName] = item.version
  }
  const gap = current.lastCollectedAt && Date.parse(snapshot.collectedAt) - Date.parse(current.lastCollectedAt) > 7 * 86400_000
  saveIntakeSource("play", { ...current, pending, highWater, failures: snapshot.failures,
    ...(gap ? { backfillRequiredSince: current.lastCollectedAt } : {}),
    ...(snapshot.failures.length === 0 ? { lastCollectedAt: snapshot.collectedAt } : {}) }, repoRoot)
  return { pending: Object.values(pending), failures: snapshot.failures, backfillRequiredSince: intakeSource("play", repoRoot).backfillRequiredSince ?? null }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  if (!(args.length === 1 && args[0] === "--ack") && !(args.length === 2 && args[0] === "--import" && isAbsolute(args[1])) &&
      !(args.length === 3 && args[0] === "--collect" && args[1] === "--output" && isAbsolute(args[2]))) { console.error(USAGE); process.exit(2) }
  let receipt
  if (args[0] === "--ack") {
    try { let input = ""; for await (const chunk of process.stdin) input += chunk; receipt = JSON.parse(input) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
  }
  try {
    if (args[0] === "--collect") {
      let key
      try { key = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) } catch { throw new Error("Publishing service account is unavailable") }
      const snapshot = await readPlayReviews(await playAccessToken(key))
      writeFileSync(args[2], JSON.stringify(snapshot), { mode: 0o600 })
      console.log(JSON.stringify({ reviews: snapshot.reviews.length, failures: snapshot.failures }))
      if (snapshot.failures.length) process.exit(1)
    } else if (args[0] === "--import") console.log(JSON.stringify(importPlayReviews(JSON.parse(readFileSync(args[1], "utf8")))))
    else { acknowledgeIntake("play", receipt); console.log(JSON.stringify({ acknowledged: receipt.id })) }
  } catch (error) { console.error(error.message); process.exit(1) }
}
