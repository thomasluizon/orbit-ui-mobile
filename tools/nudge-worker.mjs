#!/usr/bin/env node
/** Headless codex exec has no live user-turn channel, so every invocation fails closed. */
const USAGE = `usage: nudge-worker.mjs

  Mid-run worker injection is unavailable for headless workers. There is no live user-turn
  channel to send into, so this tool sends nothing, calls orca not at all, and takes no flags:
  no --terminal, no --text, no --prompt-file, no --wait-attempts, no --engine, no --dry-run.
  Relaunch after exit with the updated prompt file instead.

  --help, -h  print this usage and exit 0

exit codes: 0 usage printed, 1 nothing to nudge, 2 an injection was attempted and refused`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (process.argv.length > 2) {
  console.error(`nudge-worker: mid-run injection is unavailable for headless workers; nothing was sent. Wait for process exit, then relaunch with the updated prompt file.\n\n${USAGE}`)
  process.exit(2)
}
console.error("nudge-worker: mid-run injection is unavailable for headless workers; wait for process exit, then relaunch with the updated prompt file")
process.exit(1)
