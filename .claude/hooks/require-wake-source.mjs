#!/usr/bin/env node

import { readFileSync } from "node:fs"

import { readinessReport } from "../../tools/lib/readiness-receipt.mjs"
import { isWakeSourceAlive, readRunState, readWakeSourceStates } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"

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
  const wakeSourceStates = readWakeSourceStates()
  const verdict = checkSleepStop({
    state: readRunState(),
    wakeSources: wakeSourceStates.live,
    orphanedWakeSources: wakeSourceStates.orphaned,
    sessionId: input?.session_id ?? "",
    stopHookActive: input?.stop_hook_active === true,
    isWakeSourceAlive,
    receiptVerdict,
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  if (verdict?.terminal === "BLOCKED" || verdict?.terminal === "MERGED") {
    process.stderr.write(verdict.message)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
