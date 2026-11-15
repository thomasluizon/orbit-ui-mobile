#!/usr/bin/env node

import { resolve } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import {
  claudeConfigDirectories, collectListing, defaultCarryRoot, describeBytes, knownSizesOf, listingIdOf, readStoredListing, removeListed, summarize,
  writeStoredListing,
} from "./lib/stale-files.mjs"

const USAGE = `usage: stale-files.mjs [--list] [--json] [--session <id>] [--session-root <path>] [--carry-root <path>]
       stale-files.mjs --delete --listing <id> [--session <id>] [--session-root <path>] [--carry-root <path>]

  Lists the stale files of a long run with their size and the reason, and removes them on an explicit order.

  session    a session directory under --session-root that is not this session, the run session, a live
             session, the predecessor of one of them, the nominated successor of the run, or a session
             with a live process
  carry      a durable-<id> copy under --carry-root that is older than the newest two and is not the
             copy of a protected or live session
  worktree   a linked worktree of a repository in .claude/orchestrator.json whose pull request merged or
             closed, or whose branch a merged branch contains, with no uncommitted change and no unpushed
             commit. Its local branch always stays.

  An item stays when a live process or a live session uses it, when the scratchpad of a protected session
  links into it, when it holds a registered worktree that the worktree rules keep (an uncommitted change,
  an unpushed commit, an open pull request, work nobody merged), or when a check cannot read its evidence.
  Live sessions come from the Claude session records; a record that cannot be judged, or no record of this
  session, keeps every item that a live session could use.

  --list               (default) compute the listing, store it in the git directory, print each stale item
  --json               with --list: print the stored listing as JSON, with every kept item and its reason
  --delete             remove each item of the stored listing that is still stale; never an item outside it
  --listing <id>       required with --delete: the id that --list printed. A different stored listing is refused
  --session <id>       this session; default: CLAUDE_CODE_SESSION_ID
  --session-root <p>   the directory that holds one directory for each session; default: the root that the
                       stored listing names. Without one, session directories are not checked
  --carry-root <p>     the directory that holds the durable-<id> copies; default: ~/.orbit-run-carry
  --help, -h           print this usage and exit 0

  Sizes are bytes as du counts them: a cloned file counts in full for each copy. --delete also prints the
  change of free space on the volumes it removed items from.

exit codes: 0 listed, or every listed item that is still stale was removed, 1 the removal was refused or an
            item could not be removed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const VALUE_FLAGS = ["--listing", "--session", "--session-root", "--carry-root"]
const SWITCHES = ["--list", "--json", "--delete"]
const values = {}
const switches = new Set()
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]
  if (SWITCHES.includes(token)) switches.add(token)
  else if (VALUE_FLAGS.includes(token) && argv[index + 1] !== undefined && !argv[index + 1].startsWith("-")) values[token] = argv[++index]
  else fail(2, `${USAGE}\n\nunknown option or missing value: ${token}`)
}
if (switches.has("--delete") && (switches.has("--list") || switches.has("--json"))) fail(2, `${USAGE}\n\n--delete cannot combine with --list or --json`)
if (switches.has("--delete") !== (values["--listing"] !== undefined)) fail(2, `${USAGE}\n\n--delete and --listing <id> go together`)
const sessionId = values["--session"] ?? process.env.CLAUDE_CODE_SESSION_ID
if (!sessionId) fail(2, `${USAGE}\n\nname this session with --session <id>: its directory must never be removed`)

const stored = readStoredListing()
let repositories
try {
  repositories = readOrchestratorConfig().repos
} catch (error) {
  fail(1, error.message)
}
const sessionRoot = values["--session-root"] ?? stored?.context?.sessionRoot ?? null
const context = { sessionId, sessionRoot: sessionRoot ? resolve(sessionRoot) : null, carryRoot: resolve(values["--carry-root"] ?? defaultCarryRoot()),
  repositories, configDirectories: claudeConfigDirectories() }
const sizeOf = (item) => (Number.isFinite(item.bytes) ? describeBytes(item.bytes) : "size not measured")

if (switches.has("--delete")) {
  if (!stored) fail(1, "no stored listing: run node tools/stale-files.mjs --list, then ask the owner")
  if (stored.listingId !== values["--listing"]) {
    fail(1, `listing ${values["--listing"]} is not the stored listing ${stored.listingId}: the stale items changed. Run node tools/stale-files.mjs --list, then ask the owner again`)
  }
  const outcome = removeListed(stored, collectListing(context, { knownSizes: knownSizesOf(stored), measure: false }), repositories)
  for (const item of outcome.removed) console.log(`REMOVED ${item.kind} ${item.path} (${sizeOf(item)})`)
  for (const item of outcome.skipped) console.log(`SKIPPED ${item.kind} ${item.path}: ${item.reason}`)
  for (const item of outcome.failed) console.error(`FAILED ${item.kind} ${item.path}: ${item.reason}`)
  // The store keeps only the listed items that are still there, so no later removal can reach an item the owner never saw.
  const remaining = outcome.failed.map(({ reason: _reason, ...item }) => item)
  writeStoredListing({ ...stored, stale: remaining, listingId: listingIdOf(remaining) })
  console.log(`FREED ${outcome.removed.length === 0 ? "nothing" : summarize(outcome.removed)}; free space changed by ${outcome.freed < 0 ? "-" : "+"}${describeBytes(Math.abs(outcome.freed))}`)
  process.exit(outcome.failed.length > 0 ? 1 : 0)
}

const listing = collectListing(context, { knownSizes: knownSizesOf(stored) })
writeStoredListing(listing)
if (switches.has("--json")) {
  console.log(JSON.stringify(listing, null, 2))
  process.exit(0)
}
if (context.sessionRoot === null) console.error("session directories were not checked: no --session-root, and no stored listing names one")
for (const item of listing.stale) console.log(`STALE ${item.kind} ${item.path} (${sizeOf(item)}): ${item.reason}`)
console.log(listing.stale.length === 0
  ? `No stale items. ${listing.kept.length} kept; --json gives the reason for each one.`
  : `TOTAL ${summarize(listing.stale)}. ${listing.kept.length} kept; --json gives the reason for each one.\nAfter the owner says yes: node tools/stale-files.mjs --delete --listing ${listing.listingId}`)
