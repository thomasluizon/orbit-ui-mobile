#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { FIX_ROUND_KINDS, readDesignChange, readFixRounds, recordFixRound } from "./lib/run-state.mjs"

const USAGE = `usage: fix-rounds.mjs --worktree <path> [--record <local|pullfrog> [--design-change <file>]]

  Counts the review fix rounds of the pull request branch checked out in a worktree, local and
  Pullfrog together, against caps.reviewFixAttempts in .claude/orchestrator.json. The ledger lives in
  the git directory of that worktree, so each worktree and branch has its own count.

  --worktree <path>        the worktree of the pull request branch (required)
  --record <kind>          spend the next fix round before its fix commit. local is a round that
                           answers the local review gate; pullfrog is a round that answers a Pullfrog review
  --design-change <file>   a non-empty file that holds the written design change. Required for a
                           round above the cap; one file allows one round. --relaunch-reason of
                           launch-worker.mjs never passes this cap
  --help, -h               print this usage and exit 0

Prints one JSON object on stdout: branch, headSha, cap, rounds (each with number, kind, headSha,
timestamp and designChange), used, remaining, and recorded with the round number when --record ran.

exit codes: 0 status printed or round recorded, 2 usage or config error,
            5 the cap is reached and no --design-change was given (nothing recorded)`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const values = {}
const args = process.argv.slice(2)
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index]
  const value = args[index + 1]
  if (!["--worktree", "--record", "--design-change"].includes(flag) || !value || value.startsWith("--") || flag in values) {
    fail(2, `${USAGE}\n\nunsupported or incomplete option: ${flag}`)
  }
  values[flag] = value
}
const worktreeArgument = values["--worktree"]
const kind = values["--record"] ?? null
if (!worktreeArgument) fail(2, `${USAGE}\n\n--worktree is required`)
if (kind !== null && !FIX_ROUND_KINDS.includes(kind)) fail(2, `${USAGE}\n\n--record must be ${FIX_ROUND_KINDS.join(" or ")}, got "${kind}"`)
if (kind === null && values["--design-change"]) fail(2, `${USAGE}\n\n--design-change requires --record`)
const worktree = resolve(worktreeArgument)
if (!existsSync(worktree)) fail(2, `worktree not found: ${worktree}`)

const git = (gitArgs) => {
  const result = spawnSync("git", ["-C", worktree, ...gitArgs], { encoding: "utf8", windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : ""
}
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
const headSha = git(["rev-parse", "HEAD"])
if (!branch || branch === "HEAD") fail(2, `${worktree} has no checked-out branch`)

let cap
try { cap = readOrchestratorConfig().caps.reviewFixAttempts } catch (error) { fail(2, error.message) }

let designChange = null
if (values["--design-change"]) {
  try { designChange = readDesignChange(values["--design-change"]) } catch (error) { fail(2, error.message) }
}

const report = (rounds, recorded) => ({
  branch, headSha, cap, rounds, used: rounds.length, remaining: Math.max(0, cap - rounds.length), recorded,
})

if (kind === null) {
  console.log(JSON.stringify(report(readFixRounds(branch, worktree), null), null, 2))
  process.exit(0)
}

let result
try {
  result = recordFixRound({ branch, kind, headSha, timestamp: new Date().toISOString(), designChange }, cap, worktree)
} catch (error) { fail(2, error.message) }
if (!result.allowed) {
  console.log(JSON.stringify(report(result.rounds, null), null, 2))
  fail(5, `fix round cap ${cap} reached for branch ${branch}: ${result.rounds.map((round) => `${round.number}. ${round.kind} at ${round.headSha.slice(0, 9)}`).join(", ")}. Push the head that meets the acceptance and file the rest, or write the design change and pass --design-change <file>.`)
}
console.log(JSON.stringify(report(result.rounds, result.number), null, 2))
