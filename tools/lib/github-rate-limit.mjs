
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
