#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"
import { replyDisposition, updateIntakeSource } from "./lib/auto-work-intake.mjs"
import { PLAY_PACKAGES, playAccessToken, reviewItem } from "./orbit-play-reviews.mjs"
import { appStoreToken } from "./lib/app-store-connect-token.mjs"
import { readAppStoreReviews } from "./orbit-app-store-reviews.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

const USAGE = `usage: orbit-review-replies.mjs <--prepare | --post --output <absolute file> | --import <absolute file>>
Prepare, post and confirm clear store replies under the auto-work reply policy.
--prepare stdin JSON: {source: play|appStore, id, reply, classification, person, clear,
concerns, replyKind, ticket?, evidence?}. Saves the request in run state and prints a batch of one.
--post stdin is an array of prepared requests. Runs in the review workflow with the existing
store credentials. Revalidates policy and the current review, preserves different existing replies,
and writes a private receipt artifact. No credential is printed or uploaded.
--import reads that artifact, confirming only requests retained in this run's pending state.
Other reply classes stay in the run log for the owner. No stdin for import.
--help, -h print usage
exit codes: 0 confirmed; 1 policy, API, state or artifact failure; 2 invalid arguments or stdin`

export const prepareReviewReply = (receipt, repoRoot = REPO_ROOT) => {
  if (!["play", "appStore"].includes(receipt?.source) || replyDisposition(receipt) !== "send" || typeof receipt.reply !== "string" || !receipt.reply.trim()) throw new Error("Only clear store replies can be prepared")
  let request
  updateIntakeSource(receipt.source, (current) => {
    const item = current.pending[receipt.id]
    if (!item) throw new Error("No pending review matches the reply")
    if (item.replyRequest && JSON.stringify(item.replyRequest.receipt) !== JSON.stringify(receipt)) throw new Error("Resume the saved review reply before preparing another")
    request = item.replyRequest ?? { receipt, item: Object.fromEntries(Object.entries(item).filter(([key]) => !["replyRequest", "replyPosted"].includes(key))) }
    return { ...current, pending: { ...current.pending, [receipt.id]: { ...item, replyRequest: request } } }
  }, repoRoot)
  return [request]
}

const storeCall = async (url, token, request, body) => {
  const response = await request(url, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Store reply failed (HTTP ${response.status})`)
  return body ? null : response.json()
}

export const postReviewReply = async ({ receipt, item }, token, request = fetch, appId = process.env.ORBIT_IOS_APP_STORE_ID) => {
  if (replyDisposition(receipt) !== "send" || item?.id !== receipt.id || typeof item.reviewId !== "string" || !item.reviewId || typeof receipt.reply !== "string" || !receipt.reply.trim()) throw new Error("Invalid simple review reply")
  if (receipt.source === "play") {
    if (!PLAY_PACKAGES.includes(item.packageName) || [...receipt.reply].length > 350) throw new Error("Invalid Play reply package or length")
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${item.packageName}/reviews/${encodeURIComponent(item.reviewId)}`
    const review = await storeCall(url, token, request)
    if (!(review.comments ?? []).some((comment) => comment.userComment && reviewItem(item.packageName, review, comment.userComment).id === item.id)) throw new Error("The Play review changed; classify its new version first")
    const existing = review.comments?.find((comment) => comment.developerComment)?.developerComment.text
    if (existing === receipt.reply) return
    if (existing) throw new Error("An existing Play reply needs owner review before replacement")
    await storeCall(`${url}:reply`, token, request, { replyText: receipt.reply })
  } else if (receipt.source === "appStore") {
    const snapshot = await readAppStoreReviews(appId, token, request)
    if (!snapshot.reviews.some((review) => review.id === item.id)) throw new Error("The App Store review changed; classify its new version first")
    const response = await request(`https://api.appstoreconnect.apple.com/v1/customerReviews/${encodeURIComponent(item.reviewId)}/response`, {
      method: "GET", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
    if (response.ok) {
      const existing = (await response.json()).data?.attributes?.responseBody
      if (existing === receipt.reply) return
      throw new Error("An existing App Store reply needs owner review before replacement")
    }
    if (response.status !== 404) throw new Error(`App Store reply lookup failed (HTTP ${response.status})`)
    await storeCall("https://api.appstoreconnect.apple.com/v1/customerReviewResponses", token, request, { data: {
      type: "customerReviewResponses", attributes: { responseBody: receipt.reply },
      relationships: { review: { data: { type: "customerReviews", id: item.reviewId } } } } })
  } else throw new Error("Unknown review source")
}

export const importReviewReplies = (snapshot, repoRoot = REPO_ROOT) => {
  if (!Array.isArray(snapshot?.posted) || !Array.isArray(snapshot.failures)) throw new Error("Invalid reply receipt artifact")
  for (const request of snapshot.posted) {
    const { source, id } = request.receipt
    if (!["play", "appStore"].includes(source)) throw new Error("Invalid reply receipt source")
    updateIntakeSource(source, (current) => {
      const item = current.pending[id]
      if (!item && current.completed[id]?.replyPosted) return current
      if (!item?.replyRequest || JSON.stringify(item.replyRequest) !== JSON.stringify(request)) throw new Error("Reply receipt does not match the saved request")
      return { ...current, pending: { ...current.pending, [id]: { ...item, replyPosted: true } } }
    }, repoRoot)
  }
  return { posted: snapshot.posted.length, failures: snapshot.failures }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  if (!(args.length === 1 && args[0] === "--prepare") && !(args.length === 2 && args[0] === "--import" && isAbsolute(args[1])) &&
      !(args.length === 3 && args[0] === "--post" && args[1] === "--output" && isAbsolute(args[2]))) { console.error(USAGE); process.exit(2) }
  let input
  if (args[0] !== "--import") {
    try { let body = ""; for await (const chunk of process.stdin) body += chunk; input = JSON.parse(body) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
  }
  try {
    if (args[0] === "--prepare") console.log(JSON.stringify(prepareReviewReply(input)))
    else if (args[0] === "--import") console.log(JSON.stringify(importReviewReplies(JSON.parse(readFileSync(args[1], "utf8")))))
    else {
      if (!Array.isArray(input)) throw new Error("Expected a prepared reply array")
      const snapshot = { posted: [], failures: [] }
      for (const entry of input) {
        try {
          if (replyDisposition(entry?.receipt) !== "send") throw new Error("This reply must remain a draft")
          const token = entry.receipt.source === "play" ? await playAccessToken(JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "null")) :
            appStoreToken({ keyId: process.env.APP_STORE_CONNECT_API_KEY_ID, issuerId: process.env.APP_STORE_CONNECT_API_ISSUER_ID, privateKey: process.env.APP_STORE_CONNECT_API_PRIVATE_KEY })
          await postReviewReply(entry, token)
          snapshot.posted.push(entry)
        } catch { snapshot.failures.push({ source: entry?.receipt?.source, id: entry?.receipt?.id, reason: "Reply was not confirmed; retain the pending request and inspect the source before retrying" }) }
      }
      writeFileSync(args[2], JSON.stringify(snapshot), { mode: 0o600 })
      console.log(JSON.stringify({ posted: snapshot.posted.length, failures: snapshot.failures.length }))
      if (snapshot.failures.length) process.exit(1)
    }
  } catch (error) { console.error(error.message); process.exit(1) }
}
