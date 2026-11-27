/**
 * The one list of gate commands. The size hook allows these commands at the hard cap, and the gate hook of the `Stop` event
 * runs them. A command that one hook runs and the other denies would trap a worker at the cap, so both import this list.
 * The module also names the gate record that the hook writes and the driver reads.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

/** The `npm run` scripts of a workspace gate. */
export const GATE_SCRIPTS = Object.freeze(["type-check", "lint"])
/** The programs that `npx` runs for a gate. */
export const GATE_PROGRAMS = Object.freeze(["tsc", "eslint", "vitest"])
/** The tool scripts of a gate: a `check-*` script and the test runner of `tools/`. */
export const CHECK_SCRIPT = /^(?:\.\/)?tools\/(?:check-[^/\s]+|test-tools)\.mjs$/

/** The gate record of a worktree sits in its git directory. */
export const recordFile = (gitDir) => join(gitDir, "orbit-gate.json")

/** The gate record `{ run, head, green, failures, blocks, at }` of a git directory, or null when there is none. */
export const readGate = (gitDir) => {
  try {
    return JSON.parse(readFileSync(recordFile(gitDir), "utf8"))
  } catch {
    return null
  }
}
