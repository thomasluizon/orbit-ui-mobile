/** Table tests of the delivery driver's tick: the fake seams, the scenarios and their exact writes. */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { accountFrom, allowOverLimit, createMemory, guardStart, launchesOf, main, marked, missingTools, pathsOverlap, paceState, parseArguments, pushOutputs, rankTickets, readSleep, recordStart, resultText, setSleep, smokeArguments, tick, ticketComment } from "../drive.mjs"
import { changesDriver, endRun, lastLine, readPin } from "../lib/driver-pin.mjs"
import { bodyFindings } from "../lib/github.mjs"
import { directoryHolders, isUsageLimitMessage, isWorkerProcess, KILL_REASONS, progressWatch, readSnapshot, usageLimitIn, WORKER_LIMITS } from "../lib/worker.mjs"
import { T, root, same } from "./_harness.mjs"

const FIXTURE = JSON.parse(readFileSync(new URL("../__fixtures__/drive-github.json", import.meta.url), "utf8"))
const READS = FIXTURE.driverReads
const RECORDED_CHANGES_REQUESTED = FIXTURE.changesRequestedReview.node
const CHANGES_REQUESTED = RECORDED_CHANGES_REQUESTED.state
const AUTH = READS.claudeAuthStatus.output
const ACCOUNT = accountFrom(AUTH)
const WORKER_AUTH = { ...AUTH, email: "worker.account@example.test", orgId: "00000000-0000-4000-8000-000000000003" }
const WORKER_ACCOUNT = accountFrom(WORKER_AUTH)
const WORKER_DIRECTORY = "/home/x/.claude-orbit-workers"
const NOW = Date.parse("2026-11-19T12:00:00Z")
const RESETS_AT = Math.floor((NOW + 3.5 * 24 * 3600 * 1000) / 1000)
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
/** The record of the one rerun that comes before a launch. The run of `check` is 9001. */
const RERAN = comment("record", "driver rerun 9001")

const ticket = (number, extra = {}) => ({ number, title: `Ticket ${number}`, body: "Do the work.", labels: ["repo:ui", "Improvement"], repoKey: "ui", blockedBy: [], comments: [], ...extra })
const blocker = (number, open = true, labels = []) => ({ number, open, labels, repoKey: "ui" })
const partComment = (number, total, extra = "") => comment(null, `Part ${number} of ${total}: part ${number}\n${extra}`, -7200 * 1000)

let scenarios = 0

/** A driver environment whose every seam is a recorder. `routes` answer `gh` calls by text; `git` answers by its first words. */
const scenario = ({ tickets = [], pulls = { ui: [], api: [], landing: [] }, routes = [], gitRoutes = [], reading = { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, token = "token", ownerToken = "owner-token", dryRun = false, runs = [], failedSteps = [], limit = null, probeReading = undefined, unmet = [], auth = AUTH, stateDirectory = null, allowance = null, sleeping = false, occupants = [], directories = [], driver = null, workerAuth = null, workerReading = null, workerProbeReading = undefined, releasePorts = null } = {}) => {
  const calls = []
  const messages = []
  let elapsed = 0
  const record = (name) => async (...args) => { calls.push([name, ...args]); return undefined }
  const states = Object.fromEntries(["ui", "api", "landing"].map((key) => [key, { repositoryKey: key, slug: `thomasluizon/${key}`, defaultBranch: "main", numbers: (pulls[key] ?? []).map((entry) => entry.number), pulls: pulls[key] ?? [] }]))
  const launched = []
  const stateDir = stateDirectory ?? join(root, `drive-tick-state-${++scenarios}`)
  const watched = { fingerprint: "a", logBytes: 0 }
  mkdirSync(join(stateDir, "logs"), { recursive: true })
  const config = { tickets: { repository: REPOSITORY }, repos: { ui: "/r/ui", api: "/r/api", landing: "/r/landing" } }
  const env = {
    config, dryRun, now: () => NOW, stateDir, lines: [], home: "/home/x",
    // Each read of the clock moves it by 12.3 seconds, so a tick that reads it twice took 12 seconds.
    clock: () => (elapsed += 12300),
    log: (line) => messages.push(line), slugOf: (key) => (key === "tickets" ? REPOSITORY : `thomasluizon/${key}`),
    github: {
      readTickets: async () => structuredClone(tickets),
      readRepositoryState: async (key) => structuredClone(states[key]),
      readFailedSteps: async () => failedSteps,
      pullfrogRuns: async (key) => { calls.push(["runList", key]); return runs },
      // The scenarios give one run list for every pull request, so the title filter keeps it whole.
      runsNaming: (list) => list,
      readDependabotUpdateTypes: async () => ["patch"],
      unmetDeployFirst: async () => unmet,
      createTicket: async (input) => { calls.push(["createTicket", input]); return { number: 99 } },
      comment: record("comment"), editLabels: record("editLabels"), merge: record("merge"), resolveThreads: record("resolveThreads"), updateBranch: record("updateBranch"), retarget: record("retarget"), rerunFailed: record("rerunFailed"), closeTicket: record("closeTicket"),
    },
    worker: {
      readWorkerToken: async () => token,
      readOwnerToken: async () => ownerToken,
      launch: (options) => { launched.push(options); return Promise.resolve({ exitCode: 0, killed: null, sessionId: "s1", utilization: 0.2, resetsAt: RESETS_AT, status: "allowed", result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null }, ...(limit ?? {}) }) },
      KILL_REASONS, WORKER_LIMITS,
      questionsInvocation: ({ token: value }) => ({ command: { executable: "claude", args: ["--model", "claude-opus-5-5"] }, environment: { GH_TOKEN: value } }),
      worktreeOccupants: (worktree) => (calls.push(["occupants", worktree]), occupants),
      processDirectories: () => (calls.push(["directories"]), directories),
      directoryHolders,
      progressWatch: (options) => progressWatch({ ...options, fingerprint: async () => watched.fingerprint, logSize: () => watched.logBytes }),
      killWorkerTree: (pid, signal) => { calls.push(["kill", pid, signal]) },
      probe: async ({ invocation } = {}) => {
        const onWorker = invocation?.environment?.CLAUDE_CONFIG_DIR === WORKER_DIRECTORY
        calls.push(["probe", onWorker ? "worker" : "main"])
        const chosen = onWorker ? workerProbeReading : probeReading
        return chosen === undefined ? { utilization: 0.1, resetsAt: RESETS_AT, status: "allowed" } : chosen
      },
    },
    invocation: async (token, name = "main") => ({ command: { executable: "claude", args: [] }, environment: { ...(name === "worker" ? { CLAUDE_CONFIG_DIR: WORKER_DIRECTORY } : {}), ...(token ? { GH_TOKEN: token } : {}) } }),
    git: async (cwd, args) => { calls.push(["git", ...args]); const hit = gitRoutes.find(([text]) => args.join(" ").includes(text)); return hit ? { status: 0, stderr: "", stdout: typeof hit[1] === "function" ? hit[1](args) : hit[1] } : { status: args[0] === "rev-parse" && args.includes("--quiet") ? 1 : 0, stderr: "", stdout: args[0] === "rev-parse" ? HEAD : "" } },
    gh: async (args) => { calls.push(["gh", args.join(" ")]); const hit = routes.find(([text]) => args.join(" ").includes(text)); if (hit) return typeof hit[1] === "function" ? hit[1](args) : hit[1]; if (args[0] === "pr" && args[1] === "list") return "[]"; if (args[0] === "issue") return "[]"; if (args[0] === "api") return "[]"; return "" },
    notify: async (message) => { calls.push(["notify", message]) },
    findRepositories: (path) => [path],
    keychain: async () => null,
    fetchJson: async () => ({ body: [], link: null }),
    snapshot: () => null,
    // With no `workerAuth` the second login is the main login, which the driver counts once.
    authStatus: async (name = "main") => structuredClone(name === "worker" ? workerAuth ?? auth : auth),
    processAlive: (pid) => { try { process.kill(pid, 0); return true } catch { return false } },
  }
  if (releasePorts !== null) env.releasePorts = releasePorts
  if (driver !== null) Object.assign(env, { driverWorktree: "/r/driver", selfUpdate: driver.update ?? false, smoke: async () => driver.smoke ?? true })
  const mem = createMemory()
  mem.reading = reading === null ? null : { account: ACCOUNT.key, ...reading }
  if (workerReading !== null) mem.worker.reading = { account: WORKER_ACCOUNT.key, ...workerReading }
  if (allowance !== null) writeFileSync(join(stateDir, "over-limit.json"), `${JSON.stringify(allowance)}\n`)
  if (sleeping) writeFileSync(join(stateDir, "sleep.json"), `${JSON.stringify({ on: true, since: iso(-60 * MINUTE) })}\n`)
  mem.lastIntakeAt = NOW
  return { env, mem, calls, messages, launched, watched, run: async () => { const result = await tick(env, mem); await Promise.all(mem.running.values()); if (process.env.DEBUG_DRIVE_TICK) console.error(messages.splice(0).join("\n")); return result } }
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
    const kind = /^<!-- orbit-drive:([a-z-]+) -->/.exec(body)?.[1] ?? null
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
  await wait("takes a Bug before a longer chain", [ticket(9, { labels: ["repo:ui", "Bug"] }), ticket(7), ticket(8, { blockedBy: [blocker(7)] })], "/r/orbit-worktrees/ui/fix-ticket-9", { reading: { utilization: 0.6, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  const runsLast = async (label, tickets, expected) => {
    const scene = scenario({ tickets, dryRun: true })
    const printed = []
    scene.env.log = (line) => printed.push(line)
    await scene.run()
    same(`drive: admission ${label}`, printed.find((line) => line.startsWith("ticket ") && line.includes("#9:")).split("#9: ")[1], expected)
  }
  const sweep = (extra = {}) => ticket(9, { labels: ["repo:ui", "Bug", "runs-last:repo"], ...extra })
  const audit = (extra = {}) => ticket(9, { labels: ["repo:ui", "Bug", "runs-last:board"], ...extra })
  await runsLast("holds a runs-last:repo ticket while another ticket of its repository is open", [sweep(), ticket(7)], "wait: runs last (1 open)")
  await runsLast("admits a runs-last:repo ticket when the only other open ticket is of another repository", [sweep(), ticket(7, { labels: ["repo:api", "Improvement"], repoKey: "api" })], "admit build on fix/ticket-9")
  await runsLast("counts every other open ticket of the repository for a runs-last:repo ticket", [sweep(), ticket(7), ticket(8), ticket(5, { labels: ["repo:ui", "owner-work"] })], "wait: runs last (3 open)")
  await runsLast("holds a runs-last:board ticket while a ticket of any repository is open", [audit(), ticket(7, { labels: ["repo:landing", "Improvement"], repoKey: "landing" })], "wait: runs last (1 open)")
  await runsLast("admits a runs-last:board ticket when no other ticket is open", [audit()], "admit build on fix/ticket-9")
  await runsLast("holds a runs-last:board ticket while a runs-last:repo ticket is open", [audit(), ticket(7, { labels: ["repo:api", "runs-last:repo"], repoKey: "api" })], "wait: runs last (1 open)")
  await runsLast("does not hold a runs-last:repo ticket for a runs-last:board ticket of its repository", [sweep(), audit({ number: 8 })], "admit build on fix/ticket-9")
  await runsLast("does not hold a runs-last:repo ticket for another runs-last:repo ticket", [sweep(), sweep({ number: 8, labels: ["repo:ui", "runs-last:repo"] })], "admit build on fix/ticket-9")
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

const STOP_ISSUE_TITLE = "Driver stopped: weekly usage reached 90%"
const pending = () => new Promise(() => {})
const eventLine = (utilization) => `${JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { seven_day: { utilization, resetsAt: RESETS_AT } } } })}\n`

/** A scene whose workers never exit, so each tick sees the workers of the ticks before it. */
const runningScene = (options) => {
  const scene = scenario(options)
  scene.env.worker.launch = (launchOptions) => { scene.launched.push(launchOptions); writeFileSync(launchOptions.logFile, scene.logText?.() ?? ""); return pending() }
  return scene
}

const slotCases = async () => {
  const at = (utilization, extra = {}) => paceState({ reading: { utilization, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE, ...extra }, now: NOW })
  same("drive: the line is the share of the week gone times 0.90", at(0.3).line.toFixed(3), "0.450")
  same("drive: 1 slot above the line and under 0.10 below it, 2 slots at 0.10 under, 3 slots at 0.20 under", [0.6, 0.45, 0.4, 0.35, 0.3, 0.25, 0.05, 0].map((utilization) => at(utilization).slots), [1, 1, 1, 2, 2, 3, 3, 3])
  same("drive: a reading that is over 1 hour old with no worker running allows 1 slot, and a running worker keeps the headroom", [paceState({ reading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 2 * 3600 * 1000 }, now: NOW }).slots, paceState({ reading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 2 * 3600 * 1000 }, now: NOW, workersRun: true }).slots], [1, 3])
  same("drive: no reading allows 1 slot, never stops and is unknown", [paceState({ reading: null, now: NOW })].map((pace) => [pace.slots, pace.stopped, pace.state])[0], [1, false, "unknown"])
  const ended = paceState({ reading: { utilization: 0.97, resetsAt: Math.floor(NOW / 1000) - 10, at: NOW - 5 * MINUTE }, now: NOW })
  same("drive: a reading of a week that has ended never stops", [ended.stopped, ended.state, ended.slots], [false, "reset", 1])
  same("drive: 0.89 runs and 0.90 stops, at any age of the reading", [at(0.89).stopped, at(0.9).stopped, at(0.97).stopped, at(0.9, { at: NOW - 5 * 3600 * 1000 }).stopped], [false, true, true, true])
  const allowed = (resetsAt) => paceState({ reading: { utilization: 0.93, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, now: NOW, allowance: { resetsAt } })
  same("drive: an allow file of the current week lifts the stop with 1 slot, and an allow file of an old week does not", [allowed(RESETS_AT).stopped, allowed(RESETS_AT).state, allowed(RESETS_AT).slots, allowed(RESETS_AT - 7 * 24 * 3600).stopped, allowed(RESETS_AT - 7 * 24 * 3600).state], [false, "allowed", 1, true, "stopped"])

  const launches = async (utilization, count, extra = {}) => {
    const scene = scenario({ tickets: Array.from({ length: count }, (_, index) => ticket(index + 7)), reading: { utilization, resetsAt: RESETS_AT, at: NOW - MINUTE }, ...extra })
    await scene.run()
    return scene
  }
  same("drive: a free slot and an admissible order over the line start a worker on the same tick, and only 1 of 3 orders", (await launches(0.6, 3)).launched.length, 1)
  same("drive: 0.10 under the line gives 2 workers and 0.20 under it gives 3, never more", [(await launches(0.35, 4)).launched.length, (await launches(0.25, 4)).launched.length, (await launches(0, 5)).launched.length], [2, 3, 3])
  const logged = await launches(0.35, 1)
  same("drive: a worker that exits during a tick makes the loop start the next tick at once", logged.mem.woken, true)
  same("drive: a tick logs one pace line with the utilization, the line, the slots, the running workers, the free slots and the stop state", logged.messages.filter((line) => line.includes(" pace ")), [`${iso(0)} pace below (main ${ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 0, free 2, stop no; worker none; tick 12s)`])

  const fills = runningScene({ tickets: [ticket(7), ticket(8), ticket(9)], reading: { utilization: 0.25, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await tick(fills.env, fills.mem)
  fills.env.github.readTickets = async () => [ticket(7), ticket(8), ticket(9), ticket(10)]
  await tick(fills.env, fills.mem)
  same("drive: with 3 workers running no fourth worker starts, and a worker never starts twice on one branch", [fills.launched.length, new Set(fills.launched.map((entry) => entry.worktree)).size], [3, 3])
  fills.mem.reading = { ...fills.mem.reading, utilization: 0.1 }
  await tick(fills.env, fills.mem)
  same("drive: 3 workers still fill every slot when a fourth order waits", fills.launched.length, 3)

  const withParts = (first, second) => [ticket(7, { comments: [partComment(1, 2, `Paths: ${first}`), partComment(2, 2, `Paths: ${second}`)] })]
  const overlapping = runningScene({ tickets: withParts("apps/web/", "apps/web/a.ts"), reading: { utilization: 0.25, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await tick(overlapping.env, overlapping.mem)
  await tick(overlapping.env, overlapping.mem)
  same("drive: two parts of one ticket whose Paths overlap never run together", overlapping.launched.map((entry) => entry.worktree.split("/").at(-1)), ["chore-ticket-7-part-1"])
  const disjoint = runningScene({ tickets: withParts("apps/web/", "apps/mobile/"), reading: { utilization: 0.25, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await tick(disjoint.env, disjoint.mem)
  await tick(disjoint.env, disjoint.mem)
  same("drive: two parts of one ticket with disjoint Paths run together, each on its own branch", disjoint.launched.map((entry) => entry.worktree.split("/").at(-1)), ["chore-ticket-7-part-1", "chore-ticket-7-part-2"])
  const unlisted = runningScene({ tickets: [ticket(7, { comments: [partComment(1, 2), partComment(2, 2)] })], reading: { utilization: 0.25, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await tick(unlisted.env, unlisted.mem)
  await tick(unlisted.env, unlisted.mem)
  same("drive: a part with no Paths line waits for the part that runs", unlisted.launched.length, 1)
}

const stopCases = async () => {
  const blocking = [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }]
  const stopScene = (extra = {}) => scenario({
    tickets: [ticket(7), ticket(8), ticket(9)],
    pulls: { ui: [
      pull(30, { reviews: [], comments: [comment("ticket", "T")] }),
      pull(31, { tracks: 8, headRef: "chore/ticket-8-31", reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking })] }),
      pull(32, { headRef: "chore/ticket-7-32", mergeState: "DIRTY" }),
      pull(40, { headRef: "chore/ticket-7-40" }),
    ] },
    reading: { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - MINUTE }, ...extra,
  })
  const stopped = stopScene()
  keepWrites(stopped, [])
  await stopped.run()
  const stopIssue = only(stopped.calls, "createTicket")[0]?.[1]
  const message = `Weekly usage of the main account reached 90% (0.900, resets ${new Date(RESETS_AT * 1000).toISOString()}). The main account starts no worker and Pullfrog posts no request. Tell the owner session to continue over 90%.`
  same("drive: at 0.90 no worker of any kind starts, no Pullfrog request is posted and no probe runs", [stopped.launched.length, commentsOf(stopped.calls, 30).length, only(stopped.calls, "probe").length], [0, 0, 0])
  same("drive: at 0.90 a pull request that meets the bar still merges", only(stopped.calls, "merge").map((entry) => entry.slice(1, 3)), [["ui", 40]])
  same("drive: at 0.90 the driver sends one notification and opens one needs:owner issue with the stop text", [only(stopped.calls, "notify").map((entry) => entry[1]), stopIssue?.title, stopIssue?.labels, stopIssue?.body], [[message], STOP_ISSUE_TITLE, [OWNER_LABEL], message])
  same("drive: at 0.90 the ticket lines and the pull request lines say the stop holds", [stopped.env.lines.filter((line) => line.startsWith(`ticket ${REPOSITORY}#9:`)), stopped.env.lines.find((line) => line.startsWith("pull ui#30"))], [[`ticket ${REPOSITORY}#9: wait: the weekly usage stop holds every worker`], "pull ui#30: wait: the weekly usage stop holds Pullfrog requests"])

  const issue = ticket(60, { title: STOP_ISSUE_TITLE, labels: [OWNER_LABEL], repoKey: null })
  const known = stopScene({ tickets: [ticket(7), ticket(8), ticket(9), issue] })
  await known.run()
  same("drive: an open stop issue gets no second issue and no second notification", [only(known.calls, "createTicket").length, only(known.calls, "notify").length], [0, 0])

  const week = { resetsAt: RESETS_AT, account: ACCOUNT.key }
  const allowed = scenario({ tickets: [ticket(7), ticket(8), issue], reading: { utilization: 0.93, resetsAt: RESETS_AT, at: NOW - MINUTE }, allowance: week })
  await allowed.run()
  same("drive: an allow file of the current week resumes with 1 worker and closes the stop issue with a comment", [allowed.launched.length, only(allowed.calls, "closeTicket"), commentsOf(allowed.calls, 60).map((text) => /allowed use over 90%/.test(text))], [1, [["closeTicket", 60]], [true]])
  const oldWeek = scenario({ tickets: [ticket(7)], reading: { utilization: 0.93, resetsAt: RESETS_AT, at: NOW - MINUTE }, allowance: { resetsAt: RESETS_AT - 7 * 24 * 3600, account: ACCOUNT.key } })
  await oldWeek.run()
  same("drive: an allow file of an old week is ignored, so the stop applies again from 0.90", [oldWeek.launched.length, only(oldWeek.calls, "createTicket").length], [0, 1])
  const reset = scenario({ tickets: [ticket(7), issue], reading: { utilization: 0.93, resetsAt: Math.floor(NOW / 1000) - 10, at: NOW - 3 * 3600 * 1000 } })
  await reset.run()
  same("drive: a new week closes the stop issue with a comment and starts a worker", [only(reset.calls, "closeTicket"), commentsOf(reset.calls, 60).map((text) => /week reset/.test(text)), reset.launched.length], [[["closeTicket", 60]], [true], 1])

  const dry = stopScene({ dryRun: true })
  await dry.run()
  same("drive: the dry run prints the free slots and the stop state and writes nothing", [dry.messages.filter((line) => line.includes(" pace ")).map((line) => line.slice(line.indexOf("(") + 1)), dry.calls.filter((entry) => ["createTicket", "notify", "comment", "merge"].includes(entry[0])).length], [[`main ${ACCOUNT.key}: utilization 0.900, line 0.450, slots 1, running 0, free 0, stop yes; worker none; tick 12s)`], 0])

  const midRun = runningScene({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.5, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  midRun.logText = () => eventLine(0.5)
  await tick(midRun.env, midRun.mem)
  writeFileSync(midRun.launched[0].logFile, eventLine(0.92))
  midRun.mem.reading = { ...midRun.mem.reading, at: NOW - 5 * MINUTE }
  await tick(midRun.env, midRun.mem)
  same("drive: the event in the log of a running worker updates the reading, so the stop begins while the worker runs", [midRun.launched.length, only(midRun.calls, "createTicket").length, midRun.mem.reading.utilization], [1, 1, 0.92])
}

const probeCases = async () => {
  const noReading = scenario({ tickets: [ticket(7), ticket(8)], reading: null })
  await noReading.run()
  same("drive: a start with no reading runs one probe first, then admits with the slots that the reading gives", [only(noReading.calls, "probe").length, noReading.launched.length], [1, 3 - 1])
  const silent = scenario({ tickets: [ticket(7), ticket(8)], reading: null, probeReading: null })
  await silent.run()
  same("drive: a probe with no reading never stops the driver: it runs 1 worker and sends one notification", [silent.launched.length, only(silent.calls, "notify").length, silent.messages.filter((line) => line.includes(" pace unknown (")).length], [1, 1, 1])
  await silent.run()
  same("drive: a probe with no reading is not repeated inside the hour", only(silent.calls, "probe").length, 1)
  const stale = scenario({ tickets: [ticket(7), ticket(8), ticket(9)], reading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 3 * 3600 * 1000 } })
  await stale.run()
  same("drive: a reading over 1 hour old runs no probe and starts 1 worker, which gives the next reading", [only(stale.calls, "probe").length, stale.launched.length], [0, 1])
  const snapshot = scenario({ tickets: [ticket(7)], reading: null })
  snapshot.env.snapshot = () => ({ utilization: 0.95, resetsAt: RESETS_AT, at: NOW - MINUTE, email: AUTH.email })
  await snapshot.run()
  same("drive: a snapshot of the logged-in account at 0.95 stops the driver without a probe", [only(snapshot.calls, "probe").length, snapshot.launched.length, only(snapshot.calls, "createTicket").length], [0, 0, 1])

  writeFileSync(SNAPSHOT, JSON.stringify({ at: iso(0), email: "someone@example.test", rateLimits: { seven_day: { used_percentage: 54, resets_at: RESETS_AT } } }))
  same("drive: the snapshot reads a percent as a fraction and keeps the email for the account comparison", readSnapshot(SNAPSHOT), { utilization: 0.54, resetsAt: RESETS_AT, at: NOW, email: "someone@example.test" })
  same("drive: an unreadable snapshot gives no reading", readSnapshot(join(root, "no-such-snapshot.json")), null)
}

const allowCommandCases = async () => {
  const run = async (scene) => {
    const out = []
    const err = []
    const code = await allowOverLimit(scene.env, { out: (line) => out.push(line), err: (line) => err.push(line) })
    return { code, out, err, saved: existsSync(join(scene.env.stateDir, "over-limit.json")) ? JSON.parse(readFileSync(join(scene.env.stateDir, "over-limit.json"), "utf8")) : null }
  }
  const fromSnapshot = scenario({ reading: null })
  fromSnapshot.env.snapshot = () => ({ utilization: 0.93, resetsAt: RESETS_AT, at: NOW - MINUTE, email: AUTH.email })
  const written = await run(fromSnapshot)
  same("drive: --allow-over-limit writes the current resetsAt beside the pid files and runs no probe", [written.code, written.saved?.resetsAt, written.saved?.account, only(fromSnapshot.calls, "probe").length, written.out.length], [0, RESETS_AT, ACCOUNT.key, 0, 1])
  const probed = await run(scenario({ reading: null }))
  same("drive: --allow-over-limit with no reading takes one probe", [probed.code, probed.saved?.resetsAt], [0, RESETS_AT])
  const none = await run(scenario({ reading: null, probeReading: null }))
  same("drive: --allow-over-limit with no reading anywhere writes no file and exits 3", [none.code, none.saved, none.err.length], [3, null, 1])
  const signedOut = await run(scenario({ reading: null, auth: { ...AUTH, loggedIn: false } }))
  same("drive: --allow-over-limit while Claude is signed out writes no file and exits 3", [signedOut.code, signedOut.saved], [3, null])
  same("drive: --allow-over-limit is a mode, and the usage names the rule and no gap", [parseArguments(["--allow-over-limit"]).mode, /never idles/.test(await usageText()), /gap|one worker at a time/.test(await usageText())], ["allow-over-limit", true, false])
}

const usageText = async () => {
  const lines = []
  await main(["--help"], { out: (line) => lines.push(line) })
  return lines.join("\n")
}

const paceCases = async () => {
  await slotCases()
  await stopCases()
  await probeCases()
  await allowCommandCases()
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
  const pullfrogStopWithOrder = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [run], routes: [["--log-failed", logLine]] })
  await pullfrogStopWithOrder.run()
  same("drive: the tick that finds a Pullfrog usage limit starts no worker and adds no launch comment", [only(pullfrogStopWithOrder.calls, "createTicket").length, pullfrogStopWithOrder.launched.length], [1, 0])
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

const pullfrogRun = (databaseId, createdOffset, updatedOffset, status = "completed") => ({ databaseId, displayTitle: `Respond to mention on #7 [run${databaseId}]`, status, conclusion: status === "completed" ? "success" : null, createdAt: iso(createdOffset), updatedAt: iso(updatedOffset) })

const reviewRunCases = async () => {
  const WHOLE = `${PLAIN} whole diff`
  const approvedWithoutWholeDiff = (runs, reviewOffset = -8 * MINUTE) => scenario({
    tickets: [ticket(7)], runs,
    pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), comment("request", PLAIN, -30 * MINUTE), comment("request", WHOLE, -10 * MINUTE)], reviews: [review("APPROVED", HEAD, -12 * MINUTE), review("APPROVED", HEAD, reviewOffset, { body: "> No issues." })] })] },
  })
  const firstRun = pullfrogRun(1, -29 * MINUTE, -7 * MINUTE)

  const earlierRun = approvedWithoutWholeDiff([firstRun, pullfrogRun(2, -9 * MINUTE, -9 * MINUTE, "in_progress")])
  await earlierRun.run()
  same("drive: a review from a run that began before the whole-diff request is not its answer, and the driver posts no request while the whole-diff run runs", [commentsOf(earlierRun.calls, 30).length, only(earlierRun.calls, "merge").length, only(earlierRun.calls, "editLabels").length], [0, 0, 0])

  const noRunYet = approvedWithoutWholeDiff([firstRun])
  await noRunYet.run()
  same("drive: a review from an earlier run leaves the whole-diff request unanswered, so the driver waits and posts no second request", [commentsOf(noRunYet.calls, 30).length, only(noRunYet.calls, "merge").length], [0, 0])

  const queued = approvedWithoutWholeDiff([firstRun, pullfrogRun(2, -9 * MINUTE, -9 * MINUTE, "queued")])
  await queued.run()
  same("drive: a queued Pullfrog run holds the request", commentsOf(queued.calls, 30).length, 0)

  const answeredRun = scenario({
    tickets: [ticket(7)], runs: [firstRun, pullfrogRun(2, -9 * MINUTE, -4 * MINUTE)],
    pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), comment("request", PLAIN, -30 * MINUTE), comment("request", WHOLE, -10 * MINUTE)], reviews: [review("APPROVED", HEAD, -12 * MINUTE), review("APPROVED", HEAD, -5 * MINUTE, { body: "Whole diff: no blocking finding" })] })] },
  })
  await answeredRun.run()
  same("drive: a whole-diff review from a run that began after the request answers it and opens the merge", [commentsOf(answeredRun.calls, 30).length, only(answeredRun.calls, "merge").length], [0, 1])

  const lateRequest = scenario({ tickets: [ticket(7)], runs: [firstRun, pullfrogRun(2, -9 * MINUTE, -4 * MINUTE)], pulls: { ui: [pull(30, { changedFiles: 40, comments: [comment("ticket", "T"), comment("request", PLAIN, -30 * MINUTE), comment("request", WHOLE, -10 * MINUTE)], reviews: [review("APPROVED", HEAD, -12 * MINUTE), review("APPROVED", HEAD, -8 * MINUTE, { body: "> No issues." })] })] } })
  await lateRequest.run()
  same("drive: when the whole-diff run ends with no review, the review of the earlier run does not stand in for it", [only(lateRequest.calls, "merge").length, commentsOf(lateRequest.calls, 30).length], [0, 0])

  const firstRequest = scenario({ tickets: [ticket(7)], runs: [pullfrogRun(3, -2 * MINUTE, -1 * MINUTE, "in_progress")], pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T")] })] } })
  await firstRequest.run()
  same("drive: a run in progress holds the first request of a pull request", commentsOf(firstRequest.calls, 30).length, 0)

  const idle = scenario({ tickets: [ticket(7)], runs: [pullfrogRun(3, -20 * MINUTE, -15 * MINUTE)], pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T")] })] } })
  await idle.run()
  same("drive: a finished run holds nothing, so the first request goes out", commentsOf(idle.calls, 30).map((entry) => entry.split("\n")[1]), [PLAIN])
}

const worktreeOccupantCases = async () => {
  const occupied = scenario({ tickets: [ticket(7)], occupants: [4242] })
  await occupied.run()
  same("drive: a process in the worktree of an order starts no worker and writes no launch comment", [occupied.launched.length, only(occupied.calls, "comment").length, only(occupied.calls, "git").some((entry) => entry.join(" ").includes("worktree add"))], [0, 0, false])
  T("drive: the wait names the worktree and the pid", occupied.messages.some((line) => line.includes("another process holds the worktree") && line.includes("4242")))
  const free = scenario({ tickets: [ticket(7)] })
  await free.run()
  same("drive: a worktree with no other process gets the worker", [free.launched.length, only(free.calls, "occupants").length], [1, 1])
  const fixOccupied = scenario({ tickets: [ticket(7)], occupants: [4242], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "x" }] })] })] }, gitRoutes: [["worktree list", `worktree /r/wt\nHEAD ${HEAD}\nbranch refs/heads/chore/ticket-7-30\n`]] })
  await fixOccupied.run()
  same("drive: a fix order waits while a process holds the worktree of its pull request, and nothing merges into it", [fixOccupied.launched.length, only(fixOccupied.calls, "git").some((entry) => entry.join(" ").includes("merge --ff-only"))], [0, false])
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

/** The two ticket states of this file's fixtures: a review whose finding sits in the body, a cap that the owner answers, and a whole-diff request that the owner session posted. */
const ownerAndBodyCases = async () => {
  const RECORDED = FIXTURE.bodyBlockingReviews
  const recordedReviews = RECORDED.nodes.map((node) => review(node.state, RECORDED.head, Date.parse(node.submittedAt) - Date.parse("2026-11-21T17:00:00Z"), { body: node.body, blocking: [...node.comments.nodes.filter((entry) => entry.body.startsWith("BLOCKING:")), ...bodyFindings(node.body)] }))
  same("drive: each recorded body holds one BLOCKING finding and no inline comment", RECORDED.nodes.map((node) => [node.comments.nodes.length, bodyFindings(node.body).length, bodyFindings(node.body)[0].path]), [[0, 1, null], [0, 1, null]])
  const bodyFix = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { headSha: RECORDED.head, commits: [{ sha: RECORDED.head, parents: 1 }], reviews: recordedReviews })] } })
  await bodyFix.run()
  same("drive: two CHANGES_REQUESTED reviews with a body finding give one fix launch and no needs:owner", [bodyFix.launched.length, only(bodyFix.calls, "editLabels").length, commentsOf(bodyFix.calls, 30).length], [1, 0, 0])
  T("drive: the fix order carries the full text of the body finding and names the review body", ["the review body", "BLOCKING: missed requirement", "Smallest fix: run the eye check"].every((text) => bodyFix.launched[0].order.includes(text)))
  const bodyCap = scenario({ tickets: [ticket(7, { comments: [launchComment("fix", "chore/ticket-7-30"), launchComment("fix", "chore/ticket-7-30")] })], pulls: { ui: [pull(30, { headSha: RECORDED.head, commits: [{ sha: RECORDED.head, parents: 1 }], reviews: recordedReviews })] } })
  await bodyCap.run()
  T("drive: a capped pull request with a body finding names the review body in the open classes", needsOwnerComments(bodyCap.calls, 7).some((text) => text.includes("Open: the review body")))

  const branch = "chore/ticket-7-30"
  const finding = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }] })
  const capReport = (offset, head = HEAD, count = 2) => comment("needs-owner", `ui#30 at ${head}: ui#30 used its 2 fix launches. Launches: ${count}. Open: tools/a.mjs:3`, offset)
  const launches = [launchComment("fix", branch, -90 * MINUTE), launchComment("fix", branch, -80 * MINUTE)]
  const answered = scenario({ tickets: [ticket(7, { comments: [...launches, capReport(-60 * MINUTE), comment(null, "Use the second option for the label.", -30 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await answered.run()
  same("drive: a capped pull request whose label the owner removed after a ticket comment gets one fix launch and no needs:owner", [answered.launched.length, answered.launched[0]?.order.includes("Use the second option for the label."), only(answered.calls, "editLabels").length], [1, true, 0])
  const silent = scenario({ tickets: [ticket(7, { comments: [...launches, capReport(-60 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await silent.run()
  same("drive: a capped pull request whose label the owner removed with no ticket comment gets needs:owner again", [silent.launched.length, only(silent.calls, "editLabels").length], [0, 2])
  const before = scenario({ tickets: [ticket(7, { comments: [comment(null, "A note from before the cap.", -100 * MINUTE), ...launches, capReport(-60 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await before.run()
  same("drive: an owner comment from before the cap report grants no launch", [before.launched.length, only(before.calls, "editLabels").length], [0, 2])
  const queued = scenario({ tickets: [ticket(7, { comments: [...launches, capReport(-60 * MINUTE), comment("owner-question", "<!-- orbit-drive:owner-question -->\nWhich label?", -30 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await queued.run()
  same("drive: a queued owner question after the cap report grants no launch", [queued.launched.length, only(queued.calls, "editLabels").length], [0, 2])
  const extra = launchComment("fix", branch, -20 * MINUTE)
  const cappedAgain = scenario({ tickets: [ticket(7, { comments: [...launches, capReport(-60 * MINUTE), comment(null, "One more try.", -30 * MINUTE), extra, capReport(-10 * MINUTE, NEXT_HEAD, 3)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await cappedAgain.run()
  same("drive: the extra launch is used up, so a later cap with no new owner comment gives needs:owner", [cappedAgain.launched.length, only(cappedAgain.calls, "editLabels").length], [0, 2])
  const sameHead = (...later) => scenario({ tickets: [ticket(7, { comments: [...launches, capReport(-60 * MINUTE), comment(null, "One more try.", -30 * MINUTE), extra, ...later] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  const stuck = sameHead()
  await stuck.run()
  same("drive: a granted launch that leaves the head the same gives a new cap report with the launch count and a notification", [stuck.launched.length, needsOwnerComments(stuck.calls, 7).map((text) => /Launches: 3\. Open: tools\/a\.mjs:3/.test(text)), only(stuck.calls, "notify").length], [0, [true], 1])
  const stuckAnswered = sameHead(capReport(-10 * MINUTE, HEAD, 3), comment(null, "The answer to the question.", -5 * MINUTE))
  await stuckAnswered.run()
  same("drive: an owner comment after the second cap report at the same head grants the next launch with its comment", [stuckAnswered.launched.length, stuckAnswered.launched[0]?.order.includes("The answer to the question."), only(stuckAnswered.calls, "editLabels").length], [1, true, 0])
  const askedTwice = scenario({ tickets: [ticket(7, { comments: [...launches, capReport(-60 * MINUTE), comment(null, "One more try.", -30 * MINUTE), extra, capReport(-10 * MINUTE, NEXT_HEAD, 3), comment(null, "And one more.", -5 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await askedTwice.run()
  same("drive: a second owner comment after the second cap report grants a second extra launch with its own comment", [askedTwice.launched.length, askedTwice.launched[0]?.order.includes("And one more."), askedTwice.launched[0]?.order.includes("One more try.")], [1, true, false])

  const OWNER_REQUEST = FIXTURE.ownerWholeDiffRequest
  const at = Date.parse("2026-11-21T16:47:00Z")
  const offsetOf = (stamp) => Date.parse(stamp) - at
  const recorded = scenario({
    tickets: [ticket(7, { comments: [launchComment("fix", branch), launchComment("fix", branch)] })],
    runs: OWNER_REQUEST.runs.map((run) => ({ ...run, displayTitle: "Respond to mention on #7 [x]", createdAt: iso(offsetOf(run.createdAt)), updatedAt: iso(offsetOf(run.updatedAt)) })),
    pulls: { ui: [pull(30, {
      headSha: OWNER_REQUEST.head, commits: [{ sha: OWNER_REQUEST.reviews[0].commit, parents: 1 }, { sha: OWNER_REQUEST.head, parents: 1 }],
      comments: [comment("ticket", "T"), ...OWNER_REQUEST.requests.map((request) => comment("request", request.body.split("\n")[1], offsetOf(request.createdAt)))],
      reviews: OWNER_REQUEST.reviews.map((entry) => review(entry.state, entry.commit, offsetOf(entry.submittedAt), { body: entry.body })),
    })] },
  })
  await recorded.run()
  same("drive: a whole-diff request of the owner session that a whole-diff approval answers posts no second request and the pull request merges", [commentsOf(recorded.calls, 30).length, only(recorded.calls, "merge").length], [0, 1])
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

/** The recorded state of ui#2522: approved before a clean base merge made the head, and the head has no pullfrog-approval check run. */
const RECORDED_APPROVED = "3".repeat(40)
const RECORDED_HEAD = "9".repeat(40)
const withoutApprovalCheck = (extra = {}) => pull(30, { headSha: RECORDED_HEAD, commits: [{ sha: RECORDED_APPROVED, parents: 2 }, { sha: RECORDED_HEAD, parents: 2 }], checks: [check("Unit Tests")], mergeState: "BLOCKED", reviews: [review("APPROVED", RECORDED_APPROVED, -40 * MINUTE)], comments: [comment("ticket", "T"), comment("request", PLAIN, -60 * MINUTE)], ...extra })
const runOf = (status, startedAgo, endedAgo = startedAgo) => ({ databaseId: 77, displayTitle: "Respond to mention on #7 [x]", status, conclusion: status === "completed" ? "success" : null, createdAt: iso(-startedAgo * MINUTE), updatedAt: iso(-endedAgo * MINUTE) })
const checkRecord = (head, offset) => comment("record", `driver check request ${head}`, offset)

const checkOnlyCases = async () => {
  const run = async (extra, runs = []) => {
    const scene = scenario({ tickets: [ticket(7)], runs, gitRoutes: [["--remerge-diff", ""]], pulls: { ui: [withoutApprovalCheck(extra)] } })
    await scene.run()
    return scene
  }
  const texts = (scene) => commentsOf(scene.calls, 30).map((text) => text.split("\n").slice(0, 2).join("|"))
  const request = marked("request", PLAIN).split("\n").join("|")
  const asked = [request, marked("record", `driver check request ${RECORDED_HEAD}`).split("\n").join("|")]
  const first = await run({})
  same("drive: an approval before a clean base merge and no approval check gets one plain request", [texts(first), only(first.calls, "merge").length], [[request], 0])
  const flight = await run({}, [runOf("in_progress", 1, 0)])
  same("drive: the same state with a Pullfrog run in flight gets no request", [commentsOf(flight.calls, 30).length, only(flight.calls, "merge").length], [0, 0])
  // GitHub names the current head as the commit of an older review, so the review looks satisfied while the check is absent.
  const sameCommit = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] })
  same("drive: an approval that GitHub reports at the head with no approval check gets one plain request and its record", [texts(sameCommit), only(sameCommit.calls, "merge").length], [asked, 0])
  const settling = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] }, [runOf("completed", 6, 3)])
  same("drive: a run that ended 3 minutes ago gets no request yet", commentsOf(settling.calls, 30).length, 0)
  const waiting = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)], comments: [comment("ticket", "T"), checkRecord(RECORDED_HEAD, -10 * MINUTE)] })
  same("drive: a check request younger than 30 minutes with no run waits", commentsOf(waiting.calls, 30).length, 0)
  const again = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)], comments: [comment("ticket", "T"), checkRecord(RECORDED_HEAD, -31 * MINUTE)] })
  same("drive: 30 minutes after the first check request with no run gives one re-request", texts(again), asked)
  const afterRun = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -80 * MINUTE)], comments: [comment("ticket", "T"), checkRecord(RECORDED_HEAD, -50 * MINUTE)] }, [runOf("completed", 45, 20)])
  same("drive: 15 minutes after the run of the first check request ended gives one re-request", texts(afterRun), asked)
  const owner = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -90 * MINUTE)], comments: [comment("ticket", "T"), checkRecord(RECORDED_HEAD, -80 * MINUTE), checkRecord(RECORDED_HEAD, -40 * MINUTE)] })
  same("drive: a second miss at the same head gives needs:owner and no request", [commentsOf(owner.calls, 30).filter((text) => text.includes("request")).length, only(owner.calls, "editLabels").length], [0, 2])
  const other = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)], comments: [comment("ticket", "T"), checkRecord("8".repeat(40), -80 * MINUTE), checkRecord("8".repeat(40), -40 * MINUTE)] })
  same("drive: the check requests of an older head do not count against a new head", texts(other), asked)
  const behind = pull(30, { headSha: RECORDED_HEAD, behindBy: 1, mergeState: "BLOCKED", checks: [check("Unit Tests")], reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)], comments: [comment("ticket", "T")] })
  const stale = scenario({ tickets: [ticket(7)], routes: [["--json headRefOid", `${NEXT_HEAD}\n`]], pulls: { ui: [behind] } })
  await stale.run()
  same("drive: a head that is behind with no approval check is updated before any request", [only(stale.calls, "updateBranch").length, commentsOf(stale.calls, 30).filter((text) => text.includes("request")).length], [1, 0])
  const red = await run({ checks: [check("Unit Tests", "FAILURE")] })
  same("drive: a red check gets no check-only request", commentsOf(red.calls, 30).filter((text) => text.includes("request")).length, 0)
  const labelled = await run({ labels: [OWNER_LABEL], reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] })
  same("drive: a needs:owner pull request gets no check-only request", commentsOf(labelled.calls, 30).length, 0)
}

const STALL = "Driver stalled: no worker, request or merge for 60 minutes"

const stallCases = async () => {
  const stalled = async (offset, { extra = {}, runs = [runOf("in_progress", 1, 0)], tickets = [ticket(7)], sleeping = false } = {}) => {
    const stateDirectory = join(root, `drive-stall-${++scenarios}`)
    mkdirSync(stateDirectory, { recursive: true })
    if (offset !== null) writeFileSync(join(stateDirectory, "activity.json"), JSON.stringify({ at: NOW + offset }))
    const scene = scenario({ tickets, runs, stateDirectory, sleeping, pulls: { ui: [withoutApprovalCheck(extra)] } })
    await scene.run()
    scene.stateDirectory = stateDirectory
    return scene
  }
  const created = (scene) => only(scene.calls, "createTicket").filter(([, input]) => input.title === STALL)
  const first = await stalled(null)
  same("drive: the first tick starts the clock and opens no stall issue", [created(first).length, JSON.parse(readFileSync(join(first.stateDirectory, "activity.json"), "utf8")).at], [0, NOW])
  const young = await stalled(-59 * MINUTE)
  same("drive: 59 minutes of waiting with no action opens no stall issue", created(young).length, 0)
  const late = await stalled(-61 * MINUTE)
  const [[, issue]] = created(late)
  same("drive: 61 minutes with no action opens one needs:owner stall issue that names the waiting pull request", [created(late).length, issue.labels, issue.body.includes("ui#30: wait: a Pullfrog run is in progress")], [1, [OWNER_LABEL], true])
  T("drive: the stall is logged with the reason of the waiting item", late.messages.some((line) => / driver stall \(ui#30: wait: a Pullfrog run is in progress\)/.test(line)), late.messages.join(" | "))
  same("drive: the stall issue sends one notification", only(late.calls, "notify").length, 1)
  const open = await stalled(-61 * MINUTE, { tickets: [ticket(7), { ...ticket(41, { labels: [OWNER_LABEL] }), title: STALL }] })
  same("drive: an open stall issue is not opened twice", created(open).length, 0)
  const asleep = await stalled(-61 * MINUTE, { sleeping: true })
  same("drive: while sleep is on the stall issue opens and no notification goes out", [created(asleep).length, only(asleep.calls, "notify").length, JSON.parse(readFileSync(join(asleep.stateDirectory, "sleep-items.json"), "utf8")).length], [1, 0, 1])
  const acting = await stalled(-61 * MINUTE, { runs: [], extra: { reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] } })
  same("drive: a request in the tick resets the clock and opens no stall issue", [created(acting).length, commentsOf(acting.calls, 30).length > 0, JSON.parse(readFileSync(join(acting.stateDirectory, "activity.json"), "utf8")).at], [0, true, NOW])
  const closing = await stalled(-61 * MINUTE, { runs: [], extra: { reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] }, tickets: [ticket(7), { ...ticket(41, { labels: [OWNER_LABEL] }), title: STALL }] })
  same("drive: an action closes the open stall issue", only(closing.calls, "closeTicket"), [["closeTicket", 41]])
  const quiet = await stalled(-61 * MINUTE, { tickets: [ticket(7)], extra: { labels: [OWNER_LABEL] } })
  same("drive: a pull request that waits on the owner is no stall", created(quiet).length, 0)
  const merging = await stalled(-61 * MINUTE, { runs: [], extra: { checks: [check("Unit Tests"), approvalCheck()], mergeState: "CLEAN", reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] } })
  same("drive: a merge resets the clock", [only(merging.calls, "merge").length, created(merging).length], [1, 0])
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

  const red = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL], checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] } })
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
  const child = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { baseRef: "chore/ticket-7-part-1", reviews: [], comments: [comment("ticket", "T")] })] }, routes: [["--json headRefOid", `${NEXT_HEAD}\n`]] })
  await child.run()
  same("drive: a child whose base pull request merged is retargeted to main, updated, and asked for a first pass", [only(child.calls, "retarget"), only(child.calls, "updateBranch"), commentsOf(child.calls, 30)], [[["retarget", "ui", 30, "main"]], [["updateBranch", "ui", 30]], [marked("record", `driver update-branch -> ${NEXT_HEAD}`), marked("request", PLAIN)]])
  same("drive: the retargeted child is updated before its first request", child.calls.map((entry) => entry[0]).filter((name) => ["retarget", "updateBranch", "comment"].includes(name)), ["retarget", "updateBranch", "comment", "comment"])
  const stacked = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(29, { headRef: "chore/ticket-7-part-1" }), pull(30, { baseRef: "chore/ticket-7-part-1" })] } })
  await stacked.run()
  same("drive: a child whose base pull request is open stays on its base", only(stacked.calls, "retarget").length, 0)
}

const ciCases = async () => {
  const failing = (extra = {}) => pull(30, { checks: [check("Unit Tests", "FAILURE", extra), approvalCheck()] })
  const run = async (steps, routes = [], name = "Unit Tests", rerun = false) => {
    const scene = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check(name, "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), ...(rerun ? [RERAN] : [])] })] }, failedSteps: steps, routes })
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
  const barrier = await run(["Require deployment barriers for schema contractions"], [], "Guard Migrations", true)
  same("drive: a Guard Migrations barrier failure gives needs:owner and no order", [barrier.launched.length, only(barrier.calls, "editLabels").length], [0, 2])
  const other = await run(["Unit tests"], [["--log-failed", "AssertionError: expected 1 to be 2\n"]], "Unit Tests", true)
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
  const heldFor = async (label, pullsMerged, text) => {
    const scene = scenario({ tickets: [ticket(7, { comments: [launchRecord] })], routes: listed(pullsMerged) })
    await scene.run()
    same(`drive: ${label}`, [scene.launched.length, only(scene.calls, "editLabels").map((entry) => entry[3]), needsOwnerComments(scene.calls, 7).length, needsOwnerComments(scene.calls, 7).every((entry) => entry.includes(text))], [0, [{ add: [OWNER_LABEL] }], 1, true])
  }
  const listing = "Remaining: the App Store card needs the live listing URL, and the pt-BR copy needs /second-opinion."
  await heldFor("two merged pull requests with the same Remaining line launch no build and set needs:owner once", [merged(147, `Tracks ${REPOSITORY}#7\n\n${listing}`, "chore/ticket-7"), { ...merged(151, `Tracks ${REPOSITORY}#7\n\n${listing}`, "chore/ticket-7-r2"), mergedAt: iso(-1800 * 1000) }], listing)
  await heldFor("a Remaining line of owner items only launches no build and sets needs:owner", [merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: owner: set the listing URL`, "chore/ticket-7")], "owner: set the listing URL")
  await heldFor("a Remaining line that blocks on another ticket launches no build and sets needs:owner", [merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: owner: set the listing URL; blocked by #9`, "chore/ticket-7")], "blocked by #9")
  const mixed = scenario({ tickets: [ticket(7, { comments: [launchRecord] })], routes: listed([merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: owner: set the listing URL; the settings screen`, "chore/ticket-7")]) })
  await mixed.run()
  T("drive: a Remaining line with one item that a worker can do launches one build", mixed.launched.length === 1 && only(mixed.calls, "editLabels").length === 0 && /the settings screen/.test(orderText(mixed)))
  const differing = scenario({ tickets: [ticket(7, { comments: [launchRecord] })], routes: listed([merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: the import and the export`, "chore/ticket-7"), { ...merged(31, `Tracks ${REPOSITORY}#7\n\nRemaining: the export`, "chore/ticket-7-r2"), mergedAt: iso(-1800 * 1000) }]) })
  await differing.run()
  same("drive: two merged pull requests with different Remaining lines launch one build", [differing.launched.length, only(differing.calls, "editLabels").length], [1, 0])
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
  ].map((entry, index) => ({ number: 1700 + index, state: entry.title === "Closed ticket" ? "CLOSED" : "OPEN", closedAt: entry.title === "Closed ticket" ? "2026-11-10T00:00:00Z" : "0001-01-01T00:00:00Z", ...entry }))
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
  const regression = async (issue, tickets) => {
    const regressed = scenario({ tickets: [], routes: [["issue list", JSON.stringify(tickets)]] })
    regressed.mem.lastIntakeAt = 0
    regressed.env.keychain = async () => "sentry-token"
    regressed.env.fetchJson = async () => ({ body: [{ ...recorded.body[0], ...issue }], link: null })
    await regressed.run()
    return only(regressed.calls, "createTicket").map((entry) => entry[1]).filter((entry) => entry.title.endsWith(" (Sentry ORBIT-API-1Q)")).map((entry) => [entry.labels, entry.body.split("\n").at(-1)])
  }
  const closedTicket = (number, closedAt) => ({ number, state: "CLOSED", closedAt, title: "Triage", body: "Fixed ORBIT-API-1Q." })
  const openTicket = (number) => ({ number, state: "OPEN", closedAt: "0001-01-01T00:00:00Z", title: "Triage again", body: "Names ORBIT-API-1Q." })
  const regressedAfterClose = [closedTicket(3, "2026-11-10T00:00:00Z"), closedTicket(4, "2026-11-12T00:00:00Z")]
  same("drive: a regressed issue that only closed tickets name gets one Bug ticket that links them", await regression({}, regressedAfterClose), [[["repo:api", "Bug"], "The issue regressed after the fix of #3, #4."]])
  same("drive: a regressed issue that an open ticket names gets no ticket", await regression({}, [...regressedAfterClose, openTicket(5)]), [])
  same("drive: an unresolved issue that is not regressed and that a closed ticket names gets no ticket", await regression({ substatus: "ongoing" }, regressedAfterClose), [])
  same("drive: a regressed issue whose last event is older than the close gets no ticket, as the fix holds", await regression({}, [closedTicket(3, "2026-11-20T18:30:00Z")]), [])
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
  changed.mem.reading = { account: ACCOUNT.key, at: NOW - 3600 * 1000, utilization: 0.5, resetsAt: RESETS_AT }
  changed.env.snapshot = () => ({ utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE, email: AUTH.email })
  await changed.run()
  same("drive: a change of organization drops the old reading and keeps the reading of the new account", [changed.mem.reading.account, changed.mem.reading.utilization], [accountFrom(other).key, 0.1])
  same("drive: a change of organization drops the old readings and probes before the next build order", [only(changed.calls, "probe").length, changed.launched.length, changed.messages.filter((line) => line.includes("account changed")).length], [1, 1, 1])
  const owedStop = scenario({ tickets: [ticket(7), ticket(8)], reading: null, probeReading: null, limit: { utilization: 0.95 } })
  owedStop.mem.account = { ...ACCOUNT, key: "0000000000000000", email: "previous@example.com" }
  await owedStop.run()
  await owedStop.run()
  same("drive: a probe that is owed and returns no reading does not hide a worker reading at 0.95 from the 90% stop", [owedStop.launched.length, only(owedStop.calls, "createTicket").length, owedStop.messages.some((line) => /pace stopped/.test(line))], [1, 1, true])
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

/** The class rule that every fix order and ci-fix order holds, in the words of the owner answers that cleared each cap. */
const CLASS_WORDS = [/Fix the whole class of each finding in this round/, /Search the whole tree for every instance of the class/, /Fix each instance/, /List each path in the commit message/, /Add a test that fails without the fix/]

const classCases = async () => {
  const finding = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: the scope list lacks tools" }] })
  const fix = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await fix.run()
  T("drive: the fix order for one finding tells the worker to fix the whole class, search the tree, list each path and add a failing test", fix.launched.length === 1 && CLASS_WORDS.every((words) => words.test(orderText(fix))))
  const red = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] } })
  await red.run()
  T("drive: the ci-fix order for one failed check holds the same class rule", red.launched.length === 1 && CLASS_WORDS.every((words) => words.test(orderText(red))))
}

/** Heads whose only new commit is a clean merge of the base, from the recorded pull requests: landing#150 and ui#2528. */
const LANDING_150 = { green: "41b79887268f02d4d4a13d57b1cdc1ae28cbc8f4", merge: "8cc8daa7cc4dd7b5ec516c6d8a97355da33905e8", base: "8dbc88950 feat: name the iPhone, Mac and Windows apps in the structured data and llms.txt" }
const UI_2528 = { green: "836e0465a928746a014253d3ae73f5f605d17522", merge: "11b42534c774cd77425cdb12535f31c162141cb6", base: "3f4e5d6c7 chore(tools): a base commit of main" }

const baseMergeCases = async () => {
  const launch = (kind, branch) => comment("launch", JSON.stringify({ kind, part: null, branch }))
  const merged = (recorded, key, { checks, comments, tickets, steps = ["Run tests"], routes = [] }) => {
    const branch = `chore/ticket-7-30`
    const scene = scenario({
      tickets: tickets ?? [ticket(7, { repoKey: key, labels: [`repo:${key}`, "Improvement"] })],
      pulls: { [key]: [pull(30, { headRef: branch, headSha: recorded.merge, commits: [{ sha: recorded.green, parents: 1, checkState: "SUCCESS" }, { sha: recorded.merge, parents: 2, checkState: "FAILURE" }], reviews: [], checks, comments })] },
      gitRoutes: [["--remerge-diff", ""], ["log --no-merges", `${recorded.base}\n`]], failedSteps: steps, routes,
    })
    return scene
  }
  const build = [check("Build", "FAILURE"), approvalCheck()]
  const capped = (branch) => [launch("fix", branch), launch("ci-fix", branch)]

  // landing#150: Build is red after the merge of 8dbc88950, and the branch had used its two fix launches.
  const landing = merged(LANDING_150, "landing", { checks: build, comments: [comment("ticket", "T"), RERAN], tickets: [ticket(7, { repoKey: "landing", labels: ["repo:landing", "Improvement"], comments: capped("chore/ticket-7-30") })], routes: [["--log-failed", "Error: the page lists the iPhone app twice\n"]] })
  await landing.run()
  const launchRecord = JSON.parse(commentsOf(landing.calls, 7).find((text) => text.startsWith("<!-- orbit-drive:launch -->")).split("\n")[1])
  same("drive: landing#150, Build red after the merge of 8dbc88950 with the cap spent, gets a ci-fix order that the cap does not count and no needs:owner", [landing.launched.length, only(landing.calls, "editLabels").length, only(landing.calls, "notify").length, launchRecord.kind, launchRecord.baseMerge], [1, 0, 0, "ci-fix", LANDING_150.merge])
  T("drive: the base-merge ci-fix order names the green commit and the base commits that the merge brought in", orderText(landing).includes(LANDING_150.base) && orderText(landing).includes(LANDING_150.green) && /clean merge of `origin\/main`/.test(orderText(landing)))
  const markedLaunch = (head) => comment("launch", JSON.stringify({ kind: "ci-fix", part: null, branch: "chore/ticket-7-30", baseMerge: head }))
  const headTable = [
    ["a free launch at an older head", [markedLaunch("0000000000000000000000000000000000000000")], [1, 0]],
    ["a free launch at this head", [markedLaunch(LANDING_150.merge)], [0, 2]],
    ["six free launches at this head", Array.from({ length: 6 }, () => markedLaunch(LANDING_150.merge)), [0, 2]],
  ]
  for (const [label, extra, expected] of headTable) {
    const again = merged(LANDING_150, "landing", { checks: build, comments: [comment("ticket", "T"), RERAN], tickets: [ticket(7, { repoKey: "landing", labels: ["repo:landing", "Improvement"], comments: [...capped("chore/ticket-7-30"), ...extra] })] })
    await again.run()
    same(`drive: with the cap spent and ${label}, the base-merge ci-fix gives [launches, label writes]`, [again.launched.length, only(again.calls, "editLabels").length], expected)
  }
  const own = scenario({ tickets: [ticket(7, { comments: capped("chore/ticket-7-30") })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-30", headSha: UI_2528.merge, commits: [{ sha: UI_2528.green, parents: 1, checkState: "FAILURE" }, { sha: UI_2528.merge, parents: 2, checkState: "FAILURE" }], reviews: [], checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] }, gitRoutes: [["--remerge-diff", ""], ["log --no-merges", "3f4e5d6c7 a base commit\n"]] })
  await own.run()
  same("drive: a clean merge on top of a red commit is the fault of the change, so the cap holds", [own.launched.length, only(own.calls, "editLabels").length], [0, 2])
  const fix = scenario({ tickets: [ticket(7, { comments: capped("chore/ticket-7-30") })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-30", headSha: UI_2528.merge, commits: [{ sha: UI_2528.green, parents: 1, checkState: "SUCCESS" }, { sha: UI_2528.merge, parents: 2, checkState: "SUCCESS" }], reviews: [review(CHANGES_REQUESTED, UI_2528.merge, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] }, gitRoutes: [["--remerge-diff", ""]] })
  await fix.run()
  same("drive: a review finding on a clean merge head is still counted against the cap", [fix.launched.length, only(fix.calls, "editLabels").length], [0, 2])

  // ui#2528: Tool Tests is red only on github-auth at the clean merge 11b42534c.
  const toolTests = (extra) => merged(UI_2528, "ui", { checks: [check("Tool Tests", "FAILURE"), approvalCheck()], tickets: [ticket(7, { comments: capped("chore/ticket-7-30") })], routes: [["--log-failed", "not ok github-auth: the token cache expired before the read\n"]], steps: ["Run tool tests"], ...extra })
  const first = toolTests({ comments: [comment("ticket", "T")] })
  await first.run()
  same("drive: ui#2528, Tool Tests red at the clean merge, gets one rerun of the run before any launch, no needs:owner", [only(first.calls, "rerunFailed"), first.launched.length, only(first.calls, "editLabels").length], [[["rerunFailed", "ui", "9001"]], 0, 0])
  const suspect = commentsOf(first.calls, 30).find((text) => text.includes("driver flake-suspect")) ?? ""
  T("drive: the rerun records the suspect check with its failed lines", suspect.includes("driver flake-suspect 9001 Tool Tests") && suspect.includes("github-auth"))
  const record = comment("record", suspect.split("\n").slice(1).join("\n"))
  const flaky = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Tool Tests", "SUCCESS"), approvalCheck()], comments: [comment("ticket", "T"), RERAN, record] })] } })
  await flaky.run()
  const filed = only(flaky.calls, "createTicket")[0]?.[1]
  same("drive: a suspect check that passes on the rerun at the same head files one Bug ticket and records it", [filed?.title, filed?.labels, filed?.body.includes("github-auth"), commentsOf(flaky.calls, 30).filter((text) => text.includes("driver flake-filed 9001 Tool Tests")).length, flaky.launched.length, only(flaky.calls, "editLabels").length], ["Flaky check: Tool Tests", ["repo:ui", "Bug"], true, 1, 0, 0])
  const filedOnce = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Tool Tests", "SUCCESS"), approvalCheck()], comments: [comment("ticket", "T"), RERAN, record, comment("record", "driver flake-filed 9001 Tool Tests")] })] } })
  await filedOnce.run()
  same("drive: a flake that has its filed record gets no second ticket", only(filedOnce.calls, "createTicket").length, 0)
  const flakeTable = [
    ["an open ticket of the same check in the same repository", { ...ticket(8), title: "Flaky check: Tool Tests", repoKey: "ui" }, 0],
    ["an open ticket of the same check in another repository", { ...ticket(8), title: "Flaky check: Tool Tests", repoKey: "api", labels: ["repo:api", "Bug"] }, 1],
  ]
  for (const [label, other, created] of flakeTable) {
    const held = scenario({ tickets: [ticket(7), other], pulls: { ui: [pull(30, { checks: [check("Tool Tests", "SUCCESS"), approvalCheck()], comments: [comment("ticket", "T"), RERAN, record] })] } })
    await held.run()
    same(`drive: ${label} gives [tickets filed, filed records]`, [only(held.calls, "createTicket").length, commentsOf(held.calls, 30).filter((text) => text.includes("driver flake-filed")).length], [created, 1])
  }
  const stillRed = toolTests({ comments: [comment("ticket", "T"), RERAN] })
  await stillRed.run()
  same("drive: Tool Tests still red after the rerun at the clean merge gets a ci-fix order that the cap does not count", [only(stillRed.calls, "rerunFailed").length, stillRed.launched.length, only(stillRed.calls, "editLabels").length], [0, 1, 0])
  T("drive: that ci-fix order names the base commit of the merge", orderText(stillRed).includes(UI_2528.base))
  const infra = merged(UI_2528, "ui", { checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T")], steps: ["Set up job"] })
  await infra.run()
  T("drive: a setup failure gets a rerun and no flake record", only(infra.calls, "rerunFailed").length === 1 && !commentsOf(infra.calls, 30).some((text) => text.includes("flake-suspect")))
}

const blockingClassCases = async () => {
  const redUnit = [check("Unit Tests", "FAILURE"), approvalCheck()]
  const dependabot = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", checks: redUnit, comments: [comment("ticket", "T"), RERAN] })] } })
  await dependabot.run()
  same("drive: a Dependabot pull request with a red check gives needs:owner and does not wedge the lane", [dependabot.launched.map((entry) => entry.worktree), only(dependabot.calls, "editLabels").map((entry) => entry.slice(1, 3))], [["/r/orbit-worktrees/ui/chore-ticket-8"], [["ui", 30]]])
  const conflict = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", mergeState: "DIRTY" })] } })
  await conflict.run()
  same("drive: a Dependabot pull request with a conflict gives needs:owner and does not wedge the lane", [conflict.launched.length, only(conflict.calls, "editLabels").length], [1, 1])
  const closedTicket = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { checks: redUnit, comments: [comment("ticket", "T"), RERAN] })] } })
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
  const cached = scenario({ tickets: [ticket(7), ticket(9)], reading: { utilization: 0.6, resetsAt: RESETS_AT, at: NOW - MINUTE }, limit: { utilization: 0.6 } })
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
  const unlabelled = refusedLabel([comment("ticket", "T"), RERAN])
  await unlabelled.run()
  same("drive: a pull request with no ticket whose label write fails still gets one needs-owner comment and one notification", [commentsOf(unlabelled.calls, 30).filter((text) => text.includes("needs-owner")).length, only(unlabelled.calls, "notify").length], [1, 1])
  const marked = refusedLabel([comment("ticket", "T"), RERAN, comment("needs-owner", "The check failed.")])
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
  const cappedReport = comment("needs-owner", "The build order of chore/ticket-7 launched 2 times without a result", -30 * MINUTE)
  const restored = scenario({ tickets: [ticket(7, { comments: [launchOf("build", "chore/ticket-7"), launchOf("build", "chore/ticket-7"), cappedReport] })] })
  await restored.run()
  same("drive: a launch-capped order whose needs:owner label the owner removed gets the label back with no new comment and no notification", [restored.launched.length, only(restored.calls, "editLabels").length, needsOwnerComments(restored.calls, 7).length, only(restored.calls, "notify").length], [0, 1, 0, 0])

  // A build worker opens its pull request after the first push and keeps working, so no action of the driver may touch a pull request while a worker runs on its branch.
  const BRANCH = "chore/ticket-7-30"
  const acting = (extra, withWorker) => {
    const scene = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { headRef: BRANCH, ...extra })] } })
    if (withWorker) {
      scene.env.processAlive = () => true
      leftBehind(scene, { branch: BRANCH, prNumber: 30 }, "", "chore-ticket-7-30")
      writeFileSync(join(scene.env.stateDir, "chore-ticket-7-30.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/r/orbit-worktrees/ui/chore-ticket-7-30", startedAt: iso(-MINUTE) })}\n`)
    }
    return scene
  }
  const touched = (scene) => ["merge", "updateBranch", "retarget", "comment", "resolveThreads", "editLabels", "rerunFailed"].flatMap((name) => only(scene.calls, name).map(() => name))
  const cases = {
    merge: {},
    request: { reviews: [], comments: [comment("ticket", "T")] },
    behind: { mergeState: "BEHIND", behindBy: 3 },
    retarget: { baseRef: "chore/ticket-7" },
    "fix order": { reviews: [blockingReview] },
  }
  for (const [name, extra] of Object.entries(cases)) {
    const free = acting(extra, false)
    await free.run()
    const busy = acting(extra, true)
    await busy.run()
    same(`drive: a ${name} action of a pull request happens with no worker on its branch and none while a worker runs on it`, [touched(free).length > 0 || free.launched.length > 0, touched(busy), busy.launched.length], [true, [], 0])
  }
}

/** Waits until `done()` is true, for at most 2 seconds. */
const until = async (done) => {
  for (let waited = 0; waited < 2000 && !done(); waited += 5) await new Promise((resolve) => setTimeout(resolve, 5))
  return done()
}

const planSpeedCases = async () => {
  // One run list for each repository, however many pull requests it has, and one failed log for each workflow run.
  const many = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30), pull(31, { headRef: "chore/ticket-7-31" }), pull(32, { headRef: "chore/ticket-7-32" })], api: [pull(40, { headRef: "chore/ticket-7-40" })] } })
  await many.run()
  same("drive: a tick reads the Pullfrog run list once for each repository with a pull request", many.calls.filter((entry) => entry[0] === "runList").map((entry) => entry[1]), ["ui", "api"])
  const draft = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { draft: true })] } })
  await draft.run()
  same("drive: a repository with only draft pull requests reads no run list", only(draft.calls, "runList").length, 0)
  const twoChecks = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Unit Tests", "FAILURE"), check("Lint", "FAILURE", { databaseId: 13 }), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] }, failedSteps: ["Unit tests"], routes: [["--log-failed", "AssertionError: expected 1 to be 2\n"]] })
  await twoChecks.run()
  same("drive: two failed checks of one workflow run read its failed log once", [twoChecks.calls.filter((entry) => entry[0] === "gh" && entry[1].includes("--log-failed")).length, twoChecks.launched.length], [1, 1])

  // The pace line names the seconds that the tick took.
  same("drive: the pace line ends with the seconds of the tick", many.messages.filter((line) => line.includes(" pace ")).map((line) => /; tick (\d+)s\)$/.exec(line)?.[1]), ["12"])

  // The plan is slow: the free slot takes an admitted build order before the plan ends, and a fix order takes the next free slot after it.
  const slow = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.35, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, pulls: { ui: [pull(30, { checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] }, failedSteps: ["Unit tests"], routes: [["--log-failed", "AssertionError: expected 1 to be 2\n"]] })
  slow.env.planWindowMs = 20
  let release = null
  const gate = new Promise((resolve) => { release = resolve })
  const order = []
  const list = slow.env.github.pullfrogRuns
  slow.env.github.pullfrogRuns = async (key) => { await gate; order.push("plan-ends"); return list(key) }
  const launch = slow.env.worker.launch
  slow.env.worker.launch = (options) => { order.push(/Kind: ?build|build order|build/i.test(options.order) && !/ci-fix/.test(options.order) ? "build" : "fix"); return launch(options) }
  const running = slow.run()
  const early = await until(() => slow.launched.length === 1)
  const launchedBeforePlan = order.slice()
  release()
  await running
  same("drive: a free slot starts an admitted build order while the pull request plan still runs", [early, launchedBeforePlan], [true, ["build"]])
  same("drive: the fix order of the pull request takes the next free slot when the plan ends", [order, slow.launched.length, slow.messages.some((line) => line.includes("early-launch"))], [["build", "plan-ends", "fix"], 2, true])
  const earlyTicket = slow.messages.filter((line) => line.includes("ticket#") && line.includes("launch build")).length
  same("drive: the early launch starts one worker for the ticket and the later admission starts no second one", earlyTicket, 1)

  // A plan that ends inside the window keeps the fix order first.
  const quick = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.6, resetsAt: RESETS_AT, at: NOW - MINUTE }, pulls: { ui: [pull(30, { checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] }, failedSteps: ["Unit tests"], routes: [["--log-failed", "AssertionError: expected 1 to be 2\n"]] })
  await quick.run()
  same("drive: a plan that ends in time gives the one free slot to the fix order", [quick.launched.length, /ci-fix/.test(orderText(quick)), quick.messages.some((line) => line.includes("early-launch"))], [1, true, false])

  // No early launch while the driver is paused or in a dry run.
  const dry = scenario({ tickets: [ticket(7)], dryRun: true })
  dry.env.planWindowMs = 0
  dry.env.github.pullfrogRuns = async () => new Promise(() => {})
  dry.env.github.readRepositoryState = async (key) => ({ repositoryKey: key, slug: key, defaultBranch: "main", numbers: [], pulls: [] })
  await dry.run()
  same("drive: a dry run starts no worker early", dry.launched.length, 0)
}

const paceStampCases = async () => {
  let clock = NOW
  const exitAt = (utilization) => ({ ...clean, utilization, resetsAt: RESETS_AT, status: "allowed" })
  const run = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.5, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE } })
  run.env.now = () => clock
  run.env.worker.launch = (options) => { run.launched.push(options); return Promise.resolve(exitAt(0.4)) }
  run.env.snapshot = () => (clock >= NOW + 30 * MINUTE ? { utilization: 0.6, resetsAt: RESETS_AT, at: NOW + 30 * MINUTE, email: AUTH.email } : null)
  await run.run()
  clock = NOW + 40 * MINUTE
  await run.run()
  same("drive: a worker reading is stamped with its launch, so a snapshot taken during the run is newer and sets the pace", run.messages.filter((line) => line.includes(" pace ")).map((line) => /utilization (\S+),/.exec(line)[1]), ["0.500", "0.600"])

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

const launchComment = (kind, branch, offset = -3600 * 1000, part = null) => comment("launch", JSON.stringify({ kind, part, branch }), offset)
const mergedPull = (number, branch, remaining) => ({ number: 40, body: `Tracks ${REPOSITORY}#${number}\n\n${remaining}`, mergedAt: iso(-60 * 1000), headRefName: branch })
const mergedRoute = (number, history) => ["--state merged", (args) => (args.join(" ").includes(`#${number}"`) ? JSON.stringify(history) : "[]")]
const blockingChanges = () => review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }] })
const needsOwnerComments = (calls, number) => commentsOf(calls, number).filter((text) => text.startsWith(marked("needs-owner", "")))

/** Writes the record that an earlier driver process left beside its pid file. */
const leftBehind = (scene, extra = {}, logText = "", stem = "chore-ticket-7") => {
  const logFile = join(scene.env.stateDir, "logs", `${stem}-left.log`)
  writeFileSync(logFile, logText)
  const path = join(scene.env.stateDir, `${stem}.launch.json`)
  writeFileSync(path, `${JSON.stringify({ kind: "build", repoKey: "ui", ticketNumber: 7, partNumber: null, branch: "chore/ticket-7", prNumber: null, worktree: "/r/orbit-worktrees/ui/chore-ticket-7", headBefore: HEAD, logFile, account: ACCOUNT.key, startedAt: NOW - 30 * MINUTE, ...extra })}\n`)
  return path
}

const gatedReportCases = async () => {
  const gated = { labels: ["repo:ui", "Improvement", OWNER_LABEL] }
  const decisionTickets = [ticket(7, gated)]
  const decision = scenario({ tickets: decisionTickets, pulls: { ui: [pull(30, { reviews: [blockingChanges()] })] } })
  keepWrites(decision, decisionTickets)
  decision.env.worker.launch = (options) => { decision.launched.push(options); return Promise.resolve({ ...clean, result: { ...clean.result, needsDecision: "Raise the price?" } }) }
  await decision.run()
  await decision.run()
  same("drive: a NEEDS_DECISION from a fix worker on a ticket that already carries needs:owner still reports the question once", [needsOwnerComments(decision.calls, 7).length, only(decision.calls, "notify").length], [1, 1])

  const capped = scenario({ tickets: [ticket(7, { ...gated, comments: [launchComment("fix", "chore/ticket-7-30"), launchComment("fix", "chore/ticket-7-30")] })], pulls: { ui: [pull(30, { reviews: [blockingChanges()] })] } })
  await capped.run()
  same("drive: a fix cap on a ticket that already carries needs:owner labels the pull request, posts the open classes and notifies", [only(capped.calls, "editLabels").map((entry) => entry.slice(1, 3)), needsOwnerComments(capped.calls, 7).map((text) => /used its 2 fix launches. Launches: 2. Open: tools\/a.mjs:3/.test(text)), only(capped.calls, "notify").length], [[["ui", 30]], [true], 1])

  const repeatTickets = [ticket(7, { ...gated, comments: [launchComment("fix", "chore/ticket-7-30"), launchComment("fix", "chore/ticket-7-30")] })]
  const repeated = scenario({ tickets: repeatTickets, pulls: { ui: [pull(30, { reviews: [blockingChanges()] })] } })
  keepWrites(repeated, repeatTickets)
  await repeated.run()
  await repeated.run()
  same("drive: the same gated report on a later tick posts no second comment and no second notification", [needsOwnerComments(repeated.calls, 7).length, only(repeated.calls, "notify").length], [1, 1])

  const removedTickets = [ticket(7, { ...gated, comments: [comment("needs-owner", "The owner already answered this.")] })]
  const removed = scenario({ tickets: removedTickets, pulls: { ui: [pull(30, { reviews: [blockingChanges()] })] } })
  removed.env.worker.launch = (options) => { removed.launched.push(options); return Promise.resolve({ ...clean, result: { ...clean.result, needsDecision: "A new question?" } }) }
  keepWrites(removed, removedTickets)
  await removed.run()
  await removed.run()
  same("drive: a different reason on the same ticket is a new report", needsOwnerComments(removed.calls, 7).length, 1)
}

const branchKeyCases = async () => {
  const twice = [launchComment("build", "chore/ticket-7"), launchComment("build", "chore/ticket-7")]
  const untracked = scenario({ tickets: [ticket(7, { comments: twice })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7", tracks: null, body: "Tracks #7" })] } })
  await untracked.run()
  same("drive: an open pull request on the order's branch with no Tracks line keeps the order on that branch and gives needs:owner", [untracked.launched.length, only(untracked.calls, "editLabels").map((entry) => entry.slice(1, 3)), needsOwnerComments(untracked.calls, 7).map((text) => /ui#30/.test(text) && /Tracks/.test(text))], [0, [["tickets", 7]], [true]])

  const parts = [partComment(1, 2, "Paths: apps/web/a.ts"), partComment(2, 2, "Paths: apps/mobile/b.ts")]
  const rotated = scenario({ tickets: [ticket(7, { comments: [...parts, launchComment("build part", "chore/ticket-7-part-1", -7200 * 1000, 1)] })], routes: [mergedRoute(7, [mergedPull(7, "chore/ticket-7-part-1-r2", "Remaining: Part 2 of 2")])] })
  await rotated.run()
  same("drive: a part that merged on a rotated branch is done, so the next tick builds the next part", rotated.launched.map((entry) => entry.worktree), ["/r/orbit-worktrees/ui/chore-ticket-7-part-2"])

  const headed = (number, total, offset) => comment(null, `# #7 Part ${number} of ${total}: part ${number}\nPaths: apps/web/p${number}.ts`, offset)
  const twoSets = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2, "Paths: apps/web/old.ts"), headed(1, 13, -3600 * 1000), headed(2, 13, -3500 * 1000)] })] })
  await twoSets.run()
  same("drive: a ticket with # #N Part headings and an older part set builds a part of the newest set", twoSets.launched.map((entry) => [entry.worktree, entry.order.includes("(Part 1 of 13)")]), [["/r/orbit-worktrees/ui/chore-ticket-7-part-1", true]])

  const inFlight = scenario({ tickets: [ticket(7, { comments: parts })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1-r2" })] } })
  await inFlight.run()
  same("drive: an open part pull request on a rotated branch is that part's own, so a next part with disjoint Paths starts", inFlight.launched.map((entry) => entry.worktree), ["/r/orbit-worktrees/ui/chore-ticket-7-part-2"])

  const named = scenario({ tickets: [ticket(7, { comments: parts })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-2-r2", reviews: [], comments: [] })] } })
  await named.run()
  same("drive: the ticket comment of a pull request on a rotated part branch carries its own part", commentsOf(named.calls, 30)[0]?.includes("Part 2 of 2: part 2") === true, true)
}

const restartCases = async () => {
  const reaped = async (label, extra, logText, tickets, check) => {
    const scene = scenario({ tickets, gitRoutes: [["ls-remote", `${HEAD}\trefs/heads/chore/ticket-7\n`]] })
    keepWrites(scene, tickets)
    const path = leftBehind(scene, extra, logText)
    await scene.run()
    same(`drive: a worker that ended while the driver was stopped: ${label}`, [existsSync(path), ...check(scene)], [false, ...check.expected])
    return scene
  }
  const findTickets = () => [ticket(7, { comments: [partComment(1, 1, "Kind: find")] })]
  const findCheck = (scene) => [commentsOf(scene.calls, 7).filter((text) => text.startsWith(marked("findings", "Findings, part 1"))).length, scene.launched.length]
  findCheck.expected = [1, 0]
  await reaped("its findings are posted once and the part does not run again", { kind: "find", partNumber: 1, branch: "chore/ticket-7-part-1" }, `${resultLine("Area: tools\n\nsrc/a.mjs:3 | class | fix")}`, findTickets(), findCheck)

  const decisionCheck = (scene) => [needsOwnerComments(scene.calls, 7).filter((text) => text.includes("NEEDS_DECISION: Raise the price?")).length, only(scene.calls, "notify").length, scene.launched.length]
  decisionCheck.expected = [1, 1, 0]
  await reaped("its NEEDS_DECISION question reaches the owner and the ticket does not run again", {}, resultLine("Done.\nNEEDS_DECISION: Raise the price?"), [ticket(7)], decisionCheck)

  const limitLog = `${JSON.stringify({ type: "result", is_error: true, result: "You've hit your limit. Resets 4am (America/Sao_Paulo)" })}\n`
  const limitCheck = (scene) => [only(scene.calls, "createTicket").length, scene.launched.length]
  limitCheck.expected = [1, 0]
  await reaped("its usage limit opens the pause issue", {}, limitLog, [ticket(7)], limitCheck)

  const sessionLog = `${JSON.stringify({ type: "system", session_id: "s9" })}\n${resultLine("Done.")}`
  const recordScene = scenario({ tickets: [ticket(7)], gitRoutes: [["rev-parse", `${NEXT_HEAD}\n`], ["log --format=%H", `${NEXT_HEAD}\n`], ["ls-remote", `${NEXT_HEAD}\trefs/heads/chore/ticket-7\n`]] })
  leftBehind(recordScene, { prNumber: 31 }, sessionLog)
  await recordScene.run()
  same("drive: a worker that ended while the driver was stopped gets its commit records from its log", commentsOf(recordScene.calls, 31).map((text) => text.split("\n")[1]), [`worker s9 -> ${NEXT_HEAD}`])

  const alive = scenario({ tickets: [ticket(7)] })
  const path = leftBehind(alive, {}, resultLine("Done.\nNEEDS_DECISION: Raise the price?"))
  writeFileSync(join(alive.env.stateDir, "chore-ticket-7.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/w", startedAt: iso(0) })}\n`)
  await alive.run()
  same("drive: a launch record whose worker still runs is not reaped", [existsSync(path), needsOwnerComments(alive.calls, 7).length], [true, 0])

  const dry = scenario({ tickets: [ticket(7)], dryRun: true })
  const dryPath = leftBehind(dry, {}, resultLine("Done.\nNEEDS_DECISION: Raise the price?"))
  await dry.run()
  same("drive: a dry run reaps no launch record", [existsSync(dryPath), only(dry.calls, "comment").length], [true, 0])

  const started = scenario({ tickets: [ticket(7)] })
  await started.run()
  const records = readdirSync(started.env.stateDir).filter((name) => name.endsWith(".launch.json"))
  same("drive: a launch writes its record beside the pid file, with what a reap needs", records.length === 1 ? Object.keys(JSON.parse(readFileSync(join(started.env.stateDir, records[0]), "utf8"))).sort() : records, ["account", "branch", "headBefore", "kind", "logFile", "partNumber", "prNumber", "repoKey", "startedAt", "ticketNumber", "worktree"])

  const failedRun = (offset) => ({ databaseId: 81, displayTitle: "Respond to mention on #7 [abc]", status: "completed", conclusion: "failure", createdAt: iso(offset), updatedAt: iso(offset + 3 * MINUTE) })
  const oldRun = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T"), comment("request", PLAIN, -20 * MINUTE)] })] }, runs: [failedRun(-40 * MINUTE)], routes: [["--log-failed", "You've hit your limit. Resets 4am (America/Sao_Paulo)"]] })
  await oldRun.run()
  same("drive: a failed Pullfrog run from before the newest request is not read again after a restart, so it pauses nothing", [only(oldRun.calls, "createTicket").length, oldRun.calls.filter((entry) => entry[0] === "gh" && entry[1].includes("--log-failed")).length], [0, 0])
}

const echoedLimitCases = async () => {
  const failedRun = { databaseId: 82, displayTitle: "Respond to mention on #7 [abc]", status: "completed", conclusion: "failure", createdAt: iso(-10 * MINUTE), updatedAt: iso(-5 * MINUTE) }
  const echoed = ["You've hit your limit. Resets 4am (America/Sao_Paulo)", ...Array.from({ length: 80 }, (_, index) => `step line ${index}`)].join("\n")
  const scene = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun], routes: [["--log-failed", echoed]] })
  await scene.run()
  same("drive: a limit message that a failed Pullfrog log only echoes far before its end is not a stop at a limit", only(scene.calls, "createTicket").length, 0)
  const ending = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun], routes: [["--log-failed", `${Array.from({ length: 80 }, (_, index) => `step line ${index}`).join("\n")}\nYou've hit your limit. Resets 4am (America/Sao_Paulo)`]] })
  await ending.run()
  same("drive: a limit message at the end of a failed Pullfrog log pauses the driver", only(ending.calls, "createTicket").length, 1)
}

const reasonKeyCases = async () => {
  const missed = (offsets = [-80, -50]) => [comment("ticket", "T"), ...offsets.map((minutes) => comment("request", PLAIN, minutes * MINUTE))]
  const missedPull = (number, extra = {}) => pull(number, { headRef: `chore/ticket-7-part-${number}`, reviews: [], comments: missed(), ...extra })
  const reports = (scene) => needsOwnerComments(scene.calls, 7).map((text) => text.split("\n")[1])

  const two = scenario({ tickets: [ticket(7)], pulls: { ui: [missedPull(30), missedPull(31)] } })
  await two.run()
  same("drive: two pull requests of one ticket that both miss a review in one tick are two reports, each labelled and notified", [only(two.calls, "editLabels").map((entry) => entry.slice(1, 3).join(":")), reports(two), only(two.calls, "notify").length], [["tickets:7", "ui:30", "ui:31"], [`ui#30 at ${HEAD}: Pullfrog gave no review after two requests`, `ui#31 at ${HEAD}: Pullfrog gave no review after two requests`], 2])

  const later = scenario({ tickets: [ticket(7, { comments: [comment("needs-owner", "Pullfrog gave no review after two requests")] })], pulls: { ui: [missedPull(31)] } })
  await later.run()
  same("drive: a later pull request of the ticket is reported after an earlier report with the same plain reason", [reports(later), only(later.calls, "editLabels").map((entry) => entry.slice(1, 3).join(":")), only(later.calls, "notify").length], [[`ui#31 at ${HEAD}: Pullfrog gave no review after two requests`], ["tickets:7", "ui:31"], 1])

  const reportedAtOldHead = comment("needs-owner", `ui#30 at ${HEAD}: Pullfrog gave no review after two requests`)
  const newHead = scenario({ tickets: [ticket(7, { comments: [reportedAtOldHead] })], pulls: { ui: [missedPull(30, { headSha: NEXT_HEAD })] } })
  await newHead.run()
  same("drive: a later head of the same pull request is a new report", [reports(newHead), only(newHead.calls, "notify").length], [[`ui#30 at ${NEXT_HEAD}: Pullfrog gave no review after two requests`], 1])

  const restarted = scenario({ tickets: [ticket(7, { comments: [reportedAtOldHead] })], pulls: { ui: [missedPull(30)] } })
  await restarted.run()
  same("drive: the same report at the same head after a restart posts no comment and sends no notification", [needsOwnerComments(restarted.calls, 7).length, only(restarted.calls, "notify").length, only(restarted.calls, "editLabels").length], [0, 0, 0])

  const decisionLog = resultLine("Done.\nNEEDS_DECISION: Raise the price?")
  const asked = [ticket(7, { comments: [comment("needs-owner", "chore/ticket-7-part-1: NEEDS_DECISION: Raise the price?")] })]
  const secondPart = scenario({ tickets: asked })
  leftBehind(secondPart, { branch: "chore/ticket-7-part-2", partNumber: 2 }, decisionLog, "chore-ticket-7-part-2")
  await secondPart.run()
  same("drive: the same question from another part of the ticket is a new report", needsOwnerComments(secondPart.calls, 7).map((text) => text.split("\n")[1]), ["chore/ticket-7-part-2: NEEDS_DECISION: Raise the price?"])
  const sameBranch = scenario({ tickets: asked })
  leftBehind(sameBranch, { branch: "chore/ticket-7-part-1", partNumber: 1 }, decisionLog, "chore-ticket-7-part-1")
  await sameBranch.run()
  same("drive: the same question from the same branch after a restart is not reported twice", needsOwnerComments(sameBranch.calls, 7).length, 0)
}

const orderOfApiCases = async () => {
  const merged = (number, remaining, ago, branch) => ({ number, body: `Tracks ${REPOSITORY}#7\n\n${remaining}`, mergedAt: iso(-ago * 24 * 3600 * 1000), headRefName: branch })
  const newer = merged(45, "Remaining: the export", 1, "chore/ticket-7-r2")
  const older = merged(40, "Remaining: the import and the export", 2, "chore/ticket-7")
  for (const [label, listing] of [["newest first", [newer, older]], ["oldest first", [older, newer]]]) {
    const scene = scenario({ tickets: [ticket(7)], routes: [mergedRoute(7, listing)] })
    await scene.run()
    const remaining = /Remaining after the merged pull requests: (Remaining: [^\n]*)/.exec(orderText(scene))?.[1]
    same(`drive: a re-admitted ticket takes the Remaining line of the newest merge when the search lists them ${label}`, [scene.launched.length, remaining, scene.launched[0]?.worktree.endsWith("chore-ticket-7-r3")], [1, "Remaining: the export", true])
  }

  const requests = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T"), comment("request", PLAIN, -5 * MINUTE), comment("request", PLAIN, -80 * MINUTE)] })] } })
  await requests.run()
  same("drive: the newest review request decides a miss when the API lists the comments out of order", [needsOwnerComments(requests.calls, 7).length, only(requests.calls, "comment").length, only(requests.calls, "editLabels").length], [0, 0, 0])

  const edited = [comment(null, "Part 1 of 1: the edited part", -3600 * 1000), comment(null, "Part 1 of 1: the first version\nKind: find", -7200 * 1000)]
  const part = scenario({ tickets: [ticket(7, { comments: edited })] })
  await part.run()
  same("drive: the newest comment of a part decides its kind when the API lists the comments out of order", only(part.calls, "comment").map((entry) => JSON.parse(entry[3].split("\n")[1]).kind), ["build part"])
}

const orphanClockCases = async () => {
  const live = (scene, ageMinutes, stem = "chore-ticket-7") => writeFileSync(join(scene.env.stateDir, `${stem}.pid`), `${JSON.stringify({ pid: process.pid, worktree: "/w", startedAt: iso(-ageMinutes * MINUTE) })}\n`)
  const signals = (scene) => only(scene.calls, "kill").map((entry) => entry[2])
  const orphan = (ageMinutes, extra = {}) => {
    const scene = scenario({ tickets: [ticket(7)], ...extra })
    const record = leftBehind(scene)
    live(scene, ageMinutes)
    return { scene, record }
  }

  const old = orphan(46)
  await old.scene.run()
  same("drive: a worker that outlived a restart past the hard ceiling gets SIGTERM and holds the lane", [signals(old.scene), old.scene.launched.length, existsSync(old.record)], [["SIGTERM"], 0, true])
  await old.scene.run()
  same("drive: a worker that survives SIGTERM gets SIGKILL on the next tick", signals(old.scene), ["SIGTERM", "SIGKILL"])
  old.scene.env.processAlive = () => false
  await old.scene.run()
  same("drive: the reap of a killed worker names the clock and frees the lane", [old.scene.messages.some((line) => line.includes(`worker-exit (build, exit null, killed: ${KILL_REASONS["hard-ceiling"]})`)), old.scene.launched.length], [true, 1])

  const young = orphan(20)
  await young.scene.run()
  await young.scene.run()
  same("drive: a worker that outlived a restart inside every clock is left alone", [signals(young.scene), existsSync(young.record)], [[], true])

  const stalled = orphan(20)
  let clock = NOW
  stalled.scene.env.now = () => clock
  await stalled.scene.run()
  clock = NOW + 11 * MINUTE
  await stalled.scene.run()
  same("drive: a worker that outlived a restart and made no progress for ten minutes gets SIGTERM", signals(stalled.scene), ["SIGTERM"])

  const moving = orphan(20)
  let movingClock = NOW
  moving.scene.env.now = () => movingClock
  await moving.scene.run()
  movingClock = NOW + 11 * MINUTE
  moving.scene.watched.fingerprint = "b"
  await moving.scene.run()
  same("drive: a worker that outlived a restart and changed its worktree is progressing", signals(moving.scene), [])

  const growing = orphan(20)
  let growingClock = NOW
  growing.scene.env.now = () => growingClock
  await growing.scene.run()
  growingClock = NOW + 11 * MINUTE
  growing.scene.watched.logBytes = 1024
  await growing.scene.run()
  same("drive: a worker that outlived a restart and grew its log is progressing", signals(growing.scene), [])

  const heavy = orphan(5)
  heavy.scene.watched.logBytes = WORKER_LIMITS.logCapBytes + 1
  await heavy.scene.run()
  same("drive: a worker that outlived a restart past the log cap gets SIGTERM", signals(heavy.scene), ["SIGTERM"])

  const two = scenario({ tickets: [ticket(7), ticket(8)] })
  leftBehind(two, {}, "", "chore-ticket-7")
  leftBehind(two, { ticketNumber: 8, branch: "chore/ticket-8", worktree: "/r/orbit-worktrees/ui/chore-ticket-8" }, "", "chore-ticket-8")
  live(two, 50, "chore-ticket-7")
  live(two, 5, "chore-ticket-8")
  await two.run()
  same("drive: with two workers left behind only the one past a clock is killed", [signals(two), two.messages.filter((line) => line.includes(" kill ")).map((line) => /ticket#(\d+)/.exec(line)[1])], [["SIGTERM"], ["7"]])

  const stale = scenario({ tickets: [] })
  const staleRecord = leftBehind(stale)
  live(stale, 90)
  stale.env.processAlive = () => false
  await stale.run()
  same("drive: a pid file whose pid is not a worker process is stale, so it is never killed and its record is reaped", [signals(stale), existsSync(staleRecord)], [[], false])

  const started = scenario({ tickets: [ticket(7)] })
  leftBehind(started)
  live(started, 90)
  started.mem.running.set("chore-ticket-7", new Promise(() => {}))
  await tick(started.env, started.mem)
  same("drive: a worker that this process started keeps its own timers and is never killed by the tick", signals(started), [])

  const dry = scenario({ tickets: [ticket(7)], dryRun: true })
  leftBehind(dry)
  live(dry, 90)
  await dry.run()
  same("drive: a dry run kills no worker", signals(dry), [])

  const clockOf = (limits, startedAt = 0) => { const state = { now: startedAt, print: "a", bytes: 0 }; return { state, watch: progressWatch({ worktree: "/w", logFile: "/l", startedAt, clock: { now: () => state.now }, limits, fingerprint: async () => state.print, logSize: () => state.bytes }) } }
  const watched = clockOf(WORKER_LIMITS)
  const readings = []
  for (const [moment, print, bytes] of [[0, "a", 0], [9 * MINUTE, "a", 0], [10 * MINUTE, "a", 0], [11 * MINUTE, "b", 0], [20 * MINUTE, "b", 0], [21 * MINUTE, "b", 0], [22 * MINUTE, "b", WORKER_LIMITS.logCapBytes + 1]]) {
    watched.state.now = moment
    watched.state.print = print
    watched.state.bytes = bytes
    readings.push(await watched.watch())
  }
  same("lib/worker.mjs: the progress watch fires no-progress after ten quiet minutes, restarts on change and fires log-cap past the cap", readings, [null, null, "no-progress", null, null, "no-progress", "log-cap"])
  const ps = (stdout, status = 0) => () => ({ status, stdout })
  same("lib/worker.mjs: a pid counts as a worker only when it is alive and its command line holds claude", [isWorkerProcess(process.pid, { run: ps("claude -p --model claude-sonnet-5-5\n") }), isWorkerProcess(process.pid, { run: ps("/usr/bin/vim notes.txt\n") }), isWorkerProcess(process.pid, { run: ps("", 1) }), isWorkerProcess(2 ** 31 - 2, { run: ps("claude -p\n") })], [true, false, false, false])
}

const paceRestartCases = async () => {
  const probeOnce = scenario({ tickets: [ticket(7)], reading: null })
  await probeOnce.run()
  const restarted = scenario({ tickets: [ticket(7)], reading: null, stateDirectory: probeOnce.env.stateDir })
  await restarted.run()
  same("drive: a restart inside the hour keeps the saved reading, so it probes no second time and starts the worker", [only(probeOnce.calls, "probe").length, only(restarted.calls, "probe").length, restarted.launched.length], [1, 0, 1])

  const stoppedFirst = scenario({ tickets: [ticket(7)], reading: null, probeReading: { utilization: 0.93, resetsAt: RESETS_AT, status: "allowed" } })
  await stoppedFirst.run()
  const stoppedRestarted = scenario({ tickets: [ticket(7)], reading: null, stateDirectory: stoppedFirst.env.stateDir })
  await stoppedRestarted.run()
  same("drive: a restart keeps the saved reading at 0.93, so the stop holds with no probe and no worker", [stoppedFirst.launched.length, only(stoppedRestarted.calls, "probe").length, stoppedRestarted.launched.length, stoppedRestarted.mem.reading.utilization], [0, 0, 0, 0.93])

  const OTHER_AUTH = { ...AUTH, orgId: "00000000-0000-4000-8000-000000000002" }
  const OTHER_KEY = accountFrom(OTHER_AUTH).key
  const foreignEvent = `${JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { seven_day: { utilization: 0.05, resetsAt: RESETS_AT } } } })}\n`
  const savedPace = (scene) => JSON.parse(readFileSync(join(scene.env.stateDir, "pace.json"), "utf8"))

  const switchedMidRun = scenario({ tickets: [ticket(7)], reading: null, auth: OTHER_AUTH })
  switchedMidRun.mem.account = { key: OTHER_KEY, email: AUTH.email, orgId: OTHER_AUTH.orgId }
  leftBehind(switchedMidRun, {}, foreignEvent)
  await switchedMidRun.run()
  same("drive: a worker of the old account that exits after a login switch adds no mem reading and no saved reading to the new account", [switchedMidRun.mem.reading?.utilization === 0.05, savedPace(switchedMidRun).reading?.utilization === 0.05, savedPace(switchedMidRun).account], [false, false, OTHER_KEY])

  const costFirst = scenario({ tickets: [ticket(7)], reading: null, probeReading: { utilization: 0.4, resetsAt: RESETS_AT, status: "allowed" } })
  await costFirst.run()
  const restartAfterSwitch = scenario({ tickets: [ticket(7)], reading: null, auth: OTHER_AUTH, stateDirectory: costFirst.env.stateDir })
  leftBehind(restartAfterSwitch, {}, foreignEvent)
  await restartAfterSwitch.run()
  same("drive: a restart after a login switch reads the account first, so a leftover worker of the old account and the saved reading of the old account add no reading to the new account", [restartAfterSwitch.mem.reading.utilization, savedPace(restartAfterSwitch).reading.utilization, savedPace(restartAfterSwitch).account, only(restartAfterSwitch.calls, "probe").length], [0.1, 0.1, OTHER_KEY, 1])

  const unreadable = scenario({ tickets: [ticket(7)], reading: null })
  unreadable.env.authStatus = async () => { throw new Error("no claude") }
  const unreadablePath = leftBehind(unreadable, {}, foreignEvent)
  await unreadable.run()
  same("drive: a start that cannot read the account reaps nothing, so no reading is recorded before the account is known", [existsSync(unreadablePath), unreadable.mem.reading, existsSync(join(unreadable.env.stateDir, "pace.json"))], [true, null, false])

  const pausedTicket = ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null })
  const rejected = { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" }
  const pausedFirst = scenario({ tickets: [pausedTicket, ticket(7)], probeReading: rejected })
  await pausedFirst.run()
  const pausedAgain = scenario({ tickets: [pausedTicket, ticket(7)], probeReading: rejected, stateDirectory: pausedFirst.env.stateDir })
  await pausedAgain.run()
  same("drive: a paused driver that restarts inside the hour does not probe again", [only(pausedFirst.calls, "probe").length, only(pausedAgain.calls, "probe").length], [1, 0])

  const otherAccount = scenario({ tickets: [ticket(7)], reading: null, auth: { ...AUTH, orgId: "00000000-0000-4000-8000-000000000002" } })
  await otherAccount.run()
  const switched = scenario({ tickets: [ticket(7)], reading: null, stateDirectory: otherAccount.env.stateDir })
  await switched.run()
  same("drive: a saved reading and probe time of another account do not count after a restart on a new login", [only(otherAccount.calls, "probe").length, only(switched.calls, "probe").length], [1, 1])

  const stale = scenario({ tickets: [ticket(7)], reading: null, stateDirectory: probeOnce.env.stateDir })
  stale.env.now = () => NOW + 2 * 3600 * 1000
  await stale.run()
  same("drive: a saved reading older than an hour is not probed again, and its worker gives the next reading", [only(stale.calls, "probe").length, stale.launched.length], [0, 1])
}

const sleepCases = async () => {
  const ISSUE_URL = (number) => `https://github.com/${REPOSITORY}/issues/${number}`
  const heldItems = (scene) => (existsSync(join(scene.env.stateDir, "sleep-items.json")) ? JSON.parse(readFileSync(join(scene.env.stateDir, "sleep-items.json"), "utf8")) : [])
  const slept = (comments) => comments.length
  const tickets = [ticket(7), ticket(8, { comments: [launchComment("build", "chore/ticket-8", -7200 * 1000), launchComment("build", "chore/ticket-8", -3600 * 1000)] }), ticket(9)]
  const scene = scenario({ tickets, sleeping: true, gitRoutes: [["ls-remote", `${HEAD}\trefs/heads/chore/ticket-7\n`]] })
  keepWrites(scene, tickets)
  leftBehind(scene, {}, resultLine("Done.\nNEEDS_DECISION: Raise the price?"))
  await scene.run()
  same("drive: sleep on: a NEEDS_DECISION and a launch cap get a label and one comment each, and no notification", [only(scene.calls, "notify").length, only(scene.calls, "editLabels").map((entry) => entry.slice(1, 3).join(":")).sort(), slept(needsOwnerComments(scene.calls, 7)), slept(needsOwnerComments(scene.calls, 8))], [0, ["tickets:7", "tickets:8"], 1, 1])
  same("drive: sleep on: the driver keeps working on every other item", scene.launched.map((entry) => entry.worktree.split("/").at(-1)), ["chore-ticket-9"])
  same("drive: sleep on: each held item keeps its link for the wake notification", heldItems(scene).map((item) => item.link).sort(), [ISSUE_URL(7), ISSUE_URL(8)])
  const repeated = [ticket(8, { comments: [launchComment("build", "chore/ticket-8", -7200 * 1000), launchComment("build", "chore/ticket-8", -3600 * 1000)] })]
  const again = scenario({ tickets: repeated, sleeping: true })
  keepWrites(again, repeated)
  await again.run()
  await again.run()
  same("drive: sleep on: a later tick holds no second item, posts no second comment and sends no notification", [heldItems(again).length, slept(needsOwnerComments(again.calls, 8)), only(again.calls, "notify").length], [1, 1, 0])

  const lines = []
  same("drive: --sleep off prints the state it reads back and the count of held items", [setSleep(scene.env, "off", { out: (line) => lines.push(line) }), readSleep(scene.env.stateDir).on, lines], [0, false, ["Sleep is off. The driver sends one notification for 2 held items on its next tick."]])
  await scene.run()
  const woken = only(scene.calls, "notify")
  same("drive: sleep off: one notification lists every item held during the sleep, each with its link", [woken.length, woken[0]?.[1].startsWith("Orbit driver: sleep ended. 2 items need you: "), woken[0]?.[1].includes(ISSUE_URL(7)), woken[0]?.[1].includes(ISSUE_URL(8)), woken[0]?.[1].includes("NEEDS_DECISION: Raise the price?")], [1, true, true, true, true])
  await scene.run()
  same("drive: sleep off: the list is empty after the notification, so the next tick sends no second wake notification", [only(scene.calls, "notify").filter((entry) => entry[1].includes("sleep ended")).length, heldItems(scene)], [1, []])

  const stopped = scenario({ tickets: [ticket(7)], sleeping: true, reading: { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await stopped.run()
  same("drive: sleep on: the 90% stop opens its needs:owner issue, holds its link and sends no notification", [only(stopped.calls, "createTicket").map((entry) => entry[1].labels), only(stopped.calls, "notify").length, heldItems(stopped).map((item) => item.link), stopped.launched.length], [[[OWNER_LABEL]], 0, [ISSUE_URL(99)], 0])

  const signedOut = scenario({ tickets: [ticket(7)], sleeping: true, auth: { ...AUTH, loggedIn: false } })
  await signedOut.run()
  same("drive: sleep on: a signed-out login opens its issue and sends no notification", [only(signedOut.calls, "createTicket").length, only(signedOut.calls, "notify").length, heldItems(signedOut).length], [1, 0, 1])

  const ownerWork = scenario({ tickets: [ticket(40, { labels: ["repo:ui", "owner-work"] })], sleeping: true })
  await ownerWork.run()
  same("drive: sleep on: an owner-work notice is posted and its notification is held", [commentsOf(ownerWork.calls, 40).length, only(ownerWork.calls, "notify").length, heldItems(ownerWork).map((item) => item.link)], [1, 0, [ISSUE_URL(40)]])

  const awake = scenario({ tickets: [ticket(7)] })
  await awake.run()
  same("drive: sleep off with nothing held sends no notification and keeps no list", [only(awake.calls, "notify").length, heldItems(awake)], [0, []])

  const dry = scenario({ tickets: [ticket(7, { labels: ["repo:ui", "Improvement", OWNER_LABEL] })], sleeping: true, dryRun: true })
  await dry.run()
  same("drive: the dry run with sleep on writes no list and prints the sleep state", [heldItems(dry), dry.messages.filter((line) => line.includes(" sleep on ")).length], [[], 1])

  const cli = scenario({})
  const outputs = []
  const out = (line) => outputs.push(line)
  const on = setSleep(cli.env, "on", { out })
  const since = readSleep(cli.env.stateDir).since
  cli.env.now = () => NOW + 5 * MINUTE
  setSleep(cli.env, "on", { out })
  same("drive: --sleep on writes sleep.json, prints the state, and a second on keeps the first start", [on, readSleep(cli.env.stateDir), since, outputs.length, /^Sleep is on since /.test(outputs[0])], [0, { on: true, since }, iso(0), 2, true])
  same("drive: --sleep takes on or off and nothing else", [parseArguments(["--sleep", "on"]), parseArguments(["--sleep", "off"]).word, parseArguments(["--sleep"]).error !== undefined, parseArguments(["--sleep", "maybe"]).error !== undefined, parseArguments(["--sleep", "on", "--once"]).error !== undefined], [{ help: false, mode: "sleep", word: "on" }, "off", true, true, true])
  same("drive: the usage states the sleep flag", /--sleep on\|off/.test(await usageText()), true)
}

const QUESTIONS_ORDER = "/questions --auto"
const questionRuns = (scene) => scene.launched.filter((entry) => entry.order === QUESTIONS_ORDER)
const questionLines = (scene) => scene.messages.filter((line) => / questions (launch|exit|wait|refused)/.test(line)).map((line) => line.slice(line.indexOf(" questions ") + 1))
const startedFile = (scene) => { try { return JSON.parse(readFileSync(join(scene.env.stateDir, "questions.json"), "utf8")).startedAt } catch { return null } }
const heldTicket = (number, reportOffset = -10 * MINUTE, extra = {}) => ticket(number, { labels: ["repo:ui", "Improvement", OWNER_LABEL], comments: reportOffset === null ? [] : [comment("needs-owner", "Raise the price?", reportOffset)], ...extra })

const questionsCases = async () => {
  const held = async (label, expected, options) => {
    const scene = scenario({ driver: {}, ...options })
    await scene.run()
    await scene.mem.questions
    same(`drive: questions: ${label}`, questionRuns(scene).length, expected)
    return scene
  }

  const first = scenario({ driver: {}, tickets: [heldTicket(8)], sleeping: true })
  let finish
  first.env.worker.launch = (options) => { first.launched.push(options); return new Promise((resolve) => { finish = () => resolve({ exitCode: 0 }) }) }
  await first.run()
  const [run] = questionRuns(first)
  same("drive: questions: one held item with sleep on starts exactly one run", questionRuns(first).length, 1)
  same("drive: questions: the run is headless in the driver worktree and its order is the slash command", [run.worktree, run.order, run.pidFile, run.logFile.startsWith(join(first.env.stateDir, "logs", "questions-"))], ["/r/driver", QUESTIONS_ORDER, join(first.env.stateDir, "questions.pid"), true])
  same("drive: questions: the run uses the coordinator model on the owner login, not the worker token", [run.invocation.command.args, run.invocation.environment.GH_TOKEN], [["--model", "claude-opus-5-5"], "owner-token"])
  same("drive: questions: the start time is kept beside the other state files and the launch is logged", [startedFile(first), questionLines(first)], [iso(0), ["questions launch"]])
  await first.run()
  same("drive: questions: the next tick starts none while the run is live", [questionRuns(first).length, questionLines(first)], [1, ["questions launch"]])
  finish()
  await first.mem.questions
  same("drive: questions: the exit and its code are logged", questionLines(first), ["questions launch", "questions exit (0)"])
  await first.run()
  same("drive: questions: a held item with no newer report starts no run after the exit", questionRuns(first).length, 1)

  const worker = scenario({ driver: {}, tickets: [ticket(7), heldTicket(8)] })
  await worker.run()
  await worker.mem.questions
  same("drive: questions: the run takes no worker slot, so the admissible ticket still starts", [worker.launched.map((entry) => entry.order === QUESTIONS_ORDER ? "questions" : entry.worktree.split("/").at(-1)).sort()], [["chore-ticket-7", "questions"]])

  await held("a held item with no report starts none", 0, { tickets: [heldTicket(8, null)] })
  await held("a report on an item without the label starts none", 0, { tickets: [heldTicket(8, -10 * MINUTE, { labels: ["repo:ui", "Improvement"] })] })
  await held("no held item starts none", 0, { tickets: [ticket(8)] })
  const covered = scenario({ driver: {}, tickets: [heldTicket(8, -10 * MINUTE)] })
  writeFileSync(join(covered.env.stateDir, "questions.json"), `${JSON.stringify({ startedAt: iso(-5 * MINUTE) })}\n`)
  await covered.run()
  same("drive: questions: a report older than the last start starts none, as after a restart", questionRuns(covered).length, 0)
  const newer = scenario({ driver: {}, tickets: [heldTicket(8, -2 * MINUTE)] })
  writeFileSync(join(newer.env.stateDir, "questions.json"), `${JSON.stringify({ startedAt: iso(-5 * MINUTE) })}\n`)
  await newer.run()
  same("drive: questions: a report newer than the last start starts one run", questionRuns(newer).length, 1)

  const pulled = await held("a held pull request counts the report on its ticket", 1, { tickets: [ticket(7, { comments: [comment("needs-owner", "Raise the price?", -10 * MINUTE)] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL] })] } })
  same("drive: questions: a held pull request starts no worker", pulled.launched.filter((entry) => entry.order !== QUESTIONS_ORDER).length, 0)

  const stopped = await held("the main account at 90% with no allowance starts none", 0, { tickets: [heldTicket(8)], reading: { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  same("drive: questions: the stop is logged with the held item and the start time stays unwritten", [questionLines(stopped), startedFile(stopped)], [["questions wait (the main account is stopped: ticket#8)"], null])
  const allowed = await held("the main account at 90% with the allowance starts one", 1, { tickets: [heldTicket(8)], reading: { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE }, allowance: { resetsAt: RESETS_AT } })
  same("drive: questions: the allowance is read from the allow file like a worker", startedFile(allowed), iso(0))
  const pausedTicket = ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null })
  await held("a paused driver starts none", 0, { tickets: [pausedTicket, heldTicket(8)], probeReading: { utilization: 0.1, resetsAt: RESETS_AT, status: "rejected" } })
  await held("a signed-out login starts none", 0, { tickets: [heldTicket(8)], auth: { ...AUTH, loggedIn: false } })
  const noLogin = await held("a missing owner login starts none", 0, { tickets: [heldTicket(8)], ownerToken: null })
  same("drive: questions: a missing owner login is logged once and the start time stays unwritten", [questionLines(noLogin), startedFile(noLogin)], [["questions refused (no owner gh login: run gh auth login)"], null])
  const noLoginWithWorker = await held("a missing owner login with a worker token still starts none", 0, { tickets: [heldTicket(8)], ownerToken: null, token: "worker-token" })
  same("drive: questions: a missing owner login never falls back to the worker token", noLoginWithWorker.launched.length, 0)
  const workerRun = scenario({ driver: {}, tickets: [ticket(7), heldTicket(8)], token: "worker-token" })
  await workerRun.run()
  await workerRun.mem.questions
  same("drive: questions: a worker launch keeps the worker token while the questions run carries the owner login", [workerRun.launched.filter((entry) => entry.order !== QUESTIONS_ORDER).map((entry) => entry.invocation.environment.GH_TOKEN), questionRuns(workerRun).map((entry) => entry.invocation.environment.GH_TOKEN)], [["worker-token"], ["owner-token"]])
  await held("the dry run starts none", 0, { tickets: [heldTicket(8)], dryRun: true })

  const live = scenario({ driver: {}, tickets: [heldTicket(8)] })
  writeFileSync(join(live.env.stateDir, "questions.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/r/driver", startedAt: iso(-MINUTE) })}\n`)
  await live.run()
  same("drive: questions: a live run of an earlier driver process holds the next one back", questionRuns(live).length, 0)
  const plain = scenario({ tickets: [heldTicket(8)] })
  await plain.run()
  same("drive: questions: a tick with no driver worktree starts none", questionRuns(plain).length, 0)

  const switching = driverScene({ tickets: [heldTicket(8)] })
  let leave
  switching.env.worker.launch = (options) => { switching.launched.push(options); return new Promise((resolve) => { leave = () => resolve({ exitCode: 0 }) }) }
  const holdSwitch = await switching.run()
  same("drive: questions: the driver does not switch to a newer commit while its run is live", [holdSwitch.switched, switching.checkouts()], [false, []])
  leave()
  await switching.mem.questions
}

const OLD_PIN = "1".repeat(40)
const NEW_PIN = "2".repeat(40)
const LATER_PIN = "3".repeat(40)
const DRIVER_FILE = "tools/lib/worker.mjs"

/** A scene whose driver worktree holds `head` and whose origin/main is `main`; `files` is what `git diff --name-only` lists. A checkout moves the head. */
const driverScene = ({ head = OLD_PIN, main = NEW_PIN, files = [DRIVER_FILE], driver = { update: true }, ...extra } = {}) => {
  const state = { head }
  const scene = scenario({ ...extra, driver, gitRoutes: [["rev-parse HEAD", () => `${state.head}\n`], ["rev-parse origin/main", `${main}\n`], ["diff --name-only", (args) => (typeof files === "function" ? files(args) : files).join("\n")], ["checkout --detach", (args) => { state.head = args[2]; return "" }]] })
  return Object.assign(scene, { state, checkouts: () => scene.calls.filter((entry) => entry[0] === "git" && entry[1] === "checkout").map((entry) => entry.slice(1).join(" ")) })
}

const pinOf = (scene) => readPin(scene.env.stateDir)
const driverLines = (scene) => scene.messages.filter((line) => / driver (switch|rollback) /.test(line))

const selfUpdateCases = async () => {
  same("drive: only a change under tools/drive.mjs, tools/lib or tools/__fixtures__/drive- is a driver change", [
    ["tools/drive.mjs"], ["tools/lib/worker.mjs"], ["tools/__fixtures__/drive-github.json"], ["apps/web/a.ts", "tools/lib/a/b.mjs"],
  ].map(changesDriver).concat([["tools/__fixtures__/other.json"], ["tools/__tests__/drive.mjs"], ["tools/drive-notes.md"], ["apps/web/tools/drive.mjs"], []].map(changesDriver)), [true, true, true, true, false, false, false, false, false])
  same("drive: the last line of an error message is the one that has text", [lastLine("first\n  second  \n\n"), lastLine(""), lastLine(undefined), lastLine("x".repeat(400)).length], ["second", "", "", 300])

  const switching = driverScene()
  const result = await switching.run()
  same("drive: a main commit that changes the driver is checked out detached at the end of a tick with no worker, and the tick says to exit", [result.switched, switching.checkouts(), pinOf(switching).from, pinOf(switching).to, pinOf(switching).rolledBack, driverLines(switching).length, switching.calls.some((entry) => entry[0] === "git" && entry[1] === "fetch" && entry.includes("main"))], [true, [`checkout --detach ${NEW_PIN}`], OLD_PIN, NEW_PIN, false, 1, true])

  const busy = driverScene()
  const recordPath = leftBehind(busy, {})
  writeFileSync(join(busy.env.stateDir, "chore-ticket-7.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/w", startedAt: iso(0) })}\n`)
  const busyResult = await busy.run()
  same("drive: no switch while a worker runs, and its launch record stays", [busyResult.switched, busy.checkouts(), pinOf(busy), existsSync(recordPath)], [false, [], null, true])

  const owned = driverScene()
  owned.mem.running.set("chore-ticket-7", Promise.resolve())
  same("drive: no switch while a worker of this process runs", [(await owned.run()).switched, owned.checkouts()], [false, []])

  const unrelated = driverScene({ files: ["apps/web/page.tsx", "tools/__tests__/drive.mjs"] })
  same("drive: a main commit that changes no driver file is no switch", [(await unrelated.run()).switched, unrelated.checkouts(), pinOf(unrelated)], [false, [], null])

  const current = driverScene({ main: OLD_PIN })
  same("drive: a main that equals the pin is no switch", [(await current.run()).switched, current.checkouts()], [false, []])

  const once = driverScene({ driver: { update: false } })
  same("drive: a run that is not the loop never switches", [(await once.run()).switched, once.checkouts()], [false, []])

  const broken = driverScene({ driver: { update: true, smoke: false } })
  const brokenResult = await broken.run()
  same("drive: a new commit that does not start is checked out again at once, with one notification and one issue", [brokenResult.switched, broken.checkouts(), pinOf(broken).rolledBack, pinOf(broken).from, pinOf(broken).to, only(broken.calls, "notify").length, only(broken.calls, "createTicket").length], [false, [`checkout --detach ${NEW_PIN}`, `checkout --detach ${OLD_PIN}`], true, NEW_PIN, OLD_PIN, 1, 1])

  const unrunnable = driverScene({ driver: { update: true } })
  const savedPath = process.env.PATH
  const preflight = []
  unrunnable.env.smoke = async () => (await main(smokeArguments("/r/driver").slice(2), { err: (line) => preflight.push(line) })) === 0
  process.env.PATH = "/no/such/directory"
  let unrunnableResult
  try { unrunnableResult = await unrunnable.run() } finally { process.env.PATH = savedPath }
  same("drive: a new commit that exits 3 before the start code is checked out again, with one notification and one issue", [unrunnableResult.switched, unrunnable.checkouts(), pinOf(unrunnable).rolledBack, only(unrunnable.calls, "notify").length, only(unrunnable.calls, "createTicket").length, preflight.some((line) => line.startsWith("Missing from PATH")), smokeArguments("/r/driver").includes("--help")], [false, [`checkout --detach ${NEW_PIN}`, `checkout --detach ${OLD_PIN}`], true, 1, 1, true, false])

  const dry = driverScene({ dryRun: true })
  const printed = []
  dry.env.log = (line) => printed.push(line)
  await dry.run()
  same("drive: a dry run prints the pinned commit and the newer driver commit, and fetches and writes nothing", [printed.filter((line) => line.startsWith("driver pin")), dry.checkouts(), pinOf(dry), dry.calls.some((entry) => entry[0] === "git" && entry[1] === "fetch")], [[`driver pin ${OLD_PIN.slice(0, 9)}: main has a newer driver commit ${NEW_PIN.slice(0, 9)}`], [], null, false])
  const dryNone = driverScene({ dryRun: true, files: ["apps/web/page.tsx"] })
  const printedNone = []
  dryNone.env.log = (line) => printedNone.push(line)
  await dryNone.run()
  same("drive: a dry run says when main has no newer driver commit", printedNone.filter((line) => line.startsWith("driver pin")), [`driver pin ${OLD_PIN.slice(0, 9)}: main has no newer driver commit`])
}

/** A start of the new version that then ends with exit code 1 and `error`. */
const crashOnce = async (scene, error = "boom: cannot read x") => {
  const rolledBack = await guardStart(scene.env)
  if (!rolledBack) endRun(scene.env.stateDir, { exitCode: 1, error, now: NOW })
  return rolledBack
}

const rollbackCases = async () => {
  const switched = (extra = {}) => {
    const scene = driverScene({ head: NEW_PIN, main: NEW_PIN, ...extra })
    writeFileSync(join(scene.env.stateDir, "pin.json"), `${JSON.stringify({ from: OLD_PIN, to: NEW_PIN, at: iso(-5 * MINUTE), rolledBack: false })}\n`)
    return scene
  }

  const twice = switched()
  const early = [await crashOnce(twice), await crashOnce(twice), await guardStart(twice.env)]
  same("drive: two crashes of the new version within ten minutes are no rollback", [early, twice.checkouts(), only(twice.calls, "notify").length], [[false, false, false], [], 0])

  const rolled = switched()
  const outcomes = []
  for (let crash = 0; crash < 3; crash++) outcomes.push(await crashOnce(rolled))
  outcomes.push(await guardStart(rolled.env))
  same("drive: three crashes within ten minutes check the previous commit out, write the pin, send one notification and open one needs:owner issue", [outcomes, rolled.checkouts(), pinOf(rolled).rolledBack, pinOf(rolled).from, pinOf(rolled).to, only(rolled.calls, "notify").length, only(rolled.calls, "createTicket").length, only(rolled.calls, "createTicket")[0]?.[1].labels], [[false, false, false, true], [`checkout --detach ${OLD_PIN}`], true, NEW_PIN, OLD_PIN, 1, 1, [OWNER_LABEL]])
  const issue = only(rolled.calls, "createTicket")[0][1]
  T("drive: the rollback issue names both commits and the last error line", [OLD_PIN, NEW_PIN, "boom: cannot read x"].every((part) => issue.body.includes(part)), issue.body)
  same("drive: the rollback logs one line", driverLines(rolled).length, 1)

  const afterwards = driverScene({ head: OLD_PIN, main: NEW_PIN, stateDirectory: rolled.env.stateDir })
  same("drive: after a rollback the driver does not switch to the same commit again", [(await afterwards.run()).switched, afterwards.checkouts()], [false, []])
  const sinceFailed = (args) => (args.includes(NEW_PIN) ? [] : [DRIVER_FILE])
  const quiet = driverScene({ head: OLD_PIN, main: LATER_PIN, files: sinceFailed, stateDirectory: rolled.env.stateDir })
  const quietResult = await quiet.run()
  const quietPrinted = []
  const quietDry = driverScene({ head: OLD_PIN, main: LATER_PIN, files: sinceFailed, stateDirectory: rolled.env.stateDir, dryRun: true })
  quietDry.env.log = (line) => quietPrinted.push(line)
  await quietDry.run()
  same("drive: after a rollback a main commit is compared with the commit that failed, so a commit with no driver file is no switch, in a tick and in a dry run", [quietResult.switched, quiet.checkouts(), only(quiet.calls, "notify").length, quietPrinted.filter((line) => line.startsWith("driver pin"))], [false, [], 0, [`driver pin ${OLD_PIN.slice(0, 9)}: main has no newer driver commit, rolled back from ${NEW_PIN.slice(0, 9)}`]])
  const later = driverScene({ head: OLD_PIN, main: LATER_PIN, files: (args) => (args.includes(NEW_PIN) ? [DRIVER_FILE] : []), stateDirectory: rolled.env.stateDir })
  const laterResult = await later.run()
  same("drive: a later main commit after a rollback is tried", [laterResult.switched, later.checkouts(), pinOf(later).from, pinOf(later).to, pinOf(later).rolledBack], [true, [`checkout --detach ${LATER_PIN}`], OLD_PIN, LATER_PIN, false])

  const slow = switched()
  writeFileSync(join(slow.env.stateDir, "pin.json"), `${JSON.stringify({ from: OLD_PIN, to: NEW_PIN, at: iso(-20 * MINUTE), rolledBack: false })}\n`)
  for (let crash = 0; crash < 3; crash++) await crashOnce(slow)
  same("drive: crashes more than ten minutes after the switch are no rollback", [await guardStart(slow.env), slow.checkouts()], [false, []])

  const foreign = switched()
  writeFileSync(join(foreign.env.stateDir, "pin.json"), `${JSON.stringify({ from: OLD_PIN, to: LATER_PIN, at: iso(-5 * MINUTE), rolledBack: false })}\n`)
  for (let crash = 0; crash < 3; crash++) await crashOnce(foreign)
  same("drive: crashes of a commit that is not the pin are no rollback", [await guardStart(foreign.env), foreign.checkouts()], [false, []])

  const clean = switched()
  for (let run = 0; run < 4; run++) { await guardStart(clean.env); endRun(clean.env.stateDir, { exitCode: 0, error: null, now: NOW }) }
  same("drive: runs that end with code 0 are no crash", [await guardStart(clean.env), clean.checkouts()], [false, []])

  const killed = switched()
  for (let run = 0; run < 3; run++) await guardStart(killed.env)
  same("drive: a run that wrote no exit code is a crash", [await guardStart(killed.env), killed.checkouts()], [true, [`checkout --detach ${OLD_PIN}`]])
}

export const pinUnit = async () => {
  await selfUpdateCases()
  await rollbackCases()
}


/** The config directory of the environment that a launch got: the worker directory, or null for the main account. */
const accountOfLaunch = (options) => options.invocation.environment.CLAUDE_CONFIG_DIR ?? null

const twoAccountCases = async () => {
  const below = { utilization: 0.35, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }
  const stoppedReading = { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE }
  const waitingPull = pull(30, { reviews: [], tracks: 8, headRef: "chore/ticket-8-30" })

  const mainStopped = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [waitingPull] }, reading: stoppedReading, workerAuth: WORKER_AUTH, workerReading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await mainStopped.run()
  same("drive: main at 0.92 and the worker account at 0.10 start one worker with CLAUDE_CONFIG_DIR set to the worker directory", mainStopped.launched.map(accountOfLaunch), [WORKER_DIRECTORY])
  same("drive: main at 0.92 posts no Pullfrog request while the worker account works", commentsOf(mainStopped.calls, 30).length, 0)
  T("drive: the weekly stop of the main account still opens its one stop issue", only(mainStopped.calls, "createTicket").some((entry) => entry[1].title === STOP_ISSUE_TITLE))

  // The main account holds the Pullfrog request while the worker account has slots: the hold is chosen, so no stall issue opens.
  const stallOf = async (label, { reading, usageLimit }) => {
    const stateDirectory = join(root, `drive-stall-${++scenarios}`)
    mkdirSync(stateDirectory, { recursive: true })
    writeFileSync(join(stateDirectory, "activity.json"), JSON.stringify({ at: NOW - 61 * MINUTE }))
    const scene = scenario({ tickets: [ticket(8)], pulls: { ui: [waitingPull] }, stateDirectory, reading, workerAuth: WORKER_AUTH, workerReading: below, probeReading: { utilization: 0.5, resetsAt: RESETS_AT, status: "rejected" } })
    if (usageLimit) scene.mem.stoppedUntil = NOW + 60 * MINUTE
    await scene.run()
    same(`drive: ${label} and 61 minutes with no action open no stall issue`, [scene.launched.length, commentsOf(scene.calls, 30).length, only(scene.calls, "createTicket").filter(([, input]) => input.title === STALL).length], [0, 0, 0])
  }
  await stallOf("main at 0.92 with the worker account at 0.35 and one pull request waiting for its first review", { reading: stoppedReading })
  await stallOf("main stopped by a usage limit with the worker account at 0.35 and one pull request waiting for its first review", { reading: below, usageLimit: true })

  // A launch that fails on the worker account is no hold the driver chose, so it stays on the stall clock while the main account is stopped.
  const failing = join(root, `drive-stall-${++scenarios}`)
  mkdirSync(failing, { recursive: true })
  writeFileSync(join(failing, "activity.json"), JSON.stringify({ at: NOW - 61 * MINUTE }))
  const failed = scenario({ tickets: [ticket(7)], occupants: [4242], stateDirectory: failing, reading: stoppedReading, workerAuth: WORKER_AUTH, workerReading: below })
  await failed.run()
  same("drive: main at 0.92 and the worker account at 0.35 with a worktree that another process holds on every tick open one stall issue after 61 minutes", [failed.launched.length, only(failed.calls, "createTicket").filter(([, input]) => input.title === STALL).length], [0, 1])

  const both = scenario({ tickets: [ticket(7), ticket(8), ticket(9), ticket(10), ticket(11)], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  await both.run()
  same("drive: both accounts below their lines give the sum of their slots, and the worker account fills first", both.launched.map(accountOfLaunch), [WORKER_DIRECTORY, WORKER_DIRECTORY, null, null])
  const line = both.messages.find((entry) => entry.includes(" pace "))
  same("drive: the pace line names both accounts by key with their slots and stop state", [line.includes(`main ${ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 0, free 2, stop no`), line.includes(`worker ${WORKER_ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 0, free 2, stop no`)], [true, true])
  same("drive: no log line, issue or notification holds an email of either account", JSON.stringify([both.messages, both.calls]).match(/@example/g), null)

  const running = scenario({ tickets: [ticket(7), ticket(8), ticket(9)], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  leftBehind(running, {}, "", "chore-ticket-6")
  running.env.processAlive = () => true
  writeFileSync(join(running.env.stateDir, "chore-ticket-6.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/r/orbit-worktrees/ui/chore-ticket-6", startedAt: iso(-MINUTE) })}\n`)
  await running.run()
  const runningLine = running.messages.find((entry) => entry.includes(" pace "))
  same("drive: a running worker holds a slot of its own account only", [runningLine.includes(`main ${ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 1, free 1`), runningLine.includes(`worker ${WORKER_ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 0, free 2`), running.launched.length], [true, true, 2])

  const limited = { exitCode: 1, result: { usageLimitReached: true, authenticationFailed: false, error: "You've hit your limit. Resets 4am (America/Sao_Paulo)", needsDecision: null } }
  const capTickets = [ticket(7, { comments: [launchComment("build", "chore/ticket-7")] })]
  const hit = scenario({ tickets: capTickets, reading: below, workerAuth: WORKER_AUTH, workerReading: below, workerProbeReading: { utilization: 0.35, resetsAt: RESETS_AT, status: "rejected" } })
  keepWrites(hit, capTickets)
  hit.env.worker.launch = (options) => { hit.launched.push(options); return Promise.resolve({ ...clean, ...(accountOfLaunch(options) === null ? {} : limited), utilization: 0.35, resetsAt: RESETS_AT }) }
  await hit.run()
  await hit.run()
  same("drive: a worker that ends on a usage limit on the worker account starts again on the main account", hit.launched.map(accountOfLaunch), [WORKER_DIRECTORY, null])
  same("drive: the worker account is stopped until its resetsAt, and the main account is not", [hit.mem.worker.stoppedUntil, hit.mem.stoppedUntil], [RESETS_AT * 1000, null])
  same("drive: a usage limit with a second account opens no pause issue, and the refund keeps the launch off the cap", [only(hit.calls, "createTicket").length, launchesOf(capTickets[0]).length, only(hit.calls, "comment").filter((entry) => entry[3].startsWith(marked("needs-owner", ""))).length], [0, 2, 0])
  T("drive: the stopped account shows in the pace line with its stop and its end", hit.messages.filter((entry) => entry.includes(" pace ")).at(-1).includes(`worker ${WORKER_ACCOUNT.key}:`) && hit.messages.filter((entry) => entry.includes(" pace ")).at(-1).includes(`stop yes (usage limit until ${new Date(RESETS_AT * 1000).toISOString()})`))
  same("drive: a restart keeps the stop of the worker account", JSON.parse(readFileSync(join(hit.env.stateDir, "pace.json"), "utf8")).worker.stoppedUntil, RESETS_AT * 1000)

  const ciFix = (head = null, offset = -3600 * 1000) => comment("launch", JSON.stringify({ kind: "ci-fix", part: null, branch: "chore/ticket-7-30", ...(head ? { baseMerge: head } : {}) }), offset)
  const ciRefund = () => comment("launch-refund", JSON.stringify({ kind: "ci-fix", part: null, branch: "chore/ticket-7-30" }))
  same("drive: a refund takes back the launch before it, not the free launch that follows", launchesOf(ticket(7, { comments: [ciFix(), ciRefund(), ciFix("H3")] })).map((entry) => entry.baseMerge ?? null), ["H3"])
  same("drive: a refund between two launches of one head keeps the later launch", launchesOf(ticket(7, { comments: [ciFix("H1"), ciRefund(), ciFix("H1"), ciFix()] })).map((entry) => entry.baseMerge ?? null), ["H1", null])

  const refundTicket = ticket(7, { comments: [launchComment("build", "chore/ticket-7"), comment("launch-refund", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7" })), launchComment("build", "chore/ticket-8")] })
  same("drive: a refund takes back the newest launch of its branch and kind only", launchesOf(refundTicket).map((entry) => entry.branch), ["chore/ticket-8"])

  const lone = scenario({ tickets: [ticket(7)], limit: limited })
  await lone.run()
  await lone.run()
  same("drive: with one account a usage limit still pauses the driver and counts the launch", [only(lone.calls, "createTicket").length, lone.mem.stoppedUntil], [1, null])

  const resetAt = scenario({ tickets: [ticket(7)], reading: stoppedReading, workerAuth: WORKER_AUTH, workerReading: { utilization: 0.97, resetsAt: Math.floor(NOW / 1000) - 60, at: NOW - 3 * 3600 * 1000 } })
  resetAt.mem.worker.stoppedUntil = NOW - 1000
  await resetAt.run()
  same("drive: after the reset of the worker account the driver starts work on it by itself, and the old stop ends", [resetAt.launched.map(accountOfLaunch), resetAt.mem.worker.stoppedUntil], [[WORKER_DIRECTORY], null])

  const probes = scenario({ tickets: [ticket(7)], reading: below, workerAuth: WORKER_AUTH, workerProbeReading: { utilization: 0.2, resetsAt: RESETS_AT, status: "allowed" } })
  await probes.run()
  same("drive: the worker account has its own probe, and its reading sets its own slots", [only(probes.calls, "probe"), probes.mem.worker.reading.utilization, probes.mem.worker.reading.account], [[["probe", "worker"]], 0.2, WORKER_ACCOUNT.key])

  const marked_ = scenario({ tickets: [ticket(7)], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  marked_.mem.worker.stoppedUntil = RESETS_AT * 1000
  await marked_.run()
  same("drive: a probe that reads status allowed ends the usage-limit stop early, so a limit of the 5-hour window does not hold an account for days", [only(marked_.calls, "probe"), marked_.mem.worker.stoppedUntil], [[["probe", "worker"]], null])

  const rejected = { utilization: 0.35, resetsAt: RESETS_AT, status: "rejected" }
  const mainLimited = async (extra) => {
    const unasked = pull(30, { reviews: [], comments: [comment("ticket", "T")], tracks: 8, headRef: "chore/ticket-8-30" })
    const scene = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [unasked] }, runs: [pullfrogRun(3, -20 * MINUTE, -15 * MINUTE)], reading: below, workerAuth: WORKER_AUTH, workerReading: below, probeReading: rejected, ...extra })
    scene.mem.stoppedUntil = RESETS_AT * 1000
    await scene.run()
    return scene
  }
  const requestRule = [["the main account stopped by a usage limit, the worker account below its line", {}], ["the main account stopped by a usage limit, the worker account at 0.10", { workerReading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE } }]]
  for (const [label, extra] of requestRule) {
    const scene = await mainLimited(extra)
    same(`drive: ${label} start one worker on the worker account and post no Pullfrog request`, [scene.launched.map(accountOfLaunch), commentsOf(scene.calls, 30).length], [[WORKER_DIRECTORY], 0])
  }

  const limitLine = `${READS.failedRunLog.line.replace(/Z .*$/, "Z ")}You've hit your limit. Resets 4am (America/Sao_Paulo)`
  const failedRun = { databaseId: 77, displayTitle: "Respond to mention on #7 [abc]", status: "completed", conclusion: "failure", createdAt: iso(-10 * MINUTE), updatedAt: iso(-5 * MINUTE) }
  const pullfrogLimited = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun], routes: [["--log-failed", limitLine]], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  await pullfrogLimited.run()
  same("drive: with two accounts a Pullfrog usage limit opens no pause issue and stops only the main account until its resetsAt", [only(pullfrogLimited.calls, "createTicket").length, pullfrogLimited.mem.stoppedUntil, pullfrogLimited.mem.worker.stoppedUntil], [0, RESETS_AT * 1000, null])
  same("drive: with two accounts a Pullfrog usage limit leaves the worker account its slots and posts no Pullfrog request", [pullfrogLimited.launched.map(accountOfLaunch), commentsOf(pullfrogLimited.calls, 30).length], [[WORKER_DIRECTORY], 0])

  const oldPause = ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null, body: `A worker stopped.\n\nAccount: ${ACCOUNT.key}` })
  const pausedWithWorker = scenario({ tickets: [oldPause, ticket(7)], reading: below, workerAuth: WORKER_AUTH, workerReading: below, probeReading: { utilization: 0.35, resetsAt: RESETS_AT, status: "allowed" } })
  leftBehind(pausedWithWorker, { account: WORKER_ACCOUNT.key }, "", "chore-ticket-6")
  pausedWithWorker.env.processAlive = () => true
  writeFileSync(join(pausedWithWorker.env.stateDir, "chore-ticket-6.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/r/orbit-worktrees/ui/chore-ticket-6", startedAt: iso(-MINUTE) })}\n`)
  await pausedWithWorker.run()
  same("drive: a worker that runs on the worker account does not hold the probe that ends a pause of the main account", [only(pausedWithWorker.calls, "probe"), only(pausedWithWorker.calls, "closeTicket").length], [[["probe", "main"]], 1])

  const warning = { utilization: 0.8, resetsAt: RESETS_AT, status: "allowed_warning" }
  const workerWarned = scenario({ tickets: [ticket(7)], reading: below, workerAuth: WORKER_AUTH, workerReading: below, workerProbeReading: warning })
  workerWarned.mem.worker.stoppedUntil = RESETS_AT * 1000
  const mainWarned = scenario({ tickets: [ticket(7)], reading: below, workerAuth: WORKER_AUTH, workerReading: below, probeReading: warning })
  mainWarned.mem.stoppedUntil = RESETS_AT * 1000
  const pausedWarned = scenario({ tickets: [ticket(50, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null }), ticket(7)], probeReading: warning })
  await Promise.all([workerWarned.run(), mainWarned.run(), pausedWarned.run()])
  same("drive: a probe that reads allowed_warning ends a usage-limit stop and a Pullfrog pause like allowed", [workerWarned.mem.worker.stoppedUntil, mainWarned.mem.stoppedUntil, only(pausedWarned.calls, "closeTicket").length], [null, null, 1])

  const absent = scenario({ tickets: [ticket(7)], reading: below, workerAuth: { ...WORKER_AUTH, loggedIn: false } })
  await absent.run()
  same("drive: a signed-out worker account gives no slot, no probe and no issue", [absent.launched.map(accountOfLaunch), only(absent.calls, "probe").length, only(absent.calls, "createTicket").length], [[null], 0, 0])

  const allowedWorker = scenario({ tickets: [ticket(7), ticket(8)], reading: stoppedReading, workerAuth: WORKER_AUTH, workerReading: { utilization: 0.93, resetsAt: RESETS_AT, at: NOW - MINUTE }, allowance: { worker: { resetsAt: RESETS_AT, account: WORKER_ACCOUNT.key } } })
  await allowedWorker.run()
  same("drive: the allowance of the worker account lets it run 1 worker over 90% while the main account stays stopped", [allowedWorker.launched.map(accountOfLaunch), allowedWorker.messages.find((entry) => entry.includes(" pace ")).includes(`worker ${WORKER_ACCOUNT.key}: utilization 0.930`)], [[WORKER_DIRECTORY], true])

  const allow = scenario({ reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  allow.env.snapshot = () => null
  const said = []
  const code = await allowOverLimit(allow.env, { out: (text) => said.push(text), err: (text) => said.push(text) }, "worker")
  const saved = JSON.parse(readFileSync(join(allow.env.stateDir, "over-limit.json"), "utf8"))
  const codeMain = await allowOverLimit(allow.env, { out: (text) => said.push(text), err: (text) => said.push(text) })
  const both_ = JSON.parse(readFileSync(join(allow.env.stateDir, "over-limit.json"), "utf8"))
  same("drive: --allow-over-limit worker writes the week of the worker account, and the main flag keeps it", [code, saved.worker.account, saved.resetsAt, codeMain, both_.account, both_.worker.account], [0, WORKER_ACCOUNT.key, undefined, 0, ACCOUNT.key, WORKER_ACCOUNT.key])
  same("drive: --allow-over-limit takes an optional account word", [parseArguments(["--allow-over-limit", "worker"]), parseArguments(["--allow-over-limit"]), parseArguments(["--allow-over-limit", "other"]).error !== undefined], [{ help: false, mode: "allow-over-limit", account: "worker" }, { help: false, mode: "allow-over-limit" }, true])
}

/** A worktree sweep scene: each worktree is a row of the table, and its git and GitHub answers come from the row. */
const sweepCases = async () => {
  const MERGED_HEAD = "m".repeat(40)
  const rows = [
    { name: "merged and clean", branch: "chore/done", pulls: [{ number: 1, state: "MERGED", headRefOid: MERGED_HEAD }], removed: true },
    { name: "open pull request", branch: "chore/open", pulls: [{ number: 2, state: "OPEN", headRefOid: MERGED_HEAD }], reason: /pull request is open/ },
    { name: "merged and open", branch: "chore/both", pulls: [{ number: 3, state: "MERGED", headRefOid: MERGED_HEAD }, { number: 4, state: "OPEN", headRefOid: MERGED_HEAD }], reason: /pull request is open/ },
    { name: "no pull request", branch: "chore/none", pulls: [], reason: /no pull request of the branch is merged/ },
    { name: "closed unmerged", branch: "chore/closed", pulls: [{ number: 5, state: "CLOSED", headRefOid: MERGED_HEAD }], reason: /no pull request of the branch is merged/ },
    { name: "dirty tree", branch: "chore/dirty", status: " M tools/a.mjs", pulls: [{ number: 6, state: "MERGED", headRefOid: MERGED_HEAD }], reason: /the tree has a change\)$/ },
    { name: "untracked file", branch: "chore/untracked", status: "?? notes.txt", pulls: [{ number: 7, state: "MERGED", headRefOid: MERGED_HEAD }], reason: /the tree has a change\)$/ },
    { name: "hidden change", branch: "chore/hidden", hidden: "h tools/a.mjs", pulls: [{ number: 8, state: "MERGED", headRefOid: MERGED_HEAD }], reason: /hides/ },
    { name: "unpushed commit", branch: "chore/unpushed", head: "u".repeat(40), pulls: [{ number: 9, state: "MERGED", headRefOid: MERGED_HEAD }], reason: /a commit is unpushed/ },
    { name: "commit on a remote branch", branch: "chore/remote", head: "r".repeat(40), remotes: "  origin/chore/remote", pulls: [{ number: 10, state: "MERGED", headRefOid: MERGED_HEAD }], removed: true },
    { name: "held by a process", branch: "chore/held", pulls: [{ number: 11, state: "MERGED", headRefOid: MERGED_HEAD }], occupied: true, reason: /a process holds it/ },
    { name: "held by a process that only has its cwd there", branch: "chore/shell", pulls: [{ number: 16, state: "MERGED", headRefOid: MERGED_HEAD }], cwdHolder: { pid: 5151, path: "/r/orbit-worktrees/ui/chore-shell/apps/web" }, reason: /a process holds it: pid 5151/ },
    { name: "driver worktree", branch: "chore/driver", pulls: [{ number: 12, state: "MERGED", headRefOid: MERGED_HEAD }], driver: true },
    { name: "nested worktree", branch: "chore/nested", nested: ["/r/orbit-worktrees/ui/chore-nested/.claude/worktrees/agent-1"], pulls: [{ number: 14, state: "MERGED", headRefOid: MERGED_HEAD }], reason: /it holds a repository or worktree: \/r\/orbit-worktrees\/ui\/chore-nested\/\.claude\/worktrees\/agent-1/ },
    { name: "unreadable walk", branch: "chore/walk", nested: null, pulls: [{ number: 15, state: "MERGED", headRefOid: MERGED_HEAD }], reason: /the repositories inside it are unreadable/ },
    { name: "refused by git", branch: "chore/refused", pulls: [{ number: 13, state: "MERGED", headRefOid: MERGED_HEAD }], refuse: true, reason: /removal refused: fatal: contains modified/ },
  ]
  const pathOf = (row) => `/r/orbit-worktrees/ui/${row.branch.replace("/", "-")}`
  const byPath = new Map(rows.map((row) => [pathOf(row), row]))
  const listing = ["worktree /r/ui\nHEAD abc\nbranch refs/heads/main", ...rows.map((row) => `worktree ${pathOf(row)}\nHEAD abc\nbranch refs/heads/${row.branch}`)].join("\n\n") + "\n"
  const answers = rows.map((row) => [row.branch, JSON.stringify(row.pulls)])
  const scene = scenario({ driver: {}, occupants: [], routes: [["pr list --repo thomasluizon/ui --head", (args) => answers.find(([branch]) => args.includes(branch))[1]]] })
  scene.env.driverWorktree = pathOf(rows.find((row) => row.driver))
  scene.env.worker.worktreeOccupants = (worktree) => (byPath.get(worktree)?.occupied ? [4242] : [])
  scene.env.worker.processDirectories = () => (scene.calls.push(["directories"]), [...rows.filter((row) => row.cwdHolder).map((row) => row.cwdHolder), { pid: 6000, path: "/r/orbit-worktrees/ui/chore-done-2" }])
  scene.env.findRepositories = (path) => (byPath.get(path)?.nested === undefined ? [path] : byPath.get(path).nested === null ? null : [path, ...byPath.get(path).nested])
  scene.env.git = async (cwd, args) => {
    scene.calls.push(["git", cwd, ...args])
    const text = args.join(" ")
    const row = byPath.get(cwd)
    const ok = (stdout = "") => ({ status: 0, stderr: "", stdout })
    if (cwd === "/r/ui" && args[0] === "worktree" && args[1] === "list") return ok(listing)
    if (args.includes("worktree") && args.includes("remove")) return byPath.get(args.at(-1))?.refuse ? { status: 1, stderr: "fatal: contains modified or untracked files\n", stdout: "" } : ok()
    if (!row) return ok()
    if (args.includes("status")) return ok(row.status ?? "")
    if (args[0] === "ls-files") return ok(row.hidden ?? "")
    if (text === "rev-parse HEAD") return ok(row.head ?? MERGED_HEAD)
    if (args[0] === "branch" && args.includes("--remotes")) return ok(row.remotes ?? "")
    return ok()
  }
  await scene.run()
  const removals = scene.calls.filter((entry) => entry[0] === "git" && entry.includes("worktree") && entry.includes("remove"))
  const deleted = scene.calls.filter((entry) => entry[0] === "git" && entry[2] === "branch" && entry[3] === "-D").map((entry) => entry[4])
  const tried = removals.map((entry) => entry.at(-1))
  same("drive: the sweep removes a worktree that is merged, clean and pushed and deletes its branch", [tried.includes(pathOf(rows[0])), deleted.includes("chore/done"), tried.includes(pathOf(rows[9])), deleted.includes("chore/remote")], [true, true, true, true])
  same("drive: the sweep removes only the rows that pass every check, and never with a force flag", [tried.sort(), removals.some((entry) => entry.includes("--force") || entry.includes("-f"))], [[...rows.filter((row) => row.removed || row.refuse).map(pathOf)].sort(), false])
  same("drive: the sweep deletes the branch only of a removed worktree", deleted.sort(), rows.filter((row) => row.removed).map((row) => row.branch).sort())
  for (const row of rows.filter((candidate) => candidate.reason)) T(`drive: the sweep keeps the worktree of ${row.name} and logs its path and reason`, scene.messages.some((line) => line.includes(pathOf(row)) && row.reason.test(line)), scene.messages.filter((line) => line.includes(pathOf(row))).join("\n"))
  T("drive: the sweep never reads or logs the driver worktree and the primary checkout", !scene.calls.some((entry) => entry[0] === "git" && entry[1] === pathOf(rows.find((row) => row.driver))) && !scene.messages.some((line) => line.includes("worktree-stays") && line.includes(" /r/ui:")))
  const reads = scene.calls.filter((entry) => entry[0] === "directories").length
  const second = await scene.run()
  same("drive: a worktree that stays is logged once for each reason", scene.messages.filter((line) => line.includes("worktree-stays") && line.includes(pathOf(rows[1]))).length, 1)
  const closing = scenario({ tickets: [ticket(7, { comments: [comment("launch", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7" }))] })], routes: [["--state merged", JSON.stringify([{ number: 30, body: `Tracks ${REPOSITORY}#7\n\nRemaining: none`, mergedAt: iso(-3600 * 1000), headRefName: "chore/ticket-7" }])]], gitRoutes: [["worktree list", "worktree /r/orbit-worktrees/ui/chore-ticket-7\nHEAD abc\nbranch refs/heads/chore/ticket-7\n"]] })
  closing.env.findRepositories = (path) => [path, join(path, ".claude/worktrees/agent-1")]
  await closing.run()
  const closingGit = closing.calls.filter((entry) => entry[0] === "git").map((entry) => entry.slice(1).join(" "))
  same("drive: closing a ticket keeps a worktree that holds another worktree, with its branch", [closingGit.some((text) => /worktree remove/.test(text)), closingGit.some((text) => /branch -D/.test(text)), closing.messages.some((line) => line.includes("worktree-kept") && line.includes("it holds a repository or worktree"))], [false, false, true])
  const holder = scenario({ tickets: [ticket(7, { comments: [comment("launch", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7" }))] })], directories: [{ pid: 5151, path: "/r/orbit-worktrees/ui/chore-ticket-7" }], routes: [["--state merged", JSON.stringify([{ number: 30, body: `Tracks ${REPOSITORY}#7\n\nRemaining: none`, mergedAt: iso(-3600 * 1000), headRefName: "chore/ticket-7" }])]], gitRoutes: [["worktree list", "worktree /r/orbit-worktrees/ui/chore-ticket-7\nHEAD abc\nbranch refs/heads/chore/ticket-7\n"]] })
  await holder.run()
  const holderGit = holder.calls.filter((entry) => entry[0] === "git").map((entry) => entry.slice(1).join(" "))
  same("drive: closing a ticket keeps a worktree that a process holds by its cwd, with its branch", [holderGit.some((text) => /worktree remove/.test(text)), holderGit.some((text) => /branch -D/.test(text)), holder.messages.some((line) => line.includes("worktree-kept") && line.includes("a process holds it: pid 5151"))], [false, false, true])
  const unreadable = scenario({ tickets: [ticket(7, { comments: [comment("launch", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7" }))] })], routes: [["--state merged", JSON.stringify([{ number: 30, body: `Tracks ${REPOSITORY}#7\n\nRemaining: none`, mergedAt: iso(-3600 * 1000), headRefName: "chore/ticket-7" }])]], gitRoutes: [["worktree list", "worktree /r/orbit-worktrees/ui/chore-ticket-7\nHEAD abc\nbranch refs/heads/chore/ticket-7\n"]] })
  unreadable.env.worker.processDirectories = () => { throw new Error("lsof failed: denied") }
  await unreadable.run()
  same("drive: closing a ticket keeps a worktree when the cwd of the processes is unreadable", [unreadable.calls.some((entry) => entry[0] === "git" && entry.includes("remove")), unreadable.messages.some((line) => line.includes("worktree-kept") && line.includes("lsof failed: denied"))], [false, true])
  same("drive: one sweep reads the process directories once", reads, 1)
  const dry = scenario({ dryRun: true })
  await dry.run()
  same("drive: a dry run sweeps no worktree", dry.calls.filter((entry) => entry[0] === "git" && entry.includes("worktree")).length, 0)
}

/** The release train inside the tick: its ports, its dry-run lines and its ticket writes. */
const releaseCases = async () => {
  const SHA = (letter) => letter.repeat(40)
  const entry = (name, extra = {}) => ({ name, needsRelease: true, deployedSha: SHA("1"), plannedSha: SHA("a"), commits: [{ sha: SHA("a"), message: "change (#4)" }], ...(name === "android" ? { track: "open" } : { dispatchCommand: `gh workflow run release.yml --repo thomasluizon/orbit-${name === "web" ? "ui-mobile" : name === "api" ? "api" : "landing-page"} --ref main -f environment=production -f branch='main' -f sha=${SHA("a")}` }), ...extra })
  const fakePorts = (events, { migration = false } = {}) => ({
    plan: async () => { events.push("plan"); return { services: [entry("api"), entry("web"), entry("landing"), entry("android")] } },
    wake: async () => { events.push("wake") },
    mainHead: async () => SHA("a"),
    changedFiles: async (service) => (service === "api" && migration ? ["src/Orbit.Infrastructure/Migrations/x.cs"] : ["apps/web/a.ts", "apps/mobile/b.ts"]),
    manualSteps: async () => [],
    dispatch: async (args) => { events.push(`dispatch ${args.slice(2).join(" ")}`) },
    listRuns: async () => [],
  })

  const none = scenario({ tickets: [] })
  await none.run()
  same("drive: a tick with no release ports makes no release read", none.messages.filter((line) => line.includes(" release ")), [])

  const dry = scenario({ dryRun: true, releasePorts: fakePorts([]) })
  const printed = []
  dry.env.log = (line) => printed.push(line)
  await dry.run()
  const steps = printed.filter((line) => / release (api|web|landing|android|ios) (staging|production) /.test(line))
  T("drive: a dry run prints the release step of each service that the plan says needs a release", ["api", "web", "landing", "android", "ios"].every((service) => steps.some((line) => line.includes(` release ${service} staging `) && line.endsWith("would dispatch"))), printed.join("\n"))
  same("drive: a dry run dispatches no release and writes no train file", [existsSync(join(dry.env.stateDir, "release-train.json"))], [false])

  const events = []
  const real = scenario({ releasePorts: fakePorts(events) })
  await real.run()
  const dispatched = events.filter((event) => event.startsWith("dispatch"))
  same("drive: a real tick starts the train and makes its first dispatch, API staging", [dispatched.length, dispatched[0].includes("orbit-api") && dispatched[0].includes("environment=staging")], [1, true])
  same("drive: the train state sits beside the pace file", existsSync(join(real.env.stateDir, "release-train.json")), true)
  await real.run()
  same("drive: the next tick checks the run and dispatches nothing new while no run is listed", events.filter((event) => event.startsWith("dispatch")).length, 1)

  const broken = scenario({ releasePorts: { ...fakePorts([]), plan: async () => { throw new Error("plan failed") } } })
  await broken.run()
  T("drive: a release error is one log line and does not end the tick", broken.messages.some((line) => line.includes(" release error (plan failed)")), broken.messages.join("\n"))

  const held = scenario({ releasePorts: fakePorts([], { migration: true }) })
  await held.run()
  const created = only(held.calls, "createTicket")
  same("drive: a held API step files one needs:owner ticket for the API with one comment that names the step", [created.length, created[0]?.[1].labels, only(held.calls, "comment").length, only(held.calls, "comment")[0]?.[3].includes("api-staging")], [1, ["repo:api", "needs:owner"], 1, true])
  await held.run()
  same("drive: the next tick of a train with a held step files no second ticket", only(held.calls, "createTicket").length, 1)

  const asleep = scenario({ releasePorts: fakePorts([]), sleeping: true })
  await asleep.run()
  T("drive: sleep mode does not stop the train", asleep.messages.some((line) => line.includes(" release train ") && line.includes(" start: ")), asleep.messages.join("\n"))

  same("drive: --release-now and --release-status are modes", [parseArguments(["--release-now"]).mode, parseArguments(["--release-status"]).mode, parseArguments(["--release-now", "--once"]).error !== undefined], ["release-now", "release-status", true])
  const usage = await usageText()
  T("drive: the usage names the release train and both flags", /release train/.test(usage) && /--release-now/.test(usage) && /--release-status/.test(usage), usage)
}

export const driverUnit = async () => {
  await releaseCases()
  await admissionCases()
  await checkOnlyCases()
  await stallCases()
  await paceCases()
  await sleepCases()
  await questionsCases()
  await usageLimitCases()
  await workerCases()
  await capCases()
  await classCases()
  await baseMergeCases()
  await reviewRunCases()
  await worktreeOccupantCases()
  await reviewCases()
  await ownerAndBodyCases()
  await mergeCases()
  await updateCases()
  await ciCases()
  await closeCases()
  await sweepCases()
  await intakeCases()
  await accountCases()
  await robustnessCases()
  await cliCases()
  await blockingClassCases()
  await laneAndReviewPassCases()
  await logOnlyCases()
  await runningWorkCases()
  await paceStampCases()
  await planSpeedCases()
  await reapOutcomeCases()
  await unreadLogCases()
  await gatedReportCases()
  await branchKeyCases()
  await restartCases()
  await echoedLimitCases()
  await reasonKeyCases()
  await orderOfApiCases()
  await orphanClockCases()
  await paceRestartCases()
  await twoAccountCases()
}
