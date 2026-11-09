#!/usr/bin/env node
import { boardCheck, commandRunner, initialWakeMarks, mailCheck, reviewCheck, saveWakeMarks, SENTRY_MODE, watchIntake } from "./lib/auto-work-wake.mjs"
import { clearWakeSource, readRunState, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-auto-work.mjs [--interval-seconds <n>]
Register an idle wake source, then check the intake sources at the end of each interval.
The board (open tickets on the project with their updatedAt and open blockers, read through
tools/lib/github-issues.mjs with no model call), the mailbox (orbit-mail.mjs --unseen) and the reviews
(orbit-play-reviews.mjs --cycle) are checked; a key absent from intake.wake.seen is new.
Exit only for a new item, a source failure with a new signature, the hourly Sentry MCP listing
(no read-only Sentry token exists, so sentryMode is mcp-hourly) or a change of the owning mode.
The interval defaults to 900 seconds; a positive finite value is required.
No stdin. Prints one JSON result with reason, waitedSeconds and sentryMode; a SOURCE result adds
wakes, each with source (board, mail, reviews or sentry), kind (new, failure or due) and items or failure.
--help, -h print usage
exit codes: 0 source wake or mode changed; 1 missing run, registration or state failure; 2 invalid arguments; 130 SIGINT; 143 SIGTERM`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
const seconds = args.length === 0 ? 900 : Number(args[1])
if ((args.length !== 0 && (args.length !== 2 || args[0] !== "--interval-seconds")) || !Number.isFinite(seconds) || seconds <= 0) {
  console.error(USAGE); process.exit(2)
}
const started = Date.now()
const commands = new AbortController()
const finish = (reason, code, wakes) => {
  commands.abort()
  clearWakeSource(process.pid)
  console.log(JSON.stringify({ reason, waitedSeconds: (Date.now() - started) / 1000, sentryMode: SENTRY_MODE, ...(wakes ? { wakes } : {}) }))
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
  const run = commandRunner({ signal: commands.signal })
  const modeChanged = () => {
    const current = readRunState()
    return current?.sessionId !== state.sessionId || !current.autoWork || !current.sleep || Boolean(current.relay?.pending)
  }
  const result = await watchIntake({
    checks: [{ source: "board", seed: true, run: boardCheck() }, { source: "mail", run: mailCheck({ run }) },
      { source: "reviews", run: reviewCheck({ run }) }],
    marks: initialWakeMarks(state.intake, started),
    intervalMilliseconds: seconds * 1000,
    modeChanged,
    // A mode change makes the intake write refuse; the next loop pass reports MODE_CHANGED instead.
    saveMarks: (marks) => { if (!modeChanged()) saveWakeMarks(marks) },
  })
  finish(result.reason, 0, result.wakes)
} catch (error) { console.error(error.message); finish("READ_FAILED", 1) }
