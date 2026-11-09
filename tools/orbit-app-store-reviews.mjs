#!/usr/bin/env node
import { createHash, createSign } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"
import { acknowledgeIntake, updateIntakeSource } from "./lib/auto-work-intake.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

const USAGE = `usage: orbit-app-store-reviews.mjs <--collect --output <absolute file> | --import <absolute file> | --ack>
--collect runs only after the iOS app exists, with ORBIT_IOS_APP_STORE_ID and the existing
APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID, APP_STORE_CONNECT_API_PRIVATE_KEY environment keys.
Paginates all App Store customer reviews with GET only; writes a private artifact without keys.
--import loads the artifact into the owning run. Id and content hash retain edited reviews.
--ack stdin JSON: {id, classification, person, ticket?, reply?}; a person needs a saved reply.
Classifications: bug, feature request, question, billing, praise, spam, noise.
No review response operation exists. Prints counts or pending reviews.
--help, -h print usage
exit codes: 0 success; 1 API, state or receipt failure; 2 invalid arguments or stdin`

export const appStoreToken = ({ keyId, issuerId, privateKey }) => {
  if (!keyId || !issuerId || !privateKey) throw new Error("App Store Connect review credentials unavailable")
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const issuedAt = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuerId, iat: issuedAt, exp: issuedAt + 600, aud: "appstoreconnect-v1" })}`
  const signature = createSign("SHA256").update(unsigned).sign({ key: privateKey, dsaEncoding: "ieee-p1363" }, "base64url")
  return `${unsigned}.${signature}`
}

export const readAppStoreReviews = async (appId, token, request = fetch) => {
  if (!/^\d+$/.test(appId ?? "")) throw new Error("ORBIT_IOS_APP_STORE_ID is required")
  const path = `/v1/apps/${appId}/customerReviews`
  let next = `https://api.appstoreconnect.apple.com${path}?limit=200`
  const reviews = []
  const visited = new Set()
  while (next) {
    const url = new URL(next, "https://api.appstoreconnect.apple.com")
    if (url.origin !== "https://api.appstoreconnect.apple.com" || url.pathname !== path || visited.has(url.href)) throw new Error("Invalid App Store pagination link")
    visited.add(url.href)
    const response = await request(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`App Store reviews failed (HTTP ${response.status})`)
    const page = await response.json()
    if (!Array.isArray(page.data)) throw new Error("Invalid App Store review response")
    for (const review of page.data) {
      const attributes = review.attributes
      if (typeof review.id !== "string" || !attributes || !Number.isFinite(Date.parse(attributes.createdDate))) throw new Error("Invalid App Store review identity")
      const contents = { createdAt: attributes.createdDate, title: attributes.title ?? "", text: attributes.body ?? "",
        stars: attributes.rating ?? null, author: attributes.reviewerNickname ?? null, territory: attributes.territory ?? null }
      const version = createHash("sha256").update(JSON.stringify(contents)).digest("hex")
      reviews.push({ id: `${review.id}:${version}`, reviewId: review.id, ...contents })
    }
    next = page.links?.next
  }
  return { appId, collectedAt: new Date().toISOString(), reviews }
}

export const importAppStoreReviews = (snapshot, repoRoot = REPO_ROOT) => {
  if (!Array.isArray(snapshot?.reviews) || !/^\d+$/.test(snapshot.appId ?? "") || !Number.isFinite(Date.parse(snapshot.collectedAt))) throw new Error("Invalid App Store artifact")
  return Object.values(updateIntakeSource("appStore", (current) => {
    const pending = { ...current.pending }
    let highWater = current.highWater
    for (const item of snapshot.reviews) {
      if (typeof item.id !== "string" || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.text !== "string") throw new Error("Invalid App Store artifact review")
      if (!current.completed?.[item.id] && !pending[item.id]) pending[item.id] = item
      if (!highWater || item.createdAt > highWater) highWater = item.createdAt
    }
    return { ...current, completed: current.completed ?? {}, pending, highWater, lastCollectedAt: snapshot.collectedAt }
  }, repoRoot).pending)
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
      const token = appStoreToken({ keyId: process.env.APP_STORE_CONNECT_API_KEY_ID, issuerId: process.env.APP_STORE_CONNECT_API_ISSUER_ID, privateKey: process.env.APP_STORE_CONNECT_API_PRIVATE_KEY })
      const snapshot = await readAppStoreReviews(process.env.ORBIT_IOS_APP_STORE_ID, token)
      writeFileSync(args[2], JSON.stringify(snapshot), { mode: 0o600 })
      console.log(JSON.stringify({ reviews: snapshot.reviews.length }))
    } else if (args[0] === "--import") console.log(JSON.stringify(importAppStoreReviews(JSON.parse(readFileSync(args[1], "utf8")))))
    else { acknowledgeIntake("appStore", receipt); console.log(JSON.stringify({ acknowledged: receipt.id })) }
  } catch (error) { console.error(error.message); process.exit(1) }
}
