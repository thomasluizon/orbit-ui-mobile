#!/usr/bin/env node

/**
 * The delivery driver. A program, not a model: each tick it reads GitHub, acts on every open pull request, and starts at
 * most one Sonnet worker. It merges at the owner's bar. All state lives on GitHub, in `git worktree list` and in its own
 * pid files, so a restart loses nothing.
 */

import { spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { readDriveConfig } from "./lib/config.mjs"
import { escapeRegex } from "./lib/escape-regex.mjs"
import { WORKTREE_REMOVE_ARGUMENTS, parseWorktreeList } from "./lib/git-worktrees.mjs"
import { repositorySlug } from "./lib/github-auth.mjs"
import * as githubApi from "./lib/github.mjs"
import { classifyCheckFailure, failedChecks, mergeBar, needsWholeDiff, wholeDiffApproved } from "./lib/github.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { partOf, renderOrder } from "./lib/order.mjs"
import * as workerApi from "./lib/worker.mjs"

const USAGE = `usage: drive.mjs [--dry-run | --once | --probe] [--help]

  The delivery driver. It reads GitHub each tick, acts on every open ticket and pull request, runs one worker at a
  time inside the weekly pace, and merges at the owner's bar. It spends no tokens while it waits.

  (no flag)   run the loop: one tick each 120 seconds until stopped
  --dry-run   read everything, print one line for each open ticket and pull request with the action the driver would
              take, write nothing and spawn nothing
  --once      run one real tick, wait for a worker that the tick started, then exit
  --probe     run one pace probe and print the reading (utilization, resetsAt, age)
  --help, -h  print this usage and exit 0

exit codes: 0 done, 2 usage error, 3 missing tool, configuration or credential`

export const TICK_MS = 120 * 1000
const HOUR_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * HOUR_MS
const PACE_FACTOR = 0.95
const REQUIRED_TOOLS = ["node", "git", "gh", "claude", "security", "osascript", "caffeinate"]
const REPOSITORY_KEYS = ["ui", "api", "landing"]
const FIX_KINDS = ["fix", "ci-fix", "merge-forward"]
const MAX_ORDER_LAUNCHES = 2
const MAX_FIX_LAUNCHES = 2
const MISSING_AFTER_RUN_MS = 15 * 60 * 1000
const MISSING_AFTER_REQUEST_MS = 30 * 60 * 1000
const TICKET_COMMENT_LIMIT = 65000
const RESTART_WINDOW_MS = 10 * 60 * 1000
const BRANCH_TYPE = { Bug: "fix", Feature: "feature", Improvement: "chore" }
const PAUSE_TITLE = "Driver paused: a worker stopped at a usage limit or a sign-in failure"
const RESTART_TITLE = "Driver restarted three times in ten minutes"
const OWNER = "needs:owner"
const PLAIN_REQUEST = "@pullfrog review"
const WHOLE_DIFF_REQUEST = "@pullfrog review whole diff"
const TAIL_BYTES = 256 * 1024

export const marked = (kind, text) => `<!-- orbit-drive:${kind} -->\n${text}`
const firstLine = (text) => text.split("\n", 1)[0]
const bodyAfterMarker = (comment) => comment.body.split("\n").slice(1).join("\n")
const minutes = (ms) => Math.round(ms / 60000)

/** The launch records on a ticket, parsed from its `launch` comments. */
export const launchesOf = (ticket) => (ticket?.comments ?? []).filter((entry) => entry.kind === "launch").flatMap((entry) => {
  try { return [JSON.parse(bodyAfterMarker(entry))] } catch { return [] }
})

/** Parts of a ticket, oldest comment first, one entry for each part number. */
export const partsOf = (ticket) => {
  const byNumber = new Map()
  for (const entry of ticket.comments) {
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
export const chainLengths = (tickets) => {
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

/** The pace decision: `admit`, `hold` or `probe`. `line` is the share of the week gone times 0.95. */
export const paceDecision = ({ reading, now, lastProbeAt = null }) => {
  const probeOrHold = lastProbeAt !== null && now - lastProbeAt < HOUR_MS ? "hold" : "probe"
  if (reading === null || reading.resetsAt * 1000 <= now) return { action: probeOrHold, utilization: reading?.utilization ?? null, line: null }
  const end = reading.resetsAt * 1000
  const line = ((now - (end - WEEK_MS)) / WEEK_MS) * PACE_FACTOR
  if (reading.utilization > line) return { action: "hold", utilization: reading.utilization, line }
  return { action: now - reading.at > HOUR_MS ? probeOrHold : "admit", utilization: reading.utilization, line }
}

/** The reading that the snapshot of the status line holds, or null. The email field is never read. */
export const readSnapshot = (path) => {
  try {
    const snapshot = JSON.parse(readFileSync(path, "utf8"))
    const window = snapshot.rateLimits?.seven_day
    if (typeof window?.used_percentage !== "number" || !Number.isInteger(window.resets_at)) return null
    return { utilization: window.used_percentage / 100, resetsAt: window.resets_at, at: Date.parse(snapshot.at) }
  } catch {
    return null
  }
}

const newestReading = (...readings) => readings.filter(Boolean).sort((left, right) => right.at - left.at)[0] ?? null

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

/** The first line of a failed log that is a usage-limit message, with the reset time it names; null when there is none. */
export const usageLimitIn = (logText, isLimit = workerApi.isUsageLimitMessage) => {
  for (const line of logText.split("\n")) {
    const message = line.replace(/^.*?\d{4}-\d\d-\d\dT[\d:.]+Z /, "").trim()
    if (isLimit(message)) return { message, reset: /(?:resets?|until)\s+([^.\n·]+)/i.exec(message)?.[1]?.trim() ?? null }
  }
  return null
}

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

export const createMemory = () => ({ running: null, exits: [], lastProbeAt: null, reading: null, notified: new Set(), lastIntakeAt: 0, known: {}, wake: () => {}, checkedRuns: new Set(), updateTypes: new Map() })

const log = (env, item, action, reason = "") => env.log(`${new Date(env.now()).toISOString()} ${item} ${action}${reason === "" ? "" : ` (${reason})`}`)

const notifyOnce = async (env, mem, message) => {
  if (mem.notified.has(message)) return
  mem.notified.add(message)
  if (!env.dryRun) await env.notify(message)
}

/** Labels the ticket (and the pull request) `needs:owner`, then writes one `needs-owner` comment. Nothing repeats once the ticket carries the label. */
const needsOwner = async (env, mem, { ticket, repoKey = null, pull = null, reason }) => {
  const item = pull ? `${repoKey}#${pull.number}` : `ticket#${ticket.number}`
  log(env, item, "needs-owner", reason)
  if (env.dryRun || (ticket ? ticket.labels.includes(OWNER) : pull.labels.includes(OWNER))) return
  if (ticket) {
    await env.github.editLabels("tickets", ticket.number, { add: [OWNER] })
    ticket.labels.push(OWNER)
  }
  if (pull && !pull.labels.includes(OWNER)) {
    try { await env.github.editLabels(repoKey, pull.number, { add: [OWNER] }); pull.labels.push(OWNER) } catch (error) { log(env, item, "label-failed", error.message) }
  }
  await env.github.comment(ticket ? "tickets" : repoKey, ticket ? ticket.number : pull.number, marked("needs-owner", reason))
  await env.notify(`Orbit driver needs you: ${reason}`)
}

const pauseIssue = (tickets) => tickets.find((ticket) => ticket.title === PAUSE_TITLE) ?? null

/** Pauses admission: a log line, a notification and one issue that holds the message and the reset time. */
const pauseDriver = async (env, mem, tickets, { source, message, reset }) => {
  log(env, "driver", "pause", `${source}: ${message}`)
  if (env.dryRun || pauseIssue(tickets)) return
  await env.notify(`Orbit driver paused: ${source} stopped. ${message}`)
  const created = await env.github.createTicket({ title: PAUSE_TITLE, body: `${source} stopped.\n\nMessage: ${message}\n\nReset time named by the message: ${reset ?? "none named"}`, labels: [OWNER] })
  tickets.push({ number: created.number, title: PAUSE_TITLE, labels: [OWNER], comments: [], blockedBy: [], body: "" })
}

/** One pace probe. A reading with status `allowed` while the driver is paused resumes it. */
const runProbe = async (env, mem, tickets) => {
  mem.lastProbeAt = env.now()
  const reading = await env.worker.probe({ invocation: await env.invocation() })
  if (reading === null) {
    await notifyOnce(env, mem, "Orbit driver: the pace probe returned no rate limit event, so no new build order starts.")
    return null
  }
  mem.reading = { utilization: reading.utilization, resetsAt: reading.resetsAt, at: env.now() }
  const paused = pauseIssue(tickets)
  if (paused && reading.status === "allowed") {
    await env.github.comment("tickets", paused.number, `The probe reads status allowed (${Math.round(reading.utilization * 100)} percent of the week). The driver resumes.`)
    await env.github.closeTicket(paused.number)
    tickets.splice(tickets.indexOf(paused), 1)
    log(env, "driver", "resume", "the probe reads status allowed")
  }
  return mem.reading
}

const findPullByBranch = (states, branch) => states.flatMap((state) => state.pulls.map((pull) => ({ state, pull }))).find(({ pull }) => pull.headRef === branch)

const requestsOf = (pull) => pull.comments.filter((entry) => entry.kind === "request").map((entry) => ({ ...entry, whole: /whole diff/.test(bodyAfterMarker(entry)) }))
const newestAt = (reviews) => reviews.reduce((newest, review) => (review.submittedAt > newest ? review.submittedAt : newest), "")

/** The head sha each driver whole-diff request belongs to: the commit of the newest review before the request. */
const wholeDiffRequestTimes = (pull) => {
  const times = {}
  for (const request of requestsOf(pull).filter((entry) => entry.whole)) {
    const review = pull.reviews.filter((entry) => entry.submittedAt < request.createdAt).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)).at(-1)
    if (review && (times[review.commit] === undefined || request.createdAt < times[review.commit])) times[review.commit] = request.createdAt
  }
  return times
}

/** The shas of the two-parent commits of a pull request whose remerge diff is empty. */
const cleanMergesOf = async (env, repoPath, pull) => {
  const merges = pull.commits.filter((commit) => commit.parents === 2)
  if (merges.length === 0) return []
  await env.git(repoPath, ["fetch", "origin", `refs/pull/${pull.number}/head`])
  const clean = []
  for (const merge of merges) if ((await env.git(repoPath, ["show", "--remerge-diff", "--format=", merge.sha])).stdout.trim() === "") clean.push(merge.sha)
  return clean
}

/** What the pull request waits on at its head, from the Pullfrog reviews and runs: a plain request, a whole-diff request, a fix, or nothing. */
const reviewNeed = ({ pull, ticket, fixLaunches, now, runs }) => {
  const atHead = pull.reviews.filter((review) => review.commit === pull.headSha).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
  const latest = atHead.at(-1) ?? null
  const sinceReview = requestsOf(pull).filter((entry) => entry.createdAt > newestAt(pull.reviews))
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
    return needsWholeDiff(pull, { fixLaunches }) && !wholeDiffApproved(pull, context) ? demand(WHOLE_DIFF_REQUEST, "an approval-head pass is owed") : { approved: true }
  }
  if (latest.state === "REQUEST_CHANGES" && latest.blocking.length > 0) return { fix: latest }
  const unusable = atHead.filter((review) => review.state === "COMMENTED" || (review.state === "REQUEST_CHANGES" && review.blocking.length === 0))
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
export const planPull = async (env, mem, { repoKey, state, ticketMap, now, runs }, pull) => {
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
    return [{ type: "retarget", base: state.defaultBranch }, request(PLAIN_REQUEST)]
  }
  const launches = launchesOf(ticket).filter((entry) => entry.branch === pull.headRef && FIX_KINDS.includes(entry.kind))
  const actions = []
  const owner = (reason) => [...actions, { type: "needs-owner", reason }]
  const orderOrOwner = (order, classes) => (launches.length >= MAX_FIX_LAUNCHES ? owner(`${item} used its ${MAX_FIX_LAUNCHES} fix launches. Open: ${classes}`) : [...actions, order])
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

const executeAction = async (env, mem, ctx, pull, action) => {
  const { repoKey, ticketMap } = ctx
  const ticket = pull.tracks === null ? null : ticketMap.get(pull.tracks) ?? null
  const part = ticket === null ? null : partsOf(ticket).find((entry) => new RegExp(`ticket-\\d+-part-${entry.number}$`).test(pull.headRef)) ?? null
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
    case "behind": {
      if (ctx.updated) return log(env, `${repoKey}#${pull.number}`, "wait", "another pull request is next to merge")
      ctx.updated = true
      await env.github.updateBranch(repoKey, pull.number)
      const head = (await env.gh(["pr", "view", String(pull.number), "--repo", env.slugOf(repoKey), "--json", "headRefOid", "--jq", ".headRefOid"])).trim()
      if (head !== pull.headSha) await env.github.comment(repoKey, pull.number, marked("record", `driver update-branch -> ${head}`))
      return undefined
    }
    case "merge":
      await env.github.merge(repoKey, pull.number, pull.headSha)
      ctx.merged = true
      await outsideTicket(env, repoKey, pull)
      return undefined
    default: return undefined
  }
}

const describe = (action) => (action.type === "none" ? `wait: ${action.reason}` : action.type === "order" ? `order ${action.kind}` : action.type === "needs-owner" ? `needs:owner: ${action.reason}` : action.type === "request" ? `request ${action.text}${action.ticketComment ? " after the ticket comment" : ""}` : action.type === "behind" ? "update branch (next to merge)" : action.type)

/** Plans and runs the actions of every open pull request of one repository. Returns the order candidates. */
const pullActions = async (env, mem, repoKey, state, tickets) => {
  const ticketMap = new Map(tickets.map((ticket) => [ticket.number, ticket]))
  const ctx = { repoKey, state, ticketMap, now: env.now(), updated: false, merged: false }
  const orders = []
  const repoPath = env.config.repos[repoKey]
  for (const pull of [...state.pulls].sort((left, right) => left.number - right.number)) {
    const item = `${repoKey}#${pull.number}`
    try {
      const awaiting = requestsOf(pull).some((entry) => entry.createdAt > newestAt(pull.reviews))
      const runs = pull.draft || !awaiting ? [] : await env.github.pullfrogRunsFor(repoKey, pull.number)
      if (!pull.draft && pull.reviews.some((review) => review.state === "APPROVED")) pull.cleanMerges = await cleanMergesOf(env, repoPath, pull)
      const plan = await planPull(env, mem, { ...ctx, runs }, pull)
      const pausedByLog = await pullfrogLimit(env, mem, tickets, repoKey, runs)
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
    mem.checkedRuns.add(run.databaseId)
    const found = usageLimitIn(await env.gh(["run", "view", String(run.databaseId), "--repo", env.slugOf(repoKey), "--log-failed"]))
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
  const worktree = await prepareWorktree(env, repoKey, branch, pull === null)
  const headBefore = await gitText(env, worktree, ["rev-parse", "HEAD"])
  const place = { repoKey, repoPath: env.config.repos[repoKey], worktree, branch, base: "main" }
  const text = renderOrder({ kind, ticket: ticketForOrder(env, ticket, extra), partComments: ticket.comments.filter((entry) => entry.kind === null), findings: kind === "build part" ? ticket.comments.filter((entry) => entry.kind === "findings") : [], pull, review: order.review, failure: order.failure, place, partNumber: part?.number ?? null })
  const stamp = new Date(env.now()).toISOString().replace(/[:.]/g, "-")
  const stem = branch.replaceAll("/", "-")
  const invocation = await env.invocation(token)
  const running = env.worker.launch({ invocation, worktree, order: text, logFile: join(env.stateDir, "logs", `${stem}-${stamp}.log`), pidFile: join(env.stateDir, `${stem}.pid`) })
  log(env, `ticket#${ticket.number}`, `launch ${kind}`, `branch ${branch}, worktree ${worktree}`)
  mem.running = running.then((result) => {
    mem.running = null
    mem.exits.push({ order, result, headBefore, worktree, logFile: join(env.stateDir, "logs", `${stem}-${stamp}.log`) })
    mem.wake()
  })
}

/** What a worker's exit leaves to do: records, a pause, a question, or a findings comment. */
const reapExit = async (env, mem, tickets, states, exit) => {
  const { order, result, headBefore, worktree, logFile } = exit
  const { kind, repoKey, ticket, branch, part } = order
  const item = `ticket#${ticket.number}`
  if (result.utilization !== null) mem.reading = { utilization: result.utilization, resetsAt: result.resetsAt, at: env.now() }
  log(env, item, "worker-exit", `${kind}, exit ${result.exitCode}${result.killReason ? `, killed: ${result.killReason}` : ""}`)
  const tail = tailOf(logFile)
  if (result.result.usageLimitReached || result.result.authenticationFailed) {
    const message = result.result.error ?? "the worker stopped"
    return pauseDriver(env, mem, tickets, { source: result.result.usageLimitReached ? "A worker" : "A worker sign-in", message, reset: usageLimitIn(message)?.reset ?? null })
  }
  if (/The requested URL returned error: 403|remote: Permission to .* denied/.test(tail)) return needsOwner(env, mem, { ticket, reason: `The worker push failed with HTTP 403 on ${branch}` })
  if (result.result.needsDecision) return needsOwner(env, mem, { ticket, reason: `NEEDS_DECISION: ${result.result.needsDecision}` })
  if (kind === "find") {
    const text = resultText(tail)
    if (text !== "") await env.github.comment("tickets", ticket.number, marked("findings", `Findings, part ${part.number}\n\n${text}`))
    return removeWorktrees(env, repoKey, [branch])
  }
  const shas = (await gitText(env, worktree, ["log", "--format=%H", `${headBefore}..HEAD`])).split("\n").filter(Boolean).reverse()
  const found = findPullByBranch(states, branch)
  const number = order.pull?.number ?? found?.pull.number ?? Number((await env.gh(["pr", "list", "--repo", env.slugOf(repoKey), "--head", branch, "--json", "number", "--jq", ".[0].number"])).trim())
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

/** The merged pull requests that track a ticket. */
const mergedFor = async (env, ticket) => {
  const repository = env.config.tickets.repository
  const out = await env.gh(["pr", "list", "--repo", env.slugOf(ticket.repoKey), "--state", "merged", "--search", `"Tracks ${repository}#${ticket.number}" in:body`, "--json", "number,body,mergedAt,headRefName", "--limit", "50"])
  const pattern = new RegExp(`Tracks ${escapeRegex(repository)}#${ticket.number}(?!\\d)`)
  return JSON.parse(out).filter((pull) => pattern.test(pull.body))
}

/** What admission does with one ticket: an order, a close, or the reason it waits. */
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
  // Another order is admitted or held, so a ticket with no history of its own waits without a read of its merged pull requests.
  if (settled && launchesOf(ticket).length === 0 && tracking.length === 0) return stop("queued behind the admitted or held order")
  const history = await mergedFor(env, ticket)
  const doneBranches = new Set(history.map((pull) => pull.headRefName))
  if (history.some((pull) => /^Remaining: none\s*$/m.test(pull.body)) && tracking.length === 0) return { close: true, merged: history }
  const used = new Set([...doneBranches, ...state.pulls.map((pull) => pull.headRef)])
  if (parts.length === 0) {
    if (tracking.length > 0) return stop("an open pull request tracks it")
    const remaining = history.length === 0 ? "" : `Remaining after the merged pull requests: ${history.map((pull) => /^Remaining:.*$/m.exec(pull.body)?.[0] ?? "").filter(Boolean).at(-1) ?? "Remaining: unknown"}`
    return { order: { kind: "build", repoKey: ticket.repoKey, ticket, branch: branchName(ticket, null, used), extra: remaining } }
  }
  const partDone = (entry) => (entry.find ? ticket.comments.some((comment) => comment.kind === "findings" && firstLine(bodyAfterMarker(comment)) === `Findings, part ${entry.number}`) : [...doneBranches].some((branch) => new RegExp(`ticket-${ticket.number}-part-${entry.number}$`).test(branch)))
  const inFlight = (entry) => tracking.some((pull) => new RegExp(`ticket-${ticket.number}-part-${entry.number}$`).test(pull.headRef))
  const pending = parts.filter((entry) => !partDone(entry) && !inFlight(entry))
  const openParts = parts.filter(inFlight)
  const foreign = tracking.some((pull) => !parts.some((entry) => inFlight(entry) && new RegExp(`ticket-${ticket.number}-part-${entry.number}$`).test(pull.headRef)))
  for (const entry of pending) {
    const earlierDone = parts.filter((other) => other.number < entry.number).every(partDone)
    let free = earlierDone && openParts.length === 0 && !foreign
    if (!free && entry.paths !== null && !foreign && openParts.every((other) => other.paths !== null)) {
      free = true
      for (const other of openParts) if (await pathsOverlap(env, env.config.repos[ticket.repoKey], entry.paths, other.paths)) free = false
    }
    if (free) return { order: { kind: entry.find ? "find" : "build part", repoKey: ticket.repoKey, ticket, part: entry, branch: branchName(ticket, entry.number, used), extra: "" } }
  }
  return stop(pending.length > 0 ? "the next part waits for an open part" : tracking.length > 0 ? "an open pull request tracks it" : "no part is left to run")
}

/** Closes a ticket after its last merge: the comment, the close, the board Status and the worktrees. */
const closeFinished = async (env, ticket, verdict) => {
  log(env, `ticket#${ticket.number}`, "close", "a merged pull request says Remaining: none")
  if (env.dryRun) return
  await env.github.comment("tickets", ticket.number, marked("close", `Closed by the driver: ${verdict.merged.map((pull) => `#${pull.number}`).join(", ")} merged with Remaining: none.`))
  await env.github.closeTicket(ticket.number)
  await removeWorktrees(env, ticket.repoKey, verdict.merged.map((pull) => pull.headRefName))
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

const admit = async (env, mem, tickets, states) => {
  const decisions = new Map()
  let chosen = null
  let held = false
  for (const ticket of rankTickets(tickets)) {
    const verdict = await ticketVerdict(env, mem, states, ticket, { settled: chosen !== null || held })
    if (verdict.close) {
      decisions.set(ticket.number, "close")
      await closeFinished(env, ticket, verdict)
      continue
    }
    if (verdict.reason) {
      decisions.set(ticket.number, `wait: ${verdict.reason}`)
      continue
    }
    const launches = launchesOf(ticket).filter((entry) => entry.branch === verdict.order.branch && entry.kind === verdict.order.kind)
    if (launches.length >= MAX_ORDER_LAUNCHES) {
      decisions.set(ticket.number, "needs:owner: the order used its launches")
      await needsOwner(env, mem, { ticket, reason: `The ${verdict.order.kind} order of ${verdict.order.branch} launched ${launches.length} times without a result` })
      continue
    }
    if (chosen !== null || held) {
      decisions.set(ticket.number, `queued: ${verdict.order.kind}`)
      continue
    }
    const pace = decidePace(env, mem)
    if (pace.action === "probe" && !env.dryRun) {
      const fresh = await runProbe(env, mem, tickets)
      pace.action = fresh !== null && paceDecision({ reading: fresh, now: env.now(), lastProbeAt: mem.lastProbeAt }).action === "admit" ? "admit" : "hold"
      log(env, "pace", pace.action, "after the probe")
    }
    held = pace.action !== "admit"
    if (!held) chosen = verdict.order
    decisions.set(ticket.number, held ? (pace.action === "probe" ? "would probe the pace, then admit if under the line" : "hold: over the weekly pace line") : `admit ${verdict.order.kind} on ${verdict.order.branch}`)
  }
  return { chosen, decisions }
}

/** The pace decision from the newest of the worker reading and the snapshot, with its one log line. */
const decidePace = (env, mem) => {
  const pace = paceDecision({ reading: newestReading(mem.reading, env.snapshot()), now: env.now(), lastProbeAt: mem.lastProbeAt })
  log(env, "pace", pace.action, `utilization ${pace.utilization === null ? "unknown" : pace.utilization.toFixed(3)}, line ${pace.line === null ? "unknown" : pace.line.toFixed(3)}`)
  return { ...pace }
}

const SENTRY_ORGANIZATION = "orbit-ai-habit-tracker"
const SENTRY_REPO = { "orbit-api": "api", "orbit-web": "ui", "orbit-mobile": "ui" }

/** All pages of a Sentry list: it names the next page in the `Link` header with `results="true"`. */
const sentryIssues = async (env, token) => {
  const issues = []
  for (let url = `https://sentry.io/api/0/organizations/${SENTRY_ORGANIZATION}/issues/?query=is:unresolved`; url !== null;) {
    const page = await env.fetchJson(url, { headers: { Authorization: `Bearer ${token}` } })
    issues.push(...page.body)
    url = /<([^>]+)>; rel="next"; results="true"/.exec(page.link ?? "")?.[1] ?? null
  }
  return issues
}

/** Hourly: one `Bug` ticket for each Sentry issue and each alert that no ticket holds. */
const intake = async (env, mem) => {
  const candidates = []
  const sentryToken = await env.keychain("orbit-sentry-token")
  if (sentryToken === null) log(env, "intake", "skipped", "no orbit-sentry-token in the Keychain")
  else for (const issue of await sentryIssues(env, sentryToken)) {
    const key = SENTRY_REPO[issue.project?.slug]
    if (key) candidates.push({ url: issue.permalink, repoKey: key, title: `Sentry: ${issue.title}`.slice(0, 120), body: `${issue.title}\n\n${issue.permalink}\n\nProject: ${issue.project.slug}` })
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
      for (const alert of alerts) candidates.push({ url: alert.html_url, repoKey: key, title: `${kind}: ${describeAlert(alert)}`.slice(0, 120), body: `${describeAlert(alert)}\n\n${alert.html_url}` })
    }
  }
  if (candidates.length === 0) return
  // Open and closed tickets both hold a permalink, so a closed ticket keeps its issue from coming back.
  const known = await env.gh(["issue", "list", "--repo", env.config.tickets.repository, "--state", "all", "--limit", "5000", "--json", "body"])
  for (const candidate of candidates.filter((entry) => !known.includes(entry.url))) {
    log(env, "intake", "ticket", candidate.url)
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

const reapExits = async (env, mem, tickets, states) => {
  for (const exit of mem.exits.splice(0)) await reapExit(env, mem, tickets, states, exit).catch((error) => log(env, `ticket#${exit.order.ticket.number}`, "error", error.message))
}

/** Reads the world once and reaps the exits of workers that ended since the last tick. */
export const reapPending = async (env, mem) => {
  const { tickets, states } = await readWorld(env, mem)
  await reapExits(env, mem, tickets, states)
}

export const tick = async (env, mem) => {
  env.lines = []
  let tickets
  let states
  try {
    ({ tickets, states } = await readWorld(env, mem))
  } catch (error) {
    log(env, "tick", "retry", error.message)
    return { retried: true }
  }
  await reapExits(env, mem, tickets, states)
  const orders = []
  for (const state of states) orders.push(...await pullActions(env, mem, state.repositoryKey, state, tickets))
  await ownerWorkNotices(env, mem, tickets)
  const paused = pauseIssue(tickets)
  if (paused && !env.dryRun && mem.running === null && (mem.lastProbeAt === null || env.now() - mem.lastProbeAt >= HOUR_MS)) await runProbe(env, mem, tickets).catch((error) => log(env, "probe", "error", error.message))
  const busy = mem.running !== null || env.workerLive()
  const { chosen, decisions } = paused ? { chosen: null, decisions: new Map() } : await admit(env, mem, tickets, states)
  for (const ticket of tickets) env.lines.push(`ticket ${env.config.tickets.repository}#${ticket.number}: ${paused ? "wait: the driver is paused" : decisions.get(ticket.number) ?? "wait"}`)
  const launchable = orders.filter((entry) => !paused).sort((left, right) => left.pull.number - right.pull.number)[0] ?? (paused ? null : chosen)
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
  const modes = new Set(["--dry-run", "--once", "--probe"])
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

/** The real seams of the driver. A test builds its own with the same members. */
export const realEnvironment = ({ dryRun = false } = {}) => {
  const config = readDriveConfig()
  const stateDir = join(commonDirOf(config.repos.ui), "orbit-drive")
  mkdirSync(join(stateDir, "logs"), { recursive: true })
  const home = homedir()
  const live = () => readdirSync(stateDir).filter((name) => name.endsWith(".pid")).some((name) => {
    try { process.kill(JSON.parse(readFileSync(join(stateDir, name), "utf8")).pid, 0); return true } catch { rmSync(join(stateDir, name), { force: true }); return false }
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
    snapshot: () => readSnapshot(join(home, ".claude", "usage-snapshot.json")),
    workerLive: live,
    invocation: async (token) => workerApi.workerInvocation({ home, parentEnvironment: process.env, token: token ?? (await workerApi.readWorkerToken()) ?? "probe-only" }),
    sleep: (ms, mem) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); mem.wake = () => { clearTimeout(timer); resolve() } }),
  }
}

const commonDirOf = (repoPath) => {
  const result = spawnSync("git", ["-C", repoPath, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git could not name the common directory of ${repoPath}: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

export const main = async (argv, { out = console.log, err = console.error } = {}) => {
  const parsed = parseArguments(argv)
  if (parsed.error) { err(`${parsed.error}\n${USAGE}`); return 2 }
  if (parsed.help) { out(USAGE); return 0 }
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
    if (parsed.mode === "once") { await mem.running; await reapPending(env, mem).catch((error) => log(env, "tick", "error", error.message)); return 0 }
    if (!stopping) await env.sleep(TICK_MS, mem)
  } while (!stopping)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(3) })
}
