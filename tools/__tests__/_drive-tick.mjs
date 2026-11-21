/** Table tests of the delivery driver's tick: the fake seams, the scenarios and their exact writes. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { accountFrom, createMemory, launchesOf, main, marked, missingTools, pathsOverlap, paceDecision, parseArguments, pushOutputs, rankTickets, recordStart, resultText, tick, ticketComment } from "../drive.mjs"
import { isUsageLimitMessage, readSnapshot, usageLimitIn } from "../lib/worker.mjs"
import { T, root, same } from "./_harness.mjs"

const FIXTURE = JSON.parse(readFileSync(new URL("../__fixtures__/drive-github.json", import.meta.url), "utf8"))
const READS = FIXTURE.driverReads
const RECORDED_CHANGES_REQUESTED = FIXTURE.changesRequestedReview.node
const CHANGES_REQUESTED = RECORDED_CHANGES_REQUESTED.state
const AUTH = READS.claudeAuthStatus.output
const ACCOUNT = accountFrom(AUTH)
const NOW = Date.parse("2026-11-19T12:00:00Z")
const RESETS_AT = Math.floor((NOW + 3.5 * 24 * 3600 * 1000) / 1000)
const LINE = 0.475
const REPOSITORY = "thomasluizon/orbit-tickets"
const HEAD = "a".repeat(40)
const NEXT_HEAD = "b".repeat(40)
const APP = 1768019
const SNAPSHOT = join(root, "drive-tick-snapshot.json")

const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString()
const MINUTE = 60 * 1000

const comment = (kind, text, offset = -3600 * 1000, extra = {}) => ({ id: `C${Math.abs(offset)}${text.length}`, author: "thomasluizon", body: kind ? marked(kind, text) : text, createdAt: iso(offset), kind, ...extra })

const check = (name, conclusion = "SUCCESS", extra = {}) => ({ __typename: "CheckRun", databaseId: 11, name, status: "COMPLETED", conclusion, startedAt: iso(-3600 * 1000), detailsUrl: "https://github.com/thomasluizon/orbit-ui-mobile/actions/runs/9001/job/11", checkSuite: { app: { databaseId: 15368 } }, ...extra })
const approvalCheck = () => check("pullfrog-approval", "SUCCESS", { databaseId: 12, checkSuite: { app: { databaseId: APP } } })

const review = (state, commit = HEAD, offset = -10 * MINUTE, extra = {}) => ({ state, commit, submittedAt: iso(offset), body: "", author: "pullfrog", blocking: [], ...extra })

const pull = (number, extra = {}) => ({
  number, state: "OPEN", draft: false, author: "thomasluizon", labels: [], headRef: `chore/ticket-7-${number}`, headSha: HEAD, baseRef: "main", baseSha: "c".repeat(40), mergeState: "CLEAN", behindBy: 0,
  body: "Tracks thomasluizon/orbit-tickets#7\n\nRemaining: none", tracks: 7, changedFiles: 3, files: ["tools/a.mjs"], commits: [{ sha: HEAD, parents: 1 }], mergeCommit: null,
  checks: [check("Unit Tests"), approvalCheck()], checksComplete: true, requiredChecks: [{ context: "Unit Tests", appId: 15368 }], reviews: [review("APPROVED")], threads: [], threadsComplete: true,
  comments: [comment("ticket", "Ticket"), comment("request", PLAIN, -20 * MINUTE)], ...extra,
})
const PLAIN = "@pullfrog review"

const ticket = (number, extra = {}) => ({ number, title: `Ticket ${number}`, body: "Do the work.", labels: ["repo:ui", "Improvement"], repoKey: "ui", blockedBy: [], comments: [], ...extra })
const blocker = (number, open = true, labels = []) => ({ number, open, labels, repoKey: "ui" })
const partComment = (number, total, extra = "") => comment(null, `Part ${number} of ${total}: part ${number}\n${extra}`, -7200 * 1000)

let scenarios = 0

/** A driver environment whose every seam is a recorder. `routes` answer `gh` calls by text; `git` answers by its first words. */
const scenario = ({ tickets = [], pulls = { ui: [], api: [], landing: [] }, routes = [], gitRoutes = [], reading = { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, token = "token", dryRun = false, runs = [], failedSteps = [], limit = null, probeReading = undefined, unmet = [], auth = AUTH } = {}) => {
  const calls = []
  const messages = []
  const record = (name) => async (...args) => { calls.push([name, ...args]); return undefined }
  const states = Object.fromEntries(["ui", "api", "landing"].map((key) => [key, { repositoryKey: key, slug: `thomasluizon/${key}`, defaultBranch: "main", numbers: (pulls[key] ?? []).map((entry) => entry.number), pulls: pulls[key] ?? [] }]))
  const launched = []
  const stateDir = join(root, `drive-tick-state-${++scenarios}`)
  mkdirSync(join(stateDir, "logs"), { recursive: true })
  const config = { tickets: { repository: REPOSITORY }, repos: { ui: "/r/ui", api: "/r/api", landing: "/r/landing" } }
  const env = {
    config, dryRun, now: () => NOW, stateDir, lines: [], home: "/home/x",
    log: (line) => messages.push(line), slugOf: (key) => (key === "tickets" ? REPOSITORY : `thomasluizon/${key}`),
    github: {
      readTickets: async () => structuredClone(tickets),
      readRepositoryState: async (key) => structuredClone(states[key]),
      readFailedSteps: async () => failedSteps,
      pullfrogRunsFor: async () => runs,
      readDependabotUpdateTypes: async () => ["patch"],
      unmetDeployFirst: async () => unmet,
      createTicket: async (input) => { calls.push(["createTicket", input]); return { number: 99 } },
      comment: record("comment"), editLabels: record("editLabels"), merge: record("merge"), resolveThreads: record("resolveThreads"), updateBranch: record("updateBranch"), retarget: record("retarget"), rerunFailed: record("rerunFailed"), closeTicket: record("closeTicket"),
    },
    worker: {
      readWorkerToken: async () => token,
      launch: (options) => { launched.push(options); return Promise.resolve({ exitCode: 0, killed: null, sessionId: "s1", utilization: 0.2, resetsAt: RESETS_AT, status: "allowed", result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null }, ...(limit ?? {}) }) },
      probe: async () => (calls.push(["probe"]), probeReading === undefined ? { utilization: 0.1, resetsAt: RESETS_AT, status: "allowed" } : probeReading),
    },
    invocation: async () => ({ command: { executable: "claude", args: [] }, environment: {} }),
    git: async (cwd, args) => { calls.push(["git", ...args]); const hit = gitRoutes.find(([text]) => args.join(" ").includes(text)); return hit ? { status: 0, stderr: "", stdout: typeof hit[1] === "function" ? hit[1](args) : hit[1] } : { status: args[0] === "rev-parse" && args.includes("--quiet") ? 1 : 0, stderr: "", stdout: args[0] === "rev-parse" ? HEAD : "" } },
    gh: async (args) => { calls.push(["gh", args.join(" ")]); const hit = routes.find(([text]) => args.join(" ").includes(text)); if (hit) return typeof hit[1] === "function" ? hit[1](args) : hit[1]; if (args[0] === "pr" && args[1] === "list") return "[]"; if (args[0] === "issue") return "[]"; if (args[0] === "api") return "[]"; return "" },
    notify: async (message) => { calls.push(["notify", message]) },
    keychain: async () => null,
    fetchJson: async () => ({ body: [], link: null }),
    snapshot: () => null,
    authStatus: async () => structuredClone(auth),
    workerLive: () => false,
  }
  const mem = createMemory()
  mem.reading = reading === null ? null : { account: ACCOUNT.key, ...reading }
  mem.lastIntakeAt = NOW
  return { env, mem, calls, messages, launched, run: async () => { const result = await tick(env, mem); await mem.running; if (process.env.DEBUG_DRIVE_TICK) console.error(messages.splice(0).join("\n")); return result } }
}

const BASH = JSON.parse(readFileSync(new URL("../__fixtures__/drive-worker.json", import.meta.url), "utf8")).bashToolRecords

/** The stream-json lines of one Bash tool call, in the recorded shape: a tool_use in an assistant record, its tool_result in a user record. */
const bashRun = (command, output, id = "toolu_1") => [
  JSON.stringify({ type: BASH.toolUse.recordType, message: { content: [{ type: BASH.toolUse.block.type, id, name: BASH.toolUse.block.name, input: { [BASH.toolUse.block.inputKeys[0]]: command } }] } }),
  JSON.stringify({ type: BASH.toolResult.recordType, message: { content: [{ type: BASH.toolResult.block.type, tool_use_id: id, content: output, is_error: false }] } }),
].join("\n") + "\n"
const FORBIDDEN_OUTPUT = "remote: Permission to thomasluizon/orbit-ui-mobile.git denied to x.\nfatal: unable to access: The requested URL returned error: 403"
const resultLine = (text) => `${JSON.stringify({ type: "result", result: text })}\n`
const clean = { exitCode: 0, killed: null, sessionId: "s1", utilization: null, resetsAt: null, result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null } }
const heads = (before, after) => { const queue = [before, after]; return ["rev-parse", () => `${queue.length > 1 ? queue.shift() : queue[0]}\n`] }

/** Makes the fake GitHub keep the driver's writes to the tickets, so the next tick reads them the way GitHub returns them. */
const keepWrites = (scene, tickets) => {
  const { comment: write, editLabels: relabel, createTicket: create } = scene.env.github
  const find = (key, number) => (key === "tickets" ? tickets.find((entry) => entry.number === number) : undefined)
  scene.env.github.comment = async (key, number, body) => {
    await write(key, number, body)
    const kind = /^<!-- orbit-drive:(\w+) -->/.exec(body)?.[1] ?? null
    find(key, number)?.comments.push(comment(kind, kind === null ? body : body.split("\n").slice(1).join("\n")))
  }
  scene.env.github.editLabels = async (key, number, change) => {
    await relabel(key, number, change)
    find(key, number)?.labels.push(...(change.add ?? []))
  }
  scene.env.github.createTicket = async (input) => {
    const created = await create(input)
    tickets.push({ ...ticket(created.number, { title: input.title, body: input.body, labels: input.labels }), repoKey: null })
    return created
  }
}

const only = (calls, name) => calls.filter((entry) => entry[0] === name)
const commentsOf = (calls, number) => only(calls, "comment").filter((entry) => entry[2] === number).map((entry) => entry[3])
const orderText = (scene) => scene.launched[0]?.order ?? ""

const admissionCases = async () => {
  const wait = async (label, tickets, expected, extra = {}) => {
    const scene = scenario({ tickets, ...extra })
    await scene.run()
    T(`drive: admission ${label}`, expected === null ? scene.launched.length === 0 : scene.launched.length === 1 && scene.launched[0].worktree === expected, `launched ${scene.launched.length}: ${scene.messages.slice(-3).join(" | ")}`)
    return scene
  }
  await wait("starts an admissible ticket", [ticket(7)], "/r/orbit-worktrees/ui/chore-ticket-7")
  for (const [label, extra] of [
    ["refuses needs:owner", { labels: ["repo:ui", OWNER_LABEL] }],
    ["refuses needs:conversation", { labels: ["repo:ui", "needs:conversation"] }],
    ["refuses owner-work", { labels: ["repo:ui", "owner-work"] }],
    ["refuses two repo labels", { labels: ["repo:ui", "repo:api"] }],
    ["refuses no repo label", { labels: ["Bug"] }],
    ["refuses an open blocker", { blockedBy: [blocker(5)] }],
  ]) await wait(label, [ticket(7, extra)], null)
  await wait("accepts a closed blocker", [ticket(7, { blockedBy: [blocker(5, false)] })], "/r/orbit-worktrees/ui/chore-ticket-7")
  await wait("refuses a ticket that an open pull request tracks", [ticket(7)], null, { pulls: { ui: [pull(30)] } })
  await wait("holds a deploy-first blocker that is not deployed", [ticket(7, { blockedBy: [blocker(5, false, ["deploy-first:production/deploy"])] })], null, { unmet: [{ environment: "production", task: "deploy" }] })
  await wait("takes a Bug before a longer chain", [ticket(9, { labels: ["repo:ui", "Bug"] }), ticket(7), ticket(8, { blockedBy: [blocker(7)] })], "/r/orbit-worktrees/ui/fix-ticket-9")
  same("drive: rank puts the head of the longest chain before the lowest number", rankTickets([ticket(5), ticket(9), ticket(10, { blockedBy: [blocker(9)] }), ticket(11, { blockedBy: [blocker(10)] })]).map((entry) => entry.number), [9, 10, 5, 11])
  same("drive: rank breaks a tie on the lowest number", rankTickets([ticket(9), ticket(4), ticket(6)]).map((entry) => entry.number), [4, 6, 9])

  const notice = scenario({ tickets: [ticket(40, { labels: ["repo:ui", "owner-work"], blockedBy: [blocker(5, false)] })] })
  await notice.run()
  same("drive: an owner-work ticket with every blocker closed gets one notice and one notification", [commentsOf(notice.calls, 40).length, only(notice.calls, "notify").length, notice.launched.length], [1, 1, 0])
  const noticed = scenario({ tickets: [ticket(40, { labels: ["repo:ui", "owner-work"], comments: [comment("notice", "ready")] })] })
  await noticed.run()
  same("drive: an owner-work ticket that has its notice gets no second one", [commentsOf(noticed.calls, 40).length, only(noticed.calls, "notify").length], [0, 0])

  const parts = [partComment(1, 2, "Paths: apps/web/a.ts"), partComment(2, 2, "Paths: apps/mobile/b.ts")]
  const partsScene = scenario({ tickets: [ticket(7, { comments: parts })] })
  await partsScene.run()
  T("drive: part 1 starts first on its own branch", partsScene.launched.length === 1 && partsScene.launched[0].worktree.endsWith("chore-ticket-7-part-1"))
  const secondPart = scenario({ tickets: [ticket(7, { comments: parts })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] } })
  await secondPart.run()
  T("drive: a next part with Paths that overlap no open part PR starts while part 1 is open", secondPart.launched.length === 1 && secondPart.launched[0].worktree.endsWith("chore-ticket-7-part-2"))
  const overlapping = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2, "Paths: apps/web/"), partComment(2, 2, "Paths: apps/web/a.ts")] })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] } })
  await overlapping.run()
  T("drive: a next part whose Paths sit inside an open part's Paths is held", overlapping.launched.length === 0)
  const noPaths = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2), partComment(2, 2)] })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] } })
  await noPaths.run()
  T("drive: a next part with no Paths line waits for the open part", noPaths.launched.length === 0)
  const listed = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2, "Paths: :!apps/web/c"), partComment(2, 2, "Paths: apps/web/a/*.ts")] })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] }, gitRoutes: [["ls-files", "apps/web/a/x.ts\n"]] })
  await listed.run()
  T("drive: parts that list a common file at main overlap and the next part is held", listed.launched.length === 0)
  T("drive: two literal paths overlap when one holds the other", await pathsOverlap({ git: async () => ({ stdout: "" }) }, "/r/ui", ["apps/web/"], ["apps/web/a.ts"]) === true)
  T("drive: two disjoint literal paths do not overlap", await pathsOverlap({ git: async () => ({ stdout: "" }) }, "/r/ui", ["apps/web/"], ["apps/mobile/a.ts"]) === false)

  const blockedPull = scenario({ tickets: [ticket(7, { blockedBy: [blocker(5)] })], pulls: { ui: [pull(30)] } })
  await blockedPull.run()
  same("drive: a pull request whose ticket has an open blocker gets no order and no merge", [only(blockedPull.calls, "merge").length, blockedPull.launched.length], [0, 0])
  const untracked = scenario({ tickets: [], pulls: { ui: [pull(30, { tracks: null, body: "No ticket line" })] } })
  await untracked.run()
  same("drive: an untracked pull request that is not Dependabot gets no action", only(untracked.calls, "merge").length + untracked.calls.filter((entry) => entry[0] === "comment").length, 0)
}

const OWNER_LABEL = "needs:owner"

const paceCases = async () => {
  const at = (utilization, extra = {}) => paceDecision({ reading: { utilization, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE, ...extra }, now: NOW })
  same("drive: pace admits under the line", at(0.3).action, "admit")
  same("drive: pace holds over the line without a probe", at(0.6).action, "hold")
  same("drive: the line is the share of the week gone times 0.95", at(0.3).line.toFixed(3), "0.475")
  same("drive: a stale reading under the line asks for one probe", paceDecision({ reading: { utilization: 0.3, resetsAt: RESETS_AT, at: NOW - 2 * 3600 * 1000 }, now: NOW }).action, "probe")
  same("drive: a stale reading probes at most once an hour", paceDecision({ reading: { utilization: 0.3, resetsAt: RESETS_AT, at: NOW - 2 * 3600 * 1000 }, now: NOW, lastProbeAt: NOW - 10 * MINUTE }).action, "hold")
  same("drive: a reading from the old week probes", paceDecision({ reading: { utilization: 0.9, resetsAt: Math.floor(NOW / 1000) - 10, at: NOW - 5 * MINUTE }, now: NOW }).action, "probe")
  same("drive: no reading probes", paceDecision({ reading: null, now: NOW }).action, "probe")
  const later = paceDecision({ reading: { utilization: 0.6, resetsAt: RESETS_AT, at: NOW - 7 * 3600 * 1000 }, now: NOW + 40 * 3600 * 1000 })
  same("drive: after a long hold the line passes the reading and one probe follows", [later.action, later.line > 0.6], ["probe", true])

  const held = scenario({ tickets: [ticket(7)], reading: { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await held.run()
  same("drive: a hold starts no build order and runs no probe", [held.launched.length, only(held.calls, "probe").length], [0, 0])
  const fixDuringHold = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }] })] })] }, reading: { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await fixDuringHold.run()
  same("drive: a fix order runs during a hold", fixDuringHold.launched.length, 1)
  const probed = scenario({ tickets: [ticket(7)], reading: { utilization: 0.3, resetsAt: RESETS_AT, at: NOW - 3 * 3600 * 1000 } })
  await probed.run()
  same("drive: a stale reading probes once and then admits", [only(probed.calls, "probe").length, probed.launched.length], [1, 1])
  const silent = scenario({ tickets: [ticket(7)], reading: null, probeReading: null })
  await silent.run()
  same("drive: a probe with no event starts no order and sends one notification", [silent.launched.length, only(silent.calls, "notify").length], [0, 1])
  const snapshotScene = scenario({ tickets: [ticket(7)], reading: { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - 3 * 3600 * 1000 } })
  snapshotScene.env.snapshot = () => ({ utilization: 0.2, resetsAt: RESETS_AT, at: NOW - MINUTE, email: AUTH.email })
  await snapshotScene.run()
  same("drive: the newer snapshot reading wins over the older worker reading", snapshotScene.launched.length, 1)
  writeFileSync(SNAPSHOT, JSON.stringify({ at: iso(0), email: "someone@example.test", rateLimits: { seven_day: { used_percentage: 54, resets_at: RESETS_AT } } }))
  same("drive: the snapshot reads a percent as a fraction and keeps the email for the account comparison", readSnapshot(SNAPSHOT), { utilization: 0.54, resetsAt: RESETS_AT, at: NOW, email: "someone@example.test" })
  same("drive: an unreadable snapshot gives no reading", readSnapshot(join(root, "no-such-snapshot.json")), null)
}

const usageLimitCases = async () => {
  const limited = { exitCode: 1, result: { usageLimitReached: true, authenticationFailed: false, error: "You've hit your limit. Resets 4am (America/Sao_Paulo)", needsDecision: null } }
  const stopped = scenario({ tickets: [ticket(7)], limit: limited })
  await stopped.run()
  await stopped.run()
  const issue = only(stopped.calls, "createTicket")[0]?.[1]
  same("drive: a worker that stops at a usage limit pauses with one notification and one issue", [issue?.labels, only(stopped.calls, "notify").length, /Resets 4am/.test(issue?.body ?? "")], [[OWNER_LABEL], 1, true])
  const authFailed = scenario({ tickets: [ticket(7)], limit: { exitCode: 1, result: { usageLimitReached: false, authenticationFailed: true, error: "Please run /login", needsDecision: null } } })
  await authFailed.run()
  await authFailed.run()
  T("drive: a sign-in failure is reported as a sign-in stop, not a usage limit", /sign-in/.test(only(authFailed.calls, "createTicket")[0]?.[1].body ?? "") && !/A worker stopped/.test(only(authFailed.calls, "createTicket")[0][1].body))
  const pausedTicket = ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null })
  const resumed = scenario({ tickets: [pausedTicket, ticket(7)], reading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await resumed.run()
  same("drive: a paused driver runs one probe, resumes on status allowed and closes the issue", [only(resumed.calls, "probe").length, only(resumed.calls, "closeTicket").length, commentsOf(resumed.calls, 50).length], [1, 1, 1])
  const stillPaused = scenario({ tickets: [pausedTicket, ticket(7)], probeReading: { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" } })
  await stillPaused.run()
  same("drive: a probe with another status keeps the pause and starts no worker", [only(stillPaused.calls, "closeTicket").length, stillPaused.launched.length], [0, 0])
  const pausedFix = scenario({ tickets: [pausedTicket, ticket(7)], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] }, probeReading: { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" } })
  await pausedFix.run()
  same("drive: a pause stops every order kind", pausedFix.launched.length, 0)
  const merging = scenario({ tickets: [pausedTicket, ticket(7)], pulls: { ui: [pull(30)] }, probeReading: { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" } })
  await merging.run()
  same("drive: merges continue during a pause", only(merging.calls, "merge").length, 1)

  const recordedPrefix = READS.failedRunLog.line.replace(/Z .*$/, "Z ")
  const logLine = `${recordedPrefix}You've hit your limit. Resets 4am (America/Sao_Paulo)`
  same("drive: a failed Pullfrog log with a limit message reads as a limit with its reset", usageLimitIn(`${logLine}\nother`, isUsageLimitMessage)?.reset, "4am (America/Sao_Paulo)")
  same("drive: a failed log with a transient 429 is not a limit", usageLimitIn("x\t2026-11-19T10:00:00Z API Error: 429 rate limited, retry later", isUsageLimitMessage), null)
  const run = { databaseId: 77, displayTitle: "Respond to mention on #7 [abc]", status: "completed", conclusion: "failure", createdAt: iso(-10 * MINUTE), updatedAt: iso(-5 * MINUTE) }
  const pullfrogStop = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [run], routes: [["--log-failed", logLine]] })
  await pullfrogStop.run()
  same("drive: a Pullfrog run that stops at a usage limit pauses the driver", [only(pullfrogStop.calls, "createTicket").length, only(pullfrogStop.calls, "notify").length], [1, 1])
  same("drive: the result text is the last result line of a log", resultText(`{"type":"assistant"}\n${JSON.stringify({ type: "result", result: "area\nfinding" })}\n`), "area\nfinding")
}

const workerCases = async () => {
  const noToken = scenario({ tickets: [ticket(7)], token: null })
  await noToken.run()
  await noToken.run()
  same("drive: no Keychain token starts no worker and notifies once", [noToken.launched.length, only(noToken.calls, "notify").length, only(noToken.calls, "comment").length], [0, 1, 0])
  const started = scenario({ tickets: [ticket(7)] })
  await started.run()
  const launch = JSON.parse(String(only(started.calls, "comment")[0]?.[3]).split("\n")[1])
  same("drive: a launch is recorded on the ticket before the worker starts", [only(started.calls, "comment")[0]?.[1], launch.kind, launch.branch], ["tickets", "build", "chore/ticket-7"])
  T("drive: the worker order holds the ticket body and the brief and no driver comment", /Do the work\./.test(orderText(started)) && /## Brief/.test(orderText(started)) && !/orbit-drive/.test(orderText(started)))
  same("drive: a build worktree starts from origin/main", only(started.calls, "git").some((entry) => entry.join(" ").includes("worktree add -b chore/ticket-7")), true)
  const decision = scenario({ tickets: [ticket(7)], limit: { exitCode: 0, result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: "Raise the price?" } } })
  await decision.run()
  await decision.run()
  same("drive: NEEDS_DECISION gives needs:owner and one needs-owner comment", [only(decision.calls, "editLabels")[0]?.[3], commentsOf(decision.calls, 7).filter((text) => text.includes("needs-owner")).length], [{ add: [OWNER_LABEL] }, 1])
  const forbidden = scenario({ tickets: [ticket(7)], gitRoutes: [heads(HEAD, NEXT_HEAD), ["ls-remote", ""]] })
  forbidden.env.worker.launch = (options) => { writeFileSync(options.logFile, bashRun("git push -u origin chore/ticket-7", FORBIDDEN_OUTPUT)); return Promise.resolve({ ...clean, exitCode: 1, sessionId: "s" }) }
  await forbidden.run()
  await forbidden.run()
  same("drive: a push that fails with HTTP 403 gives needs:owner and a notification", [only(forbidden.calls, "editLabels").length, only(forbidden.calls, "notify").length], [1, 1])
  const recorded = scenario({ tickets: [ticket(7)], gitRoutes: [["log --format=%H", `${NEXT_HEAD}\n${"d".repeat(40)}\n`]], routes: [["--head chore/ticket-7", "31\n"]] })
  await recorded.run()
  await recorded.run()
  same("drive: one record comment for each pushed commit, oldest first", commentsOf(recorded.calls, 31).map((text) => text.split("\n")[1]), [`worker s1 -> ${"d".repeat(40)}`, `worker s1 -> ${NEXT_HEAD}`])
}

const capCases = async () => {
  const launched = (kind, count, branch = "chore/ticket-7", part = null) => Array.from({ length: count }, () => comment("launch", JSON.stringify({ kind, part, branch })))
  const second = scenario({ tickets: [ticket(7, { comments: launched("build", 1) })] })
  await second.run()
  same("drive: the second launch of an order runs", second.launched.length, 1)
  const third = scenario({ tickets: [ticket(7, { comments: launched("build", 2) })] })
  await third.run()
  same("drive: the third launch of an order is refused with needs:owner", [third.launched.length, only(third.calls, "editLabels").length], [0, 1])
  const fixReview = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }, { path: "tools/b.mjs", line: 9, body: "BLOCKING: two" }] })
  const capped = scenario({ tickets: [ticket(7, { comments: [...launched("fix", 1, "chore/ticket-7-30"), ...launched("ci-fix", 1, "chore/ticket-7-30")] })], pulls: { ui: [pull(30, { reviews: [fixReview] })] } })
  await capped.run()
  const text = commentsOf(capped.calls, 7).find((entry) => entry.includes("needs-owner")) ?? ""
  same("drive: a third fix launch on one pull request is refused with the open classes", [capped.launched.length, only(capped.calls, "editLabels").length, text.includes("tools/a.mjs:3") && text.includes("tools/b.mjs:9")], [0, 2, true])
  same("drive: launch records read back from the ticket comments", launchesOf(ticket(7, { comments: launched("build", 2) })).length, 2)
}

const reviewCases = async () => {
  const blocking = (path, line) => ({ path, line, body: `BLOCKING: class at ${path}` })
  const three = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [blocking("a.mjs", 1), blocking("b.mjs", 2), blocking("c.mjs", 3)] })
  const fix = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [three] })] } })
  await fix.run()
  T("drive: CHANGES_REQUESTED with three BLOCKING classes gives one fix order that lists every instance", fix.launched.length === 1 && ["a.mjs:1", "b.mjs:2", "c.mjs:3"].every((text) => fix.launched[0].order.includes(text)))

  const commented = (state = "COMMENTED") => review(state, HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })
  const first = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [commented()], comments: [comment("ticket", "T")] })] } })
  await first.run()
  same("drive: a COMMENTED review with no BLOCKING gets one re-request", commentsOf(first.calls, 30).map((text) => text.split("\n")[1]), [PLAIN])
  const second = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [commented(), review(CHANGES_REQUESTED, HEAD, -1 * MINUTE)], comments: [comment("ticket", "T")] })] } })
  await second.run()
  same("drive: a second review with no BLOCKING gives needs:owner", [commentsOf(second.calls, 30).length, only(second.calls, "editLabels").length], [0, 2])

  const fresh = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [], comments: [] })] } })
  await fresh.run()
  const posted = commentsOf(fresh.calls, 30)
  same("drive: a new head with no ticket comment gets the ticket comment, then one request", [posted.length, posted[0].split("\n")[0], posted[0].split("\n")[1], posted[1]], [2, "<!-- orbit-drive:ticket -->", `Ticket ${REPOSITORY}#7: Ticket 7`, marked("request", PLAIN)])
  T("drive: a ticket without parts says the ticket body is the whole order", posted[0].includes("No parts: the ticket body is the whole order."))
  const have = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T")] })] } })
  await have.run()
  same("drive: a pull request that has the ticket comment gets only the request", commentsOf(have.calls, 30), [marked("request", PLAIN)])
  const draft = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { draft: true, reviews: [], comments: [] })] } })
  await draft.run()
  same("drive: a draft pull request gets neither comment", commentsOf(draft.calls, 30).length, 0)

  const partTicket = ticket(7, { body: "Whole ticket", comments: [partComment(2, 3, "The part text.")] })
  T("drive: a part pull request carries its own part whole", ticketComment({ repository: REPOSITORY, ticket: partTicket, part: { comment: partTicket.comments[0] } }).includes("The part text."))
  const huge = ticket(7, { body: "x".repeat(70000) })
  const cut = ticketComment({ repository: REPOSITORY, ticket: huge, part: { comment: partComment(1, 1, "Keep this part whole.") } })
  T("drive: a ticket body that would pass 65,000 characters is cut with a line that says so, and the part stays whole", cut.length <= 65000 && cut.includes("Ticket body cut here: it had 70000 characters.") && cut.includes("Keep this part whole."))

  const waiting = (offsetRequest, runs = [], requests = 1, extra = {}) => scenario({ tickets: [ticket(7)], runs, pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T"), ...Array.from({ length: requests }, (_, index) => comment("request", PLAIN, offsetRequest + index))], ...extra })] } })
  const waitingCommentCount = async (scene) => { await scene.run(); return commentsOf(scene.calls, 30).length }
  same("drive: a request younger than 30 minutes with no run waits", await waitingCommentCount(waiting(-10 * MINUTE)), 0)
  same("drive: 30 minutes after the request with no run gives one more request", await waitingCommentCount(waiting(-31 * MINUTE)), 1)
  const endedRun = (agoMinutes) => ({ databaseId: 5, displayTitle: "Respond to mention on #7 [x]", status: "completed", conclusion: "success", createdAt: iso(-(agoMinutes + 2) * MINUTE), updatedAt: iso(-agoMinutes * MINUTE) })
  same("drive: 15 minutes after the last run ended with no review gives one more request", await waitingCommentCount(waiting(-40 * MINUTE, [endedRun(16)])), 1)
  same("drive: a run that ended 5 minutes ago still waits", await waitingCommentCount(waiting(-40 * MINUTE, [endedRun(5)])), 0)
  const secondMiss = waiting(-80 * MINUTE, [], 2)
  await secondMiss.run()
  same("drive: a second miss gives needs:owner", [commentsOf(secondMiss.calls, 30).length, only(secondMiss.calls, "editLabels").length], [0, 2])

  const threads = [{ id: "PRRT_x1", resolved: false, author: "pullfrog" }, { id: "PRRT_x2", resolved: false, author: "pullfrog" }, { id: "PRRT_y", resolved: false, author: "someone" }]
  const approved = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { threads })] } })
  await approved.run()
  same("drive: APPROVED at the head resolves every Pullfrog thread by id and merges", [only(approved.calls, "resolveThreads")[0]?.[1], only(approved.calls, "merge").length], [["PRRT_x1", "PRRT_x2"], 0])

  const owed = async (label, extra, fixLaunch = false) => {
    const scene = scenario({ tickets: [ticket(7, { comments: fixLaunch ? [comment("launch", JSON.stringify({ kind: "fix", part: null, branch: "chore/ticket-7-30" }))] : [] })], pulls: { ui: [pull(30, { comments: [comment("ticket", "T")], ...extra })] } })
    await scene.run()
    return commentsOf(scene.calls, 30).map((text) => text.split("\n")[1])
  }
  same("drive: a pull request with a fix launch gets the whole-diff request", await owed("fix", {}, true), [`${PLAIN} whole diff`])
  same("drive: a pull request with 31 changed files gets the whole-diff request", await owed("files", { changedFiles: 31 }), [`${PLAIN} whole diff`])
  same("drive: a pull request that changes package-lock.json gets the whole-diff request", await owed("lock", { files: ["package-lock.json"] }), [`${PLAIN} whole diff`])
  same("drive: a three-file pull request with no fix round gets no whole-diff request", await owed("plain", {}), [])
  const asked = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), comment("request", `${PLAIN} whole diff`, -2 * MINUTE)], reviews: [review("APPROVED", HEAD, -10 * MINUTE)] })] } })
  await asked.run()
  same("drive: a whole-diff request that is already pending is not posted twice", commentsOf(asked.calls, 30).length, 0)
  const wholeDone = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), comment("request", `${PLAIN} whole diff`, -8 * MINUTE)], reviews: [review("APPROVED", HEAD, -10 * MINUTE), review("APPROVED", HEAD, -5 * MINUTE, { body: `> quote\n\nWhole diff: no blocking finding` })] })] } })
  await wholeDone.run()
  same("drive: an approved whole-diff review submitted after the request opens the merge", only(wholeDone.calls, "merge").length, 1)
  const MERGE_HEAD = "f".repeat(40)
  const afterBaseMerge = (diff) => scenario({ tickets: [ticket(7)], gitRoutes: [["--remerge-diff", diff]], pulls: { ui: [pull(30, { headSha: MERGE_HEAD, changedFiles: 40, commits: [{ sha: HEAD, parents: 1 }, { sha: MERGE_HEAD, parents: 2 }], comments: [comment("ticket", "T"), comment("request", `${PLAIN} whole diff`, -30 * MINUTE), comment("request", PLAIN, -8 * MINUTE)], reviews: [review("APPROVED", HEAD, -40 * MINUTE), review("APPROVED", HEAD, -20 * MINUTE, { body: "Whole diff: clean" }), review("APPROVED", MERGE_HEAD, -5 * MINUTE)] })] } })
  const clean = afterBaseMerge("")
  await clean.run()
  same("drive: a whole-diff approval followed only by a clean base merge keeps the bar", only(clean.calls, "merge").length, 1)
  const resolved = afterBaseMerge("diff --git a/x b/x\n+resolved\n")
  await resolved.run()
  same("drive: a whole-diff approval followed by a conflict-resolving merge asks for a new whole-diff pass", [only(resolved.calls, "merge").length, commentsOf(resolved.calls, 30).map((text) => text.split("\n")[1])], [0, [`${PLAIN} whole diff`]])
  const early = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), comment("request", `${PLAIN} whole diff`, -3 * MINUTE)], reviews: [review("APPROVED", HEAD, -10 * MINUTE), review("APPROVED", HEAD, -5 * MINUTE, { body: "Whole diff: before the request" })] })] } })
  await early.run()
  same("drive: a whole-diff review submitted before the request does not count", only(early.calls, "merge").length, 0)
}

const mergeCases = async () => {
  const bar = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30)] } })
  await bar.run()
  same("drive: a bar that holds runs one gh pr merge at the exact head", only(bar.calls, "merge"), [["merge", "ui", 30, HEAD]])
  const fails = async (label, extra, ticketExtra = {}) => {
    const scene = scenario({ tickets: [ticket(7, ticketExtra)], pulls: { ui: [pull(30, extra)] } })
    await scene.run()
    T(`drive: ${label} blocks the merge`, only(scene.calls, "merge").length === 0 && scene.launched.length === 0 || label.includes("order"), scene.messages.join(" | "))
  }
  await fails("a missing approval", { reviews: [] })
  await fails("an unresolved thread", { threads: [{ id: "t", resolved: false, author: "someone" }] })
  await fails("a merge state that is not CLEAN", { mergeState: "BLOCKED" })
  await fails("a missing required check", { requiredChecks: [{ context: "Unit Tests", appId: 15368 }, { context: "Lint", appId: 15368 }] })
  await fails("a check of the wrong app", { checks: [check("Unit Tests"), check("pullfrog-approval", "SUCCESS", { checkSuite: { app: { databaseId: 1 } } })] })
  await fails("a needs:owner label on the pull request", { labels: [OWNER_LABEL] })
  await fails("a needs:owner label on the ticket", {}, { labels: ["repo:ui", OWNER_LABEL] })
  const stale = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("APPROVED", "e".repeat(40))] })] } })
  await stale.run()
  same("drive: an approval at an older commit does not merge", only(stale.calls, "merge").length, 0)

  const dependabot = (types) => { const scene = scenario({ tickets: [], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x" })] } }); scene.env.github.readDependabotUpdateTypes = async () => types; return scene }
  const patch = dependabot(["patch"])
  await patch.run()
  same("drive: a Dependabot patch merges", only(patch.calls, "merge").length, 1)
  const major = dependabot(["major"])
  await major.run()
  same("drive: a Dependabot major gets needs:owner and no merge", [only(major.calls, "merge").length, only(major.calls, "notify").length], [0, 1])

  const red = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL], checks: [check("Unit Tests", "FAILURE"), approvalCheck()] })] } })
  await red.run()
  same("drive: a needs:owner pull request with a red check gets a ci-fix order and no merge", [red.launched.length, only(red.calls, "merge").length, /ci-fix/.test(orderText(red))], [1, 0, true])
  const blocked = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL], reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] } })
  await blocked.run()
  same("drive: a needs:owner pull request with a BLOCKING review gets a fix order and no merge", [blocked.launched.length, only(blocked.calls, "merge").length], [1, 0])
  const met = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL] })] } })
  await met.run()
  same("drive: a needs:owner pull request whose bar is otherwise met gets no merge and no order", [only(met.calls, "merge").length, met.launched.length], [0, 0])
}

const updateCases = async () => {
  const behind = (number, extra = {}) => pull(number, { behindBy: 2, mergeState: "BEHIND", ...extra })
  const scene = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [behind(31, { body: "Tracks thomasluizon/orbit-tickets#8", tracks: 8 }), behind(30)] }, routes: [["--json headRefOid", `${NEXT_HEAD}\n`]] })
  await scene.run()
  same("drive: only the oldest pull request that fails only on behind is updated, and the update is recorded", [only(scene.calls, "updateBranch"), commentsOf(scene.calls, 30)], [[["updateBranch", "ui", 30]], [marked("record", `driver update-branch -> ${NEXT_HEAD}`)]])
  const child = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { baseRef: "chore/ticket-7-part-1", reviews: [], comments: [comment("ticket", "T")] })] } })
  await child.run()
  same("drive: a child whose base pull request merged is retargeted to main and asked for a first pass", [only(child.calls, "retarget"), commentsOf(child.calls, 30)], [[["retarget", "ui", 30, "main"]], [marked("request", PLAIN)]])
  const stacked = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(29, { headRef: "chore/ticket-7-part-1" }), pull(30, { baseRef: "chore/ticket-7-part-1" })] } })
  await stacked.run()
  same("drive: a child whose base pull request is open stays on its base", only(stacked.calls, "retarget").length, 0)
}

const ciCases = async () => {
  const failing = (extra = {}) => pull(30, { checks: [check("Unit Tests", "FAILURE", extra), approvalCheck()] })
  const run = async (steps, routes = [], name = "Unit Tests") => {
    const scene = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check(name, "FAILURE"), approvalCheck()] })] }, failedSteps: steps, routes })
    await scene.run()
    return scene
  }
  const setup = await run(["Set up job"])
  same("drive: a failed Set up job step gets one rerun of the failed jobs", [only(setup.calls, "rerunFailed"), setup.launched.length], [[["rerunFailed", "ui", "9001"]], 0])
  const again = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: failing().checks, comments: [comment("ticket", "T"), comment("record", "driver rerun 9001")] })] }, failedSteps: ["Set up job"] })
  await again.run()
  same("drive: a run that was rerun once becomes a ci-fix order", [only(again.calls, "rerunFailed").length, again.launched.length], [0, 1])
  const gateway = await run(["Install"], [["--log-failed", "error: HTTP 504: Gateway Timeout\n"]])
  same("drive: a GitHub 504 gets one rerun", only(gateway.calls, "rerunFailed").length, 1)
  const barrier = await run(["Require deployment barriers for schema contractions"], [], "Guard Migrations")
  same("drive: a Guard Migrations barrier failure gives needs:owner and no order", [barrier.launched.length, only(barrier.calls, "editLabels").length], [0, 2])
  const other = await run(["Unit tests"], [["--log-failed", "AssertionError: expected 1 to be 2\n"]])
  T("drive: any other failure gives one ci-fix order with the failed lines", other.launched.length === 1 && /AssertionError/.test(orderText(other)) && only(other.calls, "rerunFailed").length === 0)
  const conflict = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await conflict.run()
  T("drive: a conflict gives a merge-forward order", conflict.launched.length === 1 && /merge-forward/.test(orderText(conflict)))
}

const closeCases = async () => {
  const merged = (number, body, branch) => ({ number, body, mergedAt: iso(-3600 * 1000), headRefName: branch })
  const listed = (pullsMerged) => [["--state merged", JSON.stringify(pullsMerged)]]
  const launchRecord = comment("launch", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7" }))
  const done = scenario({ tickets: [ticket(7, { comments: [launchRecord] })], routes: listed([merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: none`, "chore/ticket-7")]), gitRoutes: [["worktree list", "worktree /r/orbit-worktrees/ui/chore-ticket-7\nHEAD abc\nbranch refs/heads/chore/ticket-7\n\n"]] })
  await done.run()
  same("drive: a merged pull request with Remaining: none closes the ticket and removes its worktree and branch", [only(done.calls, "closeTicket"), done.launched.length, only(done.calls, "git").map((entry) => entry.slice(1).join(" ")).filter((text) => /worktree remove|branch -D/.test(text)).map((text) => text.replace(/^.*(worktree remove|branch -D)/, "$1"))], [[["closeTicket", 7]], 0, ["worktree remove /r/orbit-worktrees/ui/chore-ticket-7", "branch -D chore/ticket-7"]])
  const open = scenario({ tickets: [ticket(7, { comments: [launchRecord, partComment(1, 2), partComment(2, 2)] })], pulls: { ui: [pull(31, { headRef: "chore/ticket-7-part-2" })] }, routes: listed([merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: none`, "chore/ticket-7-part-1")]) })
  await open.run()
  same("drive: Remaining: none with another open part pull request does not close the ticket", only(open.calls, "closeTicket").length, 0)
  const rest = scenario({ tickets: [ticket(7, { comments: [launchRecord] })], routes: listed([merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: the settings screen`, "chore/ticket-7")]) })
  await rest.run()
  T("drive: a merged pull request without Remaining: none re-admits the ticket on a new branch with the remaining list", only(rest.calls, "closeTicket").length === 0 && rest.launched.length === 1 && /ticket-7-r2/.test(rest.launched[0].worktree) && /the settings screen/.test(orderText(rest)))
  const outside = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("APPROVED", HEAD, -5 * MINUTE, { body: "Verdict\n\n## Outside this change\n\nsrc/x.mjs:4 loses data.\n" })] })] } })
  await outside.run()
  const created = only(outside.calls, "createTicket")[0]?.[1]
  same("drive: a merge opens one ticket for the Outside this change section", [only(outside.calls, "merge").length, created?.labels, created?.body.includes("src/x.mjs:4 loses data.")], [1, ["repo:ui", "Bug"], true])
}

const recordedFieldCases = () => {
  const has = (keys, path) => keys.includes(path.split(".")[0])
  T("drive: every field the driver reads from the merged pull request list was recorded", ["number", "body", "mergedAt", "headRefName"].every((key) => READS.mergedPulls.keys.includes(key)))
  T("drive: the ticket body list read was recorded", READS.ticketBodies.keys.includes("body"))
  T("drive: every field the driver reads from a Dependabot alert was recorded", ["html_url", READS.dependabotAlert.summaryPath, READS.dependabotAlert.packagePath].every((path) => has(READS.dependabotAlert.keys, path)))
  T("drive: every field the driver reads from a code scanning alert was recorded", ["html_url", READS.codeScanningAlert.rulePath, READS.codeScanningAlert.pathPath].every((path) => has(READS.codeScanningAlert.keys, path)))
  T("drive: the head sha read is 40 hexadecimal characters and one newline", /^40 lowercase hexadecimal characters, then one newline$/.test(READS.headRefOid.stdoutShape))
}

const sentryUrl = (id) => `https://orbit-ai-habit-tracker.sentry.io/issues/${id}/`

const intakeCases = async () => {
  recordedFieldCases()
  const recorded = READS.sentryIssues
  const derived = (shortId, id, slug) => ({ id, shortId, title: `Derived ${shortId}`, permalink: sentryUrl(id), project: { slug } })
  const secondPage = [derived("ORBIT-API-9A", "7811290001", "orbit-api"), derived("ORBIT-API-9B", "7811290002", "orbit-api"), derived("ORBIT-WEB-2", "7811290003", "orbit-web")]
  const nextUrl = "https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/issues/?query=is%3Aunresolved&limit=2&cursor=1795199194000:0:0"
  const known = [
    { title: "Reconnect the database (Sentry ORBIT-API-1Q)", body: "A ticket that names the short id in its title." },
    { title: "Log reading", body: "The log shows ORBIT-API-1KB twice." },
    { title: "Closed ticket", body: `Trace: ${sentryUrl("7811290001")}` },
    { title: "Path ticket", body: "See /issues/7811290002/ for the trace." },
  ]
  const alert = (kind, url, extra) => [`${kind}`, JSON.stringify([{ html_url: url, ...extra }])]
  const scene = scenario({ tickets: [], routes: [
    ["issue list", JSON.stringify(known)],
    ["thomasluizon/ui/dependabot/alerts", alert("d", "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/3", { security_advisory: { summary: "Bad" }, dependency: { package: { name: "pkg" } } })[1]],
    ["thomasluizon/api/code-scanning/alerts", alert("c", "https://github.com/thomasluizon/orbit-api/security/code-scanning/4", { rule: { description: "Rule" }, most_recent_instance: { location: { path: "a.ts" } } })[1]],
    ["thomasluizon/landing/secret-scanning/alerts", alert("s", "https://github.com/thomasluizon/orbit-landing-page/security/secret-scanning/5", { secret_type_display_name: "Token", secret: "NEVER-COPY" })[1]],
  ] })
  scene.mem.lastIntakeAt = 0
  const urls = []
  scene.env.keychain = async () => "sentry-token"
  scene.env.fetchJson = async (url) => { urls.push(url); return url === nextUrl ? { body: secondPage, link: null } : { body: recorded.body, link: recorded.link } }
  await scene.run()
  const created = only(scene.calls, "createTicket").map((entry) => entry[1])
  const sentry = created.filter((entry) => / \(Sentry [A-Z0-9-]+\)$/.test(entry.title))
  same("drive: intake reads the first page, then the one next page that the recorded Link header names", urls, ["https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/issues/?query=is:unresolved", nextUrl])
  same("drive: intake opens a Bug ticket only for an issue that no title, short id, permalink or path holds", sentry.map((entry) => [entry.labels, entry.title.endsWith(" (Sentry ORBIT-API-1K)"), entry.title.endsWith(" (Sentry ORBIT-WEB-2)")]), [[["repo:api", "Bug"], true, false], [["repo:ui", "Bug"], false, true]])
  same("drive: the ticket of a Sentry issue holds its permalink and a title of at most 120 characters", [sentry[0].body.split("\n")[2], sentry.every((entry) => entry.title.length <= 120), sentry[1].body.split("\n")[2]], [recorded.body[1].permalink, true, sentryUrl("7811290003")])
  const alerts = created.filter((entry) => !sentry.includes(entry))
  same("drive: intake opens one Bug ticket for each kind of alert, a longer alert number holds none, and no secret is copied", [alerts.map((entry) => entry.labels).sort(), alerts.length, created.some((entry) => JSON.stringify(entry).includes("NEVER-COPY"))], [[["repo:api", "Bug"], ["repo:landing", "Bug"], ["repo:ui", "Bug"]], 3, false])
  const longer = scenario({ tickets: [], routes: [["issue list", JSON.stringify([{ title: "Alert", body: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/34" }])], ["thomasluizon/ui/dependabot/alerts", JSON.stringify([{ html_url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/3" }, { html_url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/34" }])]] })
  longer.mem.lastIntakeAt = 0
  await longer.run()
  same("drive: an alert url that only a longer alert url contains is not held, and the exact url is", only(longer.calls, "createTicket").map((entry) => entry[1].body.split("\n")[2]), ["https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/3"])
}

const accountCases = async () => {
  same("drive: the recorded auth status holds every key the driver reads", ["loggedIn", "email", "orgId", "subscriptionType"].every((key) => key in AUTH), true)
  const other = { ...AUTH, orgId: "00000000-0000-4000-8000-000000000002" }
  same("drive: the account key changes with the organization and with the email", [accountFrom(other).key === ACCOUNT.key, accountFrom({ ...AUTH, email: "second@example.com" }).key === ACCOUNT.key, accountFrom(AUTH).key === ACCOUNT.key], [false, false, true])

  const changed = scenario({ tickets: [ticket(7)], auth: other })
  changed.mem.account = ACCOUNT
  changed.env.snapshot = () => ({ utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE, email: AUTH.email })
  await changed.run()
  same("drive: a change of organization drops the old readings and probes before the next build order", [only(changed.calls, "probe").length, changed.launched.length, changed.messages.filter((line) => line.includes("account changed")).length], [1, 1, 1])
  same("drive: the change line names the organization and the plan and never the email", [changed.messages.some((line) => line.includes("orgId 00000000-0000-4000-8000-000000000002, max")), JSON.stringify([changed.messages, changed.calls]).includes(AUTH.email)], [true, false])

  const sameAccount = scenario({ tickets: [ticket(7)] })
  sameAccount.env.snapshot = () => ({ utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE, email: AUTH.email })
  sameAccount.mem.reading = null
  await sameAccount.run()
  same("drive: a snapshot of the logged-in account counts, so no probe runs", [only(sameAccount.calls, "probe").length, sameAccount.launched.length], [0, 1])
  const foreign = scenario({ tickets: [ticket(7)], reading: null })
  foreign.env.snapshot = () => ({ utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE, email: "someone.else@example.com" })
  await foreign.run()
  same("drive: a snapshot of another account does not count, so a probe runs", [only(foreign.calls, "probe").length, foreign.launched.length], [1, 1])
  const foreignEvent = scenario({ tickets: [ticket(7)] })
  foreignEvent.mem.reading = { ...foreignEvent.mem.reading, account: "another-account" }
  await foreignEvent.run()
  same("drive: a worker event of another account does not count", only(foreignEvent.calls, "probe").length, 1)

  const oldPause = ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null, body: "A worker stopped.\n\nAccount: 0123456789abcdef" })
  const ended = scenario({ tickets: [oldPause, ticket(7)] })
  await ended.run()
  same("drive: a change of account ends a usage-limit pause with a comment on its issue and a probe", [commentsOf(ended.calls, 50).map((text) => /account changed/.test(text)), only(ended.calls, "closeTicket"), only(ended.calls, "probe").length, ended.launched.length], [[true], [["closeTicket", 50]], 1, 1])
  const sameAccountPause = ticket(50, { ...oldPause, body: `A worker stopped.\n\nAccount: ${ACCOUNT.key}` })
  const kept = scenario({ tickets: [sameAccountPause, ticket(7)], probeReading: { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" } })
  await kept.run()
  same("drive: a pause of the logged-in account stays", [only(kept.calls, "closeTicket").length, kept.launched.length], [0, 0])

  const signedOut = { ...AUTH, loggedIn: false }
  const out = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30)] }, auth: signedOut })
  await out.run()
  same("drive: a signed-out login launches nothing, sends one notification and opens one needs:owner issue", [out.launched.length, only(out.calls, "notify").length, only(out.calls, "createTicket").map((entry) => entry[1].labels)], [0, 1, [[OWNER_LABEL]]])
  same("drive: merges continue while Claude is signed out", only(out.calls, "merge").length, 1)
  const loginIssue = ticket(51, { title: "Driver stopped: Claude is not logged in", labels: [OWNER_LABEL], repoKey: null })
  const again = scenario({ tickets: [loginIssue, ticket(7)], auth: signedOut })
  await again.run()
  same("drive: a signed-out login with its issue open opens no second issue", [only(again.calls, "createTicket").length, again.launched.length], [0, 0])
  const back = scenario({ tickets: [loginIssue, ticket(7)] })
  await back.run()
  same("drive: the issue closes when the login returns and workers start again", [only(back.calls, "closeTicket"), commentsOf(back.calls, 51).length, back.launched.length], [[["closeTicket", 51]], 1, 1])
  const dry = scenario({ tickets: [ticket(7)], auth: signedOut, dryRun: true })
  await dry.run()
  same("drive: a dry run with a signed-out login writes nothing", dry.calls.filter((entry) => ["createTicket", "notify", "comment"].includes(entry[0])).length, 0)
  same("drive: no log line, issue or notification holds the email", JSON.stringify([out.messages, out.calls, again.messages, back.messages, back.calls]).includes(AUTH.email), false)

  const TOKEN = `sk-ant-oat01-${"q".repeat(40)}`
  const SLUGS = ["thomasluizon/orbit-ui-mobile", "thomasluizon/orbit-api", "thomasluizon/orbit-landing-page"]
  const runTool = async (answer, input = `${TOKEN}\n`) => {
    const seen = []
    const lines = []
    const code = await main(["--reviewer-token"], { out: (line) => lines.push(line), err: (line) => lines.push(line), stdin: async () => input, runGh: async (args, text) => { seen.push({ args, input: text }); return answer(args) }, slugs: SLUGS })
    return { code, seen, lines }
  }
  const good = await runTool(() => ({ status: 0, stdout: "", stderr: "" }))
  same("drive: --reviewer-token sets the secret in the three repositories from stdin", [good.code, good.seen.map((entry) => entry.args), good.seen.every((entry) => entry.input === TOKEN)], [0, SLUGS.map((slug) => ["secret", "set", "CLAUDE_CODE_OAUTH_TOKEN", "--repo", slug]), true])
  same("drive: --reviewer-token prints each result and never the token", [good.lines, JSON.stringify([good.seen.map((entry) => entry.args), good.lines]).includes(TOKEN)], [SLUGS.map((slug) => `${slug}: set`), false])
  const bad = await runTool((args) => (args.includes("thomasluizon/orbit-api") ? { status: 1, stdout: "", stderr: `denied for ${TOKEN}` } : { status: 0, stdout: "", stderr: "" }))
  same("drive: --reviewer-token reports a failed repository, exits 3 and still never prints the token", [bad.code, bad.lines.includes("thomasluizon/orbit-api: failed, exit 1"), JSON.stringify(bad.lines).includes(TOKEN)], [3, true, false])
  same("drive: --reviewer-token with an empty stdin exits 2 and runs no gh call", [(await runTool(() => ({ status: 0 }), "  \n")).code, (await runTool(() => ({ status: 0 }), "\n")).seen.length], [2, 0])
  same("drive: --reviewer-token parses as a mode", parseArguments(["--reviewer-token"]).mode, "reviewer-token")
}

const robustnessCases = async () => {
  const broken = scenario({ tickets: [ticket(7)] })
  broken.env.github.readTickets = async () => { throw new Error("gh api graphql failed: HTTP 502") }
  same("drive: a GitHub 502 retries the tick and does not throw", (await broken.run()).retried, true)
  const dir = join(root, "drive-starts")
  mkdirSync(dir, { recursive: true })
  const starts = scenario({})
  starts.env.stateDir = dir
  writeFileSync(join(dir, "starts.json"), JSON.stringify([iso(-9 * MINUTE), iso(-4 * MINUTE)]))
  const tripped = await recordStart(starts.env, [])
  same("drive: three starts in ten minutes give one notification and one issue", [tripped, only(starts.calls, "notify").length, only(starts.calls, "createTicket").length], [true, 1, 1])
  writeFileSync(join(dir, "starts.json"), JSON.stringify([iso(-60 * MINUTE)]))
  same("drive: a start long after the last one gives no alarm", await recordStart(starts.env, []), false)
  same("drive: the start log keeps the new start", JSON.parse(readFileSync(join(dir, "starts.json"), "utf8")).length, 2)
}

const cliCases = async () => {
  const run = async (argv) => { const out = []; const err = []; const code = await main(argv, { out: (line) => out.push(line), err: (line) => err.push(line) }); return { code, out: out.join("\n"), err: err.join("\n") } }
  const help = await run(["--help"])
  same("drive: --help exits 0 with the usage", [help.code, help.out.startsWith("usage: drive.mjs")], [0, true])
  const unknown = await run(["--orbit-not-a-flag"])
  same("drive: an unknown flag exits 2", unknown.code, 2)
  same("drive: two modes exit 2", (await run(["--once", "--dry-run"])).code, 2)
  same("drive: the arguments parse to a mode", [parseArguments([]).mode, parseArguments(["--probe"]).mode, parseArguments(["-h"]).help], ["loop", "probe", true])
  T("drive: a missing tool is named", missingTools("/no/such/directory").includes("claude"))
  const dry = scenario({ tickets: [ticket(7), ticket(8, { labels: ["owner-work", "repo:ui"] })], pulls: { ui: [pull(30, { reviews: [] })] }, dryRun: true })
  const printed = []
  dry.env.log = (line) => printed.push(line)
  await dry.run()
  T("drive: --dry-run prints a line for each ticket and pull request", printed.some((line) => line.startsWith("pull ui#30:")) && printed.filter((line) => line.startsWith("ticket ")).length === 2)
  same("drive: --dry-run makes no write call, no spawn and no worktree", [dry.calls.filter((entry) => ["comment", "editLabels", "merge", "createTicket", "notify", "probe"].includes(entry[0])).length, dry.launched.length, dry.calls.filter((entry) => entry[0] === "git" && entry[1] === "worktree").length], [0, 0, 0])
  T("drive: the state directory of the tick tests exists only inside the test root", !existsSync(join(root, "drive-tick-state-missing")))
}

const blockingClassCases = async () => {
  const redUnit = [check("Unit Tests", "FAILURE"), approvalCheck()]
  const dependabot = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", checks: redUnit })] } })
  await dependabot.run()
  same("drive: a Dependabot pull request with a red check gives needs:owner and does not wedge the lane", [dependabot.launched.map((entry) => entry.worktree), only(dependabot.calls, "editLabels").map((entry) => entry.slice(1, 3))], [["/r/orbit-worktrees/ui/chore-ticket-8"], [["ui", 30]]])
  const conflict = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", mergeState: "DIRTY" })] } })
  await conflict.run()
  same("drive: a Dependabot pull request with a conflict gives needs:owner and does not wedge the lane", [conflict.launched.length, only(conflict.calls, "editLabels").length], [1, 1])
  const closedTicket = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { checks: redUnit })] } })
  await closedTicket.run()
  same("drive: a pull request whose tracked ticket is closed gets needs:owner and no fix order", [closedTicket.launched.map((entry) => entry.worktree), only(closedTicket.calls, "editLabels").map((entry) => entry.slice(1, 3))], [["/r/orbit-worktrees/ui/chore-ticket-8"], [["ui", 30]]])
  const noOrder = scenario({ tickets: [], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] } })
  await noOrder.run()
  same("drive: a Dependabot pull request with a BLOCKING review gets needs:owner and no fix order", [noOrder.launched.length, only(noOrder.calls, "editLabels").length], [0, 1])

  const redApproval = check("pullfrog-approval", "FAILURE", { databaseId: 12, checkSuite: { app: { databaseId: APP } } })
  const commented = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("COMMENTED", HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })], checks: [check("Unit Tests"), redApproval], mergeState: "BLOCKED" })] } })
  await commented.run()
  same("drive: a COMMENTED review beside a red pullfrog-approval check gets one re-request and no ci-fix order", [commentsOf(commented.calls, 30).map((text) => text.split("\n")[1]), commented.launched.length], [[PLAIN], 0])

  const merged = { number: 31, body: `Tracks ${REPOSITORY}#8\n\nRemaining: none`, mergedAt: iso(-3600 * 1000), headRefName: "chore/ticket-8" }
  const routes = [["--state merged", (args) => (args.join(" ").includes("#8\"") ? JSON.stringify([merged]) : "[]")]]
  const pausedTicket = ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null })
  for (const [label, extra] of [["under the pace line", {}], ["over the pace line", { reading: { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - MINUTE } }], ["while the driver is paused", { tickets: [pausedTicket, ticket(7, { labels: ["repo:ui", "Bug"] }), ticket(8)], probeReading: { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" } }]]) {
    const scene = scenario({ tickets: [ticket(7, { labels: ["repo:ui", "Bug"] }), ticket(8)], routes, ...extra })
    await scene.run()
    same(`drive: a ticket with no launch comment whose merged pull request says Remaining: none closes ${label}`, only(scene.calls, "closeTicket"), [["closeTicket", 8]])
  }
  const cached = scenario({ tickets: [ticket(7), ticket(9)] })
  await cached.run()
  await cached.run()
  same("drive: a later tick reuses the merged pull request read of a ticket that waits", cached.calls.filter((entry) => entry[0] === "gh" && entry[1].includes('orbit-tickets#9"')).length, 1)

  const lateBug = 50
  const settledNumber = 20
  const finished = (number, branch) => ({ number: 30, body: `Tracks ${REPOSITORY}#${number}\n\nRemaining: none`, mergedAt: iso(-60 * 1000), headRefName: branch })
  const staleRoutes = [["--state merged", (args) => (args.join(" ").includes('#7"') ? JSON.stringify([finished(7, "chore/ticket-7")]) : "[]")]]
  const stale = scenario({ tickets: [ticket(7)], routes: staleRoutes })
  stale.mem.merged.set(7, { at: NOW - 5 * MINUTE, history: [] })
  await stale.run()
  same("drive: a merge that a cached history misses starts no build for a ticket that says Remaining: none", stale.launched.length, 0)
  await stale.run()
  same("drive: the next tick closes the ticket that the fresh read found finished", [only(stale.calls, "closeTicket"), stale.launched.length], [[["closeTicket", 7]], 0])

  const crowd = Array.from({ length: 11 }, (_, index) => ticket(index + 1))
  const spent = scenario({ tickets: [...crowd, ticket(lateBug, { labels: ["repo:ui", "Bug"] })], routes: [["--state merged", (args) => (args.join(" ").includes(`#${lateBug}"`) ? JSON.stringify([finished(lateBug, `fix/ticket-${lateBug}`)]) : "[]")]] })
  await spent.run()
  same("drive: a finished Bug ticket that the spent read budget could not see starts no order", spent.launched.some((entry) => entry.worktree.includes(`ticket-${lateBug}`)), false)

  const twice = [comment("launch", JSON.stringify({ kind: "build", part: null, branch: `chore/ticket-${settledNumber}` }), -7200 * 1000), comment("launch", JSON.stringify({ kind: "build", part: null, branch: `chore/ticket-${settledNumber}` }), -3600 * 1000)]
  const settled = scenario({ tickets: [...crowd.slice(0, 10), ticket(settledNumber, { comments: twice })], routes: [["--state merged", (args) => (args.join(" ").includes(`#${settledNumber}"`) ? JSON.stringify([{ ...finished(settledNumber, `chore/ticket-${settledNumber}`), body: `Tracks ${REPOSITORY}#${settledNumber}\n\nRemaining: the settings screen` }]) : "[]")]] })
  await settled.run()
  same("drive: a waiting ticket whose merged history was not read gets no cap check and no needs:owner", [only(settled.calls, "editLabels").length, commentsOf(settled.calls, settledNumber).length], [0, 0])
}

const reviewReply = (offset) => review("COMMENTED", HEAD, offset)

const laneAndReviewPassCases = async () => {
  const exitDuringRead = scenario({ tickets: [ticket(7)] })
  let finishWorker
  exitDuringRead.env.worker.launch = (options) => { exitDuringRead.launched.push(options); return new Promise((resolve) => { finishWorker = () => resolve({ exitCode: 0, killed: null, sessionId: "s1", utilization: 0.2, resetsAt: RESETS_AT, status: "allowed", result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null } }) }) }
  await tick(exitDuringRead.env, exitDuringRead.mem)
  const readLanding = exitDuringRead.env.github.readRepositoryState
  exitDuringRead.env.github.readRepositoryState = async (key) => {
    if (key === "landing") { finishWorker(); await new Promise((resolve) => setImmediate(resolve)) }
    return readLanding(key)
  }
  await tick(exitDuringRead.env, exitDuringRead.mem)
  same("drive: a worker that exits during the read of a tick keeps the lane for that tick", exitDuringRead.launched.length, 1)

  const answered = (count) => {
    const requests = Array.from({ length: count }, (_, index) => comment("request", `${PLAIN} whole diff`, (-50 + index * 20) * MINUTE))
    const replies = Array.from({ length: count }, (_, index) => review("APPROVED", HEAD, (-40 + index * 20) * MINUTE, { body: "> No issues." }))
    return scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), ...requests], reviews: [review("APPROVED", HEAD, -60 * MINUTE), ...replies] })] } })
  }
  const oneAnswer = answered(1)
  await oneAnswer.run()
  same("drive: one whole-diff request answered with no whole-diff review gets one re-request", [commentsOf(oneAnswer.calls, 30).map((text) => text.split("\n")[1]), only(oneAnswer.calls, "editLabels").length], [[`${PLAIN} whole diff`], 0])
  const twoAnswers = answered(2)
  await twoAnswers.run()
  same("drive: two whole-diff requests answered with no whole-diff review give needs:owner and no third request", [commentsOf(twoAnswers.calls, 30).filter((text) => text.includes("review")).length, only(twoAnswers.calls, "editLabels").length], [0, 2])

  const repliesBeforeChanges = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [reviewReply(-9 * MINUTE), reviewReply(-8 * MINUTE), review(CHANGES_REQUESTED, HEAD, -5 * MINUTE)] })] } })
  await repliesBeforeChanges.run()
  same("drive: thread replies before a review with no BLOCKING comment do not count as a second unusable review", [commentsOf(repliesBeforeChanges.calls, 30).map((text) => text.split("\n")[1]), only(repliesBeforeChanges.calls, "editLabels").length], [[PLAIN], 0])

  const replyAfterApproval = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("APPROVED", HEAD, -10 * MINUTE), reviewReply(-5 * MINUTE)] })] } })
  await replyAfterApproval.run()
  same("drive: a thread reply after the approval leaves the approval as the latest review and the bar holds", only(replyAfterApproval.calls, "merge").length, 1)

  const failedRun = { databaseId: 78, displayTitle: "Respond to mention on #7 [abc]", status: "completed", conclusion: "failure", createdAt: iso(-10 * MINUTE), updatedAt: iso(-5 * MINUTE) }
  const repliesThenStop = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [reviewReply(-8 * MINUTE), reviewReply(-7 * MINUTE)] })] }, runs: [failedRun], routes: [["--log-failed", "You've hit your limit. Resets 4am (America/Sao_Paulo)"]] })
  await repliesThenStop.run()
  same("drive: a Pullfrog run that replies to two threads and stops at a usage limit pauses the driver", [only(repliesThenStop.calls, "createTicket").length, only(repliesThenStop.calls, "editLabels").length], [1, 0])

  const recordedBlocking = RECORDED_CHANGES_REQUESTED.comments.nodes.filter((entry) => entry.body.startsWith("BLOCKING:")).map((entry) => ({ path: entry.path, line: entry.line, body: entry.body }))
  const recordedChanges = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review(RECORDED_CHANGES_REQUESTED.state, HEAD, -5 * MINUTE, { body: RECORDED_CHANGES_REQUESTED.body, blocking: recordedBlocking })] })] } })
  await recordedChanges.run()
  same("drive: a recorded CHANGES_REQUESTED Pullfrog review with BLOCKING comments gives one fix order and no request", [recordedBlocking.length > 0, recordedChanges.launched.length, commentsOf(recordedChanges.calls, 30).length], [true, 1, 0])
  const unusableChanges = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -9 * MINUTE), review(CHANGES_REQUESTED, HEAD, -5 * MINUTE)] })] } })
  await unusableChanges.run()
  same("drive: two CHANGES_REQUESTED reviews with no BLOCKING comment at one head give needs:owner and no third request", [commentsOf(unusableChanges.calls, 30).filter((text) => text.includes("review")).length, only(unusableChanges.calls, "editLabels").map((entry) => entry[1])], [0, ["tickets", "ui"]])

  const refusedLabel = (comments) => {
    const scene = scenario({ tickets: [], pulls: { landing: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", comments, checks: [check("Unit Tests", "FAILURE")] })] } })
    scene.env.github.editLabels = async (...args) => { scene.calls.push(["editLabels", ...args]); throw new Error("Unknown label(s): needs:owner") }
    return scene
  }
  const unlabelled = refusedLabel([comment("ticket", "T")])
  await unlabelled.run()
  same("drive: a pull request with no ticket whose label write fails still gets one needs-owner comment and one notification", [commentsOf(unlabelled.calls, 30).filter((text) => text.includes("needs-owner")).length, only(unlabelled.calls, "notify").length], [1, 1])
  const marked = refusedLabel([comment("ticket", "T"), comment("needs-owner", "The check failed.")])
  await marked.run()
  await marked.run()
  same("drive: a pull request with no ticket and a needs-owner comment gets no second comment and no second notification", [commentsOf(marked.calls, 30).length, only(marked.calls, "notify").length], [0, 0])

  const landed = scenario({ tickets: [ticket(7)], gitRoutes: [heads(HEAD, NEXT_HEAD), ["ls-remote", `${NEXT_HEAD}\trefs/heads/chore/ticket-7\n`], ["log --format=%H", `${NEXT_HEAD}\n`]], routes: [["--head chore/ticket-7", "31\n"]] })
  landed.env.worker.launch = (options) => { writeFileSync(options.logFile, bashRun("git push -u origin chore/ticket-7", FORBIDDEN_OUTPUT)); return Promise.resolve(clean) }
  await landed.run()
  await landed.run()
  same("drive: a worker whose git push printed the 403 text but whose commits are on the remote is not a failed push and gets its commit records", [only(landed.calls, "editLabels").length, only(landed.calls, "notify").length, commentsOf(landed.calls, 31).map((text) => text.split("\n")[1])], [0, 0, [`worker s1 -> ${NEXT_HEAD}`]])
}

const FAILED_PUSH_LOG = bashRun("git push -u origin chore/ticket-7", FORBIDDEN_OUTPUT)

const logOnlyCases = async () => {
  const readsText = bashRun("cat tools/drive.mjs", `const FORBIDDEN_PUSH = /The requested URL returned error: 403/`, "toolu_read")
  const unpushed = [heads(HEAD, NEXT_HEAD), ["ls-remote", ""]]
  const read = scenario({ tickets: [ticket(7)], gitRoutes: unpushed })
  read.env.worker.launch = (options) => { writeFileSync(options.logFile, readsText); return Promise.resolve(clean) }
  await read.run()
  await read.run()
  same("drive: a worker that read the 403 text in a file is not a failed push, even with commits that the remote lacks", [only(read.calls, "editLabels").length, only(read.calls, "notify").length], [0, 0])

  const noCommit = scenario({ tickets: [ticket(7)], gitRoutes: [["ls-remote", ""]] })
  noCommit.env.worker.launch = (options) => { writeFileSync(options.logFile, FAILED_PUSH_LOG); return Promise.resolve({ ...clean, exitCode: 1 }) }
  await noCommit.run()
  await noCommit.run()
  same("drive: a worker with no commit since its launch has nothing to push, so its 403 text is not a failed push", [only(noCommit.calls, "editLabels").length, only(noCommit.calls, "notify").length], [0, 0])

  const findLog = `${readsText}${resultLine("Area: tools\n\nsrc/a.mjs:3 | class | fix")}`
  const find = scenario({ tickets: [ticket(7, { comments: [partComment(1, 1, "Kind: find")] })], gitRoutes: [["ls-remote", ""]] })
  find.env.worker.launch = (options) => { writeFileSync(options.logFile, findLog); return Promise.resolve(clean) }
  await find.run()
  await find.run()
  same("drive: a find order whose slice holds the 403 text posts its findings comment and gets no needs:owner", [only(find.calls, "editLabels").length, commentsOf(find.calls, 7).filter((text) => text.startsWith(marked("findings", "Findings, part 1"))).length], [0, 1])
  same("drive: the push outputs of a log are those of its git push commands only", pushOutputs(`${readsText}${FAILED_PUSH_LOG}`), [FORBIDDEN_OUTPUT])
}

const runningWorkCases = async () => {
  const never = (scene, tickets) => {
    keepWrites(scene, tickets)
    scene.env.worker.launch = (options) => { scene.launched.push(options); return new Promise(() => {}) }
  }
  const launchOf = (kind, branch) => comment("launch", JSON.stringify({ kind, part: null, branch }))
  const blockingReview = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }] })

  const fixTickets = [ticket(7, { comments: [launchOf("fix", "chore/ticket-7-30")] })]
  const fix = scenario({ tickets: fixTickets, pulls: { ui: [pull(30, { reviews: [blockingReview] })] } })
  never(fix, fixTickets)
  await tick(fix.env, fix.mem)
  await tick(fix.env, fix.mem)
  same("drive: the second fix launch that still runs is not a third launch and gets no needs:owner on the next tick", [fix.launched.length, only(fix.calls, "editLabels").length, only(fix.calls, "notify").length, commentsOf(fix.calls, 7).filter((text) => text.includes("needs-owner")).length], [1, 0, 0, 0])

  const buildTickets = [ticket(7, { comments: [launchOf("build", "chore/ticket-7")] })]
  const build = scenario({ tickets: buildTickets })
  never(build, buildTickets)
  await tick(build.env, build.mem)
  await tick(build.env, build.mem)
  same("drive: the second build launch that still runs gets no needs:owner on the next tick", [build.launched.length, only(build.calls, "editLabels").length, only(build.calls, "notify").length], [1, 0, 0])

  const capped = scenario({ tickets: [ticket(7, { comments: [launchOf("fix", "chore/ticket-7-30"), launchOf("fix", "chore/ticket-7-30")] })], pulls: { ui: [pull(30, { reviews: [blockingReview] })] } })
  await capped.run()
  same("drive: with the lane free and no worker running, two fix launches still give needs:owner", [capped.launched.length, only(capped.calls, "editLabels").length], [0, 2])
  const cappedBuild = scenario({ tickets: [ticket(7, { comments: [launchOf("build", "chore/ticket-7"), launchOf("build", "chore/ticket-7")] })] })
  await cappedBuild.run()
  same("drive: with the lane free and no worker running, two build launches still give needs:owner", [cappedBuild.launched.length, only(cappedBuild.calls, "editLabels").length], [0, 1])
}

const paceStampCases = async () => {
  let clock = NOW
  const exitAt = (utilization) => ({ ...clean, utilization, resetsAt: RESETS_AT, status: "allowed" })
  const run = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE } })
  run.env.now = () => clock
  run.env.worker.launch = (options) => { run.launched.push(options); return Promise.resolve(exitAt(0.4)) }
  run.env.snapshot = () => (clock >= NOW + 30 * MINUTE ? { utilization: 0.6, resetsAt: RESETS_AT, at: NOW + 30 * MINUTE, email: AUTH.email } : null)
  await run.run()
  clock = NOW + 40 * MINUTE
  await run.run()
  same("drive: a worker reading is stamped with its launch, so a snapshot taken during the run is newer and holds the pace", run.launched.length, 1)

  const probed = scenario({ tickets: [ticket(7)], reading: null })
  let probeClock = NOW
  probed.env.now = () => probeClock
  probed.env.worker.probe = async () => { probeClock = NOW + 2 * MINUTE; return { utilization: 0.1, resetsAt: RESETS_AT, status: "allowed" } }
  await probed.run()
  same("drive: a probe reading is stamped with the time the probe started", probed.mem.reading.at, NOW)

  const newer = scenario({ tickets: [ticket(7)] })
  let newerClock = NOW
  newer.env.now = () => newerClock
  newer.env.worker.launch = (options) => { newer.launched.push(options); return Promise.resolve(exitAt(0.4)) }
  await newer.run()
  newer.mem.reading = { utilization: 0.1, resetsAt: RESETS_AT, at: NOW + 10 * MINUTE, account: ACCOUNT.key }
  newerClock = NOW + 40 * MINUTE
  await newer.run()
  same("drive: the reading of a worker that started before a newer reading does not replace it", newer.mem.reading.utilization, 0.1)
}

const reapOutcomeCases = async () => {
  const stopped = { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null }
  const outcome = async (label, { tickets = [ticket(7)], result = {}, log = null, gitRoutes = [] }, expected) => {
    const scene = scenario({ tickets, gitRoutes })
    keepWrites(scene, tickets)
    scene.env.worker.launch = (options) => {
      scene.launched.push(options)
      if (log !== null) writeFileSync(options.logFile, log)
      return Promise.resolve({ ...clean, ...result })
    }
    await scene.run()
    await scene.run()
    same(`drive: ${label}`, [scene.launched.length, only(scene.calls, "editLabels").length, only(scene.calls, "notify").length], expected)
    return scene
  }
  await outcome("a worker that ends with NEEDS_DECISION is not launched again by the tick that reaps it", { result: { result: { ...stopped, needsDecision: "Raise the price?" } } }, [1, 1, 1])
  await outcome("a worker whose push failed with HTTP 403 is not launched again by the tick that reaps it", { result: { exitCode: 1 }, log: FAILED_PUSH_LOG, gitRoutes: [heads(HEAD, NEXT_HEAD), ["ls-remote", ""]] }, [1, 1, 1])
  const findTickets = [ticket(7, { comments: [partComment(1, 1, "Kind: find")] })]
  const finder = await outcome("a find worker whose findings the reap posts is not launched again by the tick that reaps it", { tickets: findTickets, log: resultLine("Area: tools\n\nsrc/a.mjs:3 | class | fix") }, [1, 0, 0])
  same("drive: the reap of a find worker posts one findings comment", commentsOf(finder.calls, 7).filter((text) => text.startsWith(marked("findings", "Findings, part 1"))).length, 1)
  const limited = await outcome("a worker that stops at a usage limit is not launched again by the tick that reaps it", { result: { exitCode: 1, result: { ...stopped, usageLimitReached: true, error: "You've hit your limit. Resets 4am (America/Sao_Paulo)" } } }, [1, 0, 1])
  same("drive: the reap of a usage limit opens one pause issue", only(limited.calls, "createTicket").length, 1)
  await outcome("a killed worker gets exactly one new launch from the tick that reaps it", { result: { exitCode: null, killed: "hard-ceiling", killReason: "passed its hard ceiling" } }, [2, 0, 0])

  const failedFindTickets = [ticket(7, { comments: [partComment(1, 1, "Kind: find")] })]
  const failedFind = await outcome("a find worker that ends on an API error posts no findings and gets its second launch", { tickets: failedFindTickets, result: { exitCode: 1, result: { ...stopped, error: "API Error: 529 Overloaded" } }, log: `${JSON.stringify({ type: "result", is_error: true, result: "API Error: 529 Overloaded" })}\n` }, [2, 0, 0])
  same("drive: an API error result is never posted as the findings of a part", commentsOf(failedFind.calls, 7).filter((text) => text.includes("Findings, part")).length, 0)
}

const unreadLogCases = async () => {
  const failedRun = { databaseId: 79, displayTitle: "Respond to mention on #7 [abc]", status: "completed", conclusion: "failure", createdAt: iso(-10 * MINUTE), updatedAt: iso(-5 * MINUTE) }
  let reads = 0
  const scene = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun], routes: [["--log-failed", () => { if (reads++ === 0) throw new Error("gh run view failed: HTTP 502"); return "You've hit your limit. Resets 4am (America/Sao_Paulo)" }]] })
  await scene.run()
  same("drive: a failed Pullfrog log that cannot be read does not pause the driver", only(scene.calls, "createTicket").length, 0)
  await scene.run()
  same("drive: a failed Pullfrog log that could not be read is read again on the next tick and pauses the driver", only(scene.calls, "createTicket").length, 1)
}

export const driverUnit = async () => {
  await admissionCases()
  await paceCases()
  await usageLimitCases()
  await workerCases()
  await capCases()
  await reviewCases()
  await mergeCases()
  await updateCases()
  await ciCases()
  await closeCases()
  await intakeCases()
  await accountCases()
  await robustnessCases()
  await cliCases()
  await blockingClassCases()
  await laneAndReviewPassCases()
  await logOnlyCases()
  await runningWorkCases()
  await paceStampCases()
  await reapOutcomeCases()
  await unreadLogCases()
}
