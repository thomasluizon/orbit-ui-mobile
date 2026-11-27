#!/usr/bin/env node

/**
 * The delivery driver. A program, not a model: each tick it reads GitHub, acts on every open pull request, and fills every
 * free worker slot (one to three Sonnet workers, by the headroom under the weekly line). It merges at the owner's bar, and it
 * releases every platform on a steady cadence (lib/release-train.mjs): staging first, then production. All
 * state lives on GitHub, in `git worktree list` and in its own pid files, so a restart loses nothing.
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { readDriveConfig } from "./lib/config.mjs"
import { changesDriver, collectCrash, crashesOfSwitch, endRun, lastLine, readPin, rolledBackFrom, startRun, writePin } from "./lib/driver-pin.mjs"
import { escapeRegex } from "./lib/escape-regex.mjs"
import { CLEAN_STATUS_ARGUMENTS, HIDDEN_CHANGE_ARGUMENTS, WORKTREE_REMOVE_ARGUMENTS, findRepositories, hiddenChangesOf, parseWorktreeList } from "./lib/git-worktrees.mjs"
import { repositorySlug } from "./lib/github-auth.mjs"
import * as githubApi from "./lib/github.mjs"
import { APPROVAL_CHECK_MISSING, carriedApproval, classifyCheckFailure, failedChecks, holds, isRateLimited, isReviewPass, mergeBar, needsWholeDiff, passedChecks, sentryCandidate, sentryIssues, setReviewerToken, wholeDiffApproved } from "./lib/github.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { ownerParts, partOf, partProblem, renderOrder } from "./lib/order.mjs"
import { mobileMergeHold, readTrainState, realPorts, releaseTick, requestTrain, trainSummary } from "./lib/release-train.mjs"
import { MESSAGE_LIMIT, sendTelegram } from "./lib/telegram.mjs"
import * as workerApi from "./lib/worker.mjs"

const USAGE = `usage: drive.mjs [--dry-run | --once | --probe | --allow-over-limit | --pace main|worker on|off | --sleep on | --sleep off | --reviewer-token | --preflight | --release-now | --release-status] [--help]

  The delivery driver. It reads GitHub each tick, acts on every open ticket and pull request, and merges at the
  owner's bar. It never idles: a free worker slot and an admissible order start a worker on the same tick. The driver
  uses two Claude accounts: the main account (the default login) and the worker account (CLAUDE_CONFIG_DIR is
  ~/.claude-orbit-workers). Each account has its own line, the share of its week gone times 0.90. An account runs 1
  worker while its utilization is above its line, 2 while it is 0.10 under the line and 3 while it is 0.20 under it. The
  worker slots are the sum of both accounts, and a launch uses the worker account when it has a free slot, else the main
  account. An account stops at 90% of its week: it starts no worker and runs no probe. The stop of the main account also
  holds the Pullfrog requests, because Pullfrog runs on it. A worker that ends on a usage limit stops its account until its
  reset, and the order starts again on the other account. The driver still merges a pull request that meets the bar.
  The driver also runs the release train: a train starts at most every 4 hours when a service has unreleased work, and it
  releases API, web, landing and mobile (Android, then iOS), staging first and then production. Each tick makes at most one
  dispatch or one check. --dry-run prints the steps. The train state is the file release-train.json in the state directory.

  A notification goes to the owner's phone through the Telegram Bot API, with the Keychain items telegram-bot-token and
  telegram-chat-id. With one of them missing it is a macOS notification. When Telegram refuses one, it shows on the Mac
  and each later tick sends it to the phone again. The same item, head and cause is told once.

  (no flag)   run the loop: one tick each 120 seconds until stopped. At the end of a tick with no worker running, the driver
              checks out a newer driver commit of origin/main in its own worktree and exits 0, so launchd starts the new version.
              A new version that crashes three times in ten minutes is rolled back to the previous commit.
  --dry-run   read everything, print one line for each open ticket and pull request with the action the driver would
              take, one line with the next ticket in line, one line with the free worker slots and the stop state and one
              line with the pinned commit of the driver and whether main has a newer driver commit; write nothing and spawn
              nothing
  --once      run one real tick, wait for the workers that the tick started, then exit
  --probe     run one probe and print the reading (utilization, resetsAt, age)
  --allow-over-limit [main|worker]  let one account continue over 90% in its current week, with 1 worker. The owner session
              runs it when the owner says so. It takes the main account with no word. A new week of that account ends it.
  --pace main|worker on|off  the owner's setting of one account's weekly pace. off: the account runs 3 workers with no line
              and no 90% stop, until a worker ends on its usage limit. on: the pace above. Each account starts with the pace on.
  --sleep on|off  sleep mode of the owner. While it is on the driver sends no notification and asks nothing: each item for
              the owner still gets one comment, plus the needs:owner label on its ticket, and the driver works on every other item.
              --sleep off makes the driver send one notification that lists the items held, each with its link.
  --release-now  ask the driver to start a release train on its next tick, at once, whatever the 4 hour cadence and the last stop.
              It starts only when a service has unreleased work. The owner session runs it for /release.
  --release-status  print the newest release train: what it released and where it stopped
  --reviewer-token  read a Claude OAuth token on stdin and set CLAUDE_CODE_OAUTH_TOKEN in the three repositories;
              print each repository's result and never the token
  --preflight  run the checks that a loop start runs before the first tick (the tools on PATH and the configuration), then exit 0.
              The driver runs it on a new commit before it switches to that commit.
  --help, -h  print this usage and exit 0

exit codes: 0 done, 2 usage error, 3 missing tool, configuration or credential`

const TICK_MS = 120 * 1000
/** After this many failed ticks in a row, the driver waits `BACKOFF_MS` between ticks until one passes. */
const FAILED_TICKS_BEFORE_BACKOFF = 3
const BACKOFF_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * HOUR_MS
const WEEKLY_CAP = 0.9
const SLOT_STEP = 0.1
const MAX_WORKERS = 3
const SLOT_EPSILON = 1e-9
const RESET_TOLERANCE_SECONDS = 3600
const ALLOW_FILE = "over-limit.json"
const PACE_SETTING_FILE = "pace-setting.json"
const SLEEP_FILE = "sleep.json"
const SLEEP_ITEMS_FILE = "sleep-items.json"
const NOTICES_FILE = "notices.json"
const NOTICE_KEYS_KEPT = 500
const NOTICE_PENDING_KEPT = 50
const TITLE_LIMIT = 120
const DETAIL_LIMIT = 300
/** The lengths that the reason of a held item tries, longest first, until the list fits one message. */
const SLEEP_REASON_LIMITS = [100, 60, 30]
const HEAD_IN_REASON = / at [0-9a-f]{40}(?=:)/
const QUESTIONS_FILE = "questions.json"
const QUESTIONS_STEM = "questions"
const QUESTIONS_ORDER = "/questions --auto"
const SLEEP_WORDS = ["on", "off"]
const REQUIRED_TOOLS = ["node", "git", "gh", "claude", "security", "osascript", "caffeinate"]
const REPOSITORY_KEYS = ["ui", "api", "landing"]
const FIX_KINDS = ["fix", "ci-fix", "merge-forward"]
const MAX_ORDER_LAUNCHES = 2
const MAX_FIX_LAUNCHES = 2
const FLAKE_LOG_LINES = 40
const BASE_COMMIT_LIMIT = 30
const MERGED_TTL_MS = 10 * 60 * 1000
const MERGED_READS_PER_TICK = 10
/** The pull requests of one tick that the plan reads at the same time. */
const PLAN_PARALLEL = 4
/** How long a tick waits for the pull request plan before a free slot takes an admitted build order. */
const PLAN_WINDOW_MS = 15 * 1000
const REMAINING_NONE = /^Remaining: none\s*$/m
const REMAINING_LINE = /^Remaining:.*$/m
/** A Remaining item that only the owner, another ticket or a release can meet starts with `owner:` or `blocked by` and a ticket reference. */
const OWNER_ITEM = /^(owner:|blocked by\s+(#\d+|ORB-\d+))/i
const MISSING_AFTER_RUN_MS = 15 * 60 * 1000
const MISSING_AFTER_REQUEST_MS = 30 * 60 * 1000
const TICKET_COMMENT_LIMIT = 65000
const RESTART_WINDOW_MS = 10 * 60 * 1000
const BRANCH_TYPE = { Bug: "fix", Feature: "feature", Improvement: "chore" }
const PAUSE_TITLE = "Driver paused: a worker stopped at a usage limit or a sign-in failure"
const STOP_TITLE = "Driver stopped: weekly usage reached 90%"
const RESTART_TITLE = "Driver restarted three times in ten minutes"
const STALL_TITLE = "Driver stalled: no worker, request or merge for 60 minutes"
const ACTIVITY_FILE = "activity.json"
const STALL_MS = HOUR_MS
const CHECK_SETTLE_MS = 5 * 60 * 1000
const LOGIN_TITLE = "Driver stopped: Claude is not logged in"
const OWNER = "needs:owner"
const CHANGES_REQUESTED = "CHANGES_REQUESTED"
const PLAIN_REQUEST = "@pullfrog review"
const CHECK_REQUEST_RECORD = "driver check request"
const WHOLE_DIFF_REQUEST = "@pullfrog review whole diff"
const TAIL_BYTES = 256 * 1024
const PULLFROG_LOG_END_LINES = 40

export const marked = (kind, text) => `<!-- orbit-drive:${kind} -->\n${text}`
const firstLine = (text) => text.split("\n", 1)[0]
const bodyAfterMarker = (comment) => comment.body.split("\n").slice(1).join("\n")

const recordsOf = (ticket, kind) => (ticket?.comments ?? []).filter((entry) => entry.kind === kind).flatMap((entry) => {
  try { return [JSON.parse(bodyAfterMarker(entry))] } catch { return [] }
})

/**
 * The launch records on a ticket, read in comment order. A `launch-refund` comment takes back the newest launch of its branch and
 * kind that comes before it: a worker that ended on a usage limit did no work, so its launch counts toward no cap.
 * A launch comment at or before `since` (epoch milliseconds) is not read.
 */
export const launchesOf = (ticket, since = 0) => {
  const launches = []
  for (const entry of ticket?.comments ?? []) {
    if (entry.kind !== "launch" && entry.kind !== "launch-refund") continue
    if (Date.parse(entry.createdAt) <= since) continue
    let record
    try { record = JSON.parse(bodyAfterMarker(entry)) } catch { continue }
    if (entry.kind === "launch") { launches.push(record); continue }
    const at = launches.findLastIndex((launch) => launch.branch === record.branch && launch.kind === record.kind)
    if (at >= 0) launches.splice(at, 1)
  }
  return launches
}

/** Parts of a ticket, oldest comment first, one entry for each part number. */
const partsOf = (ticket) => {
  const byNumber = new Map()
  // Admission refuses a ticket with two live comments of one part, so each part number has one comment here.
  // The newest part set is in force, so an older set with another total is dropped.
  for (const entry of ownerParts(ticket.comments.filter((comment) => comment.kind === null)).sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const part = partOf(entry)
    if (part) byNumber.set(part.number, { ...part, comment: entry, paths: pathsOf(entry.body), find: /^Kind: find\s*$/m.test(entry.body) })
  }
  return [...byNumber.values()].sort((left, right) => left.number - right.number)
}

/** The comma-separated pathspecs of the line `Paths:` of a part comment; null when the part names none. */
const pathsOf = (body) => {
  const line = /^Paths:\s*(.+)$/m.exec(body)?.[1]
  return line ? line.split(",").map((item) => item.trim()).filter(Boolean) : null
}

const isMagic = (spec) => spec.startsWith(":") || /[*?[]/.test(spec)
const trimSlash = (spec) => spec.replace(/\/+$/, "")

/** Two literal paths overlap when they are equal or one sits inside the other. */
const literalOverlap = (left, right) => {
  const [first, second] = [trimSlash(left), trimSlash(right)]
  return first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`)
}

/** Two parts overlap when `git ls-files` at main lists one file for both pathspec sets, or a literal path of one holds a literal path of the other. */
export const pathsOverlap = async (env, repoPath, left, right) => {
  if (left.some((first) => !isMagic(first) && right.some((second) => !isMagic(second) && literalOverlap(first, second)))) return true
  const list = async (specs) => new Set((await env.git(repoPath, ["ls-files", "--", ...specs])).stdout.split("\n").filter(Boolean))
  const [first, second] = [await list(left), await list(right)]
  return [...first].some((file) => second.has(file))
}

/** The number of open tickets on the longest path of `blockedBy` links that starts at each open ticket. */
const chainLengths = (tickets) => {
  const dependents = new Map(tickets.map((ticket) => [ticket.number, []]))
  for (const ticket of tickets) for (const blocker of ticket.blockedBy) if (blocker.open) dependents.get(blocker.number)?.push(ticket.number)
  const lengths = new Map()
  const measure = (number, path) => {
    if (lengths.has(number)) return lengths.get(number)
    if (path.has(number)) return 0
    const longest = Math.max(0, ...(dependents.get(number) ?? []).map((next) => measure(next, new Set([...path, number]))))
    lengths.set(number, 1 + longest)
    return 1 + longest
  }
  for (const ticket of tickets) measure(ticket.number, new Set())
  return lengths
}

/** `Bug` first, then the longest open chain, then the lowest number. */
export const rankTickets = (tickets) => {
  const lengths = chainLengths(tickets)
  return [...tickets].sort((left, right) => Number(right.labels.includes("Bug")) - Number(left.labels.includes("Bug")) || lengths.get(right.number) - lengths.get(left.number) || left.number - right.number)
}

/**
 * The weekly pace of the newest reading: `line` is the share of the week gone times 0.90, and the slots are 1, 2 or 3 by
 * the headroom under it. State is `unknown`, `reset`, `below`, `stopped` (0.90 or more) or `allowed` (the allow file names
 * the week). No reading, an ended week, or a stale reading with no worker running allows 1 slot.
 */
export const paceState = ({ reading, now, allowance = null, workersRun = false }) => {
  const end = reading === null ? null : reading.resetsAt * 1000
  if (end === null || end <= now) return { state: end === null ? "unknown" : "reset", utilization: reading?.utilization ?? null, resetsAt: reading?.resetsAt ?? null, line: null, slots: 1, stopped: false }
  const line = ((now - (end - WEEK_MS)) / WEEK_MS) * WEEKLY_CAP
  const under = line - reading.utilization
  const headroom = Math.min(MAX_WORKERS, Math.max(1, 1 + Math.floor((under + SLOT_EPSILON) / SLOT_STEP)))
  const stale = !workersRun && now - reading.at > HOUR_MS
  const over = reading.utilization >= WEEKLY_CAP - SLOT_EPSILON
  const allowed = allowance !== null && Math.abs(allowance.resetsAt - reading.resetsAt) < RESET_TOLERANCE_SECONDS
  return { state: !over ? "below" : allowed ? "allowed" : "stopped", utilization: reading.utilization, resetsAt: reading.resetsAt, line, slots: stale ? 1 : headroom, stopped: over && !allowed }
}

const newestReading = (...readings) => readings.filter(Boolean).sort((left, right) => right.at - left.at)[0] ?? null

/** The account of a `claude auth status --json` answer, keyed on its organization and email. The key is a hash, so it can appear in a log or an issue. */
export const accountFrom = (status) => ({ key: createHash("sha256").update(`${status.orgId}\n${status.email}`).digest("hex").slice(0, 16), email: status.email, orgId: status.orgId, subscriptionType: status.subscriptionType })

const MAIN = "main"
const WORKER = "worker"
const ACCOUNT_NAMES = [MAIN, WORKER]

/** The state of the worker account. The main account keeps the same members on the memory itself. */
const createWorkerAccount = () => ({ account: null, reading: null, lastProbeAt: null, probeOwed: false, stoppedUntil: null, adopted: false })

/** The state of one account: the main account is the memory, the worker account is `mem.worker`. */
const stateOf = (mem, name) => (name === WORKER ? mem.worker : mem)

/** The accounts that can take a worker now: the main account when its login is known, and the worker account when it is signed in as another login. */
const knownAccounts = (mem) => ACCOUNT_NAMES.filter((name) => stateOf(mem, name).account !== null)

/** The name of the account that a launch record or a reading names by its key. A key that matches neither belongs to the main account. */
const nameOfKey = (mem, key) => (key !== null && mem.worker.account?.key === key ? WORKER : MAIN)

/** A reading counts only for the account that took it: a worker event for the account of its launch, the snapshot for its email. */
const readingsOfAccount = (env, mem, name) => {
  const state = stateOf(mem, name)
  if (state.account === null) return []
  const snapshot = env.snapshot()
  return [state.reading?.account === state.account.key ? state.reading : null, snapshot?.email === state.account.email ? snapshot : null]
}

const tailOf = (logFile) => {
  let descriptor
  try {
    const size = statSync(logFile).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    descriptor = openSync(logFile, "r")
    readSync(descriptor, buffer, 0, length, size - length)
    return buffer.toString("utf8")
  } catch {
    return ""
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/** The text of the last `type: "result"` line of a stream-json log. */
export const resultText = (logText) => {
  for (const line of logText.split("\n").reverse()) {
    if (!line.startsWith("{")) continue
    try {
      const record = JSON.parse(line)
      if (record.type === "result") return typeof record.result === "string" ? record.result : ""
    } catch { /* a cut first line of the tail */ }
  }
  return ""
}

/** The branch of a part of a ticket, as the driver names it, with or without a rotation suffix. */
const partBranch = (ticketNumber, partNumber) => new RegExp(`ticket-${ticketNumber}-part-${partNumber}(-r\\d+)?$`)

/** The first branch of a ticket that no merged pull request used. An open pull request keeps its order on the same branch. */
const branchName = (ticket, part, used) => {
  const type = BRANCH_TYPE[ticket.labels.find((label) => BRANCH_TYPE[label])] ?? "chore"
  const base = `${type}/ticket-${ticket.number}${part === null ? "" : `-part-${part}`}`
  for (let round = 1; ; round++) {
    const candidate = round === 1 ? base : `${base}-r${round}`
    if (!used.has(candidate)) return candidate
  }
}

const sectionsOutside = (reviews) => reviews.flatMap((review) => {
  const lines = review.body.split("\n")
  const start = lines.findIndex((line) => /^## Outside this change\s*$/.test(line))
  if (start < 0) return []
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line))
  const text = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim()
  return text === "" ? [] : [text]
})

/** The ticket comment that carries the ticket and the part to Pullfrog, which cannot read the private ticket repository. */
export const ticketComment = ({ repository, ticket, part }) => {
  const head = `Ticket ${repository}#${ticket.number}: ${ticket.title}`
  const tail = `## The part this pull request builds\n\n${part === null ? "No parts: the ticket body is the whole order." : part.comment.body.trim()}`
  const assemble = (body, cut) => `${marked("ticket", head)}\n<details><summary>Ticket body</summary>\n\n${body}\n\n${cut}</details>\n\n${tail}`
  const whole = assemble(ticket.body.trim(), "")
  if (whole.length <= TICKET_COMMENT_LIMIT) return whole
  const room = TICKET_COMMENT_LIMIT - assemble("", "Ticket body cut here: it had 000000 characters.\n").length
  return assemble(ticket.body.trim().slice(0, Math.max(0, room)), `Ticket body cut here: it had ${ticket.body.trim().length} characters.\n`)
}

export const createMemory = () => ({ running: new Map(), results: new Map(), lastProbeAt: null, reading: null, acted: false, waiting: [], lastIntakeAt: 0, known: {}, wake: () => {}, woken: false, checkedRuns: new Set(), updateTypes: new Map(), merged: new Map(), mergedReadsLeft: 0, mergedReadThisTick: new Set(), account: null, probeOwed: false, stoppedUntil: null, worker: createWorkerAccount(), orphans: new Map(), paceLoaded: false, saved: null, questions: null, keptWorktrees: new Map(), readErrors: [], failedTicks: 0, holdUntil: 0 })

const log = (env, item, action, reason = "") => env.log(`${new Date(env.now()).toISOString()} ${item} ${action}${reason === "" ? "" : ` (${reason})`}`)

/** The start of the last questions run in epoch milliseconds, or 0 when no run started. `questions.json` keeps it, so a restart does not run again for the same reports. */
const readQuestionsStart = (stateDir) => {
  try {
    const at = Date.parse(JSON.parse(readFileSync(join(stateDir, QUESTIONS_FILE), "utf8")).startedAt)
    return Number.isFinite(at) ? at : 0
  } catch {
    return 0
  }
}

/** The time of the newest comment of a kind in epoch milliseconds, or 0 when no comment has that kind. */
const newestOf = (comments, kind) => Math.max(0, ...comments.filter((entry) => entry.kind === kind).map((entry) => Date.parse(entry.createdAt)).filter(Number.isFinite))

/**
 * The time of the newest `owner-answer` comment of the owner on a ticket, in epoch milliseconds, or 0 when the owner gave none.
 * An order that used its launches starts again after this time: the owner decided what to change.
 */
const ownerDecisionAt = (env, ticket) => {
  const owner = env.config.tickets.repository.split("/")[0]
  return newestOf(ticket.comments.filter((entry) => entry.author === owner), "owner-answer")
}

/**
 * True while a pull request with no open ticket waits on the owner: no `owner-answer` comment of the owner follows its newest
 * `needs-owner` report. The driver labels no open pull request, so the report is the hold. The pull request is public, so only an
 * answer from the owner of the ticket repository ends it.
 */
const heldByReport = (env, pull, ticket) => {
  if (ticket) return false
  const owner = env.config.tickets.repository.split("/")[0]
  return newestOf(pull.comments, "needs-owner") > newestOf(pull.comments.filter((entry) => entry.author === owner), "owner-answer")
}

/** The held items with a `needs-owner` report newer than `since`: each one with `needs:owner`, and each pull request that its report holds. A pull request counts the reports on the ticket that it tracks. */
const heldWithNewReport = (env, tickets, states, since) => {
  const held = tickets.filter((ticket) => ticket.labels.includes(OWNER)).map((ticket) => ({ item: `ticket#${ticket.number}`, at: newestOf(ticket.comments, "needs-owner") }))
  for (const state of states) {
    for (const pull of state.pulls) {
      const tracked = tickets.find((ticket) => ticket.number === pull.tracks)
      if (!pull.labels.includes(OWNER) && !heldByReport(env, pull, tracked)) continue
      held.push({ item: `${state.repositoryKey}#${pull.number}`, at: newestOf([...pull.comments, ...(tracked?.comments ?? [])], "needs-owner") })
    }
  }
  return held.filter((entry) => entry.at > since).map((entry) => entry.item)
}

/** The sleep state of the owner: `on` while `sleep.json` says so. The owner session writes the file with `--sleep on` and `--sleep off`. */
export const readSleep = (stateDir) => {
  try {
    const saved = JSON.parse(readFileSync(join(stateDir, SLEEP_FILE), "utf8"))
    return { on: saved.on === true, since: typeof saved.since === "string" ? saved.since : null }
  } catch {
    return { on: false, since: null }
  }
}

const readSleepItems = (stateDir) => {
  try {
    const saved = JSON.parse(readFileSync(join(stateDir, SLEEP_ITEMS_FILE), "utf8"))
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

const oneLine = (text) => text.replace(/\s+/g, " ").trim()

const cut = (text, limit) => {
  const line = oneLine(text)
  // A cut can split an emoji, and `osascript` refuses the half that is left.
  return line.length <= limit ? line : `${line.slice(0, limit - 3).toWellFormed()}...`
}

const clock = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`

/** The keys of the notices that went out (`sent`) or that sleep logged (`held`), and the texts that Telegram did not take yet (`pending`). */
const readNotices = (stateDir) => {
  try {
    const saved = JSON.parse(readFileSync(join(stateDir, NOTICES_FILE), "utf8"))
    return { sent: saved.sent ?? [], held: saved.held ?? [], pending: saved.pending ?? [] }
  } catch {
    return { sent: [], held: [], pending: [] }
  }
}

const writeNotices = (stateDir, notices) => writeFileSync(join(stateDir, NOTICES_FILE), `${JSON.stringify(notices)}\n`)

const withKey = (keys, key) => [...keys, key].slice(-NOTICE_KEYS_KEPT)

/** Drops the key of a notice when its cause ends, so the driver tells the owner again when the cause comes back. */
const forget = (env, key) => {
  if (env.dryRun) return
  const notices = readNotices(env.stateDir)
  if (!notices.sent.includes(key) && !notices.held.includes(key)) return
  writeNotices(env.stateDir, { ...notices, sent: notices.sent.filter((entry) => entry !== key), held: notices.held.filter((entry) => entry !== key) })
}

/** Sends one text to the phone, or to the Mac when a Telegram Keychain item is missing, and logs one line. False: Telegram did not take it. */
const deliver = async (env, text) => {
  const result = await sendTelegram(text, { keychain: env.keychain, fetch: env.fetch })
  if (result.status === "failed") {
    log(env, "notice", "unsent", `Telegram: ${result.reason}. A later tick sends it again: ${oneLine(text)}`)
    return false
  }
  if (result.status === "unset") await env.osascript(text)
  log(env, "notice", "sent", `${result.status === "unset" ? `osascript, the Keychain item ${result.missing} is missing` : "telegram"}: ${oneLine(text)}`)
  return true
}

/**
 * Sends one notice, except while sleep is on: then the driver logs it and sends nothing. `key` names the item, the head and
 * the cause, and one key goes out once. A notice that Telegram does not take shows on the Mac and waits for a later tick.
 */
const say = async (env, { key = null, lines, link = null }) => {
  const text = [...lines, link].filter(Boolean).join("\n")
  const asleep = readSleep(env.stateDir).on
  const known = readNotices(env.stateDir)
  if (key !== null && (known.sent.includes(key) || (asleep && known.held.includes(key)))) return
  if (asleep) {
    if (key !== null) writeNotices(env.stateDir, { ...known, held: withKey(known.held, key) })
    return log(env, "sleep", "held", oneLine(text))
  }
  const taken = await deliver(env, text)
  if (!taken) await env.osascript(text)
  writeNotices(env.stateDir, { ...known, sent: key === null ? known.sent : withKey(known.sent, key), pending: taken ? known.pending : [...known.pending, text].slice(-NOTICE_PENDING_KEPT) })
}

/** Sends again, oldest first, each notice that Telegram did not take. The first refusal ends the pass and moves that notice to the back. */
const sendPending = async (env) => {
  if (env.dryRun || readSleep(env.stateDir).on) return
  const notices = readNotices(env.stateDir)
  let pending = notices.pending
  while (pending.length > 0) {
    const [text, ...rest] = pending
    const taken = await deliver(env, text)
    pending = taken ? rest : [...rest, text]
    writeNotices(env.stateDir, { ...notices, pending })
    if (!taken) return
  }
}

/** While sleep is on, keeps one `needs:owner` item with its link for the notification that sleep off sends. Awake, it keeps nothing. */
const holdItem = (env, { link, reason }) => {
  if (env.dryRun || !readSleep(env.stateDir).on) return
  const items = readSleepItems(env.stateDir)
  if (items.some((item) => item.link === link && item.reason === reason)) return
  writeFileSync(join(env.stateDir, SLEEP_ITEMS_FILE), `${JSON.stringify([...items, { link, reason }])}\n`)
}

const issueLink = (env, number) => `https://github.com/${env.slugOf("tickets")}/issues/${number}`

/**
 * Opens the `needs:owner` issue of a driver problem, then sends its notice with the link of the issue. A create that fails
 * still sends the notice, with no link.
 */
const openProblem = async (env, { title, body, notice }) => {
  let link = null
  try {
    const created = await env.github.createTicket({ title, body, labels: [OWNER] })
    link = issueLink(env, created.number)
    holdItem(env, { link, reason: title })
    return created
  } finally {
    await say(env, { ...notice, link })
  }
}

/** The one message of the items held during a sleep. The reasons shrink to fit the message limit, and every listed link stays whole. */
const sleepSummary = (items) => {
  const head = `Orbit: sleep ended. ${items.length} ${items.length === 1 ? "item needs" : "items need"} you.`
  const entry = (item, limit) => `${cut(item.reason.replace(HEAD_IN_REASON, ""), limit)}\n${item.link}`
  const limit = SLEEP_REASON_LIMITS.find((size) => [head, ...items.map((item) => entry(item, size))].join("\n").length <= MESSAGE_LIMIT) ?? SLEEP_REASON_LIMITS.at(-1)
  const lines = [head]
  for (const [index, item] of items.entries()) {
    const rest = `And ${items.length - index} more. Run /driver to see them.`
    const after = index === items.length - 1 ? [] : [rest]
    if ([...lines, entry(item, limit), ...after].join("\n").length > MESSAGE_LIMIT) return [...lines, rest].join("\n")
    lines.push(entry(item, limit))
  }
  return lines.join("\n")
}

/** After `--sleep off`: one notification that lists every item held during the sleep, each with its link, then the list is empty. */
const reportSleep = async (env) => {
  const sleep = readSleep(env.stateDir)
  if (sleep.on) return log(env, "sleep", "on", `since ${sleep.since}: no notification, ${readSleepItems(env.stateDir).length} held`)
  if (env.dryRun) return
  const items = readSleepItems(env.stateDir)
  if (items.length === 0) return
  log(env, "sleep", "ended", `${items.length} ${items.length === 1 ? "item needs" : "items need"} the owner`)
  await say(env, { lines: [sleepSummary(items)] })
  writeFileSync(join(env.stateDir, SLEEP_ITEMS_FILE), "[]\n")
}

/** Writes `sleep.json` for `--sleep on` or `--sleep off` and prints the state it reads back. */
/** The owner's pace setting: the accounts whose weekly pace is off. A missing or unreadable file keeps the pace on for both. */
export const readUnpaced = (stateDir) => {
  try {
    const saved = JSON.parse(readFileSync(join(stateDir, PACE_SETTING_FILE), "utf8"))
    return ACCOUNT_NAMES.filter((name) => saved?.[name]?.paced === false)
  } catch {
    return []
  }
}

/** Writes the pace setting of one account and keeps the other account's. */
export const setPace = (env, name, word, { out }) => {
  const unpaced = new Set(readUnpaced(env.stateDir))
  if (word === "off") unpaced.add(name)
  else unpaced.delete(name)
  writeFileSync(join(env.stateDir, PACE_SETTING_FILE), `${JSON.stringify(Object.fromEntries(ACCOUNT_NAMES.map((account) => [account, { paced: !unpaced.has(account) }])))}\n`)
  const off = readUnpaced(env.stateDir).includes(name)
  out(off ? `The ${name} account runs ${MAX_WORKERS} workers with no weekly pace until a worker ends on its usage limit.` : `The ${name} account follows the weekly pace.`)
  return off === (word === "off") ? 0 : 3
}

export const setSleep = (env, word, { out }) => {
  const before = readSleep(env.stateDir)
  writeFileSync(join(env.stateDir, SLEEP_FILE), `${JSON.stringify({ on: word === "on", since: word === "on" && before.on ? before.since : new Date(env.now()).toISOString() })}\n`)
  const after = readSleep(env.stateDir)
  const held = readSleepItems(env.stateDir).length
  out(after.on ? `Sleep is on since ${after.since}. The driver sends no notification and keeps working.` : `Sleep is off. The driver sends one notification for ${held} held ${held === 1 ? "item" : "items"} on its next tick.`)
  return after.on === (word === "on") ? 0 : 3
}

/**
 * Writes one `needs-owner` comment, labels the ticket `needs:owner` when it lacks it, and notifies. A label change on an open pull request starts its checks again, so the pull request keeps its labels.
 * The comment is the mark that stops a repeat: a ticket that an owner gate already labelled still gets each new report.
 * A ticket repeats only for the same reason, and a pull request report names it and its head. With no ticket, one report only, and that report holds the pull request (`heldByReport`).
 * A `relabel` report restores a removed label and writes no comment and sends no notification.
 */
const needsOwner = async (env, mem, { ticket, repoKey = null, pull = null, reason: plainReason, relabel = false }) => {
  const item = pull ? `${repoKey}#${pull.number}` : `ticket#${ticket.number}`
  const reason = ticket && pull ? `${item} at ${pull.headSha}: ${plainReason}` : plainReason
  log(env, item, "needs-owner", reason)
  const comments = ticket ? ticket.comments : pull.comments
  // A report from before the owner decision is answered, so the same reason after the decision is a new report.
  const decidedAt = ticket ? ownerDecisionAt(env, ticket) : 0
  const reported = comments.some((entry) => entry.kind === "needs-owner" && !(Date.parse(entry.createdAt) <= decidedAt) && (ticket === null || bodyAfterMarker(entry).trim() === reason))
  if (env.dryRun || (reported && !relabel)) return
  if (ticket && !ticket.labels.includes(OWNER)) {
    await env.github.editLabels("tickets", ticket.number, { add: [OWNER] })
    ticket.labels.push(OWNER)
  }
  if (reported) return
  await env.github.comment(ticket ? "tickets" : repoKey, ticket ? ticket.number : pull.number, marked("needs-owner", reason))
  comments.push({ kind: "needs-owner", body: marked("needs-owner", reason), createdAt: new Date(env.now()).toISOString() })
  const link = ticket ? issueLink(env, ticket.number) : `https://github.com/${env.slugOf(repoKey)}/pull/${pull.number}`
  holdItem(env, { link, reason })
  await say(env, { key: `needs-owner ${item} ${pull?.headSha ?? ""} ${plainReason}`, lines: [`Orbit needs you: ${cut(ticket?.title || item, TITLE_LIMIT)}`, cut(plainReason, DETAIL_LIMIT)], link })
}

const PACE_FILE = "pace.json"

/** What the pace file keeps for one account. */
const savedAccount = (state) => ({ account: state.account?.key ?? null, lastProbeAt: state.lastProbeAt, reading: state.reading, stoppedUntil: state.stoppedUntil })

/**
 * Keeps the newest reading, the time of the last probe and the usage-limit stop of each account beside the pid files, so a restart
 * neither probes again inside the hour nor forgets the week. The main account fills the top level, the worker account `worker`.
 */
const savePace = (env, mem) => {
  if (env.dryRun || !mem.paceLoaded) return
  const worker = mem.worker.account === null ? mem.saved?.worker ?? null : savedAccount(mem.worker)
  writeFileSync(join(env.stateDir, PACE_FILE), `${JSON.stringify({ ...savedAccount(mem), worker })}\n`)
}

/** Makes a reading the newest of the logged-in account that took it and saves the pace. A reading of another account is dropped. */
const setReading = (env, mem, reading) => {
  const name = knownAccounts(mem).find((candidate) => stateOf(mem, candidate).account.key === reading.account)
  if (name === undefined) return
  stateOf(mem, name).reading = reading
  savePace(env, mem)
  forget(env, `probe ${name}`)
}

/** Loads the saved pace once after a start, and only when the account that saved it is the account that is logged in. */
const loadPace = (env, mem) => {
  if (mem.paceLoaded) return
  mem.paceLoaded = true
  try {
    mem.saved = JSON.parse(readFileSync(join(env.stateDir, PACE_FILE), "utf8"))
  } catch { /* a first start has no file */ }
  adoptSaved(mem.saved, mem)
}

/** Takes the saved probe time, reading and usage-limit stop of an account, when the account that saved them is this one. */
const adoptSaved = (saved, state) => {
  if (saved === null || saved === undefined || saved.account !== state.account?.key) return
  state.lastProbeAt ??= saved.lastProbeAt ?? null
  state.reading ??= saved.reading ?? null
  state.stoppedUntil ??= saved.stoppedUntil ?? null
}

const pauseIssue = (tickets) => tickets.find((ticket) => ticket.title === PAUSE_TITLE) ?? null

/** Pauses admission: a log line, a notification and one issue that holds the message and the reset time. */
const pauseDriver = async (env, mem, tickets, { source, message, reset, account = mem.account?.key ?? null }) => {
  log(env, "driver", "pause", `${source}: ${message}`)
  if (env.dryRun || pauseIssue(tickets)) return
  const created = await openProblem(env, { title: PAUSE_TITLE, body: `${source} stopped.\n\nMessage: ${message}\n\nReset time named by the message: ${reset ?? "none named"}${account === null ? "" : `\n\nAccount: ${account}`}`, notice: { lines: ["Orbit starts no new work after a usage limit or a sign-in failure.", cut(message, DETAIL_LIMIT)] } })
  tickets.push({ number: created.number, title: PAUSE_TITLE, labels: [OWNER], comments: [], blockedBy: [], body: account === null ? "" : `Account: ${account}` })
}

const pauseAccount = (issue) => /^Account: (\S+)$/m.exec(issue.body)?.[1] ?? null

/** Closes an issue that the driver opened, with the comment that says why. */
const closeIssue = async (env, tickets, issue, text) => {
  await env.github.comment("tickets", issue.number, text)
  await env.github.closeTicket(issue.number)
  tickets.splice(tickets.indexOf(issue), 1)
}

/**
 * Reads the default Claude login at the start of each tick, before any reap. A change of account drops the readings of the
 * old one and owes a probe; the saved pace loads once the account is known.
 * Returns the status, or `null` when the login cannot be read.
 */
const readAccount = async (env, mem) => {
  let status
  try {
    status = await env.authStatus()
  } catch (error) {
    log(env, "account", "unreadable", error.message)
    return null
  }
  if (status.loggedIn !== true) return status
  const account = accountFrom(status)
  if (mem.account !== null && mem.account.key !== account.key) {
    log(env, "account", "changed", `orgId ${account.orgId}, ${account.subscriptionType}`)
    mem.reading = null
    mem.lastProbeAt = null
    mem.probeOwed = true
    mem.stoppedUntil = null
  }
  mem.account = account
  loadPace(env, mem)
  return status
}

/**
 * Reads the login of the worker account (`CLAUDE_CONFIG_DIR` of the worker directory) at the start of each tick. The account is
 * absent while it is signed out, unreadable, or the same login as the main account, so a single login never counts twice. A change
 * of login drops the readings of the old one and owes a probe.
 */
const readWorkerAccount = async (env, mem) => {
  const state = mem.worker
  let status = null
  try {
    status = await env.authStatus(WORKER)
  } catch (error) {
    log(env, "account", "worker-unreadable", error.message)
  }
  const account = status?.loggedIn === true ? accountFrom(status) : null
  if (account === null || mem.account === null || account.key === mem.account.key) {
    state.account = null
    return
  }
  if (state.account !== null && state.account.key !== account.key) {
    log(env, "account", "worker-changed", `orgId ${account.orgId}, ${account.subscriptionType}`)
    Object.assign(state, createWorkerAccount())
    state.probeOwed = true
  }
  const first = state.account === null && !state.adopted
  state.account = account
  if (first) {
    state.adopted = true
    adoptSaved(mem.saved?.worker, state)
  }
}

/** The end of a usage-limit stop: the `resetsAt` of the account when it lies ahead, else one hour from now. */
const limitEnd = (env, mem, name) => {
  const resetsMs = (stateOf(mem, name).reading?.resetsAt ?? 0) * 1000
  return resetsMs > env.now() ? resetsMs : env.now() + HOUR_MS
}

/** Stops an account until `until` (epoch ms). A worker that ended on a usage limit sets it, and a probe that reads status allowed ends it early. */
const stopAccount = async (env, mem, name, until, source) => {
  const state = stateOf(mem, name)
  // A second worker that ends on the same stop tells the owner nothing new.
  const told = (state.stoppedUntil ?? 0) > env.now()
  state.stoppedUntil = until
  savePace(env, mem)
  log(env, "account", `${name}-stopped`, `${source}, no worker starts on account ${state.account.key} until ${new Date(until).toISOString()}`)
  if (!told) await say(env, { lines: [`Orbit starts no new work on the ${name} account until ${clock(until)}.`, `Cause: ${source}.`] })
}

/**
 * Acts on the login that `readAccount` read: ends a usage-limit pause that another account hit, and stops every worker
 * while the login is signed out. Returns `{ ok, reason }`: with `ok` false the tick starts no worker.
 */
const trackAccount = async (env, mem, tickets, status) => {
  if (status === null) return { ok: false, reason: "the Claude login cannot be read" }
  const loginIssue = tickets.find((ticket) => ticket.title === LOGIN_TITLE) ?? null
  if (status.loggedIn !== true) {
    log(env, "account", "logged-out", "no worker starts")
    if (!env.dryRun && loginIssue === null) {
      const created = await openProblem(env, { title: LOGIN_TITLE, body: "The default Claude login is signed out. Run claude auth login, then the driver starts workers again.", notice: { key: "login", lines: ["Orbit starts no new work: Claude is signed out on the Mac.", "Run claude auth login to start work again."] } })
      tickets.push({ number: created.number, title: LOGIN_TITLE, labels: [OWNER], comments: [], blockedBy: [], body: "" })
    }
    return { ok: false, reason: "Claude is not logged in" }
  }
  forget(env, "login")
  if (loginIssue !== null && !env.dryRun) await closeIssue(env, tickets, loginIssue, "Claude is logged in again. The driver starts workers again.")
  const paused = pauseIssue(tickets)
  if (paused !== null && pauseAccount(paused) !== null && pauseAccount(paused) !== mem.account.key) {
    log(env, "driver", "resume", "the Claude account changed")
    mem.probeOwed = true
    if (!env.dryRun) await closeIssue(env, tickets, paused, "The Claude account changed, so the pause ends. The driver probes the new account.")
  }
  return { ok: true, reason: null }
}

/** One probe. A reading with status `allowed` while the driver is paused resumes it. */
const runProbe = async (env, mem, tickets, name = MAIN) => {
  const state = stateOf(mem, name)
  const takenAt = env.now()
  state.lastProbeAt = takenAt
  savePace(env, mem)
  const reading = await env.worker.probe({ invocation: await env.invocation(undefined, name) })
  if (reading === null) {
    log(env, "pace", "probe-failed", `${name} account: no rate limit event, so the account runs 1 worker and probes again after 1 hour`)
    if (!env.dryRun) await say(env, { key: `probe ${name}`, lines: [`Orbit cannot read the weekly usage of the ${name} account.`, "It runs 1 worker and checks again in 1 hour."] })
    return null
  }
  setReading(env, mem, { utilization: reading.utilization, resetsAt: reading.resetsAt, at: takenAt, account: state.account?.key ?? null })
  state.probeOwed = false
  if ((reading.status === "allowed" || reading.status === "allowed_warning") && state.stoppedUntil !== null) {
    state.stoppedUntil = null
    savePace(env, mem)
    log(env, "account", `${name}-resume`, "the probe reads status allowed")
  }
  const paused = pauseIssue(tickets)
  if (name === MAIN && paused && (reading.status === "allowed" || reading.status === "allowed_warning")) {
    await closeIssue(env, tickets, paused, `The probe reads status allowed (${Math.round(reading.utilization * 100)} percent of the week). The driver resumes.`)
    log(env, "driver", "resume", "the probe reads status allowed")
  }
  return state.reading
}

const findPullByBranch = (states, branch) => states.flatMap((state) => state.pulls.map((pull) => ({ state, pull }))).find(({ pull }) => pull.headRef === branch)

const requestsOf = (pull) => pull.comments.filter((entry) => entry.kind === "request").map((entry) => ({ ...entry, whole: /whole diff/.test(bodyAfterMarker(entry)) })).sort((left, right) => left.createdAt.localeCompare(right.createdAt))

/** The review passes of a pull request, without the replies that Pullfrog posts to its own threads. */
const passesOf = (pull) => pull.reviews.filter(isReviewPass)

/** The commit of the newest review pass before a request. */
const commitBefore = (pull, request) => passesOf(pull).filter((entry) => entry.submittedAt < request.createdAt).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)).at(-1)?.commit

/**
 * The head that a request is for: the commit of the first review pass that answers it, whoever posted it. A request that the owner
 * session posts right after a push has no review at the new head yet, so the pass that answers it names the head. A request that no
 * pass answers is for the commit of the newest pass before it.
 */
const requestCommit = (pull, runs, request) => passesOf(pull).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)).find((pass) => answers(runs, pass, request))?.commit ?? commitBefore(pull, request)

/** The time of the first whole-diff request for each head sha, from the owner session and from the driver. */
const wholeDiffRequestTimes = (pull, runs) => {
  const times = {}
  for (const request of requestsOf(pull).filter((entry) => entry.whole)) {
    const commit = requestCommit(pull, runs, request)
    if (commit !== undefined && (times[commit] === undefined || request.createdAt < times[commit])) times[commit] = request.createdAt
  }
  return times
}

/**
 * The Pullfrog run that posted a review: a run that began before the review and still ran at it. Two runs can hold one review
 * when they overlap, and the older one is taken, so a review never counts for a request that the older run did not answer.
 * Null when no run holds it, as for a run beyond the list.
 */
const runOfReview = (runs, review) => runs
  .filter((run) => run.createdAt <= review.submittedAt && (run.status !== "completed" || run.updatedAt >= review.submittedAt))
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null

/** True when a review pass answers a request: its run began after the request. A review with no known run answers each request before it. */
const answers = (runs, pass, request) => {
  const run = runOfReview(runs, pass)
  return run === null ? pass.submittedAt > request.createdAt : run.createdAt >= request.createdAt
}

/** The requests that no review pass answers. */
const unansweredRequests = (pull, runs) => requestsOf(pull).filter((request) => !passesOf(pull).some((pass) => answers(runs, pass, request)))

/** The whole-diff requests for the head that a review pass answered. */
const answeredWholeDiffRequests = (pull, runs) => requestsOf(pull).filter((request) => request.whole && requestCommit(pull, runs, request) === pull.headSha && passesOf(pull).some((entry) => answers(runs, entry, request))).length

/** The shas of the two-parent commits of a pull request whose remerge diff is empty. */
const cleanMergesOf = async (env, repoPath, pull) => {
  const merges = pull.commits.filter((commit) => commit.parents === 2)
  if (merges.length === 0) return []
  if (!env.dryRun) await env.git(repoPath, ["fetch", "origin", `refs/pull/${pull.number}/head`])
  const clean = []
  for (const merge of merges) {
    // A commit that git cannot show is never a clean merge.
    const shown = await env.git(repoPath, ["show", "--remerge-diff", "--format=", merge.sha])
    if (shown.status === 0 && shown.stdout.trim() === "") clean.push(merge.sha)
  }
  return clean
}

/** The own diff of a commit: its change against the base, with the context lines that anchor each hunk and the content of a binary file, and with the blob ids and the line numbers left out. An empty string means the diff is unknown. */
const ownDiff = async (env, repoPath, base, sha) => {
  const shown = await env.git(repoPath, ["diff", "--no-color", "--no-ext-diff", "--binary", `origin/${base}...${sha}`])
  if (shown.status !== 0) return ""
  return shown.stdout.split("\n").filter((line) => !line.startsWith("index ")).map((line) => (line.startsWith("@@") ? "@@" : line)).join("\n").trim()
}

/** The commits of an approving review pass whose own diff equals the own diff of the head. A diff that git cannot show never matches. */
const sameDiffOf = async (env, repoPath, pull, base) => {
  const approved = [...new Set(pull.reviews.filter((review) => isReviewPass(review) && review.state === "APPROVED" && review.commit !== pull.headSha).map((review) => review.commit))].filter((sha) => pull.commits.some((commit) => commit.sha === sha))
  if (approved.length === 0) return []
  if (!env.dryRun) await env.git(repoPath, ["fetch", "origin", base, `refs/pull/${pull.number}/head`])
  const head = await ownDiff(env, repoPath, base, pull.headSha)
  if (head === "") return []
  const same = []
  for (const sha of approved) if ((await ownDiff(env, repoPath, base, sha)) === head) same.push(sha)
  return same
}

/** What the pull request waits on at its head, from the Pullfrog reviews and runs: a plain request, a whole-diff request, a fix, or nothing. */
const reviewNeed = ({ pull, ticket, fixLaunches, now, runs }) => {
  const passes = passesOf(pull)
  const atHead = passes.filter((review) => review.commit === pull.headSha).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
  const latest = atHead.at(-1) ?? null
  const sinceReview = unansweredRequests(pull, runs)
  const waiting = () => {
    const lastRequest = sinceReview.at(-1)
    const after = runs.filter((run) => Date.parse(run.createdAt) >= Date.parse(lastRequest.createdAt))
    const lastRun = after.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)
    if (lastRun && lastRun.status !== "completed") return { wait: "a Pullfrog run is in progress" }
    const missed = lastRun ? now - Date.parse(lastRun.updatedAt) >= MISSING_AFTER_RUN_MS : now - Date.parse(lastRequest.createdAt) >= MISSING_AFTER_REQUEST_MS
    if (!missed) return { wait: "waiting for the Pullfrog review" }
    return sinceReview.length === 1 ? { request: lastRequest.whole ? WHOLE_DIFF_REQUEST : PLAIN_REQUEST, why: "no review after the first request", lastRun } : { owner: "Pullfrog gave no review after two requests", lastRun }
  }
  // The first pass of a head is one pass: a pull request that owes a whole-diff pass asks for it at once, and never for a plain pass first.
  const first = needsWholeDiff(pull, { fixLaunches }) ? WHOLE_DIFF_REQUEST : PLAIN_REQUEST
  // A head that Pullfrog already reviewed gets no second plain request: its next pass is the owner's to ask for.
  const demand = (text, why) => {
    if (sinceReview.length > 0) return waiting()
    if (text === PLAIN_REQUEST && latest !== null) return { owner: "Pullfrog reviewed this head and gave no usable review", skip: "same head" }
    return { request: text, why }
  }
  const carried = latest === null ? carriedApproval(pull) : null
  if (latest === null && carried === null) return demand(first, "no Pullfrog review at this head")
  if ((latest ?? carried).state === "APPROVED") {
    const context = { wholeDiffRequests: wholeDiffRequestTimes(pull, runs), cleanMerges: pull.cleanMerges ?? [] }
    if (!needsWholeDiff(pull, { fixLaunches }) || wholeDiffApproved(pull, context)) return carried === null ? { approved: true } : { approved: true, skip: "same diff" }
    // A whole-diff pass that lacks its "Whole diff:" line gets one re-request, then the owner.
    if (answeredWholeDiffRequests(pull, runs) >= 2) return { owner: "Pullfrog answered two whole-diff requests at this head with no whole-diff review" }
    return demand(WHOLE_DIFF_REQUEST, "an approval-head pass is owed")
  }
  if (latest.state === CHANGES_REQUESTED && latest.blocking.length > 0) return { fix: latest }
  const unusable = atHead.filter((review) => review.state === "COMMENTED" || (review.state === CHANGES_REQUESTED && review.blocking.length === 0))
  if (unusable.length >= 2) return { owner: "Pullfrog gave a review with no BLOCKING comment twice at the same head" }
  return demand(PLAIN_REQUEST, "the last review at this head names no BLOCKING class")
}

/**
 * The plan for a head that has every other condition of the bar but the `pullfrog-approval` check run: one plain request, which
 * Pullfrog answers with the check-only pass. GitHub names the current head as the commit of an older review, so the review
 * state can look satisfied while the check is absent. A record comment names each request by head, so the bound is one
 * re-request, then the owner.
 */
const checkOnlyPlan = ({ pull, runs, now, request }) => {
  const record = `${CHECK_REQUEST_RECORD} ${pull.headSha}`
  const sent = pull.comments.filter((entry) => entry.kind === "record" && bodyAfterMarker(entry) === record).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const newestRun = [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)
  if (sent.length === 0) {
    if (newestRun && newestRun.status === "completed" && now - Date.parse(newestRun.updatedAt) < CHECK_SETTLE_MS) return { type: "none", reason: "the check of the last Pullfrog run is not yet on the head" }
    return { ...request(PLAIN_REQUEST), record }
  }
  const lastRequest = sent.at(-1)
  const lastRun = runs.filter((run) => Date.parse(run.createdAt) >= Date.parse(lastRequest.createdAt)).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)
  if (lastRun && lastRun.status !== "completed") return { type: "none", reason: "a Pullfrog run is in progress" }
  const missed = lastRun ? now - Date.parse(lastRun.updatedAt) >= MISSING_AFTER_RUN_MS : now - Date.parse(lastRequest.createdAt) >= MISSING_AFTER_REQUEST_MS
  if (!missed) return { type: "none", reason: "waiting for the Pullfrog check-only pass" }
  return sent.length === 1 ? { ...request(PLAIN_REQUEST), record } : { type: "needs-owner", reason: "Pullfrog gave no pullfrog-approval check after two requests at this head" }
}

/** One read for each key in a tick: every caller of a key shares the first read. `env.reads` is new at the start of each tick. */
const readOnce = (env, key, read) => {
  if (!env.reads.has(key)) env.reads.set(key, read())
  return env.reads.get(key)
}

/** The failed log of a workflow run, read once for each run in a tick. */
const failedLogText = (env, repoKey, runId) => readOnce(env, `log ${repoKey} ${runId}`, () => env.gh(["run", "view", String(runId), "--repo", env.slugOf(repoKey), "--log-failed"]))

/** The log of one job, read once for each job in a tick. */
const jobLogText = (env, repoKey, jobId) => readOnce(env, `job log ${repoKey} ${jobId}`, () => env.gh(["api", `repos/${env.slugOf(repoKey)}/actions/jobs/${jobId}/logs`]))

/**
 * The last lines of the log of one job, up to its last error. The read names the job: the tail of a run log holds only one of
 * its failed jobs, and after a rerun `gh run view --job` prints the log of the newer attempt.
 */
const failedLogLines = async (env, repoKey, jobId) => {
  try {
    const lines = (await jobLogText(env, repoKey, jobId)).split("\n")
    const lastError = lines.findLastIndex((line) => line.includes("##[error]"))
    return lines.slice(0, lastError === -1 ? lines.length : lastError + 1).slice(-120)
  } catch {
    return []
  }
}

/** The check part of a plan: a rerun, the owner, or a ci-fix order. Null when no check failed. */
const checkPlan = async (env, repoKey, pull) => {
  const failed = failedChecks(pull)
  if (failed.length === 0) return null
  const checks = []
  // One rerun comes before any launch. A check that failed for a test, not for the setup, the checkout or a gateway, is a suspect: a pass on the rerun at the same head proves a flake.
  const rerun = new Map()
  for (const check of failed) {
    const failedSteps = check.runId === null ? [] : await env.github.readFailedSteps(repoKey, check.runId, check.jobId)
    const verdict = classifyCheckFailure({ name: check.name, failedSteps })
    if (verdict === "needs-owner") return { owner: `${check.name} asks for a deployment barrier, which only the owner writes` }
    const already = pull.comments.some((entry) => entry.kind === "record" && bodyAfterMarker(entry) === `driver rerun ${check.runId}`)
    const owesRerun = check.runId !== null && !already
    const logLines = check.runId === null || (owesRerun && verdict === "rerun") ? [] : await failedLogLines(env, repoKey, check.jobId)
    const gatewayTimeout = logLines.some((line) => /HTTP 504|504 Gateway/.test(line))
    if (owesRerun) rerun.set(check.runId, [...(rerun.get(check.runId) ?? []), ...(verdict === "rerun" || gatewayTimeout ? [] : [{ name: check.name, lines: logLines.slice(-FLAKE_LOG_LINES) }])])
    else checks.push({ name: check.name, failedSteps, logLines })
  }
  return rerun.size > 0 ? { rerun: [...rerun].map(([runId, suspects]) => ({ runId, suspects })) } : { checks }
}

/**
 * The base merge that the head of a red pull request is, or null. The head is a clean merge of the base, and the newest commit
 * before the clean merges had a green rollup, so the base commits that the merge brought in broke the check, not the change.
 * Returns the green commit and the base commits as `<short sha> <subject>` lines.
 */
const baseMergeOf = async (env, repoPath, pull) => {
  const clean = pull.cleanMerges ?? []
  let index = pull.commits.length - 1
  if (index < 1 || !clean.includes(pull.commits[index].sha)) return null
  index -= 1
  // A clean merge with no rollup of its own had no check run, so the commit before it decides.
  while (index > 0 && pull.commits[index].checkState === null && clean.includes(pull.commits[index].sha)) index -= 1
  const before = pull.commits[index]
  if (before.checkState !== "SUCCESS") return null
  const listed = await env.git(repoPath, ["log", "--no-merges", "--format=%h %s", `${before.sha}..${pull.headSha}`])
  const commits = listed.status === 0 ? listed.stdout.split("\n").filter(Boolean) : []
  return commits.length === 0 ? null : { before: before.sha, commits: commits.slice(0, BASE_COMMIT_LIMIT) }
}

/** The flake records of a pull request: a suspect names its run, its check and the failed lines, a filed record closes it. */
const flakeKey = (runId, name) => `${runId} ${name}`

/** The actions that file a Bug ticket for each suspect check that passed on the rerun of the same run. */
const flakeActions = (pull) => {
  const records = pull.comments.filter((entry) => entry.kind === "record").map((entry) => bodyAfterMarker(entry))
  const filed = new Set(records.filter((text) => text.startsWith("driver flake-filed ")).map((text) => text.slice("driver flake-filed ".length)))
  const passed = passedChecks(pull)
  return records.filter((text) => text.startsWith("driver flake-suspect ")).flatMap((text) => {
    const key = firstLine(text).slice("driver flake-suspect ".length)
    const run = key.slice(0, key.indexOf(" "))
    const name = key.slice(run.length + 1)
    return !filed.has(key) && passed.some((check) => check.name === name && check.runId === run) ? [{ type: "file-flake", runId: run, name, lines: text.split("\n").slice(1).join("\n") }] : []
  })
}

/**
 * The owner comments on the ticket that follow a fix cap report of the pull request, oldest first. The cap report is the comment
 * that goes with the label. Each owner comment after it grants one more fix launch, and a later cap report asks for the next one.
 */
const capGrants = (ticket, item) => {
  const grants = []
  let capped = false
  for (const entry of [...ticket.comments].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (entry.kind === "needs-owner") capped ||= bodyAfterMarker(entry).includes(`${item} used its ${MAX_FIX_LAUNCHES} fix launches.`)
    else if (entry.kind === null && capped && partOf(entry) === null) {
      grants.push(entry)
      capped = false
    }
  }
  return grants
}

/** The ordered actions for one pull request. The plan writes nothing. */
const planPull = async (env, mem, { repoKey, state, ticketMap, now, runs, running }, pull) => {
  const dependabot = pull.author === "dependabot"
  const item = `${repoKey}#${pull.number}`
  if (pull.draft) return [{ type: "none", reason: "draft" }]
  if (pull.tracks === null && !dependabot) return [{ type: "none", reason: "untracked: no Tracks line" }]
  const ticket = pull.tracks === null ? null : ticketMap.get(pull.tracks) ?? null
  const blockers = ticket?.blockedBy.filter((blocker) => blocker.open).map((blocker) => blocker.number) ?? []
  if (blockers.length > 0) return [{ type: "none", reason: `blocked by ${blockers.join(", ")}` }]
  // A worker that runs on the branch pushes more commits, so a review, an update or a merge at the current head answers a head that changes.
  if (running.branches.has(pull.headRef)) return [{ type: "none", reason: "a worker runs on the branch" }]
  const hasTicketComment = pull.comments.some((entry) => entry.kind === "ticket")
  // A second run on one head costs a full review and answers nothing new, so no request goes out while a run for the pull request is queued or in progress.
  const runBusy = runs.some((run) => run.status !== "completed")
  const request = (text) => (runBusy ? { type: "none", reason: "a Pullfrog run is in progress" } : { type: "request", text, ticketComment: !dependabot && ticket !== null && !hasTicketComment })
  if (pull.baseRef !== state.defaultBranch && !state.pulls.some((other) => other.headRef === pull.baseRef)) {
    return [{ type: "retarget", base: state.defaultBranch }, { type: "update" }, request(PLAIN_REQUEST)]
  }
  const launches = launchesOf(ticket).filter((entry) => entry.branch === pull.headRef && FIX_KINDS.includes(entry.kind))
  // A ci-fix launch for a base merge is no fault of the change, so the cap does not count it. Its mark holds the head it ran at.
  const counted = launches.filter((entry) => !entry.baseMerge)
  const actions = flakeActions(pull)
  const owner = (reason) => [...actions, { type: "needs-owner", reason }]
  const orderOrOwner = (order, classes) => {
    // A worker order is recorded on a ticket, so a pull request with no open ticket goes to the owner.
    if (ticket === null) return owner(`${item} needs a ${order.kind} order and no open ticket tracks it. Open: ${classes}`)
    // An owner comment after a cap report grants one more launch, and that launch carries the comment.
    // The free launch runs once for each head, so a worker that pushes nothing meets the cap at its next launch.
    if (order.failure?.baseMerge && !launches.some((entry) => entry.baseMerge === pull.headSha)) return [...actions, { ...order, baseMergeHead: pull.headSha }]
    const grants = capGrants(ticket, item)
    if (counted.length < MAX_FIX_LAUNCHES + grants.length) return [...actions, counted.length < MAX_FIX_LAUNCHES ? order : { ...order, ownerNote: grants[counted.length - MAX_FIX_LAUNCHES].body }]
    // A launch that still runs is in the count, so a cap is read only when no worker runs on the branch and the last launch has its result.
    if (running.branches.has(pull.headRef)) return [...actions, { type: "none", reason: "a worker runs on the branch: the fix launch cap waits for its result" }]
    // The owner removed the label with no comment after the cap report, so the label goes back.
    return [...actions, { type: "needs-owner", reason: `${item} used its ${MAX_FIX_LAUNCHES} fix launches. Launches: ${counted.length}. Open: ${classes}`, relabel: true }]
  }
  const need = reviewNeed({ pull, ticket, fixLaunches: launches.length, now, runs })
  if (need.skip) log(env, item, `review skip (${need.skip})`)
  if (need.approved) {
    const open = pull.threads.filter((thread) => !thread.resolved && thread.author === "pullfrog")
    if (open.length > 0) {
      actions.push({ type: "resolve-threads", ids: open.map((thread) => thread.id) })
      for (const thread of open) thread.resolved = true
    }
  }
  if (need.fix) return orderOrOwner({ type: "order", kind: "fix", repoKey, pull, ticket, review: need.fix }, need.fix.blocking.map((entry) => (entry.path === null ? "the review body" : `${entry.path}:${entry.line}`)).join(", "))
  const checks = await checkPlan(env, repoKey, pull)
  if (checks?.owner) return owner(checks.owner)
  if (checks?.rerun) return [...actions, ...checks.rerun.map(({ runId, suspects }) => ({ type: "rerun", runId, suspects }))]
  if (checks?.checks) {
    const baseMerge = await baseMergeOf(env, env.config.repos[repoKey], pull)
    return orderOrOwner({ type: "order", kind: "ci-fix", repoKey, pull, ticket, failure: { checks: checks.checks, ...(baseMerge === null ? {} : { baseMerge }) } }, checks.checks.map((check) => check.name).join(", "))
  }
  if (pull.mergeState === "DIRTY") return orderOrOwner({ type: "order", kind: "merge-forward", repoKey, pull, ticket, failure: {} }, "merge conflict with the base branch")
  if (need.owner) return owner(need.owner)
  if (need.request) return [...actions, request(need.request)]
  if (need.wait) return [...actions, { type: "none", reason: need.wait }]
  const context = { fixLaunches: launches.length, wholeDiffRequests: wholeDiffRequestTimes(pull, runs), cleanMerges: pull.cleanMerges ?? [], blockers: [], ticketLabels: ticket?.labels ?? [], reportHeld: heldByReport(env, pull, ticket), updateTypes: dependabot ? await dependabotTypes(env, mem, repoKey, pull) : undefined }
  const bar = mergeBar(pull, context)
  if (dependabot && bar.includes("dependabot-major")) return owner(`Dependabot pull request ${item} is a major update`)
  if (bar.length === 0) return [...actions, { type: "merge" }]
  // Only a Pullfrog pass clears a missing approval check, and a blocked merge state follows from it, so neither is a reason to wait.
  const checkGap = bar.includes(APPROVAL_CHECK_MISSING)
  const rest = bar.filter((failure) => failure !== APPROVAL_CHECK_MISSING && !(checkGap && failure === "merge-state:BLOCKED"))
  if (checkGap && rest.length === 0) return [...actions, checkOnlyPlan({ pull, runs, now, request })]
  return [...actions, { type: "none", reason: `the bar fails: ${bar.join(", ")}` }]
}

const dependabotTypes = async (env, mem, repoKey, pull) => {
  const key = `${repoKey}#${pull.number}@${pull.headSha}`
  if (!mem.updateTypes.has(key)) mem.updateTypes.set(key, await env.github.readDependabotUpdateTypes(repoKey, pull.number))
  return mem.updateTypes.get(key)
}

/** Writes the record comments of the commits that a worker pushed. */
const recordCommits = async (env, repoKey, number, sessionId, shas) => {
  for (const sha of shas) await env.github.comment(repoKey, number, marked("record", `worker ${sessionId} -> ${sha}`))
}

const outsideTicket = async (env, repoKey, pull) => {
  const sections = sectionsOutside(pull.reviews)
  if (sections.length === 0) return
  const slug = env.slugOf(repoKey)
  await env.github.createTicket({ title: `Outside this change: ${slug}#${pull.number}`, body: `Pullfrog reported blocking-class defects outside ${slug}#${pull.number}:\n\n${sections.map((text) => `> ${text.split("\n").join("\n> ")}`).join("\n\n")}`, labels: [`repo:${repoKey}`, "Bug"] })
}

/** Merges the base branch into a pull request and records the merge commit that this makes. */
const updateBranch = async (env, repoKey, pull) => {
  await env.github.updateBranch(repoKey, pull.number)
  const head = (await env.gh(["pr", "view", String(pull.number), "--repo", env.slugOf(repoKey), "--json", "headRefOid", "--jq", ".headRefOid"])).trim()
  if (head !== pull.headSha) await env.github.comment(repoKey, pull.number, marked("record", `driver update-branch -> ${head}`))
}

/** Files one Bug ticket for a check that failed and then passed on a rerun at the same head, unless an open ticket holds it. */
const fileFlake = async (env, ctx, pull, action) => {
  const title = `Flaky check: ${action.name}`
  const slug = env.slugOf(ctx.repoKey)
  if (!ctx.tickets.some((ticket) => ticket.title === title && ticket.repoKey === ctx.repoKey) && !ctx.flaky.has(title)) {
    ctx.flaky.add(title)
    const body = `The check "${action.name}" failed on ${slug}#${pull.number} at the head \`${pull.headSha}\` and passed on a rerun of the run ${action.runId} at the same head. The test is flaky.\n\nFailed lines:\n\n\`\`\`\n${action.lines}\n\`\`\`\n\nFind the test that failed. Remove the timing or the shared state that makes it fail.`
    await env.github.createTicket({ title, body, labels: [`repo:${ctx.repoKey}`, "Bug"] })
  }
  await env.github.comment(ctx.repoKey, pull.number, marked("record", `driver flake-filed ${flakeKey(action.runId, action.name)}`))
}

const executeAction = async (env, mem, ctx, pull, action) => {
  const { repoKey, ticketMap } = ctx
  const ticket = pull.tracks === null ? null : ticketMap.get(pull.tracks) ?? null
  const part = ticket === null ? null : partsOf(ticket).find((entry) => partBranch(ticket.number, entry.number).test(pull.headRef)) ?? null
  switch (action.type) {
    case "retarget": return env.github.retarget(repoKey, pull.number, action.base)
    case "resolve-threads": return env.github.resolveThreads(action.ids)
    case "request":
      if (action.ticketComment) await env.github.comment(repoKey, pull.number, ticketComment({ repository: env.config.tickets.repository, ticket, part }))
      await env.github.comment(repoKey, pull.number, marked("request", action.text))
      mem.acted = true
      if (action.record) await env.github.comment(repoKey, pull.number, marked("record", action.record))
      return undefined
    case "rerun":
      await env.github.rerunFailed(repoKey, action.runId)
      await env.github.comment(repoKey, pull.number, marked("record", `driver rerun ${action.runId}`))
      for (const suspect of action.suspects ?? []) await env.github.comment(repoKey, pull.number, marked("record", `driver flake-suspect ${flakeKey(action.runId, suspect.name)}\n${suspect.lines.join("\n")}`))
      return undefined
    case "file-flake": return fileFlake(env, ctx, pull, action)
    case "needs-owner": return needsOwner(env, mem, { ticket, repoKey, pull, reason: action.reason, relabel: action.relabel })
    // The child still holds its parent's commits, so main is merged in before the first pass reads its diff.
    case "update": return updateBranch(env, repoKey, pull)
    case "merge":
      await env.github.merge(repoKey, pull.number, pull.headSha)
      mem.acted = true
      ctx.merged = true
      mem.merged.delete(pull.tracks)
      await outsideTicket(env, repoKey, pull)
      return undefined
    default: return undefined
  }
}

const describe = (action) => (action.type === "none" ? `wait: ${action.reason}` : action.type === "order" ? `order ${action.kind}` : action.type === "needs-owner" ? `needs:owner: ${action.reason}` : action.type === "request" ? `request ${action.text}${action.ticketComment ? " after the ticket comment" : ""}` : action.type === "update" ? "update branch (retargeted child)" : action.type)

/** True for an open pull request that the driver tracks and that does not wait on the owner: by a label of its own or of its ticket, or by its report. */
const isWaiting = (env, pull, tickets) => {
  const ticket = tickets.find((entry) => entry.number === pull.tracks)
  return !pull.draft && (pull.tracks !== null || pull.author === "dependabot") && !pull.labels.includes(OWNER) && !ticket?.labels.includes(OWNER) && !heldByReport(env, pull, ticket)
}

/** The pull requests of a repository that the plan reads: tracked or not, in number order. */
const planOrder = (state) => [...state.pulls].sort((left, right) => left.number - right.number)

/**
 * Plans every open pull request of one repository, up to `PLAN_PARALLEL` of the tick at once, and writes nothing. The
 * repository's Pullfrog runs come from one list for all its pull requests. Returns one entry for each pull request, in
 * number order: its plan and whether its failed Pullfrog runs name a usage limit, or the error that the plan met.
 */
const planPullRequests = (env, mem, repoKey, state, tickets, { running, stopped, gate, limitSeen }) => {
  const ticketMap = new Map(tickets.map((ticket) => [ticket.number, ticket]))
  // The release train builds mobile from main, so a ui merge waits while the train holds its mobile steps.
  const hold = repoKey === "ui" ? mobileMergeHold(readTrainState(env.stateDir)) : null
  const ctx = { repoKey, state, ticketMap, tickets, flaky: new Set(), now: env.now(), merged: false, running, hold }
  const repoPath = env.config.repos[repoKey]
  const planOne = async (pull) => {
    const item = `${repoKey}#${pull.number}`
    try {
      // An earlier pull request of the ticket can label it in the act step, so the act step plans again when the label is new.
      const ownerAtPlan = pull.tracks !== null && ticketMap.get(pull.tracks)?.labels.includes(OWNER) === true
      const runs = pull.draft ? [] : env.github.runsNaming(await readOnce(env, `runs ${repoKey}`, () => env.github.pullfrogRuns(repoKey).catch((error) => { noteReadError(mem, error); throw error })), pull.number)
      if (!pull.draft && (pull.reviews.some((review) => review.state === "APPROVED") || failedChecks(pull).length > 0)) pull.cleanMerges = await cleanMergesOf(env, repoPath, pull)
      if (!pull.draft) pull.sameDiffAs = await sameDiffOf(env, repoPath, pull, state.defaultBranch)
      const planAgain = async () => {
        const planned = await planPull(env, mem, { ...ctx, runs }, pull)
        const stoppedPlan = stopped ? planned.map((action) => (action.type === "request" ? { type: "none", reason: "the weekly usage stop holds Pullfrog requests" } : action)) : planned
        return hold === null ? stoppedPlan : stoppedPlan.map((action) => (action.type === "merge" ? { type: "none", held: true, reason: `merge held, release train ${hold.id} ships mobile at ${hold.sha}` } : action))
      }
      const plan = await planAgain()
      const newestRequest = requestsOf(pull).reduce((newest, entry) => (entry.createdAt > newest ? entry.createdAt : newest), "")
      // A run from before the newest request is settled history: a request that came after it started a new run.
      const limit = await readPullfrogLimit(env, mem, repoKey, runs.filter((run) => Date.parse(run.createdAt) >= Date.parse(newestRequest)))
      // The act step applies the limit only after every plan ends. This flag tells the early launch at once.
      if (limit.found) limitSeen.found = true
      return { pull, item, plan, limit, ownerAtPlan, planAgain }
    } catch (error) {
      return { pull, item, error }
    }
  }
  return { ctx, planned: Promise.all(planOrder(state).map((pull) => gate(() => planOne(pull)))) }
}

/** Runs the plans of one repository in number order. Returns the order candidates. The first merge ends the repository's turn. */
const actOnPlans = async (env, mem, { ctx, tickets, planned }) => {
  const orders = []
  for (const { pull, item, plan: planned1, limit, error, ownerAtPlan, planAgain } of planned) {
    if (error) {
      log(env, item, "error", error.message)
      continue
    }
    try {
      for (const id of limit.read) mem.checkedRuns.add(id)
      if (limit.found) await applyPullfrogLimit(env, mem, tickets, ctx.repoKey, limit.found)
      // A plan writes nothing, so a second plan against the label that an earlier pull request set is safe.
      // The first plan marked the threads resolved in memory, so its resolve step stays.
      const labelled = !ownerAtPlan && pull.tracks !== null && ctx.ticketMap.get(pull.tracks)?.labels.includes(OWNER) === true
      const plan = labelled ? [...planned1.filter((action) => action.type === "resolve-threads"), ...await planAgain()] : planned1
      const mergeHeld = plan.some((action) => action.held)
      if (mergeHeld) log(env, item, "merge held", `release train ${ctx.hold.id} ships mobile at ${ctx.hold.sha}`)
      env.lines.push(`pull ${item}: ${plan.map(describe).join("; ")}${limit.found ? " (Pullfrog hit a usage limit)" : ""}`)
      try {
        for (const action of plan) {
          if (action.type === "order") orders.push(action)
          else if (action.type !== "none") {
            log(env, item, describe(action))
            if (!env.dryRun) await executeAction(env, mem, ctx, pull, action)
          }
          if (ctx.merged) break
        }
      } finally {
        // Read after the actions, so a hold that this tick wrote counts. The finally block keeps a pull request whose action throws on the stall clock.
        // A merge that the release train holds on purpose is a chosen hold, so it stays off the stall clock.
        if (!mergeHeld && isWaiting(env, pull, tickets)) mem.waiting.push(`${item}: ${plan.map(describe).join("; ")}`)
      }
    } catch (failure) {
      log(env, item, "error", failure.message)
    }
    if (ctx.merged) break
  }
  return orders
}

/** Plans the pull requests of every repository at the same time, then runs their actions one repository after another. Never rejects. */
const pullActions = async (env, mem, states, tickets, { running, stopped, limitSeen }) => {
  const gate = createGate(PLAN_PARALLEL)
  const plans = states.map((state) => ({ ...planPullRequests(env, mem, state.repositoryKey, state, tickets, { running, stopped, gate, limitSeen }), tickets }))
  const orders = []
  for (const plan of plans) orders.push(...await actOnPlans(env, mem, { ...plan, planned: await plan.planned }))
  return orders
}

/** A function that runs at most `limit` tasks at once and queues the rest in order. */
const createGate = (limit) => {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= limit || queue.length === 0) return
    active += 1
    const { task, resolve, reject } = queue.shift()
    task().then(resolve, reject).finally(() => { active -= 1; next() })
  }
  return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next() })
}

/** True when the promise settles within `ms`. */
const settledWithin = async (promise, ms) => {
  let timer
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms) })
  try { return await Promise.race([promise.then(() => true, () => true), timeout]) } finally { clearTimeout(timer) }
}

/**
 * Reads the failed Pullfrog runs that no earlier tick read, until one log names a usage limit. Writes nothing: `read` lists the
 * run ids that were read and `found` is the limit that a log named, or null. The act step marks the runs and pauses.
 */
const readPullfrogLimit = async (env, mem, repoKey, runs) => {
  const read = []
  for (const run of runs.filter((entry) => entry.status === "completed" && entry.conclusion === "failure" && !mem.checkedRuns.has(entry.databaseId))) {
    let logText
    try {
      logText = await failedLogText(env, repoKey, run.databaseId)
    } catch (error) {
      // A log that was not read is read again on the next tick: only a read log marks its run as checked.
      log(env, repoKey, "pullfrog-log-unread", error.message)
      continue
    }
    read.push(run.databaseId)
    // A run that stops at a limit ends on the message. Text that the run only read or echoed sits far before the end.
    const found = workerApi.usageLimitIn(logText.split("\n").slice(-PULLFROG_LOG_END_LINES).join("\n"))
    if (found) return { read, found }
  }
  return { read, found: null }
}

/** A usage limit in a Pullfrog log stops the account that Pullfrog runs on, or pauses the driver. */
const applyPullfrogLimit = async (env, mem, tickets, repoKey, found) => {
  // Pullfrog runs on the main account. With a second account only the main account stops, and the worker account keeps its slots.
  if (knownAccounts(mem).length > 1) {
    log(env, repoKey, "pullfrog-limit", found.message)
    if (!env.dryRun) await stopAccount(env, mem, MAIN, limitEnd(env, mem, MAIN), "Pullfrog hit a usage limit")
  } else await pauseDriver(env, mem, tickets, { source: "Pullfrog", ...found })
}

const gitText = async (env, cwd, args) => {
  const result = await env.git(cwd, args)
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

/** The path of the worktree of an order, read without a change: the listed worktree of the branch, or the path that a build order adds. */
const worktreePathOf = async (env, repoKey, branch) => {
  const repoPath = env.config.repos[repoKey]
  const listed = parseWorktreeList(await gitText(env, repoPath, ["worktree", "list", "--porcelain"])).find((entry) => entry.branch === branch)
  return { listed: listed !== undefined, path: listed?.path ?? join(dirname(repoPath), "orbit-worktrees", repoKey, branch.replaceAll("/", "-")) }
}

/** The worktree of an order: a build order adds one from `origin/main`, the rest reuse the pull request's. */
const prepareWorktree = async (env, repoKey, branch, fresh, place) => {
  const repoPath = env.config.repos[repoKey]
  const { listed, path } = place
  if (listed) {
    if (!fresh) {
      await gitText(env, path, ["fetch", "origin", branch])
      await gitText(env, path, ["merge", "--ff-only", `origin/${branch}`])
    }
    return path
  }
  if (fresh) {
    await gitText(env, repoPath, ["fetch", "origin", "main"])
    await gitText(env, repoPath, ["worktree", "add", "-b", branch, path, "origin/main"])
  } else {
    await gitText(env, repoPath, ["fetch", "origin", branch])
    const local = (await env.git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).status === 0
    await gitText(env, repoPath, local ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, `origin/${branch}`])
    if (local) await gitText(env, path, ["merge", "--ff-only", `origin/${branch}`])
  }
  return path
}

const ticketForOrder = (env, ticket, extra = "") => ({ number: ticket.number, title: ticket.title, body: extra === "" ? ticket.body : `${ticket.body.trim()}\n\n${extra}`, repository: env.config.tickets.repository })

/** Starts one worker for an order and records its launch on the ticket first, so a crash still counts. Returns null when the worker started, else the reason it did not. */
const startWorker = async (env, mem, candidate, accountName = MAIN) => {
  const order = { ...candidate, branch: candidate.branch ?? candidate.pull.headRef }
  const { kind, repoKey, ticket, pull = null, part = null, branch, extra = "" } = order
  const token = await env.worker.readWorkerToken()
  if (token === null) {
    await say(env, { key: "worker-token", lines: ["Orbit cannot start work.", "The Keychain item orbit-worker-github-token is missing on the Mac."] })
    log(env, `ticket#${ticket.number}`, "refused", "no worker token in the Keychain")
    return "no worker token in the Keychain"
  }
  forget(env, "worker-token")
  const location = await worktreePathOf(env, repoKey, branch)
  // A second process in one worktree races the first on its files and its commits, so the launch waits for the next tick.
  const occupants = env.worker.worktreeOccupants(location.path, { stateDirectory: env.stateDir })
  if (occupants.length > 0) {
    const reason = `another process holds the worktree ${location.path}: pid ${occupants.join(", ")}`
    log(env, `ticket#${ticket.number}`, "wait", reason)
    return reason
  }
  const baseMergeMark = order.baseMergeHead ? { baseMerge: order.baseMergeHead } : {}
  await env.github.comment("tickets", ticket.number, marked("launch", JSON.stringify({ kind, part: part?.number ?? null, branch, pr: pull?.number ?? null, ...baseMergeMark, at: new Date(env.now()).toISOString() })))
  ticket.comments.push({ kind: "launch", body: marked("launch", JSON.stringify({ kind, part: part?.number ?? null, branch, pr: pull?.number ?? null, ...baseMergeMark })), createdAt: new Date(env.now()).toISOString() })
  const worktree = await prepareWorktree(env, repoKey, branch, pull === null, location)
  const headBefore = await gitText(env, worktree, ["rev-parse", "HEAD"])
  const stem = branch.replaceAll("/", "-")
  const place = { repoKey, repoPath: env.config.repos[repoKey], worktree, branch, base: "main" }
  const text = renderOrder({ kind, ticket: ticketForOrder(env, ticket, extra), partComments: ticket.comments.filter((entry) => entry.kind === null), findings: kind === "build part" ? ticket.comments.filter((entry) => entry.kind === "findings") : [], pull, review: order.review, failure: order.failure, ownerNote: order.ownerNote ?? null, place, partNumber: part?.number ?? null })
  const stamp = new Date(env.now()).toISOString().replace(/[:.]/g, "-")
  const logFile = join(env.stateDir, "logs", `${stem}-${stamp}.log`)
  // The GitHub hook of the worker lets it edit only the pull request of this branch, from this worktree.
  const invocation = await env.invocation(token, accountName, { worktree, branch })
  const account = stateOf(mem, accountName).account?.key ?? null
  // The worker writes its rate limit event right after its first message, so the reading belongs to the launch time.
  const startedAt = env.now()
  // What a reap needs lives on disk beside the pid file, so a worker that outlives a restart of the driver is still reaped.
  writeFileSync(launchRecordPath(env, stem), `${JSON.stringify({ kind, repoKey, ticketNumber: ticket.number, partNumber: part?.number ?? null, branch, prNumber: pull?.number ?? null, worktree, headBefore, logFile, account, startedAt })}\n`)
  const running = env.worker.launch({ invocation, worktree, order: text, logFile, pidFile: join(env.stateDir, `${stem}.pid`) })
  log(env, `ticket#${ticket.number}`, `launch ${kind}`, `branch ${branch}, worktree ${worktree}`)
  mem.running.set(stem, running.then((result) => {
    mem.running.delete(stem)
    mem.results.set(stem, result)
    mem.woken = true
    mem.wake()
  }))
  return null
}

const FORBIDDEN_PUSH = /The requested URL returned error: 403|remote: Permission to .* denied/

const GIT_PUSH = /\bgit\b[^|;&\n]*\bpush\b/

const toolText = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.map((block) => (typeof block?.text === "string" ? block.text : "")).join("\n") : "")

/** The output of every `git push` command in a stream-json log. Text that the worker read or wrote elsewhere never counts. */
export const pushOutputs = (logText) => {
  const pushes = new Set()
  const outputs = []
  for (const line of logText.split("\n")) {
    if (!line.startsWith("{")) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    for (const block of Array.isArray(record.message?.content) ? record.message.content : []) {
      if (block.type === "tool_use" && block.name === "Bash" && GIT_PUSH.test(block.input?.command ?? "")) pushes.add(block.id)
      if (block.type === "tool_result" && pushes.has(block.tool_use_id)) outputs.push(toolText(block.content))
    }
  }
  return outputs
}

/** True when the worktree holds commits since the launch that the remote branch lacks. Only such a push can have failed. */
const hasUnpushedCommits = async (env, worktree, branch, headBefore) => {
  const head = await gitText(env, worktree, ["rev-parse", "HEAD"])
  if (head === headBefore) return false
  const remote = await env.git(worktree, ["ls-remote", "origin", `refs/heads/${branch}`])
  if (remote.status !== 0) return false
  const remoteHead = remote.stdout.split(/\s/)[0]
  if (remoteHead === "") return true
  if (remoteHead === head) return false
  await env.git(worktree, ["fetch", "origin", branch])
  return (await env.git(worktree, ["merge-base", "--is-ancestor", head, `origin/${branch}`])).status !== 0
}

/** A push failed with HTTP 403 when a `git push` command printed the message and its commits are not on the remote branch. */
const pushForbidden = async (env, tail, worktree, branch, headBefore) => pushOutputs(tail).some((text) => FORBIDDEN_PUSH.test(text)) && await hasUnpushedCommits(env, worktree, branch, headBefore)

const launchRecordPath = (env, stem) => join(env.stateDir, `${stem}.launch.json`)
const RECORD_SUFFIX = ".launch.json"

/** The launch records on disk, each with the stem of its branch. */
const launchRecords = (env) => readdirSync(env.stateDir).filter((name) => name.endsWith(RECORD_SUFFIX)).flatMap((name) => {
  try { return [{ stem: name.slice(0, -RECORD_SUFFIX.length), record: JSON.parse(readFileSync(join(env.stateDir, name), "utf8")) }] } catch { return [] }
})

/** True while the worker of a record runs: this process started it and holds its promise, or its pid file names a live process. */
const workerRuns = (env, mem, stem) => mem.running.has(stem) || pidFileOf(env, stem) !== null

/** The workers that run now, from their launch records, and the branches they work on. A pid file with no record names no worker, because a launch writes its record first. */
const runningWorkers = (env, mem) => {
  const workers = launchRecords(env).filter(({ stem }) => workerRuns(env, mem, stem))
  return { workers, branches: new Set(workers.map(({ record }) => record.branch)) }
}

/** The pid file of a worker whose process is alive, or null. A pid file whose pid names another program is a stale file, not a worker. */
const pidFileOf = (env, stem) => {
  try {
    const file = JSON.parse(readFileSync(join(env.stateDir, `${stem}.pid`), "utf8"))
    return env.processAlive(file.pid) ? file : null
  } catch {
    return null
  }
}

/**
 * A worker that this process did not start has no timer here, so each tick checks its three clocks from its pid file, its
 * launch record and its log: the hard ceiling, the log cap and the no-progress window. It gets SIGTERM at a clock and
 * SIGKILL on the next tick if it still lives. The reap then reads its log and counts the launch.
 */
const enforceOrphanClocks = async (env, mem) => {
  if (env.dryRun) return
  for (const { stem, record } of launchRecords(env)) {
    if (mem.running.has(stem)) continue
    const file = pidFileOf(env, stem)
    if (file === null) continue
    try {
      const entry = mem.orphans.get(stem) ?? { watch: env.worker.progressWatch({ worktree: record.worktree, logFile: record.logFile, startedAt: env.now(), clock: { now: env.now } }), reason: null }
      mem.orphans.set(stem, entry)
      if (entry.reason !== null) { env.worker.killWorkerTree(file.pid, "SIGKILL"); continue }
      const reason = env.now() - Date.parse(file.startedAt) >= env.worker.WORKER_LIMITS.hardCeilingMs ? "hard-ceiling" : await entry.watch()
      if (reason === null) continue
      entry.reason = reason
      log(env, `ticket#${record.ticketNumber}`, "kill", `a worker that this process did not start ${env.worker.KILL_REASONS[reason]}: ${record.branch}`)
      env.worker.killWorkerTree(file.pid, "SIGTERM")
    } catch (error) {
      log(env, `ticket#${record.ticketNumber}`, "error", error.message)
    }
  }
}

/**
 * Marks the account of a worker that ended on a usage limit (or a sign-in failure) as stopped, and takes the launch back so the
 * order starts again on the other account without a count toward its cap. A limit lasts until the `resetsAt` of the account;
 * a sign-in failure or an unknown reset lasts one hour.
 */
const stopAndRefund = async (env, mem, ticket, exit, result) => {
  const { kind, branch, partNumber, prNumber, account } = exit
  const name = nameOfKey(mem, account)
  const until = result.result.usageLimitReached ? limitEnd(env, mem, name) : env.now() + HOUR_MS
  await stopAccount(env, mem, name, until, result.result.usageLimitReached ? "a worker hit a usage limit" : "a worker sign-in failed")
  const body = marked("launch-refund", JSON.stringify({ kind, part: partNumber, branch, pr: prNumber }))
  await env.github.comment("tickets", ticket.number, body)
  ticket.comments.push({ kind: "launch-refund", body, createdAt: new Date(env.now()).toISOString() })
  log(env, `ticket#${ticket.number}`, "launch-refund", `${kind} on ${branch} starts again on the other account`)
}

/** The exit of a worker that this process did not wait for: the session, the reading and the verdict that its log holds. */
const exitFromLog = (logFile) => ({ spawnError: null, exitCode: null, killed: null, killReason: null, ...workerApi.logEvent(logFile), result: workerApi.logFinalResult(logFile) })

/** What a worker's exit leaves to do: records, a pause, a question, or a findings comment. */
const reapExit = async (env, mem, tickets, states, exit) => {
  const { kind, repoKey, branch, partNumber, prNumber, headBefore, worktree, logFile, account, startedAt, result } = exit
  // The ticket as this read holds it, so a label that the owner wrote is seen. A ticket that is closed by now keeps a bare stand-in.
  const ticket = tickets.find((entry) => entry.number === exit.ticketNumber) ?? { number: exit.ticketNumber, title: "", body: "", labels: [], comments: [], blockedBy: [] }
  const item = `ticket#${ticket.number}`
  const own = stateOf(mem, nameOfKey(mem, account))
  const newerReading = own.reading?.account === account && own.reading.at > startedAt
  if (result.utilization !== null && account !== null && !newerReading) setReading(env, mem, { utilization: result.utilization, resetsAt: result.resetsAt, at: startedAt, account })
  log(env, item, "worker-exit", `${kind}, exit ${result.exitCode}${result.killReason ? `, killed: ${result.killReason}` : ""}`)
  const tail = tailOf(logFile)
  if (result.result.usageLimitReached || result.result.authenticationFailed) {
    const message = result.result.error ?? "the worker stopped"
    // With a second account the stopped account waits and the order starts again on the other one. A lone account pauses the driver.
    if (knownAccounts(mem).length > 1 && account !== null) return stopAndRefund(env, mem, ticket, exit, result)
    return pauseDriver(env, mem, tickets, { source: result.result.usageLimitReached ? "A worker" : "A worker sign-in", message, reset: workerApi.usageLimitIn(message)?.reset ?? null, account: account ?? undefined })
  }
  // The 403 message can sit in a file that the worker read, so a push counts only from git state: its own output and commits that the remote lacks.
  if (await pushForbidden(env, tail, worktree, branch, headBefore)) return needsOwner(env, mem, { ticket, reason: `The worker push failed with HTTP 403 on ${branch}` })
  if (result.result.needsDecision) return needsOwner(env, mem, { ticket, reason: `${branch}: NEEDS_DECISION: ${result.result.needsDecision}` })
  if (kind === "find") {
    const text = resultText(tail)
    // A result that failed (an API error) is not a findings report: the part stays pending for its next launch.
    if (text !== "" && result.result.error === null) await env.github.comment("tickets", ticket.number, marked("findings", `Findings, part ${partNumber}\n\n${text}`))
    return removeWorktrees(env, repoKey, [branch])
  }
  const shas = (await gitText(env, worktree, ["log", "--format=%H", `${headBefore}..HEAD`])).split("\n").filter(Boolean).reverse()
  const found = findPullByBranch(states, branch)
  const number = prNumber ?? found?.pull.number ?? Number((await env.gh(["pr", "list", "--repo", env.slugOf(repoKey), "--head", branch, "--json", "number", "--jq", ".[0].number"])).trim())
  if (shas.length > 0 && Number.isInteger(number) && number > 0 && result.sessionId) await recordCommits(env, repoKey, number, result.sessionId, shas)
}

/**
 * The reason a worktree cannot go: it holds a repository or a linked worktree in an ignored directory. `git worktree remove`
 * deletes an ignored path with all it holds, and neither status check shows a change inside it. Null when the tree holds none.
 */
const nestedRepositoryReason = (env, path) => {
  const found = env.findRepositories(path)
  if (found === null) return "the repositories inside it are unreadable"
  const nested = found.filter((directory) => resolve(directory) !== resolve(path))
  return nested.length > 0 ? `it holds a repository or worktree: ${nested.join(", ")}` : null
}

const removeWorktrees = async (env, repoKey, branches) => {
  const repoPath = env.config.repos[repoKey]
  const listed = parseWorktreeList(await gitText(env, repoPath, ["worktree", "list", "--porcelain"]))
  for (const branch of branches) {
    const entry = listed.find((candidate) => candidate.branch === branch)
    if (entry) {
      // `git worktree remove` deletes the directory under a shell or a session whose cwd is in it.
      let holders
      try { holders = env.worker.directoryHolders(env.worker.processDirectories(), entry.path) } catch (error) { log(env, repoKey, "worktree-kept", `${entry.path}: unreadable: ${error.message}`); continue }
      if (holders.length > 0) { log(env, repoKey, "worktree-kept", `${entry.path}: a process holds it: pid ${holders.join(", ")}`); continue }
      const nested = nestedRepositoryReason(env, entry.path)
      if (nested !== null) { log(env, repoKey, "worktree-kept", `${entry.path}: ${nested}`); continue }
      const removed = await env.git(repoPath, [...WORKTREE_REMOVE_ARGUMENTS, entry.path])
      if (removed.status !== 0) { log(env, repoKey, "worktree-kept", removed.stderr.trim()); continue }
    }
    await env.git(repoPath, ["branch", "-D", branch])
  }
}

/**
 * The reason a worktree stays, or null when it is finished: its branch has a merged pull request and no open one, the tree has no
 * change (an untracked file counts), no commit is unpushed, no process holds it (by its command line, a pid file or its cwd), and it holds no other repository or worktree. The cheap local reads come before the one GitHub read. The walk of the tree comes last.
 */
const worktreeStayReason = async (env, repoKey, entry, directories) => {
  const occupants = [...new Set([...env.worker.worktreeOccupants(entry.path, { stateDirectory: env.stateDir }), ...env.worker.directoryHolders(directories(), entry.path)])].sort((left, right) => left - right)
  if (occupants.length > 0) return `a process holds it: pid ${occupants.join(", ")}`
  if ((await gitText(env, entry.path, CLEAN_STATUS_ARGUMENTS)) !== "") return "the tree has a change"
  if (hiddenChangesOf(await gitText(env, entry.path, HIDDEN_CHANGE_ARGUMENTS)).length > 0) return "the tree has a change that git status hides"
  const head = await gitText(env, entry.path, ["rev-parse", "HEAD"])
  const pulls = JSON.parse(await env.gh(["pr", "list", "--repo", env.slugOf(repoKey), "--head", entry.branch, "--state", "all", "--json", "number,state,headRefOid", "--limit", "20"]))
  if (pulls.some((candidate) => candidate.state === "OPEN")) return "a pull request is open on the branch"
  const merged = pulls.filter((candidate) => candidate.state === "MERGED")
  if (merged.length === 0) return "no pull request of the branch is merged"
  // The merged head is on GitHub. Any other head needs a remote branch that holds it.
  if (!merged.some((candidate) => candidate.headRefOid === head) && (await gitText(env, entry.path, ["branch", "--remotes", "--contains", head])) === "") return "a commit is unpushed"
  return nestedRepositoryReason(env, entry.path)
}

/**
 * Removes each finished worktree of the ui, api and landing repositories, except the primary checkout and the driver's own worktree.
 * A removal never forces: git refuses a changed tree. A worktree that stays is logged once for each reason.
 */
const sweepWorktrees = async (env, mem) => {
  const seen = new Set()
  // One lsof read serves every worktree of the sweep, and a sweep with no candidate reads none.
  let directories = null
  const readDirectories = () => (directories ??= env.worker.processDirectories())
  for (const repoKey of REPOSITORY_KEYS) {
    const repoPath = env.config.repos[repoKey]
    let listed
    try { listed = parseWorktreeList(await gitText(env, repoPath, ["worktree", "list", "--porcelain"])) } catch (error) { log(env, repoKey, "worktree-sweep-error", error.message); continue }
    for (const entry of listed.slice(1)) {
      if (entry.branch === null || entry.locked || entry.prunable || resolve(entry.path) === resolve(env.driverWorktree ?? "")) continue
      seen.add(entry.path)
      const reason = await worktreeStayReason(env, repoKey, entry, readDirectories).catch((error) => `unreadable: ${error.message}`)
      if (reason !== null) {
        if (mem.keptWorktrees.get(entry.path) !== reason) { mem.keptWorktrees.set(entry.path, reason); log(env, repoKey, "worktree-stays", `${entry.path}: ${reason}`) }
        continue
      }
      const removed = await env.git(repoPath, [...WORKTREE_REMOVE_ARGUMENTS, entry.path])
      if (removed.status !== 0) {
        const failure = `removal refused: ${removed.stderr.trim()}`
        if (mem.keptWorktrees.get(entry.path) !== failure) { mem.keptWorktrees.set(entry.path, failure); log(env, repoKey, "worktree-stays", `${entry.path}: ${failure}`) }
        continue
      }
      mem.keptWorktrees.delete(entry.path)
      await env.git(repoPath, ["branch", "-D", entry.branch])
      log(env, repoKey, "worktree-removed", `${entry.path}, branch ${entry.branch}`)
    }
  }
  for (const path of mem.keptWorktrees.keys()) if (!seen.has(path)) mem.keptWorktrees.delete(path)
}

/** The merged pull requests that track a ticket, oldest merge first: the search lists them by relevance, so the order is sorted here. */
const mergedFor = async (env, ticket) => {
  const repository = env.config.tickets.repository
  const out = await env.gh(["pr", "list", "--repo", env.slugOf(ticket.repoKey), "--state", "merged", "--search", `"Tracks ${repository}#${ticket.number}" in:body`, "--json", "number,body,mergedAt,headRefName", "--limit", "50"])
  const pattern = new RegExp(`Tracks ${escapeRegex(repository)}#${ticket.number}(?!\\d)`)
  return JSON.parse(out).filter((pull) => pattern.test(pull.body)).sort((left, right) => Date.parse(left.mergedAt) - Date.parse(right.mergedAt) || left.number - right.number)
}

/**
 * The merged pull requests of a ticket, from a cache that a read renews each 10 minutes. The search API allows 30 reads a
 * minute, so a plain read spends at most 10 a tick and answers from an older read or an empty list after that. Only the
 * close pass takes a plain read, and it closes nothing before a fresh read confirms it. Admission takes a fresh read
 * for the ticket it is about to build, and builds nothing from a history that this tick did not read.
 */
const mergedHistory = async (env, mem, ticket, { fresh = false } = {}) => {
  const cached = mem.merged.get(ticket.number)
  if (cached && !fresh && env.now() - cached.at < MERGED_TTL_MS) return cached.history
  if (!fresh && mem.mergedReadsLeft <= 0) return cached?.history ?? []
  if (!fresh) mem.mergedReadsLeft -= 1
  const history = await mergedFor(env, ticket)
  mem.merged.set(ticket.number, { at: env.now(), history })
  mem.mergedReadThisTick.add(ticket.number)
  return history
}

/** `runs-last:board` waits for every other ticket, `runs-last:repo` for every other ticket of its repository. A later rank is never a reason for an earlier one to wait. */
const runsLastRank = (ticket) => (ticket.labels.includes("runs-last:board") ? 2 : ticket.labels.includes("runs-last:repo") ? 1 : 0)

/** The number of open tickets that a `runs-last` ticket waits for, or 0 for a ticket with no such label. */
const runsLastOpen = (tickets, ticket) => {
  const rank = runsLastRank(ticket)
  if (rank === 0) return 0
  return tickets.filter((other) => other.number !== ticket.number && runsLastRank(other) < rank && (rank === 2 || other.repoKey === ticket.repoKey)).length
}

/** The Remaining line of a merged pull request, or `null` when its body has none. */
const remainingLineOf = (pull) => REMAINING_LINE.exec(pull.body)?.[0].trim() ?? null

/** True when a Remaining line lists items and every item waits on the owner, on another ticket or on a release. */
const onlyOwnerItems = (line) => {
  const items = line.replace(/^Remaining:/, "").split(";").map((item) => item.trim()).filter(Boolean)
  return items.length > 0 && items.every((item) => OWNER_ITEM.test(item))
}

/** The reason that no build helps, or `null`. The last merged pull request leaves only owner items, or two merges in a row leave the same Remaining line. */
const rebuildStopReason = (history) => {
  const last = history.at(-1)
  const line = last === undefined ? null : remainingLineOf(last)
  if (line === null) return null
  if (onlyOwnerItems(line)) return `${line} (only owner items are left)`
  const before = history.length > 1 ? remainingLineOf(history.at(-2)) : null
  return before === line ? `${line} (two merged pull requests in a row left the same line)` : null
}

/** What admission does with one ticket: an order, or the reason it waits. A part whose worker runs counts as an open part, so it blocks another part whose `Paths:` overlap and never starts twice. */
const ticketVerdict = async (env, mem, states, tickets, ticket, { settled = null, running }) => {
  const labels = ticket.labels
  const stop = (reason) => ({ reason })
  const repoLabels = labels.filter((label) => label.startsWith("repo:"))
  if (repoLabels.length !== 1) return stop("needs exactly one repo label")
  for (const label of [OWNER, "needs:conversation", "owner-work"]) if (labels.includes(label)) return stop(`carries ${label}`)
  const open = ticket.blockedBy.filter((blocker) => blocker.open)
  if (open.length > 0) return stop(`blocked by ${open.map((blocker) => blocker.number).join(", ")}`)
  const waiting = runsLastOpen(tickets, ticket)
  if (waiting > 0) return stop(`runs last (${waiting} open)`)
  for (const blocker of ticket.blockedBy) {
    const unmet = await env.github.unmetDeployFirst(blocker)
    if (unmet.length > 0) return stop(`deploy-first ${unmet.map((hold) => `${hold.environment}/${hold.task}`).join(", ")} of ${blocker.number} is not deployed`)
  }
  const partFault = partProblem(ticket.comments.filter((comment) => comment.kind === null))
  if (partFault !== null) return { reason: "a part comment is broken or doubled", owner: partFault }
  const state = states.find((entry) => entry.repositoryKey === ticket.repoKey)
  if (state === undefined) return stop(`the ${ticket.repoKey} repository could not be read this tick`)
  const tracking = state.pulls.filter((pull) => pull.tracks === ticket.number)
  const parts = partsOf(ticket)
  if (parts.length === 0 && tracking.length > 0) return stop("an open pull request tracks it")
  if (settled !== null) return stop(settled)
  const working = running.workers.filter(({ record }) => record.ticketNumber === ticket.number)
  if (parts.length === 0 && working.length > 0) return stop("a worker runs on its branch")
  const history = await mergedHistory(env, mem, ticket, { fresh: true })
  if (tracking.length === 0 && history.some((pull) => REMAINING_NONE.test(pull.body))) return stop("a merged pull request says Remaining: none")
  const doneBranches = new Set(history.map((pull) => pull.headRefName))
  // An open pull request keeps the order on its branch, so the cap counts every launch of one piece of work. One with no `Tracks` line goes to the owner.
  const ownBranch = (part) => branchName(ticket, part, doneBranches)
  const untracked = (branch) => state.pulls.find((pull) => pull.headRef === branch && pull.tracks !== ticket.number)
  const held = (branch) => { const pull = untracked(branch); return pull === undefined ? null : { reason: `${ticket.repoKey}#${pull.number} is open on ${branch} with no Tracks line for this ticket`, owner: `Pull request ${ticket.repoKey}#${pull.number} is open on ${branch} with no \`Tracks ${env.config.tickets.repository}#${ticket.number}\` line. Add the line or close it.` } }
  if (parts.length === 0) {
    const branch = ownBranch(null)
    if (held(branch)) return held(branch)
    const stopReason = rebuildStopReason(history)
    if (stopReason !== null) return { reason: "a rebuild cannot meet the Remaining line", owner: `No build can meet the Remaining line of the last merged pull request: ${stopReason}` }
    const remaining = history.length === 0 ? "" : `Remaining after the merged pull requests: ${remainingLineOf(history.at(-1)) ?? "Remaining: unknown"}`
    return { order: { kind: "build", repoKey: ticket.repoKey, ticket, branch, extra: remaining } }
  }
  const partDone = (entry) => (entry.find ? ticket.comments.some((comment) => comment.kind === "findings" && firstLine(bodyAfterMarker(comment)) === `Findings, part ${entry.number}`) : [...doneBranches].some((branch) => partBranch(ticket.number, entry.number).test(branch)))
  const inFlight = (entry) => tracking.some((pull) => partBranch(ticket.number, entry.number).test(pull.headRef)) || working.some(({ record }) => record.partNumber === entry.number)
  const pending = parts.filter((entry) => !partDone(entry) && !inFlight(entry))
  const openParts = parts.filter(inFlight)
  const foreign = tracking.some((pull) => !parts.some((entry) => partBranch(ticket.number, entry.number).test(pull.headRef)))
  for (const entry of pending) {
    const earlierDone = parts.filter((other) => other.number < entry.number).every(partDone)
    let free = earlierDone && openParts.length === 0 && !foreign
    if (!free && entry.paths !== null && !foreign && openParts.every((other) => other.paths !== null)) {
      free = true
      for (const other of openParts) if (await pathsOverlap(env, env.config.repos[ticket.repoKey], entry.paths, other.paths)) free = false
    }
    if (free) return held(ownBranch(entry.number)) ?? { order: { kind: entry.find ? "find" : "build part", repoKey: ticket.repoKey, ticket, part: entry, branch: ownBranch(entry.number), extra: "" } }
  }
  return stop(pending.length > 0 ? "the next part waits for an open part" : tracking.length > 0 ? "an open pull request tracks it" : "no part is left to run")
}

/** Closes a ticket after its last merge: the comment, the close, the board Status and the worktrees. */
const closeFinished = async (env, mem, ticket, merged) => {
  log(env, `ticket#${ticket.number}`, "close", "a merged pull request says Remaining: none")
  if (env.dryRun) return
  await env.github.comment("tickets", ticket.number, marked("close", `Closed by the driver: ${merged.map((pull) => `#${pull.number}`).join(", ")} merged with Remaining: none.`))
  await env.github.closeTicket(ticket.number)
  await say(env, { key: `ticket#${ticket.number} finished`, lines: [`Orbit finished: ${cut(ticket.title, TITLE_LIMIT)}`, "Its last pull request is merged."], link: issueLink(env, ticket.number) })
  mem.merged.delete(ticket.number)
  await removeWorktrees(env, ticket.repoKey, merged.map((pull) => pull.headRefName))
}

/** Closes every ticket whose merged pull request says `Remaining: none` while no open pull request tracks it. It runs on every tick, paused or not, and before admission. */
const closeFinishedTickets = async (env, mem, tickets, states) => {
  const closed = new Set()
  const closable = tickets.filter((ticket) => {
    const state = states.find((entry) => entry.repositoryKey === ticket.repoKey)
    return state !== undefined && ![OWNER, "needs:conversation", "owner-work"].some((label) => ticket.labels.includes(label)) && !state.pulls.some((pull) => pull.tracks === ticket.number)
  }).sort((left, right) => (mem.merged.get(left.number)?.at ?? 0) - (mem.merged.get(right.number)?.at ?? 0) || left.number - right.number)
  for (const ticket of closable) {
    try {
      const finishedIn = (history) => history.some((pull) => REMAINING_NONE.test(pull.body))
      if (!finishedIn(await mergedHistory(env, mem, ticket))) continue
      const merged = mem.mergedReadThisTick.has(ticket.number) ? mem.merged.get(ticket.number).history : await mergedHistory(env, mem, ticket, { fresh: true })
      if (!finishedIn(merged)) continue
      await closeFinished(env, mem, ticket, merged)
      closed.add(ticket.number)
    } catch (error) {
      log(env, `ticket#${ticket.number}`, "error", error.message)
    }
  }
  return closed
}

/** Notices for `owner-work` tickets whose blockers are all closed, once for each ticket. */
const ownerWorkNotices = async (env, mem, tickets) => {
  for (const ticket of tickets.filter((entry) => entry.labels.includes("owner-work") && entry.blockedBy.every((blocker) => !blocker.open) && !entry.comments.some((comment) => comment.kind === "notice"))) {
    log(env, `ticket#${ticket.number}`, "notice", "owner-work with every blocker closed")
    if (env.dryRun) continue
    await env.github.comment("tickets", ticket.number, marked("notice", "Every blocker of this owner-work ticket is closed. It is ready for your session."))
    holdItem(env, { link: issueLink(env, ticket.number), reason: `owner-work ticket ${ticket.number} is ready` })
    await say(env, { key: `ticket#${ticket.number} ready`, lines: [`Orbit has work ready for your session: ${cut(ticket.title, TITLE_LIMIT)}`], link: issueLink(env, ticket.number) })
  }
}

/**
 * Walks the open tickets in rank order and returns the build and find orders that fit `room`, the free worker slots, with
 * the decision for each ticket. `full` is the reason that a ticket waits once the room is used. A ticket whose worker runs
 * on its branch, or whose launches are spent, never gets a second order. A ticket in `skip` gets no order and no decision,
 * and it stays in `tickets`, so a `runs-last` ticket still waits for it.
 */
const admit = async (env, mem, tickets, states, { running, room, full, skip = new Set() }) => {
  const decisions = new Map()
  const chosen = []
  for (const ticket of rankTickets(tickets)) {
    if (skip.has(ticket.number)) continue
    const verdict = await ticketVerdict(env, mem, states, tickets, ticket, { settled: chosen.length >= room ? full : null, running })
    if (verdict.reason) {
      decisions.set(ticket.number, verdict.owner ? `needs:owner: ${verdict.reason}` : `wait: ${verdict.reason}`)
      if (verdict.owner) await needsOwner(env, mem, { ticket, reason: verdict.owner })
      continue
    }
    // The launches before the newest owner decision are answered, so a decided order gets its full count again.
    const launches = launchesOf(ticket, ownerDecisionAt(env, ticket)).filter((entry) => entry.branch === verdict.order.branch && entry.kind === verdict.order.kind)
    if (launches.length >= MAX_ORDER_LAUNCHES) {
      decisions.set(ticket.number, "needs:owner: the order used its launches")
      await needsOwner(env, mem, { ticket, reason: `The ${verdict.order.kind} order of ${verdict.order.branch} launched ${launches.length} times without a result`, relabel: true })
      continue
    }
    if (running.branches.has(verdict.order.branch)) {
      decisions.set(ticket.number, "wait: a worker runs on its branch")
      continue
    }
    chosen.push(verdict.order)
    decisions.set(ticket.number, `admit ${verdict.order.kind} on ${verdict.order.branch}`)
  }
  return { chosen, decisions }
}

/**
 * The dry-run line of the next ticket in line: the first ticket in rank order that gets an order when one slot is free. A
 * pause, a logout, the usage stop and a full set of slots do not change it. Admission logs its reports, so this walk is silent.
 */
const nextTicketLine = async (env, mem, tickets, states, running) => {
  const { chosen: [order] } = await admit({ ...env, log: () => {} }, mem, tickets, states, { running, room: 1, full: "another ticket is next" })
  if (order === undefined) return "next ticket none"
  const part = order.part ? `, partNumber ${order.part.number}` : ""
  return `next ticket ${env.config.tickets.repository}#${order.ticket.number}: ${order.kind} on ${order.branch}${part}`
}

/**
 * The pace of one account this tick: the newest reading of its login, its slots and its stop state. `weekly` is the stop at 90%
 * of the week and `limitedUntil` is the stop after a worker hit a usage limit; `stopped` is either. The worker account is
 * `absent` (0 slots) while no second login exists. The slots that the account's own running workers hold come off its free slots.
 */
const decidePace = (env, mem, running, allowances, name, unpaced = []) => {
  const state = stateOf(mem, name)
  const busy = running.workers.filter(({ record }) => nameOfKey(mem, record.account) === name).length
  if (name === WORKER && state.account === null) return { name, key: null, state: "absent", utilization: null, resetsAt: null, line: null, slots: 0, weekly: false, limitedUntil: null, stopped: false, running: busy, free: 0 }
  if (state.stoppedUntil !== null && state.stoppedUntil <= env.now()) state.stoppedUntil = null
  const [own, snapshot] = readingsOfAccount(env, mem, name)
  // While a probe is owed the status-line snapshot may belong to another organization of the same email, so only a reading of this account's key counts.
  const reading = newestReading(own, state.probeOwed ? null : snapshot)
  const allowance = allowances[name]
  const pace = unpaced.includes(name)
    ? { state: "unpaced", utilization: reading?.utilization ?? null, resetsAt: reading?.resetsAt ?? null, line: null, slots: MAX_WORKERS, stopped: false }
    : paceState({ reading, now: env.now(), allowance, workersRun: busy > 0 })
  const stopped = pace.stopped || state.stoppedUntil !== null
  return { ...pace, name, key: state.account?.key ?? null, weekly: pace.stopped, limitedUntil: state.stoppedUntil, stopped, running: busy, free: stopped ? 0 : Math.max(0, pace.slots - busy) }
}

/** One log line with both accounts: each by its key, with its utilization, line, slots, running and free workers and stop state, and the seconds that the tick took. */
const logPace = (env, paces, startedAt) => {
  const figure = (value) => (value === null ? "unknown" : value.toFixed(3))
  const describeAccount = (pace) => (pace.state === "absent"
    ? `${pace.name} none`
    : `${pace.name} ${pace.key ?? "unknown"}: utilization ${figure(pace.utilization)}, line ${figure(pace.line)}, slots ${pace.slots}, running ${pace.running}, free ${pace.free}, stop ${pace.stopped ? "yes" : "no"}${pace.limitedUntil === null ? "" : ` (usage limit until ${new Date(pace.limitedUntil).toISOString()})`}`)
  log(env, "pace", paces.main.state, `${ACCOUNT_NAMES.map((name) => describeAccount(paces[name])).join("; ")}; tick ${Math.round((env.clock() - startedAt) / 1000)}s`)
}

/** The allow file of the owner session: for each account, the week (its `resetsAt`) in which the driver continues over 90%. The main account fills the top level, the worker account `worker`. */
const readAllowances = (env) => {
  let saved = null
  try { saved = JSON.parse(readFileSync(join(env.stateDir, ALLOW_FILE), "utf8")) } catch { /* no file means no allowance */ }
  const entry = (value) => (Number.isInteger(value?.resetsAt) ? value : null)
  return { main: entry(saved), worker: entry(saved?.worker) }
}

/**
 * Opens one `needs:owner` issue and sends one notification when the weekly stop begins, and closes the issue with a comment
 * when the stop ends: the owner allowed the week, or the week reset. A tick with no reading changes nothing.
 */
const syncStop = async (env, tickets, pace) => {
  const issue = tickets.find((ticket) => ticket.title === STOP_TITLE) ?? null
  if (pace.weekly) {
    log(env, "driver", "stop", `weekly usage ${pace.utilization.toFixed(3)} of the main account is at 90%`)
    if (env.dryRun || issue !== null) return
    const message = `Weekly usage of the main account reached 90% (${pace.utilization.toFixed(3)}, resets ${new Date(pace.resetsAt * 1000).toISOString()}). The main account starts no worker and Pullfrog posts no request. Tell the owner session to continue over 90%.`
    const created = await openProblem(env, { title: STOP_TITLE, body: message, notice: { key: "weekly-stop", lines: ["Orbit starts no new work on the main account: it used 90% of its week.", `Reviews wait until ${clock(pace.resetsAt * 1000)}. Run /over-limit to continue now.`] } })
    tickets.push({ number: created.number, title: STOP_TITLE, labels: [OWNER], comments: [], blockedBy: [], body: message })
    return
  }
  if (pace.state !== "unknown") forget(env, "weekly-stop")
  if (issue === null || env.dryRun || pace.state === "unknown") return
  await closeIssue(env, tickets, issue, pace.state === "unpaced" ? "The owner turned the weekly pace of the main account off, so the stop ends. It runs 3 workers until its usage limit." : pace.state === "allowed" ? "The owner allowed use over 90% for this week. The driver runs 1 worker." : "The week reset, so the stop ends. The driver runs workers again.")
}

/** Each running worker's log holds its newest `rate_limit_event`, so a tick reads it and keeps the highest reading of the week of the account that the worker runs on. */
const readRunningReadings = (env, mem, running) => {
  for (const { record } of running.workers) {
    const event = workerApi.readEvent(tailOf(record.logFile))
    const name = knownAccounts(mem).find((candidate) => stateOf(mem, candidate).account.key === record.account)
    if (event.utilization === null || name === undefined) continue
    const known = stateOf(mem, name).reading
    if (known === null || Math.abs(event.resetsAt - known.resetsAt) >= RESET_TOLERANCE_SECONDS || event.utilization > known.utilization) setReading(env, mem, { utilization: event.utilization, resetsAt: event.resetsAt, at: env.now(), account: record.account })
  }
}

/** The closed ticket numbers that name a regressed issue, or null when the issue gets no new ticket: an open ticket names it, or its last event is no later than the newest close, so the fix holds. */
const regressionOf = (candidate, named) => {
  if (candidate.regressedAt === undefined || named.some((ticket) => ticket.state === "OPEN")) return null
  return named.every((ticket) => Date.parse(ticket.closedAt) < candidate.regressedAt) ? named.map((ticket) => ticket.number) : null
}

/** Hourly: one `Bug` ticket for each Sentry issue and each alert that no ticket holds, and for each regressed issue that only closed tickets hold. */
const intake = async (env, mem) => {
  const candidates = []
  const sentryToken = await env.keychain("orbit-sentry-token")
  if (sentryToken === null) log(env, "intake", "skipped", "no orbit-sentry-token in the Keychain")
  else for (const issue of await sentryIssues(env.fetchJson, sentryToken)) {
    const candidate = sentryCandidate(issue)
    if (candidate !== null) candidates.push(candidate)
  }
  for (const key of REPOSITORY_KEYS) {
    const slug = env.slugOf(key)
    for (const [kind, path, describeAlert] of [
      ["Dependabot", "dependabot", (alert) => `${alert.security_advisory?.summary ?? "alert"} (${alert.dependency?.package?.name ?? "dependency"})`],
      ["Code scanning", "code-scanning", (alert) => `${alert.rule?.description ?? "alert"} (${alert.most_recent_instance?.location?.path ?? "file"})`],
      ["Secret scanning", "secret-scanning", (alert) => `${alert.secret_type_display_name ?? alert.secret_type ?? "secret"} alert`],
    ]) {
      let alerts = []
      try { alerts = JSON.parse(await env.gh(["api", `repos/${slug}/${path}/alerts?state=open&per_page=100`])) } catch (error) { log(env, "intake", "alerts-unread", `${kind} of ${slug}: ${error.message}`) }
      for (const alert of alerts) candidates.push({ repoKey: key, title: `${kind}: ${describeAlert(alert)}`.slice(0, 120), body: `${describeAlert(alert)}\n\n${alert.html_url}`, held: (text) => holds(text, alert.html_url), label: alert.html_url })
    }
  }
  if (candidates.length === 0) return
  // Open and closed tickets both count, so a closed ticket keeps its issue from coming back, unless the issue regressed after the close.
  const known = JSON.parse(await env.gh(["issue", "list", "--repo", env.config.tickets.repository, "--state", "all", "--limit", "5000", "--json", "number,title,body,state,closedAt"]))
  for (const candidate of candidates) {
    const named = known.filter((ticket) => candidate.held(`${ticket.title}\n${ticket.body}`))
    const earlier = named.length === 0 ? [] : regressionOf(candidate, named)
    if (earlier === null) continue
    log(env, "intake", "ticket", candidate.label)
    const body = earlier.length === 0 ? candidate.body : `${candidate.body}\n\nThe issue regressed after the fix of ${earlier.map((number) => `#${number}`).join(", ")}.`
    if (!env.dryRun) await env.github.createTicket({ title: candidate.title, body, labels: [`repo:${candidate.repoKey}`, "Bug"] })
  }
}

/** One tick: rebuild the state, reap exits, act on pull requests, run the owner-work notices, admit, and take the hourly intake. */
const noteReadError = (mem, error) => { mem.readErrors.push(error) }

/**
 * The tickets and the state of each repository. A repository that cannot be read after its half-size retry is `unknown` for this
 * tick, and the other repositories go on. The read fails when the tickets cannot be read or when no repository can.
 */
const readWorld = async (env, mem) => {
  let tickets
  try { tickets = await env.github.readTickets() } catch (error) { noteReadError(mem, error); throw error }
  const reads = await Promise.all(REPOSITORY_KEYS.map((key) => env.github.readRepositoryState(key, { knownNumbers: mem.known[key] ?? [] }).then((state) => ({ state }), (error) => ({ key, error }))))
  const states = reads.flatMap((read) => (read.state ? [read.state] : []))
  const unknown = []
  for (const { key, error } of reads.filter((read) => read.error)) {
    noteReadError(mem, error)
    log(env, key, "repository-unknown", error.message)
    unknown.push(key)
  }
  if (states.length === 0) throw new Error(`no repository could be read: ${mem.readErrors.at(-1).message}`)
  for (const state of states) mem.known[state.repositoryKey] = state.numbers
  return { tickets, states, unknown }
}

/** The epoch milliseconds at which a rate limit resets: the latest reset of the exhausted core and GraphQL limits of `gh api rate_limit`, or 0 when neither is exhausted. */
const rateLimitReset = async (env) => {
  try {
    const { resources } = JSON.parse(await env.gh(["api", "rate_limit"]))
    const exhausted = ["core", "graphql"].map((name) => resources[name]).filter((limit) => limit?.remaining === 0)
    return exhausted.length === 0 ? 0 : Math.max(...exhausted.map((limit) => limit.reset)) * 1000
  } catch (error) {
    log(env, "tick", "rate-limit-unread", error.message)
    return 0
  }
}

/**
 * Closes the reads of one tick. A rate limit holds the next tick until the reset. A third failed tick in a row holds each next tick
 * for 10 minutes, until one tick passes. A held tick reads nothing from GitHub.
 */
const settleReads = async (env, mem, { failed }) => {
  const errors = mem.readErrors
  mem.readErrors = []
  mem.failedTicks = failed ? mem.failedTicks + 1 : 0
  let until = errors.some(isRateLimited) ? await rateLimitReset(env) : 0
  if (mem.failedTicks >= FAILED_TICKS_BEFORE_BACKOFF) until = Math.max(until, env.now() + BACKOFF_MS)
  mem.holdUntil = until
  if (until > env.now()) log(env, "tick", "hold", `GitHub reads wait until ${new Date(until).toISOString()}`)
}

/**
 * Sends SIGKILL to the process group of the worker that `${stem}.pid` names, only when no process holds that pid. A process that holds it
 * is a live worker or an unrelated program that reuses a stale pid, and its group is not a worker's. Once the leader is gone, the negative
 * pid reaches only its leftover children, because a group id is never reused while a member lives. A missing or unreadable file means
 * this process already ended the group.
 */
const killLeftoverGroup = (env, stem) => {
  let pid
  try { pid = JSON.parse(readFileSync(join(env.stateDir, `${stem}.pid`), "utf8")).pid } catch { return }
  if (Number.isInteger(pid) && !env.pidHeld(pid)) env.worker.killWorkerTree(pid, "SIGKILL")
}

/**
 * Reaps every worker whose launch record is on disk and whose process is gone, after a restart of the driver too. A tick
 * reaps before it reads GitHub for its own steps, so every later step reads what the reap wrote. The reap has its own
 * read, and it takes one only when a record waits. It returns the repositories that its read could not see. The record of each
 * waits for the next tick, so the tick treats each of them as unknown for the whole tick.
 */
const reapExits = async (env, mem) => {
  // A dry run writes nothing, so it leaves every record for the driver that runs. Until the account is known, a reading of a worker
  // belongs to no account, so the records wait for the tick that reads it.
  if (env.dryRun || mem.account === null) return []
  const gone = launchRecords(env).filter(({ stem }) => !workerRuns(env, mem, stem))
  if (gone.length === 0) return []
  const { tickets, states, unknown } = await readWorld(env, mem)
  for (const { stem, record } of gone) {
    // The record of a repository that this read could not see waits for the next tick.
    if (unknown.includes(record.repoKey)) continue
    rmSync(launchRecordPath(env, stem), { force: true })
    // A worker that this process did not wait for has no `finish` here to end the children it left in its group, and its pid file is still there.
    if (!mem.results.has(stem)) killLeftoverGroup(env, stem)
    rmSync(join(env.stateDir, `${stem}.pid`), { force: true })
    const killedBy = mem.orphans.get(stem)?.reason ?? null
    const result = mem.results.get(stem) ?? { ...exitFromLog(record.logFile), killed: killedBy, killReason: killedBy === null ? null : env.worker.KILL_REASONS[killedBy] }
    mem.results.delete(stem)
    mem.orphans.delete(stem)
    await reapExit(env, mem, tickets, states, { ...record, result }).catch((error) => log(env, `ticket#${record.ticketNumber}`, "error", error.message))
  }
  return unknown
}

/**
 * The stall alarm. The clock is the last tick in which a worker ran, a request went out or a pull request merged, kept in
 * `activity.json` so a restart keeps it. It resets while nothing waits, while the driver is held on purpose, and at each
 * action. After 60 minutes of waiting items with no action it logs `stall` with each reason and opens one `needs:owner` issue.
 */
const watchStall = async (env, tickets, { acted, held, waiting }) => {
  const path = join(env.stateDir, ACTIVITY_FILE)
  let last = null
  try { last = JSON.parse(readFileSync(path, "utf8")).at } catch { /* a first start has no file */ }
  const now = env.now()
  const issue = tickets.find((ticket) => ticket.title === STALL_TITLE) ?? null
  if (acted || held || waiting.length === 0 || !Number.isFinite(last)) {
    writeFileSync(path, `${JSON.stringify({ at: now })}\n`)
    if (acted && issue !== null) await closeIssue(env, tickets, issue, "The driver acted again, so the stall ends.")
    return
  }
  if (now - last < STALL_MS) return
  const reasons = waiting.join("; ")
  log(env, "driver", "stall", reasons)
  if (issue !== null) return
  const message = `The driver ran no worker, posted no request and merged nothing since ${new Date(last).toISOString()}. Waiting: ${reasons}`
  const created = await openProblem(env, { title: STALL_TITLE, body: message, notice: { key: `stall ${new Date(last).toISOString()}`, lines: [`Orbit stalled: nothing was built, reviewed or merged since ${clock(last)}.`] } })
  tickets.push({ number: created.number, title: STALL_TITLE, labels: [OWNER], comments: [], blockedBy: [], body: message })
}

/**
 * Starts one headless `/questions --auto` run when a held item (`heldWithNewReport`) has a `needs-owner` report newer than the
 * start of the last run, and no run is live. The run takes no worker slot. It runs in the driver worktree on the main account with the
 * coordinator model and the owner's gh login, and it stops with the main account at 90% like a worker. The start goes to `questions.json` before the launch.
 * The skill reads `sleep.json` itself, so the driver passes no sleep state.
 */
const startQuestions = async (env, mem, { tickets, states, blocked }) => {
  if (!env.driverWorktree || mem.questions !== null || pidFileOf(env, QUESTIONS_STEM) !== null) return
  const held = heldWithNewReport(env, tickets, states, readQuestionsStart(env.stateDir))
  if (held.length === 0) return
  if (blocked !== null) return log(env, "questions", "wait", `${blocked}: ${held.join(", ")}`)
  // The worker token cannot read the ticket repository, so the run uses the owner's gh login and never falls back to the worker token.
  const token = await env.worker.readOwnerToken({ parentEnvironment: process.env })
  if (token === null) return log(env, "questions", "refused", "no owner gh login: run gh auth login")
  const invocation = env.worker.questionsInvocation({ home: env.home, parentEnvironment: process.env, token })
  const startedAt = env.now()
  writeFileSync(join(env.stateDir, QUESTIONS_FILE), `${JSON.stringify({ startedAt: new Date(startedAt).toISOString() })}\n`)
  const logFile = join(env.stateDir, "logs", `${QUESTIONS_STEM}-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.log`)
  const running = env.worker.launch({ invocation, worktree: env.driverWorktree, order: QUESTIONS_ORDER, logFile, pidFile: join(env.stateDir, `${QUESTIONS_STEM}.pid`) })
  log(env, "questions", "launch")
  mem.questions = running.then((result) => {
    mem.questions = null
    log(env, "questions", "exit", String(result.exitCode ?? result.spawnError ?? result.killReason ?? "none"))
    mem.woken = true
    mem.wake()
  })
}

export const tick = async (env, mem) => {
  const startedAt = env.clock()
  env.lines = []
  env.reads = new Map()
  mem.acted = false
  mem.waiting = []
  await sendPending(env)
  await reportSleep(env)
  await enforceOrphanClocks(env, mem)
  if (env.now() < mem.holdUntil) {
    log(env, "tick", "held", `GitHub reads wait until ${new Date(mem.holdUntil).toISOString()}`)
    return { retried: true, held: true }
  }
  // The workers that run when the read starts keep their slots for this whole tick, whatever the read shows.
  const running = runningWorkers(env, mem)
  const status = await readAccount(env, mem)
  await readWorkerAccount(env, mem)
  let world
  try {
    const unseen = await reapExits(env, mem)
    world = await readWorld(env, mem)
    world.states = world.states.filter((state) => !unseen.includes(state.repositoryKey))
  } catch (error) {
    log(env, "tick", "retry", error.message)
    // A failed read that the read itself did not note (a failure of the reap) still counts as a failed tick.
    if (mem.readErrors.length === 0) noteReadError(mem, error)
    await settleReads(env, mem, { failed: true })
    return { retried: true }
  }
  const { tickets, states } = world
  const account = await trackAccount(env, mem, tickets, status)
  const paused = pauseIssue(tickets)
  if (account.ok) readRunningReadings(env, mem, running)
  const allowances = readAllowances(env)
  const unpaced = readUnpaced(env.stateDir)
  const paces = {}
  for (const name of ACCOUNT_NAMES) paces[name] = decidePace(env, mem, running, allowances, name, unpaced)
  // One probe for each account, only at a start with no reading, or each hour while the driver is paused or the account is stopped
  // by a usage limit. The weekly stop runs none. The pause is the main account's: Pullfrog runs on it.
  for (const name of ACCOUNT_NAMES) {
    const state = stateOf(mem, name)
    const probeDue = state.lastProbeAt === null || env.now() - state.lastProbeAt >= HOUR_MS
    const owed = paces[name].state === "unknown" || state.probeOwed || state.stoppedUntil !== null || (name === MAIN && paused && paces[name].running === 0)
    if (!account.ok || env.dryRun || paces[name].weekly || paces[name].state === "absent" || !probeDue || !owed) continue
    await runProbe(env, mem, tickets, name).catch((error) => log(env, "probe", "error", error.message))
    paces[name] = decidePace(env, mem, running, allowances, name, unpaced)
  }
  // The weekly stop of the main account holds Pullfrog requests, and its issue is the owner's to lift.
  if (account.ok) await syncStop(env, tickets, paces.main)
  const stoppedAll = ACCOUNT_NAMES.every((name) => paces[name].state === "absent" || paces[name].stopped)
  const free = { main: paces.main.free, worker: paces.worker.free }
  const full = stoppedAll ? "the weekly usage stop holds every worker" : "every free worker slot is taken"
  const unstarted = []
  // The plan of this tick can open the pause issue, so each launch reads the hold again.
  const held = () => paused || pauseIssue(tickets) || !account.ok
  // The worker account takes a launch when it has a free slot, else the main account.
  // A plan that found a Pullfrog limit sets `limitSeen` before the pause applies: no early launch runs, and no launch uses the main account.
  const limitSeen = { found: false }
  // The tickets whose order reached `startWorker`. An early order that never got there goes back to the late admission.
  const reached = new Set()
  const LIMIT_STOP = "a Pullfrog limit stops the main account"
  // Returns the reason that the launches stopped before the end of the list, or null.
  const launchAll = async (launchable, { early = false } = {}) => {
    for (const order of launchable) {
      if (held()) return "the driver is paused"
      if (early && limitSeen.found) return LIMIT_STOP
      const name = free.worker > 0 ? WORKER : MAIN
      if (limitSeen.found && name === MAIN) return LIMIT_STOP
      reached.add(order.ticket.number)
      const reason = await startWorker(env, mem, order, name).catch((error) => (log(env, `ticket#${order.ticket.number}`, "error", error.message), error.message))
      if (reason === null) { mem.acted = true; free[name] -= 1 }
      else unstarted.push(`ticket#${order.ticket.number}: ${reason}`)
    }
    return null
  }
  const planning = pullActions(env, mem, states, tickets, { running, stopped: paces.main.stopped, limitSeen })
  planning.catch(() => {})
  // A fix order of an open pull request goes first. While the plan is slow, a free slot takes an admitted build order, so no slot waits for the plan.
  const admitted = { chosen: [], decisions: new Map() }
  const slotsAtStart = free.main + free.worker
  if (!env.dryRun && !held() && slotsAtStart > 0 && !await settledWithin(planning, env.planWindowMs ?? PLAN_WINDOW_MS) && !held() && !limitSeen.found) {
    log(env, "tick", "early-launch", `the pull request plan runs, ${slotsAtStart} free slot(s) take build orders first`)
    // A tick that ends before its plan lets the next tick act on the same pull requests again, so this failure never ends the tick.
    Object.assign(admitted, await admit(env, mem, tickets, states, { running, room: slotsAtStart, full }).catch((error) => (log(env, "tick", "early-launch-error", error.message), {})))
    await launchAll(admitted.chosen, { early: true })
  }
  const orders = await planning
  await settleReads(env, mem, { failed: false })
  await ownerWorkNotices(env, mem, tickets)
  mem.mergedReadsLeft = MERGED_READS_PER_TICK
  mem.mergedReadThisTick.clear()
  const closed = await closeFinishedTickets(env, mem, tickets, states)
  const holdReason = paused || pauseIssue(tickets) ? "the driver is paused" : account.ok ? null : account.reason
  const room = holdReason ? 0 : free.main + free.worker
  const fixOrders = room === 0 ? [] : orders.filter((order) => !running.branches.has(order.pull.headRef)).sort((left, right) => left.pull.number - right.pull.number).slice(0, room)
  const stillOpen = tickets.filter((ticket) => !closed.has(ticket.number))
  const { chosen, decisions: later } = holdReason ? { chosen: [], decisions: new Map() } : await admit(env, mem, stillOpen, states, { running, room: room - fixOrders.length, full, skip: reached })
  const decisions = new Map([...admitted.decisions, ...later])
  for (const ticket of tickets) env.lines.push(`ticket ${env.config.tickets.repository}#${ticket.number}: ${closed.has(ticket.number) ? "close" : holdReason ? `wait: ${holdReason}` : decisions.get(ticket.number) ?? "wait"}`)
  if (env.dryRun) env.lines.push(await nextTicketLine(env, mem, stillOpen, states, running))
  if (!env.dryRun) {
    const stoppedBy = await launchAll([...fixOrders, ...chosen])
    // A ticket line never says admit for an order that no launch reached.
    for (const { ticket } of chosen.filter((order) => !reached.has(order.ticket.number))) {
      const prefix = `ticket ${env.config.tickets.repository}#${ticket.number}: `
      env.lines[env.lines.findIndex((line) => line.startsWith(prefix))] = `${prefix}wait: ${stoppedBy}`
    }
    await sweepWorktrees(env, mem).catch((error) => log(env, "worktrees", "error", error.message))
    const questionsBlock = holdReason ?? (paces.main.stopped ? "the main account is stopped" : limitSeen.found ? LIMIT_STOP : null)
    await startQuestions(env, mem, { tickets, states, blocked: questionsBlock }).catch((error) => log(env, "questions", "error", error.message))
    // While the main account is stopped, its Pullfrog-bound items are a chosen hold. A failed launch stays on the clock.
    const waiting = [...(paces.main.stopped ? [] : mem.waiting), ...unstarted]
    await watchStall(env, tickets, { acted: mem.acted || running.workers.length > 0, held: holdReason !== null || stoppedAll, waiting }).catch((error) => log(env, "stall", "error", error.message))
  }
  if (!env.dryRun && env.now() - mem.lastIntakeAt >= HOUR_MS) {
    mem.lastIntakeAt = env.now()
    await intake(env, mem).catch((error) => log(env, "intake", "error", error.message))
  }
  if (env.releasePorts) await runReleaseTrain(env).catch((error) => log(env, "release", "error", error.message))
  logPace(env, paces, startedAt)
  if (env.dryRun && env.driverWorktree) env.lines.push(await pinLine(env).catch((error) => `driver pin unreadable (${error.message})`))
  if (env.dryRun) for (const line of env.lines) env.log(line)
  const switched = await switchDriver(env, mem).catch((error) => (log(env, "driver", "switch-error", error.message), false))
  return { retried: false, lines: env.lines, switched }
}

const shortSha = (sha) => sha.slice(0, 9)

/** The ticket writes of the release train: a held step gets one `needs:owner` ticket and one comment, a stopped train one Bug ticket. */
const releaseTickets = (env) => ({
  bug: async ({ title, body, repoKey }) => {
    const created = await env.github.createTicket({ title, body, labels: [`repo:${repoKey}`, "Bug"] })
    await say(env, { key: `issue ${created.number}`, lines: ["An Orbit release stopped.", cut(title, DETAIL_LIMIT)], link: issueLink(env, created.number) })
    return created.number
  },
  hold: async ({ title, reason, repoKey }) => {
    const open = JSON.parse(await env.gh(["issue", "list", "--repo", env.config.tickets.repository, "--state", "open", "--label", OWNER, "--json", "number,title", "--limit", "100"]))
    const known = open.find((ticket) => ticket.title === title)
    if (known) return known.number
    const created = await env.github.createTicket({ title, body: reason, labels: [`repo:${repoKey}`, OWNER] })
    await env.github.comment("tickets", created.number, marked("needs-owner", reason))
    holdItem(env, { link: issueLink(env, created.number), reason })
    await say(env, { key: `issue ${created.number}`, lines: ["Orbit needs you: a release is on hold.", cut(reason, DETAIL_LIMIT)], link: issueLink(env, created.number) })
    return created.number
  },
})

/** One tick of the release train: the driver releases every platform on its cadence, staging then production. */
const runReleaseTrain = (env) => releaseTick({ ports: env.releasePorts, stateDir: env.stateDir, now: env.now, dryRun: env.dryRun, log: (line) => env.log(line), tickets: releaseTickets(env) })

/**
 * The commit of origin/main to switch to: it differs from the pin, it changes a driver file, and it is not the commit that
 * the last rollback left. Returns null when there is none. A real tick fetches first; a dry run reads the last fetch.
 */
const newerDriverCommit = async (env, { fetch }) => {
  if (fetch) await gitText(env, env.driverWorktree, ["fetch", "origin", "main"])
  const head = await gitText(env, env.driverWorktree, ["rev-parse", "HEAD"])
  const main = await gitText(env, env.driverWorktree, ["rev-parse", "origin/main"])
  const pin = readPin(env.stateDir)
  if (head === main || rolledBackFrom(pin, main)) return { head, next: null }
  // After a rollback the head is the old commit, so the driver files of the failed commit would count as new: compare with the failed commit.
  const files = (await gitText(env, env.driverWorktree, ["diff", "--name-only", pin?.rolledBack ? pin.from : head, main])).split("\n").filter(Boolean)
  return { head, next: changesDriver(files) ? main : null }
}

/** The dry-run line: the pinned commit of the driver and whether main has a newer driver commit. */
const pinLine = async (env) => {
  const { head, next } = await newerDriverCommit(env, { fetch: false })
  const pin = readPin(env.stateDir)
  return `driver pin ${shortSha(head)}: ${next === null ? "main has no newer driver commit" : `main has a newer driver commit ${shortSha(next)}`}${pin?.rolledBack ? `, rolled back from ${shortSha(pin.from)}` : ""}`
}

/** Checks a commit out in the worktree of the driver, detached and never on a branch. */
const checkoutPin = (env, sha) => gitText(env, env.driverWorktree, ["checkout", "--detach", sha])

/**
 * Writes the rollback pin, tells the owner once and opens one issue. The pin comes first, so a failed report loses nothing:
 * a report that fails is logged and the driver is already on the previous commit.
 */
const reportRollback = async (env, { failedSha, previousSha, error, reason }) => {
  writePin(env.stateDir, { from: failedSha, to: previousSha, at: new Date(env.now()).toISOString(), rolledBack: true, error })
  log(env, "driver", "rollback", `from ${shortSha(failedSha)} to ${shortSha(previousSha)}: ${error}`)
  const title = `Driver rolled back to ${shortSha(previousSha)}`
  try {
    await openProblem(env, { title, body: `The driver went back from ${failedSha} to ${previousSha}. ${reason}\n\nLast error: ${error}\n\nThe driver does not switch to ${failedSha} again. A later commit of main that changes the driver is tried.`, notice: { key: `rollback ${failedSha}`, lines: ["The Orbit driver went back to its previous version because the new one failed.", cut(error, DETAIL_LIMIT)] } })
  } catch (reportError) {
    log(env, "driver", "rollback-report-failed", reportError.message)
  }
}

/**
 * At the end of a tick, moves the driver to the newer driver commit of origin/main, while workers run. A worker is a detached
 * process with its own pid file, launch record and worktree, so the restarted driver adopts it from them. The new commit must
 * start (`--preflight` exits 0); when it does not, the driver goes back at once and stays up. Returns true when the driver must
 * exit with code 0, so launchd starts the new version. No switch happens in a dry run, while the questions run is live (it runs
 * in the driver worktree), while a launch of this tick has no live pid file to adopt, or while a result of this process waits for its reap.
 */
const switchDriver = async (env, mem) => {
  if (!env.selfUpdate || env.dryRun || mem.questions !== null || mem.results.size > 0) return false
  if ([...mem.running.keys()].some((stem) => pidFileOf(env, stem) === null)) return false
  const { head, next } = await newerDriverCommit(env, { fetch: true })
  if (next === null) return false
  await checkoutPin(env, next)
  if (!(await env.smoke(env.driverWorktree))) {
    await checkoutPin(env, head)
    await reportRollback(env, { failedSha: next, previousSha: head, error: "tools/drive.mjs --preflight did not exit 0", reason: "The new version did not start." })
    return false
  }
  writePin(env.stateDir, { from: head, to: next, at: new Date(env.now()).toISOString(), rolledBack: false })
  log(env, "driver", "switch", `from ${shortSha(head)} to ${shortSha(next)}`)
  return true
}

/**
 * The start code of a loop run. It moves the previous run into the crash list. When the new version of the last switch crashed
 * three times within ten minutes of it, it checks the previous commit out, reports once and returns true: the driver exits 0.
 * Otherwise it writes the record of this run.
 */
export const guardStart = async (env) => {
  const head = await gitText(env, env.driverWorktree, ["rev-parse", "HEAD"])
  const crashes = crashesOfSwitch({ pin: readPin(env.stateDir), head, crashes: collectCrash(env.stateDir, env.now()) })
  if (crashes.length > 0) {
    const pin = readPin(env.stateDir)
    await checkoutPin(env, pin.from)
    await reportRollback(env, { failedSha: head, previousSha: pin.from, error: crashes.at(-1).error, reason: `The new version ended with an error ${crashes.length} times within 10 minutes of the switch.` })
    return true
  }
  startRun(env.stateDir, { sha: head, pid: process.pid, now: env.now() })
  return false
}

/** Appends the start time and reports three starts in ten minutes. */
export const recordStart = async (env, tickets = []) => {
  const path = join(env.stateDir, "starts.json")
  let starts = []
  try { starts = JSON.parse(readFileSync(path, "utf8")) } catch { /* the first start has no file */ }
  const now = env.now()
  starts = [...starts, new Date(now).toISOString()].filter((time) => now - Date.parse(time) < 24 * HOUR_MS)
  writeFileSync(path, `${JSON.stringify(starts)}\n`)
  if (starts.filter((time) => now - Date.parse(time) < RESTART_WINDOW_MS).length < 3) {
    forget(env, "restart")
    return false
  }
  if (!tickets.some((ticket) => ticket.title === RESTART_TITLE)) await openProblem(env, { title: RESTART_TITLE, body: "The driver started three times in ten minutes. Read ~/Library/Logs/brain-automations/orbit-drive.log.", notice: { key: "restart", lines: ["The Orbit driver restarted three times in ten minutes."] } })
  return true
}

/** The command that checks a commit of the driver the way a loop start does. */
export const smokeArguments = (worktree) => [process.execPath, join(worktree, "tools", "drive.mjs"), "--preflight"]

const toolOnPath = (name, pathText = process.env.PATH ?? "") => pathText.split(delimiter).some((directory) => directory !== "" && existsSync(join(directory, name)))
export const missingTools = (pathText) => REQUIRED_TOOLS.filter((name) => !toolOnPath(name, pathText))

export const parseArguments = (argv) => {
  const sleepAt = argv.indexOf("--sleep")
  if (sleepAt >= 0) {
    const rest = argv.filter((argument, index) => index !== sleepAt && index !== sleepAt + 1 && argument !== "--help" && argument !== "-h")
    if (!SLEEP_WORDS.includes(argv[sleepAt + 1]) || rest.length > 0) return { error: `--sleep takes one word, on or off, and no other argument` }
    return { help: argv.includes("--help") || argv.includes("-h"), mode: "sleep", word: argv[sleepAt + 1] }
  }
  const paceAt = argv.indexOf("--pace")
  if (paceAt >= 0) {
    const rest = argv.filter((argument, index) => index < paceAt || index > paceAt + 2).filter((argument) => argument !== "--help" && argument !== "-h")
    if (!ACCOUNT_NAMES.includes(argv[paceAt + 1]) || !SLEEP_WORDS.includes(argv[paceAt + 2]) || rest.length > 0) return { error: `--pace takes an account, main or worker, then on or off, and no other argument` }
    return { help: argv.includes("--help") || argv.includes("-h"), mode: "pace", account: argv[paceAt + 1], word: argv[paceAt + 2] }
  }
  const allowAt = argv.indexOf("--allow-over-limit")
  if (allowAt >= 0 && ACCOUNT_NAMES.includes(argv[allowAt + 1])) {
    const rest = argv.filter((argument, index) => index !== allowAt && index !== allowAt + 1 && argument !== "--help" && argument !== "-h")
    if (rest.length > 0) return { error: `unknown or conflicting argument: ${rest[0]}` }
    return { help: argv.includes("--help") || argv.includes("-h"), mode: "allow-over-limit", account: argv[allowAt + 1] }
  }
  const modes = new Set(["--dry-run", "--once", "--probe", "--allow-over-limit", "--reviewer-token", "--preflight", "--release-now", "--release-status"])
  const given = argv.filter((argument) => argument !== "--help" && argument !== "-h")
  const unknown = given.filter((argument) => !modes.has(argument))
  if (unknown.length > 0 || given.length > 1) return { error: `unknown or conflicting argument: ${(unknown[0] ?? given[1])}` }
  return { help: argv.length !== given.length, mode: given[0]?.slice(2) ?? "loop" }
}

const runText = async (file, args, options = {}) => {
  const result = await runBounded(file, args, { timeoutMs: 120 * 1000, ...options })
  if (result.error || result.status !== 0) throw new Error(`${file} ${args.slice(0, 3).join(" ")} failed: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`)
  return result.stdout
}

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * Writes the allow file for the week of the newest reading of one logged-in account (`main`, or `worker` for the second login): the
 * saved reading of the driver, the snapshot of the status line, or one probe. While the file names the week, that account does
 * not stop at 90%. The main account fills the top level of the file and the worker account its `worker` member.
 */
export const allowOverLimit = async (env, { out, err }, name = MAIN) => {
  let status
  try { status = await env.authStatus(name) } catch (error) { err(error.message); return 3 }
  if (status.loggedIn !== true) { err(`Claude is not logged in on the ${name} account, so the week of the usage is unknown.`); return 3 }
  const account = accountFrom(status)
  let saved = null
  try { saved = JSON.parse(readFileSync(join(env.stateDir, PACE_FILE), "utf8")) } catch { /* a first start has no file */ }
  const savedOfAccount = name === WORKER ? saved?.worker : saved
  const snapshot = env.snapshot()
  let reading = newestReading(savedOfAccount?.account === account.key ? savedOfAccount.reading : null, snapshot?.email === status.email ? snapshot : null)
  if (reading === null || reading.resetsAt * 1000 <= env.now()) reading = await env.worker.probe({ invocation: await env.invocation(undefined, name) })
  if (reading === null || reading.resetsAt * 1000 <= env.now()) { err("No reading names the current week. Run: node tools/drive.mjs --probe"); return 3 }
  let allowed = {}
  try { allowed = JSON.parse(readFileSync(join(env.stateDir, ALLOW_FILE), "utf8")) } catch { /* no file means no other allowance */ }
  const entry = { resetsAt: reading.resetsAt, account: account.key, at: new Date(env.now()).toISOString() }
  writeFileSync(join(env.stateDir, ALLOW_FILE), `${JSON.stringify(name === WORKER ? { ...allowed, worker: entry } : { ...entry, ...(allowed.worker ? { worker: allowed.worker } : {}) })}\n`)
  out(`The ${name} account continues over 90% with 1 worker until ${new Date(reading.resetsAt * 1000).toISOString()}.`)
  return 0
}

/** The real seams of the driver. A test builds its own with the same members. */
const realEnvironment = ({ dryRun = false } = {}) => {
  const config = readDriveConfig()
  const stateDir = join(commonDirOf(config.repos.ui), "orbit-drive")
  mkdirSync(join(stateDir, "logs"), { recursive: true })
  const home = homedir()
  return {
    config, dryRun, stateDir, home, github: githubApi, worker: workerApi, now: () => Date.now(), clock: () => performance.now(), lines: [],
    driverWorktree: dirname(dirname(fileURLToPath(import.meta.url))), selfUpdate: false,
    releasePorts: realPorts({ run: runBounded, toolsDirectory: dirname(fileURLToPath(import.meta.url)) }),
    smoke: async (worktree) => { const [file, ...args] = smokeArguments(worktree); return (await runBounded(file, args, { timeoutMs: 60 * 1000 })).status === 0 },
    log: (line) => console.log(line),
    slugOf: (key) => (key === "tickets" ? config.tickets.repository : repositorySlug(config.repos[key])),
    git: (cwd, args) => runBounded("git", ["-C", cwd, ...args], { timeoutMs: 300 * 1000 }),
    findRepositories,
    gh: (args) => runText("gh", args, { maxBuffer: 64 * 1024 * 1024 }),
    fetch: globalThis.fetch,
    osascript: async (message) => { await runBounded("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Orbit driver"`], { timeoutMs: 15 * 1000 }) },
    keychain: async (service) => { const result = await runBounded("security", ["find-generic-password", "-s", service, "-w"], { timeoutMs: 15 * 1000 }); return result.status === 0 && result.stdout.trim() !== "" ? result.stdout.trim() : null },
    fetchJson: async (url, { headers }) => { const response = await fetch(url, { headers }); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return { body: await response.json(), link: response.headers.get("link") } },
    snapshot: () => workerApi.readSnapshot(join(home, ".claude", "usage-snapshot.json")),
    authStatus: async (name = MAIN) => {
      const configDirectory = workerApi.workerConfigDirectory(home)
      // The worker login is optional: a missing directory is a signed-out account, and the check must not create it.
      if (name === WORKER && !existsSync(configDirectory)) return { loggedIn: false }
      const result = await runBounded("claude", ["auth", "status", "--json"], { timeoutMs: 30 * 1000, ...(name === WORKER ? { env: workerApi.workerAccountEnvironment(process.env, configDirectory) } : {}) })
      try { return JSON.parse(result.stdout) } catch { throw new Error(`claude auth status --json gave no JSON (exit ${result.status ?? "none"})`) }
    },
    processAlive: workerApi.isWorkerProcess,
    // EPERM means a process of another user holds the pid, so the pid is held.
    pidHeld: (pid) => { try { process.kill(pid, 0); return true } catch (error) { return error.code === "EPERM" } },
    invocation: async (token, name = MAIN, own = null) => workerApi.workerInvocation({ home, parentEnvironment: process.env, token: token ?? (await workerApi.readWorkerToken()) ?? "probe-only", configDirectory: name === WORKER ? workerApi.workerConfigDirectory(home) : null, own }),
    sleep: (ms, mem) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); mem.wake = () => { clearTimeout(timer); resolve() } }),
  }
}

const commonDirOf = (repoPath) => {
  const result = spawnSync("git", ["-C", repoPath, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git could not name the common directory of ${repoPath}: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

export const main = async (argv, { out = console.log, err = console.error, stdin = readStdin, runGh = (args, input) => runBounded("gh", args, { timeoutMs: 60 * 1000, input }), slugs = null } = {}) => {
  const parsed = parseArguments(argv)
  if (parsed.error) { err(`${parsed.error}\n${USAGE}`); return 2 }
  if (parsed.help) { out(USAGE); return 0 }
  if (parsed.mode === "reviewer-token") {
    const token = (await stdin()).trim()
    if (token === "") { err(`The token is empty. Pipe it on stdin: pbpaste | node tools/drive.mjs --reviewer-token`); return 2 }
    let repositories = slugs
    try { repositories ??= REPOSITORY_KEYS.map((key) => repositorySlug(readDriveConfig().repos[key])) } catch (error) { err(error.message); return 3 }
    return setReviewerToken({ token, slugs: repositories, runGh, out })
  }
  const missing = missingTools()
  if (missing.length > 0) { err(`Missing from PATH: ${missing.join(", ")}`); return 3 }
  let env
  try { env = realEnvironment({ dryRun: parsed.mode === "dry-run" }) } catch (error) { err(error.message); return 3 }
  if (parsed.mode === "preflight") return 0
  const mem = createMemory()
  env.selfUpdate = parsed.mode === "loop"
  if (parsed.mode === "allow-over-limit") return allowOverLimit(env, { out, err }, parsed.account)
  if (parsed.mode === "sleep") return setSleep(env, parsed.word, { out })
  if (parsed.mode === "pace") return setPace(env, parsed.account, parsed.word, { out })
  if (parsed.mode === "release-status") { out(trainSummary(env.stateDir)); return 0 }
  if (parsed.mode === "release-now") {
    const running = requestTrain(env.stateDir)
    out(running === null ? "The driver starts a release train on its next tick, within 2 minutes, when a service has unreleased work." : `A release train already runs: ${running}`)
    return 0
  }
  if (parsed.mode === "probe") {
    const reading = await env.worker.probe({ invocation: await env.invocation() })
    if (reading === null) { out("The probe returned no rate limit event."); return 0 }
    out(`utilization ${reading.utilization}, resetsAt ${reading.resetsAt} (${new Date(reading.resetsAt * 1000).toISOString()}), age 0 minutes, status ${reading.status}`)
    return 0
  }
  if (parsed.mode !== "loop") return runDriver(env, mem, parsed.mode, err)
  if (await guardStart(env)) return 0
  const outcome = { exitCode: null, error: null }
  const keepError = (text) => { outcome.error = lastLine(text); err(text) }
  // A signal ends the run with code 0 at once, so a SIGKILL that follows a slow tick is no crash.
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => endRun(env.stateDir, { exitCode: 0, error: null, now: env.now() }))
  try {
    outcome.exitCode = await runDriver(env, mem, "loop", keepError)
    return outcome.exitCode
  } catch (error) {
    // The entry point exits with 3 on a thrown error.
    outcome.exitCode = 3
    outcome.error = lastLine(error.message)
    throw error
  } finally {
    endRun(env.stateDir, { ...outcome, now: env.now() })
  }
}

/** The ticks of one run: one tick for `--dry-run` and `--once`, the loop for the rest. Returns the exit code. */
const runDriver = async (env, mem, mode, err) => {
  if (await env.worker.readWorkerToken() === null && mode !== "dry-run") { err("The Keychain item orbit-worker-github-token is missing."); return 3 }
  if (mode !== "dry-run") {
    await recordStart(env, await env.github.readTickets().catch(() => []))
    spawn("caffeinate", ["-i", "-w", String(process.pid)], { detached: true, stdio: "ignore" }).unref()
  }
  let stopping = false
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; mem.wake() })
  do {
    mem.woken = false
    let result = null
    try { result = await tick(env, mem) } catch (error) { log(env, "tick", "error", error.message) }
    if (mode === "dry-run") return 0
    if (mode === "once") { await Promise.all([...mem.running.values(), mem.questions]); await reapExits(env, mem).catch((error) => log(env, "tick", "error", error.message)); return 0 }
    if (result?.switched) return 0
    // A worker that exited during the tick frees its slot, so the next tick starts at once.
    if (!stopping && !mem.woken) await env.sleep(TICK_MS, mem)
  } while (!stopping)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(3) })
}
