import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { intakeRun, intakeSource, saveIntakeSource } from "./auto-work-intake.mjs"
import { runBounded } from "./bounded-process.mjs"
import { REPO_ROOT, writeRunState } from "./run-state.mjs"

/**
 * No read-only Sentry token exists and no Sentry REST response has been verified, so the waiter
 * cannot list Sentry itself. It wakes the model on this period for the MCP listing instead.
 */
export const SENTRY_PERIOD_MILLISECONDS = 3_600_000
export const SENTRY_MODE = "mcp-hourly"
export const SENTRY_DETAIL = "The waiter has no read-only Sentry token; run the Sentry MCP listing of auto-work step 3."
export const REVIEW_WORKFLOW = "orbit-play-reviews.yml"
const REVIEW_ARTIFACTS = Object.freeze({ play: "orbit-play-reviews", appStore: "orbit-app-store-reviews" })
const REVIEW_RUN_SECONDS = 600
const REVIEW_POLL_MILLISECONDS = 15_000
const COMMAND_MILLISECONDS = 300_000

const lastLine = (text) => text.trim().split("\n").at(-1)?.trim() ?? ""
const commandFailure = (label, result) => result.error
  ? `${label} could not start: ${result.error.message}`
  : `${label} failed (${result.timedOut ? "timed out" : `exit ${result.status}`})${lastLine(result.stderr) ? `: ${lastLine(result.stderr)}` : ""}`
const parseOutput = (label, result) => {
  if (result.status !== 0) throw new Error(commandFailure(label, result))
  try { return JSON.parse(result.stdout) } catch { throw new Error(`${label} printed invalid JSON`) }
}

/** Runs one command from the checkout; the signal stops its process tree when the waiter ends. */
export const commandRunner = ({ repoRoot = REPO_ROOT, signal } = {}) => (file, args) =>
  runBounded(file, args, { cwd: repoRoot, env: process.env, timeoutMs: COMMAND_MILLISECONDS, signal })

/** An admitted ticket and a deferred ticket with its reason, so a changed admission is a new key. */
export const boardCheck = ({ run, repoRoot = REPO_ROOT }) => async () => {
  const result = await run(process.execPath, [join(repoRoot, "tools", "plan-queue.mjs"), "--board"])
  // plan-queue.mjs exits 1 with no stdout when the board holds no open ticket at all.
  if (result.status === 1 && !result.error && !result.stdout.trim()) return { keys: [] }
  const plan = parseOutput("plan-queue.mjs --board", result)
  if (!Array.isArray(plan.admitted) || !Array.isArray(plan.deferred)) throw new Error("plan-queue.mjs --board printed no admitted and deferred lists")
  return { keys: [...plan.admitted.map((ticket) => `admitted ${ticket.identifier}`),
    ...plan.deferred.map((ticket) => `deferred ${ticket.identifier} ${ticket.reason}`)] }
}

export const mailCheck = ({ run, repoRoot = REPO_ROOT }) => async () => {
  const listing = parseOutput("orbit-mail.mjs --unseen", await run(process.execPath, [join(repoRoot, "tools", "orbit-mail.mjs"), "--unseen"]))
  if (!Array.isArray(listing.unseen) || listing.unseen.some((id) => typeof id !== "string")) throw new Error("orbit-mail.mjs --unseen printed no id list")
  return { keys: listing.unseen }
}

/** Review keys are the pending ids that the model has not yet acknowledged. */
export const pendingReviewKeys = (intake) => [
  ...Object.keys(intake?.play?.pending ?? {}).map((id) => `play ${id}`),
  ...Object.keys(intake?.appStore?.pending ?? {}).map((id) => `appStore ${id}`),
]

const reviewCycle = (date) => `wake-${date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "")}`

const clearReviewCycle = (repoRoot) => {
  const { workflowCycle: _cleared, ...play } = intakeSource("play", repoRoot)
  saveIntakeSource("play", play, repoRoot)
}

const findReviewRun = async ({ run, cycle, sleep, now }) => {
  const deadline = now() + REVIEW_RUN_SECONDS * 1000
  let found
  for (;;) {
    const runs = parseOutput("gh run list", await run("gh", ["run", "list", "--workflow", REVIEW_WORKFLOW, "--event", "workflow_dispatch",
      "--branch", "main", "--limit", "100", "--json", "databaseId,displayTitle,status,conclusion"]))
    found = Array.isArray(runs) ? runs.find((entry) => entry.displayTitle === `Orbit review intake ${cycle}`) : undefined
    if (found?.status === "completed" || now() >= deadline) return found
    await sleep(Math.max(0, Math.min(REVIEW_POLL_MILLISECONDS, deadline - now())))
  }
}

const importArtifact = async ({ run, repoRoot, runId, name, tool }) => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-auto-work-wake-"))
  try {
    const download = await run("gh", ["run", "download", String(runId), "--name", name, "--dir", directory])
    if (download.status !== 0) throw new Error(commandFailure(`gh run download ${name}`, download))
    return parseOutput(`${tool} --import`, await run(process.execPath, [join(repoRoot, "tools", tool), "--import", join(directory, `${name}.json`)]))
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

/**
 * Performs the mechanical part of auto-work steps 5 and 6: dispatch the review workflow under a
 * persisted cycle, import every artifact of that exact run, then clear the cycle.
 */
export const reviewCheck = ({ run, repoRoot = REPO_ROOT, sleep = wait, now = Date.now }) => async () => {
  let cycle = intakeSource("play", repoRoot).workflowCycle
  if (!cycle) {
    cycle = reviewCycle(new Date(now()))
    saveIntakeSource("play", { ...intakeSource("play", repoRoot), workflowCycle: cycle }, repoRoot)
    const dispatch = await run("gh", ["workflow", "run", REVIEW_WORKFLOW, "--ref", "main", "-f", `cycle=${cycle}`])
    if (dispatch.status !== 0) { clearReviewCycle(repoRoot); throw new Error(commandFailure("gh workflow run", dispatch)) }
  }
  const found = await findReviewRun({ run, cycle, sleep, now })
  if (!found) { clearReviewCycle(repoRoot); throw new Error(`The review workflow run was not found within ${REVIEW_RUN_SECONDS} seconds`) }
  if (found.status !== "completed") throw new Error(`The review workflow run did not complete within ${REVIEW_RUN_SECONDS} seconds`)
  const names = parseOutput("gh api run artifacts", await run("gh", ["api", `repos/{owner}/{repo}/actions/runs/${found.databaseId}/artifacts`,
    "--jq", "[.artifacts[] | select(.expired | not) | .name]"]))
  // A completed run never gains an artifact later, so its cycle is cleared and the next interval dispatches again.
  if (!Array.isArray(names) || !names.includes(REVIEW_ARTIFACTS.play)) {
    clearReviewCycle(repoRoot)
    throw new Error(`The review workflow run ended ${found.conclusion} without the ${REVIEW_ARTIFACTS.play} artifact`)
  }
  const play = await importArtifact({ run, repoRoot, runId: found.databaseId, name: REVIEW_ARTIFACTS.play, tool: "orbit-play-reviews.mjs" })
  if (names.includes(REVIEW_ARTIFACTS.appStore)) {
    await importArtifact({ run, repoRoot, runId: found.databaseId, name: REVIEW_ARTIFACTS.appStore, tool: "orbit-app-store-reviews.mjs" })
  }
  clearReviewCycle(repoRoot)
  const failures = Array.isArray(play.failures) ? play.failures : []
  return { keys: pendingReviewKeys(intakeRun(repoRoot).intake),
    ...(failures.length ? { failure: `Play review collection failed: ${failures.map((entry) => `${entry.packageName} ${entry.reason}`).join("; ")}` } : {}) }
}

/** Seen keys, failure signatures and the Sentry listing time, all carried in run state. */
export const initialWakeMarks = (intake, nowMilliseconds) => {
  const marks = intake?.wake ?? {}
  return {
    seen: { reviews: pendingReviewKeys(intake), ...marks.seen },
    failures: { ...marks.failures },
    sentryListedAt: Number.isFinite(Date.parse(marks.sentryListedAt)) ? marks.sentryListedAt : new Date(nowMilliseconds).toISOString(),
  }
}

export const saveWakeMarks = (marks, repoRoot = REPO_ROOT) => {
  const state = intakeRun(repoRoot)
  writeRunState({ ...state, intake: { ...state.intake, wake: marks } }, repoRoot)
  if (JSON.stringify(intakeRun(repoRoot).intake?.wake) !== JSON.stringify(marks)) throw new Error("Wake marks write was not confirmed")
}

const failureSignature = (reason) => String(reason?.message ?? reason).slice(0, 300)

/** Turns settled checks into wakes; a check marked seed records its first keys without a wake. */
export const evaluateChecks = (checks, outcomes, marks, nowMilliseconds, sentryPeriodMilliseconds = SENTRY_PERIOD_MILLISECONDS) => {
  const next = { seen: { ...marks.seen }, failures: { ...marks.failures }, sentryListedAt: marks.sentryListedAt }
  const wakes = []
  checks.forEach((check, index) => {
    const outcome = outcomes[index]
    const failure = outcome.status === "rejected" ? failureSignature(outcome.reason) : outcome.value.failure
    if (failure) {
      if (next.failures[check.source] !== failure) wakes.push({ source: check.source, kind: "failure", failure })
      next.failures[check.source] = failure
    } else delete next.failures[check.source]
    if (outcome.status === "rejected") return
    const known = next.seen[check.source]
    const keys = outcome.value.keys
    next.seen[check.source] = keys
    if (known === undefined && check.seed) return
    const items = keys.filter((key) => !(known ?? []).includes(key))
    if (items.length) wakes.push({ source: check.source, kind: "new", items })
  })
  if (nowMilliseconds - Date.parse(next.sentryListedAt) >= sentryPeriodMilliseconds) {
    wakes.push({ source: "sentry", kind: "due", detail: SENTRY_DETAIL })
    next.sentryListedAt = new Date(nowMilliseconds).toISOString()
  }
  return { wakes, marks: next }
}

/**
 * Checks every source at each interval end and returns only when one has something new, a source
 * fails with a new signature, the Sentry listing is due or the owning mode changes.
 */
export const watchIntake = async ({ checks, marks, intervalMilliseconds, modeChanged, saveMarks,
  now = Date.now, sleep = wait, pollMilliseconds = 1000, sentryPeriodMilliseconds = SENTRY_PERIOD_MILLISECONDS }) => {
  let current = marks
  const settle = (selected) => Promise.allSettled(selected.map((check) => check.run()))
  // A seeded check with no baseline records one now, so an item that arrives in the first interval still wakes.
  const seeds = checks.filter((check) => check.seed && current.seen[check.source] === undefined)
  let running = seeds.length ? settle(seeds).then((outcomes) => ({ seeding: true, outcomes })) : null
  let settled = null
  let deadline = now() + intervalMilliseconds
  saveMarks(current)
  for (;;) {
    if (modeChanged()) return { reason: "MODE_CHANGED", marks: current }
    if (settled?.seeding) {
      const seen = { ...current.seen }
      seeds.forEach((check, index) => { if (settled.outcomes[index].status === "fulfilled") seen[check.source] = settled.outcomes[index].value.keys })
      current = { ...current, seen }
      saveMarks(current)
      settled = null
    } else if (settled) {
      const evaluated = evaluateChecks(checks, settled.outcomes, current, now(), sentryPeriodMilliseconds)
      settled = null
      if (JSON.stringify(evaluated.marks) !== JSON.stringify(current)) saveMarks(evaluated.marks)
      current = evaluated.marks
      if (evaluated.wakes.length) return { reason: "SOURCE", wakes: evaluated.wakes, marks: current }
      deadline = Math.max(deadline + intervalMilliseconds, now())
    }
    if (!running && now() >= deadline) running = settle(checks).then((outcomes) => ({ seeding: false, outcomes }))
    const pause = running ? pollMilliseconds : Math.max(0, Math.min(pollMilliseconds, deadline - now()))
    const outcome = running ? await Promise.race([running, sleep(pause).then(() => null)]) : await sleep(pause).then(() => null)
    if (outcome) { settled = outcome; running = null }
  }
}
