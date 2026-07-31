import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, stage, orcaEnv, check } from "./_harness.mjs"

/**
 * nudge-worker's whole surface is now a refusal, so every case here asserts the SAME thing the
 * flag-by-flag suite asserted before the flags went away: this tool never delivers a mid-run turn.
 * Each named case survives its flag's deletion because the invocation a caller would still try is
 * exactly the one that must be refused, and the orca log proves nothing was sent.
 */
const nudgeWorkerCases = () => {
  const noArgumentLog = join(root, "nudge-no-argument.log")
  check(
    "nudge-worker.mjs",
    "headless workers explain that a live turn cannot be injected",
    [],
    { status: 1, stderr: /mid-run injection is unavailable[\s\S]*relaunch/ },
    { env: { ...orcaEnv([]), ORBIT_ORCA_LOG: noArgumentLog } },
  )
  T(
    "nudge-worker.mjs: a refused nudge calls orca not at all",
    !existsSync(noArgumentLog),
    `orca was invoked: ${existsSync(noArgumentLog) ? readFileSync(noArgumentLog, "utf8") : ""}`,
  )
  check("nudge-worker.mjs", "--help documents the fail-closed rule and the relaunch remedy", ["--help"], { status: 0, stdout: /unavailable for headless workers[\s\S]*Relaunch after exit[\s\S]*exit codes:/ })
  check("nudge-worker.mjs", "rejects multi-line text", ["--terminal", "t1", "--text", "first line\nsecond line"], { status: 2, stderr: /mid-run injection is unavailable/ })
  check("nudge-worker.mjs", "rejects --text together with --prompt-file", ["--terminal", "t1", "--text", "hi", "--prompt-file", stage("nudge-prompt.md", "body\n")], { status: 2, stderr: /mid-run injection is unavailable/ })
  check("nudge-worker.mjs", "rejects a non-positive --wait-attempts", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "0"], { status: 2, stderr: /mid-run injection is unavailable/ })
  const dryRunLog = join(root, "nudge-dry-run.log")
  check(
    "nudge-worker.mjs",
    "--dry-run calls orca not at all",
    ["--terminal", "t1", "--text", "hi", "--dry-run"],
    { status: 2, stderr: /mid-run injection is unavailable/ },
    { env: { ...orcaEnv([]), ORBIT_ORCA_LOG: dryRunLog } },
  )
  T(
    "nudge-worker.mjs: --dry-run leaves no orca invocation behind",
    !existsSync(dryRunLog),
    `orca was invoked: ${existsSync(dryRunLog) ? readFileSync(dryRunLog, "utf8") : ""}`,
  )
}

export { nudgeWorkerCases as cases }
