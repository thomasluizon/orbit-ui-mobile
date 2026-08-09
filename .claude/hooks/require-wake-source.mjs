#!/usr/bin/env node
// Adapter for the unattended-run wake-source invariant. The reusable core is checkSleepStop in
// _lib/rules-sleep.mjs. Wired to Stop, the only event that can see a turn ending.
// Exits 0 (allow the stop) or 2 + stderr (block it, and the message reaches the session).
// Any error exits 0, so a hook fault can never trap a session that wants to stop.
//
// The run record and the wake sources are read through tools/lib/run-state.mjs rather than
// re-derived here: launch-worker.mjs writes them with that same module, and two definitions of
// where the files live is how one of them silently stops finding the other.
//
// This hook reads DISK ONLY: the run record, the receipt files it names, and pid liveness. It
// never calls GitHub. The previous revision re-verified every ledger row against live GitHub
// (pull request view, branch protection, review threads, board item-list) on EVERY Stop of EVERY
// session in this project, including for a dead session's ledger it then discarded on the
// session-id check. Measured 2026-08-09: that alone spent the entire 5,000-point per-user GraphQL
// budget (5,002 points used) and stalled all work. Whether a receipt is stale against live GitHub
// is record-readiness.mjs's question, answered once at readiness time; the receipt this hook
// reads is at most minutes old because the readiness loop ends by recording it, and the final
// verifier of live state is Thomas, who tests and merges every pull request by hand.

import { readFileSync } from "node:fs"

import { readinessReport } from "../../tools/lib/readiness-receipt.mjs"
import { readRunState, readWakeSources } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"

/** Signal 0 tests for existence without delivering anything. EPERM means it exists and is not ours. */
const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

/** READY comes from the persisted receipt alone. An unreadable or not-READY receipt is null. */
const receiptVerdict = (entry) => {
  try {
    const receipt = JSON.parse(readFileSync(entry.receiptPath, "utf8"))
    return readinessReport(receipt).verdict === "READY" ? "READY" : null
  } catch {
    return null
  }
}

try {
  const input = readStdinJson()
  const verdict = checkSleepStop({
    state: readRunState(),
    wakeSources: readWakeSources(),
    sessionId: input?.session_id ?? "",
    stopHookActive: input?.stop_hook_active === true,
    isAlive,
    receiptVerdict,
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  /**
   * A run that ends BLOCKED is allowed to end, and it must not look like one that finished. The
   * banner goes to stderr and the hook still exits 0, because exit 2 is this hook's only confirmed
   * channel back into the session and using it here would BLOCK the very ending it is describing.
   * So this marks the transcript, and the orchestrate skill's report step carries the same
   * distinction where the model certainly reads it. Stated rather than implied: this line is a
   * record, not a guaranteed prompt.
   */
  if (verdict?.terminal === "BLOCKED") {
    process.stderr.write(verdict.message)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
