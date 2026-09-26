/**
 * @param options `{ state, wakeSources, sessionId, stopHookActive, isWakeSourceAlive, receiptVerdict }`
 * `isWakeSourceAlive(source)` must compare the persisted identity with a fresh OS observation.
 * @returns `{ block, message }` when an unattended run is about to go quiet, else null
 */
export function checkSleepStop({ state, wakeSources = [], orphanedWakeSources = [], sessionId = "", stopHookActive = false, isWakeSourceAlive = () => false, receiptVerdict = () => null } = {}) {
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
  const MACHINE_PRESSURE =
    /\b(low[- ](?:on[- ])?memory|out of memory|memory pressure|oom|reaped?|reaper|disk (?:space|full)|enospc|cpu pressure)\b/i
  const isMachinePressureBlocker = (entry) => hasRecordedBlocker(entry) && MACHINE_PRESSURE.test(entry.blocker)
  const MERGE_SHA = /^[0-9a-f]{7,40}$/
  const hasRecordedMerge = (entry) => typeof entry.merged === "string" && MERGE_SHA.test(entry.merged)
  const mergedPullRequests = uniquePullRequests.filter(hasRecordedMerge)
  const openPullRequests = uniquePullRequests.filter((entry) => !hasRecordedMerge(entry))
  const notReady = openPullRequests.filter((entry) => receiptVerdict(entry) !== "READY")
  const blockedPullRequests = notReady.filter(hasRecordedBlocker)
  const pendingPullRequests = notReady.filter((entry) => !hasRecordedBlocker(entry))
  /** A ledger row whose receipt file was never written is an invalid identity too. It used to read
   * as "unreadable receipt", which is quieter and easier to mistake for a transient fault. A merged
   * row is exempt: its receipt debt is moot once the pull request is closed by a merge, and the sha
   * is stronger evidence than the receipt it would have replaced. */
  const unwrittenReceipts = openPullRequests.filter((entry) => entry.receiptWritten === false)
  const invalidPullRequestIdentities = rawPullRequests.length - pullRequests.length + unwrittenReceipts.length
  const live = wakeSources.filter((source) => Number.isInteger(source?.pid) && isWakeSourceAlive(source))
  if (orphanedWakeSources.length > 0) {
    return {
      block: true,
      message: `A launcher exited while orphaned worker pid ${orphanedWakeSources.map((source) => source.workerPid).join(", ")} remains live. Do not start another worker in its worktree. Inspect that process and recover its work before ending this run.`,
    }
  }

  if (remaining.length === 0 && pendingPullRequests.length === 0 && invalidPullRequestIdentities === 0) {
    if (live.length > 0) return null
    const machinePressure = blockedPullRequests.filter(isMachinePressureBlocker)
    if (machinePressure.length > 0) {
      return {
        block: true,
        message:
          `A MACHINE RESOURCE IS NOT A BLOCKER. ${machinePressure.length} row(s) record one:\n\n` +
          machinePressure.map((entry) => `  ${entry.repositoryKey}#${entry.prNumber}: ${entry.blocker}`).join("\n") +
          "\n\nMemory, disk and CPU are consequences of how much this run started at once, not\n" +
          "external limits it cannot argue with. An exhausted API allowance resets on a clock and\n" +
          "no care makes it come back sooner; a reaped worker comes back the moment you start one.\n\n" +
          "USE FEWER WORKERS AND KEEP GOING. Drop to a single worker, relaunch the round that was\n" +
          "reaped, and let the review subagents wait their turn. The worktree still holds its work,\n" +
          "so nothing is lost by relaunching and everything is lost by stopping.\n\n" +
          "Then clear that blocker string. It is not one.",
      }
    }
    if (blockedPullRequests.length > 0) {
      return {
        block: false,
        terminal: "BLOCKED",
        message:
          `This run ended BLOCKED, not finished. ${blockedPullRequests.length} pull request(s) never reached a READY\n` +
          "final-head receipt and each carries a recorded blocker:\n\n" +
          blockedPullRequests.map((entry) => `  ${entry.repositoryKey}#${entry.prNumber}: ${entry.blocker}`).join("\n") +
          "\n\nReport it that way. A blocked ending is a legitimate ending and a dishonest one is not.",
      }
    }
    /**
     * A MERGED ending gets a banner for the same reason a BLOCKED one does. Without it the sha the
     * run recorded reaches no reader, and a night that merged a pull request under the step 9
     * exception, on a receipt that can never say READY, looks exactly like a night where every
     * receipt was READY. BLOCKED is loud, so a merged-only completion has to be loud too.
     */
    return mergedPullRequests.length === 0
      ? null
      : {
          block: false,
          terminal: "MERGED",
          message:
            `This run ended on a MERGE, not on a receipt. ${mergedPullRequests.length} pull request(s) were merged and\n` +
            "each carries a recorded merge commit sha:\n\n" +
            mergedPullRequests.map((entry) => `  ${entry.repositoryKey}#${entry.prNumber}: ${entry.merged}`).join("\n") +
            "\n\nReport it that way, naming each sha. A merge closes a row that no receipt could.",
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
      "Launch the next ticket only when a slot is free AND the admission gate allows it.\n" +
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
      "asserts about its own work.\n\n" +
      "If the pull request was MERGED, it is finished and neither state above describes it. Record\n" +
      "its merge commit sha as the `merged` string on that ledger entry. A merge closes the row for\n" +
      "good, which is what a receipt waiting on a check that will never publish cannot do.",
  }
}
