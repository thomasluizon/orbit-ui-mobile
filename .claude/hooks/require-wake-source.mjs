#!/usr/bin/env node
// Adapter for the unattended-run wake-source invariant. The reusable core is checkSleepStop in
// _lib/rules-sleep.mjs. Wired to Stop, the only event that can see a turn ending.
// Exits 0 (allow the stop) or 2 + stderr (block it, and the message reaches the session).
// Any error exits 0, so a hook fault can never trap a session that wants to stop.
//
// The run record and the wake sources are read through tools/lib/run-state.mjs rather than
// re-derived here: launch-worker.mjs writes them with that same module, and two definitions of
// where the files live is how one of them silently stops finding the other.

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

try {
  const input = readStdinJson()
  const verdict = checkSleepStop({
    state: readRunState(),
    wakeSources: readWakeSources(),
    sessionId: input?.session_id ?? "",
    stopHookActive: input?.stop_hook_active === true,
    isAlive,
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
