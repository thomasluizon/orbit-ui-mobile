/**
 * Keep the harness inside GitHub's GraphQL budget, and make running out survivable.
 *
 * WHY, measured on the unattended run of 2026-08-09. Eight `list-bot-threads.mjs` pollers were
 * launched at once, one per open pull request. Each polls every 30 seconds, and a `reviewThreads`
 * page is an expensive GraphQL document, so the 5,000 point hourly budget was exhausted THREE
 * separate times in one night. Each exhaustion cost roughly 20 to 50 minutes, about 90 minutes
 * total, and every one of those minutes was spent on work that produced nothing.
 *
 * Two independent defects, and both are fixed here because either alone leaves the hole open:
 *
 *   1. NOTHING capped concurrency. `caps.parallelTickets` bounds worker sessions, which are the
 *      expensive thing to run, but a poller is cheap to start and expensive to GitHub. Eight of them
 *      is eight times the burn rate with no gate anywhere in between.
 *
 *   2. Exhaustion was FATAL rather than a pause. `gh` returned "API rate limit already exceeded",
 *      the tool exited non-zero, and the pull request it was clearing simply stopped. Recovering
 *      meant a human reading `gh api rate_limit`, computing the reset, and sleeping by hand. A
 *      budget that refills on a known schedule is a wait, not a failure, and the tool can do that
 *      wait itself.
 *
 * The decision halves are pure so they can be tested without a network or a clock, which is the
 * only way a backoff path ever gets covered.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Leave headroom so the LAST call before the floor still completes instead of half-failing. */
export const DEFAULT_MIN_REMAINING = 200

/** A budget that says it refills further away than this is not something to sit on silently. */
export const DEFAULT_MAX_WAIT_SECONDS = 3900

/**
 * Should the caller spend a GraphQL call now, or wait for the window to refill?
 *
 * @param budget `{ remaining, reset }` as GitHub reports them, reset being epoch SECONDS
 * @param options `{ nowSeconds, minRemaining, maxWaitSeconds }`
 * @returns `{ action: "proceed" | "wait" | "refuse", waitSeconds, reason }`
 */
export const graphqlBudgetDecision = (budget, options = {}) => {
  const minRemaining = options.minRemaining ?? DEFAULT_MIN_REMAINING
  const maxWaitSeconds = options.maxWaitSeconds ?? DEFAULT_MAX_WAIT_SECONDS
  const nowSeconds = options.nowSeconds

  if (!Number.isFinite(nowSeconds)) return { action: "proceed", waitSeconds: 0, reason: "no clock was supplied, so the budget cannot be judged" }
  /** An unreadable budget must never become a reason to stop: the call itself is the better probe. */
  if (!budget || !Number.isFinite(budget.remaining) || !Number.isFinite(budget.reset)) {
    return { action: "proceed", waitSeconds: 0, reason: "the rate limit could not be read, so the call is attempted rather than refused" }
  }
  if (budget.remaining > minRemaining) {
    return { action: "proceed", waitSeconds: 0, reason: `${budget.remaining} GraphQL points remain` }
  }

  const waitSeconds = Math.max(0, Math.ceil(budget.reset - nowSeconds))
  /** Already past the reset: the window has rolled and the reported remaining is simply stale. */
  if (waitSeconds === 0) return { action: "proceed", waitSeconds: 0, reason: "the reported window already reset" }
  if (waitSeconds > maxWaitSeconds) {
    return {
      action: "refuse",
      waitSeconds,
      reason: `the GraphQL budget refills in ${waitSeconds}s, beyond the ${maxWaitSeconds}s this tool may wait; something else is consuming the quota`,
    }
  }
  return {
    action: "wait",
    waitSeconds,
    reason: `${budget.remaining} GraphQL points left of ${budget.limit ?? "?"}; waiting ${waitSeconds}s for the window to refill`,
  }
}

/** GitHub's own words for an exhausted budget, in both the shapes `gh` surfaces them. */
export const isRateLimitError = (text) =>
  typeof text === "string" && /rate limit (?:already )?exceeded|API rate limit/i.test(text)

/**
 * How many poll slots are genuinely held right now.
 *
 * A slot is a file named for the process that took it. Counting FILES would leak a slot every time
 * a poller is killed, which under `--sleep` means the cap tightens all night until nothing can run.
 * Counting live PIDs is self healing: a dead holder's slot is reclaimed by the next caller.
 *
 * @param entries slot file names
 * @param isAlive injected liveness predicate, so a test never has to conjure a live process
 */
export const liveSlots = (entries, isAlive) =>
  entries
    .map((entry) => Number.parseInt(String(entry).replace(/\.slot$/, ""), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && isAlive(pid))

const pidIsAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    /** EPERM means the process exists and belongs to somebody else, which still holds the slot. */
    return error?.code === "EPERM"
  }
}

/**
 * The GraphQL budget is per USER, not per repository, so ui, api and landing pollers all draw on
 * the same 5,000 points and the cap has to span them. A per-repo .git directory would let three
 * repositories run three full caps each, which is exactly the 8-poller burst that emptied it.
 */
export const DEFAULT_SLOT_ROOT = join(tmpdir(), "orbit-github-poll-slots")

const slotDirectory = (slotRoot) => slotRoot

/**
 * Take one of `maxSlots` concurrent GitHub polling slots, or report that they are all held.
 *
 * Advisory rather than locked, and deliberately so: the cost of two processes racing into the same
 * slot is one extra poll, while the cost of a real lock is a run that deadlocks at 03:00 because a
 * holder died between acquiring and releasing.
 */
export const acquirePollSlot = (slotRoot, maxSlots, pid = process.pid) => {
  const directory = slotDirectory(slotRoot)
  mkdirSync(directory, { recursive: true })
  const held = liveSlots(readdirSync(directory), pidIsAlive)
  /** Reclaim before refusing, so one killed worker cannot shrink the cap for everything after it. */
  for (const entry of readdirSync(directory)) {
    const owner = Number.parseInt(entry.replace(/\.slot$/, ""), 10)
    if (Number.isInteger(owner) && !held.includes(owner)) rmSync(join(directory, entry), { force: true })
  }
  if (held.length >= maxSlots && !held.includes(pid)) {
    return { acquired: false, held: held.length, maxSlots }
  }
  writeFileSync(join(directory, `${pid}.slot`), new Date().toISOString(), "utf8")
  return { acquired: true, held: held.length + 1, maxSlots }
}

/**
 * Run a GitHub call inside the budget, waiting for a refill rather than dying on one.
 *
 * The poller was only the loudest victim. EVERY tool that reads or writes GitHub spends from the
 * same per-user budget, so `record-readiness.mjs` died on a ticket read at the exact moment the
 * poller had been taught to survive: an instance fix where the class fix is one wrapper every caller
 * shares. Injected `readBudget` and `sleep` keep it testable without a network or a clock.
 *
 * @param run the call itself, returning `{ ok, detail }`; `detail` is the error text when not ok
 * @param io `{ readBudget, sleep, onWait }`
 */
export const withGraphqlBudget = async (run, io) => {
  const { readBudget, sleep, onWait = () => {} } = io
  const decide = async () => graphqlBudgetDecision(await readBudget(), { nowSeconds: Math.floor(Date.now() / 1000) })

  const before = await decide()
  if (before.action === "wait") {
    onWait(before)
    await sleep(before.waitSeconds)
  }

  const first = await run()
  if (first.ok || !isRateLimitError(first.detail)) return first

  /** Exactly one retry. A second exhaustion straight after a refill is real, not transient. */
  const after = await decide()
  if (after.action !== "wait") return first
  onWait(after)
  await sleep(after.waitSeconds)
  return run()
}

export const releasePollSlot = (slotRoot, pid = process.pid) => {
  const slot = join(slotDirectory(slotRoot), `${pid}.slot`)
  if (existsSync(slot)) rmSync(slot, { force: true })
}
