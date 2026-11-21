#!/usr/bin/env node

/**
 * The delivery driver. A program, not a model: each tick it reads GitHub, acts on every open pull request, and starts at
 * most one Sonnet worker. It merges at the owner's bar. All state lives on GitHub, in `git worktree list` and in its own
 * pid files, so a restart loses nothing.
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { readDriveConfig } from "./lib/config.mjs"
import { escapeRegex } from "./lib/escape-regex.mjs"
import { WORKTREE_REMOVE_ARGUMENTS, parseWorktreeList } from "./lib/git-worktrees.mjs"
import { repositorySlug } from "./lib/github-auth.mjs"
import * as githubApi from "./lib/github.mjs"
import { classifyCheckFailure, failedChecks, holds, isReviewPass, mergeBar, needsWholeDiff, sentryCandidate, sentryIssues, setReviewerToken, wholeDiffApproved } from "./lib/github.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { partOf, renderOrder } from "./lib/order.mjs"
import * as workerApi from "./lib/worker.mjs"

const USAGE = `usage: drive.mjs [--dry-run | --once | --probe | --reviewer-token] [--help]

  The delivery driver. It reads GitHub each tick, acts on every open ticket and pull request, runs one worker at a
  time at a weekly pace, and merges at the owner's bar. It spends no tokens while it waits.

  (no flag)   run the loop: one tick each 120 seconds until stopped
  --dry-run   read everything, print one line for each open ticket and pull request with the action the driver would
              take, write nothing and spawn nothing
  --once      run one real tick, wait for a worker that the tick started, then exit
  --probe     run one pace probe and print the reading (utilization, resetsAt, age)
  --reviewer-token  read a Claude OAuth token on stdin and set CLAUDE_CODE_OAUTH_TOKEN in the three repositories;
              print each repository's result and never the token
  --help, -h  print this usage and exit 0

exit codes: 0 done, 2 usage error, 3 missing tool, configuration or credential`

const TICK_MS = 120 * 1000
const HOUR_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * HOUR_MS
const PACE_FACTOR = 0.95
const PACE_SPAN_MS = 48 * HOUR_MS
const PACE_MAX_GAP_MS = 6 * HOUR_MS
const PACE_DEFAULT_COST = 0.01
const PACE_MIN_ORDERS = 3
const PACE_RESET_TOLERANCE_SECONDS = 3600
const REQUIRED_TOOLS = ["node", "git", "gh", "claude", "security", "osascript", "caffeinate"]
const REPOSITORY_KEYS = ["ui", "api", "landing"]
const FIX_KINDS = ["fix", "ci-fix", "merge-forward"]
const MAX_ORDER_LAUNCHES = 2
const MAX_FIX_LAUNCHES = 2
const MERGED_TTL_MS = 10 * 60 * 1000
const MERGED_READS_PER_TICK = 10
const REMAINING_NONE = /^Remaining: none\s*$/m
const MISSING_AFTER_RUN_MS = 15 * 60 * 1000
const MISSING_AFTER_REQUEST_MS = 30 * 60 * 1000
const TICKET_COMMENT_LIMIT = 65000
const RESTART_WINDOW_MS = 10 * 60 * 1000
const BRANCH_TYPE = { Bug: "fix", Feature: "feature", Improvement: "chore" }
const PAUSE_TITLE = "Driver paused: a worker stopped at a usage limit or a sign-in failure"
const RESTART_TITLE = "Driver restarted three times in ten minutes"
const LOGIN_TITLE = "Driver stopped: Claude is not logged in"
const LOGIN_MESSAGE = "Orbit driver: Claude is not logged in, so no worker starts."
const OWNER = "needs:owner"
const CHANGES_REQUESTED = "CHANGES_REQUESTED"
const PLAIN_REQUEST = "@pullfrog review"
const WHOLE_DIFF_REQUEST = "@pullfrog review whole diff"
const TAIL_BYTES = 256 * 1024
const PULLFROG_LOG_END_LINES = 40

export const marked = (kind, text) => `<!-- orbit-drive:${kind} -->\n${text}`
const firstLine = (text) => text.split("\n", 1)[0]
const bodyAfterMarker = (comment) => comment.body.split("\n").slice(1).join("\n")
const minutes = (ms) => Math.round(ms / 60000)

/** The launch records on a ticket, parsed from its `launch` comments. */
export const launchesOf = (ticket) => (ticket?.comments ?? []).filter((entry) => entry.kind === "launch").flatMap((entry) => {
  try { return [JSON.parse(bodyAfterMarker(entry))] } catch { return [] }
})

/** Parts of a ticket, oldest comment first, one entry for each part number. */
const partsOf = (ticket) => {
  const byNumber = new Map()
  // The owner's comments are read oldest first, whatever order the API lists them in, so a later comment of a part replaces an earlier one.
  for (const entry of [...ticket.comments].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const part = entry.kind === null ? partOf(entry) : null
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
 * The utilization that one admitted build or find order uses: over the readings of the last 48 hours in the current
 * week, the rise divided by the orders launched in that span. Under 3 orders, or with no rise, it is the default.
 */
export const orderCost = ({ history, newest, now }) => {
  const week = history.readings.filter((entry) => now - entry.at <= PACE_SPAN_MS && Math.abs(entry.resetsAt - newest.resetsAt) < PACE_RESET_TOLERANCE_SECONDS).sort((left, right) => left.at - right.at)
  if (week.length < 2) return PACE_DEFAULT_COST
  const [first, last] = [week[0], week.at(-1)]
  const orders = history.launches.filter((at) => at >= first.at && at <= last.at).length
  const cost = orders < PACE_MIN_ORDERS ? 0 : (last.utilization - first.utilization) / orders
  return cost > 0 ? cost : PACE_DEFAULT_COST
}

/**
 * The pace decision: `admit`, `slow` or `probe`, never a stop. Over `line` (share of the week gone times 0.95) the gap is
 * cost x hours / left, at most 6 hours. With no usable reading the gap is 6 hours. A stale reading gets one probe, at most once an hour, and only once its gap has passed.
 */
export const paceDecision = ({ reading, now, lastProbeAt = null, history = { readings: [], launches: [] } }) => {
  const end = reading === null ? null : reading.resetsAt * 1000
  const usable = end !== null && end > now
  const probeDue = lastProbeAt === null || now - lastProbeAt >= HOUR_MS
  const gapFrom = (figures, gapMs) => {
    const lastLaunch = history.launches.length === 0 ? null : Math.max(...history.launches)
    const nextAt = lastLaunch === null ? now : Math.max(now, lastLaunch + gapMs)
    return { ...figures, gapMs, nextAt }
  }
  if (!usable) {
    const unknown = { utilization: reading?.utilization ?? null, line: null, left: null, hours: null, cost: null }
    const decided = gapFrom(unknown, PACE_MAX_GAP_MS)
    return { action: probeDue ? "probe" : decided.nextAt > now ? "slow" : "admit", ...decided }
  }
  const line = ((now - (end - WEEK_MS)) / WEEK_MS) * PACE_FACTOR
  const left = PACE_FACTOR - reading.utilization
  const hours = (end - now) / HOUR_MS
  const cost = orderCost({ history, newest: reading, now })
  const gapMs = reading.utilization <= line ? 0 : left <= 0 ? PACE_MAX_GAP_MS : Math.min(PACE_MAX_GAP_MS, Math.max(0, (cost * hours * HOUR_MS) / left))
  const decided = gapFrom({ utilization: reading.utilization, line, left, hours, cost }, gapMs)
  if (now - reading.at > HOUR_MS && probeDue && decided.nextAt <= now) return { action: "probe", ...decided }
  return { action: decided.nextAt > now ? "slow" : "admit", ...decided }
}

const newestReading = (...readings) => readings.filter(Boolean).sort((left, right) => right.at - left.at)[0] ?? null

/** The account of a `claude auth status --json` answer, keyed on its organization and email. The key is a hash, so it can appear in a log or an issue. */
export const accountFrom = (status) => ({ key: createHash("sha256").update(`${status.orgId}\n${status.email}`).digest("hex").slice(0, 16), email: status.email, orgId: status.orgId, subscriptionType: status.subscriptionType })

/** A reading counts only for the account that took it: a worker event for the account of its launch, the snapshot for its email. */
const readingsOfAccount = (env, mem) => {
  if (mem.account === null) return []
  const snapshot = env.snapshot()
  return [mem.reading?.account === mem.account.key ? mem.reading : null, snapshot?.email === mem.account.email ? snapshot : null]
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

export const createMemory = () => ({ running: null, runningStem: null, results: new Map(), lastProbeAt: null, reading: null, notified: new Set(), lastIntakeAt: 0, known: {}, wake: () => {}, checkedRuns: new Set(), updateTypes: new Map(), merged: new Map(), mergedReadsLeft: 0, mergedReadThisTick: new Set(), account: null, probeOwed: false, orphans: new Map(), paceLoaded: false, history: { readings: [], launches: [] } })

const log = (env, item, action, reason = "") => env.log(`${new Date(env.now()).toISOString()} ${item} ${action}${reason === "" ? "" : ` (${reason})`}`)

const notifyOnce = async (env, mem, message) => {
  if (mem.notified.has(message)) return
  mem.notified.add(message)
  if (!env.dryRun) await env.notify(message)
}

/**
 * Writes one `needs-owner` comment, labels the ticket and the pull request `needs:owner` when they lack it, and notifies.
 * The comment is the mark that stops a repeat: a ticket that an owner gate already labelled still gets each new report.
 * A ticket repeats only for the same reason, and a report on a pull request names it and its head. A pull request with no
 * ticket carries one report, whatever its reason.
 */
const needsOwner = async (env, mem, { ticket, repoKey = null, pull = null, reason: plainReason }) => {
  const item = pull ? `${repoKey}#${pull.number}` : `ticket#${ticket.number}`
  const reason = ticket && pull ? `${item} at ${pull.headSha}: ${plainReason}` : plainReason
  log(env, item, "needs-owner", reason)
  const comments = ticket ? ticket.comments : pull.comments
  if (env.dryRun || comments.some((entry) => entry.kind === "needs-owner" && (ticket === null || bodyAfterMarker(entry).trim() === reason))) return
  if (ticket && !ticket.labels.includes(OWNER)) {
    await env.github.editLabels("tickets", ticket.number, { add: [OWNER] })
    ticket.labels.push(OWNER)
  }
  if (pull && !pull.labels.includes(OWNER)) {
    try { await env.github.editLabels(repoKey, pull.number, { add: [OWNER] }); pull.labels.push(OWNER) } catch (error) { log(env, item, "label-failed", error.message) }
  }
  await env.github.comment(ticket ? "tickets" : repoKey, ticket ? ticket.number : pull.number, marked("needs-owner", reason))
  comments.push({ kind: "needs-owner", body: marked("needs-owner", reason), createdAt: new Date(env.now()).toISOString() })
  await env.notify(`Orbit driver needs you: ${reason}`)
}

const PACE_FILE = "pace.json"

/** Keeps the newest reading, the time of the last probe and the pace history beside the pid files, so a restart neither probes again inside the hour nor forgets the last launch. */
const savePace = (env, mem) => {
  if (!env.dryRun) writeFileSync(join(env.stateDir, PACE_FILE), `${JSON.stringify({ account: mem.account?.key ?? null, lastProbeAt: mem.lastProbeAt, reading: mem.reading, history: mem.history })}\n`)
}

/** Adds the readings of this account that the history lacks, drops what is older than the span, and saves. */
const recordReadings = (env, mem, readings) => {
  const now = env.now()
  const known = new Set(mem.history.readings.map((entry) => `${entry.at}:${entry.utilization}:${entry.resetsAt}`))
  for (const { at, utilization, resetsAt } of readings) if (!known.has(`${at}:${utilization}:${resetsAt}`)) mem.history.readings.push({ at, utilization, resetsAt })
  mem.history.readings = mem.history.readings.filter((entry) => now - entry.at <= PACE_SPAN_MS)
  mem.history.launches = mem.history.launches.filter((at) => now - at <= PACE_SPAN_MS)
}

/** Makes a reading the newest of the account, keeps it in the pace history and saves the pace. */
const setReading = (env, mem, reading) => {
  mem.reading = reading
  recordReadings(env, mem, [reading])
  savePace(env, mem)
}

/** Loads the saved pace once after a start, and only when the account that saved it is the account that is logged in. */
const loadPace = (env, mem) => {
  if (mem.paceLoaded) return
  mem.paceLoaded = true
  try {
    const saved = JSON.parse(readFileSync(join(env.stateDir, PACE_FILE), "utf8"))
    if (saved.account !== mem.account.key) return
    mem.lastProbeAt ??= saved.lastProbeAt ?? null
    mem.reading ??= saved.reading ?? null
    if (saved.history) mem.history = { readings: saved.history.readings ?? [], launches: saved.history.launches ?? [] }
  } catch { /* a first start has no file */ }
}

const pauseIssue = (tickets) => tickets.find((ticket) => ticket.title === PAUSE_TITLE) ?? null

/** Pauses admission: a log line, a notification and one issue that holds the message and the reset time. */
const pauseDriver = async (env, mem, tickets, { source, message, reset, account = mem.account?.key ?? null }) => {
  log(env, "driver", "pause", `${source}: ${message}`)
  if (env.dryRun || pauseIssue(tickets)) return
  await env.notify(`Orbit driver paused: ${source} stopped. ${message}`)
  const created = await env.github.createTicket({ title: PAUSE_TITLE, body: `${source} stopped.\n\nMessage: ${message}\n\nReset time named by the message: ${reset ?? "none named"}${account === null ? "" : `\n\nAccount: ${account}`}`, labels: [OWNER] })
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
 * Reads the default Claude login each tick. A change of account drops the readings of the old one, ends a usage-limit
 * pause that the old one hit, and owes a probe before the next build or find order. A logged-out login stops every worker.
 * Returns `{ ok, reason }`: with `ok` false the tick starts no worker.
 */
const trackAccount = async (env, mem, tickets) => {
  let status
  try {
    status = await env.authStatus()
  } catch (error) {
    log(env, "account", "unreadable", error.message)
    return { ok: false, reason: "the Claude login cannot be read" }
  }
  const loginIssue = tickets.find((ticket) => ticket.title === LOGIN_TITLE) ?? null
  if (status.loggedIn !== true) {
    log(env, "account", "logged-out", "no worker starts")
    if (!env.dryRun) {
      await notifyOnce(env, mem, LOGIN_MESSAGE)
      if (loginIssue === null) {
        const created = await env.github.createTicket({ title: LOGIN_TITLE, body: "The default Claude login is signed out. Run claude auth login, then the driver starts workers again.", labels: [OWNER] })
        tickets.push({ number: created.number, title: LOGIN_TITLE, labels: [OWNER], comments: [], blockedBy: [], body: "" })
      }
    }
    return { ok: false, reason: "Claude is not logged in" }
  }
  mem.notified.delete(LOGIN_MESSAGE)
  if (loginIssue !== null && !env.dryRun) await closeIssue(env, tickets, loginIssue, "Claude is logged in again. The driver starts workers again.")
  const account = accountFrom(status)
  if (mem.account !== null && mem.account.key !== account.key) {
    log(env, "account", "changed", `orgId ${account.orgId}, ${account.subscriptionType}`)
    mem.reading = null
    mem.history = { readings: [], launches: [] }
    mem.lastProbeAt = null
    mem.probeOwed = true
  }
  mem.account = account
  loadPace(env, mem)
  const paused = pauseIssue(tickets)
  if (paused !== null && pauseAccount(paused) !== null && pauseAccount(paused) !== account.key) {
    log(env, "driver", "resume", "the Claude account changed")
    mem.probeOwed = true
    if (!env.dryRun) await closeIssue(env, tickets, paused, "The Claude account changed, so the pause ends. The driver probes the new account before the next build order.")
  }
  return { ok: true, reason: null }
}

/** One pace probe. A reading with status `allowed` while the driver is paused resumes it. */
const runProbe = async (env, mem, tickets) => {
  const takenAt = env.now()
  mem.lastProbeAt = takenAt
  savePace(env, mem)
  const reading = await env.worker.probe({ invocation: await env.invocation() })
  if (reading === null) {
    log(env, "pace", "probe-failed", "no rate limit event, so the gap of the newest reading applies and the probe repeats after 1 hour")
    if (!env.dryRun) await env.notify("Orbit driver: the pace probe returned no rate limit event, so the gap of the newest reading applies. The driver probes again in 1 hour.")
    return null
  }
  setReading(env, mem, { utilization: reading.utilization, resetsAt: reading.resetsAt, at: takenAt, account: mem.account?.key ?? null })
  mem.probeOwed = false
  const paused = pauseIssue(tickets)
  if (paused && reading.status === "allowed") {
    await closeIssue(env, tickets, paused, `The probe reads status allowed (${Math.round(reading.utilization * 100)} percent of the week). The driver resumes.`)
    log(env, "driver", "resume", "the probe reads status allowed")
  }
  return mem.reading
}

const findPullByBranch = (states, branch) => states.flatMap((state) => state.pulls.map((pull) => ({ state, pull }))).find(({ pull }) => pull.headRef === branch)

const requestsOf = (pull) => pull.comments.filter((entry) => entry.kind === "request").map((entry) => ({ ...entry, whole: /whole diff/.test(bodyAfterMarker(entry)) })).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
const newestAt = (reviews) => reviews.reduce((newest, review) => (review.submittedAt > newest ? review.submittedAt : newest), "")

/** The review passes of a pull request, without the replies that Pullfrog posts to its own threads. */
const passesOf = (pull) => pull.reviews.filter(isReviewPass)

/** The commit of the newest review pass before a request. */
const commitBefore = (pull, request) => passesOf(pull).filter((entry) => entry.submittedAt < request.createdAt).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)).at(-1)?.commit

/** The time of the first whole-diff request for each head sha: the head is the commit of the newest review pass before the request. */
const wholeDiffRequestTimes = (pull) => {
  const times = {}
  for (const request of requestsOf(pull).filter((entry) => entry.whole)) {
    const commit = commitBefore(pull, request)
    if (commit !== undefined && (times[commit] === undefined || request.createdAt < times[commit])) times[commit] = request.createdAt
  }
  return times
}

/** The whole-diff requests for the head that a later review pass answered. */
const answeredWholeDiffRequests = (pull) => requestsOf(pull).filter((request) => request.whole && commitBefore(pull, request) === pull.headSha && passesOf(pull).some((entry) => entry.submittedAt > request.createdAt)).length

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

/** What the pull request waits on at its head, from the Pullfrog reviews and runs: a plain request, a whole-diff request, a fix, or nothing. */
const reviewNeed = ({ pull, ticket, fixLaunches, now, runs }) => {
  const passes = passesOf(pull)
  const atHead = passes.filter((review) => review.commit === pull.headSha).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
  const latest = atHead.at(-1) ?? null
  const sinceReview = requestsOf(pull).filter((entry) => entry.createdAt > newestAt(passes))
  const waiting = () => {
    const lastRequest = sinceReview.at(-1)
    const after = runs.filter((run) => Date.parse(run.createdAt) >= Date.parse(lastRequest.createdAt))
    const lastRun = after.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)
    if (lastRun && lastRun.status !== "completed") return { wait: "a Pullfrog run is in progress" }
    const missed = lastRun ? now - Date.parse(lastRun.updatedAt) >= MISSING_AFTER_RUN_MS : now - Date.parse(lastRequest.createdAt) >= MISSING_AFTER_REQUEST_MS
    if (!missed) return { wait: "waiting for the Pullfrog review" }
    return sinceReview.length === 1 ? { request: lastRequest.whole ? WHOLE_DIFF_REQUEST : PLAIN_REQUEST, why: "no review after the first request", lastRun } : { owner: "Pullfrog gave no review after two requests", lastRun }
  }
  const demand = (text, why) => (sinceReview.length === 0 ? { request: text, why } : waiting())
  if (latest === null) return demand(PLAIN_REQUEST, "no Pullfrog review at this head")
  if (latest.state === "APPROVED") {
    const context = { wholeDiffRequests: wholeDiffRequestTimes(pull), cleanMerges: pull.cleanMerges ?? [] }
    if (!needsWholeDiff(pull, { fixLaunches }) || wholeDiffApproved(pull, context)) return { approved: true }
    // A whole-diff pass that lacks its "Whole diff:" line gets one re-request, then the owner.
    if (answeredWholeDiffRequests(pull) >= 2) return { owner: "Pullfrog answered two whole-diff requests at this head with no whole-diff review" }
    return demand(WHOLE_DIFF_REQUEST, "an approval-head pass is owed")
  }
  if (latest.state === CHANGES_REQUESTED && latest.blocking.length > 0) return { fix: latest }
  const unusable = atHead.filter((review) => review.state === "COMMENTED" || (review.state === CHANGES_REQUESTED && review.blocking.length === 0))
  if (unusable.length >= 2) return { owner: "Pullfrog gave a review with no BLOCKING comment twice at the same head" }
  return demand(PLAIN_REQUEST, "the last review at this head names no BLOCKING class")
}

const failedLogLines = async (env, repoKey, runId) => {
  try {
    const slug = env.slugOf(repoKey)
    return (await env.gh(["run", "view", String(runId), "--repo", slug, "--log-failed"])).split("\n").slice(-120)
  } catch {
    return []
  }
}

/** The check part of a plan: a rerun, the owner, or a ci-fix order. Null when no check failed. */
const checkPlan = async (env, repoKey, pull) => {
  const failed = failedChecks(pull)
  if (failed.length === 0) return null
  const checks = []
  const rerun = new Set()
  for (const check of failed) {
    const failedSteps = check.runId === null ? [] : await env.github.readFailedSteps(repoKey, check.runId, check.jobId)
    const verdict = classifyCheckFailure({ name: check.name, failedSteps })
    if (verdict === "needs-owner") return { owner: `${check.name} asks for a deployment barrier, which only the owner writes` }
    const logLines = verdict === "rerun" || check.runId === null ? [] : await failedLogLines(env, repoKey, check.runId)
    const gatewayTimeout = logLines.some((line) => /HTTP 504|504 Gateway/.test(line))
    const already = pull.comments.some((entry) => entry.kind === "record" && bodyAfterMarker(entry) === `driver rerun ${check.runId}`)
    if ((verdict === "rerun" || gatewayTimeout) && check.runId !== null && !already) rerun.add(check.runId)
    else checks.push({ name: check.name, failedSteps, logLines })
  }
  return rerun.size > 0 ? { rerun: [...rerun] } : { checks }
}

/** The ordered actions for one pull request. The plan writes nothing. */
const planPull = async (env, mem, { repoKey, state, ticketMap, now, runs, busy }, pull) => {
  const dependabot = pull.author === "dependabot"
  const item = `${repoKey}#${pull.number}`
  if (pull.draft) return [{ type: "none", reason: "draft" }]
  if (pull.tracks === null && !dependabot) return [{ type: "none", reason: "untracked: no Tracks line" }]
  const ticket = pull.tracks === null ? null : ticketMap.get(pull.tracks) ?? null
  const blockers = ticket?.blockedBy.filter((blocker) => blocker.open).map((blocker) => blocker.number) ?? []
  if (blockers.length > 0) return [{ type: "none", reason: `blocked by ${blockers.join(", ")}` }]
  const hasTicketComment = pull.comments.some((entry) => entry.kind === "ticket")
  const request = (text) => ({ type: "request", text, ticketComment: !dependabot && ticket !== null && !hasTicketComment })
  if (pull.baseRef !== state.defaultBranch && !state.pulls.some((other) => other.headRef === pull.baseRef)) {
    return [{ type: "retarget", base: state.defaultBranch }, { type: "update" }, request(PLAIN_REQUEST)]
  }
  const launches = launchesOf(ticket).filter((entry) => entry.branch === pull.headRef && FIX_KINDS.includes(entry.kind))
  const actions = []
  const owner = (reason) => [...actions, { type: "needs-owner", reason }]
  const orderOrOwner = (order, classes) => {
    // A worker order is recorded on a ticket, so a pull request with no open ticket goes to the owner.
    if (ticket === null) return owner(`${item} needs a ${order.kind} order and no open ticket tracks it. Open: ${classes}`)
    if (launches.length < MAX_FIX_LAUNCHES) return [...actions, order]
    // A launch that still runs is in the count, so a cap is read only when the lane is free and the last launch has its result.
    if (busy) return [...actions, { type: "none", reason: "a worker runs: the fix launch cap waits for its result" }]
    return owner(`${item} used its ${MAX_FIX_LAUNCHES} fix launches. Open: ${classes}`)
  }
  const need = reviewNeed({ pull, ticket, fixLaunches: launches.length, now, runs })
  if (need.approved) {
    const open = pull.threads.filter((thread) => !thread.resolved && thread.author === "pullfrog")
    if (open.length > 0) {
      actions.push({ type: "resolve-threads", ids: open.map((thread) => thread.id) })
      for (const thread of open) thread.resolved = true
    }
  }
  if (need.fix) return orderOrOwner({ type: "order", kind: "fix", repoKey, pull, ticket, review: need.fix }, need.fix.blocking.map((entry) => `${entry.path}:${entry.line}`).join(", "))
  const checks = await checkPlan(env, repoKey, pull)
  if (checks?.owner) return owner(checks.owner)
  if (checks?.rerun) return [...actions, ...checks.rerun.map((runId) => ({ type: "rerun", runId }))]
  if (checks?.checks) return orderOrOwner({ type: "order", kind: "ci-fix", repoKey, pull, ticket, failure: { checks: checks.checks } }, checks.checks.map((check) => check.name).join(", "))
  if (pull.mergeState === "DIRTY") return orderOrOwner({ type: "order", kind: "merge-forward", repoKey, pull, ticket, failure: {} }, "merge conflict with the base branch")
  if (need.owner) return owner(need.owner)
  if (need.request) return [...actions, request(need.request)]
  if (need.wait) return [...actions, { type: "none", reason: need.wait }]
  const context = { fixLaunches: launches.length, wholeDiffRequests: wholeDiffRequestTimes(pull), cleanMerges: pull.cleanMerges ?? [], blockers: [], ticketLabels: ticket?.labels ?? [], updateTypes: dependabot ? await dependabotTypes(env, mem, repoKey, pull) : undefined }
  const bar = mergeBar(pull, context)
  if (dependabot && bar.includes("dependabot-major")) return owner(`Dependabot pull request ${item} is a major update`)
  if (bar.length === 0) return [...actions, { type: "merge" }]
  const onlyBehind = bar.every((failure) => failure.startsWith("behind:") || failure === "merge-state:BEHIND")
  return [...actions, onlyBehind ? { type: "behind", behindBy: pull.behindBy } : { type: "none", reason: `the bar fails: ${bar.join(", ")}` }]
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

const executeAction = async (env, mem, ctx, pull, action) => {
  const { repoKey, ticketMap } = ctx
  const ticket = pull.tracks === null ? null : ticketMap.get(pull.tracks) ?? null
  const part = ticket === null ? null : partsOf(ticket).find((entry) => partBranch(ticket.number, entry.number).test(pull.headRef)) ?? null
  switch (action.type) {
    case "retarget": return env.github.retarget(repoKey, pull.number, action.base)
    case "resolve-threads": return env.github.resolveThreads(action.ids)
    case "request":
      if (action.ticketComment) await env.github.comment(repoKey, pull.number, ticketComment({ repository: env.config.tickets.repository, ticket, part }))
      return env.github.comment(repoKey, pull.number, marked("request", action.text))
    case "rerun":
      await env.github.rerunFailed(repoKey, action.runId)
      return env.github.comment(repoKey, pull.number, marked("record", `driver rerun ${action.runId}`))
    case "needs-owner": return needsOwner(env, mem, { ticket, repoKey, pull, reason: action.reason })
    // The child still holds its parent's commits, so main is merged in before the first pass reads its diff.
    case "update": return updateBranch(env, repoKey, pull)
    case "behind":
      if (ctx.updated) return log(env, `${repoKey}#${pull.number}`, "wait", "another pull request is next to merge")
      ctx.updated = true
      return updateBranch(env, repoKey, pull)
    case "merge":
      await env.github.merge(repoKey, pull.number, pull.headSha)
      ctx.merged = true
      mem.merged.delete(pull.tracks)
      await outsideTicket(env, repoKey, pull)
      return undefined
    default: return undefined
  }
}

const describe = (action) => (action.type === "none" ? `wait: ${action.reason}` : action.type === "order" ? `order ${action.kind}` : action.type === "needs-owner" ? `needs:owner: ${action.reason}` : action.type === "request" ? `request ${action.text}${action.ticketComment ? " after the ticket comment" : ""}` : action.type === "behind" ? "update branch (next to merge)" : action.type === "update" ? "update branch (retargeted child)" : action.type)

/** Plans and runs the actions of every open pull request of one repository. Returns the order candidates. */
const pullActions = async (env, mem, repoKey, state, tickets, busy) => {
  const ticketMap = new Map(tickets.map((ticket) => [ticket.number, ticket]))
  const ctx = { repoKey, state, ticketMap, now: env.now(), updated: false, merged: false, busy }
  const orders = []
  const repoPath = env.config.repos[repoKey]
  for (const pull of [...state.pulls].sort((left, right) => left.number - right.number)) {
    const item = `${repoKey}#${pull.number}`
    try {
      const awaiting = requestsOf(pull).some((entry) => entry.createdAt > newestAt(passesOf(pull)))
      const runs = pull.draft || !awaiting ? [] : await env.github.pullfrogRunsFor(repoKey, pull.number)
      if (!pull.draft && pull.reviews.some((review) => review.state === "APPROVED")) pull.cleanMerges = await cleanMergesOf(env, repoPath, pull)
      const plan = await planPull(env, mem, { ...ctx, runs }, pull)
      const newestRequest = requestsOf(pull).reduce((newest, entry) => (entry.createdAt > newest ? entry.createdAt : newest), "")
      // A run from before the newest request is settled history: a request that came after it started a new run.
      const pausedByLog = await pullfrogLimit(env, mem, tickets, repoKey, runs.filter((run) => Date.parse(run.createdAt) >= Date.parse(newestRequest)))
      env.lines.push(`pull ${item}: ${plan.map(describe).join("; ")}${pausedByLog ? " (Pullfrog hit a usage limit)" : ""}`)
      for (const action of plan) {
        if (action.type === "order") orders.push(action)
        else if (action.type !== "none") {
          log(env, item, describe(action))
          if (!env.dryRun) await executeAction(env, mem, ctx, pull, action)
        }
        if (ctx.merged) break
      }
    } catch (error) {
      log(env, item, "error", error.message)
    }
    if (ctx.merged) break
  }
  return orders
}

/** A failed Pullfrog run is read once: a usage-limit message pauses the driver. */
const pullfrogLimit = async (env, mem, tickets, repoKey, runs) => {
  for (const run of runs.filter((entry) => entry.status === "completed" && entry.conclusion === "failure" && !mem.checkedRuns.has(entry.databaseId))) {
    let logText
    try {
      logText = await env.gh(["run", "view", String(run.databaseId), "--repo", env.slugOf(repoKey), "--log-failed"])
    } catch (error) {
      // A log that was not read is read again on the next tick: only a read log marks its run as checked.
      log(env, repoKey, "pullfrog-log-unread", error.message)
      continue
    }
    mem.checkedRuns.add(run.databaseId)
    // A run that stops at a limit ends on the message. Text that the run only read or echoed sits far before the end.
    const found = workerApi.usageLimitIn(logText.split("\n").slice(-PULLFROG_LOG_END_LINES).join("\n"))
    if (found) {
      await pauseDriver(env, mem, tickets, { source: "Pullfrog", ...found })
      return true
    }
  }
  return false
}

const gitText = async (env, cwd, args) => {
  const result = await env.git(cwd, args)
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

/** The worktree of an order: a build order adds one from `origin/main`, the rest reuse the pull request's. */
const prepareWorktree = async (env, repoKey, branch, fresh) => {
  const repoPath = env.config.repos[repoKey]
  const listed = parseWorktreeList(await gitText(env, repoPath, ["worktree", "list", "--porcelain"])).find((entry) => entry.branch === branch)
  if (listed) {
    if (!fresh) {
      await gitText(env, listed.path, ["fetch", "origin", branch])
      await gitText(env, listed.path, ["merge", "--ff-only", `origin/${branch}`])
    }
    return listed.path
  }
  const path = join(dirname(repoPath), "orbit-worktrees", repoKey, branch.replaceAll("/", "-"))
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

/** Starts one worker for an order and records its launch on the ticket first, so a crash still counts. */
const startWorker = async (env, mem, candidate) => {
  const order = { ...candidate, branch: candidate.branch ?? candidate.pull.headRef }
  const { kind, repoKey, ticket, pull = null, part = null, branch, extra = "" } = order
  const token = await env.worker.readWorkerToken()
  if (token === null) {
    await notifyOnce(env, mem, "Orbit driver: the Keychain item orbit-worker-github-token is missing, so no worker starts.")
    return log(env, `ticket#${ticket.number}`, "refused", "no worker token in the Keychain")
  }
  await env.github.comment("tickets", ticket.number, marked("launch", JSON.stringify({ kind, part: part?.number ?? null, branch, pr: pull?.number ?? null, at: new Date(env.now()).toISOString() })))
  ticket.comments.push({ kind: "launch", body: marked("launch", JSON.stringify({ kind, part: part?.number ?? null, branch, pr: pull?.number ?? null })), createdAt: new Date(env.now()).toISOString() })
  if (!FIX_KINDS.includes(kind)) { mem.history.launches.push(env.now()); savePace(env, mem) }
  const worktree = await prepareWorktree(env, repoKey, branch, pull === null)
  const headBefore = await gitText(env, worktree, ["rev-parse", "HEAD"])
  const stem = branch.replaceAll("/", "-")
  const place = { repoKey, repoPath: env.config.repos[repoKey], worktree, branch, base: "main" }
  const text = renderOrder({ kind, ticket: ticketForOrder(env, ticket, extra), partComments: ticket.comments.filter((entry) => entry.kind === null), findings: kind === "build part" ? ticket.comments.filter((entry) => entry.kind === "findings") : [], pull, review: order.review, failure: order.failure, place, partNumber: part?.number ?? null })
  const stamp = new Date(env.now()).toISOString().replace(/[:.]/g, "-")
  const logFile = join(env.stateDir, "logs", `${stem}-${stamp}.log`)
  const invocation = await env.invocation(token)
  const account = mem.account?.key ?? null
  // The worker writes its rate limit event right after its first message, so the reading belongs to the launch time.
  const startedAt = env.now()
  // What a reap needs lives on disk beside the pid file, so a worker that outlives a restart of the driver is still reaped.
  writeFileSync(launchRecordPath(env, stem), `${JSON.stringify({ kind, repoKey, ticketNumber: ticket.number, partNumber: part?.number ?? null, branch, prNumber: pull?.number ?? null, worktree, headBefore, logFile, account, startedAt })}\n`)
  const running = env.worker.launch({ invocation, worktree, order: text, logFile, pidFile: join(env.stateDir, `${stem}.pid`) })
  log(env, `ticket#${ticket.number}`, `launch ${kind}`, `branch ${branch}, worktree ${worktree}`)
  mem.runningStem = stem
  mem.running = running.then((result) => {
    mem.running = null
    mem.runningStem = null
    mem.results.set(stem, result)
    mem.wake()
  })
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
const workerRuns = (env, mem, stem) => {
  if (mem.runningStem === stem) return true
  return pidFileOf(env, stem) !== null
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
    if (mem.runningStem === stem) continue
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

/** The exit of a worker that this process did not wait for: the session, the reading and the verdict that its log holds. */
const exitFromLog = (logFile) => ({ spawnError: null, exitCode: null, killed: null, killReason: null, ...workerApi.logEvent(logFile), result: workerApi.logFinalResult(logFile) })

/** What a worker's exit leaves to do: records, a pause, a question, or a findings comment. */
const reapExit = async (env, mem, tickets, states, exit) => {
  const { kind, repoKey, branch, partNumber, prNumber, headBefore, worktree, logFile, account, startedAt, result } = exit
  // The ticket as this read holds it, so a label that the owner wrote is seen. A ticket that is closed by now keeps a bare stand-in.
  const ticket = tickets.find((entry) => entry.number === exit.ticketNumber) ?? { number: exit.ticketNumber, title: "", body: "", labels: [], comments: [], blockedBy: [] }
  const item = `ticket#${ticket.number}`
  const newerReading = mem.reading?.account === account && mem.reading.at > startedAt
  if (result.utilization !== null && account !== null && !newerReading) setReading(env, mem, { utilization: result.utilization, resetsAt: result.resetsAt, at: startedAt, account })
  log(env, item, "worker-exit", `${kind}, exit ${result.exitCode}${result.killReason ? `, killed: ${result.killReason}` : ""}`)
  const tail = tailOf(logFile)
  if (result.result.usageLimitReached || result.result.authenticationFailed) {
    const message = result.result.error ?? "the worker stopped"
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

const removeWorktrees = async (env, repoKey, branches) => {
  const repoPath = env.config.repos[repoKey]
  const listed = parseWorktreeList(await gitText(env, repoPath, ["worktree", "list", "--porcelain"]))
  for (const branch of branches) {
    const entry = listed.find((candidate) => candidate.branch === branch)
    if (entry) {
      const removed = await env.git(repoPath, [...WORKTREE_REMOVE_ARGUMENTS, entry.path])
      if (removed.status !== 0) { log(env, repoKey, "worktree-kept", removed.stderr.trim()); continue }
    }
    await env.git(repoPath, ["branch", "-D", branch])
  }
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

/** What admission does with one ticket: an order, or the reason it waits. */
const ticketVerdict = async (env, mem, states, ticket, { settled = false } = {}) => {
  const labels = ticket.labels
  const stop = (reason) => ({ reason })
  const repoLabels = labels.filter((label) => label.startsWith("repo:"))
  if (repoLabels.length !== 1) return stop("needs exactly one repo label")
  for (const label of [OWNER, "needs:conversation", "owner-work"]) if (labels.includes(label)) return stop(`carries ${label}`)
  const open = ticket.blockedBy.filter((blocker) => blocker.open)
  if (open.length > 0) return stop(`blocked by ${open.map((blocker) => blocker.number).join(", ")}`)
  for (const blocker of ticket.blockedBy) {
    const unmet = await env.github.unmetDeployFirst(blocker)
    if (unmet.length > 0) return stop(`deploy-first ${unmet.map((hold) => `${hold.environment}/${hold.task}`).join(", ")} of ${blocker.number} is not deployed`)
  }
  const state = states.find((entry) => entry.repositoryKey === ticket.repoKey)
  const tracking = state.pulls.filter((pull) => pull.tracks === ticket.number)
  const parts = partsOf(ticket)
  if (parts.length === 0 && tracking.length > 0) return stop("an open pull request tracks it")
  if (settled) return stop("queued behind the admitted or held order")
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
    const remaining = history.length === 0 ? "" : `Remaining after the merged pull requests: ${/^Remaining:.*$/m.exec(history.at(-1).body)?.[0] ?? "Remaining: unknown"}`
    return { order: { kind: "build", repoKey: ticket.repoKey, ticket, branch, extra: remaining } }
  }
  const partDone = (entry) => (entry.find ? ticket.comments.some((comment) => comment.kind === "findings" && firstLine(bodyAfterMarker(comment)) === `Findings, part ${entry.number}`) : [...doneBranches].some((branch) => partBranch(ticket.number, entry.number).test(branch)))
  const inFlight = (entry) => tracking.some((pull) => partBranch(ticket.number, entry.number).test(pull.headRef))
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
    await env.notify(`Orbit driver: owner-work ticket ${ticket.number} is ready.`)
  }
}

const admit = async (env, mem, tickets, states, busy) => {
  const decisions = new Map()
  let chosen = null
  let held = false
  for (const ticket of rankTickets(tickets)) {
    const verdict = await ticketVerdict(env, mem, states, ticket, { settled: chosen !== null || held })
    if (verdict.reason) {
      decisions.set(ticket.number, verdict.owner ? `needs:owner: ${verdict.reason}` : `wait: ${verdict.reason}`)
      if (verdict.owner) await needsOwner(env, mem, { ticket, reason: verdict.owner })
      continue
    }
    const launches = launchesOf(ticket).filter((entry) => entry.branch === verdict.order.branch && entry.kind === verdict.order.kind)
    if (launches.length >= MAX_ORDER_LAUNCHES && busy) {
      // The newest launch may be the worker that still runs, so the cap waits for its result.
      decisions.set(ticket.number, "wait: a worker runs and the order waits for its result")
      continue
    }
    if (launches.length >= MAX_ORDER_LAUNCHES) {
      decisions.set(ticket.number, "needs:owner: the order used its launches")
      await needsOwner(env, mem, { ticket, reason: `The ${verdict.order.kind} order of ${verdict.order.branch} launched ${launches.length} times without a result` })
      continue
    }
    if (chosen !== null || held) {
      decisions.set(ticket.number, `queued: ${verdict.order.kind}`)
      continue
    }
    let pace = decidePace(env, mem)
    if (pace.action === "probe" && !env.dryRun) {
      await runProbe(env, mem, tickets)
      pace = decidePace(env, mem)
    }
    held = pace.action !== "admit"
    if (!held) chosen = verdict.order
    decisions.set(ticket.number, held ? paceWait(pace) : `admit ${verdict.order.kind} on ${verdict.order.branch}`)
  }
  return { chosen, decisions }
}

/** What a slowed order says in the dry run and the ticket lines. */
const paceWait = (pace) => {
  if (pace.action === "probe") return "would probe the pace, then admit when the gap allows"
  return `pace slow: next build at ${new Date(pace.nextAt).toISOString()} (gap ${minutes(pace.gapMs)} min)`
}

/** The pace decision from the newest of the worker reading and the snapshot, with its one log line. */
const decidePace = (env, mem) => {
  const readings = readingsOfAccount(env, mem).filter(Boolean)
  recordReadings(env, mem, readings)
  const pace = paceDecision({ reading: mem.probeOwed ? null : newestReading(...readings), now: env.now(), lastProbeAt: mem.lastProbeAt, history: mem.history })
  const figure = (value, digits) => (value === null ? "unknown" : value.toFixed(digits))
  log(env, "pace", pace.action, `utilization ${figure(pace.utilization, 3)}, left ${figure(pace.left, 3)}, hours ${figure(pace.hours, 1)}, cost ${figure(pace.cost, 3)}, gap ${pace.gapMs === null ? "unknown" : `${minutes(pace.gapMs)} min`}, next build ${pace.nextAt === null ? "unknown" : new Date(pace.nextAt).toISOString()}`)
  return { ...pace }
}

/** Hourly: one `Bug` ticket for each Sentry issue and each alert that no ticket, open or closed, holds. */
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
  // Open and closed tickets both count, so a closed ticket keeps its issue from coming back.
  const known = JSON.parse(await env.gh(["issue", "list", "--repo", env.config.tickets.repository, "--state", "all", "--limit", "5000", "--json", "title,body"])).map((ticket) => `${ticket.title}\n${ticket.body}`)
  for (const candidate of candidates.filter((entry) => !known.some(entry.held))) {
    log(env, "intake", "ticket", candidate.label)
    if (!env.dryRun) await env.github.createTicket({ title: candidate.title, body: candidate.body, labels: [`repo:${candidate.repoKey}`, "Bug"] })
  }
}

/** One tick: rebuild the state, reap exits, act on pull requests, run the owner-work notices, admit, and take the hourly intake. */
const readWorld = async (env, mem) => {
  const tickets = await env.github.readTickets()
  const states = []
  for (const key of REPOSITORY_KEYS) states.push(await env.github.readRepositoryState(key, { knownNumbers: mem.known[key] ?? [] }))
  for (const state of states) mem.known[state.repositoryKey] = state.numbers
  return { tickets, states }
}

/**
 * Reaps every worker whose launch record is on disk and whose process is gone, after a restart of the driver too. A tick
 * reaps before it reads GitHub for its own steps, so every later step reads what the reap wrote. The reap has its own
 * read, and it takes one only when a record waits.
 */
const reapExits = async (env, mem) => {
  // A dry run writes nothing, so it leaves every record for the driver that runs.
  if (env.dryRun) return
  const gone = launchRecords(env).filter(({ stem }) => !workerRuns(env, mem, stem))
  if (gone.length === 0) return
  const { tickets, states } = await readWorld(env, mem)
  for (const { stem, record } of gone) {
    rmSync(launchRecordPath(env, stem), { force: true })
    const killedBy = mem.orphans.get(stem)?.reason ?? null
    const result = mem.results.get(stem) ?? { ...exitFromLog(record.logFile), killed: killedBy, killReason: killedBy === null ? null : env.worker.KILL_REASONS[killedBy] }
    mem.results.delete(stem)
    mem.orphans.delete(stem)
    await reapExit(env, mem, tickets, states, { ...record, result }).catch((error) => log(env, `ticket#${record.ticketNumber}`, "error", error.message))
  }
}

export const tick = async (env, mem) => {
  env.lines = []
  await enforceOrphanClocks(env, mem)
  // A worker that runs when the read starts holds the lane for this whole tick, whatever the read shows.
  const busy = mem.running !== null || env.workerLive()
  let world
  try {
    await reapExits(env, mem)
    world = await readWorld(env, mem)
  } catch (error) {
    log(env, "tick", "retry", error.message)
    return { retried: true }
  }
  const { tickets, states } = world
  const account = await trackAccount(env, mem, tickets)
  const orders = []
  for (const state of states) orders.push(...await pullActions(env, mem, state.repositoryKey, state, tickets, busy))
  await ownerWorkNotices(env, mem, tickets)
  mem.mergedReadsLeft = MERGED_READS_PER_TICK
  mem.mergedReadThisTick.clear()
  const closed = await closeFinishedTickets(env, mem, tickets, states)
  const paused = pauseIssue(tickets)
  const holdReason = paused ? "the driver is paused" : account.ok ? null : account.reason
  if (paused && account.ok && !env.dryRun && mem.running === null && (mem.lastProbeAt === null || env.now() - mem.lastProbeAt >= HOUR_MS)) await runProbe(env, mem, tickets).catch((error) => log(env, "probe", "error", error.message))
  const { chosen, decisions } = holdReason ? { chosen: null, decisions: new Map() } : await admit(env, mem, tickets.filter((ticket) => !closed.has(ticket.number)), states, busy)
  for (const ticket of tickets) env.lines.push(`ticket ${env.config.tickets.repository}#${ticket.number}: ${closed.has(ticket.number) ? "close" : holdReason ? `wait: ${holdReason}` : decisions.get(ticket.number) ?? "wait"}`)
  const launchable = orders.filter(() => !holdReason).sort((left, right) => left.pull.number - right.pull.number)[0] ?? (holdReason ? null : chosen)
  if (launchable && busy) log(env, "lane", "wait", "a worker runs")
  else if (launchable && !env.dryRun) await startWorker(env, mem, launchable).catch((error) => log(env, `ticket#${launchable.ticket.number}`, "error", error.message))
  if (!env.dryRun && env.now() - mem.lastIntakeAt >= HOUR_MS) {
    mem.lastIntakeAt = env.now()
    await intake(env, mem).catch((error) => log(env, "intake", "error", error.message))
  }
  if (env.dryRun) for (const line of env.lines) env.log(line)
  return { retried: false, lines: env.lines }
}

/** Appends the start time and reports three starts in ten minutes. */
export const recordStart = async (env, tickets = []) => {
  const path = join(env.stateDir, "starts.json")
  let starts = []
  try { starts = JSON.parse(readFileSync(path, "utf8")) } catch { /* the first start has no file */ }
  const now = env.now()
  starts = [...starts, new Date(now).toISOString()].filter((time) => now - Date.parse(time) < 24 * HOUR_MS)
  writeFileSync(path, `${JSON.stringify(starts)}\n`)
  if (starts.filter((time) => now - Date.parse(time) < RESTART_WINDOW_MS).length < 3) return false
  await env.notify("Orbit driver restarted three times in ten minutes.")
  if (!tickets.some((ticket) => ticket.title === RESTART_TITLE)) await env.github.createTicket({ title: RESTART_TITLE, body: "The driver started three times in ten minutes. Read ~/Library/Logs/orbit-drive.log.", labels: [OWNER] })
  return true
}

const toolOnPath = (name, pathText = process.env.PATH ?? "") => pathText.split(delimiter).some((directory) => directory !== "" && existsSync(join(directory, name)))
export const missingTools = (pathText) => REQUIRED_TOOLS.filter((name) => !toolOnPath(name, pathText))

export const parseArguments = (argv) => {
  const modes = new Set(["--dry-run", "--once", "--probe", "--reviewer-token"])
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

/** The real seams of the driver. A test builds its own with the same members. */
const realEnvironment = ({ dryRun = false } = {}) => {
  const config = readDriveConfig()
  const stateDir = join(commonDirOf(config.repos.ui), "orbit-drive")
  mkdirSync(join(stateDir, "logs"), { recursive: true })
  const home = homedir()
  const live = () => readdirSync(stateDir).filter((name) => name.endsWith(".pid")).some((name) => {
    try { if (workerApi.isWorkerProcess(JSON.parse(readFileSync(join(stateDir, name), "utf8")).pid)) return true } catch { /* an unreadable pid file is stale */ }
    rmSync(join(stateDir, name), { force: true })
    return false
  })
  return {
    config, dryRun, stateDir, home, github: githubApi, worker: workerApi, now: () => Date.now(), lines: [],
    log: (line) => console.log(line),
    slugOf: (key) => (key === "tickets" ? config.tickets.repository : repositorySlug(config.repos[key])),
    git: (cwd, args) => runBounded("git", ["-C", cwd, ...args], { timeoutMs: 300 * 1000 }),
    gh: (args) => runText("gh", args, { maxBuffer: 64 * 1024 * 1024 }),
    notify: async (message) => { await runBounded("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Orbit driver"`], { timeoutMs: 15 * 1000 }) },
    keychain: async (service) => { const result = await runBounded("security", ["find-generic-password", "-s", service, "-w"], { timeoutMs: 15 * 1000 }); return result.status === 0 && result.stdout.trim() !== "" ? result.stdout.trim() : null },
    fetchJson: async (url, { headers }) => { const response = await fetch(url, { headers }); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return { body: await response.json(), link: response.headers.get("link") } },
    snapshot: () => workerApi.readSnapshot(join(home, ".claude", "usage-snapshot.json")),
    authStatus: async () => {
      const result = await runBounded("claude", ["auth", "status", "--json"], { timeoutMs: 30 * 1000 })
      try { return JSON.parse(result.stdout) } catch { throw new Error(`claude auth status --json gave no JSON (exit ${result.status ?? "none"})`) }
    },
    workerLive: live,
    processAlive: workerApi.isWorkerProcess,
    invocation: async (token) => workerApi.workerInvocation({ home, parentEnvironment: process.env, token: token ?? (await workerApi.readWorkerToken()) ?? "probe-only" }),
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
  const mem = createMemory()
  if (parsed.mode === "probe") {
    const reading = await env.worker.probe({ invocation: await env.invocation() })
    if (reading === null) { out("The probe returned no rate limit event."); return 0 }
    out(`utilization ${reading.utilization}, resetsAt ${reading.resetsAt} (${new Date(reading.resetsAt * 1000).toISOString()}), age 0 minutes, status ${reading.status}`)
    return 0
  }
  if (await env.worker.readWorkerToken() === null && parsed.mode !== "dry-run") { err("The Keychain item orbit-worker-github-token is missing."); return 3 }
  if (parsed.mode !== "dry-run") {
    await recordStart(env, await env.github.readTickets().catch(() => []))
    spawn("caffeinate", ["-i", "-w", String(process.pid)], { detached: true, stdio: "ignore" }).unref()
  }
  let stopping = false
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; mem.wake() })
  do {
    try { await tick(env, mem) } catch (error) { log(env, "tick", "error", error.message) }
    if (parsed.mode === "dry-run") return 0
    if (parsed.mode === "once") { await mem.running; await reapExits(env, mem).catch((error) => log(env, "tick", "error", error.message)); return 0 }
    if (!stopping) await env.sleep(TICK_MS, mem)
  } while (!stopping)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(3) })
}
