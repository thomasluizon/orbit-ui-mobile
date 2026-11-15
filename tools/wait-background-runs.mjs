#!/usr/bin/env node
import { setTimeout as wait } from "node:timers/promises"
import { readDrainBlockers } from "./lib/background-runs.mjs"
import { BACKGROUND_RUN_WAITER, REPO_ROOT, clearWakeSource, readRunState, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-background-runs.mjs [--poll-seconds <n>]

Wait, with a registered harness wake source, until no background workflow or subagent of this
session holds a turn end or a relay drain. A run stops holding when it finishes, or when it makes
no transcript progress for 30 minutes. Such a run counts as stuck: the run state then records its
worktree, branch and last commit in stuckBackgroundRuns.
Reads the session from CLAUDE_CODE_SESSION_ID, else from the run state. No stdin is read.
--poll-seconds defaults to 15 and must be a positive finite number.
Prints one JSON result with waiting, stuck, reason and waitedSeconds.
--help, -h  print this usage and exit 0
exit codes: 0 no background run holds the session; 1 no session, or wake registration failed;
            2 invalid arguments; 130 SIGINT; 143 SIGTERM`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const args = process.argv.slice(2)
const pollSeconds = args.length === 0 ? 15 : Number(args[1])
if (![0, 2].includes(args.length) || (args.length === 2 && args[0] !== "--poll-seconds") || !Number.isFinite(pollSeconds) || pollSeconds <= 0) {
  console.error(USAGE)
  process.exit(2)
}

const started = Date.now()
const sessionId = process.env.CLAUDE_CODE_SESSION_ID ?? readRunState()?.sessionId
let finished = false
const finish = (reason, code, drain = { waiting: [], stuck: [] }) => {
  if (finished) return
  finished = true
  clearWakeSource(process.pid, REPO_ROOT)
  console.log(JSON.stringify({ waiting: drain.waiting.map((run) => `${run.type} ${run.id}`), stuck: drain.stuck, reason, waitedSeconds: (Date.now() - started) / 1000 }))
  process.exit(code)
}
process.once("exit", () => clearWakeSource(process.pid, REPO_ROOT))
process.once("SIGINT", () => finish("SIGINT", 130))
process.once("SIGTERM", () => finish("SIGTERM", 143))
if (!sessionId) finish("NO_SESSION", 1)
if (!registerWakeSource({ pid: process.pid, kind: BACKGROUND_RUN_WAITER, sessionId, what: "Background runs" })) finish("WAKE_REGISTRATION_FAILED", 1)

for (;;) {
  const drain = readDrainBlockers(sessionId)
  if (drain.waiting.length === 0) finish(drain.stuck.length ? "STUCK" : "FINISHED", 0, drain)
  await wait(pollSeconds * 1000)
}
