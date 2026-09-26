
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
  const rawPullRequests = [
    ...(Array.isArray(state.pullRequests) ? state.pullRequests : []),
    ...(Array.isArray(state.readinessLedger) ? state.readinessLedger : []),
  ]
  const pullRequests = rawPullRequests.filter(
    (entry) => typeof entry?.repositoryKey === "string" && entry.repositoryKey !== "" && Number.isInteger(entry?.prNumber) && typeof entry?.receiptPath === "string" && entry.receiptPath !== "",
  )
  const uniquePullRequests = [...new Map(pullRequests.map((entry) => [`${entry.repositoryKey}#${entry.prNumber}`, entry])).values()]
  const hasRecordedBlocker = (entry) => typeof entry.blocker === "string" && entry.blocker !== ""
  const notReady = uniquePullRequests.filter((entry) => receiptVerdict(entry) !== "READY")
  const blockedPullRequests = notReady.filter(hasRecordedBlocker)
  const pendingPullRequests = notReady.filter((entry) => !hasRecordedBlocker(entry))
  /** A ledger row whose receipt file was never written is an invalid identity too. It used to read
   * as "unreadable receipt", which is quieter and easier to mistake for a transient fault. */
  const unwrittenReceipts = uniquePullRequests.filter((entry) => entry.receiptWritten === false)
  const invalidPullRequestIdentities = rawPullRequests.length - pullRequests.length + unwrittenReceipts.length
  const live = wakeSources.filter((source) => Number.isInteger(source?.pid) && isAlive(source.pid))

  if (remaining.length === 0 && pendingPullRequests.length === 0 && invalidPullRequestIdentities === 0) {
    return blockedPullRequests.length === 0 || live.length > 0
      ? null
      : {
          block: false,
          terminal: "BLOCKED",
          message:
            `This run ended BLOCKED, not finished. ${blockedPullRequests.length} pull request(s) never reached a READY\n` +
            "final-head receipt and each carries a recorded blocker:\n\n" +
            blockedPullRequests.map((entry) => `  ${entry.repositoryKey}#${entry.prNumber}: ${entry.blocker}`).join("\n") +
            "\n\nReport it that way. A blocked ending is a legitimate ending and a dishonest one is not.",
        }
  }

  if (live.length > 0) return null

  const outstanding =
    remaining.length > 0
      ? `${remaining.length} ticket(s) left (${remaining.join(", ")})`
      : unwrittenReceipts.length > 0
        ? `${unwrittenReceipts.length} ledger row(s) name a receipt file that was never written: ${unwrittenReceipts.map((entry) => `${entry.repositoryKey}#${entry.prNumber} -> ${entry.receiptPath}`).join(", ")}`
        : invalidPullRequestIdentities > 0
          ? `${invalidPullRequestIdentities} pull request identity record(s) are bare or invalid; repositoryKey, prNumber, and receiptPath are required`
          : `every ticket done but pull request(s) ${pendingPullRequests.map((entry) => `${entry.repositoryKey}#${entry.prNumber}`).join(", ")} lack a READY final-head receipt`

  return {
    block: true,
    message:
      `This is a --sleep run with ${outstanding} and NO live background task to wake it. Ending the\n` +
      "turn here ends the night silently: the queue simply stops, and what it leaves behind looks\n" +
      "exactly like a run that finished.\n\n" +
      "Launch the next ticket only when a slot is free and the admission gate allows it.\n" +
      "When work waits on CI or review, start `node tools/wait-ci.mjs --repo <key> --pr <n>`\n" +
      "as a background task. It registers a live wake source until checks settle.\n\n" +
      "A pull request listed in pullRequests has not reached simultaneous final-head readiness. Run\n" +
      "the readiness loop, then drop it only after its receipt says READY. A salvaged pull request\n" +
      "is not an exception: opening it is the middle of salvage, never the end.\n\n" +
      "If the queue really is done, keep its append-only readinessLedger intact. The hook reads\n" +
      "each receipt and allows completion only when every one mechanically reports READY.\n" +
      "Never clear the ledger to manufacture an exhausted queue.\n\n" +
      "If a NAMED blocker makes READY unreachable, that is a legitimate ending and there is now a\n" +
      "state for it. Record a machine-readable `blocker` string on that pull request's ledger entry\n" +
      "and the run may end as BLOCKED, reported as blocked rather than as finished. Writing the\n" +
      "blocker down is the whole bar: a blocker is a fact this run records, never a verdict it\n" +
      "asserts about its own work.",
  }
}
