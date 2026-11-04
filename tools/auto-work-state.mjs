#!/usr/bin/env node
import { readRunState, writeRunState } from "./lib/run-state.mjs"

const USAGE = `usage: auto-work-state.mjs <--enable | --disable> [--crank]
Set auto-work on the current sleep run, preserving its queue and intake cursors.
--crank explicitly enables crank through the caller's /crank procedure; never defaults on.
No stdin. Prints sessionId, autoWork and crank after reading the write back.
--help, -h print usage
exit codes: 0 confirmed; 1 no matching sleep run or write failure; 2 invalid arguments`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
if (!(args.length === 1 || (args.length === 2 && args[1] === "--crank" && args[0] === "--enable")) ||
    !["--enable", "--disable"].includes(args[0])) { console.error(USAGE); process.exit(2) }
try {
  const state = readRunState()
  if (!state?.sessionId || (args[0] === "--enable" && state.sleep !== true) ||
      (process.env.CLAUDE_CODE_SESSION_ID && process.env.CLAUDE_CODE_SESSION_ID !== state.sessionId)) throw new Error("Enter /sleep in this session first")
  const autoWork = args[0] === "--enable"
  writeRunState({ ...state, autoWork, ...(args.includes("--crank") ? { crank: true } : {}) })
  const confirmed = readRunState()
  if (confirmed.sessionId !== state.sessionId || confirmed.autoWork !== autoWork) throw new Error("Mode write was not confirmed")
  console.log(JSON.stringify({ sessionId: confirmed.sessionId, autoWork: confirmed.autoWork, crank: confirmed.crank === true }))
} catch (error) { console.error(error.message); process.exit(1) }
