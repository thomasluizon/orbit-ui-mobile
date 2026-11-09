#!/usr/bin/env node
import { createSign, randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { googleToken } from "./lib/auto-work-google.mjs"
import { acknowledgeIntake, intakeRun, intakeSource, pendingReviewKeys, REVIEW_RUN_SECONDS, saveIntakeSource } from "./lib/auto-work-intake.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"
import { importAppStoreReviews } from "./orbit-app-store-reviews.mjs"

export const PLAY_PACKAGES = ["org.useorbit.app", "org.useorbit.app.staging"]
const REVIEW_WORKFLOW = "orbit-play-reviews.yml"
const REVIEW_ARTIFACTS = Object.freeze({ play: "orbit-play-reviews", appStore: "orbit-app-store-reviews" })
const REVIEW_POLL_MILLISECONDS = 15_000
const GH_MILLISECONDS = 60_000
const USAGE = `usage: orbit-play-reviews.mjs <--cycle | --collect --output <absolute file> | --import <absolute file> | --ack>
--cycle runs one review intake cycle from the Mac: it persists intake.play.workflowCycle, dispatches
${REVIEW_WORKFLOW} on main with that cycle (or resumes the persisted one), waits up to ${REVIEW_RUN_SECONDS} seconds
for the run whose displayTitle is "Orbit review intake <cycle>", imports its orbit-play-reviews artifact
and its orbit-app-store-reviews artifact when present, then clears the cycle.
Prints {keys, pending, backfillRequiredSince, failure?}: keys are "play <id>" and "appStore <id>" for
every pending review, and failure names partial Play collection failures.
--collect runs in trusted GitHub Actions using GOOGLE_PLAY_SERVICE_ACCOUNT_JSON from the environment.
Lists every available review page for both Orbit packages; writes a private artifact, never a key.
Google returns commented production reviews created or modified within the last week only.
--import loads that artifact into the owning auto-work run; ids include the review modification time.
--ack reads stdin JSON {id, classification, person, ticket?, reply?}; a person needs a saved reply.
Classifications: bug, feature request, question, billing, praise, spam, noise.
No review reply operation exists. Prints counts or the pending review list.
--help, -h print usage
exit codes: 0 success; 1 API, workflow, state or receipt failure (partial collection still writes an artifact); 2 invalid arguments or stdin`

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

const lastLine = (text) => text.trim().split("\n").at(-1)?.trim() ?? ""
const commandFailure = (label, result) => result.error
  ? `${label} could not start: ${result.error.message}`
  : `${label} failed (${result.timedOut ? "timed out" : `exit ${result.status}`})${lastLine(result.stderr) ? `: ${lastLine(result.stderr)}` : ""}`
const ghJson = async (run, label, args) => {
  const result = await run("gh", args)
  if (result.status !== 0 || result.error) throw new Error(commandFailure(label, result))
  try { return JSON.parse(result.stdout) } catch { throw new Error(`${label} printed invalid JSON`) }
}

/** The UTC second keeps cycles readable; the random suffix keeps two cycles in one second apart. */
export const reviewCycleName = (date, suffix = randomBytes(3).toString("hex")) =>
  `review-${date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "")}-${suffix}`

const clearReviewCycle = (repoRoot) => {
  const { workflowCycle: _cleared, ...play } = intakeSource("play", repoRoot)
  saveIntakeSource("play", play, repoRoot)
}

const findCycleRun = async ({ run, cycle, sleep, now }) => {
  const deadline = now() + REVIEW_RUN_SECONDS * 1000
  for (;;) {
    const runs = await ghJson(run, "gh run list", ["run", "list", "--workflow", REVIEW_WORKFLOW, "--event", "workflow_dispatch",
      "--branch", "main", "--limit", "100", "--json", "databaseId,displayTitle,status,conclusion"])
    const found = Array.isArray(runs) ? runs.find((entry) => entry.displayTitle === `Orbit review intake ${cycle}`) : undefined
    if (found?.status === "completed" || now() >= deadline) return found
    await sleep(Math.max(0, Math.min(REVIEW_POLL_MILLISECONDS, deadline - now())))
  }
}

const downloadArtifact = async ({ run, runId, name }) => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-review-cycle-"))
  try {
    const download = await run("gh", ["run", "download", String(runId), "--name", name, "--dir", directory])
    if (download.status !== 0 || download.error) throw new Error(commandFailure(`gh run download ${name}`, download))
    try { return JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8")) } catch { throw new Error(`The ${name} artifact held no readable ${name}.json`) }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

/**
 * The single implementation of auto-work steps 5 and 6: persist a cycle before dispatch, match the
 * exact run by its title, import every artifact of that run, then clear the cycle. A run that is
 * still in progress keeps its cycle, so the next call resumes it instead of dispatching again.
 */
export const collectReviewCycle = async ({ run, repoRoot = REPO_ROOT, sleep = wait, now = Date.now }) => {
  let cycle = intakeSource("play", repoRoot).workflowCycle
  if (!cycle) {
    cycle = reviewCycleName(new Date(now()))
    saveIntakeSource("play", { ...intakeSource("play", repoRoot), workflowCycle: cycle }, repoRoot)
    const dispatch = await run("gh", ["workflow", "run", REVIEW_WORKFLOW, "--ref", "main", "-f", `cycle=${cycle}`])
    if (dispatch.status !== 0 || dispatch.error) { clearReviewCycle(repoRoot); throw new Error(commandFailure("gh workflow run", dispatch)) }
  }
  const found = await findCycleRun({ run, cycle, sleep, now })
  if (!found) { clearReviewCycle(repoRoot); throw new Error(`The review workflow run was not found within ${REVIEW_RUN_SECONDS} seconds`) }
  if (found.status !== "completed") throw new Error(`The review workflow run did not complete within ${REVIEW_RUN_SECONDS} seconds`)
  const names = await ghJson(run, "gh api run artifacts", ["api", `repos/{owner}/{repo}/actions/runs/${found.databaseId}/artifacts`,
    "--jq", "[.artifacts[] | select(.expired | not) | .name]"])
  // A completed run never gains an artifact later, so its cycle is cleared and the next cycle dispatches again.
  if (!Array.isArray(names) || !names.includes(REVIEW_ARTIFACTS.play)) {
    clearReviewCycle(repoRoot)
    throw new Error(`The review workflow run ended ${found.conclusion} without the ${REVIEW_ARTIFACTS.play} artifact`)
  }
  const play = importPlayReviews(await downloadArtifact({ run, runId: found.databaseId, name: REVIEW_ARTIFACTS.play }), repoRoot)
  if (names.includes(REVIEW_ARTIFACTS.appStore)) {
    importAppStoreReviews(await downloadArtifact({ run, runId: found.databaseId, name: REVIEW_ARTIFACTS.appStore }), repoRoot)
  }
  clearReviewCycle(repoRoot)
  const { intake } = intakeRun(repoRoot)
  const pending = [...Object.values(intake?.play?.pending ?? {}).map((item) => ({ source: "play", ...item })),
    ...Object.values(intake?.appStore?.pending ?? {}).map((item) => ({ source: "appStore", ...item }))]
  return { keys: pendingReviewKeys(intake), pending, backfillRequiredSince: play.backfillRequiredSince,
    ...(play.failures.length ? { failure: `Play review collection failed: ${play.failures.map((entry) => `${entry.packageName} ${entry.reason}`).join("; ")}` } : {}) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  if (!(args.length === 1 && ["--ack", "--cycle"].includes(args[0])) && !(args.length === 2 && args[0] === "--import" && isAbsolute(args[1])) &&
      !(args.length === 3 && args[0] === "--collect" && args[1] === "--output" && isAbsolute(args[2]))) { console.error(USAGE); process.exit(2) }
  let receipt
  if (args[0] === "--ack") {
    try { let input = ""; for await (const chunk of process.stdin) input += chunk; receipt = JSON.parse(input) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
  }
  try {
    if (args[0] === "--cycle") {
      const run = (file, commandArgs) => runBounded(file, commandArgs, { cwd: REPO_ROOT, env: process.env, timeoutMs: GH_MILLISECONDS })
      console.log(JSON.stringify(await collectReviewCycle({ run })))
    } else if (args[0] === "--collect") {
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
