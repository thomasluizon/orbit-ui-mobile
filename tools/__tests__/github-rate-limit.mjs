import { DEFAULT_MIN_REMAINING, graphqlBudgetDecision } from "../lib/github-rate-limit.mjs"

import { T } from "./_harness.mjs"

const UNIT = "lib/github-rate-limit.mjs"

export const cases = async () => {
  const NOW = 1786302352

  /** WHY this module exists, measured 2026-08-09 twice: eight pollers, then the Stop hook's live
   * re-verification, each emptied the 5,000-point per-user GraphQL budget and stalled the run. */
  T(`${UNIT}: a healthy budget is spent rather than second-guessed`,
    graphqlBudgetDecision({ remaining: 4800, reset: NOW + 600 }, { nowSeconds: NOW }).action === "proceed",
  )

  const exhausted = graphqlBudgetDecision({ remaining: 0, reset: NOW + 900 }, { nowSeconds: NOW })
  T(`${UNIT}: an exhausted budget WAITS for the refill instead of failing the run`,
    exhausted.action === "wait" && exhausted.waitSeconds === 900,
    JSON.stringify(exhausted),
  )

  /** The floor exists so the LAST call before it still completes instead of half-failing. */
  T(`${UNIT}: the floor is crossed before zero, not at it`,
    graphqlBudgetDecision({ remaining: DEFAULT_MIN_REMAINING - 50, reset: NOW + 120 }, { nowSeconds: NOW }).action === "wait",
  )

  /** An unreadable budget must never become a reason to stop; the call itself is the better probe. */
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

  /** The wait is capped by the CALLER's remaining budget, so a tool can never oversleep its own
   * --wait-seconds contract; the poll loop then ends honestly at NO_REVIEW with the reason named. */
  const capped = graphqlBudgetDecision({ remaining: 0, reset: NOW + 900 }, { nowSeconds: NOW, maxWaitSeconds: 60 })
  T(`${UNIT}: the wait never exceeds the caller's own remaining budget`,
    capped.action === "wait" && capped.waitSeconds === 60 && capped.reason.includes("capped"),
    JSON.stringify(capped),
  )

  T(`${UNIT}: no clock supplied proceeds rather than guessing one`,
    graphqlBudgetDecision({ remaining: 0, reset: NOW + 900 }, {}).action === "proceed",
  )
}
