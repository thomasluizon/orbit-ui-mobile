import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  DEFAULT_MAX_WAIT_SECONDS,
  acquirePollSlot,
  graphqlBudgetDecision,
  isRateLimitError,
  liveSlots,
  releasePollSlot,
  withGraphqlBudget,
} from "../lib/github-rate-limit.mjs"

import { T } from "./_harness.mjs"

const UNIT = "lib/github-rate-limit.mjs"

export const cases = async () => {
  const NOW = 1786302352

  /**
   * WHY this module exists, measured 2026-08-09: eight pollers emptied the 5,000 point GraphQL
   * budget three times in one night, roughly 90 minutes lost to waiting on a self-inflicted stall.
   */
  T(`${UNIT}: a healthy budget is spent rather than second-guessed`,
    graphqlBudgetDecision({ remaining: 4800, reset: NOW + 600, limit: 5000 }, { nowSeconds: NOW }).action === "proceed",
  )

  const exhausted = graphqlBudgetDecision({ remaining: 0, reset: NOW + 900, limit: 5000 }, { nowSeconds: NOW })
  T(`${UNIT}: an exhausted budget WAITS for the refill instead of failing the run`,
    exhausted.action === "wait" && exhausted.waitSeconds === 900,
    JSON.stringify(exhausted),
  )

  /** The floor exists so the LAST call before it still completes instead of half-failing. */
  T(`${UNIT}: the floor is crossed before zero, not at it`,
    graphqlBudgetDecision({ remaining: 150, reset: NOW + 120, limit: 5000 }, { nowSeconds: NOW }).action === "wait",
  )

  /**
   * An unreadable budget must never become a reason to stop. The call itself is the better probe,
   * and refusing on a failed `gh api rate_limit` would turn one flaky read into a dead pull request.
   */
  for (const [label, budget] of [["null", null], ["no reset", { remaining: 0 }], ["no remaining", { reset: NOW + 10 }]]) {
    T(
      `${UNIT}: an unreadable budget (${label}) proceeds rather than refusing`,
      graphqlBudgetDecision(budget, { nowSeconds: NOW }).action === "proceed",
    )
  }

  /** A reset already in the past means the window rolled and `remaining` is simply stale. */
  T(`${UNIT}: a reset already past proceeds instead of waiting on a dead clock`,
    graphqlBudgetDecision({ remaining: 0, reset: NOW - 5 }, { nowSeconds: NOW }).action === "proceed",
  )

  /** Sitting silently on an hour-long wait is how a run looks finished while it is asleep. */
  const absurd = graphqlBudgetDecision({ remaining: 0, reset: NOW + DEFAULT_MAX_WAIT_SECONDS + 60 }, { nowSeconds: NOW })
  T(`${UNIT}: a refill beyond the tool's patience is refused with the reason, never slept on`,
    absurd.action === "refuse" && absurd.reason.includes("consuming the quota"),
    JSON.stringify(absurd),
  )

  for (const text of [
    "gh: API rate limit already exceeded for user ID 72260917.",
    "GraphQL: API rate limit exceeded for user ID 72260917.",
  ]) {
    T(`${UNIT}: the live exhaustion message is recognised (${text.slice(0, 18)})`, isRateLimitError(text))
  }
  T(`${UNIT}: an ordinary error is not read as a rate limit`, !isRateLimitError("gh: not found"))
  T(`${UNIT}: a non-string error detail is not read as a rate limit`, !isRateLimitError(null))

  /**
   * Counting FILES would leak a slot every time a poller is killed, and under --sleep that means the
   * cap tightens all night until nothing can run. Liveness is what makes it self healing.
   */
  const alive = new Set([101, 102])
  T(`${UNIT}: only live holders count, so a killed poller's slot is reclaimed`,
    liveSlots(["101.slot", "102.slot", "999.slot"], (pid) => alive.has(pid)).length === 2,
  )
  T(`${UNIT}: a slot file that names no pid is ignored rather than counted`,
    liveSlots(["not-a-pid.slot", "101.slot"], (pid) => alive.has(pid)).length === 1,
  )

  /**
   * The poller was only the loudest victim. Every tool that touches GitHub spends the same per-user
   * budget, and `record-readiness.mjs` died on a ticket read at the exact moment the poller had been
   * taught to survive. This wrapper is what every caller shares.
   */
  const budgetHarness = (budgets, results) => {
    const slept = []
    const waits = []
    let call = 0
    return {
      slept,
      waits,
      calls: () => call,
      io: {
        readBudget: async () => budgets.shift(),
        sleep: async (seconds) => slept.push(seconds),
        onWait: (decision) => waits.push(decision.waitSeconds),
      },
      run: async () => results[call++],
    }
  }

  const healthy = budgetHarness([{ remaining: 4000, reset: NOW + 60 }], [{ ok: true, detail: "" }])
  T(
    `${UNIT}: a healthy budget runs the call once and never sleeps`,
    (await withGraphqlBudget(healthy.run, healthy.io)).ok === true && healthy.slept.length === 0 && healthy.calls() === 1,
    JSON.stringify({ slept: healthy.slept, calls: healthy.calls() }),
  )

  const exhaustedThenOk = budgetHarness(
    [{ remaining: 0, reset: NOW + 300 }],
    [{ ok: true, detail: "" }],
  )
  await withGraphqlBudget(exhaustedThenOk.run, { ...exhaustedThenOk.io, readBudget: async () => ({ remaining: 0, reset: Math.floor(Date.now() / 1000) + 300 }) })
  T(
    `${UNIT}: an empty budget sleeps BEFORE spending, rather than burning the call`,
    exhaustedThenOk.slept.length === 1 && exhaustedThenOk.calls() === 1,
    JSON.stringify({ slept: exhaustedThenOk.slept, calls: exhaustedThenOk.calls() }),
  )

  /** The measured failure: the call goes out, GitHub refuses it, and the tool used to die there. */
  let budgetReads = 0
  const retried = { calls: 0 }
  const retryResult = await withGraphqlBudget(
    async () => {
      retried.calls += 1
      return retried.calls === 1
        ? { ok: false, detail: "gh: API rate limit already exceeded for user ID 72260917." }
        : { ok: true, detail: "" }
    },
    {
      readBudget: async () => {
        budgetReads += 1
        return budgetReads === 1 ? { remaining: 4000, reset: Math.floor(Date.now() / 1000) + 60 } : { remaining: 0, reset: Math.floor(Date.now() / 1000) + 120 }
      },
      sleep: async () => {},
    },
  )
  T(
    `${UNIT}: a rate-limit refusal waits and retries ONCE instead of failing the caller`,
    retryResult.ok === true && retried.calls === 2,
    JSON.stringify({ ok: retryResult.ok, calls: retried.calls }),
  )

  /** An ordinary failure must surface immediately; retrying it would just double every real error. */
  const ordinary = { calls: 0 }
  const ordinaryResult = await withGraphqlBudget(
    async () => {
      ordinary.calls += 1
      return { ok: false, detail: "gh: could not resolve to a Repository" }
    },
    { readBudget: async () => ({ remaining: 4000, reset: Math.floor(Date.now() / 1000) + 60 }), sleep: async () => {} },
  )
  T(
    `${UNIT}: an ordinary failure is returned at once, never retried as if it were a rate limit`,
    ordinaryResult.ok === false && ordinary.calls === 1,
    JSON.stringify({ calls: ordinary.calls }),
  )

  const root = mkdtempSync(join(tmpdir(), "orbit-slot-test-"))
  try {
    const first = acquirePollSlot(root, 2, process.pid)
    T(`${UNIT}: the first caller takes a slot`, first.acquired === true, JSON.stringify(first))

    /** A dead holder must not hold the cap down. 999999 is not a live pid on this machine. */
    writeFileSync(join(root, "999999.slot"), "stale", "utf8")
    const past = acquirePollSlot(root, 2, process.pid)
    T(`${UNIT}: a stale slot file is reclaimed rather than counted against the cap`, past.acquired === true)
    T(
      `${UNIT}: the reclaimed slot file is actually deleted, not merely ignored`,
      !readdirSync(root).includes("999999.slot"),
      readdirSync(root).join(","),
    )

    releasePollSlot(root, process.pid)
    T(`${UNIT}: releasing removes the slot so the next poller can take it`, !readdirSync(root).includes(`${process.pid}.slot`))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
