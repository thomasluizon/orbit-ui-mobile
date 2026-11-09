import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { intakeSource, saveIntakeSource } from "../lib/auto-work-intake.mjs"
import { boardCheck, evaluateChecks, initialWakeMarks, mailCheck, reviewCheck, saveWakeMarks, SENTRY_DETAIL, watchIntake } from "../lib/auto-work-wake.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, root } from "./_harness.mjs"

const fresh = (label) => {
  const checkout = join(root, "auto-work-wake", label)
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "wake", sleep: true, autoWork: true, remaining: [] }, checkout)
  return checkout
}

const ok = (stdout, status = 0) => ({ status, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "", timedOut: false })
const failed = (stderr, status = 1) => ({ status, stdout: "", stderr, timedOut: false })

/** Fake check sources: each returns the same keys until a test changes them. */
const source = (name, keys, options = {}) => {
  const check = { source: name, calls: 0, keys, error: null, ...options }
  check.run = async () => {
    check.calls++
    if (check.error) throw new Error(check.error)
    return { keys: check.keys }
  }
  return check
}

const BOARD_KEY = "#2065 2026-11-08T22:53:42Z blocked by #2064"
const unchangedSources = () => [source("board", [BOARD_KEY], { seed: true }), source("mail", []), source("reviews", ["play known"])]

/**
 * Watches with a short interval and stops, as the owning mode would, once round `intervals + 1`
 * starts: a round starts only after the previous one was evaluated without a wake.
 */
const watch = async ({ checks, marks, intervals, sentryPeriodMilliseconds, between = () => {} }) => {
  const before = new Map(checks.map((check) => [check, check.calls + (check.seed && marks.seen[check.source] === undefined ? 1 : 0)]))
  const started = () => Math.min(...checks.map((check) => check.calls - before.get(check)))
  const saved = []
  let announced = 0
  const result = await watchIntake({ checks, marks, intervalMilliseconds: 20, pollMilliseconds: 2, sentryPeriodMilliseconds,
    saveMarks: (value) => saved.push(value),
    modeChanged: () => {
      const count = started()
      if (count > announced) { announced = count; between(count) }
      return count > intervals
    } })
  return { ...result, rounds: result.reason === "SOURCE" ? started() : started() - 1, saved }
}

const startMarks = (seen = {}) => ({ seen: { reviews: ["play known"], ...seen }, failures: {}, sentryListedAt: new Date().toISOString() })

const watcherCases = async () => {
  const quiet = unchangedSources()
  const idle = await watch({ checks: quiet, marks: startMarks(), intervals: 3 })
  T("wake: three unchanged intervals check every source and do not exit", idle.reason === "MODE_CHANGED" && idle.rounds === 3 &&
    quiet.every((check) => check.calls >= 3) && idle.wakes === undefined, JSON.stringify(idle))
  T("wake: a missing board baseline is seeded at start without a wake", idle.saved.some((marks) => marks.seen.board?.[0] === BOARD_KEY))

  for (const [name, key] of [["mail", "m-new"], ["reviews", "play org.useorbit.app:r2:1.000000000"], ["board", "#2076 2026-11-08T23:33:14Z"]]) {
    const checks = unchangedSources()
    const result = await watch({ checks, marks: startMarks({ board: [BOARD_KEY] }), intervals: 5,
      between: (round) => { if (round === 1) { const changed = checks.find((check) => check.source === name); changed.keys = [...changed.keys, key] } } })
    T(`wake: a new ${name} item exits naming the source and the item`, result.reason === "SOURCE" && result.rounds === 2 &&
      JSON.stringify(result.wakes) === JSON.stringify([{ source: name, kind: "new", items: [key] }]), JSON.stringify(result))
    T(`wake: the ${name} item is recorded as seen`, result.marks.seen[name].includes(key))
  }

  const unblocked = evaluateChecks([{ source: "board", seed: true }],
    [{ status: "fulfilled", value: { keys: ["#2065 2026-11-08T22:53:42Z"] } }], startMarks({ board: [BOARD_KEY] }), Date.now())
  T("wake: a blocker that closes changes the board key and wakes", unblocked.wakes[0]?.items?.[0] === "#2065 2026-11-08T22:53:42Z", JSON.stringify(unblocked))
  const closed = evaluateChecks([{ source: "board", seed: true }], [{ status: "fulfilled", value: { keys: [] } }], startMarks({ board: [BOARD_KEY] }), Date.now())
  T("wake: a ticket leaving the board updates the baseline without a wake", closed.wakes.length === 0 && closed.marks.seen.board.length === 0)
  const unreadable = evaluateChecks([{ source: "board", seed: true }],
    [{ status: "rejected", reason: new Error("gh api graphql board state returned no issues nodes array") }], startMarks({ board: [BOARD_KEY] }), Date.now())
  T("wake: a failed board read keeps the baseline and is never an empty board", unreadable.marks.seen.board[0] === BOARD_KEY &&
    JSON.stringify(unreadable.wakes) === JSON.stringify([{ source: "board", kind: "failure", failure: "gh api graphql board state returned no issues nodes array" }]),
  JSON.stringify(unreadable))

  const sentry = await watch({ checks: unchangedSources(), marks: { ...startMarks({ board: [BOARD_KEY] }), sentryListedAt: new Date(Date.now() - 50).toISOString() },
    intervals: 5, sentryPeriodMilliseconds: 40 })
  T("wake: a due Sentry listing exits once with the MCP fallback", sentry.reason === "SOURCE" && sentry.rounds === 1 &&
    JSON.stringify(sentry.wakes) === JSON.stringify([{ source: "sentry", kind: "due", detail: SENTRY_DETAIL }]) &&
    Date.now() - Date.parse(sentry.marks.sentryListedAt) < 1000, JSON.stringify(sentry))
  const notDue = evaluateChecks([], [], { ...startMarks(), sentryListedAt: new Date(Date.now() - 3_000_000).toISOString() }, Date.now())
  T("wake: the Sentry listing waits a whole hour by default", notDue.wakes.length === 0)

  const broken = unchangedSources()
  broken[1].error = "orbit-mail.mjs --unseen failed (exit 1): Gmail GET failed (HTTP 503)"
  const first = await watch({ checks: broken, marks: startMarks({ board: [BOARD_KEY] }), intervals: 5 })
  T("wake: a source failure exits with its signature", first.reason === "SOURCE" && first.rounds === 1 &&
    JSON.stringify(first.wakes) === JSON.stringify([{ source: "mail", kind: "failure", failure: broken[1].error }]), JSON.stringify(first))
  const repeated = await watch({ checks: broken, marks: first.marks, intervals: 3 })
  T("wake: a repeated identical failure exits only once", repeated.reason === "MODE_CHANGED" && repeated.rounds === 3, JSON.stringify(repeated))
  broken[1].error = "orbit-mail.mjs --unseen failed (exit 1): Gmail Keychain credential unavailable"
  const different = await watch({ checks: broken, marks: repeated.marks, intervals: 5 })
  T("wake: a different failure signature exits again", different.reason === "SOURCE" && different.wakes[0].failure === broken[1].error)
  broken[1].error = null
  const recovered = await watch({ checks: broken, marks: different.marks, intervals: 1 })
  T("wake: a recovered source clears its failure signature", recovered.marks.failures.mail === undefined)

  const held = unchangedSources()
  held[1].keys = ["m-held"]
  const pinned = await watch({ checks: held, marks: startMarks({ board: [BOARD_KEY], mail: ["m-held"] }), intervals: 2 })
  T("wake: a seen item does not wake again while it stays unseen in state", pinned.reason === "MODE_CHANGED" && pinned.rounds === 2 &&
    pinned.marks.seen.mail[0] === "m-held" && pinned.wakes === undefined, JSON.stringify(pinned))
  const collected = await watch({ checks: unchangedSources(), marks: startMarks({ board: [BOARD_KEY], mail: ["m-held"] }), intervals: 1 })
  T("wake: a collected item leaves the seen list without a wake", collected.reason === "MODE_CHANGED" && collected.rounds === 1 &&
    collected.marks.seen.mail.length === 0 && collected.wakes === undefined, JSON.stringify(collected))
}

const stateCases = () => {
  const checkout = fresh("marks")
  saveIntakeSource("play", { completed: {}, pending: { r1: { id: "r1" } }, highWater: null }, checkout)
  saveIntakeSource("appStore", { completed: {}, pending: { a1: { id: "a1" } }, highWater: null }, checkout)
  const marks = initialWakeMarks(readRunState(checkout).intake, Date.parse("2026-11-08T00:00:00.000Z"))
  T("wake: pending reviews the model already holds are seeded as seen", JSON.stringify(marks.seen.reviews) === JSON.stringify(["play r1", "appStore a1"]) &&
    marks.sentryListedAt === "2026-11-08T00:00:00.000Z" && marks.seen.board === undefined)
  saveWakeMarks(marks, checkout)
  T("wake: marks persist in intake.wake beside the source state", JSON.stringify(readRunState(checkout).intake.wake) === JSON.stringify(marks) &&
    intakeSource("play", checkout).pending.r1.id === "r1")
  writeRunState({ ...readRunState(checkout), sessionId: "child", relay: { from: "wake" } }, checkout)
  T("wake: a relay carries the wake marks", JSON.stringify(initialWakeMarks(readRunState(checkout).intake, Date.now())) === JSON.stringify(marks))
}

const commandCases = async () => {
  // The entries match listBoardState, whose fields come from a live BoardState page.
  const board = await boardCheck({ listBoard: async () => [{ number: 1563, updatedAt: "2026-11-07T14:43:59Z", openBlockers: [1560] },
    { number: 2076, updatedAt: "2026-11-08T23:33:14Z", openBlockers: [] }] })()
  T("wake: a board key is the ticket, its last update and its open blockers", JSON.stringify(board.keys) ===
    JSON.stringify(["#1563 2026-11-07T14:43:59Z blocked by #1560", "#2076 2026-11-08T23:33:14Z"]), JSON.stringify(board))
  T("wake: a proven empty board has no keys", (await boardCheck({ listBoard: async () => [] })()).keys.length === 0)
  let message = ""
  try { await boardCheck({ listBoard: async () => { throw new Error("gh api graphql board state returned no issues nodes array") } })() } catch (error) { message = error.message }
  T("wake: a failed board read rejects instead of returning an empty board", message === "gh api graphql board state returned no issues nodes array", message)

  const calls = []
  const mail = await mailCheck({ repoRoot: "/checkout", run: async (file, args) => { calls.push([file, ...args]); return ok({ unseen: ["m9"] }) } })()
  T("wake: the mail check lists unseen ids only", calls[0][1] === "/checkout/tools/orbit-mail.mjs" && calls[0][2] === "--unseen" && mail.keys[0] === "m9")
  message = ""
  try { await mailCheck({ run: async () => ok("not json") })() } catch (error) { message = error.message }
  T("wake: invalid mail output is a failure", message === "orbit-mail.mjs --unseen printed invalid JSON")

  const reviewCalls = []
  const failure = "Play review collection failed: org.useorbit.app.staging Play reviews failed (HTTP 403)"
  const reviews = await reviewCheck({ repoRoot: "/checkout", run: async (file, args, options) => {
    reviewCalls.push({ file, args, options })
    return ok({ keys: ["play org.useorbit.app:r2:1.000000000"], pending: [], backfillRequiredSince: null, failure })
  } })()
  T("wake: the review check runs the one review cycle command with a budget past its run wait",
    reviewCalls[0].file === process.execPath && JSON.stringify(reviewCalls[0].args) === JSON.stringify(["/checkout/tools/orbit-play-reviews.mjs", "--cycle"]) &&
    reviewCalls[0].options.timeoutMs > 600_000, JSON.stringify(reviewCalls))
  T("wake: the review cycle keys and partial failure pass through", reviews.keys[0] === "play org.useorbit.app:r2:1.000000000" && reviews.failure === failure,
    JSON.stringify(reviews))
  message = ""
  try { await reviewCheck({ run: async () => failed("The review workflow run did not complete within 600 seconds") })() } catch (error) { message = error.message }
  T("wake: a failed review cycle names its last stderr line",
    message === "orbit-play-reviews.mjs --cycle failed (exit 1): The review workflow run did not complete within 600 seconds", message)
}

export const cases = async () => {
  await watcherCases()
  stateCases()
  await commandCases()
}
