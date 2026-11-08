import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { importPlayReviews } from "../orbit-play-reviews.mjs"
import { importAppStoreReviews } from "../orbit-app-store-reviews.mjs"
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

const unchangedSources = () => [source("board", ["admitted #1"], { seed: true }), source("mail", []), source("reviews", ["play known"])]

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
  T("wake: a missing board baseline is seeded at start without a wake", idle.saved.some((marks) => marks.seen.board?.[0] === "admitted #1"))

  for (const [name, key] of [["mail", "m-new"], ["reviews", "play org.useorbit.app:r2:1.000000000"], ["board", "admitted #2"]]) {
    const checks = unchangedSources()
    const result = await watch({ checks, marks: startMarks({ board: ["admitted #1"] }), intervals: 5,
      between: (round) => { if (round === 1) { const changed = checks.find((check) => check.source === name); changed.keys = [...changed.keys, key] } } })
    T(`wake: a new ${name} item exits naming the source and the item`, result.reason === "SOURCE" && result.rounds === 2 &&
      JSON.stringify(result.wakes) === JSON.stringify([{ source: name, kind: "new", items: [key] }]), JSON.stringify(result))
    T(`wake: the ${name} item is recorded as seen`, result.marks.seen[name].includes(key))
  }

  const changedAdmission = evaluateChecks([{ source: "board", seed: true }],
    [{ status: "fulfilled", value: { keys: ["admitted #3"] } }], startMarks({ board: ["deferred #3 BLOCKED_OUTSIDE_QUEUE"] }), Date.now())
  T("wake: a changed admission is a new board item", changedAdmission.wakes[0]?.items?.[0] === "admitted #3")
  const closed = evaluateChecks([{ source: "board", seed: true }], [{ status: "fulfilled", value: { keys: [] } }], startMarks({ board: ["admitted #3"] }), Date.now())
  T("wake: a ticket leaving the board updates the baseline without a wake", closed.wakes.length === 0 && closed.marks.seen.board.length === 0)

  const sentry = await watch({ checks: unchangedSources(), marks: { ...startMarks({ board: ["admitted #1"] }), sentryListedAt: new Date(Date.now() - 50).toISOString() },
    intervals: 5, sentryPeriodMilliseconds: 40 })
  T("wake: a due Sentry listing exits once with the MCP fallback", sentry.reason === "SOURCE" && sentry.rounds === 1 &&
    JSON.stringify(sentry.wakes) === JSON.stringify([{ source: "sentry", kind: "due", detail: SENTRY_DETAIL }]) &&
    Date.now() - Date.parse(sentry.marks.sentryListedAt) < 1000, JSON.stringify(sentry))
  const notDue = evaluateChecks([], [], { ...startMarks(), sentryListedAt: new Date(Date.now() - 3_000_000).toISOString() }, Date.now())
  T("wake: the Sentry listing waits a whole hour by default", notDue.wakes.length === 0)

  const broken = unchangedSources()
  broken[1].error = "orbit-mail.mjs --unseen failed (exit 1): Gmail GET failed (HTTP 503)"
  const first = await watch({ checks: broken, marks: startMarks({ board: ["admitted #1"] }), intervals: 5 })
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
  const pinned = await watch({ checks: unchangedSources(), marks: { ...startMarks({ board: ["admitted #1"], mail: ["m-held"] }) }, intervals: 2 })
  T("wake: a seen item does not wake again while it stays unseen in state", pinned.reason === "MODE_CHANGED" && pinned.marks.seen.mail.length === 0)
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
  const plan = { admitted: [{ identifier: "#5" }], deferred: [{ identifier: "#6", reason: "NEEDS_CONVERSATION" }] }
  const calls = []
  const board = await boardCheck({ repoRoot: "/checkout", run: async (file, args) => { calls.push([file, ...args]); return ok(plan) } })()
  T("wake: the board check reads plan-queue.mjs --board", calls[0][1] === "/checkout/tools/plan-queue.mjs" && calls[0][2] === "--board" &&
    JSON.stringify(board.keys) === JSON.stringify(["admitted #5", "deferred #6 NEEDS_CONVERSATION"]))
  const empty = await boardCheck({ run: async () => failed("scope resolved to no tickets") })()
  T("wake: an empty board is no tickets, not a failure", empty.keys.length === 0)
  let message = ""
  try { await boardCheck({ run: async () => failed("environment error\nGITHUB_TOKEN missing", 2) })() } catch (error) { message = error.message }
  T("wake: a board environment error names its last stderr line", message === "plan-queue.mjs --board failed (exit 2): GITHUB_TOKEN missing", message)
  const mail = await mailCheck({ repoRoot: "/checkout", run: async (file, args) => { calls.push([file, ...args]); return ok({ unseen: ["m9"] }) } })()
  T("wake: the mail check lists unseen ids only", calls[1][1] === "/checkout/tools/orbit-mail.mjs" && calls[1][2] === "--unseen" && mail.keys[0] === "m9")
  message = ""
  try { await mailCheck({ run: async () => ok("not json") })() } catch (error) { message = error.message }
  T("wake: invalid mail output is a failure", message === "orbit-mail.mjs --unseen printed invalid JSON")
}

/** A gh and import stand-in: the import commands run the real importers against the fixture checkout. */
const reviewRunner = (checkout, { artifacts = ["orbit-app-store-reviews", "orbit-play-reviews"], dispatchStatus = 0, completed = true } = {}) => {
  const log = []
  let cycle = null
  const snapshot = { play: { collectedAt: "2026-11-08T22:45:20.000Z", packages: ["org.useorbit.app", "org.useorbit.app.staging"],
    reviews: [{ id: "org.useorbit.app:r2:1.000000000", packageName: "org.useorbit.app", reviewId: "r2", version: "1.000000000", text: "Bom" }], failures: [] },
  appStore: { appId: "6831372835", collectedAt: "2026-11-08T22:45:45.018Z", reviews: [] } }
  const run = async (file, args) => {
    log.push({ file, args, workflowCycle: intakeSource("play", checkout).workflowCycle })
    if (file === "gh" && args[0] === "workflow") { cycle = args.at(-1).slice("cycle=".length); return dispatchStatus === 0 ? ok("") : failed("HTTP 422", dispatchStatus) }
    if (file === "gh" && args[0] === "run" && args[1] === "list") {
      return ok([{ databaseId: 7, displayTitle: "Orbit review intake unrelated", status: "completed", conclusion: "success" },
        { databaseId: 8, displayTitle: `Orbit review intake ${cycle}`, status: completed ? "completed" : "in_progress", conclusion: completed ? "success" : "" }])
    }
    if (file === "gh" && args[0] === "api") return ok(artifacts)
    if (file === "gh" && args[0] === "run" && args[1] === "download") {
      writeFileSync(join(args[6], `${args[4]}.json`), JSON.stringify(args[4] === "orbit-play-reviews" ? snapshot.play : snapshot.appStore))
      return ok("")
    }
    const contents = JSON.parse(readFileSync(args[2], "utf8"))
    return ok(args[0].endsWith("orbit-play-reviews.mjs") ? importPlayReviews(contents, checkout) : importAppStoreReviews(contents, checkout))
  }
  return { run, log, cycle: () => cycle }
}

const reviewCases = async () => {
  const checkout = fresh("reviews")
  const runner = reviewRunner(checkout)
  const clock = Date.parse("2026-11-08T23:00:00.000Z")
  const result = await reviewCheck({ run: runner.run, repoRoot: checkout, sleep: async () => {}, now: () => clock })()
  const dispatch = runner.log.find((call) => call.args[0] === "workflow")
  T("wake: the review cycle is persisted before dispatch", dispatch.workflowCycle === "wake-20261108T230000" &&
    JSON.stringify(dispatch.args) === JSON.stringify(["workflow", "run", "orbit-play-reviews.yml", "--ref", "main", "-f", "cycle=wake-20261108T230000"]))
  T("wake: only the exact cycle run is downloaded", runner.log.filter((call) => call.args[1] === "download").every((call) => call.args[2] === "8") &&
    runner.log.filter((call) => call.args[1] === "download").length === 2)
  T("wake: imported reviews become keys and the cycle clears", JSON.stringify(result.keys) === JSON.stringify(["play org.useorbit.app:r2:1.000000000"]) &&
    intakeSource("play", checkout).workflowCycle === undefined && intakeSource("appStore", checkout).lastCollectedAt === "2026-11-08T22:45:45.018Z" &&
    intakeSource("play", checkout).lastCollectedAt === "2026-11-08T22:45:20.000Z" && result.failure === undefined, JSON.stringify(result))

  const resumed = fresh("reviews-resume")
  saveIntakeSource("play", { ...intakeSource("play", resumed), workflowCycle: "4b980cf7-c1-20261108T2245" }, resumed)
  const resume = reviewRunner(resumed)
  await reviewCheck({ run: async (file, args) => {
    if (file === "gh" && args[0] === "run" && args[1] === "list") return ok([{ databaseId: 9, displayTitle: "Orbit review intake 4b980cf7-c1-20261108T2245", status: "completed", conclusion: "success" }])
    return resume.run(file, args)
  }, repoRoot: resumed, sleep: async () => {} })()
  T("wake: a persisted cycle reuses its run without a dispatch", !resume.log.some((call) => call.args[0] === "workflow") &&
    resume.log.some((call) => call.args[1] === "download" && call.args[2] === "9"))

  for (const [label, options, expected, keepsCycle] of [
    ["dispatch", { dispatchStatus: 1 }, "gh workflow run failed (exit 1): HTTP 422", false],
    ["artifact", { artifacts: ["orbit-app-store-reviews"] }, "The review workflow run ended success without the orbit-play-reviews artifact", false],
    ["slow", { completed: false }, "The review workflow run did not complete within 600 seconds", true],
  ]) {
    const failing = fresh(`reviews-${label}`)
    let elapsed = 0
    let message = ""
    try {
      await reviewCheck({ run: reviewRunner(failing, options).run, repoRoot: failing, sleep: async (milliseconds) => { elapsed += milliseconds }, now: () => clock + elapsed })()
    } catch (error) { message = error.message }
    T(`wake: a review ${label} failure has a stable signature`, message === expected, message)
    T(`wake: a review ${label} failure ${keepsCycle ? "keeps" : "clears"} its cycle`, Boolean(intakeSource("play", failing).workflowCycle) === keepsCycle)
  }
}

export const cases = async () => {
  await watcherCases()
  stateCases()
  await commandCases()
  await reviewCases()
}
