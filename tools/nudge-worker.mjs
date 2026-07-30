#!/usr/bin/env node
/** Headless codex exec has no live user-turn channel. */
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("usage: nudge-worker.mjs\n\nMid-run worker injection is unavailable for headless workers. Relaunch after exit with the updated prompt.")
  process.exit(0)
}
if (process.argv.length > 2) {
  console.error("mid-run injection is unavailable for headless workers")
  process.exit(2)
}
console.error("mid-run injection is unavailable for headless workers; wait for process exit, then relaunch with the updated prompt")
process.exit(1)
