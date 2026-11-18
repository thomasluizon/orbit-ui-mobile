import { spawn, spawnSync } from "node:child_process"
import fs, { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  CLEANUP_INTERVAL_MS, FREE_DISK_FLOOR_BYTES, MINIMUM_BRANCH_AGE_MS, cleanupDueReason, cleanupIsRunning, collectListing, describeBytes, readCleanupAdoption, readCleanupMarker, removeListed, summarize, systemProbes, takeCleanupLock,
} from "../lib/stale-files.mjs"
import * as staleFiles from "../lib/stale-files.mjs"
import { T, root, same } from "./_harness.mjs"
import { claudeProcessFields, reusedPidRecord } from "./owner-questions-core.mjs"
import { processStartIdentity } from "../lib/run-state.mjs"

const THIS = "00000000-0000-4000-8000-000000000000"
const CHAIN_PREDECESSOR = "11111111-0000-4000-8000-000000000001"
const RUN_PREDECESSOR = "22222222-0000-4000-8000-000000000002"
const SUCCESSOR = "33333333-0000-4000-8000-000000000003"
const LIVE_RECORD = "44444444-0000-4000-8000-000000000004"
const LIVE_DIRECTORY = "55555555-0000-4000-8000-000000000005"
const LIVE_COMMAND = "66666666-0000-4000-8000-000000000006"
const LINKED = "77777777-0000-4000-8000-000000000007"
const CHAINED = "88888888-0000-4000-8000-000000000008"
const HOLDS_WORK = "99999999-0000-4000-8000-000000000009"
const STALE = "aaaaaaaa-0000-4000-8000-00000000000a"
const OTHER = "cccccccc-0000-4000-8000-00000000000c"
const LIVE_CARRY = "0f0f0f0f-0000-4000-8000-00000000000f"
const LIVE_ELSEWHERE = "dddddddd-0000-4000-8000-00000000000d"
const SESSIONS = [THIS, CHAIN_PREDECESSOR, RUN_PREDECESSOR, SUCCESSOR, LIVE_RECORD, LIVE_DIRECTORY, LIVE_COMMAND, LINKED, CHAINED, HOLDS_WORK, STALE]

/** One checkout with a run state and a chain ledger, one session root and one carry root, all under the suite root. */
const stageMachine = (label) => {
  const base = join(root, "stale-core", label)
  const checkout = join(base, "checkout")
  const sessionRoot = join(base, "sessions")
  const carryRoot = join(base, "carry")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  mkdirSync(carryRoot, { recursive: true })
  writeFileSync(join(checkout, ".git", "orbit-orchestrate-run.json"), JSON.stringify({ sessionId: THIS, relay: { from: RUN_PREDECESSOR, pending: true, successorSessionId: SUCCESSOR } }))
  writeFileSync(join(checkout, ".git", "orbit-session-chain.json"), JSON.stringify({ chains: [{ id: "chain", currentSessionId: THIS,
    entries: [{ sessionId: STALE, successorSessionId: CHAIN_PREDECESSOR }, { sessionId: CHAIN_PREDECESSOR, successorSessionId: THIS }] }] }))
  for (const session of SESSIONS) mkdirSync(join(sessionRoot, session, "scratchpad"), { recursive: true })
  mkdirSync(join(sessionRoot, "tasks-not-a-session"))
  return { base, checkout, sessionRoot, carryRoot,
    context: { sessionId: THIS, sessionRoot, carryRoot, repositories: {}, configDirectories: [], repoRoot: checkout } }
}

/** Live session records with no working directory. A listing session always runs, so it has one too. */
const liveRecords = (...sessionIds) => () => sessionIds.map((sessionId) => ({ sessionId, cwd: null }))
const quietProbes = { ...systemProbes, processes: () => [], liveSessions: liveRecords(THIS, OTHER), git: () => "", pullRequests: () => [], measure: () => 1024 }
/** Real git with the live evidence stubbed: the suite has no live session record, so real liveness reads would keep every item. */
const realGitProbes = { ...quietProbes, git: systemProbes.git }
/** A listed worktree as the stub listings judge it: on its branch `done` at the tip `2`. */
const finishedItem = (path, repository) => ({ kind: "worktree", path, repository, branch: "done", tip: "2", reason: "pull request #1 merged" })
/** The stub git answer of a worktree on the branch `done` at the tip `2`; every other read answers empty. */
const onFinishedTip = (args) => (args[0] !== "rev-parse" ? "" : args.includes("--symbolic-full-name") ? "refs/heads/done" : "2")
const reasonOf = (listing, path) => listing.kept.find((item) => item.path === path)?.reason
const stalePaths = (listing, kind) => listing.stale.filter((item) => item.kind === kind).map((item) => item.path)

const sessionCases = () => {
  const machine = stageMachine("sessions")
  const directory = (session) => join(machine.sessionRoot, session)
  mkdirSync(join(directory(LINKED), "scratchpad", "build"))
  // The live session links to a link in a second directory, which links on: the middle directory must stay too.
  symlinkSync(join(directory(LINKED), "scratchpad", "build"), join(directory(CHAINED), "scratchpad", "build"), "dir")
  symlinkSync(join(directory(CHAINED), "scratchpad", "build"), join(directory(LIVE_RECORD), "scratchpad", "build"), "dir")
  const worktree = join(directory(HOLDS_WORK), "scratchpad", "scratch-worktree")
  mkdirSync(worktree)
  const probes = { ...quietProbes,
    // The idle login shell in the stale directory is what Orca leaves in a worktree; it must not keep the directory.
    processes: () => [{ command: `node wait-file.mjs --file ${join(directory(LIVE_COMMAND), "scratchpad", "done.json")}`, directory: machine.checkout },
      { command: "node build.mjs", directory: join(directory(LIVE_DIRECTORY), "scratchpad") }, { command: "-/bin/zsh -l", directory: directory(STALE) },
      { command: "/bin/bash -c npm test", directory: directory(STALE) }],
    liveSessions: () => [{ sessionId: THIS, cwd: null }, { sessionId: LIVE_RECORD, cwd: machine.checkout }],
    git: (cwd, args) => (args[0] === "worktree" ? `worktree ${machine.checkout}\nHEAD 1\nbranch refs/heads/main\n\nworktree ${worktree}\nHEAD 2\nbranch refs/heads/scratch\n` : cwd === worktree ? " M unsaved.txt" : "") }
  const listing = collectListing({ ...machine.context, repositories: { ui: machine.checkout } }, { probes })
  same("stale-files: only the session directory that no session owns is stale", stalePaths(listing, "session"), [directory(STALE)])
  T("stale-files: the stale session directory carries its size and the reason", listing.stale[0]?.bytes === 1024 && /not this session, its predecessor, or a session with a live process/.test(listing.stale[0]?.reason), JSON.stringify(listing.stale))
  for (const [name, session, reason] of [
    ["this session", THIS, /^this session$/], ["the chain predecessor", CHAIN_PREDECESSOR, /predecessor of this session/],
    ["the run state predecessor", RUN_PREDECESSOR, /predecessor of this session/], ["the nominated successor", SUCCESSOR, /nominated successor/],
    ["a session with a live record", LIVE_RECORD, /live session 44444444 uses it/], ["a session a process works in", LIVE_DIRECTORY, /a live process works in it/],
    ["a session a process names", LIVE_COMMAND, /a live process names it/], ["a directory a live scratchpad links into", LINKED, /scratchpad of session 44444444 links into it/],
    ["the middle directory of a link chain", CHAINED, /scratchpad of session 44444444 links into it/],
    ["a directory with an uncommitted worktree", HOLDS_WORK, /holds an uncommitted change/],
  ]) T(`stale-files: ${name} is kept`, reason.test(reasonOf(listing, directory(session)) ?? ""), `reason: ${reasonOf(listing, directory(session))}`)
  same("stale-files: a directory that is not a session id is never an item", [...listing.stale, ...listing.kept].some((item) => item.path.includes("tasks-not-a-session")), false)
  // A second session in the same checkout lists and removes too: the run's own relay pair must stay for it as well.
  const second = collectListing({ ...machine.context, sessionId: OTHER, repositories: { ui: machine.checkout } },
    { probes: { ...probes, liveSessions: () => [{ sessionId: LIVE_RECORD, cwd: machine.checkout }, { sessionId: OTHER, cwd: machine.checkout }] } })
  same("stale-files: another session's listing marks only the same session directory stale", stalePaths(second, "session"), [directory(STALE)])
  for (const [name, session, reason] of [
    ["the run session", THIS, /^the run session$/], ["the run session's chain predecessor", CHAIN_PREDECESSOR, /predecessor of the run session/],
    ["the run session's relay predecessor", RUN_PREDECESSOR, /predecessor of the run session/], ["the run session's nominated successor", SUCCESSOR, /nominated successor of the run session/],
  ]) T(`stale-files: from another session, ${name} is kept`, reason.test(reasonOf(second, directory(session)) ?? ""), `reason: ${reasonOf(second, directory(session))}`)
  // A session in a linked worktree lists too, and the run writes its record and its chain ledger in the primary checkout.
  const linked = join(machine.base, "linked")
  mkdirSync(join(machine.checkout, ".git", "worktrees", "linked"), { recursive: true })
  mkdirSync(linked)
  writeFileSync(join(linked, ".git"), `gitdir: ${join(machine.checkout, ".git", "worktrees", "linked")}\n`)
  writeFileSync(join(machine.checkout, ".git", "worktrees", "linked", "commondir"), "../..\n")
  const fromLinked = collectListing({ ...machine.context, sessionId: OTHER, repoRoot: linked }, { probes: quietProbes })
  for (const [name, session, reason] of [
    ["the run session", THIS, /^the run session$/], ["the run session's chain predecessor", CHAIN_PREDECESSOR, /predecessor of the run session/],
    ["the run session's relay predecessor", RUN_PREDECESSOR, /predecessor of the run session/], ["the run session's nominated successor", SUCCESSOR, /nominated successor of the run session/],
  ]) T(`stale-files: from a linked worktree, ${name} is kept`, reason.test(reasonOf(fromLinked, directory(session)) ?? ""), `reason: ${reasonOf(fromLinked, directory(session))}`)
  // A repository whose worktrees git cannot list could hold the open pull request's tree in any session directory.
  const unlisted = collectListing({ ...machine.context, repositories: { ui: machine.checkout } },
    { probes: { ...quietProbes, git: (cwd, args) => (args[0] === "worktree" ? null : "") } })
  T("stale-files: an unreadable worktree list keeps every session directory", stalePaths(unlisted, "session").length === 0
    && /worktrees of .* could not be listed/.test(reasonOf(unlisted, directory(STALE)) ?? ""), JSON.stringify(unlisted.stale))
  const blind = collectListing(machine.context, { probes: { ...quietProbes, processes: () => null } })
  T("stale-files: an unreadable process table keeps every session directory", stalePaths(blind, "session").length === 0 && /process table could not be read/.test(reasonOf(blind, directory(STALE)) ?? ""), JSON.stringify(blind.stale))
  const rootless = collectListing({ ...machine.context, sessionRoot: null }, { probes: quietProbes })
  same("stale-files: no session root means no session item", [...rootless.stale, ...rootless.kept].filter((item) => item.kind === "session").length, 0)
}

const carryCases = () => {
  const machine = stageMachine("carry")
  const copies = [["durable-0f0f0f0f", 60], ["durable-0a0a0a0a", 50], ["durable-0b0b0b0b", 40], ["durable-22222222", 30], ["durable-0d0d0d0d", 20], ["durable-0e0e0e0e", 10]]
  for (const [name, age] of copies) {
    mkdirSync(join(machine.carryRoot, name, "kept-build"), { recursive: true })
    utimesSync(join(machine.carryRoot, name), new Date(Date.now() - age * 3_600_000), new Date(Date.now() - age * 3_600_000))
  }
  mkdirSync(join(machine.carryRoot, "scratchpad"))
  writeFileSync(join(machine.carryRoot, "carry-0a0a0a0a.log"), "carried\n")
  symlinkSync(join(machine.carryRoot, "durable-0b0b0b0b", "kept-build"), join(machine.sessionRoot, THIS, "scratchpad", "kept-build"), "dir")
  // A live session in another checkout still mirrors its scratchpad into its own durable copy, however old the copy's directory is.
  const listing = collectListing(machine.context, { probes: { ...quietProbes, liveSessions: () => [{ sessionId: THIS, cwd: null }, { sessionId: LIVE_CARRY, cwd: machine.base }] } })
  const copy = (name) => join(machine.carryRoot, name)
  same("stale-files: only a durable copy older than the newest two is stale", stalePaths(listing, "carry"), [copy("durable-0a0a0a0a")])
  T("stale-files: the stale durable copy names its reason", /older than the newest two durable copies/.test(listing.stale.find((item) => item.kind === "carry")?.reason ?? ""), JSON.stringify(listing.stale))
  for (const name of ["durable-0e0e0e0e", "durable-0d0d0d0d"]) T(`stale-files: ${name} is one of the newest two`, /newest two/.test(reasonOf(listing, copy(name)) ?? ""), `reason: ${reasonOf(listing, copy(name))}`)
  T("stale-files: the durable copy of the predecessor is kept at any age", /durable copy of the predecessor/.test(reasonOf(listing, copy("durable-22222222")) ?? ""), `reason: ${reasonOf(listing, copy("durable-22222222"))}`)
  T("stale-files: a durable copy this scratchpad links into is kept", /scratchpad of session 00000000 links into it/.test(reasonOf(listing, copy("durable-0b0b0b0b")) ?? ""), `reason: ${reasonOf(listing, copy("durable-0b0b0b0b"))}`)
  T("stale-files: the durable copy of a live session is kept at any age", /durable copy of live session 0f0f0f0f/.test(reasonOf(listing, copy("durable-0f0f0f0f")) ?? ""), `reason: ${reasonOf(listing, copy("durable-0f0f0f0f"))}`)
  same("stale-files: other entries of the carry root are never items", [...listing.stale, ...listing.kept].filter((item) => item.kind === "carry").length, 6)
}

/** Claude Code keeps `<session base>/<project>/<session id>/scratchpad`: the run session and a live session can sit in another project's root. */
const rootCases = () => {
  const machine = stageMachine("roots")
  const listingRoot = join(machine.base, "linked-project")
  const otherRoot = join(machine.base, "other-project")
  for (const session of [OTHER, STALE, CHAINED]) mkdirSync(join(listingRoot, session, "scratchpad"), { recursive: true })
  mkdirSync(join(otherRoot, LIVE_ELSEWHERE, "scratchpad"), { recursive: true })
  for (const [name, age] of [["durable-0a0a0a0a", 30], ["durable-0d0d0d0d", 20], ["durable-0e0e0e0e", 10]]) {
    mkdirSync(join(machine.carryRoot, name, "kept-build"), { recursive: true })
    utimesSync(join(machine.carryRoot, name), new Date(Date.now() - age * 3_600_000), new Date(Date.now() - age * 3_600_000))
  }
  const linkedCopy = join(machine.carryRoot, "durable-0a0a0a0a")
  // The run session's scratchpad, in the primary checkout's project root, links into a copy that is not one of the newest two.
  symlinkSync(join(linkedCopy, "kept-build"), join(machine.sessionRoot, THIS, "scratchpad", "kept-build"), "dir")
  // A live session in a third project links into an old session directory of the listing's own root.
  mkdirSync(join(listingRoot, STALE, "scratchpad", "build"))
  symlinkSync(join(listingRoot, STALE, "scratchpad", "build"), join(otherRoot, LIVE_ELSEWHERE, "scratchpad", "build"), "dir")
  // The run session keeps a finished worktree in its scratchpad, and no process works in it at the moment of the listing.
  const runWorktree = join(machine.sessionRoot, THIS, "scratchpad", "wt")
  mkdirSync(runWorktree)
  const probes = { ...quietProbes, liveSessions: liveRecords(OTHER, LIVE_ELSEWHERE),
    git: (cwd, args) => (args[0] === "worktree" ? `worktree ${machine.checkout}\nHEAD 1\nbranch refs/heads/main\n\nworktree ${runWorktree}\nHEAD 2\nbranch refs/heads/done\n` : "") }
  const context = { ...machine.context, sessionId: OTHER, sessionRoot: listingRoot, repositories: { ui: machine.checkout } }
  const listing = collectListing(context, { probes })
  T("stale-files: a durable copy that the run session's scratchpad in another project root links into is kept", /scratchpad of session 00000000 links into it/.test(reasonOf(listing, linkedCopy) ?? ""), `reason: ${reasonOf(listing, linkedCopy)}`)
  T("stale-files: a session directory that a live session in another project root links into is kept", /scratchpad of session dddddddd links into it/.test(reasonOf(listing, join(listingRoot, STALE)) ?? ""), `reason: ${reasonOf(listing, join(listingRoot, STALE))}`)
  same("stale-files: from a linked project root, only the session directory that nothing reads is stale", stalePaths(listing, "session"), [join(listingRoot, CHAINED)])
  T("stale-files: a worktree in the directory of the run session in another project root is kept", /directory of session 00000000, which stays: the run session/.test(reasonOf(listing, runWorktree) ?? ""), `reason: ${reasonOf(listing, runWorktree)}`)
  // A scratchpad that exists and cannot be read can link anywhere. The superuser reads it anyway, so the case needs another user.
  if (process.getuid?.() !== 0) {
    const runScratchpad = join(machine.sessionRoot, THIS, "scratchpad")
    chmodSync(runScratchpad, 0o000)
    let sealed
    try { sealed = collectListing(context, { probes }) } finally { chmodSync(runScratchpad, 0o755) }
    T("stale-files: an unreadable scratchpad of a session that stays keeps every durable copy older than the newest two", /scratchpads .* could not be read/.test(reasonOf(sealed, linkedCopy) ?? ""), `reason: ${reasonOf(sealed, linkedCopy)}`)
  }
  const rootless = collectListing({ ...context, sessionRoot: null }, { probes })
  T("stale-files: with no session root, a durable copy older than the newest two is kept", /scratchpads .* could not be read/.test(reasonOf(rootless, linkedCopy) ?? ""), `reason: ${reasonOf(rootless, linkedCopy)}`)
  T("stale-files: with no session root, a worktree inside a session directory is kept", /in a session directory, .* could not be read/.test(reasonOf(rootless, runWorktree) ?? ""), `reason: ${reasonOf(rootless, runWorktree)}`)
}

/**
 * Runs `list` while the first listing of `directory` removes its entry `name` right after it reads the names, as a removal by
 * another session or the system's /tmp clean can. `removed` proves that the listing reached the race.
 */
const listWithRemovalAfterListing = (directory, name, list) => {
  const target = realpathSync.native(directory)
  const listDirectory = fs.readdirSync
  let removed = false
  fs.readdirSync = function (path, ...options) {
    const names = listDirectory.call(this, path, ...options)
    if (!removed && String(path) === target) {
      removed = true
      rmSync(join(target, name), { recursive: true })
    }
    return names
  }
  syncBuiltinESMExports()
  try {
    return { listing: list(), removed }
  } catch (error) {
    return { error, removed }
  } finally {
    fs.readdirSync = listDirectory
    syncBuiltinESMExports()
  }
}

/** An entry that goes away between the listing of its root and its own stat is gone; it never ends the whole listing. */
const raceCases = () => {
  const machine = stageMachine("race")
  const carryRoot = join(root, "stale-core", "race-carry")
  const otherRoot = join(machine.base, "other-project")
  mkdirSync(join(otherRoot, LIVE_ELSEWHERE, "scratchpad"), { recursive: true })
  for (const [name, age] of [["durable-0a0a0a0a", 30], ["durable-0d0d0d0d", 20], ["durable-0e0e0e0e", 10]]) {
    mkdirSync(join(carryRoot, name), { recursive: true })
    utimesSync(join(carryRoot, name), new Date(Date.now() - age * 3_600_000), new Date(Date.now() - age * 3_600_000))
  }
  const context = { ...machine.context, carryRoot }
  const outcome = (raced) => raced.error ? `threw ${raced.error.code}: ${raced.error.message}` : `removed: ${raced.removed}, stale: ${JSON.stringify(raced.listing.stale)}`
  const items = (raced) => [...raced.listing.stale, ...raced.listing.kept].map((item) => item.path)
  const stale = join(machine.sessionRoot, STALE)
  const elsewhere = listWithRemovalAfterListing(otherRoot, LIVE_ELSEWHERE, () => collectListing(context, { probes: quietProbes }))
  T("stale-files: a session directory of another project root that goes away between the listing and its stat is skipped", elsewhere.removed && !elsewhere.error
    && stalePaths(elsewhere.listing, "session").includes(stale), outcome(elsewhere))
  const own = listWithRemovalAfterListing(machine.sessionRoot, STALE, () => collectListing(context, { probes: quietProbes }))
  T("stale-files: a session directory of the listing's own root that goes away between the listing and its stat is no item", own.removed && !own.error
    && !items(own).includes(stale) && /nominated successor/.test(reasonOf(own.listing, join(machine.sessionRoot, SUCCESSOR)) ?? ""), outcome(own))
  const oldest = join(carryRoot, "durable-0a0a0a0a")
  const carry = listWithRemovalAfterListing(carryRoot, "durable-0a0a0a0a", () => collectListing(context, { probes: quietProbes }))
  T("stale-files: a durable copy that goes away between the listing and its stat is no item", carry.removed && !carry.error
    && !items(carry).includes(oldest) && stalePaths(carry.listing, "carry").length === 0, outcome(carry))
  // Only a missing entry is skipped. An entry of a root that can be listed and not searched still stops the listing.
  if (process.getuid?.() === 0) return
  mkdirSync(join(otherRoot, LIVE_ELSEWHERE))
  chmodSync(otherRoot, 0o444)
  let sealed
  try { sealed = collectListing(context, { probes: quietProbes }) } catch (error) { sealed = { error } } finally { chmodSync(otherRoot, 0o755) }
  T("stale-files: an entry whose stat fails with an error other than ENOENT still stops the listing", sealed.error?.code === "EACCES", sealed.error ? `threw ${sealed.error.code}` : "the listing completed")
}

/** The real session record reader: the records Claude Code writes, judged as the run state judges them. */
const recordCases = () => {
  const machine = stageMachine("records")
  const directory = (session) => join(machine.sessionRoot, session)
  const own = claudeProcessFields(process.pid)
  const listWith = (label, records) => {
    const configDirectory = join(machine.base, `claude-${label}`)
    mkdirSync(join(configDirectory, "sessions"), { recursive: true })
    for (const [name, body] of Object.entries(records)) writeFileSync(join(configDirectory, "sessions", name), typeof body === "string" ? body : JSON.stringify(body))
    return collectListing({ ...machine.context, configDirectories: [configDirectory] }, { probes: { ...quietProbes, liveSessions: systemProbes.liveSessions } })
  }
  const ownRecord = { ...own, pid: process.pid, sessionId: THIS }
  const liveRecord = { ...own, pid: process.pid, sessionId: LIVE_RECORD }
  const live = listWith("live", { "own.json": ownRecord, "live.json": liveRecord })
  T("stale-files: a session record in this platform's Claude Code format keeps its session directory", /live session 44444444 uses it/.test(reasonOf(live, directory(LIVE_RECORD)) ?? ""), `reason: ${reasonOf(live, directory(LIVE_RECORD))}`)
  T("stale-files: with every session record read, a directory no session owns is stale", stalePaths(live, "session").includes(directory(STALE)), JSON.stringify(live.stale))
  const corrupt = listWith("corrupt", { "own.json": ownRecord, [`${process.ppid}.json`]: `{"pid": ${process.ppid}, "sessionId": "4444` })
  T("stale-files: a session record that cannot be parsed keeps every session directory nothing else protects", stalePaths(corrupt, "session").length === 0
    && /live sessions could not be read/.test(reasonOf(corrupt, directory(STALE)) ?? ""), `stale: ${JSON.stringify(corrupt.stale)}, reason: ${reasonOf(corrupt, directory(STALE))}`)
  const unseen = listWith("unseen", { "live.json": liveRecord })
  T("stale-files: a listing session with no live record of its own keeps every session directory nothing else protects", stalePaths(unseen, "session").length === 0
    && /no live session record names this session 00000000/.test(reasonOf(unseen, directory(STALE)) ?? ""), `stale: ${JSON.stringify(unseen.stale)}, reason: ${reasonOf(unseen, directory(STALE))}`)
  // Off macOS and Linux the record format is unconfirmed, so the reader proves a pid alone there.
  if (!own.pidDomain) return
  const reused = listWith("reused", { "own.json": ownRecord, "reused.json": { ...reusedPidRecord(process.pid), sessionId: LIVE_RECORD } })
  T("stale-files: a crashed session whose pid a later process reuses keeps no directory", stalePaths(reused, "session").includes(directory(LIVE_RECORD)), `reason: ${reasonOf(reused, directory(LIVE_RECORD))}`)
}

const removalCases = () => {
  const machine = stageMachine("removal")
  const directory = (session) => join(machine.sessionRoot, session)
  const outside = join(machine.base, "outside")
  mkdirSync(outside)
  writeFileSync(join(outside, "sentinel.txt"), "must survive\n")
  symlinkSync(outside, join(directory(STALE), "scratchpad", "outside"), "dir")
  // A live process works in one directory, so the listing at the removal keeps it.
  const probes = { ...quietProbes, processes: () => [{ command: "node build.mjs", directory: directory(LIVE_COMMAND) }] }
  const unowned = [LIVE_RECORD, LIVE_DIRECTORY, LINKED, CHAINED, HOLDS_WORK, STALE]
  const listing = collectListing(machine.context, { probes, measure: false })
  same("stale-files: the removal fixture lists every session directory that no session and no process owns", stalePaths(listing, "session").sort(), unowned.map(directory).sort())
  const foreign = { kind: "session", path: outside, bytes: 1, reason: "planted" }
  // A listing that this library did not make can name a directory directly under a root that is no item of that kind.
  const forgedCopy = join(machine.carryRoot, "not-a-copy")
  const forgedSession = join(machine.sessionRoot, "tasks-not-a-session")
  mkdirSync(forgedCopy)
  const forged = [{ kind: "carry", path: forgedCopy, bytes: 1, reason: "planted" }, { kind: "session", path: forgedSession, bytes: 1, reason: "planted" }]
  const outcome = removeListed({ ...listing, stale: [...listing.stale, foreign, ...forged] }, {}, { probes })
  same("stale-files: a directory under a root without the name of its kind is refused by its name, not removed",
    outcome.failed.filter((item) => item.path !== outside).map((item) => `${item.reason}: ${existsSync(item.path)}`).sort(),
    [`${forgedCopy} has no durable-<8 hex digits> name: true`, `${forgedSession} has no session id name: true`])
  same("stale-files: removal deletes each stale item of the listing", outcome.removed.map((item) => item.path).sort(), unowned.map(directory).sort())
  same("stale-files: the removed directories are gone", outcome.removed.some((item) => existsSync(item.path)), false)
  T("stale-files: a directory that a live process works in survives", existsSync(directory(LIVE_COMMAND)))
  T("stale-files: a protected session directory survives", [THIS, CHAIN_PREDECESSOR, RUN_PREDECESSOR, SUCCESSOR].every((session) => existsSync(directory(session))))
  same("stale-files: a link inside a removed directory is unlinked and its target survives", readFileSync(join(outside, "sentinel.txt"), "utf8"), "must survive\n")
  T("stale-files: a path outside the session root is refused, not removed", outcome.failed.some((item) => item.path === outside) && existsSync(outside), JSON.stringify(outcome.failed))
  T("stale-files: removal reports the change of free space as a number", Number.isFinite(outcome.freed))
}

/** A worktree inside another one goes first, and when git refuses it, the outer one stays: its removal would take the inner tree. */
const nestedRemovalCases = () => {
  const machine = stageMachine("nested-removal")
  const outer = join(machine.base, "outer")
  const inner = join(outer, ".claude", "worktrees", "inner")
  mkdirSync(inner, { recursive: true })
  const listing = { ...collectListing(machine.context, { probes: quietProbes }), stale: [outer, inner].map((path) => finishedItem(path, machine.checkout)) }
  const removals = []
  const probes = { ...quietProbes, git: (cwd, args) => {
    if (!args.includes("remove")) return onFinishedTip(args)
    removals.push(args.at(-1))
    return args.at(-1) === inner ? null : ""
  } }
  const outcome = removeListed(listing, {}, { probes })
  same("stale-files: the removal asks git for the inner worktree only, never for the worktree around it", removals, [inner])
  same("stale-files: the inner worktree that git refused is reported as failed", outcome.failed.map((item) => item.path), [inner])
  same("stale-files: the worktree around a refused inner worktree is skipped with the reason", outcome.skipped.map((item) => `${item.path}: ${item.reason}`), [`${outer}: ${inner} in it could not be removed`])
}

/** A repository with one commit of `tracked.txt` and a finished worktree of it; `configure` runs before the worktree is made. */
const stageFinishedWorktree = (label, configure = []) => {
  const machine = stageMachine(label)
  const repository = join(machine.base, "repository")
  const finished = join(machine.base, "finished")
  mkdirSync(repository)
  writeFileSync(join(repository, "tracked.txt"), "committed\n")
  const git = (args) => spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" })
  const staged = [["init", "-q", "--initial-branch=main"], ["add", "tracked.txt"], ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "base"],
    ...configure, ["worktree", "add", "-q", "-b", "feature/finished", finished]].every((args) => git(args).status === 0)
  T(`stale-files: the ${label} fixture stages`, staged)
  const tip = git(["rev-parse", "HEAD"]).stdout.trim()
  const listing = { ...collectListing(machine.context, { probes: quietProbes }), stale: [{ kind: "worktree", path: finished, repository, branch: "feature/finished", tip, reason: "pull request #1 merged" }] }
  return staged ? { machine, repository, finished, git, listing } : null
}

/**
 * A file can appear in a listed worktree after the check that runs just before the removal, and `git worktree remove`
 * refuses it through its own `git status`, which reads `status.showUntrackedFiles` and `core.excludesFile` too. With
 * either setting in the repository's config, git's refusal must still see the file and keep it.
 */
const hiddenUntrackedRemovalCases = () => {
  const personalIgnore = join(root, "stale-core", "personal.gitignore")
  mkdirSync(dirname(personalIgnore), { recursive: true })
  writeFileSync(personalIgnore, "notes/\n")
  for (const [setting, value, file] of [["status.showUntrackedFiles", "no", "draft.txt"], ["core.excludesFile", personalIgnore, join("notes", "plan.md")]]) {
    const fixture = stageFinishedWorktree(`late-file-${setting}`, [["config", setting, value]])
    if (fixture === null) continue
    const late = join(fixture.finished, file)
    // The file appears after every check of the tool, just before git's own refusal runs.
    const probes = { ...realGitProbes, git: (cwd, args, timeoutMs) => {
      if (args.includes("remove")) {
        mkdirSync(dirname(late), { recursive: true })
        writeFileSync(late, "written after the check\n")
      }
      return systemProbes.git(cwd, args, timeoutMs)
    } }
    const outcome = removeListed(fixture.listing, { ui: fixture.repository }, { probes })
    same(`stale-files: the fixture's git status hides the file that ${setting} hides`, fixture.git(["-C", fixture.finished, "status", "--porcelain"]).stdout, "")
    same(`stale-files: git refuses the removal of a worktree whose late untracked file ${setting} hides`, outcome.failed.map((item) => item.path), [fixture.finished])
    T(`stale-files: the late untracked file that ${setting} hides survives the removal`, existsSync(late))
    T(`stale-files: the worktree whose removal git refused stays registered (${setting})`, fixture.git(["worktree", "list", "--porcelain"]).stdout.includes(fixture.finished))
  }
}

/**
 * `git status` and git's own refusal never compare a tracked file that is assume-unchanged (which `core.ignoreStat`
 * sets at checkout) or skip-worktree, and they never show a file that only `info/exclude` ignores. The removal must
 * keep each such change, even when the listing it gets calls the worktree stale.
 */
const hiddenChangeRemovalCases = () => {
  for (const [label, configure, prepare] of [
    ["core.ignoreStat", [["config", "core.ignoreStat", "true"]], () => true],
    ["assume-unchanged", [], (fixture) => fixture.git(["-C", fixture.finished, "update-index", "--assume-unchanged", "tracked.txt"]).status === 0],
    ["skip-worktree", [], (fixture) => fixture.git(["-C", fixture.finished, "update-index", "--skip-worktree", "tracked.txt"]).status === 0],
  ]) {
    const fixture = stageFinishedWorktree(`hidden-edit-${label}`, configure)
    if (fixture === null) continue
    T(`stale-files: the ${label} flag stages`, prepare(fixture))
    appendFileSync(join(fixture.finished, "tracked.txt"), "edited, never committed\n")
    same(`stale-files: the fixture's git status hides the edit under ${label}`, fixture.git(["-C", fixture.finished, "status", "--porcelain"]).stdout, "")
    const outcome = removeListed(fixture.listing, { ui: fixture.repository }, { probes: realGitProbes })
    same(`stale-files: the removal keeps a worktree whose edit ${label} hides`, outcome.skipped.map((item) => `${item.path}: ${item.reason}`),
      [`${fixture.finished}: the check before the removal keeps it: git status cannot show a change to tracked.txt, an assume-unchanged or skip-worktree file`])
    same(`stale-files: the edit that ${label} hides survives the removal`, existsSync(fixture.finished) ? readFileSync(join(fixture.finished, "tracked.txt"), "utf8") : null,
      "committed\nedited, never committed\n")
  }
  const excluded = stageFinishedWorktree("hidden-info-exclude")
  if (excluded === null) return
  appendFileSync(join(excluded.repository, ".git", "info", "exclude"), "drafts/\n")
  mkdirSync(join(excluded.finished, "drafts"))
  writeFileSync(join(excluded.finished, "drafts", "todo.md"), "never added\n")
  same("stale-files: the fixture's git status hides the file that only info/exclude ignores", excluded.git(["-C", excluded.finished, "status", "--porcelain", "--untracked-files=all"]).stdout, "")
  const outcome = removeListed(excluded.listing, { ui: excluded.repository }, { probes: realGitProbes })
  same("stale-files: the removal keeps a worktree with a file that only info/exclude ignores", outcome.skipped.map((item) => item.reason),
    ["the check before the removal keeps it: it holds an untracked file that no .gitignore ignores: drafts/todo.md"])
  T("stale-files: the file that only info/exclude ignores survives the removal", existsSync(join(excluded.finished, "drafts", "todo.md")))
}

/**
 * A `core.fsmonitor` hook that answers "nothing changed" makes `git status` skip an edited file, in the listing's check
 * and in git's own refusal. The check before the removal must see an edit made before it, and git's refusal one made after it.
 */
const fsmonitorRemovalCases = () => {
  const hook = join(root, "stale-core", "fsmonitor-hook.sh")
  mkdirSync(dirname(hook), { recursive: true })
  writeFileSync(hook, "#!/bin/sh\nprintf 'token\\0'\n", { mode: 0o755 })
  for (const when of ["before the check", "after the check"]) {
    const fixture = stageFinishedWorktree(`fsmonitor-${when.replaceAll(" ", "-")}`, [["config", "core.fsmonitor", hook]])
    if (fixture === null) continue
    const tracked = join(fixture.finished, "tracked.txt")
    // Two runs of `git status` store the fsmonitor state in the index; from then on git trusts the hook.
    const prime = () => [0, 1].every(() => fixture.git(["-C", fixture.finished, "status", "--porcelain"]).status === 0)
    const edit = () => appendFileSync(tracked, "edited, never committed\n")
    T(`stale-files: the fsmonitor state is stored (${when})`, prime())
    if (when === "before the check") edit()
    const probes = { ...realGitProbes, git: (cwd, args, timeoutMs) => {
      if (when === "after the check" && args.includes("remove")) {
        prime()
        edit()
      }
      return systemProbes.git(cwd, args, timeoutMs)
    } }
    if (when === "before the check") same("stale-files: the fixture's git status hides the edit under the fsmonitor hook", fixture.git(["-C", fixture.finished, "status", "--porcelain"]).stdout, "")
    const outcome = removeListed(fixture.listing, { ui: fixture.repository }, { probes })
    same(`stale-files: the removal keeps a worktree whose edit the fsmonitor hook hides, made ${when}`, [...outcome.skipped, ...outcome.failed].map((item) => item.reason),
      [when === "before the check" ? "the check before the removal keeps it: it holds an uncommitted change" : `git worktree remove refused ${fixture.finished}`])
    same(`stale-files: the edit that the fsmonitor hook hides survives the removal (${when})`, existsSync(tracked) ? readFileSync(tracked, "utf8") : null, "committed\nedited, never committed\n")
  }
}

/**
 * A git read that fails or runs out of time gives `null`. The item stays, and its reason names the read that failed:
 * never a change, a commit or a removal that no evidence shows.
 */
const unreadableGitCases = () => {
  const machine = stageMachine("unreadable-git")
  const finished = join(machine.base, "finished")
  const repository = join(finished, "node_modules", "vendored")
  const detached = join(machine.sessionRoot, STALE, "scratchpad", "wt")
  for (const path of [repository, detached]) mkdirSync(path, { recursive: true })
  const records = `worktree ${machine.checkout}\nHEAD 1\nbranch refs/heads/main\n\nworktree ${finished}\nHEAD 2\nbranch refs/heads/done\n\nworktree ${detached}\nHEAD 3\ndetached\n`
  const answers = { worktree: () => records, "rev-list": () => "0", "rev-parse": (cwd, args) => (args[1] === "--show-toplevel" ? cwd : "2"), "symbolic-ref": () => "origin/main",
    // The branch `done` was made two minimum ages ago, so no age rule holds it.
    log: () => `done@{${Math.floor((Date.now() - 2 * MINIMUM_BRANCH_AGE_MS) / 1000)}}` }
  const kindOf = (args) => (args.includes("status") ? "status" : args[0])
  const merged = [{ number: 1, state: "MERGED", headRefOid: "2" }]
  /**
   * Every git read answers as a finished, pushed tree does, but the reads that `fails` names and the answers that `over` replaces.
   * `containers` gives the pull requests of each other branch; the state of a branch that it does not name cannot be read.
   */
  const listWith = ({ fails = () => false, pullRequests = merged, containers = {}, walked = [], over = {} } = {}) => collectListing({ ...machine.context, repositories: { ui: machine.checkout } },
    { probes: { ...quietProbes, pullRequests: (path, branch) => (branch === "done" ? pullRequests : containers[branch] ?? null), repositories: () => walked,
      git: (cwd, args) => (fails(kindOf(args), cwd) ? null : ({ ...answers, ...over }[kindOf(args)] ?? (() => ""))(cwd, args)) } })
  const staleSession = join(machine.sessionRoot, STALE)
  const readable = listWith({ walked: [repository] })
  same("stale-files: with every git read answered, the finished worktree and the session directory around a detached one are stale",
    readable.stale.filter((item) => [finished, staleSession].includes(item.path)).map((item) => `${item.path}: ${item.reason}`).sort(),
    [`${finished}: pull request #1 merged`, `${staleSession}: not this session, its predecessor, or a session with a live process`].sort())
  const unreadable = [["status", "git status could not be read"], ["rev-list", "git rev-list could not be read"]]
  for (const [kind, reason] of [...unreadable, ["ls-files", "git could not list its files"], ["rev-parse", "git rev-parse could not be read"]]) {
    same(`stale-files: a finished worktree whose git ${kind} fails stays with the unreadable reason`, reasonOf(listWith({ fails: (failed, cwd) => failed === kind && cwd === finished }), finished), reason)
  }
  for (const [kind, reason] of unreadable) {
    same(`stale-files: a session directory around a detached worktree whose git ${kind} fails stays with the unreadable reason`,
      reasonOf(listWith({ fails: (failed, cwd) => failed === kind && cwd === detached }), staleSession), `worktree ${detached} in it stays: ${reason}`)
    same(`stale-files: a finished worktree around a repository whose git ${kind} fails stays with the unreadable reason`,
      reasonOf(listWith({ fails: (failed, cwd) => failed === kind && cwd === repository, walked: [repository] }), finished), `repository ${repository} in it stays: ${reason}`)
  }
  // A branch with no pull request is finished only when a merged branch contains it, and each read of that proof can fail too.
  same("stale-files: with every git read answered, a branch with no pull request that the base branch contains is stale",
    listWith({ pullRequests: [] }).stale.find((item) => item.path === finished)?.reason, "its branch is contained in origin/main")
  // `rev-list --count` prints the number of commits outside the container.
  const outside = { "rev-list": () => "1" }
  same("stale-files: a branch with no pull request that no merged branch contains is work nobody merged", reasonOf(listWith({ pullRequests: [], over: outside }), finished),
    "it holds work nobody merged: no pull request, and no merged branch contains its branch")
  same("stale-files: a branch with no pull request whose containment read fails stays with the unreadable reason, not as work nobody merged",
    reasonOf(listWith({ pullRequests: [], fails: (failed) => failed === "rev-list" }), finished), "git rev-list could not be read")
  same("stale-files: a branch with no pull request whose git for-each-ref fails stays with the unreadable reason, not as work nobody merged",
    reasonOf(listWith({ pullRequests: [], over: outside, fails: (failed) => failed === "for-each-ref" }), finished), "git for-each-ref could not be read")
  // A second branch that holds the tip is a container only when its merged pull request head holds the tip too.
  const besideOther = { ...outside, "for-each-ref": () => "other" }
  const otherMerged = { other: [{ number: 2, state: "MERGED", headRefOid: "9" }] }
  same("stale-files: a branch with no pull request whose container branch has an unreadable pull request state stays with the unreadable reason, not as work nobody merged",
    reasonOf(listWith({ pullRequests: [], over: besideOther }), finished), "the pull request state of other could not be read")
  same("stale-files: a branch with no pull request whose container pull request head cannot be read stays with the unreadable reason, not as work nobody merged",
    reasonOf(listWith({ pullRequests: [], containers: otherMerged, over: besideOther, fails: (failed) => ["cat-file", "fetch"].includes(failed) }), finished), "the head of pull request #2 could not be read")
  same("stale-files: with the container pull request head read, a branch with no pull request that the head contains is stale",
    listWith({ pullRequests: [], containers: otherMerged, over: { ...besideOther, "rev-list": (cwd, args) => (args.at(-1) === "9" ? "0" : "1") } }).stale.find((item) => item.path === finished)?.reason,
    "its branch is contained in other, which pull request #2 merged")
  // The pull request head is the proof that GitHub holds the commits: a head that cannot be read is no proof of a lost commit.
  same("stale-files: a worktree whose pull request head cannot be read stays with the unreadable reason",
    reasonOf(listWith({ over: { "rev-list": () => "1" }, fails: (failed) => ["cat-file", "fetch"].includes(failed) }), finished), "the head of pull request #1 could not be read")
  same("stale-files: a worktree with a commit outside its readable pull request head is an unpushed commit",
    reasonOf(listWith({ over: { "rev-list": () => "1" } }), finished), "it holds a commit that no remote and no pull request has")

  // At the removal: a failed read keeps the item, and the line that the owner reads names the read.
  const stored = { ...readable, stale: readable.stale.filter((item) => item.path === finished) }
  const removals = []
  const readAtRemoval = (cwd, args) => (args[0] === "worktree" ? records : onFinishedTip(args))
  for (const [read, fails, reason] of [
    ["git status", (args) => args.includes("status"), "git status could not be read"],
    ["worktree list", (args) => args[0] === "worktree", `the worktrees of ${machine.checkout} could not be listed`],
    ["symbolic HEAD", (args) => args.includes("--symbolic-full-name"), "git rev-parse could not be read"],
    ["tip", (args) => args.join(" ") === "rev-parse HEAD", "git rev-parse could not be read"],
  ]) {
    const refused = removeListed(stored, { ui: machine.checkout }, { probes: { ...quietProbes, git: (cwd, args) => {
      if (args.includes("remove")) removals.push(args.at(-1))
      return fails(args) ? null : readAtRemoval(cwd, args)
    } } })
    same(`stale-files: the removal of a worktree whose ${read} read fails keeps it with the unreadable reason`, refused.skipped.map((item) => item.reason), [`the check before the removal keeps it: ${reason}`])
  }
  same("stale-files: git is never asked to remove a worktree whose evidence could not be read", removals, [])
  const readableRemoval = removeListed(stored, { ui: machine.checkout }, { probes: { ...quietProbes, git: (cwd, args) => {
    if (args.includes("remove")) removals.push(args.at(-1))
    return readAtRemoval(cwd, args)
  } } })
  same("stale-files: with every read at the removal answered, the finished worktree is removed", readableRemoval.removed.map((item) => item.path), [finished])
}

/** The walk of a finished worktree's tree runs only inside the listing's time limit; past it, the worktree stays. */
const deadlineCases = () => {
  const machine = stageMachine("deadline")
  const finished = join(machine.base, "finished")
  mkdirSync(finished)
  const walked = []
  const realNow = Date.now
  try {
    const listing = collectListing({ ...machine.context, repositories: { ui: machine.checkout } }, { probes: { ...quietProbes,
      git: (cwd, args) => (args[0] === "worktree" ? `worktree ${machine.checkout}\nHEAD 1\nbranch refs/heads/main\n\nworktree ${finished}\nHEAD 2\nbranch refs/heads/done\n` : args[0] === "rev-list" ? "0" : ""),
      // The GitHub read of the worktree's branch is the step that runs past the time limit.
      pullRequests: () => {
        Date.now = () => realNow() + 24 * 3_600_000
        return [{ number: 1, state: "MERGED", headRefOid: "2" }]
      },
      repositories: (path) => {
        walked.push(path)
        return []
      } } })
    same("stale-files: a finished worktree whose check ends past the time limit stays with the reason", reasonOf(listing, finished), "the listing reached its time limit before this check")
    same("stale-files: the tree of a worktree past the time limit is never walked", walked.filter((path) => path === finished), [])
    // A session directory holds the throwaway probe repositories of its scratchpad; only a finished worktree is walked.
    same("stale-files: the tree of a session directory is never walked for repositories", walked, [])
  } finally {
    Date.now = realNow
  }
}

/** The review's repository-wide grep: every export of the library has an importer, so no export stays just in case. */
const exportCases = () => {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const listed = spawnSync("git", ["-C", repositoryRoot, "ls-files", "--cached", "--others", "--exclude-standard", "--", "tools", ".claude"], { encoding: "utf8" })
  T("stale-files: git lists the files that can import the library", listed.status === 0, listed.stderr)
  const importers = listed.stdout.split("\n").filter((file) => file.endsWith(".mjs") && file !== "tools/lib/stale-files.mjs")
    .map((file) => readFileSync(join(repositoryRoot, file), "utf8")).filter((text) => text.includes("lib/stale-files.mjs\""))
  const unimported = Object.keys(staleFiles).filter((name) => !importers.some((text) => new RegExp(`\\b${name}\\b`).test(text)))
  same("stale-files: every export of the library has an importer", unimported, [])
}

const reportCases = () => {
  const machine = stageMachine("report")
  const present = join(machine.sessionRoot, STALE)
  const stale = [{ kind: "session", path: present, bytes: 3 * 1024 ** 3, reason: "r" }, { kind: "worktree", path: machine.checkout, bytes: 512 * 1024 ** 2, reason: "r" }]
  same("stale-files: bytes print in the largest unit", [describeBytes(0), describeBytes(1536), describeBytes(5 * 1024 ** 3)], ["0 B", "1.5 KB", "5.0 GB"])
  same("stale-files: the summary gives the count, the size and each class", summarize(stale), "2 items, 3.5 GB (1 session directory, 1 worktree)")
  same("stale-files: the summary counts an item with no size", summarize([{ ...stale[0], bytes: null }]), "1 item, 0 B and 1 not measured (1 session directory)")
}

/** The decision of the unattended cleanup: once for each relay adoption, and whenever free disk is under the floor. */
const cleanupDueCases = () => {
  const now = Date.now()
  const adopted = { sessionId: THIS, relay: { from: RUN_PREDECESSOR, pending: false } }
  const plenty = FREE_DISK_FLOOR_BYTES * 2
  const low = FREE_DISK_FLOOR_BYTES - 1
  const due = (overrides) => cleanupDueReason({ sessionId: THIS, state: null, marker: null, running: false, freeDiskBytes: plenty, now, ...overrides })
  same("stale-files: a relay adoption starts a cleanup", due({ state: adopted }), "relay adoption")
  same("stale-files: a relay adoption starts no second cleanup for the same session", due({ state: adopted, adoption: { sessionId: THIS, startedAt: now }, marker: { startedAt: now } }), null)
  same("stale-files: the next adoption starts its own cleanup", due({ state: adopted, adoption: { sessionId: RUN_PREDECESSOR, startedAt: now }, marker: { startedAt: now } }), "relay adoption")
  same("stale-files: a later start for an adoption in another checkout starts no second cleanup for this adoption",
    due({ state: adopted, adoption: { sessionId: THIS, startedAt: now - 1000 }, marker: { startedAt: now, reason: "relay adoption" } }), null)
  same("stale-files: a run that another session adopted starts no cleanup here", due({ state: { ...adopted, sessionId: OTHER } }), null)
  same("stale-files: a pending relay is no adoption", due({ state: { sessionId: THIS, relay: { pending: true, successorSessionId: SUCCESSOR } } }), null)
  same("stale-files: free disk above the floor and no adoption start nothing", due({}), null)
  T("stale-files: free disk under the floor starts a cleanup with no owner answer", /^free disk .* is under the floor of 50\.0 GB$/.test(due({ freeDiskBytes: low }) ?? ""), due({ freeDiskBytes: low }))
  same("stale-files: low free disk starts no second cleanup inside the interval", due({ freeDiskBytes: low, marker: { pid: 0, startedAt: now - CLEANUP_INTERVAL_MS + 1000 } }), null)
  T("stale-files: low free disk starts a cleanup again after the interval", due({ freeDiskBytes: low, marker: { pid: 0, startedAt: now - CLEANUP_INTERVAL_MS - 1 } }) !== null)
  same("stale-files: a removal that still runs is never started twice", due({ state: adopted, freeDiskBytes: low, running: true, marker: { startedAt: now - CLEANUP_INTERVAL_MS - 1 } }), null)
  same("stale-files: a removal that holds the lock for 45 minutes still starts nothing under the floor", due({ freeDiskBytes: low, running: true, marker: { startedAt: now - 45 * 60_000 } }), null)
  same("stale-files: an unreadable free disk starts nothing by itself", due({ freeDiskBytes: null }), null)
}

/**
 * A worktree that a queued or running launch names stays: a ticket of the run queue, a worker launch reservation, a live wake
 * source. A branch with no pull request that was made after the run's last relay stays too; an older one goes.
 */
const launchCases = () => {
  const machine = stageMachine("launches")
  const relayAt = Date.parse("2026-11-16T14:05:00.000Z")
  const WAKE = "9a9a9a9a-0000-4000-8000-00000000009a"
  mkdirSync(join(machine.sessionRoot, WAKE, "scratchpad"), { recursive: true })
  writeFileSync(join(machine.checkout, ".git", "orbit-orchestrate-run.json"), JSON.stringify({ sessionId: THIS, remaining: ["#4242", "ORB-77"],
    relay: { from: RUN_PREDECESSOR, pending: true, successorSessionId: SUCCESSOR } }))
  writeFileSync(join(machine.checkout, ".git", "orbit-session-chain.json"), JSON.stringify({ chains: [{ id: "chain", currentSessionId: THIS, entries: [
    { sessionId: STALE, successorSessionId: CHAIN_PREDECESSOR, superseded: true, triggeredAt: new Date(relayAt - 3_600_000).toISOString() },
    { sessionId: CHAIN_PREDECESSOR, successorSessionId: THIS, superseded: true, triggeredAt: new Date(relayAt).toISOString() }] }] }))
  const tree = (name) => join(machine.base, name)
  const branches = { "ticket-4242-queued": "fix/ticket-4242-queued", "orb-77-queued": "fix/orb-77-queued", "ticket-42420-not-queued": "fix/ticket-42420-not-queued",
    reserved: "fix/reserved", released: "fix/released", "wake-log": "fix/wake-log", young: "fix/young", old: "fix/old", "no-reflog": "fix/no-reflog", merged: "fix/merged" }
  for (const name of Object.keys(branches)) mkdirSync(tree(name), { recursive: true })
  for (const [name, launcherPid] of [["reserved", process.pid], ["released", 0]]) {
    mkdirSync(join(tree(name), ".git", "orbit-worker-launches"), { recursive: true })
    writeFileSync(join(tree(name), ".git", "orbit-worker-launches", "occupied-worktree.json"), JSON.stringify({ launcherPid, workerPid: null, gateProtocol: 1 }))
  }
  mkdirSync(join(machine.checkout, ".git", "orbit-wake-sources"), { recursive: true })
  const identity = processStartIdentity(process.pid)
  writeFileSync(join(machine.checkout, ".git", "orbit-wake-sources", `${process.pid}.json`), JSON.stringify({ pid: process.pid, processStartIdentity: identity,
    what: "file waiter", sessionId: WAKE, logFile: join(tree("wake-log"), "worker.log") }))
  const records = [`worktree ${machine.checkout}\nHEAD 1\nbranch refs/heads/main\n`,
    ...Object.entries(branches).map(([name, branch]) => `worktree ${tree(name)}\nHEAD 2\nbranch refs/heads/${branch}\n`)].join("\n")
  // `git log --walk-reflogs --date=unix --format=%gd` prints `<branch>@{<unix seconds of the entry>}`, the newest entry first.
  const entry = (name, time) => `${branches[name]}@{${Math.floor(time / 1000)}}`
  const reflogs = { [tree("young")]: `${entry("young", relayAt + 60_000)}\n${entry("young", relayAt + 30_000)}`,
    [tree("old")]: `${entry("old", relayAt - 1000)}\n${entry("old", relayAt - 7_200_000)}`, [tree("no-reflog")]: "" }
  const listing = collectListing({ ...machine.context, repositories: { ui: machine.checkout } }, { probes: { ...quietProbes, repositories: () => [],
    pullRequests: (path, branch) => (branch === "fix/merged" ? [{ number: 9, state: "MERGED", headRefOid: "2" }] : []),
    git: (cwd, args) => ({ worktree: () => records, "rev-list": () => "0", "rev-parse": () => "2", "symbolic-ref": () => "origin/main", "cat-file": () => "",
      log: () => reflogs[cwd] ?? `main@{${Math.floor((relayAt - 7_200_000) / 1000)}}` }[args[0]] ?? (() => ""))() } })
  T("stale-files: the wake source fixture is a live wake source", identity !== null)
  for (const [name, reason] of [["ticket-4242-queued", /^ticket #4242 of the run queue names it$/], ["orb-77-queued", /^ticket ORB-77 of the run queue names it$/],
    ["reserved", new RegExp(`^a worker launch reserves it: process ${process.pid} runs$`)], ["wake-log", /^the wake source file waiter uses it$/],
    ["young", /^its branch has no pull request and was made after the last relay at 2026-11-16T14:05:00\.000Z$/], ["no-reflog", /^the age of its branch could not be read/]]) {
    T(`stale-files: the ${name} worktree is kept`, reason.test(reasonOf(listing, tree(name)) ?? ""), `reason: ${reasonOf(listing, tree(name))}`)
  }
  T("stale-files: a session directory that a live wake source names is kept", /^the wake source file waiter uses it$/.test(reasonOf(listing, join(machine.sessionRoot, WAKE)) ?? ""),
    `reason: ${reasonOf(listing, join(machine.sessionRoot, WAKE))}`)
  same("stale-files: a finished worktree that no launch names is stale: a released reservation, an old branch, a ticket the queue does not hold, a merged pull request",
    stalePaths(listing, "worktree").sort(), ["ticket-42420-not-queued", "released", "old", "merged"].map(tree).sort())
}

/**
 * A worktree made from the base branch has no commit and no pull request until its first edit, and a person or a launch can open one
 * whether or not a relay is on record. Its branch stays for the minimum age; an older one with the same state goes.
 */
const freshBranchCases = () => {
  const machine = stageMachine("fresh-branches")
  const tree = (name) => join(machine.base, name)
  const branches = { fresh: "feature/fresh", aged: "feature/aged", "no-reflog": "feature/no-reflog" }
  for (const name of Object.keys(branches)) mkdirSync(tree(name), { recursive: true })
  const records = [`worktree ${machine.checkout}\nHEAD 1\nbranch refs/heads/main\n`,
    ...Object.entries(branches).map(([name, branch]) => `worktree ${tree(name)}\nHEAD 2\nbranch refs/heads/${branch}\n`)].join("\n")
  const now = Date.now()
  const entry = (name, age) => `${branches[name]}@{${Math.floor((now - age) / 1000)}}`
  const reflogs = { [tree("fresh")]: entry("fresh", 60_000), [tree("aged")]: entry("aged", MINIMUM_BRANCH_AGE_MS + 60_000), [tree("no-reflog")]: "" }
  const listing = collectListing({ ...machine.context, repositories: { ui: machine.checkout } }, { now, probes: { ...quietProbes, repositories: () => [],
    git: (cwd, args) => ({ worktree: () => records, "rev-list": () => "0", "rev-parse": () => "2", "symbolic-ref": () => "origin/main", "cat-file": () => "",
      log: () => reflogs[cwd] ?? "" }[args[0]] ?? (() => ""))() } })
  same("stale-files: with no relay on record, a new branch with no pull request and no commit stays for the minimum age", reasonOf(listing, tree("fresh")),
    `its branch has no pull request and was made less than ${MINIMUM_BRANCH_AGE_MS / 3_600_000} hours ago`)
  T("stale-files: with no relay on record, a branch whose age cannot be read stays", /^the age of its branch could not be read/.test(reasonOf(listing, tree("no-reflog")) ?? ""),
    `reason: ${reasonOf(listing, tree("no-reflog"))}`)
  same("stale-files: with no relay on record, a branch older than the minimum age with no pull request and no commit is stale", stalePaths(listing, "worktree"), [tree("aged")])
}

/**
 * An item can turn live between the listing and its removal: a session resumes, a process starts in it or names it, the run
 * nominates it, a wake source names it, a scratchpad links into it, a ticket of the queue or a worker launch claims a worktree. The removal reads that
 * evidence again just before each item and keeps the item, and the item around it.
 */
const lateLivenessCases = async () => {
  const machine = stageMachine("late-liveness")
  const directory = (session) => join(machine.sessionRoot, session)
  const tree = (name) => join(machine.base, name)
  const copy = (name) => join(machine.carryRoot, name)
  const inner = join(tree("outer"), ".claude", "worktrees", "inner")
  for (const path of [tree("ticket-5151-late"), tree("reserved-late"), inner, tree("untouched")]) mkdirSync(path, { recursive: true })
  for (const [name, hours] of [["durable-0a0a0a0a", 40], [`durable-${LIVE_CARRY.slice(0, 8)}`, 30], ["durable-0b0b0b0b", 20], ["durable-0c0c0c0c", 10]]) {
    mkdirSync(copy(name))
    utimesSync(copy(name), new Date(Date.now() - hours * 3_600_000), new Date(Date.now() - hours * 3_600_000))
  }
  let late = false
  const removals = []
  const probes = { ...quietProbes,
    liveSessions: () => (late ? [THIS, OTHER, LIVE_RECORD, LIVE_CARRY] : [THIS, OTHER]).map((sessionId) => ({ sessionId, cwd: null })),
    processes: () => (late ? [{ command: "node build.mjs", directory: directory(LIVE_DIRECTORY) }, { command: `node wait.mjs --file ${directory(LIVE_COMMAND)}/done.json`, directory: null }] : []),
    git: (cwd, args) => {
      if (args.includes("remove")) removals.push(args.at(-1))
      return onFinishedTip(args)
    } }
  const listed = collectListing(machine.context, { probes, measure: false })
  const worktrees = ["ticket-5151-late", "reserved-late", "outer", "untouched"].map(tree).concat(inner).map((path) => finishedItem(path, machine.checkout))
  const listing = { ...listed, stale: [...listed.stale, ...worktrees] }
  const turnsLive = [LIVE_RECORD, LIVE_DIRECTORY, LIVE_COMMAND, CHAINED, HOLDS_WORK, LINKED].map(directory)
  same("stale-files: every session directory that turns live after the listing is stale in the listing", turnsLive.filter((path) => !stalePaths(listing, "session").includes(path)), [])
  same("stale-files: the durable copy of a session that resumes after the listing is stale in the listing", stalePaths(listing, "carry").sort(),
    [copy("durable-0a0a0a0a"), copy(`durable-${LIVE_CARRY.slice(0, 8)}`)].sort())

  // Between the listing and the removal: a session resumes, a process starts, the run nominates a successor and queues a
  // ticket, a wake source starts, and a worker launch reserves two worktrees, one of them inside another listed worktree.
  late = true
  writeFileSync(join(machine.checkout, ".git", "orbit-orchestrate-run.json"), JSON.stringify({ sessionId: THIS, remaining: ["#5151"],
    relay: { from: RUN_PREDECESSOR, pending: true, successorSessionId: CHAINED } }))
  mkdirSync(join(machine.checkout, ".git", "orbit-wake-sources"), { recursive: true })
  writeFileSync(join(machine.checkout, ".git", "orbit-wake-sources", `${process.pid}.json`), JSON.stringify({ pid: process.pid, processStartIdentity: processStartIdentity(process.pid),
    what: "file waiter", sessionId: HOLDS_WORK }))
  symlinkSync(join(directory(LINKED), "scratchpad"), join(directory(THIS), "scratchpad", "late-link"), "dir")
  for (const path of [tree("reserved-late"), inner]) {
    mkdirSync(join(path, ".git", "orbit-worker-launches"), { recursive: true })
    writeFileSync(join(path, ".git", "orbit-worker-launches", "occupied-worktree.json"), JSON.stringify({ launcherPid: process.pid, workerPid: null, gateProtocol: 1 }))
  }
  const outcome = removeListed(listing, {}, { probes })
  const skipped = new Map(outcome.skipped.map((item) => [item.path, item.reason]))
  for (const [name, path, reason] of [
    ["a session that resumes", directory(LIVE_RECORD), /^it is in use now: live session 44444444 uses it$/],
    ["a session a process starts to work in", directory(LIVE_DIRECTORY), /^it is in use now: a live process works in it$/],
    ["a session a new process names", directory(LIVE_COMMAND), /^it is in use now: a live process names it$/],
    ["a session the run nominates as its successor", directory(CHAINED), /^it is in use now: the nominated successor of this session$/],
    ["a session a new wake source names", directory(HOLDS_WORK), /^it is in use now: the wake source file waiter uses it$/],
    ["a session that the scratchpad of this session links into", directory(LINKED), /^it is in use now: the scratchpad of session 00000000 links into it$/],
    ["the durable copy of a session that resumes", copy(`durable-${LIVE_CARRY.slice(0, 8)}`), /^it is in use now: the durable copy of live session 0f0f0f0f$/],
    ["a worktree that a queued ticket names", tree("ticket-5151-late"), /^it is in use now: ticket #5151 of the run queue names it$/],
    ["a worktree that a worker launch reserves", tree("reserved-late"), new RegExp(`^it is in use now: a worker launch reserves it: process ${process.pid} runs$`)],
    ["a worktree around a worktree that a worker launch reserves", tree("outer"), new RegExp(`^${inner} in it stays$`)],
  ]) T(`stale-files: the removal keeps ${name} after the listing, with the reason`, existsSync(path) && reason.test(skipped.get(path) ?? ""), `reason: ${skipped.get(path)}`)
  same("stale-files: the removal still removes each item that stays unused", outcome.removed.map((item) => item.path).sort(),
    [directory(STALE), copy("durable-0a0a0a0a"), tree("untouched")].sort())
  same("stale-files: git is asked to remove only the worktree that nothing claimed after the listing", removals, [tree("untouched")])

  // A real process: the removal reads the process table of the machine again, and a process that started after the
  // listing with its working directory in a stale session directory keeps that directory.
  const real = stageMachine("late-real-process")
  const target = join(real.sessionRoot, STALE)
  writeFileSync(join(target, "scratchpad", "notes.md"), "notes of an old session\n")
  const realProbes = { ...quietProbes, processes: systemProbes.processes }
  const realListing = collectListing(real.context, { probes: realProbes, measure: false })
  T("stale-files: the real-process fixture lists the session directory as stale", stalePaths(realListing, "session").includes(target))
  const sleeper = spawn("/bin/sleep", ["30"], { cwd: target, stdio: "ignore" })
  try {
    await new Promise((resolve, reject) => {
      sleeper.once("spawn", resolve)
      sleeper.once("error", reject)
    })
    const realOutcome = removeListed({ ...realListing, stale: realListing.stale.filter((item) => item.path === target) }, {}, { probes: realProbes })
    T("stale-files: a session directory that a real process starts to work in after the listing survives the removal",
      existsSync(join(target, "scratchpad", "notes.md")) && realOutcome.removed.length === 0, JSON.stringify(realOutcome))
    same("stale-files: the removal names the live process as the reason it kept the directory", realOutcome.skipped.map((item) => item.reason), ["it is in use now: a live process works in it"])
  } finally {
    sleeper.kill()
  }
}

/**
 * The tree of an item can change after the listing with no process left in it: a session runs `git -C <tree> ...` from
 * elsewhere and ends, or the owner works in the Orca login shell. Real git, pull requests merged at the listed tips. The
 * removal applies the listing's tree rules again just before each item, for every kind, and keeps the work.
 */
const lateTreeCases = () => {
  const machine = stageMachine("late-tree")
  const repository = join(machine.base, "repository")
  const tree = (name) => join(machine.base, "trees", name)
  const commit = (cwd, message) => spawnSync("git", ["-C", cwd, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "--allow-empty", "-m", message]).status === 0
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  mkdirSync(repository)
  // Claude Code keeps its own worktrees under `.claude/worktrees/`, which the repository ignores: a tree there is no change of its container.
  writeFileSync(join(repository, ".gitignore"), "ignored/\n")
  const names = ["detached", "nested-worktree", "nested-repository", "moved-tip", "other-branch", "unchanged"]
  let staged = git(repository, ["init", "-q", "--initial-branch=main"]).status === 0 && git(repository, ["add", ".gitignore"]).status === 0 && commit(repository, "base")
  for (const name of names) staged &&= git(repository, ["worktree", "add", "-q", "-b", `feature/${name}`, tree(name)]).status === 0 && commit(tree(name), name)
  for (const [name, hours] of [["durable-0a0a0a0a", 30], ["durable-0b0b0b0b", 20], ["durable-0c0c0c0c", 10]]) {
    mkdirSync(join(machine.carryRoot, name))
    utimesSync(join(machine.carryRoot, name), new Date(Date.now() - hours * 3_600_000), new Date(Date.now() - hours * 3_600_000))
  }
  T("stale-files: the late tree fixture stages", staged)
  if (!staged) return
  const tipOf = (branch) => git(repository, ["rev-parse", `refs/heads/${branch}`]).stdout.trim()
  const probes = { ...realGitProbes, repositories: systemProbes.repositories,
    pullRequests: (path, branch) => (branch.startsWith("feature/") ? [{ number: 1, state: "MERGED", headRefOid: tipOf(branch) }] : []) }
  const listing = collectListing({ ...machine.context, repositories: { ui: repository } }, { probes, measure: false })
  const session = join(machine.sessionRoot, STALE)
  const carry = join(machine.carryRoot, "durable-0a0a0a0a")
  same("stale-files: the late tree fixture lists every finished worktree as stale", stalePaths(listing, "worktree").sort(), names.map(tree).sort())
  T("stale-files: the late tree fixture lists the session directory and the old durable copy as stale",
    stalePaths(listing, "session").includes(session) && stalePaths(listing, "carry").includes(carry), JSON.stringify(listing.stale.map((item) => item.path)))

  // After the listing, and with no process left in any item: a commit on a detached HEAD, a commit on the listed branch,
  // a checkout of another branch, a registered worktree with an uncommitted file in an ignored path, and a repository
  // with a local commit in an ignored path. A worktree with an uncommitted file appears in the session directory and in the durable copy.
  staged = git(tree("detached"), ["checkout", "-q", "--detach"]).status === 0 && commit(tree("detached"), "detached work")
  const detachedCommit = git(tree("detached"), ["rev-parse", "HEAD"]).stdout.trim()
  staged &&= commit(tree("moved-tip"), "late work") && git(tree("other-branch"), ["checkout", "-q", "-b", "feature/elsewhere"]).status === 0
  const inner = join(tree("nested-worktree"), "ignored", "inner")
  const scratch = join(tree("nested-repository"), "ignored", "scratch")
  const sessionInner = join(session, "scratchpad", "inner")
  const carryInner = join(carry, "inner")
  for (const [path, branch] of [[inner, "inner"], [sessionInner, "session-inner"], [carryInner, "carry-inner"]]) {
    staged &&= git(repository, ["worktree", "add", "-q", "-b", branch, path]).status === 0
    writeFileSync(join(path, "draft.txt"), "never added\n")
  }
  mkdirSync(scratch, { recursive: true })
  staged &&= git(scratch, ["init", "-q"]).status === 0 && commit(scratch, "scratch work")
  T("stale-files: the changes after the listing stage", staged)
  const outcome = removeListed(listing, { ui: repository }, { probes })
  const skipped = new Map(outcome.skipped.map((item) => [item.path, item.reason]))
  const keeps = "the check before the removal keeps it: "
  for (const [name, path, reason] of [
    ["a worktree whose HEAD was detached and moved on", tree("detached"), `${keeps}its HEAD is detached, so no branch proves its work merged`],
    ["a worktree whose branch tip moved", tree("moved-tip"), new RegExp(`^${keeps}its branch tip is [0-9a-f]{12}, not the tip [0-9a-f]{12} that the listing judged$`)],
    ["a worktree that checked out another branch", tree("other-branch"), `${keeps}its HEAD is on refs/heads/feature/elsewhere, not on its listed branch feature/other-branch`],
    ["a worktree that holds a new worktree with an uncommitted file", tree("nested-worktree"), `${keeps}worktree ${inner} in it stays: it holds an uncommitted change`],
    ["a worktree that holds a new repository with a local commit", tree("nested-repository"), `${keeps}repository ${scratch} in it stays: it holds a commit that no remote has`],
    ["a session directory that holds a new worktree with an uncommitted file", session, `${keeps}worktree ${sessionInner} in it stays: it holds an uncommitted change`],
    ["a durable copy that holds a new worktree with an uncommitted file", carry, `${keeps}worktree ${carryInner} in it stays: it holds an uncommitted change`],
  ]) {
    const matches = typeof reason === "string" ? skipped.get(path) === reason : reason.test(skipped.get(path) ?? "")
    T(`stale-files: the removal keeps ${name} after the listing, with the reason`, existsSync(path) && matches, `reason: ${skipped.get(path)}`)
  }
  same("stale-files: the removal still removes the worktree that stays unchanged", outcome.removed.filter((item) => item.kind === "worktree").map((item) => item.path), [tree("unchanged")])
  T("stale-files: the detached commit made after the listing survives in its worktree", git(tree("detached"), ["rev-parse", "HEAD"]).stdout.trim() === detachedCommit)
  T("stale-files: the uncommitted files made after the listing survive", [inner, sessionInner, carryInner].every((path) => existsSync(join(path, "draft.txt"))))
}

/** A process that tries the removal lock of `repoRoot`, prints `taken` or `busy`, and holds what it took until its stdin closes. */
const LIBRARY = new URL("../lib/stale-files.mjs", import.meta.url).href
export const lockContender = (repoRoot) => {
  const script = `import { takeCleanupLock } from ${JSON.stringify(LIBRARY)}
let release = null
try { release = takeCleanupLock(process.argv[1]); console.log("taken") } catch (error) { console.log(error.message.startsWith("EEXIST") ? "busy" : \`error \${error.message}\`) }
process.stdin.on("end", () => { release?.(); process.exit(0) })
process.stdin.resume()`
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, repoRoot], { stdio: ["pipe", "pipe", "inherit"] })
  const answer = new Promise((resolve) => {
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
      if (output.includes("\n")) resolve(output.trim())
    })
    child.on("exit", () => resolve(output.trim() || "exited"))
  })
  const ended = new Promise((resolve) => child.on("exit", resolve))
  return { answer, end: () => {
    child.stdin.end()
    return ended
  } }
}

/**
 * Only one removal runs at a time, from any checkout of the repository: the marker and the lock live in the common git
 * directory, and two removals that start at once take the lock once.
 */
const lockCases = async () => {
  const base = join(root, "stale-core", "lock")
  const primary = join(base, "primary")
  const linked = join(base, "linked")
  mkdirSync(join(primary, ".git", "worktrees", "linked"), { recursive: true })
  mkdirSync(linked, { recursive: true })
  writeFileSync(join(linked, ".git"), `gitdir: ${join(primary, ".git", "worktrees", "linked")}\n`)
  writeFileSync(join(primary, ".git", "worktrees", "linked", "commondir"), "../..\n")
  writeFileSync(join(primary, ".git", "orbit-stale-files-cleanup.json"), JSON.stringify({ startedAt: 1, reason: "test" }))
  same("stale-files: a linked worktree reads the cleanup marker of the common git directory", readCleanupMarker(linked)?.startedAt, 1)
  writeFileSync(join(primary, ".git", "orbit-stale-files-adoption.json"), JSON.stringify({ sessionId: OTHER, startedAt: 1 }))
  writeFileSync(join(primary, ".git", "worktrees", "linked", "orbit-stale-files-adoption.json"), JSON.stringify({ sessionId: THIS, startedAt: 2 }))
  same("stale-files: each checkout reads its own adoption record", [readCleanupAdoption(primary)?.sessionId, readCleanupAdoption(linked)?.sessionId], [OTHER, THIS])

  const contenders = [lockContender(linked), lockContender(primary)]
  const answers = await Promise.all(contenders.map((contender) => contender.answer))
  same("stale-files: of two removals that start at once, from the primary checkout and a linked worktree, exactly one takes the lock", [...answers].sort(), ["busy", "taken"])
  T("stale-files: while a removal holds the lock, both checkouts see it run", cleanupIsRunning(primary) && cleanupIsRunning(linked))
  let second = null
  try { second = takeCleanupLock(primary) } catch (error) { second = error.message }
  T("stale-files: a third start while the removal runs takes no lock", typeof second === "string" && second.startsWith("EEXIST"), String(second))
  await Promise.all(contenders.map((contender) => contender.end()))
  T("stale-files: the lock is free when the removal ends", !cleanupIsRunning(primary))

  // A removal that dies holds nothing: the next start takes over its lock.
  const dead = { pid: 2 ** 22 + 12_345, processStartIdentity: "darwin:1", claimId: "dead" }
  writeFileSync(join(primary, ".git", "orbit-stale-files-cleanup-lock", "owner.json"), JSON.stringify(dead))
  T("stale-files: the lock of a removal that died is no running removal", !cleanupIsRunning(linked))
  let release = null
  try { release = takeCleanupLock(linked) } catch (error) { T("stale-files: the next start takes over the lock of a removal that died", false, error.message) }
  T("stale-files: the next start takes over the lock of a removal that died", typeof release === "function" && cleanupIsRunning(primary))
  release?.()
}

export const cases = async () => {
  sessionCases()
  carryCases()
  rootCases()
  raceCases()
  recordCases()
  removalCases()
  nestedRemovalCases()
  hiddenUntrackedRemovalCases()
  hiddenChangeRemovalCases()
  fsmonitorRemovalCases()
  unreadableGitCases()
  deadlineCases()
  exportCases()
  reportCases()
  cleanupDueCases()
  launchCases()
  freshBranchCases()
  await lateLivenessCases()
  lateTreeCases()
  await lockCases()
}
