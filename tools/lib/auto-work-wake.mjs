import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { intakeRun, pendingReviewKeys, REVIEW_RUN_SECONDS } from "./auto-work-intake.mjs"
import { runBounded } from "./bounded-process.mjs"
import { listBoardState } from "./github-issues.mjs"
import { REPO_ROOT, writeRunState } from "./run-state.mjs"

/**
 * No read-only Sentry token exists and no Sentry REST response has been verified, so the waiter
 * cannot list Sentry itself. It wakes the model on this period for the MCP listing instead.
 */
export const SENTRY_PERIOD_MILLISECONDS = 3_600_000
export const SENTRY_MODE = "mcp-hourly"
export const SENTRY_DETAIL = "The waiter has no read-only Sentry token; run the Sentry MCP listing of auto-work step 3."
const COMMAND_MILLISECONDS = 120_000
/** The review cycle waits for its workflow run, so its budget covers that wait and the imports. */
const REVIEW_CYCLE_MILLISECONDS = REVIEW_RUN_SECONDS * 1000 + COMMAND_MILLISECONDS

const lastLine = (text) => text.trim().split("\n").at(-1)?.trim() ?? ""
const commandFailure = (label, result) => result.error
  ? `${label} could not start: ${result.error.message}`
  : `${label} failed (${result.timedOut ? "timed out" : `exit ${result.status}`})${lastLine(result.stderr) ? `: ${lastLine(result.stderr)}` : ""}`
const parseOutput = (label, result) => {
  if (result.status !== 0 || result.error) throw new Error(commandFailure(label, result))
  try { return JSON.parse(result.stdout) } catch { throw new Error(`${label} printed invalid JSON`) }
}

/** Runs one command from the checkout; the signal stops its process tree when the waiter ends. */
export const commandRunner = ({ repoRoot = REPO_ROOT, signal } = {}) => (file, args, { timeoutMs = COMMAND_MILLISECONDS } = {}) =>
  runBounded(file, args, { cwd: repoRoot, env: process.env, timeoutMs, signal })

/**
 * One key per open board ticket: its last update and its open blockers. A new ticket, an edit, or a
 * blocker that closes is a new key; the read makes no model call and depends only on board state.
 */
const boardKey = (ticket) => `#${ticket.number} ${ticket.updatedAt}${ticket.openBlockers.length ? ` blocked by ${ticket.openBlockers.map((number) => `#${number}`).join(" ")}` : ""}`

export const boardCheck = ({ listBoard = listBoardState } = {}) => async () => ({ keys: (await listBoard()).map(boardKey) })

export const mailCheck = ({ run, repoRoot = REPO_ROOT }) => async () => {
  const listing = parseOutput("orbit-mail.mjs --unseen", await run(process.execPath, [join(repoRoot, "tools", "orbit-mail.mjs"), "--unseen"]))
  if (!Array.isArray(listing.unseen) || listing.unseen.some((id) => typeof id !== "string")) throw new Error("orbit-mail.mjs --unseen printed no id list")
  return { keys: listing.unseen }
}

/** Runs the one review cycle command that auto-work step 5 also runs, and keeps its keys and failure. */
export const reviewCheck = ({ run, repoRoot = REPO_ROOT }) => async () => {
  const cycle = parseOutput("orbit-play-reviews.mjs --cycle", await run(process.execPath, [join(repoRoot, "tools", "orbit-play-reviews.mjs"), "--cycle"],
    { timeoutMs: REVIEW_CYCLE_MILLISECONDS }))
  if (!Array.isArray(cycle.keys) || cycle.keys.some((key) => typeof key !== "string")) throw new Error("orbit-play-reviews.mjs --cycle printed no key list")
  return { keys: cycle.keys, ...(typeof cycle.failure === "string" ? { failure: cycle.failure } : {}) }
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
