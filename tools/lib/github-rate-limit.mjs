/**
 * Decide whether to spend a GraphQL call now or wait for the window to refill.
 *
 * WHY, measured twice on 2026-08-09. Eight concurrent `list-bot-threads.mjs` pollers exhausted
 * the 5,000-point per-user GraphQL budget three times in one night (roughly 90 minutes lost), and
 * the same day the require-wake-source Stop hook's live re-verification spent the entire budget
 * again (5,002 points) during an ordinary interactive session. The structural consumers are
 * deleted; this module is the residual self-defence for the one tool that still polls. The
 * decision half is pure so the backoff path is testable without a network or a clock.
 *
 * `gh api rate_limit` is a REST read and spends no GraphQL point, so asking before spending is
 * free. The budget shape it returns: `resources.graphql.remaining` and `.reset` (epoch seconds).
 */

/** Leave headroom so the LAST call before the floor still completes instead of half-failing. */
export const DEFAULT_MIN_REMAINING = 200

/**
 * @param budget `{ remaining, reset }` as GitHub reports them, reset in epoch SECONDS
 * @param options `{ nowSeconds, minRemaining, maxWaitSeconds }`; maxWaitSeconds caps the wait at
 *   the caller's own remaining budget so this can never oversleep the caller's contract
 * @returns `{ action: "proceed" | "wait", waitSeconds, reason }`
 */
export const graphqlBudgetDecision = (budget, options = {}) => {
  const minRemaining = options.minRemaining ?? DEFAULT_MIN_REMAINING
  const maxWaitSeconds = options.maxWaitSeconds ?? Infinity
  const nowSeconds = options.nowSeconds

  if (!Number.isFinite(nowSeconds)) return { action: "proceed", waitSeconds: 0, reason: "no clock was supplied, so the budget cannot be judged" }
  /** An unreadable budget must never become a reason to stop: the call itself is the better probe. */
  if (!budget || !Number.isFinite(budget.remaining) || !Number.isFinite(budget.reset)) {
    return { action: "proceed", waitSeconds: 0, reason: "the rate limit could not be read, so the call is attempted rather than refused" }
  }
  if (budget.remaining > minRemaining) {
    return { action: "proceed", waitSeconds: 0, reason: `${budget.remaining} GraphQL points remain` }
  }
  const untilReset = Math.max(0, Math.ceil(budget.reset - nowSeconds))
  /** Already past the reset: the window has rolled and the reported remaining is simply stale. */
  if (untilReset === 0) return { action: "proceed", waitSeconds: 0, reason: "the reported window already reset" }
  const waitSeconds = Math.min(untilReset, maxWaitSeconds)
  return {
    action: "wait",
    waitSeconds,
    reason: `${budget.remaining} GraphQL points remain; waiting ${waitSeconds}s${waitSeconds < untilReset ? ` of the ${untilReset}s until the window refills (capped by the caller's own budget)` : " for the window to refill"}`,
  }
}
