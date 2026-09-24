// An unattended run may not end a turn with nothing left to wake it.
//
// Measured 2026-08-06: under --sleep the only thing that continues the run is a background task
// completing and re-invoking the session. The orchestrator ended a turn saying "CI will wake me"
// with nothing scheduled. The queue stopped there, and the artifacts it left are indistinguishable
// from a run that finished, so nobody went looking.
//
// Pure: takes the run record, wake sources already verified by the adapter's reader, and an injected
// identity predicate, and returns { block, message } or null. OS process probes belong at the adapter
// boundary so this rule can be tested without real processes.
//
// What it CAN prove: that at least one registered wake source still identifies its live process.
// launch-worker.mjs registers itself, so a launched worker is real evidence, not a claim. What it
// CANNOT prove: that the wake source will actually re-invoke this session. That is still the run's
// own responsibility, and the invariant in the skill says to name it.

/**
 * @param options `{ state, wakeSources, sessionId, stopHookActive, isWakeSourceAlive, receiptVerdict }`
 * `isWakeSourceAlive(source)` must compare the persisted identity with a fresh OS observation.
 * @returns `{ block, message }` when an unattended run is about to go quiet, else null
 */
export function checkSleepStop({ state, wakeSources = [], sessionId = "", stopHookActive = false, isWakeSourceAlive = () => false, receiptVerdict = () => null } = {}) {
  // A blocked stop that blocks again is an infinite loop, and Claude Code sets this flag on the
  // second pass for exactly that reason.
  if (stopHookActive) return null
  if (!state || state.sleep !== true) return null
  // A record from a PREVIOUS run must never block today's session. The session id is exact, so
  // staleness needs no timestamp heuristic.
  if (typeof state.sessionId === "string" && state.sessionId !== "" && sessionId !== "" && state.sessionId !== sessionId) return null

  const remaining = Array.isArray(state.remaining) ? state.remaining.filter((entry) => typeof entry === "string" && entry !== "") : []
  /**
   * An open pull request with no READY final-head receipt is unfinished work too, and it is the
   * shape a SALVAGE produces: PR #690 was cleaned, pushed and opened by hand, then reported as
   * finished while two required checks were red, because opening it was treated as the end of
   * salvage.
   *
   * Pullfrog reviews every pull request in GitHub Actions, and `pullfrog-approval` is a required
   * status check on `main`. The review verdict therefore arrives through the same required contexts
   * the receipt already reads, so the receipt alone decides whether a pull request is done. A queue
   * is not done while one of its pull requests lacks a READY receipt.
   */
  const rawPullRequests = [
    ...(Array.isArray(state.pullRequests) ? state.pullRequests : []),
    ...(Array.isArray(state.readinessLedger) ? state.readinessLedger : []),
  ]
  const pullRequests = rawPullRequests.filter(
    (entry) => typeof entry?.repositoryKey === "string" && entry.repositoryKey !== "" && Number.isInteger(entry?.prNumber) && typeof entry?.receiptPath === "string" && entry.receiptPath !== "",
  )
  const uniquePullRequests = [...new Map(pullRequests.map((entry) => [`${entry.repositoryKey}#${entry.prNumber}`, entry])).values()]
  /**
   * A run that CANNOT reach READY needs a way to end honestly.
   *
   * Measured 2026-08-08: a named blocker made READY unreachable, and the only exits this hook left
   * were fabricating a receipt or clearing the ledger, both forbidden. The deadlock burned five
   * turns. So a pull request may also be terminal as BLOCKED, and the bar for that is a recorded,
   * machine-readable blocker string on its ledger entry. A blocker is not a verdict the run may
   * assert about its own work: it is a fact it must write down first, which is what keeps "ended
   * blocked" from becoming a cheaper synonym for "finished".
   */
  const hasRecordedBlocker = (entry) => typeof entry.blocker === "string" && entry.blocker !== ""
  /**
   * A MACHINE RESOURCE is never a blocker. It is a reason to use fewer workers.
   *
   * Measured 2026-09-19: the low-memory guard reaped two workers mid-round, the run recorded that as
   * a blocker on both rows, and this function let it end BLOCKED with a pull request approved and
   * one body edit from merging. Thomas: "YOU CANT END A RUN BECAUSE OF A MEMORY HOOK ... if you have
   * memory problems, just use less workers or some shit, but never end the run".
   *
   * The distinction is whether the limit is external and unarguable. An exhausted API allowance is:
   * no amount of care makes it resolve before it resets. Memory, disk and CPU are not: they are
   * consequences of how much this run chose to start at once, so the answer is to start less and
   * keep going. Letting them end a night makes "the box was busy" a synonym for "the work is done".
   */
  const MACHINE_PRESSURE =
    /\b(low[- ](?:on[- ])?memory|out of memory|memory pressure|oom|reaped?|reaper|disk (?:space|full)|enospc|cpu pressure)\b/i
  const isMachinePressureBlocker = (entry) => hasRecordedBlocker(entry) && MACHINE_PRESSURE.test(entry.blocker)
  /**
   * A MERGED pull request is finished, and neither READY nor BLOCKED describes it.
   *
   * Measured 2026-09-18 by driving this function: a run that merged a pull request under the step 9
   * exception, with nothing left to launch, got `block: true` here. The receipt stays `CI_STALE`
   * forever, because the check it waits on will never publish, and the ledger row is append only, so
   * the merge could not clear it. That is the 2026-08-08 deadlock reached after a SUCCESSFUL merge,
   * and the two exits it left were the forbidden ones.
   *
   * The bar is the merge commit sha, which a reader can check against GitHub. A merge is not
   * reversible, so a merged row leaves the pending set for good rather than waiting on a receipt
   * that cannot change.
   *
   * It must LOOK like a sha, and that is not pedantry. `blocker` may be any non-empty string
   * because a false blocker prints a loud BLOCKED banner naming the pull request; a false `merged`
   * ends the night in SILENCE. Measured 2026-09-18 by driving this function: with a non-empty-string
   * test, `orchestrate/SKILL.md`'s own unfilled template value,
   * "<merge commit sha once it is merged, or absent>", and the bare word "yes" both returned null,
   * so copying the template without filling it reported an UNMERGED pull request as a finished
   * night. `tools/lib/run-state.mjs` carries the same rule over the same literal; the two must not
   * drift, and `test-hooks.mjs` asserts that they have not.
   */
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

  if (remaining.length === 0 && pendingPullRequests.length === 0 && invalidPullRequestIdentities === 0) {
    /**
     * The run may end. Say WHICH ending it is, visibly, because "ended blocked" reading as
     * "finished" is precisely the failure this whole state exists to prevent. A hook that allows a
     * stop prints nothing, so the distinction is returned for the caller to surface.
     *
     * A LIVE wake source means the run has not ended at all, so it gets no banner: this turn is
     * ending, the run is not. Announcing a final state there would be the mirror of the defect, a
     * run reporting an ending while work is still in flight.
     *
     * BLOCKED outranks MERGED when a run produced both, because the blocked row is the one that
     * still needs a reader. The BLOCKED banner already names every blocked pull request, and step
     * 11's report carries the merge shas beside it.
     */
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
      "When every slot is free and work remains, the action is to LAUNCH THE NEXT TICKET, not to end\n" +
      "the turn. `node tools/launch-worker.mjs` registers itself as a wake source, so the launch of\n" +
      "the next worker clears this by construction.\n\n" +
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
