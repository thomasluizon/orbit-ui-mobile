import { existsSync, mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  LISTING_MAX_AGE_MS, collectListing, describeBytes, listingIdOf, offerOf, refreshIsDue, removeListed, summarize, systemProbes,
} from "../lib/stale-files.mjs"
import { T, root } from "./_harness.mjs"

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

const same = (name, got, want) => T(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
const quietProbes = { ...systemProbes, processes: () => [], liveSessions: () => [], git: () => "", pullRequests: () => [], measure: () => 1024 }
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
    liveSessions: () => [{ sessionId: LIVE_RECORD, cwd: machine.checkout }],
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
  const listing = collectListing(machine.context, { probes: { ...quietProbes, liveSessions: () => [{ sessionId: LIVE_CARRY, cwd: machine.base }] } })
  const copy = (name) => join(machine.carryRoot, name)
  same("stale-files: only a durable copy older than the newest two is stale", stalePaths(listing, "carry"), [copy("durable-0a0a0a0a")])
  T("stale-files: the stale durable copy names its reason", /older than the newest two durable copies/.test(listing.stale.find((item) => item.kind === "carry")?.reason ?? ""), JSON.stringify(listing.stale))
  for (const name of ["durable-0e0e0e0e", "durable-0d0d0d0d"]) T(`stale-files: ${name} is one of the newest two`, /newest two/.test(reasonOf(listing, copy(name)) ?? ""), `reason: ${reasonOf(listing, copy(name))}`)
  T("stale-files: the durable copy of the predecessor is kept at any age", /durable copy of the predecessor/.test(reasonOf(listing, copy("durable-22222222")) ?? ""), `reason: ${reasonOf(listing, copy("durable-22222222"))}`)
  T("stale-files: a durable copy this scratchpad links into is kept", /scratchpad of session 00000000 links into it/.test(reasonOf(listing, copy("durable-0b0b0b0b")) ?? ""), `reason: ${reasonOf(listing, copy("durable-0b0b0b0b"))}`)
  T("stale-files: the durable copy of a live session is kept at any age", /durable copy of live session 0f0f0f0f/.test(reasonOf(listing, copy("durable-0f0f0f0f")) ?? ""), `reason: ${reasonOf(listing, copy("durable-0f0f0f0f"))}`)
  same("stale-files: other entries of the carry root are never items", [...listing.stale, ...listing.kept].filter((item) => item.kind === "carry").length, 6)
}

const removalCases = () => {
  const machine = stageMachine("removal")
  const directory = (session) => join(machine.sessionRoot, session)
  const outside = join(machine.base, "outside")
  mkdirSync(outside)
  writeFileSync(join(outside, "sentinel.txt"), "must survive\n")
  symlinkSync(outside, join(directory(STALE), "scratchpad", "outside"), "dir")
  const unowned = [LIVE_RECORD, LIVE_DIRECTORY, LIVE_COMMAND, LINKED, CHAINED, HOLDS_WORK, STALE]
  const stored = collectListing(machine.context, { probes: quietProbes })
  // After the listing: one listed item gains a live process, and one new item goes stale.
  const laterProbes = { ...quietProbes, processes: () => [{ command: "node build.mjs", directory: directory(LIVE_COMMAND) }] }
  same("stale-files: the removal fixture lists every session directory that no session owns", stalePaths(stored, "session").sort(), unowned.map(directory).sort())
  const unlisted = join(machine.sessionRoot, "bbbbbbbb-0000-4000-8000-00000000000b")
  mkdirSync(unlisted)
  const fresh = collectListing(machine.context, { probes: laterProbes, measure: false })
  const foreign = { kind: "session", path: outside, bytes: 1, reason: "planted" }
  const outcome = removeListed({ ...stored, stale: [...stored.stale, foreign] }, { ...fresh, stale: [...fresh.stale, foreign] }, {}, { probes: laterProbes })
  same("stale-files: removal deletes each listed item that is still stale", outcome.removed.map((item) => item.path).sort(), unowned.filter((session) => session !== LIVE_COMMAND).map(directory).sort())
  same("stale-files: the removed directories are gone", outcome.removed.some((item) => existsSync(item.path)), false)
  same("stale-files: a listed item that a process now uses is skipped with the reason", outcome.skipped.map((item) => `${item.path}: ${item.reason}`), [`${directory(LIVE_COMMAND)}: a live process works in it`])
  T("stale-files: the skipped directory survives", existsSync(directory(LIVE_COMMAND)))
  T("stale-files: an item that went stale after the listing survives", existsSync(unlisted))
  T("stale-files: a protected session directory survives", [THIS, CHAIN_PREDECESSOR, RUN_PREDECESSOR, SUCCESSOR].every((session) => existsSync(directory(session))))
  same("stale-files: a link inside a removed directory is unlinked and its target survives", readFileSync(join(outside, "sentinel.txt"), "utf8"), "must survive\n")
  T("stale-files: a path outside the session root is refused, not removed", outcome.failed.map((item) => item.path).join() === outside && existsSync(outside), JSON.stringify(outcome.failed))
  T("stale-files: removal reports the change of free space as a number", Number.isFinite(outcome.freed))
}

const reportCases = () => {
  const machine = stageMachine("report")
  const present = join(machine.sessionRoot, STALE)
  const stale = [{ kind: "session", path: present, bytes: 3 * 1024 ** 3, reason: "r" }, { kind: "worktree", path: machine.checkout, bytes: 512 * 1024 ** 2, reason: "r" }]
  same("stale-files: bytes print in the largest unit", [describeBytes(0), describeBytes(1536), describeBytes(5 * 1024 ** 3)], ["0 B", "1.5 KB", "5.0 GB"])
  same("stale-files: the summary gives the count, the size and each class", summarize(stale), "2 items, 3.5 GB (1 session directory, 1 worktree)")
  same("stale-files: the summary counts an item with no size", summarize([{ ...stale[0], bytes: null }]), "1 item, 0 B and 1 not measured (1 session directory)")
  same("stale-files: the listing id ignores item order and follows the item set", [listingIdOf(stale) === listingIdOf([...stale].reverse()), listingIdOf(stale) === listingIdOf(stale.slice(1))], [true, false])
  const listing = { version: 1, generatedAt: new Date().toISOString(), listingId: listingIdOf(stale), context: { sessionRoot: machine.sessionRoot }, stale }
  const offer = offerOf(listing, THIS)
  T("stale-files: the offer gives the total size, the item count and the removal command in one line", /2 items, 3\.5 GB/.test(offer) && offer.includes(`node tools/stale-files.mjs --delete --listing ${listing.listingId}`) && /only after the owner says yes/.test(offer) && !offer.includes("\n"), offer)
  same("stale-files: no stale item means no offer", offerOf({ ...listing, stale: [] }, THIS), null)
  same("stale-files: no stored listing means no offer", offerOf(null, THIS), null)
  same("stale-files: an item that no longer exists is not offered", offerOf({ ...listing, stale: [{ ...stale[0], path: join(machine.base, "gone") }] }, THIS), null)
  same("stale-files: the directory of the session that reads the offer is never offered", offerOf({ ...listing, stale: [stale[0]] }, STALE), null)
  const now = Date.now()
  same("stale-files: a new listing is due without a stored one", refreshIsDue(null, machine.checkout, now), true)
  same("stale-files: a recent listing is not due again", refreshIsDue(listing, machine.checkout, now), false)
  const old = { ...listing, generatedAt: new Date(now - LISTING_MAX_AGE_MS - 1).toISOString() }
  same("stale-files: an old listing is due", refreshIsDue(old, machine.checkout, now), true)
  writeFileSync(join(machine.checkout, ".git", "orbit-stale-files-refresh.json"), JSON.stringify({ pid: process.pid, startedAt: now }))
  same("stale-files: a listing that still runs is not started twice", refreshIsDue(old, machine.checkout, now), false)
  writeFileSync(join(machine.checkout, ".git", "orbit-stale-files-refresh.json"), JSON.stringify({ pid: process.pid, startedAt: 0 }))
  same("stale-files: a listing marker past its ceiling does not block a new listing", refreshIsDue(old, machine.checkout, now), true)
}

export const cases = () => {
  sessionCases()
  carryCases()
  removalCases()
  reportCases()
}
