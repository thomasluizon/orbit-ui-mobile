// An unattended run may not end a turn with nothing left to wake it.
//
// Measured 2026-08-06: under --sleep the only thing that continues the run is a background task
// completing and re-invoking the session. The orchestrator ended a turn saying "CI will wake me"
// with nothing scheduled. The queue stopped there, and the artifacts it left are indistinguishable
// from a run that finished, so nobody went looking.
//
// Pure: takes the run record, the registered wake sources, and an injected liveness predicate, and
// returns { block, message } or null. Liveness is injected because a hook must never spawn a
// subprocess and because a test cannot conjure a process that is reliably dead.
//
// What it CAN prove: that at least one registered wake source is a process that still exists.
// launch-worker.mjs registers itself, so a launched worker or reviewer is real evidence, not a
// claim. What it CANNOT prove: that the wake source will actually re-invoke this session. That is
// still the run's own responsibility, and the invariant in the skill says to name it.

/**
 * @param options `{ state, wakeSources, sessionId, stopHookActive, isAlive, receiptVerdict }`
 * @returns `{ block, message }` when an unattended run is about to go quiet, else null
 */
export function checkSleepStop({ state, wakeSources = [], sessionId = "", stopHookActive = false, isAlive = () => false, receiptVerdict = () => null } = {}) {
  // A blocked stop that blocks again is an infinite loop, and Claude Code sets this flag on the
  // second pass for exactly that reason.
  if (stopHookActive) return null
  if (!state || state.sleep !== true) return null
  // A record from a PREVIOUS run must never block today's session. The session id is exact, so
  // staleness needs no timestamp heuristic.
  if (typeof state.sessionId === "string" && state.sessionId !== "" && sessionId !== "" && state.sessionId !== sessionId) return null

  const remaining = Array.isArray(state.remaining) ? state.remaining.filter((entry) => typeof entry === "string" && entry !== "") : []
  /**
   * An open pull request with no recorded review verdict is unfinished work too, and it is the shape
   * a SALVAGE produces: PR #690 was cleaned, pushed and opened by hand, then reported as finished
   * while carrying two failing required checks and an unresolved bot thread, because it never
   * re-entered step 7. A queue is not done while one of its pull requests has not been through the
   * rest of the algorithm.
   */
  const rawPullRequests = [
    ...(Array.isArray(state.pullRequests) ? state.pullRequests : []),
    ...(Array.isArray(state.readinessLedger) ? state.readinessLedger : []),
  ]
  const pullRequests = rawPullRequests.filter(
    (entry) => typeof entry?.repositoryKey === "string" && entry.repositoryKey !== "" && Number.isInteger(entry?.prNumber) && typeof entry?.receiptPath === "string" && entry.receiptPath !== "",
  )
  const uniquePullRequests = [...new Map(pullRequests.map((entry) => [`${entry.repositoryKey}#${entry.prNumber}`, entry])).values()]
  const pendingPullRequests = uniquePullRequests.filter((entry) => receiptVerdict(entry) !== "READY")
  const invalidPullRequestIdentities = rawPullRequests.length - pullRequests.length +
    (Array.isArray(state.unreviewedPullRequests) ? state.unreviewedPullRequests.length : 0)
  if (remaining.length === 0 && pendingPullRequests.length === 0 && invalidPullRequestIdentities === 0) return null

  const live = wakeSources.filter((source) => Number.isInteger(source?.pid) && isAlive(source.pid))
  if (live.length > 0) return null

  const outstanding =
    remaining.length > 0
      ? `${remaining.length} ticket(s) left (${remaining.join(", ")})`
      : invalidPullRequestIdentities > 0
        ? `${invalidPullRequestIdentities} pull request identity record(s) are bare or invalid; repositoryKey, prNumber, and receiptPath are required`
        : `every ticket done but pull request(s) ${pendingPullRequests.map((entry) => `${entry.repositoryKey}#${entry.prNumber}`).join(", ")} lack a READY final-head receipt`

  return {
    block: true,
    message:
      `This is a --sleep run with ${outstanding} and NO live background task to wake it. Ending the\n` +
      "turn here ends the night silently: the queue simply stops, and what it leaves behind looks\n" +
      "exactly like a run that finished.\n\n" +
      "When every slot is free and work remains, the action is to LAUNCH THE NEXT TICKET, not to end\n" +
      "the turn. `node tools/launch-worker.mjs` registers itself as a wake source, so starting the\n" +
      "next worker or the next reviewer clears this by construction.\n\n" +
      "A pull request listed in pullRequests has not reached simultaneous final-head readiness. Run\n" +
      "the readiness loop, then drop it only after its receipt says READY. A salvaged pull request\n" +
      "is not an exception: opening it is the middle of salvage, never the end.\n\n" +
      "If the queue really is done, keep its append-only readinessLedger intact. The hook reads\n" +
      "each receipt and allows completion only when every one mechanically reports READY.\n" +
      "Never clear the ledger to manufacture an exhausted queue.",
  }
}
