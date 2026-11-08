#!/usr/bin/env node
import { setTimeout as wait } from "node:timers/promises"
import { clearWakeSource, readRunState, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-auto-work.mjs [--interval-seconds <n>]
Register an idle wake source, then exit when the interval passes or the owning mode ends.
The interval defaults to 900 seconds; a positive finite value is required.
No stdin. Prints one JSON result with reason and waitedSeconds.
--help, -h print usage
exit codes: 0 interval or mode changed; 1 missing run or registration failure; 2 invalid arguments; 130 SIGINT; 143 SIGTERM`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
const seconds = args.length === 0 ? 900 : Number(args[1])
if ((args.length !== 0 && (args.length !== 2 || args[0] !== "--interval-seconds")) || !Number.isFinite(seconds) || seconds <= 0) {
  console.error(USAGE); process.exit(2)
}
const started = Date.now()
const finish = (reason, code) => {
  clearWakeSource(process.pid)
  console.log(JSON.stringify({ reason, waitedSeconds: (Date.now() - started) / 1000 }))
  process.exit(code)
}
process.once("exit", () => clearWakeSource(process.pid))
process.once("SIGINT", () => finish("SIGINT", 130))
process.once("SIGTERM", () => finish("SIGTERM", 143))
try {
  const state = readRunState()
  if (!state?.sessionId || !state.sleep || !state.autoWork ||
      (process.env.CLAUDE_CODE_SESSION_ID && process.env.CLAUDE_CODE_SESSION_ID !== state.sessionId)) finish("NO_AUTO_WORK_RUN", 1)
  if (!registerWakeSource({ pid: process.pid, kind: "auto-work-waiter", sessionId: state.sessionId,
    what: "Auto-work intake cycle", startedAt: new Date().toISOString() })) finish("WAKE_REGISTRATION_FAILED", 1)
  const deadline = started + seconds * 1000
  for (;;) {
    const current = readRunState()
    if (current?.sessionId !== state.sessionId || !current.autoWork || !current.sleep || current.relay?.pending) finish("MODE_CHANGED", 0)
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await wait(Math.min(1000, remaining))
  }
  finish("INTERVAL", 0)
} catch (error) { console.error(error.message); finish("READ_FAILED", 1) }
