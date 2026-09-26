#!/usr/bin/env node

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
  if (verdict?.terminal === "BLOCKED") {
    process.stderr.write(verdict.message)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
