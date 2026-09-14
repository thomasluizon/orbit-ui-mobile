import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Worker } from "node:worker_threads"

import { T, root } from "./_harness.mjs"

const { clearWakeSource, readRunState, readWakeSources, readWorkerLaunches, registerWakeSource, reserveWorkerLaunch, runStatePath, wakeSourceDirectory, workerLaunchDirectory, writeRunState } = await import("../lib/run-state.mjs")

const TOOL = "lib/run-state.mjs"

/** A fake checkout with a real `.git` DIRECTORY, which is what the module writes into. */
const stageCheckout = (label) => {
  const repoRoot = join(root, "run-state", label)
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  return repoRoot
}

const reserveTogether = (moduleUrl, repoRoot, launch, cap) => {
  const signal = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT)
  const workerSource = `
const fs = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const { parentPort, workerData } = require("node:worker_threads")
const signal = new Int32Array(workerData.signal)
const originalWriteFileSync = fs.writeFileSync
const originalReaddirSync = fs.readdirSync
const originalReadFileSync = fs.readFileSync
let expectedReads = 0
let completedReads = 0
fs.writeFileSync = (...args) => {
  const result = originalWriteFileSync(...args)
  if (String(args[0]).includes("orbit-worker-launches") && args[2]?.flag === "wx") {
    if (Atomics.add(signal, 0, 1) + 1 === 2) {
      Atomics.store(signal, 1, 1)
      Atomics.notify(signal, 1, 2)
    } else {
      while (Atomics.load(signal, 1) === 0) Atomics.wait(signal, 1, 0)
    }
  }
  return result
}
fs.readdirSync = (...args) => {
  const names = originalReaddirSync(...args)
  if (String(args[0]).includes("orbit-worker-launches")) expectedReads = names.length
  return names
}
fs.readFileSync = (...args) => {
  const result = originalReadFileSync(...args)
  if (String(args[0]).includes("orbit-worker-launches") && ++completedReads === expectedReads) {
    if (Atomics.add(signal, 2, 1) + 1 === 2) {
      Atomics.notify(signal, 2, 2)
    } else {
      while (Atomics.load(signal, 2) < 2) Atomics.wait(signal, 2, 1)
    }
  }
  return result
}
syncBuiltinESMExports()
import(workerData.moduleUrl).then(({ reserveWorkerLaunch }) => {
  parentPort.postMessage(reserveWorkerLaunch(workerData.launch, workerData.cap, workerData.repoRoot))
})
`
  return Promise.all([1, 2].map((index) => new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      execArgv: [],
      workerData: {
        signal,
        moduleUrl,
        repoRoot,
        cap,
        launch: { ...launch, timestamp: `2026-09-14T00:0${index}:00.000Z` },
      },
    })
    worker.once("message", resolve)
    worker.once("error", reject)
  })))
}

export const cases = async () => {
  const repoRoot = stageCheckout("basic")
  T(`${TOOL}: no run has written a record, so there is no state and no wake source`, readRunState(repoRoot) === null && readWakeSources(repoRoot).length === 0)

  writeFileSync(runStatePath(repoRoot), JSON.stringify({ sessionId: "s1", sleep: true, remaining: ["ORB-2", "ORB-3"] }))
  const state = readRunState(repoRoot)
  T(`${TOOL}: the orchestrator's record round-trips`, state?.sleep === true && state.remaining.join(",") === "ORB-2,ORB-3", JSON.stringify(state))

  const identity = { repositoryKey: "ui", prNumber: 694, receiptPath: "C:/receipt.json" }
  writeRunState({ ...state, pullRequests: [identity] }, repoRoot)
  writeRunState({ ...state, pullRequests: [] }, repoRoot)
  T(`${TOOL}: clearing pullRequests cannot erase the append-only readiness ledger`, readRunState(repoRoot)?.readinessLedger?.[0]?.prNumber === 694, JSON.stringify(readRunState(repoRoot)))
  /**
   * A blocker discovered AFTER a pull request is already in the ledger must reach the ledger.
   *
   * The identity list puts the previous ledger before the current state, so first-seen-wins on the
   * whole row kept the older entry and threw the blocker away. The run then believed nothing was
   * blocking it, which is the quiet direction of that failure: an unattended run reports READY.
   */
  const late = stageCheckout("late-blocker")
  writeFileSync(runStatePath(late), JSON.stringify({ sessionId: "s1", sleep: true, remaining: [] }))
  const base = readRunState(late)
  writeRunState({ ...base, pullRequests: [{ repositoryKey: "ui", prNumber: 701, receiptPath: "C:/r.json" }] }, late)
  writeRunState({ ...base, pullRequests: [{ repositoryKey: "ui", prNumber: 701, receiptPath: "C:/r.json", blocker: "ORB-700" }] }, late)
  const ledger = readRunState(late)?.readinessLedger ?? []
  T(
    `${TOOL}: a blocker recorded after the pull request is already in the ledger is preserved`,
    ledger.length === 1 && ledger[0].blocker === "ORB-700",
    JSON.stringify(ledger),
  )

  /** The same row must not be duplicated by the merge, or the ledger stops being one row per PR. */
  T(`${TOOL}: merging a later sighting does not duplicate the row`, ledger.filter((row) => row.prNumber === 701).length === 1, JSON.stringify(ledger))

  /** A blocker that has since been resolved must be able to clear, or a stale one strands the run. */
  writeRunState({ ...base, pullRequests: [{ repositoryKey: "ui", prNumber: 701, receiptPath: "C:/r.json" }] }, late)
  T(
    `${TOOL}: a blocker that is no longer reported clears rather than sticking forever`,
    (readRunState(late)?.readinessLedger ?? [])[0]?.blocker === null,
    JSON.stringify(readRunState(late)?.readinessLedger),
  )

  writeRunState({ sessionId: "s2", sleep: true, remaining: ["ORB-9"], pullRequests: [] }, repoRoot)
  T(`${TOOL}: a new session starts with a fresh readiness ledger`, readRunState(repoRoot)?.readinessLedger?.length === 0, JSON.stringify(readRunState(repoRoot)))

  const launch = { repositoryKey: "ui", branch: "chore/test", headSha: "a".repeat(40), tier: "default", timestamp: "2026-09-14T00:00:00.000Z", relaunchReason: null }
  const firstReservation = reserveWorkerLaunch(launch, 1, repoRoot)
  const refusedReservation = reserveWorkerLaunch({ ...launch, timestamp: "2026-09-14T00:01:00.000Z" }, 1, repoRoot)
  const reasonedReservation = reserveWorkerLaunch({ ...launch, timestamp: "2026-09-14T00:02:00.000Z", relaunchReason: "known conflict list" }, 1, repoRoot)
  T(
    `${TOOL}: the worker ledger records below-cap launches, refuses the cap, and records a deliberate override`,
    firstReservation.allowed && !refusedReservation.allowed && reasonedReservation.allowed &&
      readWorkerLaunches(repoRoot).length === 2 &&
      readWorkerLaunches(repoRoot)[1].relaunchReason === "known conflict list" &&
      existsSync(workerLaunchDirectory(repoRoot)),
    JSON.stringify(readWorkerLaunches(repoRoot)),
  )

  const raceRoot = stageCheckout("launch-race")
  const racingReservations = await reserveTogether(new URL("../lib/run-state.mjs", import.meta.url).href, raceRoot, launch, 1)
  const raceLedger = readWorkerLaunches(raceRoot)
  T(
    `${TOOL}: simultaneous reservations admit exactly one launch and retain its record`,
    racingReservations.filter((reservation) => reservation.allowed).length === 1 && raceLedger.length === 1,
    JSON.stringify({ racingReservations, raceLedger }),
  )

  const freeSlotRoot = stageCheckout("launch-race-free-slot")
  reserveWorkerLaunch(launch, 2, freeSlotRoot)
  const contenders = await reserveTogether(new URL("../lib/run-state.mjs", import.meta.url).href, freeSlotRoot, launch, 2)
  const freeSlotLedger = readWorkerLaunches(freeSlotRoot)
  T(
    `${TOOL}: simultaneous contenders use the one free slot instead of both yielding it`,
    contenders.filter((reservation) => reservation.allowed).length === 1 &&
      contenders.filter((reservation) => !reservation.allowed).length === 1 &&
      freeSlotLedger.length === 2,
    JSON.stringify({ contenders, freeSlotLedger }),
  )

  registerWakeSource({ pid: process.pid, what: "worker ORB-1" }, repoRoot)
  registerWakeSource({ pid: process.ppid, what: "worker ORB-2" }, repoRoot)
  T(
    `${TOOL}: each wake source is its OWN file, so three parallel launchers cannot lose each other`,
    readWakeSources(repoRoot).map((source) => source.pid).sort().join(",") === [process.pid, process.ppid].sort().join(",") && existsSync(join(wakeSourceDirectory(repoRoot), `${process.pid}.json`)),
    JSON.stringify(readWakeSources(repoRoot)),
  )

  clearWakeSource(process.pid, repoRoot)
  T(`${TOOL}: a finished launcher removes only its own entry`, readWakeSources(repoRoot).map((source) => source.pid).join(",") === String(process.ppid), JSON.stringify(readWakeSources(repoRoot)))
  clearWakeSource(process.pid, repoRoot)
  T(`${TOOL}: clearing an entry that is already gone is not an error`, readWakeSources(repoRoot).length === 1)

  /** A crashed launcher leaks its file. It must not break the read; unreadable records supply no identity evidence. */
  writeFileSync(join(wakeSourceDirectory(repoRoot), "corrupt.json"), "{not json")
  T(`${TOOL}: an unreadable entry is skipped rather than masking the readable ones`, readWakeSources(repoRoot).map((source) => source.pid).join(",") === String(process.ppid), JSON.stringify(readWakeSources(repoRoot)))

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
  registerWakeSource({ pid: process.pid, what: "worker ORB-7" }, linked)
  T(
    `${TOOL}: a linked worktree keeps its own state, never the main checkout's`,
    readWakeSources(linked).map((source) => source.pid).join(",") === String(process.pid) && !readWakeSources(repoRoot).some((source) => source.pid === process.pid),
    JSON.stringify({ linked: readWakeSources(linked), main: readWakeSources(repoRoot) }),
  )

  /** Every write fails soft: a status file is never worth failing a launch over. */
  const notADirectory = join(root, "run-state", "a-file")
  writeFileSync(notADirectory, "not a checkout\n")
  let threw = false
  try {
    registerWakeSource({ pid: 5252, what: "worker ORB-9" }, notADirectory)
    clearWakeSource(5252, notADirectory)
    reserveWorkerLaunch(launch, 1, notADirectory)
  } catch {
    threw = true
  }
  T(`${TOOL}: an unwritable location is a no-op, never a thrown launch failure`, threw === false && readWakeSources(notADirectory).length === 0)
}
