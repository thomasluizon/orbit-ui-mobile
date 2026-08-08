import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root } from "./_harness.mjs"

const { clearWakeSource, readRunState, readWakeSources, registerWakeSource, runStatePath, wakeSourceDirectory, writeRunState } = await import("../lib/run-state.mjs")

const TOOL = "lib/run-state.mjs"

/** A fake checkout with a real `.git` DIRECTORY, which is what the module writes into. */
const stageCheckout = (label) => {
  const repoRoot = join(root, "run-state", label)
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  return repoRoot
}

export const cases = () => {
  const repoRoot = stageCheckout("basic")
  T(`${TOOL}: no run has written a record, so there is no state and no wake source`, readRunState(repoRoot) === null && readWakeSources(repoRoot).length === 0)

  writeFileSync(runStatePath(repoRoot), JSON.stringify({ sessionId: "s1", sleep: true, remaining: ["ORB-2", "ORB-3"] }))
  const state = readRunState(repoRoot)
  T(`${TOOL}: the orchestrator's record round-trips`, state?.sleep === true && state.remaining.join(",") === "ORB-2,ORB-3", JSON.stringify(state))

  const identity = { repositoryKey: "ui", prNumber: 694, receiptPath: "C:/receipt.json" }
  writeRunState({ ...state, pullRequests: [identity] }, repoRoot)
  writeRunState({ ...state, pullRequests: [] }, repoRoot)
  T(`${TOOL}: clearing pullRequests cannot erase the append-only readiness ledger`, readRunState(repoRoot)?.readinessLedger?.[0]?.prNumber === 694, JSON.stringify(readRunState(repoRoot)))
  writeRunState({ sessionId: "s2", sleep: true, remaining: ["ORB-9"], pullRequests: [] }, repoRoot)
  T(`${TOOL}: a new session starts with a fresh readiness ledger`, readRunState(repoRoot)?.readinessLedger?.length === 0, JSON.stringify(readRunState(repoRoot)))

  registerWakeSource({ pid: 4242, what: "worker ORB-1" }, repoRoot)
  registerWakeSource({ pid: 4343, what: "reviewer ORB-1" }, repoRoot)
  T(
    `${TOOL}: each wake source is its OWN file, so three parallel launchers cannot lose each other`,
    readWakeSources(repoRoot).map((source) => source.pid).sort().join(",") === "4242,4343" && existsSync(join(wakeSourceDirectory(repoRoot), "4242.json")),
    JSON.stringify(readWakeSources(repoRoot)),
  )

  clearWakeSource(4242, repoRoot)
  T(`${TOOL}: a finished launcher removes only its own entry`, readWakeSources(repoRoot).map((source) => source.pid).join(",") === "4343", JSON.stringify(readWakeSources(repoRoot)))
  clearWakeSource(4242, repoRoot)
  T(`${TOOL}: clearing an entry that is already gone is not an error`, readWakeSources(repoRoot).length === 1)

  /** A crashed launcher leaks its file. It must not break the read; liveness is the caller's job. */
  writeFileSync(join(wakeSourceDirectory(repoRoot), "corrupt.json"), "{not json")
  T(`${TOOL}: an unreadable entry is skipped rather than masking the readable ones`, readWakeSources(repoRoot).map((source) => source.pid).join(",") === "4343", JSON.stringify(readWakeSources(repoRoot)))

  /**
   * A linked worktree carries a `.git` FILE, not a directory. Following its `gitdir:` line keeps the
   * state per checkout, so a worker's worktree can never read or clobber the orchestrating session's
   * record, and a suite run from either place still writes somewhere real.
   */
  const linked = join(root, "run-state", "linked")
  const linkedGitDir = join(repoRoot, ".git", "worktrees", "linked")
  mkdirSync(linked, { recursive: true })
  mkdirSync(linkedGitDir, { recursive: true })
  writeFileSync(join(linked, ".git"), `gitdir: ${linkedGitDir}\n`)
  registerWakeSource({ pid: 6161, what: "worker ORB-7" }, linked)
  T(
    `${TOOL}: a linked worktree keeps its own state, never the main checkout's`,
    readWakeSources(linked).map((source) => source.pid).join(",") === "6161" && !readWakeSources(repoRoot).some((source) => source.pid === 6161),
    JSON.stringify({ linked: readWakeSources(linked), main: readWakeSources(repoRoot) }),
  )

  /** Every write fails soft: a status file is never worth failing a launch over. */
  const notADirectory = join(root, "run-state", "a-file")
  writeFileSync(notADirectory, "not a checkout\n")
  let threw = false
  try {
    registerWakeSource({ pid: 5252, what: "worker ORB-9" }, notADirectory)
    clearWakeSource(5252, notADirectory)
  } catch {
    threw = true
  }
  T(`${TOOL}: an unwritable location is a no-op, never a thrown launch failure`, threw === false && readWakeSources(notADirectory).length === 0)
}
