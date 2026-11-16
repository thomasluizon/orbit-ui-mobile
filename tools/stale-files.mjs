#!/usr/bin/env node

import { resolve } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"
import {
  claudeConfigDirectories, collectListing, defaultCarryRoot, describeBytes, knownSizesOf, readStoredListing, removeListed, summarize, takeCleanupLock, writeStoredListing,
} from "./lib/stale-files.mjs"

const USAGE = `usage: stale-files.mjs [--list] [--json] [--session <id>] [--session-root <path>] [--carry-root <path>]
       stale-files.mjs --delete [--session <id>] [--session-root <path>] [--carry-root <path>]

  Lists the stale files of a long run with their size and the reason, and removes them. An unattended run starts
  --delete itself at each relay adoption and whenever free disk on /System/Volumes/Data is under 50 GiB; no owner
  answer gates it, because the listing at the removal proves each item stale.

  session    a session directory under --session-root that is not this session, the run session, a live
             session, the predecessor of one of them, the nominated successor of the run, or a session
             with a live process
  carry      a durable-<id> copy under --carry-root that is older than the newest two and is not the
             copy of a protected or live session
  worktree   a linked worktree of a repository in .claude/orchestrator.json whose pull request merged or
             closed, or whose branch a merged branch contains, with no uncommitted change and no unpushed
             commit. An untracked file counts as a change, whatever status.showUntrackedFiles,
             core.excludesFile or info/exclude says, and so does a tracked file that an assume-unchanged
             or skip-worktree flag hides from git status. Its local branch always stays.

  An item stays when a live process or a live session uses it, when the scratchpad of a session that stays
  links into it from any project root beside --session-root, when it holds a registered worktree that the
  worktree rules keep (an uncommitted change, an unpushed commit, an open pull request, work nobody merged, a ticket
  that the run queue names, a worker launch reservation, a branch with no pull request made after the last relay),
  when a live wake source names it,
  when it is a finished worktree that holds a repository with an uncommitted change or a commit that no
  remote has, when a kept item lives in it, when it is in the directory of a session that stays in another
  project root, or when a check cannot read its evidence. A repository in a session directory or a carry
  copy goes with it. A removal takes the whole tree, with each path that a .gitignore of the tree ignores.
  Live sessions come from the Claude session records of this session's config directory, ~/.claude and the
  worker account directory in the variable that workers.claude.configDirEnv names; a record that cannot be
  judged, or no record of this session, keeps every item that a live session could use.

  --list               (default) compute the listing, store it in the git directory, print each stale item
  --json               with --list: print the stored listing as JSON, with every kept item and its reason
  --delete             compute the listing again and remove each stale item, the deepest first; never a kept
                       item outside it, and never one that holds an item that could not be removed or stays.
                       Just before each item it reads the live sessions, the processes, the run queue, the wake
                       sources, the launch reservations, the scratchpad links and the worktrees again, and applies
                       the listing's rules again: an item stays when one of them now holds it, when its worktree
                       now holds a change, a detached HEAD, another branch or a tip other than the listed one, or
                       when a worktree or a repository inside it now holds work.
                       It holds a lock in the common git directory while it runs; a second --delete meanwhile
                       prints NOTHING REMOVED and exits 0
  --session <id>       this session; default: CLAUDE_CODE_SESSION_ID
  --session-root <p>   the directory that holds one directory for each session; default: the root that the
                       stored listing names. Without one, session directories are not checked, and every
                       durable copy older than the newest two and every finished worktree stays: no scratchpad
                       that could link into it is read
  --carry-root <p>     the directory that holds the durable-<id> copies; default: ~/.orbit-run-carry
  --help, -h           print this usage and exit 0

  Sizes are bytes as du counts them: a cloned file counts in full for each copy. --delete also prints the
  change of free space on the volumes it removed items from.

exit codes: 0 listed, or every stale item was removed, 1 an item could not be removed or the setup could not be read,
            2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const VALUE_FLAGS = ["--session", "--session-root", "--carry-root"]
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
const sessionId = values["--session"] ?? process.env.CLAUDE_CODE_SESSION_ID
if (!sessionId) fail(2, `${USAGE}\n\nname this session with --session <id>: its directory must never be removed`)

const stored = readStoredListing()
let repositories
let configDirectories
try {
  const config = readOrchestratorConfig()
  repositories = config.repos
  configDirectories = claudeConfigDirectories(config)
} catch (error) {
  fail(1, error.message)
}
const sessionRoot = values["--session-root"] ?? stored?.context?.sessionRoot ?? null
const context = { sessionId, sessionRoot: sessionRoot ? resolve(sessionRoot) : null, carryRoot: resolve(values["--carry-root"] ?? defaultCarryRoot()),
  repositories, configDirectories, repoRoot: REPO_ROOT }
const sizeOf = (item) => (Number.isFinite(item.bytes) ? describeBytes(item.bytes) : "size not measured")

if (switches.has("--delete")) {
  let release
  try { release = takeCleanupLock() } catch (error) {
    if (!error.message.startsWith("EEXIST")) fail(1, `the removal lock could not be taken, so nothing was removed: ${error.message}`)
    console.log("NOTHING REMOVED: another removal runs and holds the lock")
    process.exit(0)
  }
  let failed
  try {
    const fresh = collectListing(context, { knownSizes: knownSizesOf(stored), measure: false })
    const outcome = removeListed(fresh, repositories)
    for (const item of outcome.removed) console.log(`REMOVED ${item.kind} ${item.path} (${sizeOf(item)})`)
    for (const item of outcome.skipped) console.log(`SKIPPED ${item.kind} ${item.path}: ${item.reason}`)
    for (const item of outcome.failed) console.error(`FAILED ${item.kind} ${item.path}: ${item.reason}`)
    writeStoredListing({ ...fresh, stale: outcome.failed.map(({ reason: _reason, ...item }) => item) })
    console.log(`FREED ${outcome.removed.length === 0 ? "nothing" : summarize(outcome.removed)}; free space changed by ${outcome.freed < 0 ? "-" : "+"}${describeBytes(Math.abs(outcome.freed))}`)
    failed = outcome.failed.length > 0
  } finally {
    release()
  }
  process.exit(failed ? 1 : 0)
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
  : `TOTAL ${summarize(listing.stale)}. ${listing.kept.length} kept; --json gives the reason for each one.\nRemove them: node tools/stale-files.mjs --delete`)
