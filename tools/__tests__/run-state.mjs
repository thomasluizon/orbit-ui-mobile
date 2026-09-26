import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
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
const originalLinkSync = fs.linkSync
let synchronized = false
fs.linkSync = (...args) => {
  if (!synchronized && String(args[1]).includes("-slot-")) {
    synchronized = true
    if (Atomics.add(signal, 0, 1) + 1 === 2) {
      Atomics.store(signal, 1, 1)
      Atomics.notify(signal, 1, 2)
    } else {
      while (Atomics.load(signal, 1) === 0) Atomics.wait(signal, 1, 0)
    }
  }
  if (String(args[1]).includes("-slot-") && Atomics.load(signal, 0) < 2) Atomics.add(signal, 2, 1)
  return originalLinkSync(...args)
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
  }))).then((reservations) => ({
    reservations,
    barrierCalls: Atomics.load(new Int32Array(signal), 0),
    publishedBeforeBothArrived: Atomics.load(new Int32Array(signal), 2),
    barrierPath: "linkSync",
  }))
}

const reserveAfterLaterReturns = (moduleUrl, repoRoot, launch) => {
  const signal = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT)
  const workerSource = `
const fs = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const { parentPort, workerData } = require("node:worker_threads")
const signal = new Int32Array(workerData.signal)
if (workerData.earlier) {
  const originalLinkSync = fs.linkSync
  fs.linkSync = (...args) => {
    if (String(args[1]).includes("-slot-")) {
      Atomics.add(signal, 2, 1)
      Atomics.store(signal, 0, 1)
      Atomics.notify(signal, 0)
      while (Atomics.load(signal, 1) === 0) Atomics.wait(signal, 1, 0)
    }
    return originalLinkSync(...args)
  }
  syncBuiltinESMExports()
} else {
  while (Atomics.load(signal, 0) === 0) Atomics.wait(signal, 0, 0)
}
import(workerData.moduleUrl).then(({ reserveWorkerLaunch }) => {
  const reservation = reserveWorkerLaunch(workerData.launch, 1, workerData.repoRoot)
  if (!workerData.earlier) {
    Atomics.store(signal, 1, 1)
    Atomics.notify(signal, 1)
  }
  parentPort.postMessage(reservation)
})
`
  return Promise.all([true, false].map((earlier) => new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      execArgv: [],
      workerData: {
        signal,
        moduleUrl,
        repoRoot,
        earlier,
        launch: { ...launch, timestamp: earlier ? "2026-09-14T00:01:00.000Z" : "2026-09-14T00:02:00.000Z" },
      },
    })
    worker.once("message", resolve)
    worker.once("error", reject)
  }))).then((reservations) => ({ reservations, barrierCalls: Atomics.load(new Int32Array(signal), 2), barrierPath: "linkSync" }))
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

  /**
   * `merged` is the third disposition beside READY and BLOCKED, and it is STICKY where a blocker is
   * not. A blocker can be resolved, so a later write that omits it is a real transition; a merge
   * cannot be undone, so a later write that omits the sha is silence. Letting silence clear it would
   * put a merged pull request back into the Stop hook's pending set at the very next write.
   */
  const mergeSha = "0123456789abcdef0123456789abcdef01234567"
  const merges = stageCheckout("merged-row")
  writeFileSync(runStatePath(merges), JSON.stringify({ sessionId: "s1", sleep: true, remaining: [] }))
  const mergeBase = readRunState(merges)
  writeRunState({ ...mergeBase, pullRequests: [{ repositoryKey: "ui", prNumber: 1023, receiptPath: "C:/r.json" }] }, merges)
  writeRunState({ ...mergeBase, pullRequests: [{ repositoryKey: "ui", prNumber: 1023, receiptPath: "C:/r.json", merged: mergeSha }] }, merges)
  T(
    `${TOOL}: a merge sha recorded after the pull request is already in the ledger is preserved`,
    (readRunState(merges)?.readinessLedger ?? [])[0]?.merged === mergeSha,
    JSON.stringify(readRunState(merges)?.readinessLedger),
  )
  writeRunState({ ...mergeBase, pullRequests: [{ repositoryKey: "ui", prNumber: 1023, receiptPath: "C:/r.json" }] }, merges)
  T(
    `${TOOL}: a later write that omits the merge sha does not un-merge the row`,
    (readRunState(merges)?.readinessLedger ?? [])[0]?.merged === mergeSha,
    JSON.stringify(readRunState(merges)?.readinessLedger),
  )
  const unmerged = stageCheckout("unmerged-row")
  writeFileSync(runStatePath(unmerged), JSON.stringify({ sessionId: "s1", sleep: true, remaining: [] }))
  writeRunState({ ...mergeBase, pullRequests: [{ repositoryKey: "ui", prNumber: 1023, receiptPath: "C:/r.json", merged: "" }] }, unmerged)
  T(
    `${TOOL}: an empty merge sha is recorded as no merge at all`,
    (readRunState(unmerged)?.readinessLedger ?? [])[0]?.merged === null,
    JSON.stringify(readRunState(unmerged)?.readinessLedger),
  )
  const placeholder = stageCheckout("placeholder-merge")
  writeFileSync(runStatePath(placeholder), JSON.stringify({ sessionId: "s1", sleep: true, remaining: [] }))
  writeRunState({ ...mergeBase, pullRequests: [{ repositoryKey: "ui", prNumber: 1023, receiptPath: "C:/r.json", merged: "<merge commit sha once it is merged, or absent>" }] }, placeholder)
  T(
    `${TOOL}: the skill's own unfilled merge-sha placeholder is recorded as no merge at all`,
    (readRunState(placeholder)?.readinessLedger ?? [])[0]?.merged === null,
    JSON.stringify(readRunState(placeholder)?.readinessLedger),
  )

  writeRunState({ sessionId: "s2", sleep: true, remaining: ["ORB-9"], pullRequests: [] }, repoRoot)
  T(`${TOOL}: a new session starts with a fresh readiness ledger`, readRunState(repoRoot)?.readinessLedger?.length === 0, JSON.stringify(readRunState(repoRoot)))

  const launch = { repositoryKey: "ui", branch: "chore/test", headSha: "a".repeat(40), tier: "default", timestamp: "2026-09-14T00:00:00.000Z", relaunchReason: null }
  const occupiedRoot = stageCheckout("occupied-worker")
  registerWakeSource({ pid: process.ppid, what: "worker ORB-1", workerPid: process.pid }, occupiedRoot)
  const occupiedReservation = reserveWorkerLaunch({ ...launch, launcherPid: process.pid }, 2, occupiedRoot)
  T(`${TOOL}: a live worker in the worktree refuses another launch and names its pid`,
    occupiedReservation.allowed === false && occupiedReservation.occupiedWorkerPid === process.pid,
    JSON.stringify(occupiedReservation))
  const staleReclaimRoot = stageCheckout("stale-reclaim")
  const staleClaimDirectory = workerLaunchDirectory(staleReclaimRoot)
  mkdirSync(staleClaimDirectory, { recursive: true })
  writeFileSync(join(staleClaimDirectory, "occupied-worktree.json"), JSON.stringify({ launcherPid: 2147483647, launcherProcessStartIdentity: "gone", gateProtocol: 1 }))
  writeFileSync(join(staleClaimDirectory, "occupied-worktree.json.reclaim"), JSON.stringify({ launcherPid: 2147483647, launcherProcessStartIdentity: "gone" }))
  const reclaimed = reserveWorkerLaunch({ ...launch, launcherPid: process.pid }, 2, staleReclaimRoot)
  T(`${TOOL}: a dead reclaim owner does not strand a stale worktree claim`, reclaimed.allowed === true,
    JSON.stringify(reclaimed))
  const staleRaceRoot = stageCheckout("stale-reclaim-race")
  const staleRaceDirectory = workerLaunchDirectory(staleRaceRoot)
  mkdirSync(staleRaceDirectory, { recursive: true })
  writeFileSync(join(staleRaceDirectory, "occupied-worktree.json"), JSON.stringify({ launcherPid: 2147483647, launcherProcessStartIdentity: "gone", gateProtocol: 1 }))
  writeFileSync(join(staleRaceDirectory, "occupied-worktree.json.reclaim"), JSON.stringify({ launcherPid: 2147483647, launcherProcessStartIdentity: "gone" }))
  const staleContenders = await Promise.all([1, 2].map(() => new Promise((resolve, reject) => {
    const worker = new Worker(`
const { parentPort, workerData } = require("node:worker_threads")
import(workerData.moduleUrl).then(({ reserveWorkerLaunch }) => {
  parentPort.postMessage(reserveWorkerLaunch(workerData.launch, 2, workerData.repoRoot))
})`, { eval: true, execArgv: [], workerData: {
      moduleUrl: new URL("../lib/run-state.mjs", import.meta.url).href,
      launch: { ...launch, launcherPid: process.pid }, repoRoot: staleRaceRoot,
    } })
    worker.once("message", resolve)
    worker.once("error", reject)
  })))
  T(`${TOOL}: concurrent stale reclaimers still admit only one launcher`,
    staleContenders.filter((reservation) => reservation.allowed).length === 1,
    JSON.stringify(staleContenders))
  const legacyRoot = stageCheckout("legacy-unpublished-worker")
  mkdirSync(workerLaunchDirectory(legacyRoot), { recursive: true })
  writeFileSync(join(workerLaunchDirectory(legacyRoot), "occupied-worktree.json"), JSON.stringify({ launcherPid: 2147483647, launcherProcessStartIdentity: "gone" }))
  const legacy = reserveWorkerLaunch({ ...launch, launcherPid: process.pid }, 2, legacyRoot)
  T(`${TOOL}: a pid-less claim from the old launcher stays closed because its child may be live`, legacy.allowed === false,
    JSON.stringify(legacy))
  const partialPublicationRoot = stageCheckout("partial-publication")
  mkdirSync(workerLaunchDirectory(partialPublicationRoot), { recursive: true })
  writeFileSync(join(workerLaunchDirectory(partialPublicationRoot), "occupied-worktree.json.dead.unpublished"), "{")
  const afterPartialPublication = reserveWorkerLaunch({ ...launch, launcherPid: process.pid }, 2, partialPublicationRoot)
  T(`${TOOL}: a killed claim writer leaves only an ignored unpublished file`, afterPartialPublication.allowed === true,
    JSON.stringify(afterPartialPublication))
  const partialRoot = stageCheckout("partial-claim")
  mkdirSync(workerLaunchDirectory(partialRoot), { recursive: true })
  writeFileSync(join(workerLaunchDirectory(partialRoot), "occupied-worktree.json"), "{")
  const partial = reserveWorkerLaunch({ ...launch, launcherPid: process.pid }, 2, partialRoot)
  T(`${TOOL}: a malformed reservation is classified as occupied without overwriting it`,
    partial.allowed === false && readFileSync(join(workerLaunchDirectory(partialRoot), "occupied-worktree.json"), "utf8") === "{",
    JSON.stringify(partial))
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
  const simultaneousRace = await reserveTogether(new URL("../lib/run-state.mjs", import.meta.url).href, raceRoot, launch, 1)
  const racingReservations = simultaneousRace.reservations
  const raceLedger = readWorkerLaunches(raceRoot)
  T(
    `${TOOL}: simultaneous reservations admit exactly one launch and retain its record`,
    racingReservations.filter((reservation) => reservation.allowed).length === 1 && raceLedger.length === 1 && simultaneousRace.barrierCalls === 2 && simultaneousRace.publishedBeforeBothArrived === 0 && simultaneousRace.barrierPath === "linkSync",
    JSON.stringify({ racingReservations, raceLedger, barrierCalls: simultaneousRace.barrierCalls, publishedBeforeBothArrived: simultaneousRace.publishedBeforeBothArrived, barrierPath: simultaneousRace.barrierPath }),
  )

  const freeSlotRoot = stageCheckout("launch-race-free-slot")
  reserveWorkerLaunch(launch, 2, freeSlotRoot)
  const freeSlotRace = await reserveTogether(new URL("../lib/run-state.mjs", import.meta.url).href, freeSlotRoot, launch, 2)
  const contenders = freeSlotRace.reservations
  const freeSlotLedger = readWorkerLaunches(freeSlotRoot)
  T(
    `${TOOL}: simultaneous contenders use the one free slot instead of both yielding it`,
    contenders.filter((reservation) => reservation.allowed).length === 1 &&
      contenders.filter((reservation) => !reservation.allowed).length === 1 &&
      freeSlotLedger.length === 2 && freeSlotRace.barrierCalls === 2 && freeSlotRace.publishedBeforeBothArrived === 0 && freeSlotRace.barrierPath === "linkSync",
    JSON.stringify({ contenders, freeSlotLedger, barrierCalls: freeSlotRace.barrierCalls, publishedBeforeBothArrived: freeSlotRace.publishedBeforeBothArrived, barrierPath: freeSlotRace.barrierPath }),
  )

  const delayedCreateRoot = stageCheckout("launch-race-delayed-create")
  const delayedRace = await reserveAfterLaterReturns(new URL("../lib/run-state.mjs", import.meta.url).href, delayedCreateRoot, launch)
  const delayedCreateReservations = delayedRace.reservations
  const delayedCreateLedger = readWorkerLaunches(delayedCreateRoot)
  T(
    `${TOOL}: a contender returning before an earlier contender creates cannot exceed the cap`,
    delayedCreateReservations.filter((reservation) => reservation.allowed).length === 1 && delayedCreateLedger.length === 1 && delayedRace.barrierCalls === 1 && delayedRace.barrierPath === "linkSync",
    JSON.stringify({ delayedCreateReservations, delayedCreateLedger, barrierCalls: delayedRace.barrierCalls, barrierPath: delayedRace.barrierPath }),
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
  const unsafeAdmission = reserveWorkerLaunch({ ...launch, launcherPid: process.pid }, 1, notADirectory)
  T(`${TOOL}: a real launcher refuses an unrecordable worktree claim`, unsafeAdmission.allowed === false,
    JSON.stringify(unsafeAdmission))
}
