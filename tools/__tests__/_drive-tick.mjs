/** Table tests of the delivery driver's tick: the fake seams, the scenarios and their exact writes. */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { accountFrom, allowOverLimit, createMemory, guardStart, launchesOf, main, marked, missingTools, pathsOverlap, paceState, parseArguments, pushOutputs, rankTickets, readSleep, readUnpaced, recordStart, resultText, setPace, setSleep, smokeArguments, tick, ticketComment } from "../drive.mjs"
import { changesDriver, endRun, lastLine, readPin } from "../lib/driver-pin.mjs"
import { bodyFindings, runsNaming } from "../lib/github.mjs"
import { directoryHolders, isUsageLimitMessage, isWorkerProcess, KILL_REASONS, logContextTokens, progressWatch, readSnapshot, usageLimitIn, WORKER_LIMITS } from "../lib/worker.mjs"
import { T, root, same, stageRepo } from "./_harness.mjs"

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

const comment = (kind, text, offset = -3600 * 1000, extra = {}) => ({ id: `C${Math.abs(offset)}${text.length}`, url: `https://example.test/C${Math.abs(offset)}${text.length}`, author: "thomasluizon", body: kind ? marked(kind, text) : text, createdAt: iso(offset), kind, ...extra })

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
const scenario = ({ tickets = [], pulls = { ui: [], api: [], landing: [] }, routes = [], gitRoutes = [], reading = { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, token = "token", ownerToken = "owner-token", dryRun = false, runs = [], failedSteps = [], limit = null, probeReading = undefined, unmet = [], auth = AUTH, stateDirectory = null, allowance = null, sleeping = false, occupants = [], directories = [], driver = null, workerAuth = null, workerReading = null, workerProbeReading = undefined, releasePorts = null, dependencies = { action: "clone", ms: 40, directories: ["", "apps/web"], reason: null }, sessions = true } = {}) => {
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
      readFailedSteps: async (key, runId, jobId) => (typeof failedSteps === "function" ? failedSteps(jobId) : failedSteps),
      pullfrogRuns: async (key) => { calls.push(["pullfrogRuns", key]); return runs },
      // The scenarios give one run list for every pull request, so the title filter keeps it whole.
      runsNaming: (list) => list,
      readDependabotUpdateTypes: async () => ["patch"],
      readRequiredChecksFile: async () => null,
      readProtectionChecks: async () => ({ strict: false, checks: [] }),
      writeProtectionChecks: record("writeProtectionChecks"),
      unmetDeployFirst: async () => unmet,
      createTicket: async (input) => { calls.push(["createTicket", input]); return { number: 99 } },
      comment: record("comment"), editLabels: record("editLabels"), merge: record("merge"), resolveThreads: record("resolveThreads"), updateBranch: record("updateBranch"), retarget: record("retarget"), rerunFailed: record("rerunFailed"), closeTicket: record("closeTicket"), closePull: record("closePull"), deleteBranch: record("deleteBranch"), ensureLabel: record("ensureLabel"),
    },
    worker: {
      readWorkerToken: async () => token,
      readOwnerToken: async () => ownerToken,
      launch: (options) => { launched.push(options); return Promise.resolve({ exitCode: 0, killed: null, sessionId: "s1", utilization: 0.2, resetsAt: RESETS_AT, status: "allowed", result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: null }, ...(limit ?? {}) }) },
      KILL_REASONS, WORKER_LIMITS,
      questionsInvocation: ({ token: value }) => ({ command: { executable: "claude", args: ["--model", "claude-opus-5-5"] }, environment: { GH_TOKEN: value } }),
      harnessReviewInvocation: ({ token: value }) => ({ command: { executable: "claude", args: ["--model", "claude-opus-5-5", "harness-review"] }, environment: { GH_TOKEN: value } }),
      worktreeOccupants: (worktree) => (calls.push(["occupants", worktree]), occupants),
      logContextTokens, sessionExists: (options) => (calls.push(["sessionExists", options]), sessions),
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
    invocation: async (token, name = "main", own = null, model = undefined) => ({ command: { executable: "claude", args: [] }, environment: { ...(name === "worker" ? { CLAUDE_CONFIG_DIR: WORKER_DIRECTORY } : {}), ...(token ? { GH_TOKEN: token } : {}) }, own, model }),
    git: async (cwd, args) => { calls.push(["git", ...args]); const hit = gitRoutes.find(([text]) => args.join(" ").includes(text)); return hit ? { status: 0, stderr: "", stdout: typeof hit[1] === "function" ? hit[1](args) : hit[1] } : { status: args[0] === "rev-parse" && args.includes("--quiet") ? 1 : 0, stderr: "", stdout: args[0] === "rev-parse" ? HEAD : "" } },
    gh: async (args) => { calls.push(["gh", args.join(" ")]); const hit = routes.find(([text]) => args.join(" ").includes(text)); if (hit) return typeof hit[1] === "function" ? hit[1](args) : hit[1]; if (args[0] === "pr" && args[1] === "list") return "[]"; if (args[0] === "issue") return "[]"; if (args[0] === "api") return "[]"; return "" },
    osascript: async (message) => { calls.push(["notify", message]) },
    fetch: async (url, init) => { calls.push(["fetch", url, init]); return { status: 200, json: async () => ({ ok: true, result: {} }) } },
    findRepositories: (path) => [path],
    dependencies: async (source, target) => { calls.push(["dependencies", source, target]); return dependencies },
    keychain: async () => null,
    fetchJson: async () => ({ body: [], link: null }),
    snapshot: () => null,
    // With no `workerAuth` the second login is the main login, which the driver counts once.
    authStatus: async (name = "main") => structuredClone(name === "worker" ? workerAuth ?? auth : auth),
    processAlive: (pid) => { try { process.kill(pid, 0); return true } catch { return false } },
    pidHeld: (pid) => { try { process.kill(pid, 0); return true } catch { return false } },
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
/** What a park writes for one number: the labels added, the `parked` comments, the `needs-owner` comments and the notifications. */
const parkWrites = (scene, number = 7) => {
  const texts = scene.calls.filter((entry) => entry[0] === "comment" && entry[2] === number).map((entry) => entry[3])
  return [[...new Set(only(scene.calls, "editLabels").flatMap((entry) => entry[3].add))], texts.filter((text) => text.startsWith(marked("parked", ""))).length, texts.filter((text) => text.startsWith(marked("needs-owner", ""))).length, only(scene.calls, "notify").length]
}
const PARKED_ONCE = [["parked"], 1, 0, 0]
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
  same("drive: a launch gives the worker invocation its own working tree and branch", partsScene.launched[0].invocation.own, { worktree: partsScene.launched[0].worktree, branch: "chore/ticket-7-part-1" })
  const secondPart = scenario({ tickets: [ticket(7, { comments: parts })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] } })
  await secondPart.run()
  T("drive: a next part with Paths that overlap no open part PR starts while part 1 is open", secondPart.launched.length === 1 && secondPart.launched[0].worktree.endsWith("chore-ticket-7-part-2"))
  const overlapping = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2, "Paths: apps/web/"), partComment(2, 2, "Paths: apps/web/a.ts")] })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] } })
  await overlapping.run()
  T("drive: a next part whose Paths sit inside an open part's Paths is held", overlapping.launched.length === 0)

  const doubled = [comment(null, "Part 1 of 2: first\n", -7200 * 1000), comment(null, "Part 2 of 2: second\n", -7100 * 1000), comment(null, "Part 2 of 2: second again\n", -7000 * 1000)]
  const doubledScene = scenario({ tickets: [ticket(7, { comments: doubled })] })
  await doubledScene.run()
  const doubledText = commentsOf(doubledScene.calls, 7).find((text) => text.includes("orbit-drive:parked")) ?? ""
  same("drive: two live comments of one part launch nothing and park the ticket with both comment URLs", [doubledScene.launched.length, parkWrites(doubledScene), doubledText.includes(doubled[1].url) && doubledText.includes(doubled[2].url)], [0, PARKED_ONCE, true])
  const openPart = scenario({ tickets: [ticket(7, { comments: doubled })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1" })] } })
  await openPart.run()
  same("drive: a doubled part comment parks no ticket while its pull request is open", parkWrites(openPart), [[], 0, 0, 0])
  const brokenScene = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2), comment(null, "## Part 2 of two: second\n", -7000 * 1000)] })] })
  await brokenScene.run()
  const brokenText = commentsOf(brokenScene.calls, 7).find((text) => text.includes("orbit-drive:parked")) ?? ""
  same("drive: a broken part heading launches no part and no build, and the parked comment quotes the line", [brokenScene.launched.length, parkWrites(brokenScene), brokenText.includes('"## Part 2 of two: second"')], [0, PARKED_ONCE, true])
  const statusScene = scenario({ tickets: [ticket(7, { comments: [partComment(1, 2), partComment(2, 2), comment(null, "## Part 2 is complete (18 November 2026)\n", -7000 * 1000)] })] })
  await statusScene.run()
  same("drive: a status note that starts with Part 2 holds nothing and part 1 starts", [statusScene.launched.length, only(statusScene.calls, "editLabels").length], [1, 0])
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
const BUG_LABELS = ["repo:ui", "Bug", "harness"]

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
  const notice = `Orbit starts no new work on the main account: it used 90% of its week.\nReviews wait until ${new Date(RESETS_AT * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC. Run /over-limit to continue now.\nhttps://github.com/${REPOSITORY}/issues/99`
  same("drive: at 0.90 the driver sends one notification with the issue link and opens one needs:owner issue with the stop text", [only(stopped.calls, "notify").map((entry) => entry[1]), stopIssue?.title, stopIssue?.labels, stopIssue?.body], [[notice], STOP_ISSUE_TITLE, [OWNER_LABEL], message])
  same("drive: at 0.90 the ticket lines and the pull request lines say the stop holds", [stopped.env.lines.filter((line) => line.startsWith(`ticket ${REPOSITORY}#9:`)), stopped.env.lines.find((line) => line.startsWith("pull ui#30"))], [[`ticket ${REPOSITORY}#9: wait: the weekly usage stop holds every worker`], "pull ui#30: wait: the weekly usage stop holds Pullfrog requests"])

  const issue = ticket(60, { title: STOP_ISSUE_TITLE, labels: [OWNER_LABEL], repoKey: null })
  const known = stopScene({ tickets: [ticket(7), ticket(8), ticket(9), issue] })
  await known.run()
  same("drive: an open stop issue gets no second issue and no second notification", [only(known.calls, "createTicket").length, only(known.calls, "notify").length], [0, 0])

  const week = { resetsAt: RESETS_AT, account: ACCOUNT.key }
  const allowed = scenario({ tickets: [ticket(7), ticket(8), issue], reading: { utilization: 0.93, resetsAt: RESETS_AT, at: NOW - MINUTE }, allowance: week })
  await allowed.run()
  same("drive: an allow file of the current week resumes with 1 worker and closes the stop issue with a comment", [allowed.launched.length, only(allowed.calls, "closeTicket"), commentsOf(allowed.calls, 60).map((text) => /allowed use over 90%/.test(text))], [1, [["closeTicket", 60]], [true]])
  const offScene = scenario({ tickets: [ticket(7), ticket(8), issue], reading: { utilization: 0.93, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  writeFileSync(join(offScene.env.stateDir, "pace-setting.json"), `${JSON.stringify({ main: { paced: false }, worker: { paced: true } })}\n`)
  await offScene.run()
  same("drive: the main account pace turned off closes the stop issue with the owner's reason, never a week reset", [offScene.launched.length, only(offScene.calls, "closeTicket"), commentsOf(offScene.calls, 60).map((text) => [/turned the weekly pace of the main account off/.test(text), /week reset/.test(text)])], [2, [["closeTicket", 60]], [[true, false]]])
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
  const slowStop = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [pull(30, { reviews: [] })], api: [pull(31, { reviews: [] })] }, runs: [run], routes: [["--log-failed", logLine]] })
  slowStop.env.planWindowMs = 20
  const listRuns = slowStop.env.github.pullfrogRuns
  slowStop.env.github.pullfrogRuns = async (key) => { if (key === "api") await new Promise((resolve) => setTimeout(resolve, 200)); return listRuns(key) }
  await slowStop.run()
  same("drive: a limit that a slow plan finds admits nothing early, starts no worker and adds no launch comment", [only(slowStop.calls, "createTicket").length, slowStop.launched.length, slowStop.messages.some((line) => line.includes("early-launch"))], [1, 0, false])
  // The limit sits in the plan that ends first, and a slower plan keeps the window open: the pause comes only after every plan ends.
  const mirrorStop = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [pull(30, { reviews: [] })], api: [pull(31, { reviews: [] })] }, runs: [run], routes: [["--log-failed", logLine]] })
  mirrorStop.env.planWindowMs = 20
  const mirrorList = mirrorStop.env.github.pullfrogRuns
  mirrorStop.env.github.pullfrogRuns = async (key) => { if (key === "ui") { await new Promise((resolve) => setTimeout(resolve, 200)); return [] } return mirrorList(key) }
  await mirrorStop.run()
  same("drive: a limit that the second repository plan finds while the first plan runs starts no worker and adds no launch comment", [only(mirrorStop.calls, "createTicket").length, mirrorStop.launched.length, only(mirrorStop.calls, "comment").filter((entry) => entry[1] === "tickets").length], [1, 0, 0])
  const sameRepository = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [pull(30, { reviews: [] }), pull(32, { reviews: [], checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN], headRef: "chore/ticket-7-32" })] }, runs: [run], routes: [["--log-failed", logLine]] })
  sameRepository.env.planWindowMs = 20
  sameRepository.env.github.readFailedSteps = async () => { await new Promise((resolve) => setTimeout(resolve, 200)); return ["Unit tests"] }
  await sameRepository.run()
  same("drive: a limit that one plan finds while a slower plan of the same repository runs starts no worker and adds no launch comment", [only(sameRepository.calls, "createTicket").length, sameRepository.launched.length, only(sameRepository.calls, "comment").filter((entry) => entry[1] === "tickets").length], [1, 0, 0])
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

/** A scenario whose ui repository is a real git repository, so a failed worktree preparation is the failure that git gives. */
const realRepositoryScene = (repo, options) => {
  const scene = scenario(options)
  const fake = scene.env.git
  scene.env.config.repos.ui = repo.path
  scene.env.git = async (cwd, args) => {
    if (!cwd.startsWith(root)) return fake(cwd, args)
    scene.calls.push(["git", ...args])
    return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  }
  return scene
}

/** A repository whose worktree of one pull request branch holds a merge that was never concluded. */
const unconcludedMerge = (label, branch) => {
  const repo = stageRepo(label)
  const worktree = `${repo.path}-worktree`
  for (const [args, cwd] of [
    [["push", "-q", "origin", `main:${branch}`]],
    [["worktree", "add", "-q", "-b", branch, worktree, "main"]],
    [["checkout", "-q", "-b", "side"], worktree],
    [["commit", "-q", "--allow-empty", "-m", "side"], worktree],
    [["checkout", "-q", branch], worktree],
    [["merge", "-q", "--no-commit", "--no-ff", "side"], worktree],
    [["rev-parse", "--verify", "MERGE_HEAD"], worktree],
  ]) T(`drive: unconcluded merge fixture, git ${args.join(" ")}`, repo.git(args, cwd).status === 0)
  return { ...repo, worktree }
}

const unpreparedCases = async () => {
  const branch = "chore/ticket-7-30"
  const finding = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }] })
  const pulls = () => ({ ui: [pull(30, { reviews: [finding] })] })
  const oneSlot = { utilization: 0.6, resetsAt: RESETS_AT, at: NOW - MINUTE }
  const attempts = (scene) => only(scene.calls, "git").filter((entry) => entry.includes("--ff-only")).length

  const repo = unconcludedMerge("unprepared-fix", branch)
  const tickets = [ticket(7)]
  const scene = realRepositoryScene(repo, { tickets, pulls: pulls() })
  keepWrites(scene, tickets)
  let at = NOW
  scene.env.now = () => at
  await scene.run()
  same("drive: a worktree with MERGE_HEAD starts no worker, and its launch counts toward no cap", [attempts(scene), scene.launched.length, launchesOf(tickets[0]).length], [1, 0, 0])
  const told = only(scene.calls, "notify").map((entry) => entry[1])
  T("drive: the owner notice of a failed preparation names the branch, the git error and the ticket", told.length === 1 && told[0].includes(branch) && told[0].includes("MERGE_HEAD exists") && told[0].includes(`${REPOSITORY}/issues/7`), told.join(" | "))
  T("drive: the log of a failed preparation names the branch and the git error on one line", scene.messages.some((line) => line.includes("ticket#7 worktree-failed") && line.includes(branch) && line.includes("MERGE_HEAD exists") && !line.includes("\n")))
  await scene.run()
  same("drive: a branch whose preparation failed waits before the next try", [attempts(scene), scene.launched.length], [1, 0])
  at = NOW + 10 * MINUTE
  await scene.run()
  same("drive: after 10 minutes the preparation runs again, with no second notice, no launch and no needs:owner", [attempts(scene), only(scene.calls, "notify").length, launchesOf(tickets[0]).length, only(scene.calls, "editLabels").length], [2, 1, 0, 0])
  repo.git(["merge", "--abort"], repo.worktree)
  at = NOW + 20 * MINUTE
  const countedAtStart = []
  scene.env.worker.launch = (options) => { scene.launched.push(options); countedAtStart.push(launchesOf(tickets[0]).length); return Promise.resolve(clean) }
  await scene.run()
  same("drive: a prepared worktree starts the worker, and its launch is on the ticket before the start", [scene.launched.map((entry) => entry.worktree), countedAtStart], [[repo.worktree], [1]])
  same("drive: a successful preparation forgets the notice, so a later failure tells the owner again", JSON.parse(readFileSync(join(scene.env.stateDir, "notices.json"), "utf8")).sent.filter((key) => key.startsWith("worktree ")), [])

  const fixSlot = realRepositoryScene(unconcludedMerge("unprepared-fix-slot", branch), { tickets: [ticket(7), ticket(8)], pulls: pulls(), reading: oneSlot })
  await fixSlot.run()
  const first = fixSlot.launched.length
  await fixSlot.run()
  same("drive: a fix order whose preparation failed leaves the only slot to the next order", [first, fixSlot.launched.map((entry) => entry.invocation.own.branch)], [0, ["chore/ticket-8"]])

  const taken = stageRepo("unprepared-build")
  taken.git(["branch", "chore/ticket-7"])
  const buildTickets = [ticket(7), ticket(9)]
  const buildSlot = realRepositoryScene(taken, { tickets: buildTickets, reading: oneSlot })
  keepWrites(buildSlot, buildTickets)
  await buildSlot.run()
  await buildSlot.run()
  same("drive: a build order whose preparation failed counts no launch and leaves the only slot to the next ticket", [launchesOf(buildTickets[0]).length, buildSlot.launched.map((entry) => entry.invocation.own.branch)], [0, ["chore/ticket-9"]])
}

/** The usage line of one assistant record: the context holds 100000 tokens. */
const assistantUsage = (extra = 0) => `${JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 2, cache_creation_input_tokens: 300 + extra, cache_read_input_tokens: 99698 } } })}\n`

const resumeCases = async () => {
  const branch = "chore/ticket-7-30"
  const blocking = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }] })
  const saved = (extra = {}) => comment("launch-session", JSON.stringify({ kind: "build", part: null, branch, pr: 30, session: "sess-1", account: ACCOUNT.key, tokens: 90000, ...extra }))
  const fixScene = (comments, options = {}) => scenario({ tickets: [ticket(7, { comments })], pulls: { ui: [pull(30, { headRef: branch, reviews: [blocking] })] }, ...options })
  const argsOf = (scene) => scene.launched[0]?.invocation.command.args
  const said = (scene, text) => scene.messages.some((line) => line.includes(text))

  const resumed = fixScene([saved()])
  await resumed.run()
  same("drive: a fix launch with a stored session resumes it", argsOf(resumed), ["--resume", "sess-1"])
  T("drive: a resumed fix order holds the new findings and not the ticket or the brief", /## This order \(fix, resumed\)/.test(orderText(resumed)) && /tools\/a\.mjs:3/.test(orderText(resumed)) && !/## Brief/.test(orderText(resumed)) && !/Do the work\./.test(orderText(resumed)), orderText(resumed))
  T("drive: a resume logs fix resume with the session", said(resumed, "ticket#7 fix resume sess-1 (fix, 90000 tokens)"), resumed.messages.join("\n"))
  same("drive: the transcript check reads the config directory of the main account and the worktree of the launch", only(resumed.calls, "sessionExists")[0]?.[1], { configDirectory: "/home/x/.claude", worktree: "/r/orbit-worktrees/ui/chore-ticket-7-30", sessionId: "sess-1" })

  const cold = async (label, comments, options = {}, reason = "") => {
    const scene = fixScene(comments, options)
    await scene.run()
    same(`drive: a fix launch starts cold when ${label}`, [argsOf(scene), /## Brief/.test(orderText(scene)), said(scene, `fix cold start (fix, ${reason}`)], [[], true, true])
  }
  await cold("no session of the branch is recorded", [], {}, "no session of the branch is recorded")
  await cold("the session of another branch is recorded", [saved({ branch: "chore/ticket-7-31" })], {}, "no session of the branch is recorded")
  await cold("the transcript is gone", [saved()], { sessions: false }, "the session transcript is gone")
  await cold("the session holds over 200000 tokens", [saved({ tokens: 200001 })], {}, "the session holds 200001 tokens")
  await cold("the session has no token count", [saved({ tokens: undefined })], {}, "the session holds undefined tokens")
  await cold("the session belongs to another account", [saved({ account: "other-account" })], {}, "the session belongs to another account")
  const atLimit = fixScene([saved({ tokens: 200000 })])
  await atLimit.run()
  same("drive: a session of exactly 200000 tokens resumes", argsOf(atLimit), ["--resume", "sess-1"])
  const newest = fixScene([saved(), saved({ session: "sess-2", kind: "fix" })])
  await newest.run()
  same("drive: the newest session of the branch resumes", argsOf(newest), ["--resume", "sess-2"])

  const ci = scenario({ tickets: [ticket(7, { comments: [saved()] })], pulls: { ui: [pull(30, { headRef: branch, checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] } })
  await ci.run()
  same("drive: a ci-fix launch resumes the session too", [ci.launched.length, argsOf(ci), /## This order \(ci-fix, resumed\)/.test(orderText(ci))], [1, ["--resume", "sess-1"], true])
  const build = scenario({ tickets: [ticket(7, { comments: [saved({ branch: "chore/ticket-7" })] })] })
  await build.run()
  same("drive: a build launch never resumes", argsOf(build), [])

  const onWorker = fixScene([saved({ account: WORKER_ACCOUNT.key })], { workerAuth: WORKER_AUTH, reading: { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - MINUTE }, workerReading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await onWorker.run()
  same("drive: a launch on the worker account looks for the transcript in its own config directory", [onWorker.launched.length, only(onWorker.calls, "sessionExists")[0]?.[1].configDirectory, argsOf(onWorker)], [1, WORKER_DIRECTORY, ["--resume", "sess-1"]])

  const spread = { workerAuth: WORKER_AUTH, reading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE }, workerReading: { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE } }
  const onMain = fixScene([saved()], spread)
  await onMain.run()
  same("drive: a fix launch goes to the account of its build session when that account has a free slot, even when the worker account is free", [onMain.launched.length, accountOfLaunch(onMain.launched[0]), argsOf(onMain)], [1, null, ["--resume", "sess-1"]])
  const backToWorker = fixScene([saved({ account: WORKER_ACCOUNT.key })], spread)
  await backToWorker.run()
  same("drive: a fix launch of a worker account session goes to the worker account", [accountOfLaunch(backToWorker.launched[0]), argsOf(backToWorker)], [WORKER_DIRECTORY, ["--resume", "sess-1"]])
  const full = fixScene([saved()], { ...spread, reading: { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await full.run()
  same("drive: a fix launch starts cold on the worker account when the account of its session has no free slot", [accountOfLaunch(full.launched[0]), argsOf(full), said(full, "fix cold start (fix, the session belongs to another account")], [WORKER_DIRECTORY, [], true])
  const spent = Array.from({ length: 2 }, () => comment("launch", JSON.stringify({ kind: "fix", part: null, branch })))
  const atCap = fixScene([saved(), ...spent], spread)
  await atCap.run()
  same("drive: a fix launch at a cap starts cold on the coordinator model, on the worker account, with its failure history", [atCap.launched[0]?.invocation.model, accountOfLaunch(atCap.launched[0]), argsOf(atCap), /## Earlier launches/.test(orderText(atCap)), /## Brief/.test(orderText(atCap)), said(atCap, "fix cold start (fix, the launch runs claude-opus-5-5")], ["claude-opus-5-5", WORKER_DIRECTORY, [], true, true, true])

  const fresh = fixScene([])
  await fresh.run()
  same("drive: a new worktree gets its dependencies from the main checkout before the worker starts", [only(fresh.calls, "dependencies"), fresh.launched.length], [[["dependencies", "/r/ui", "/r/orbit-worktrees/ui/chore-ticket-7-30"]], 1])
  T("drive: the clone logs worktree deps clone with its time", said(fresh, "ticket#7 worktree deps clone (40 ms, 2 directories)"), fresh.messages.join("\n"))
  const order = fresh.calls.findIndex((entry) => entry[0] === "dependencies")
  T("drive: the dependencies are in place after the worktree is added", fresh.calls.findIndex((entry) => entry[0] === "git" && entry.includes("worktree") && entry.includes("add")) < order)
  const listed = fixScene([], { gitRoutes: [["worktree list", `worktree /r/wt\nHEAD ${HEAD}\nbranch refs/heads/${branch}\n`]] })
  await listed.run()
  same("drive: a worktree that exists already gets no dependency step", [only(listed.calls, "dependencies").length, listed.launched.length], [0, 1])
  const install = scenario({ tickets: [ticket(7)], dependencies: { action: "install", ms: 90000, directories: [""], reason: "the lock file differs from the main checkout" } })
  await install.run()
  T("drive: a different lock file logs worktree deps install", said(install, "ticket#7 worktree deps install (90000 ms, the lock file differs from the main checkout)"), install.messages.join("\n"))
  const failed = scenario({ tickets: [ticket(7)], dependencies: { action: "failed", ms: 5, directories: [], reason: "npm ci exit 1: boom" } })
  await failed.run()
  same("drive: a failed dependency step logs and the worker still starts", [failed.launched.length, said(failed, "ticket#7 worktree deps failed (5 ms, npm ci exit 1: boom)")], [1, true])
  const none = scenario({ tickets: [ticket(7)], dependencies: { action: "none", ms: 0, directories: [], reason: "no lock file" } })
  await none.run()
  same("drive: a repository with no lock file logs no dependency event", none.messages.some((line) => line.includes("worktree deps")), false)

  const recorder = (log) => {
    const scene = scenario({ tickets: [ticket(7)] })
    scene.env.worker.launch = (options) => { writeFileSync(options.logFile, log); return Promise.resolve(clean) }
    return scene
  }
  const used = recorder(assistantUsage() + assistantUsage(1000) + resultLine("done"))
  await used.run()
  await used.run()
  const written = commentsOf(used.calls, 7).filter((text) => text.includes("orbit-drive:launch-session"))
  same("drive: a worker exit records its session and the context of its last message on the ticket", [written.length, JSON.parse(written[0]?.split("\n")[1] ?? "{}")], [1, { kind: "build", part: null, branch: "chore/ticket-7", pr: null, session: "s1", account: ACCOUNT.key, tokens: 101000 }])
  const silent = recorder(resultLine("done"))
  await silent.run()
  await silent.run()
  same("drive: a worker log with no usage records no session", commentsOf(silent.calls, 7).filter((text) => text.includes("launch-session")).length, 0)
}

const capCases = async () => {
  const launched = (kind, count, branch = "chore/ticket-7", part = null) => Array.from({ length: count }, () => comment("launch", JSON.stringify({ kind, part, branch })))
  const second = scenario({ tickets: [ticket(7, { comments: launched("build", 1) })] })
  await second.run()
  same("drive: the second launch of an order runs", second.launched.length, 1)
  const third = scenario({ tickets: [ticket(7, { comments: launched("build", 2) })] })
  await third.run()
  const launchRecordOf = (scene, number = 7) => commentsOf(scene.calls, number).filter((text) => text.startsWith("<!-- orbit-drive:launch -->")).map((text) => JSON.parse(text.split("\n")[1]))
  const noOwnerWrites = (scene) => [only(scene.calls, "editLabels").length, only(scene.calls, "notify").length, commentsOf(scene.calls, 7).filter((text) => text.includes("needs-owner")).length, scene.messages.filter((line) => line.includes("sleep held")).length]
  same("drive: the third launch of a build order runs on the coordinator model, and its record, invocation and log line name it", [third.launched.length, third.launched[0]?.invocation.model, launchRecordOf(third).map((entry) => entry.model), third.messages.some((line) => line.includes("launch build model claude-opus-5-5")), noOwnerWrites(third)], [1, "claude-opus-5-5", ["claude-opus-5-5"], true, [0, 0, 0, 0]])
  same("drive: the second launch of an order stays on the worker model and its record names it", [second.launched[0]?.invocation.model, launchRecordOf(second).map((entry) => entry.model), second.messages.some((line) => line.includes("launch build model claude-sonnet-5-5"))], ["claude-sonnet-5-5", ["claude-sonnet-5-5"], true])
  const opusBuild = comment("launch", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7", model: "claude-opus-5-5" }))
  const afterOpus = scenario({ tickets: [ticket(7, { comments: [...launched("build", 2), opusBuild] })], dryRun: true })
  const afterOpusLines = []
  afterOpus.env.log = (line) => afterOpusLines.push(line)
  await afterOpus.run()
  same("drive: a build order whose Opus launch ran plans one re-plan run on the coordinator model, with no write in a dry run", [afterOpus.launched.length, afterOpusLines.find((line) => line.startsWith("ticket ") && line.includes("#7:"))?.split("#7: ")[1], afterOpus.calls.filter((entry) => ["comment", "editLabels", "notify"].includes(entry[0])).length], [0, "admit replan on chore/ticket-7-replan on claude-opus-5-5", 0])
  const fixReview = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }, { path: "tools/b.mjs", line: 9, body: "BLOCKING: two" }] })
  const capped = scenario({ tickets: [ticket(7, { comments: [...launched("fix", 1, "chore/ticket-7-30"), ...launched("ci-fix", 1, "chore/ticket-7-30")] })], pulls: { ui: [pull(30, { reviews: [fixReview] })] } })
  await capped.run()
  same("drive: the third fix launch on one pull request runs on the coordinator model with no label, notice or needs-owner comment", [capped.launched.length, capped.launched[0]?.invocation.model, launchRecordOf(capped).map((entry) => entry.model), noOwnerWrites(capped), capped.launched[0]?.order.includes("tools/a.mjs:3") && capped.launched[0]?.order.includes("tools/b.mjs:9")], [1, "claude-opus-5-5", ["claude-opus-5-5"], [0, 0, 0, 0], true])
  const opusFix = comment("launch", JSON.stringify({ kind: "fix", part: null, branch: "chore/ticket-7-30", model: "claude-opus-5-5" }))
  const afterOpusFix = scenario({ tickets: [ticket(7, { comments: [...launched("fix", 2, "chore/ticket-7-30"), opusFix] })], pulls: { ui: [pull(30, { reviews: [fixReview] })] }, dryRun: true })
  const afterOpusFixLines = []
  afterOpusFix.env.log = (line) => afterOpusFixLines.push(line)
  await afterOpusFix.run()
  T("drive: a fix whose Opus launch ran plans one re-plan run on the coordinator model, with no write in a dry run", afterOpusFix.launched.length === 0 && afterOpusFixLines.some((line) => line.startsWith("pull ui#30:") && line.includes("order replan on claude-opus-5-5")) && afterOpusFix.calls.filter((entry) => ["comment", "editLabels", "notify"].includes(entry[0])).length === 0)
  const refunded = scenario({ tickets: [ticket(7, { comments: [...launched("fix", 2, "chore/ticket-7-30"), opusFix, comment("launch-refund", JSON.stringify({ kind: "fix", part: null, branch: "chore/ticket-7-30", pr: 30 }))] })], pulls: { ui: [pull(30, { reviews: [fixReview] })] } })
  await refunded.run()
  same("drive: a refunded Opus launch is no Opus launch, so the capped pull request gets its Opus launch again", [refunded.launched.length, refunded.launched[0]?.invocation.model], [1, "claude-opus-5-5"])
  const healthy = scenario({ tickets: [ticket(7, { comments: launched("fix", 1, "chore/ticket-7-30") })], pulls: { ui: [pull(30, { reviews: [fixReview] })] } })
  await healthy.run()
  T("drive: below the cap a fix launch runs on the worker model and its order holds no earlier launches", healthy.launched[0]?.invocation.model === "claude-sonnet-5-5" && !healthy.launched[0].order.includes("## Earlier launches"))
  // The history of the Opus order comes from the facts files that the earlier launches wrote.
  const earlier = (name, extra) => ({ kind: "fix", part: null, branch: "chore/ticket-7-30", model: "claude-sonnet-5-5", log: name, ...extra })
  const history = scenario({ tickets: [ticket(7, { comments: [comment("launch", JSON.stringify(earlier("fix-old", { at: "2026-11-19T09:00:00.000Z" }))), comment("launch", JSON.stringify(earlier("ci-new", { kind: "ci-fix", at: "2026-11-19T10:00:00.000Z" })))] })], pulls: { ui: [pull(30, { reviews: [fixReview] })] } })
  const logs = join(history.env.stateDir, "logs")
  writeFileSync(join(logs, "fix-old.facts.json"), JSON.stringify({ kind: "fix", model: "claude-sonnet-5-5", at: "2026-11-19T09:00:00.000Z", headBefore: "1".repeat(40), headAfter: "2".repeat(40), exitCode: 1, killReason: null, blocking: [{ path: "tools/old.mjs", line: 5, body: "BLOCKING: OLD-FINDING" }], checks: [] }))
  writeFileSync(join(logs, "fix-old.log"), resultLine("OLD-RESULT-TEXT"))
  writeFileSync(join(logs, "ci-new.facts.json"), JSON.stringify({ kind: "ci-fix", model: "claude-sonnet-5-5", at: "2026-11-19T10:00:00.000Z", headBefore: "2".repeat(40), headAfter: "3".repeat(40), exitCode: null, killReason: "made no progress", blocking: [], checks: [{ name: "Unit Tests", failedSteps: ["Run tests"], logLines: ["NEW-CHECK-LOG-LINE"] }] }))
  writeFileSync(join(logs, "ci-new.log"), resultLine("NEW-RESULT-TEXT"))
  await history.run()
  const opusOrder = history.launched[0]?.order ?? ""
  const section = opusOrder.slice(opusOrder.indexOf("## Earlier launches"), opusOrder.indexOf("## Brief"))
  T("drive: the Opus order holds each earlier launch, newest first, with its model, exit, findings or failing checks and its result", history.launched.length === 1 && opusOrder.includes("## Earlier launches") && section.indexOf("ci-fix on claude-sonnet-5-5") >= 0 && section.indexOf("ci-fix on claude-sonnet-5-5") < section.indexOf("fix on claude-sonnet-5-5, started 2026-11-19T09") && section.includes("killed: made no progress") && section.includes("Unit Tests (failed steps: Run tests)") && section.includes("NEW-CHECK-LOG-LINE") && section.includes("Exit: 1.") && section.includes("tools/old.mjs:5: BLOCKING: OLD-FINDING") && section.includes("OLD-RESULT-TEXT") && section.includes("NEW-RESULT-TEXT") && section.includes(`${"1".repeat(40)} to ${"2".repeat(40)}`) && section.includes("The launches above failed. Find why before you change code."), section)
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
  T("drive: a capped pull request with a body finding gets its Opus launch, and the order names the review body", bodyCap.launched.length === 1 && bodyCap.launched[0].order.includes("the review body") && needsOwnerComments(bodyCap.calls, 7).length === 0)

  const branch = "chore/ticket-7-30"
  const finding = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }] })
  const launches = [launchComment("fix", branch, -90 * MINUTE), launchComment("fix", branch, -80 * MINUTE)]
  const answered = scenario({ tickets: [ticket(7, { comments: [...launches, comment(null, "Use the second option for the label.", -30 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await answered.run()
  same("drive: an owner comment after the cap grants no launch of its own: the capped pull request gets one Opus launch and no label", [answered.launched.length, answered.launched[0]?.invocation.model, answered.launched[0]?.order.includes("Use the second option for the label."), only(answered.calls, "editLabels").length], [1, "claude-opus-5-5", false, 0])
  const opus = launchComment("fix", branch, -20 * MINUTE, null, { model: "claude-opus-5-5" })
  same("drive: the Opus launch fixture reads back as one launch record with its model", launchesOf(ticket(7, { comments: [opus] })), [{ kind: "fix", part: null, branch, model: "claude-opus-5-5" }])
  const spent = scenario({ tickets: [ticket(7, { comments: [...launches, opus, comment(null, "One more try.", -10 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await spent.run()
  same("drive: after the Opus launch an owner comment grants no launch: the re-plan run starts, with no label and no notice", [spent.launched.length, spent.launched[0]?.invocation.model, only(spent.calls, "editLabels").length, only(spent.calls, "notify").length, spent.launched[0]?.order.includes("One more try.")], [1, "claude-opus-5-5", 0, 0, false])

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
  same("drive: a COMMENTED review with no BLOCKING gets no second plain request and parks the ticket", [commentsOf(first.calls, 30).length, parkWrites(first)], [0, PARKED_ONCE])
  const second = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [commented(), review(CHANGES_REQUESTED, HEAD, -1 * MINUTE)], comments: [comment("ticket", "T")] })] } })
  await second.run()
  same("drive: a second review with no BLOCKING parks the ticket", [commentsOf(second.calls, 30).length, parkWrites(second)], [0, PARKED_ONCE])

  // Pullfrog edits the body of a review after it submits it, so a review whose run is not settled waits.
  const unsettledPull = (run) => scenario({ tickets: [ticket(7)], runs: [run], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE)], comments: [comment("ticket", "T")] })] } })
  const inProgress = unsettledPull(pullfrogRun(5, -6 * MINUTE, -1 * MINUTE, "in_progress"))
  await inProgress.run()
  same("drive: a CHANGES_REQUESTED review with no finding whose run is in progress waits and gives no needs:owner", [commentsOf(inProgress.calls, 30).length, only(inProgress.calls, "editLabels").length, inProgress.launched.length], [0, 0, 0])
  const justDone = unsettledPull(pullfrogRun(5, -6 * MINUTE, -2 * MINUTE))
  await justDone.run()
  same("drive: a CHANGES_REQUESTED review with no finding whose run completed less than the settle time ago waits and gives no needs:owner", [commentsOf(justDone.calls, 30).length, only(justDone.calls, "editLabels").length, justDone.launched.length], [0, 0, 0])
  const settled = unsettledPull(pullfrogRun(5, -16 * MINUTE, -12 * MINUTE))
  await settled.run()
  same("drive: a CHANGES_REQUESTED review with no finding whose run settled parks the ticket", [commentsOf(settled.calls, 30).length, parkWrites(settled)], [0, PARKED_ONCE])
  const edited = scenario({ tickets: [ticket(7)], runs: [pullfrogRun(5, -16 * MINUTE, -12 * MINUTE)], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [blocking("a.mjs", 1)] })], comments: [comment("ticket", "T")] })] } })
  await edited.run()
  T("drive: a review that gets its BLOCKING line by an edit in its run gives a fix order and no needs:owner", edited.launched.length === 1 && only(edited.calls, "editLabels").length === 0)
  const findingPull = (run) => scenario({ tickets: [ticket(7)], runs: [run], pulls: { ui: [pull(30, { reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [blocking("a.mjs", 1)] })], comments: [comment("ticket", "T")] })] } })
  const findingInProgress = findingPull(pullfrogRun(5, -6 * MINUTE, -1 * MINUTE, "in_progress"))
  await findingInProgress.run()
  same("drive: a CHANGES_REQUESTED review with a finding whose run is in progress gives no fix order", [findingInProgress.launched.length, only(findingInProgress.calls, "editLabels").length], [0, 0])
  const findingJustDone = findingPull(pullfrogRun(5, -6 * MINUTE, -2 * MINUTE))
  await findingJustDone.run()
  same("drive: a CHANGES_REQUESTED review with a finding whose run completed less than the settle time ago gives no fix order", [findingJustDone.launched.length, only(findingJustDone.calls, "editLabels").length], [0, 0])

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
  same("drive: a second miss parks the ticket", [commentsOf(secondMiss.calls, 30).length, parkWrites(secondMiss)], [0, PARKED_ONCE])

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
  same("drive: a pull request that changes Cargo.lock gets the whole-diff request", await owed("cargo", { files: ["apps/desktop/src-tauri/Cargo.lock"] }), [`${PLAIN} whole diff`])
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

/** One review per head: a repeat at the same head, a clean merge of the base that keeps the diff, and a fix round. */
const reviewOnceCases = async () => {
  const NEW_HEAD = "e".repeat(40)
  const diffOf = (blob, line, body) => `diff --git a/x b/x\nindex ${blob}..${blob}1 100644\n--- a/x\n+++ b/x\n@@ -${line},1 +${line},1 @@\n-old\n+${body}\n`
  // The head after a merge of the base: other blob ids and other line numbers, the same change.
  // The key holds --binary: the own diff of a head is read with the context lines and the content of a binary file.
  const diffRoute = (approvedDiff, headDiff) => ["--binary", (args) => (args.at(-1).endsWith(NEW_HEAD) ? headDiff : approvedDiff)]
  const merged = (diffs, extra = {}) => scenario({ tickets: [ticket(7)], gitRoutes: [diffRoute(...diffs)], pulls: { ui: [pull(30, { headSha: NEW_HEAD, commits: [{ sha: HEAD, parents: 1 }, { sha: NEW_HEAD, parents: 2 }], reviews: [review("APPROVED", HEAD, -40 * MINUTE)], comments: [comment("ticket", "T"), comment("request", PLAIN, -50 * MINUTE)], ...extra })] } })
  const skipLines = (scene) => scene.messages.filter((line) => line.includes("review skip"))

  const sameDiff = merged([diffOf("111", 10, "new"), diffOf("222", 42, "new")])
  await sameDiff.run()
  same("drive: a clean merge of the base that keeps the diff of the approval asks for no review and merges", [commentsOf(sameDiff.calls, 30).length, only(sameDiff.calls, "merge").length, skipLines(sameDiff).map((line) => line.slice(line.indexOf("ui#30")))], [0, 1, ["ui#30 review skip (same diff)"]])
  const changed = merged([diffOf("111", 10, "new"), diffOf("222", 10, "other")])
  await changed.run()
  same("drive: a merge of the base that changes the diff of the approval asks for a new review", [commentsOf(changed.calls, 30).map((text) => text.split("\n")[1]), only(changed.calls, "merge").length, skipLines(changed).length], [[PLAIN], 0, 0])
  // A change that moves inside a file keeps its text and its context lines differ; a binary file that changes keeps its marker line and its payload differs.
  const placed = (context, blob, payload) => `diff --git a/x.txt b/x.txt\nindex ${blob}..${blob}1 100644\n--- a/x.txt\n+++ b/x.txt\n@@ -1,7 +1,8 @@\n ${context}\n+setup()\n ${context}\ndiff --git a/img.bin b/img.bin\nindex ${blob}..${blob}2 100644\nGIT binary patch\nliteral 4\n${payload}\n`
  const moved = merged([placed("line9", "111", "v1"), placed("line19", "222", "v1")])
  await moved.run()
  same("drive: a change that moves inside a file does not carry the approval", [commentsOf(moved.calls, 30).map((text) => text.split("\n")[1]), only(moved.calls, "merge").length, skipLines(moved).length], [[PLAIN], 0, 0])
  const rebinary = merged([placed("line9", "111", "v1"), placed("line9", "222", "v2")])
  await rebinary.run()
  same("drive: a binary file with other content does not carry the approval", [commentsOf(rebinary.calls, 30).map((text) => text.split("\n")[1]), only(rebinary.calls, "merge").length], [[PLAIN], 0])
  const rebased = merged([placed("line9", "111", "v1"), placed("line9", "222", "v1")])
  await rebased.run()
  same("drive: the same change with other blob ids carries the approval", [commentsOf(rebased.calls, 30).length, only(rebased.calls, "merge").length], [0, 1])
  const diffCalls = sameDiff.calls.filter((call) => call[0] === "git" && call[1] === "diff")
  same("drive: the own diff is read with the context lines and the binary content", [diffCalls.length > 0, diffCalls.every((call) => call.includes("--binary") && !call.includes("-U0"))], [true, true])
  const unknown = merged(["", ""])
  await unknown.run()
  same("drive: a diff that git cannot show carries no approval", [commentsOf(unknown.calls, 30).map((text) => text.split("\n")[1]), only(unknown.calls, "merge").length], [[PLAIN], 0])
  const wholeCarried = merged([diffOf("111", 10, "new"), diffOf("222", 42, "new")], { changedFiles: 40, reviews: [review("APPROVED", HEAD, -40 * MINUTE, { body: "Whole diff: clean" })], comments: [comment("ticket", "T"), comment("request", `${PLAIN} whole diff`, -50 * MINUTE)] })
  await wholeCarried.run()
  same("drive: a whole-diff approval carries to a head with the same diff", [commentsOf(wholeCarried.calls, 30).length, only(wholeCarried.calls, "merge").length], [0, 1])

  const sameHead = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("COMMENTED", HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })], comments: [comment("ticket", "T")] })] } })
  await sameHead.run()
  same("drive: a head that has a review gets no plain request and the driver logs the skip", [commentsOf(sameHead.calls, 30).length, skipLines(sameHead).map((line) => line.slice(line.indexOf("ui#30")).replace(/ \(Pullfrog.*$/, ""))], [0, ["ui#30 review skip (same head)"]])

  const repeatHead = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("COMMENTED", HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })], comments: [comment("ticket", "T")] })] } })
  for (let index = 0; index < 3; index += 1) await repeatHead.run()
  same("drive: a review skip that holds on 3 ticks logs one line", skipLines(repeatHead).length, 1)
  const newHeadPull = pull(30, { reviews: [review("COMMENTED", HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })], comments: [comment("ticket", "T")] })
  const newHead = scenario({ tickets: [ticket(7)], pulls: { ui: [newHeadPull] } })
  await newHead.run()
  await newHead.run()
  Object.assign(newHeadPull, { headSha: NEW_HEAD, commits: [{ sha: NEW_HEAD, parents: 1 }], reviews: [review("COMMENTED", NEW_HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })] })
  await newHead.run()
  await newHead.run()
  same("drive: a review skip at a new head logs a new line", skipLines(newHead).length, 2)
  const carried = merged([diffOf("111", 10, "new"), diffOf("222", 42, "new")], { labels: [OWNER_LABEL] })
  for (let index = 0; index < 3; index += 1) await carried.run()
  same("drive: a carried approval that waits on 3 ticks logs one review skip line", [only(carried.calls, "merge").length, skipLines(carried).length], [0, 1])

  const fixLaunch = comment("launch", JSON.stringify({ kind: "fix", part: null, branch: "chore/ticket-7-30" }))
  const fixRound = scenario({ tickets: [ticket(7, { comments: [fixLaunch] })], pulls: { ui: [pull(30, { reviews: [], comments: [comment("ticket", "T")] })] } })
  await fixRound.run()
  same("drive: the first request at the head of a fix round is one whole-diff request", commentsOf(fixRound.calls, 30).map((text) => text.split("\n")[1]), [`${PLAIN} whole diff`])
  const fixAnswered = scenario({ tickets: [ticket(7, { comments: [fixLaunch] })], pulls: { ui: [pull(30, { reviews: [review("APPROVED", HEAD, -5 * MINUTE, { body: "> Whole diff: clean" })], comments: [comment("ticket", "T"), comment("request", `${PLAIN} whole diff`, -10 * MINUTE)] })] } })
  await fixAnswered.run()
  same("drive: the whole-diff review of a fix round answers it with no second request and merges", [commentsOf(fixAnswered.calls, 30).length, only(fixAnswered.calls, "merge").length], [0, 1])
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
  same("drive: a second miss at the same head parks the ticket and sends no request", [commentsOf(owner.calls, 30).filter((text) => text.includes("request")).length, parkWrites(owner)], [0, PARKED_ONCE])
  const other = await run({ reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)], comments: [comment("ticket", "T"), checkRecord("8".repeat(40), -80 * MINUTE), checkRecord("8".repeat(40), -40 * MINUTE)] })
  same("drive: the check requests of an older head do not count against a new head", texts(other), asked)
  const unchecked = pull(30, { headSha: RECORDED_HEAD, mergeState: "BLOCKED", checks: [check("Unit Tests")], reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)], comments: [comment("ticket", "T")] })
  const stale = scenario({ tickets: [ticket(7)], pulls: { ui: [unchecked] } })
  await stale.run()
  same("drive: a head with no approval check gets the check request and no branch update", [only(stale.calls, "updateBranch").length, texts(stale)], [0, asked])
  const red = await run({ checks: [check("Unit Tests", "FAILURE")] })
  same("drive: a red check gets no check-only request", commentsOf(red.calls, 30).filter((text) => text.includes("request")).length, 0)
  const labelled = await run({ labels: [OWNER_LABEL], reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] })
  same("drive: a needs:owner pull request gets no check-only request", commentsOf(labelled.calls, 30).length, 0)
}

const heldPullCases = async () => {
  const held = async ({ extra = {}, runs = [runOf("in_progress", 1, 0)], tickets = [ticket(7)], sleeping = false } = {}) => {
    const stateDirectory = join(root, `drive-held-${++scenarios}`)
    mkdirSync(stateDirectory, { recursive: true })
    const scene = scenario({ tickets, runs, stateDirectory, sleeping, pulls: { ui: [withoutApprovalCheck(extra)] } })
    await scene.run()
    return scene
  }
  const fixBranch = "chore/ticket-7-30"
  const opusSpent = [launchComment("fix", fixBranch, -300 * MINUTE), launchComment("fix", fixBranch, -200 * MINUTE), launchComment("fix", fixBranch, -100 * MINUTE, null, { model: "claude-opus-5-5" })]
  const blocking = { reviews: [review(CHANGES_REQUESTED, RECORDED_HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }] })] }
  const replanWait = await held({ runs: [], tickets: [ticket(7, { comments: opusSpent })], extra: blocking })
  same("drive: a capped pull request whose ladder ended starts the re-plan run, and it writes no notice, no label and no sleep line", [only(replanWait.calls, "notify").length, only(replanWait.calls, "editLabels").length, replanWait.messages.filter((line) => line.includes("sleep held")).length, replanWait.launched.length], [0, 0, 0, 1])
  const replanAsleep = await held({ runs: [], sleeping: true, tickets: [ticket(7, { comments: opusSpent })], extra: blocking })
  same("drive: while sleep is on, a pull request whose ladder ended holds no sleep item", replanAsleep.messages.filter((line) => line.includes("sleep held")).length, 0)
  const parked = await held({ runs: [], tickets: [ticket(7, { labels: ["repo:ui", "Improvement", "parked"], comments: opusSpent })], extra: blocking })
  same("drive: a parked pull request gets no launch and writes nothing", [parked.launched.length, only(parked.calls, "comment").length, only(parked.calls, "notify").length], [0, 0, 0])
  const merging = await held({ runs: [], extra: { checks: [check("Unit Tests"), approvalCheck()], mergeState: "CLEAN", reviews: [review("APPROVED", RECORDED_HEAD, -40 * MINUTE)] } })
  same("drive: a pull request that meets the bar merges once", only(merging.calls, "merge").length, 1)
}

/** A saved release train with the mobile steps in the given states, as `release-train.json` keeps it. */
const trainFile = (states, { status = "running", mobile = { appVersion: "1.3.161", sha: "6c925e9c4".padEnd(40, "0"), stagingCode: 1, productionCode: 2 } } = {}) => ({
  train: { id: "2026-11-26T08:07:24.444Z", status, mobile, steps: [["android", "staging"], ["ios", "staging"], ["android", "production"], ["ios", "production"]].map(([kind, environment], index) => ({ id: `${kind}-${environment}`, kind, service: kind, environment, state: states[index] })) },
  lastEndedAt: null, lastPlanAt: null, requested: false,
})

const trainMergeCases = async () => {
  const merged = async (label, file, { repo = "ui" } = {}) => {
    const pulls = { ui: [], api: [], landing: [] }
    pulls[repo] = [pull(30)]
    const scene = scenario({ tickets: [ticket(7, { labels: [`repo:${repo}`, "Improvement"], repoKey: repo })], pulls })
    if (file !== null) writeFileSync(join(scene.env.stateDir, "release-train.json"), `${JSON.stringify(file)}\n`)
    await scene.run()
    same(`drive: ${label}`, [only(scene.calls, "merge").length, scene.messages.filter((line) => line.includes("merge held")).length], [1, 0])
  }
  await merged("a ui merge runs while the train has an Android step that is not dispatched", trainFile(["verified", "verified", "dispatched", "pending"]))
  await merged("a ui merge runs while the first mobile step is still pending", trainFile(["pending", "pending", "pending", "pending"]))
  await merged("a ui merge runs while a mobile step is dispatching", trainFile(["verified", "verified", "verified", "dispatching"]))
  await merged("a ui merge runs when the last mobile production step is dispatched", trainFile(["verified", "verified", "verified", "dispatched"]))
  await merged("a ui merge runs when the train stopped", trainFile(["verified", "failed", "pending", "pending"], { status: "stopped" }))
  await merged("a ui merge runs when no train state exists", null)
  await merged("an api merge runs while a train has mobile steps that are not dispatched", trainFile(["verified", "verified", "dispatched", "pending"]), { repo: "api" })
  await merged("a landing merge runs while a train has mobile steps that are not dispatched", trainFile(["verified", "verified", "dispatched", "pending"]), { repo: "landing" })
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

  const dependabot = (types, options = {}) => { const scene = scenario({ ...options, tickets: [], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x" })] } }); scene.env.github.readDependabotUpdateTypes = async () => types; return scene }
  const patch = dependabot(["patch"])
  await patch.run()
  same("drive: a Dependabot patch merges", only(patch.calls, "merge").length, 1)
  const major = dependabot(["major"])
  await major.run()
  same("drive: a Dependabot major parks the pull request and does not merge", [only(major.calls, "merge").length, parkWrites(major, 30)], [0, PARKED_ONCE])
  const majorDry = dependabot(["major"], { dryRun: true })
  const majorDryTick = await majorDry.run()
  same("drive: a dry run names the park with its reason and writes nothing", [majorDryTick.lines.filter((line) => line.startsWith("pull ui#30:")), parkWrites(majorDry, 30)], [["pull ui#30: park: Dependabot pull request ui#30 is a major update"], [[], 0, 0, 0]])

  const red = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL], checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] } })
  await red.run()
  same("drive: a needs:owner pull request with a red check gets a ci-fix order and no merge", [red.launched.length, only(red.calls, "merge").length, /ci-fix/.test(orderText(red))], [1, 0, true])
  const blocked = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL], reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] } })
  await blocked.run()
  same("drive: a needs:owner pull request with a BLOCKING review gets a fix order and no merge", [blocked.launched.length, only(blocked.calls, "merge").length], [1, 0])
  const met = scenario({ tickets: [ticket(7, { labels: ["repo:ui", OWNER_LABEL] })], pulls: { ui: [pull(30, { labels: [OWNER_LABEL] })] } })
  await met.run()
  same("drive: a needs:owner pull request whose bar is otherwise met gets no merge and no order", [only(met.calls, "merge").length, met.launched.length], [0, 0])

  // The order of an open part pull request names no part to build, so two live comments of one part never reach the worker as "this order".
  const doubledParts = [comment(null, "Part 1 of 2: first\n", -7200 * 1000), comment(null, "Part 2 of 2: second\nBODY-OF-SECOND\n", -7100 * 1000), comment(null, "Part 2 of 2: second again\nBODY-OF-AGAIN\n", -7000 * 1000)]
  const partPull = (extra) => pull(30, { headRef: "chore/ticket-7-part-2", ...extra })
  const orderKinds = {
    "ci-fix": partPull({ checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] }),
    fix: partPull({ reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] }),
    "merge-forward": partPull({ mergeState: "DIRTY" }),
  }
  for (const [kind, open] of Object.entries(orderKinds)) {
    const scene = scenario({ tickets: [ticket(7, { comments: doubledParts })], pulls: { ui: [open] }, ...(kind === "ci-fix" ? { failedSteps: ["Unit tests"], routes: [["--log-failed", "AssertionError: expected 1 to be 2\n"]] } : {}) })
    await scene.run()
    const order = orderText(scene)
    same(`drive: a ${kind} order on a part pull request with two live comments of one part has no "this order" part and no part body`, [scene.launched.length, order.includes("(this order)"), order.includes("BODY-OF-SECOND") || order.includes("BODY-OF-AGAIN"), order.includes("- Part 2 of 2: second again")], [1, false, false, true])
  }
}

const updateCases = async () => {
  // A pull request that main passed has no conflict, so no push from the driver reruns its checks.
  const passed = (number, extra = {}) => pull(number, { mergeState: "CLEAN", behindBy: 2, ...extra })
  const scene = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [passed(31, { body: "Tracks thomasluizon/orbit-tickets#8", tracks: 8 }), passed(30)] } })
  await scene.run()
  same("drive: a pull request that is behind main with no conflict is merged and never updated", [only(scene.calls, "updateBranch"), only(scene.calls, "merge").map((entry) => entry[2])], [[], [30, 31]])
  const ready = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(32), pull(30), pull(31)] } })
  await ready.run()
  same("drive: a tick with 3 ready pull requests merges all 3, oldest first", only(ready.calls, "merge").map((entry) => entry.slice(1, 4)), [["ui", 30, HEAD], ["ui", 31, HEAD], ["ui", 32, HEAD]])
  const reportedBehind = scenario({ tickets: [ticket(7)], pulls: { ui: [passed(30, { mergeState: "BEHIND" })] } })
  await reportedBehind.run()
  same("drive: a pull request with merge-state BEHIND is never updated by the driver", [only(reportedBehind.calls, "updateBranch"), only(reportedBehind.calls, "merge")], [[], []])
  const conflicted = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await conflicted.run()
  same("drive: a pull request with a conflict gets a merge-forward order and no driver update", [only(conflicted.calls, "updateBranch"), conflicted.launched.map((entry) => entry.order.includes("Merge `origin/main` into the branch and resolve the conflicts"))], [[], [true]])
  // The cap is spent, with its coordinator-model launch, so only the merge-forward rule can still give an order.
  const fixes = [launchComment("fix", "chore/ticket-7-30", -90 * MINUTE), launchComment("fix", "chore/ticket-7-30", -80 * MINUTE, null, { model: "claude-opus-5-5" })]
  const forwarded = scenario({ tickets: [ticket(7, { comments: fixes })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await forwarded.run()
  same("drive: a pull request with 2 fix launches and a new conflict gets a merge-forward order and no needs:owner", [forwarded.launched.length, forwarded.launched[0]?.order.includes("Merge `origin/main` into the branch and resolve the conflicts"), only(forwarded.calls, "editLabels").length], [1, true, 0])
  const forwardLaunch = JSON.parse(commentsOf(forwarded.calls, 7).find((entry) => entry.startsWith("<!-- orbit-drive:launch -->")).split("\n")[1])
  same("drive: the merge-forward launch mark holds its kind and the head that it ran at", [forwardLaunch.kind, forwardLaunch.baseMerge], ["merge-forward", HEAD])
  const forwardMark = (head) => comment("launch", JSON.stringify({ kind: "merge-forward", part: null, branch: "chore/ticket-7-30", baseMerge: head }))
  const spent = scenario({ tickets: [ticket(7, { comments: [...fixes, forwardMark(HEAD)] })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await spent.run()
  same("drive: a conflict that stays after the merge-forward launch at the same head gets needs:owner and no second launch", [spent.launched.length, only(spent.calls, "editLabels").length], [0, 1])
  const older = scenario({ tickets: [ticket(7, { comments: [...fixes, forwardMark("0".repeat(40))] })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await older.run()
  same("drive: a merge-forward launch at an older head does not stop a new merge-forward order", [older.launched.length, only(older.calls, "editLabels").length], [1, 0])
  const conflictReport = (offset, head = HEAD, count = 1) => comment("needs-owner", `ui#30 at ${head}: ui#30 still conflicts with the base branch after a merge-forward launch at this head. Launches: ${count}. Open: merge conflict with the base branch`, offset)
  const stuckForward = (...later) => scenario({ tickets: [ticket(7, { comments: [...fixes, forwardMark(HEAD), ...later] })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  const forwardReport = stuckForward()
  await forwardReport.run()
  same("drive: a conflict that stays after a merge-forward launch gets one report with the launch count at the head", [forwardReport.launched.length, commentsOf(forwardReport.calls, 7).filter((entry) => /Launches: 1\. Open: merge conflict with the base branch/.test(entry) && entry.includes(`ui#30 at ${HEAD}:`)).length], [0, 1])
  const forwardRemoved = stuckForward(conflictReport(-60 * MINUTE))
  await forwardRemoved.run()
  same("drive: a conflict report whose label the owner removed with no comment restores the label and writes no second report", [forwardRemoved.launched.length, only(forwardRemoved.calls, "editLabels").length, commentsOf(forwardRemoved.calls, 7).length], [0, 1, 0])
  const forwardAnswered = stuckForward(conflictReport(-60 * MINUTE), comment(null, "Keep the left side of the conflict.", -30 * MINUTE))
  await forwardAnswered.run()
  same("drive: an owner comment after the conflict report gives a new merge-forward order at the same head with the comment", [forwardAnswered.launched.length, forwardAnswered.launched[0]?.order.includes("Merge `origin/main` into the branch and resolve the conflicts"), forwardAnswered.launched[0]?.order.includes("Keep the left side of the conflict."), only(forwardAnswered.calls, "editLabels").length], [1, true, true, 0])
  const forwardMarkOf = JSON.parse(commentsOf(forwardAnswered.calls, 7).find((entry) => entry.startsWith("<!-- orbit-drive:launch -->")).split("\n")[1])
  same("drive: the granted merge-forward launch mark holds its kind and the head", [forwardMarkOf.kind, forwardMarkOf.baseMerge], ["merge-forward", HEAD])
  const forwardBefore = stuckForward(comment(null, "A note from before the report.", -100 * MINUTE), conflictReport(-60 * MINUTE))
  await forwardBefore.run()
  same("drive: an owner comment from before the conflict report grants no merge-forward launch", forwardBefore.launched.length, 0)
  const forwardOlderHead = stuckForward(conflictReport(-60 * MINUTE, "0".repeat(40)), comment(null, "A note for an older head.", -30 * MINUTE))
  await forwardOlderHead.run()
  same("drive: an owner comment after the conflict report of an older head grants no launch at this head", forwardOlderHead.launched.length, 0)
  const grantedMark = comment("launch", JSON.stringify({ kind: "merge-forward", part: null, branch: "chore/ticket-7-30", baseMerge: HEAD }), -20 * MINUTE)
  const forwardUsed = scenario({ tickets: [ticket(7, { comments: [...fixes, forwardMark(HEAD), conflictReport(-60 * MINUTE), comment(null, "Keep the left side.", -30 * MINUTE), grantedMark] })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await forwardUsed.run()
  same("drive: a granted merge-forward launch that leaves the head the same gives a new report with the next launch count", [forwardUsed.launched.length, commentsOf(forwardUsed.calls, 7).filter((entry) => /Launches: 2\. Open:/.test(entry)).length, only(forwardUsed.calls, "notify").length], [0, 1, 1])
  const forwardDecided = stuckForward(conflictReport(-60 * MINUTE), comment("owner-answer", "Decided: keep the left side of the conflict.", -30 * MINUTE))
  await forwardDecided.run()
  same("drive: an owner-answer after the conflict report gives a new merge-forward order and no second report", [forwardDecided.launched.length, only(forwardDecided.calls, "editLabels").length, commentsOf(forwardDecided.calls, 7).filter((entry) => entry.startsWith(marked("needs-owner", ""))).length, only(forwardDecided.calls, "notify").length], [1, 0, 0, 0])
  const forwardOldGrant = stuckForward(conflictReport(-90 * MINUTE), comment(null, "Keep the left side.", -80 * MINUTE), comment("launch", JSON.stringify({ kind: "merge-forward", part: null, branch: "chore/ticket-7-30", baseMerge: HEAD }), -70 * MINUTE), conflictReport(-60 * MINUTE), comment("owner-answer", "Decided: keep the right side.", -30 * MINUTE))
  await forwardOldGrant.run()
  same("drive: a plain-comment grant from before an owner-answer is not used again after the answer", [forwardOldGrant.launched.length, forwardOldGrant.launched[0]?.order.includes("Keep the left side.") ?? false, only(forwardOldGrant.calls, "editLabels").length], [1, false, 0])
  const uncounted = scenario({ tickets: [ticket(7, { comments: [fixes[0], launchComment("merge-forward", "chore/ticket-7-30", -80 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [blockingChanges()] })] } })
  await uncounted.run()
  const uncountedMark = JSON.parse(commentsOf(uncounted.calls, 7).find((entry) => entry.startsWith("<!-- orbit-drive:launch -->")).split("\n")[1])
  same("drive: a merge-forward launch with no base-merge mark does not count toward the cap of a fix launch", [uncounted.launched.length, uncountedMark.kind, uncountedMark.model], [1, "fix", "claude-sonnet-5-5"])
  const otherMark = (extra) => launchComment("merge-forward", "chore/ticket-7-30", -70 * MINUTE, null, { baseMerge: HEAD, ...extra })
  for (const [label, mark] of [["a merge-forward launch of another branch", otherMark({ branch: "chore/ticket-7-29" })], ["a ci-fix launch for a base merge", otherMark({ kind: "ci-fix" })]]) {
    const scene = scenario({ tickets: [ticket(7, { comments: [mark] })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
    await scene.run()
    same(`drive: ${label} at the same head does not stop a merge-forward order`, [scene.launched.length, /## This order \(merge-forward\)/.test(orderText(scene) ?? ""), only(scene.calls, "editLabels").length], [1, true, 0])
  }
  const forwardPart = stuckForward(conflictReport(-60 * MINUTE), comment(null, "Part 1 of 2: first\n", -30 * MINUTE))
  await forwardPart.run()
  same("drive: a part comment after the conflict report grants no merge-forward launch", forwardPart.launched.length, 0)
  const forwardTwice = stuckForward(conflictReport(-60 * MINUTE), comment(null, "Keep the left side.", -30 * MINUTE), comment(null, "Also keep the imports.", -25 * MINUTE), grantedMark)
  await forwardTwice.run()
  same("drive: two owner comments after one conflict report grant one merge-forward launch", [forwardTwice.launched.length, commentsOf(forwardTwice.calls, 7).filter((entry) => /Launches: 2\. Open:/.test(entry)).length], [0, 1])
  const forwardUnsorted = stuckForward(comment(null, "Keep the left side of the conflict.", -30 * MINUTE), conflictReport(-60 * MINUTE))
  await forwardUnsorted.run()
  same("drive: a conflict grant follows the comment times and not the order of the comment list", forwardUnsorted.launched.length, 1)
  const secondGrant = stuckForward(conflictReport(-90 * MINUTE), comment(null, "FIRST-NOTE", -80 * MINUTE), comment("launch", JSON.stringify({ kind: "merge-forward", part: null, branch: "chore/ticket-7-30", baseMerge: HEAD }), -70 * MINUTE), conflictReport(-60 * MINUTE, HEAD, 2), comment(null, "SECOND-NOTE", -50 * MINUTE))
  await secondGrant.run()
  same("drive: the second granted merge-forward order holds the second owner comment and not the first", [secondGrant.launched.length, orderText(secondGrant)?.includes("SECOND-NOTE"), orderText(secondGrant)?.includes("FIRST-NOTE")], [1, true, false])
  const forwardStale = scenario({ tickets: [ticket(7, { comments: [...fixes, conflictReport(-90 * MINUTE), comment(null, "Keep the left side.", -80 * MINUTE), comment("owner-answer", "Decided: keep the right side.", -70 * MINUTE), comment("launch", JSON.stringify({ kind: "merge-forward", part: null, branch: "chore/ticket-7-30", baseMerge: HEAD }), -50 * MINUTE)] })], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await forwardStale.run()
  same("drive: a plain-comment grant from before an owner-answer grants nothing after the first launch of the answer", forwardStale.launched.length, 0)
  const savedSession = comment("launch-session", JSON.stringify({ kind: "merge-forward", part: null, branch: "chore/ticket-7-30", pr: 30, session: "sess-1", account: ACCOUNT.key, tokens: 90000 }), -65 * MINUTE)
  const forwardResumed = stuckForward(savedSession, conflictReport(-60 * MINUTE), comment(null, "Keep the left side of the conflict.", -30 * MINUTE))
  await forwardResumed.run()
  same("drive: a granted merge-forward launch that resumes its session holds the owner comment", [forwardResumed.launched[0]?.invocation.command.args, orderText(forwardResumed)?.includes("## This order (merge-forward, resumed)"), orderText(forwardResumed)?.includes("Keep the left side of the conflict.")], [["--resume", "sess-1"], true, true])
  const child = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { baseRef: "chore/ticket-7-part-1", reviews: [], comments: [comment("ticket", "T")] })] }, routes: [["--json headRefOid", `${NEXT_HEAD}\n`]] })
  await child.run()
  same("drive: a child whose base pull request merged is retargeted to main, updated, and asked for a first pass", [only(child.calls, "retarget"), only(child.calls, "updateBranch"), commentsOf(child.calls, 30)], [[["retarget", "ui", 30, "main"]], [["updateBranch", "ui", 30]], [marked("record", `driver update-branch -> ${NEXT_HEAD}`), marked("request", PLAIN)]])
  same("drive: the retargeted child is updated before its first request", child.calls.map((entry) => entry[0]).filter((name) => ["retarget", "updateBranch", "comment"].includes(name)), ["retarget", "updateBranch", "comment", "comment"])
  const stacked = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(29, { headRef: "chore/ticket-7-part-1", labels: [OWNER_LABEL] }), pull(30, { baseRef: "chore/ticket-7-part-1" })] } })
  await stacked.run()
  same("drive: a child whose base pull request is open and does not merge stays on its base", [only(stacked.calls, "retarget").length, only(stacked.calls, "merge").filter((entry) => entry[2] === 29).length], [0, 0])
  const parentMerges = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(29, { headRef: "chore/ticket-7-part-1" }), pull(30, { baseRef: "chore/ticket-7-part-1", comments: [comment("ticket", "T")] })] }, routes: [["--json headRefOid", `${NEXT_HEAD}\n`]] })
  await parentMerges.run()
  same("drive: a child whose base pull request merged in the same tick is retargeted and updated, and it is not merged", [only(parentMerges.calls, "merge").map((entry) => entry[2]), only(parentMerges.calls, "retarget"), only(parentMerges.calls, "updateBranch")], [[29], [["retarget", "ui", 30, "main"]], [["updateBranch", "ui", 30]]])
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
  const gateway = await run(["Install"], [["actions/jobs/11/logs", "error: HTTP 504: Gateway Timeout\n"]])
  same("drive: a GitHub 504 gets one rerun", only(gateway.calls, "rerunFailed").length, 1)
  const barrier = await run(["Require deployment barriers for schema contractions"], [], "Guard Migrations", true)
  same("drive: a Guard Migrations barrier failure parks the ticket and starts no order", [barrier.launched.length, parkWrites(barrier)], [0, PARKED_ONCE])
  const other = await run(["Unit tests"], [["actions/jobs/11/logs", "AssertionError: expected 1 to be 2\n"]], "Unit Tests", true)
  T("drive: any other failure gives one ci-fix order with the failed lines", other.launched.length === 1 && /AssertionError/.test(orderText(other)) && only(other.calls, "rerunFailed").length === 0)

  const recorded = READS.failedJobLog
  const recordedLog = [["actions/jobs/11/logs", recorded.lines.join("\n")]]
  const suspects = (scene) => commentsOf(scene.calls, 30).filter((text) => text.includes("driver flake-suspect"))
  const checkout = await run(recorded.failedSteps, recordedLog, "Layout shard 6")
  same("drive: a failed checkout step gets one rerun and no flake record", [only(checkout.calls, "rerunFailed"), checkout.launched.length, suspects(checkout).length], [[["rerunFailed", "ui", "9001"]], 0, 0])
  const stuck = await run(recorded.failedSteps, recordedLog, "Layout shard 6", true)
  T("drive: a checkout that fails after the rerun gets a ci-fix order whose lines end at the last error of the job", stuck.launched.length === 1 && /exit code 128/.test(orderText(stuck)) && !/Cleaning up orphan processes/.test(orderText(stuck)), orderText(stuck))

  const inJob = (name, jobId) => check(name, "FAILURE", { databaseId: jobId, detailsUrl: `https://github.com/thomasluizon/orbit-ui-mobile/actions/runs/9001/job/${jobId}` })
  const two = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [inJob("Build", 21), inJob("Lint", 22), approvalCheck()], comments: [comment("ticket", "T")] })] }, failedSteps: ["Run tests"], routes: [["actions/jobs/21/logs", "the build broke\n##[error]build\npost step\n"], ["actions/jobs/22/logs", "the lint broke\n##[error]lint\npost step\n"]] })
  await two.run()
  same("drive: each flake record of one run holds the lines of its own job, up to its last error", suspects(two).map((text) => text.split("\n").slice(1)), [["driver flake-suspect 9001 Build", "the build broke", "##[error]build"], ["driver flake-suspect 9001 Lint", "the lint broke", "##[error]lint"]])
  const conflict = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { mergeState: "DIRTY" })] } })
  await conflict.run()
  T("drive: a conflict gives a merge-forward order", conflict.launched.length === 1 && /merge-forward/.test(orderText(conflict)))
}

/** A gate job fails only because a job that it needs did not pass. The job and step names are those of `test.yml`. */
const gateCheckCases = async () => {
  const failedRun = async (jobs, comments = []) => {
    const checks = jobs.map(([name], index) => check(name, "FAILURE", { databaseId: 21 + index }))
    const scene = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [...checks, approvalCheck()], comments: [comment("ticket", "T"), ...comments] })] }, failedSteps: (jobId) => [jobs[jobId - 21][1]] })
    await scene.run()
    return scene
  }
  const suspects = (scene) => commentsOf(scene.calls, 30).filter((text) => text.includes("driver flake-suspect")).map((text) => text.split("\n")[1])
  const shard = ["Layout shard 6", "Check upgrade layout"]
  const layoutGate = ["Upgrade layout geometry", "Require the build and every shard"]
  const both = await failedRun([shard, layoutGate])
  same("drive: a failed shard and its gate job get one rerun, and only the shard is a flake suspect", [only(both.calls, "rerunFailed"), suspects(both)], [[["rerunFailed", "ui", "9001"]], ["driver flake-suspect 9001 Layout shard 6"]])
  const alone = await failedRun([["Unit Tests", "Require every test job or its cached result"]])
  same("drive: a failed gate job gets one rerun and no flake record", [only(alone.calls, "rerunFailed"), alone.launched.length, suspects(alone)], [[["rerunFailed", "ui", "9001"]], 0, []])
  const stuck = await failedRun([layoutGate], [RERAN])
  same("drive: a gate job that fails after the rerun gets a ci-fix order", [only(stuck.calls, "rerunFailed").length, stuck.launched.length], [0, 1])
  const ownWork = await failedRun([["Unit Tests", "Merge web reports and enforce coverage thresholds"]])
  same("drive: a gate job that fails at a later step of its own stays a flake suspect", suspects(ownWork), ["driver flake-suspect 9001 Unit Tests"])
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
  const ownerLast = [merged(30, `Tracks ${REPOSITORY}#7\n\nRemaining: owner: add the repository secret`, "chore/ticket-7")]
  const decidedAfter = scenario({ tickets: [ticket(7, { comments: [launchRecord, comment("owner-answer", "The secret exists. Build the step.", -1800 * 1000)] })], routes: listed(ownerLast) })
  await decidedAfter.run()
  same("drive: an owner-answer comment after a merge that left only owner items launches one build and no needs-owner action", [decidedAfter.launched.length, only(decidedAfter.calls, "editLabels").length, needsOwnerComments(decidedAfter.calls, 7).length], [1, 0, 0])
  const decidedBefore = scenario({ tickets: [ticket(7, { comments: [launchRecord, comment("owner-answer", "Old answer.", -7200 * 1000)] })], routes: listed(ownerLast) })
  await decidedBefore.run()
  same("drive: an owner-answer comment before the merge that left only owner items still gets needs-owner", [decidedBefore.launched.length, only(decidedBefore.calls, "editLabels").map((entry) => entry[3]), needsOwnerComments(decidedBefore.calls, 7).length], [0, [{ add: [OWNER_LABEL] }], 1])
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
  const classReview = (body) => review("APPROVED", HEAD, -5 * MINUTE, { body: `Verdict\n\n## Class checks\n\n${body}\n` })
  const TWO = "- rule-one | lint rule | src/a.mjs:3 | The test reads source text.\n- two-key | type | src/b.mjs:9 | The field has no type."
  const classScene = (reviews, extra = {}) => scenario({ tickets: [ticket(7), ...(extra.tickets ?? [])], routes: extra.routes ?? [], pulls: { ui: [pull(30, { reviews })] } })
  const filed = (scene) => only(scene.calls, "createTicket").map((entry) => entry[1])
  const classKeys = (scene) => filed(scene).map((entry) => /^Class: (.+)$/m.exec(entry.body)?.[1])
  const listed2 = (scene) => scene.calls.filter((entry) => entry[0] === "gh" && entry[1].startsWith("issue list") && entry[1].includes("--state closed"))
  const twice = classScene([classReview(TWO)])
  await twice.run()
  same("drive: a merge with two class lines files two tickets with their Class lines and labels", [classKeys(twice), filed(twice).map((entry) => entry.labels), filed(twice)[0].title, filed(twice)[0].body.includes("Finding: class ui rule-one"), twice.messages.filter((line) => line.includes("class-ticket")).map((line) => line.slice(line.indexOf("class-ticket")))], [["rule-one", "two-key"], [["repo:ui", "Improvement", "parity:no"], ["repo:ui", "Improvement", "parity:no"]], "A lint rule finds every case of: The test reads source text.", true, ["class-ticket rule-one ui", "class-ticket two-key ui"]])
  const openSame = classScene([classReview(TWO)], { tickets: [ticket(8, { body: "Class: Rule-One\nFiled by: driver", blockedBy: [blocker(9)] })] })
  await openSame.run()
  same("drive: an open ticket with the same Class line and repository label holds the key", [classKeys(openSame), openSame.messages.some((line) => line.includes("class-ticket held rule-one"))], [["two-key"], true])
  const openOther = classScene([classReview(TWO.split("\n")[0])], { tickets: [ticket(8, { body: "Class: rule-one", labels: ["repo:api", "Improvement"], repoKey: "api", blockedBy: [blocker(9)] })] })
  await openOther.run()
  same("drive: an open ticket with the same Class line and another repository label holds nothing", classKeys(openOther), ["rule-one"])
  const doubled = classScene([classReview(TWO.split("\n")[0]), classReview("- RULE-ONE | test | src/c.mjs:1 | Same class again.")])
  await doubled.run()
  same("drive: two reviews that name the same key file one ticket", classKeys(doubled), ["rule-one"])
  const earlier = classScene([classReview(TWO.split("\n")[0])], { routes: [["--state closed", JSON.stringify([{ number: 41, title: "Old class ticket" }])]] })
  await earlier.run()
  same("drive: a closed ticket of the class is listed under Earlier tickets of this class", [filed(earlier)[0].body.endsWith("## Earlier tickets of this class\n\n#41 Old class ticket"), listed2(earlier).length, listed2(earlier)[0]?.[1].includes('--search "Class: rule-one" in:body')], [true, 1, true])
  const none = classScene([review("APPROVED", HEAD, -5 * MINUTE, { body: "Verdict\n\n## Outside this change\n\nsrc/x.mjs:4 loses data.\n" })])
  await none.run()
  same("drive: a merge whose reviews hold no Class checks section files no class ticket and lists no closed ticket", [filed(none).filter((entry) => /^Class: /m.test(entry.body)).length, listed2(none).length], [0, 0])
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

const RATE_LIMIT_RESET = Math.floor(NOW / 1000) + 600
const rateLimitBody = (core, graphql = { remaining: 4000, reset: RATE_LIMIT_RESET }) => JSON.stringify({ resources: { core: { limit: 5000, used: 0, ...core }, graphql: { limit: 5000, used: 0, ...graphql } } })

/** Makes one repository fail to read on every call. */
const failRepository = (scene, key, message = "gh api graphql failed: HTTP 504") => {
  const read = scene.env.github.readRepositoryState
  scene.env.github.readRepositoryState = async (name, options) => { if (name === key) throw new Error(message); return read(name, options) }
}

const healthOf = (scene) => JSON.parse(readFileSync(join(scene.env.stateDir, "health.json"), "utf8"))
const saveHealth = (scene, record) => writeFileSync(join(scene.env.stateDir, "health.json"), `${JSON.stringify(record)}\n`)
const rateLimitReads = (scene) => only(scene.calls, "gh").filter((entry) => entry[1] === "api rate_limit").length
const BAD_GATEWAY = "gh api graphql -f query=query { x } failed: gh: HTTP 502: Bad Gateway"
const REFUSED_MERGE = "gh pr merge failed: a repository rule refuses the merge"
/** A record of a good read two minutes ago, with one pull request at the bar and one blind part. */
const LAST_HEALTH = { writtenAt: iso(-2 * MINUTE), lastGoodTickAt: iso(-2 * MINUTE), lastMergeAt: iso(-50 * MINUTE), openPulls: 3, oldestGreenApprovedAt: iso(-30 * MINUTE), lastErrorClass: null, rateLimitedUntil: null, problems: [{ key: "blind:api", since: iso(-6 * MINUTE), detail: "x" }, { key: "unmerged:ui#12", since: iso(-30 * MINUTE), detail: "approved, meets the bar, not merged" }] }
/** The values of a record that only a good read changes, with the error and the problem keys of the last tick. */
const keptHealth = (scene) => { const record = healthOf(scene); return [record.lastGoodTickAt, record.openPulls, record.oldestGreenApprovedAt, record.lastErrorClass, record.problems.map((problem) => problem.key)] }
/** A pull request at the bar whose approval is `offset` old. */
const approved = (number, offset, extra = {}) => pull(number, { reviews: [review("APPROVED", HEAD, offset)], ...extra })

const healthReadCases = async () => {
  const good = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] })], api: [pull(40, { reviews: [] })] } })
  await good.run()
  same("drive: a good tick writes health.json with its read time, its pull request count and no problem", healthOf(good), { writtenAt: iso(0), lastGoodTickAt: iso(0), lastMergeAt: null, openPulls: 2, oldestGreenApprovedAt: null, lastErrorClass: null, rateLimitedUntil: null, problems: [] })

  const failingApi = (message, { routes = [], sleeping = false, dryRun = false } = {}) => {
    const scene = scenario({ tickets: [ticket(7)], routes, sleeping, dryRun })
    failRepository(scene, "api", message)
    return scene
  }
  const first = failingApi(BAD_GATEWAY)
  same("drive: a tick whose api read fails goes on with the other repositories", (await first.run()).retried, false)
  same("drive: a tick that fails one read writes health.json with the error class and the blind part", healthOf(first), { writtenAt: iso(0), lastGoodTickAt: null, lastMergeAt: null, openPulls: null, oldestGreenApprovedAt: null, lastErrorClass: "server", rateLimitedUntil: null, problems: [{ key: "blind:api", since: iso(0), detail: "gh: HTTP 502: Bad Gateway" }] })

  const noTickets = scenario({ tickets: [ticket(7)] })
  noTickets.env.github.readTickets = async () => { throw new Error(BAD_GATEWAY) }
  same("drive: a tick that fails its ticket read writes the error class and blind:tickets", [(await noTickets.run()).retried, ...keptHealth(noTickets)], [true, null, null, null, "server", ["blind:tickets"]])

  // In an outage the repository reads fail at different times. A read that fails after the first one is a blind part of the same tick.
  const outage = scenario({ tickets: [ticket(7)] })
  const outageRead = outage.env.github.readRepositoryState
  outage.env.github.readRepositoryState = async (key) => {
    if (key === "ui") throw new Error(BAD_GATEWAY)
    if (key === "api") { await new Promise((resolve) => setTimeout(resolve, 20)); throw new Error("gh api graphql failed: error connecting to api.github.com") }
    return outageRead(key)
  }
  await outage.run()
  same("drive: a tick whose repository reads fail at different times lists each failed read in health.json and takes the class of the first one", [healthOf(outage).lastErrorClass, healthOf(outage).problems.map((problem) => problem.key)], ["server", ["blind:ui", "blind:api"]])

  // When every repository read fails, the class comes from the first gh error, not from the wrapped message that holds the query and its pull request numbers.
  const allBlind = scenario({ tickets: [ticket(7)] })
  allBlind.env.github.readRepositoryState = async () => { throw new Error("gh api graphql -f query=query { repository { pr401: pullRequest(number: 401) { id } } } failed: gh: HTTP 502: Bad Gateway") }
  same("drive: a tick whose every repository read fails with HTTP 502 and pull request number 401 in its query has the class server", [(await allBlind.run()).retried, healthOf(allBlind).lastErrorClass, healthOf(allBlind).problems.map((problem) => [problem.key, problem.detail])], [true, "server", ["ui", "api", "landing"].map((key) => [`blind:${key}`, "gh: HTTP 502: Bad Gateway"])])

  const limited = failingApi("gh api graphql failed: gh: API rate limit already exceeded for user ID 1. (HTTP 403)", { routes: [["api rate_limit", rateLimitBody({ remaining: 4000, reset: RATE_LIMIT_RESET - 60 }, { remaining: 0, reset: RATE_LIMIT_RESET })]] })
  saveHealth(limited, LAST_HEALTH)
  await limited.run()
  const limitedRecord = { writtenAt: iso(0), lastGoodTickAt: iso(-2 * MINUTE), lastMergeAt: iso(-50 * MINUTE), openPulls: 3, oldestGreenApprovedAt: iso(-30 * MINUTE), lastErrorClass: "rate-limit", rateLimitedUntil: new Date(RATE_LIMIT_RESET * 1000).toISOString(), problems: [{ key: "blind:api", since: iso(-6 * MINUTE), detail: "gh: API rate limit already exceeded for user ID 1. (HTTP 403)" }, LAST_HEALTH.problems[1]] }
  same("drive: a rate limited read keeps the last good values, names the refill time and keeps the start of the blind part", healthOf(limited), limitedRecord)
  same("drive: a rate limited tick reads gh api rate_limit once for its hold and for health.json", rateLimitReads(limited), 1)
  limited.env.now = () => NOW + MINUTE
  same("drive: a tick that a rate limit holds keeps the last health.json and moves only writtenAt", [(await limited.run()).held, healthOf(limited), rateLimitReads(limited)], [true, { ...limitedRecord, writtenAt: iso(MINUTE) }, 1])

  const unreadLimit = failingApi("gh api graphql failed: gh: API rate limit exceeded (HTTP 403)")
  await unreadLimit.run()
  same("drive: a rate limit that the rate_limit read cannot name leaves rateLimitedUntil null", [healthOf(unreadLimit).lastErrorClass, healthOf(unreadLimit).rateLimitedUntil, rateLimitReads(unreadLimit)], ["rate-limit", null, 1])

  const backoff = scenario({ tickets: [ticket(7)] })
  backoff.env.github.readTickets = async () => { throw new Error(BAD_GATEWAY) }
  for (let attempt = 0; attempt < 3; attempt += 1) await backoff.run()
  const beforeHold = healthOf(backoff)
  backoff.env.now = () => NOW + MINUTE
  same("drive: a tick that the backoff holds keeps the last health.json and moves only writtenAt", [(await backoff.run()).held, healthOf(backoff)], [true, { ...beforeHold, writtenAt: iso(MINUTE) }])

  // The reap reads the world too. Only the read of the tick, with each pull request checked against the bar, makes a good tick.
  const reaping = (failsAt) => {
    const scene = scenario({ tickets: [ticket(7)] })
    keepWrites(scene, [ticket(7)])
    leftBehind(scene)
    scene.mem.account = ACCOUNT
    saveHealth(scene, LAST_HEALTH)
    const read = scene.env.github.readRepositoryState
    scene.reads = 0
    scene.env.github.readRepositoryState = async (key) => { if (failsAt(scene.reads++)) throw new Error(BAD_GATEWAY); return read(key) }
    return scene
  }
  const tickBlind = reaping((index) => index >= 3)
  same("drive: a tick whose reap read works and whose own read fails keeps the last good values of health.json", [(await tickBlind.run()).retried, tickBlind.reads, ...keptHealth(tickBlind)], [true, 6, iso(-2 * MINUTE), 3, iso(-30 * MINUTE), "server", ["blind:ui", "blind:api", "blind:landing", "unmerged:ui#12"]])
  const reapBlind = reaping((index) => index === 1)
  same("drive: a tick whose reap read misses one repository is no good tick and lists the blind part", [(await reapBlind.run()).retried, reapBlind.reads, ...keptHealth(reapBlind)], [false, 6, iso(-2 * MINUTE), 3, iso(-30 * MINUTE), "server", ["blind:api", "unmerged:ui#12"]])

  const twiceBlind = reaping((index) => index === 1 || index === 4)
  await twiceBlind.run()
  same("drive: a part that the reap read and the tick read both miss is one blind part", healthOf(twiceBlind).problems.map((problem) => problem.key), ["blind:api", "unmerged:ui#12"])

  // An error of the reap that is no read: the driver cannot end the group that a dead worker left.
  const reapThrows = scenario({ tickets: [ticket(7)] })
  leftBehind(reapThrows)
  reapThrows.mem.account = ACCOUNT
  writeFileSync(join(reapThrows.env.stateDir, "chore-ticket-7.pid"), JSON.stringify({ pid: 4242 }))
  reapThrows.env.pidHeld = () => false
  reapThrows.env.worker.killWorkerTree = () => { throw new Error("kill EPERM") }
  same("drive: a tick whose reap throws with no failed read names the error as error:tick", [(await reapThrows.run()).retried, ...keptHealth(reapThrows)], [true, null, null, null, "other", ["error:tick"]])

  const asleep = failingApi(BAD_GATEWAY, { sleeping: true })
  await asleep.run()
  same("drive: while sleep is on a failed read still writes health.json and sends no notification", [healthOf(asleep).lastErrorClass, only(asleep.calls, "notify").length], ["server", 0])
  const dry = failingApi(BAD_GATEWAY, { dryRun: true })
  await dry.run()
  same("drive: a dry run writes no health.json", existsSync(join(dry.env.stateDir, "health.json")), false)
  const unwritable = scenario({ tickets: [ticket(7)] })
  mkdirSync(join(unwritable.env.stateDir, "health.json"))
  same("drive: a health.json that cannot be written does not fail the tick and logs the error", [(await unwritable.run()).retried, unwritable.messages.filter((line) => / health error \(EISDIR/.test(line)).length], [false, 1])
}

const healthBarCases = async () => {
  const refusing = (pulls, options = {}) => {
    const scene = scenario({ tickets: [ticket(7)], pulls: { ui: pulls }, ...options })
    scene.env.github.merge = async () => { throw new Error(REFUSED_MERGE) }
    return scene
  }
  const red = approved(32, -200 * MINUTE, { checks: [check("Unit Tests", "FAILURE"), approvalCheck()] })
  const unapproved = pull(33, { reviews: [] })
  const waiting = refusing([approved(31, -40 * MINUTE), approved(30, -90 * MINUTE), red, unapproved])
  await waiting.run()
  same("drive: oldestGreenApprovedAt names the oldest approved pull request that meets the bar and is not merged", [healthOf(waiting).oldestGreenApprovedAt, healthOf(waiting).problems.map((problem) => [problem.key, problem.since])], [iso(-90 * MINUTE), [["unmerged:ui#30", iso(-90 * MINUTE)], ["unmerged:ui#31", iso(-40 * MINUTE)]]])
  same("drive: a tick whose merge is refused is a good tick with no error class", keptHealth(waiting), [iso(0), 4, iso(-90 * MINUTE), null, ["unmerged:ui#30", "unmerged:ui#31"]])

  const merging = scenario({ tickets: [ticket(7)], pulls: { ui: [approved(30, -90 * MINUTE)] } })
  await merging.run()
  same("drive: a merged pull request is no unmerged problem and sets lastMergeAt", [only(merging.calls, "merge").length, healthOf(merging).oldestGreenApprovedAt, healthOf(merging).problems, healthOf(merging).lastMergeAt], [1, null, [], iso(0)])

  // Every ready pull request merges in one tick, so the record drops each merged one and keeps each refused one.
  const mixed = scenario({ tickets: [ticket(7)], pulls: { ui: [approved(30, -90 * MINUTE), approved(31, -40 * MINUTE), approved(32, -20 * MINUTE)] } })
  const merge = mixed.env.github.merge
  mixed.env.github.merge = async (key, number, sha) => { if (number === 31) throw new Error(REFUSED_MERGE); return merge(key, number, sha) }
  await mixed.run()
  same("drive: a tick with two merges and one refused merge lists only the refused pull request as unmerged", [only(mixed.calls, "merge").map((entry) => entry[2]), healthOf(mixed).oldestGreenApprovedAt, healthOf(mixed).problems.map((problem) => problem.key), healthOf(mixed).lastMergeAt], [[30, 32], iso(-40 * MINUTE), ["unmerged:ui#31"], iso(0)])

  const planThrows = refusing([approved(30, -90 * MINUTE)], { routes: [["api rate_limit", rateLimitBody({ remaining: 0, reset: RATE_LIMIT_RESET })]] })
  await planThrows.run()
  planThrows.env.now = () => NOW + 2 * MINUTE
  planThrows.env.github.pullfrogRuns = async () => { throw new Error("gh run list --repo thomasluizon/orbit-ui-mobile failed: gh: API rate limit exceeded for user ID 1. (HTTP 403)") }
  await planThrows.run()
  same("drive: a tick whose pull request plan throws is no good tick, names the error and keeps the last good values", [...keptHealth(planThrows), healthOf(planThrows).rateLimitedUntil], [iso(0), 1, iso(-90 * MINUTE), "rate-limit", ["unmerged:ui#30", "error:tick"], new Date(RATE_LIMIT_RESET * 1000).toISOString()])

  const missedTwice = [comment("ticket", "T"), comment("request", PLAIN, -80 * MINUTE), comment("request", PLAIN, -50 * MINUTE)]
  const againThrows = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [], comments: missedTwice }), pull(31)] } })
  const againRead = againThrows.env.github.readRepositoryState
  // The second pull request plans again after the first one parks the ticket. Only that second plan fails, at its first read of the pull request.
  againThrows.env.github.readRepositoryState = async (...args) => {
    const state = await againRead(...args)
    const later = state.pulls.find((entry) => entry.number === 31)
    if (later) {
      const draft = later.draft
      Object.defineProperty(later, "draft", { get: () => { if (only(againThrows.calls, "editLabels").length > 0) throw new Error(BAD_GATEWAY); return draft } })
    }
    return state
  }
  await againThrows.run()
  same("drive: a pull request whose second plan throws is no good tick and names the error class", keptHealth(againThrows), [null, null, null, "server", ["error:tick"]])

  // A Pullfrog limit pauses the driver before the act step reaches the bar. A failed pause leaves the pull request unchecked.
  const unchecked = scenario({ tickets: [ticket(7)], runs: [failedRun(61, 30)], routes: [["--log-failed", LIMIT_LOG]], pulls: { ui: [approved(30, -90 * MINUTE)] } })
  unchecked.env.github.createTicket = async () => { throw new Error("gh issue create failed: gh: HTTP 502: Bad Gateway") }
  saveHealth(unchecked, LAST_HEALTH)
  await unchecked.run()
  same("drive: a pull request that an error stops before the bar check is no good tick and keeps the last good values", keptHealth(unchecked), [iso(-2 * MINUTE), 3, iso(-30 * MINUTE), "server", ["unmerged:ui#12", "error:tick"]])

  const early = scenario({ tickets: [ticket(7)], pulls: { ui: [approved(30, -90 * MINUTE)] }, auth: { ...AUTH, loggedIn: false } })
  early.env.github.createTicket = async () => { throw new Error("gh issue create failed: gh: HTTP 502: Bad Gateway") }
  saveHealth(early, LAST_HEALTH)
  const earlyError = await early.run().then(() => null, (error) => error.message)
  same("drive: a tick that throws between its read and the bar throws and keeps the last good values of health.json", [earlyError, ...keptHealth(early)], ["gh issue create failed: gh: HTTP 502: Bad Gateway", iso(-2 * MINUTE), 3, iso(-30 * MINUTE), "server", ["unmerged:ui#12", "error:tick"]])

  const late = scenario({ tickets: [ticket(8, { labels: ["repo:ui", "owner-work"] })] })
  late.env.github.comment = async () => { throw new Error("gh issue comment failed: gh: HTTP 502: Bad Gateway") }
  const lateError = await late.run().then(() => null, (error) => error.message)
  same("drive: a tick that throws after the bar keeps its good read and names the error", [lateError, ...keptHealth(late)], ["gh issue comment failed: gh: HTTP 502: Bad Gateway", iso(0), 0, null, "server", ["error:tick"]])
}

const readFailureCases = async () => {
  const wide = Array.from({ length: 36 }, (_, index) => pull(100 + index, { headRef: `chore/ticket-7-${100 + index}` }))
  const wideScene = scenario({ tickets: [ticket(7)], pulls: { ui: wide, api: [pull(200)], landing: [] } })
  await wideScene.run()
  same("drive: 36 open pull requests in ui and 1 in api read the Pullfrog runs once for each repository", only(wideScene.calls, "pullfrogRuns"), [["pullfrogRuns", "ui"], ["pullfrogRuns", "api"]])
  const drafts = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { draft: true })] } })
  await drafts.run()
  same("drive: a repository with only draft pull requests reads no Pullfrog runs", only(drafts.calls, "pullfrogRuns"), [])

  const unreadRuns = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30), pull(31, { draft: true })] } })
  unreadRuns.env.github.pullfrogRuns = async () => { throw new Error("gh run list failed: HTTP 502") }
  const unreadResult = await unreadRuns.run()
  same("drive: a failed read of the Pullfrog runs leaves the non-draft pull request unplanned, keeps the draft and does not fail the tick", [unreadResult.retried, unreadResult.lines.some((line) => line.startsWith("pull ui#30")), unreadResult.lines.some((line) => line.startsWith("pull ui#31")), unreadRuns.messages.some((line) => line.includes("ui#30 error (gh run list failed: HTTP 502)"))], [false, false, true, true])

  const split = scenario({ tickets: [ticket(7), ticket(8, { labels: ["repo:api", "Improvement"], repoKey: "api" })], pulls: { ui: [pull(30)], api: [], landing: [] } })
  split.mem.known.api = [55]
  failRepository(split, "api")
  const splitResult = await split.run()
  same("drive: a repository that cannot be read is unknown for the tick and the other repositories go on", [splitResult.retried, splitResult.lines.some((line) => line.startsWith("pull ui#30"))], [false, true])
  same("drive: a ticket of the unknown repository waits and starts no worker", [splitResult.lines.find((line) => line.includes("#8:")), split.launched.map((entry) => entry.order.includes("ticket 8"))].flat(), [`ticket ${REPOSITORY}#8: wait: the api repository could not be read this tick`])
  same("drive: the known pull requests of the unknown repository stay for the next tick", split.mem.known.api, [55])
  T("drive: the unknown repository is in the log", split.messages.some((line) => line.includes("api repository-unknown (gh api graphql failed: HTTP 504)")))
  same("drive: a tick with an unknown repository counts as no failed tick", [split.mem.failedTicks, split.mem.holdUntil], [0, 0])

  const all = scenario({ tickets: [ticket(7)] })
  for (const key of ["ui", "api", "landing"]) failRepository(all, key)
  same("drive: a tick in which no repository can be read is a failed tick", [(await all.run()).retried, all.mem.failedTicks], [true, 1])

  // No open ticket, so the tick starts no worker that writes a new record under the same name.
  const record = scenario({ tickets: [] })
  const apiRecord = leftBehind(record, { repoKey: "api", branch: "chore/ticket-9", ticketNumber: 9 }, "", "chore-ticket-9")
  const uiRecord = leftBehind(record, {}, "", "chore-ticket-7")
  failRepository(record, "api")
  await record.run()
  same("drive: the launch record of an unknown repository waits for the next tick and the record of a read repository is reaped", [existsSync(apiRecord), existsSync(uiRecord)], [true, false])

  // The reap read fails for ui and the tick read passes. The kept record must hold its ticket: no launch, record intact.
  const kept = scenario({ tickets: [ticket(7)] })
  const keptRecord = leftBehind(kept, {}, "", "chore-ticket-7")
  const keptBefore = readFileSync(keptRecord, "utf8")
  const keptRead = kept.env.github.readRepositoryState
  let keptReads = 0
  kept.env.github.readRepositoryState = async (name, options) => { if (name === "ui" && (keptReads += 1) === 1) throw new Error("gh api graphql failed: HTTP 504"); return keptRead(name, options) }
  const keptResult = await kept.run()
  same("drive: a repository that only the reap could not read stays unknown for the whole tick: no launch, the record intact", [kept.launched.length, existsSync(keptRecord) && readFileSync(keptRecord, "utf8") === keptBefore, keptResult.lines.find((line) => line.includes("#7:"))], [0, true, `ticket ${REPOSITORY}#7: wait: the ui repository could not be read this tick`])
}

const holdCases = async () => {
  const failTickets = (scene, message) => {
    scene.counts = { tickets: 0 }
    scene.env.github.readTickets = async () => { scene.counts.tickets += 1; throw new Error(message) }
  }
  const rateLimited = scenario({ routes: [["api rate_limit", rateLimitBody({ remaining: 0, reset: RATE_LIMIT_RESET })]] })
  failTickets(rateLimited, "gh api graphql failed: HTTP 403: API rate limit exceeded")
  const first = await rateLimited.run()
  same("drive: HTTP 403 reads gh api rate_limit and holds the next tick until the reset", [first.retried, only(rateLimited.calls, "gh").filter((entry) => entry[1] === "api rate_limit").length, rateLimited.mem.holdUntil], [true, 1, RATE_LIMIT_RESET * 1000])
  const held = await rateLimited.run()
  same("drive: a held tick reads nothing from GitHub", [held.held, rateLimited.counts.tickets, only(rateLimited.calls, "gh").filter((entry) => entry[1] === "api rate_limit").length], [true, 1, 1])
  rateLimited.env.now = () => RATE_LIMIT_RESET * 1000
  await rateLimited.run()
  same("drive: the tick after the reset reads GitHub again", rateLimited.counts.tickets, 2)

  const message = scenario({ routes: [["api rate_limit", rateLimitBody({ remaining: 5000, reset: RATE_LIMIT_RESET }, { remaining: 0, reset: RATE_LIMIT_RESET + 60 })]] })
  failTickets(message, "You have exceeded a secondary rate limit")
  await message.run()
  same("drive: a rate limit message waits for the latest reset of the exhausted limits", message.mem.holdUntil, (RATE_LIMIT_RESET + 60) * 1000)

  const permission = scenario({ routes: [["api rate_limit", rateLimitBody({ remaining: 3000, reset: RATE_LIMIT_RESET })]] })
  failTickets(permission, "gh api graphql failed: HTTP 403: Resource not accessible")
  await permission.run()
  same("drive: HTTP 403 with no exhausted limit holds no tick", permission.mem.holdUntil, 0)

  const unreadLimit = scenario({ routes: [["api rate_limit", () => { throw new Error("gh api failed: HTTP 502") }]] })
  failTickets(unreadLimit, "gh api graphql failed: HTTP 403")
  await unreadLimit.run()
  same("drive: a rate limit that cannot be read holds no tick", unreadLimit.mem.holdUntil, 0)

  const rateInRuns = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30)] }, routes: [["api rate_limit", rateLimitBody({ remaining: 0, reset: RATE_LIMIT_RESET })]] })
  rateInRuns.env.github.pullfrogRuns = async () => { throw new Error("gh run list failed: HTTP 403: API rate limit exceeded") }
  const passed = await rateInRuns.run()
  same("drive: a rate limit on the Pullfrog runs holds the next tick and the tick itself passes", [passed.retried, rateInRuns.mem.holdUntil, rateInRuns.mem.failedTicks], [false, RATE_LIMIT_RESET * 1000, 0])

  const failing = scenario({})
  failTickets(failing, "gh api graphql failed: HTTP 502")
  const holds = []
  for (let attempt = 0; attempt < 3; attempt += 1) { await failing.run(); holds.push(failing.mem.holdUntil) }
  same("drive: the first and second failed tick hold no tick and the third holds 10 minutes", holds, [0, 0, NOW + 10 * MINUTE])
  const during = await failing.run()
  same("drive: a tick inside the 10 minutes reads nothing", [during.held, failing.counts.tickets, failing.mem.failedTicks], [true, 3, 3])
  await failing.run()
  await failing.run()
  same("drive: 3 held ticks of one hold log one held line", failing.messages.filter((line) => line.includes("tick held (")).length, 1)
  failing.env.now = () => NOW + 10 * MINUTE
  await failing.run()
  same("drive: a tick that fails after the 10 minutes holds 10 minutes more", [failing.counts.tickets, failing.mem.failedTicks, failing.mem.holdUntil], [4, 4, NOW + 20 * MINUTE])

  const recovering = scenario({ tickets: [ticket(7)] })
  const read = recovering.env.github.readTickets
  failTickets(recovering, "gh api graphql failed: HTTP 504")
  for (let attempt = 0; attempt < 3; attempt += 1) await recovering.run()
  recovering.env.github.readTickets = read
  recovering.env.now = () => NOW + 10 * MINUTE
  const recovered = await recovering.run()
  same("drive: a tick that passes ends the hold and the count of failed ticks", [recovered.retried, recovering.mem.failedTicks, recovering.mem.holdUntil], [false, 0, 0])
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
  same("drive: three starts in ten minutes give one notification and one harness Bug issue with no needs:owner label", [tripped, only(starts.calls, "notify").length, only(starts.calls, "createTicket").map((entry) => entry[1].labels)], [true, 1, [BUG_LABELS]])
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
  const landing = merged(LANDING_150, "landing", { checks: build, comments: [comment("ticket", "T"), RERAN], tickets: [ticket(7, { repoKey: "landing", labels: ["repo:landing", "Improvement"], comments: capped("chore/ticket-7-30") })], routes: [["actions/jobs/11/logs", "Error: the page lists the iPhone app twice\n"]] })
  await landing.run()
  const launchRecord = JSON.parse(commentsOf(landing.calls, 7).find((text) => text.startsWith("<!-- orbit-drive:launch -->")).split("\n")[1])
  same("drive: landing#150, Build red after the merge of 8dbc88950 with the cap spent, gets a ci-fix order that the cap does not count and no needs:owner", [landing.launched.length, only(landing.calls, "editLabels").length, only(landing.calls, "notify").length, launchRecord.kind, launchRecord.baseMerge], [1, 0, 0, "ci-fix", LANDING_150.merge])
  T("drive: the base-merge ci-fix order names the green commit and the base commits that the merge brought in", orderText(landing).includes(LANDING_150.base) && orderText(landing).includes(LANDING_150.green) && /clean merge of `origin\/main`/.test(orderText(landing)))
  const markedLaunch = (head) => comment("launch", JSON.stringify({ kind: "ci-fix", part: null, branch: "chore/ticket-7-30", baseMerge: head }))
  const headTable = [
    ["a free launch at an older head", [markedLaunch("0000000000000000000000000000000000000000")], [1, 0]],
    ["a free launch at this head", [markedLaunch(LANDING_150.merge)], [1, 0]],
    ["six free launches at this head", Array.from({ length: 6 }, () => markedLaunch(LANDING_150.merge)), [1, 0]],
  ]
  for (const [label, extra, expected] of headTable) {
    const again = merged(LANDING_150, "landing", { checks: build, comments: [comment("ticket", "T"), RERAN], tickets: [ticket(7, { repoKey: "landing", labels: ["repo:landing", "Improvement"], comments: [...capped("chore/ticket-7-30"), ...extra] })] })
    await again.run()
    same(`drive: with the cap spent and ${label}, the base-merge ci-fix gives [launches, label writes]`, [again.launched.length, only(again.calls, "editLabels").length], expected)
  }
  const own = scenario({ tickets: [ticket(7, { comments: capped("chore/ticket-7-30") })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-30", headSha: UI_2528.merge, commits: [{ sha: UI_2528.green, parents: 1, checkState: "FAILURE" }, { sha: UI_2528.merge, parents: 2, checkState: "FAILURE" }], reviews: [], checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] }, gitRoutes: [["--remerge-diff", ""], ["log --no-merges", "3f4e5d6c7 a base commit\n"]] })
  await own.run()
  same("drive: a clean merge on top of a red commit is the fault of the change, so the cap holds and the Opus launch runs", [own.launched.length, own.launched[0]?.invocation.model, only(own.calls, "editLabels").length], [1, "claude-opus-5-5", 0])
  const fix = scenario({ tickets: [ticket(7, { comments: capped("chore/ticket-7-30") })], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-30", headSha: UI_2528.merge, commits: [{ sha: UI_2528.green, parents: 1, checkState: "SUCCESS" }, { sha: UI_2528.merge, parents: 2, checkState: "SUCCESS" }], reviews: [review(CHANGES_REQUESTED, UI_2528.merge, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] }, gitRoutes: [["--remerge-diff", ""]] })
  await fix.run()
  same("drive: a review finding on a clean merge head is still counted against the cap, so the Opus launch runs", [fix.launched.length, fix.launched[0]?.invocation.model, only(fix.calls, "editLabels").length], [1, "claude-opus-5-5", 0])

  // ui#2528: Tool Tests is red only on github-auth at the clean merge 11b42534c.
  const toolTests = (extra) => merged(UI_2528, "ui", { checks: [check("Tool Tests", "FAILURE"), approvalCheck()], tickets: [ticket(7, { comments: capped("chore/ticket-7-30") })], routes: [["actions/jobs/11/logs", "not ok github-auth: the token cache expired before the read\n"]], steps: ["Run tool tests"], ...extra })
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
  // A cancelled job never failed: it gets one rerun, no flake record, and so no flaky-check ticket when the rerun passes.
  const cancelled = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Unit Tests", "CANCELLED"), approvalCheck()], comments: [comment("ticket", "T")] })] }, failedSteps: ["Run tests"], routes: [["actions/jobs/11/logs", "The operation was canceled.\n##[error]The operation was canceled.\n"]] })
  await cancelled.run()
  const suspects = (scene) => commentsOf(scene.calls, 30).filter((text) => text.includes("driver flake-suspect"))
  same("drive: a cancelled Unit Tests job gets one rerun and no flake record", [only(cancelled.calls, "rerunFailed"), cancelled.launched.length, suspects(cancelled).length], [[["rerunFailed", "ui", "9001"]], 0, 0])
  const cancelledRecords = commentsOf(cancelled.calls, 30).filter((text) => text.startsWith("<!-- orbit-drive:record -->")).map((text) => comment("record", text.split("\n").slice(1).join("\n")))
  const passedAfter = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Unit Tests", "SUCCESS"), approvalCheck()], comments: [comment("ticket", "T"), ...cancelledRecords] })] } })
  await passedAfter.run()
  same("drive: a cancelled job that passes on the rerun at the same head files no flaky-check ticket", [only(passedAfter.calls, "createTicket").length, only(passedAfter.calls, "rerunFailed").length], [0, 0])
  const infra = merged(UI_2528, "ui", { checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T")], steps: ["Set up job"] })
  await infra.run()
  T("drive: a setup failure gets a rerun and no flake record", only(infra.calls, "rerunFailed").length === 1 && !commentsOf(infra.calls, 30).some((text) => text.includes("flake-suspect")))
}

const blockingClassCases = async () => {
  const redUnit = [check("Unit Tests", "FAILURE"), approvalCheck()]
  const dependabot = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", checks: redUnit, comments: [comment("ticket", "T"), RERAN] })] } })
  await dependabot.run()
  same("drive: a Dependabot pull request with a red check parks the pull request and does not wedge the lane", [dependabot.launched.map((entry) => entry.worktree), parkWrites(dependabot, 30)], [["/r/orbit-worktrees/ui/chore-ticket-8"], PARKED_ONCE])
  const conflict = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", mergeState: "DIRTY" })] } })
  await conflict.run()
  same("drive: a Dependabot pull request with a conflict parks the pull request and does not wedge the lane", [conflict.launched.length, parkWrites(conflict, 30)], [1, PARKED_ONCE])
  const closedTicket = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { checks: redUnit, comments: [comment("ticket", "T"), RERAN] })] } })
  await closedTicket.run()
  same("drive: a pull request whose tracked ticket is closed parks the pull request and gets no fix order", [closedTicket.launched.map((entry) => entry.worktree), parkWrites(closedTicket, 30)], [["/r/orbit-worktrees/ui/chore-ticket-8"], PARKED_ONCE])
  const noOrder = scenario({ tickets: [], pulls: { ui: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", reviews: [review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "a", line: 1, body: "BLOCKING: x" }] })] })] } })
  await noOrder.run()
  same("drive: a Dependabot pull request with a BLOCKING review parks the pull request and gets no fix order", [noOrder.launched.length, parkWrites(noOrder, 30)], [0, PARKED_ONCE])

  const redApproval = check("pullfrog-approval", "FAILURE", { databaseId: 12, checkSuite: { app: { databaseId: APP } } })
  const commented = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [review("COMMENTED", HEAD, -5 * MINUTE, { body: "A verdict with no BLOCKING class." })], checks: [check("Unit Tests"), redApproval], mergeState: "BLOCKED" })] } })
  await commented.run()
  same("drive: a COMMENTED review beside a red pullfrog-approval check gets no request, parks the ticket and gets no ci-fix order", [commentsOf(commented.calls, 30).length, parkWrites(commented), commented.launched.length], [0, PARKED_ONCE, 0])

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

/** A pull request with no open ticket gets no label, so its `needs-owner` report is the hold that the bar and the questions run read. */
const reportHoldCases = async () => {
  const redUnit = [check("Unit Tests", "FAILURE"), approvalCheck()]
  const green = [check("Unit Tests"), approvalCheck()]
  const report = comment("needs-owner", "The check failed.", -90 * MINUTE)
  const answer = (offset, extra = {}) => comment("owner-answer", "Merge it.", offset, extra)
  const bumps = (checks, comments) => pull(30, { author: "dependabot", tracks: null, body: "Bumps x", checks, comments: [comment("ticket", "T"), RERAN, ...comments] })
  const tracked = (comments) => pull(30, { checks: green, comments: [comment("ticket", "T"), ...comments] })
  const table = [
    ["a reported Dependabot pull request with a red check", bumps(redUnit, [report]), [], [1, 0, 0]],
    ["the tick that parks a Dependabot pull request with a red check", bumps(redUnit, []), [], [0, 0, 0]],
    ["a reported Dependabot pull request whose check passes now", bumps(green, [report]), [], [1, 0, 0]],
    ["a reported pull request whose tracked ticket is closed", tracked([report]), [], [1, 0, 0]],
    ["an owner answer after the report", bumps(green, [report, answer(-80 * MINUTE)]), [], [0, 1, 0]],
    ["an answer of another login after the report", bumps(green, [report, answer(-80 * MINUTE, { author: "someone" })]), [], [1, 0, 0]],
    ["an owner answer older than the report", bumps(green, [answer(-100 * MINUTE), report]), [], [1, 0, 0]],
    ["an answered pull request that still needs the owner", bumps(redUnit, [report, answer(-80 * MINUTE)]), [], [0, 0, 0]],
    ["an old report on a pull request whose tracked ticket is open", tracked([report]), [ticket(7)], [0, 1, 0]],
  ]
  for (const [label, held, tickets, expected] of table) {
    const stateDirectory = join(root, `drive-report-hold-${++scenarios}`)
    mkdirSync(stateDirectory, { recursive: true })
    const scene = scenario({ driver: {}, tickets, pulls: { ui: [held] }, stateDirectory })
    await scene.run()
    await scene.mem.questions
    same(`drive: ${label} gives [questions runs, merges, new reports]`, [questionRuns(scene).length, only(scene.calls, "merge").length, needsOwnerComments(scene.calls, 30).length], expected)
  }
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
  same("drive: two whole-diff requests answered with no whole-diff review park the ticket and send no third request", [commentsOf(twoAnswers.calls, 30).filter((text) => text.includes("review")).length, parkWrites(twoAnswers)], [0, PARKED_ONCE])

  const repliesBeforeChanges = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [reviewReply(-9 * MINUTE), reviewReply(-8 * MINUTE), review(CHANGES_REQUESTED, HEAD, -5 * MINUTE)] })] } })
  await repliesBeforeChanges.run()
  same("drive: thread replies before a review with no BLOCKING comment do not count as a review at the head", [commentsOf(repliesBeforeChanges.calls, 30).length, parkWrites(repliesBeforeChanges)], [0, PARKED_ONCE])

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
  same("drive: two CHANGES_REQUESTED reviews with no BLOCKING comment at one head park the ticket and send no third request", [commentsOf(unusableChanges.calls, 30).filter((text) => text.includes("review")).length, parkWrites(unusableChanges)], [0, PARKED_ONCE])

  const refusedLabel = (comments) => {
    const scene = scenario({ tickets: [], pulls: { landing: [pull(30, { author: "dependabot", tracks: null, body: "Bumps x", comments, checks: [check("Unit Tests", "FAILURE")] })] } })
    scene.env.github.editLabels = async (...args) => { scene.calls.push(["editLabels", ...args]); throw new Error("Unknown label(s): needs:owner") }
    return scene
  }
  const unlabelled = refusedLabel([comment("ticket", "T"), RERAN])
  await unlabelled.run()
  same("drive: a pull request with no ticket whose label write fails still gets one parked comment and no notification", [parkWrites(unlabelled, 30)[1], only(unlabelled.calls, "notify").length], [1, 0])
  const parked = refusedLabel([comment("ticket", "T"), RERAN, comment("parked", "Parked by the driver: landing#30 needs a ci-fix order and no open ticket tracks it. The driver starts no launch for it. The daily harness review re-plans it.")])
  await parked.run()
  await parked.run()
  same("drive: a pull request with no ticket and its parked comment gets no second comment and no notification", [commentsOf(parked.calls, 30).length, only(parked.calls, "notify").length], [0, 0])

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
  same("drive: with the lane free and no worker running, two fix launches give the Opus launch and no label", [capped.launched.length, capped.launched[0]?.invocation.model, only(capped.calls, "editLabels").length], [1, "claude-opus-5-5", 0])
  const cappedBuild = scenario({ tickets: [ticket(7, { comments: [launchOf("build", "chore/ticket-7"), launchOf("build", "chore/ticket-7")] })] })
  await cappedBuild.run()
  same("drive: with the lane free and no worker running, two build launches give the Opus launch and no label", [cappedBuild.launched.length, cappedBuild.launched[0]?.invocation.model, only(cappedBuild.calls, "editLabels").length], [1, "claude-opus-5-5", 0])
  const oldReport = comment("needs-owner", "The build order of chore/ticket-7 launched 2 times without a result", -30 * MINUTE)
  const oldReported = scenario({ tickets: [ticket(7, { comments: [launchOf("build", "chore/ticket-7"), launchOf("build", "chore/ticket-7"), oldReport] })] })
  await oldReported.run()
  same("drive: a build order with an old cap report and no label still gets its Opus launch, with no new comment and no notice", [oldReported.launched.length, needsOwnerComments(oldReported.calls, 7).length, only(oldReported.calls, "notify").length], [1, 0, 0])

  // The owner decision (an owner-answer comment on the ticket) answers the launches before it, so a decided order gets its full count again.
  const launchAt = (offset) => comment("launch", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7" }), offset)
  const spentOrder = [launchAt(-5 * 60 * MINUTE), launchAt(-4 * 60 * MINUTE), comment("needs-owner", "The build order of chore/ticket-7 launched 2 times without a result", -3 * 60 * MINUTE)]
  const decision = comment("owner-answer", "Decided: fix the driver.", -2 * 60 * MINUTE)
  const decided = scenario({ tickets: [ticket(7, { comments: [...spentOrder, decision] })] })
  await decided.run()
  same("drive: a build order with 2 launches before an owner decision gets 1 launch and no needs-owner action", [decided.launched.length, only(decided.calls, "editLabels").length, needsOwnerComments(decided.calls, 7).length, only(decided.calls, "notify").length], [1, 0, 0, 0])
  const failedAgain = scenario({ tickets: [ticket(7, { comments: [...spentOrder, decision, launchAt(-90 * MINUTE), launchAt(-80 * MINUTE)] })] })
  await failedAgain.run()
  same("drive: a decided order with 2 more failed launches gets its Opus launch and no label, no needs-owner comment and no notice", [failedAgain.launched.length, failedAgain.launched[0]?.invocation.model, only(failedAgain.calls, "editLabels").length, needsOwnerComments(failedAgain.calls, 7).length, only(failedAgain.calls, "notify").length], [1, "claude-opus-5-5", 0, 0, 0])
  const strangerAnswer = scenario({ tickets: [ticket(7, { comments: [...spentOrder, { ...decision, author: "someone-else" }] })] })
  await strangerAnswer.run()
  same("drive: an owner-answer comment of another account does not start a spent order again, so the order gets its Opus launch only", [strangerAnswer.launched.length, strangerAnswer.launched[0]?.invocation.model, only(strangerAnswer.calls, "editLabels").length], [1, "claude-opus-5-5", 0])

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
    conflict: { mergeState: "DIRTY" },
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

/** A pull request whose required check failed after its one rerun, so the plan gives a ci-fix order. */
const failing = (number, extra = {}) => pull(number, { checks: [check("Unit Tests", "FAILURE"), approvalCheck()], comments: [comment("ticket", "T"), RERAN], ...extra })
const FAILED_LOG = { failedSteps: ["Unit tests"], routes: [["--log-failed", "AssertionError: expected 1 to be 2\n"]] }

/** The launches of a scene in their order, each as its ticket number and order kind. */
const launchesIn = (scene) => scene.messages.flatMap((line) => { const hit = / ticket#(\d+) launch (.+?) \(/.exec(line); return hit ? [`${hit[1]} ${hit[2].replace(/ model \S+$/, "")}`] : [] })

/** The run ids of the failed logs that a scene read, in their order. */
const logReads = (scene) => scene.calls.filter((entry) => entry[0] === "gh" && entry[1].includes("--log-failed")).map((entry) => entry[1].split(" ")[2])

/** A failed Pullfrog run whose title names one pull request. */
const failedRun = (databaseId, number) => ({ databaseId, displayTitle: `Respond to mention on #${number} [abc]`, status: "completed", conclusion: "failure", createdAt: iso(-10 * MINUTE), updatedAt: iso(-5 * MINUTE) })
const LIMIT_LOG = "You've hit your limit. Resets 4am (America/Sao_Paulo)"

/** Holds the Pullfrog run list of a scene, so its plan does not end. Returns the function that releases it. */
const holdPlan = (scene) => {
  let release = null
  const held = new Promise((resolve) => { release = resolve })
  const list = scene.env.github.pullfrogRuns
  scene.env.github.pullfrogRuns = async (key) => { await held; return list(key) }
  return release
}

/** Makes the plan of a scene end 50 ms late. */
const slowRunList = (scene) => {
  const list = scene.env.github.pullfrogRuns
  scene.env.github.pullfrogRuns = async (key) => { await new Promise((resolve) => setTimeout(resolve, 50)); return list(key) }
}

const planSpeedCases = async () => {
  // One run list for each repository, however many pull requests it has, and one failed log for each workflow run.
  const many = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30), pull(31, { headRef: "chore/ticket-7-31" }), pull(32, { headRef: "chore/ticket-7-32" })], api: [pull(40, { headRef: "chore/ticket-7-40" })] } })
  await many.run()
  same("drive: a tick reads the Pullfrog run list once for each repository with a pull request", many.calls.filter((entry) => entry[0] === "pullfrogRuns").map((entry) => entry[1]), ["ui", "api"])
  const draft = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { draft: true })] } })
  await draft.run()
  same("drive: a repository with only draft pull requests reads no run list", only(draft.calls, "pullfrogRuns").length, 0)
  const twoChecks = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check("Unit Tests", "FAILURE"), check("Lint", "FAILURE", { databaseId: 13 }), approvalCheck()], comments: [comment("ticket", "T"), RERAN] })] }, failedSteps: ["Unit tests"], routes: [["actions/jobs/11/logs", "AssertionError: expected 1 to be 2\n"], ["actions/jobs/13/logs", "lint failed\n"]] })
  await twoChecks.run()
  const jobReads = (id) => twoChecks.calls.filter((entry) => entry[0] === "gh" && entry[1].includes(`actions/jobs/${id}/logs`)).length
  same("drive: each failed job of one workflow run reads its own log once, never the run log", [jobReads(11), jobReads(13), twoChecks.calls.filter((entry) => entry[0] === "gh" && entry[1].includes("--log-failed")).length, twoChecks.launched.length], [1, 1, 0, 1])

  // The pace line names the seconds that the tick took.
  same("drive: the pace line ends with the seconds of the tick", many.messages.filter((line) => line.includes(" pace ")).map((line) => /; tick (\d+)s\)$/.exec(line)?.[1]), ["12"])

  // The plan is slow: the free slot takes an admitted build order before the plan ends, and a fix order takes the next free slot after it.
  const slow = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.35, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, pulls: { ui: [failing(30)] }, ...FAILED_LOG })
  slow.env.planWindowMs = 20
  const release = holdPlan(slow)
  const running = slow.run()
  const early = await until(() => slow.launched.length === 1)
  const launchedBeforePlan = launchesIn(slow)
  release()
  const result = await running
  same("drive: a free slot starts an admitted build order while the pull request plan still runs", [early, launchedBeforePlan], [true, ["8 build"]])
  same("drive: the fix order of the pull request takes the next free slot when the plan ends", [launchesIn(slow), slow.messages.some((line) => line.includes("early-launch"))], [["8 build", "7 ci-fix"], true])
  T("drive: the tick lines keep the decision of the early admission", result.lines.some((line) => line.startsWith(`ticket ${REPOSITORY}#8: admit build`)))

  // Every free slot takes a build order early, not only the first one.
  const wideSlots = scenario({ tickets: [ticket(7), ticket(8), ticket(9)], reading: { utilization: 0, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, pulls: { ui: [failing(30)] }, ...FAILED_LOG })
  wideSlots.env.planWindowMs = 20
  const releaseWide = holdPlan(wideSlots)
  const wideRunning = wideSlots.run()
  await until(() => wideSlots.launched.length === 2)
  const wideBeforePlan = launchesIn(wideSlots)
  releaseWide()
  await wideRunning
  same("drive: every free slot takes an admitted build order while the plan still runs", [wideBeforePlan, launchesIn(wideSlots)], [["8 build", "9 build"], ["8 build", "9 build", "7 ci-fix"]])

  // A slot that stays free after the plan never takes the ticket of an early launch again.
  const spare = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, pulls: { ui: [failing(30)] }, ...FAILED_LOG })
  spare.env.planWindowMs = 20
  const releaseSpare = holdPlan(spare)
  const spareRunning = spare.run()
  await until(() => spare.launched.length === 1)
  releaseSpare()
  await spareRunning
  same("drive: the admission after the plan starts no second worker for the ticket of an early launch", launchesIn(spare), ["8 build", "7 ci-fix"])

  // The ticket of an early launch stays open, so the admission after the plan still holds a runs-last ticket for it.
  const lastOne = scenario({ tickets: [ticket(7), ticket(9, { labels: ["repo:ui", "Bug", "runs-last:board"] })], reading: { utilization: 0, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, pulls: { ui: [pull(30, { tracks: null })] } })
  lastOne.env.planWindowMs = 20
  const releaseLast = holdPlan(lastOne)
  const lastRunning = lastOne.run()
  await until(() => lastOne.launched.length === 1)
  releaseLast()
  const lastResult = await lastRunning
  same("drive: a runs-last ticket waits for the open ticket of an early launch", [launchesIn(lastOne), lastResult.lines.find((line) => line.startsWith(`ticket ${REPOSITORY}#9:`))], [["7 build"], `ticket ${REPOSITORY}#9: wait: runs last (1 open)`])

  // With no env window, the wait for the plan is at most the 2 minutes of the ticket. The fake timer records the wait and ends it at once.
  const defaulted = scenario({ tickets: [ticket(8)], pulls: { ui: [pull(30, { tracks: null })] } })
  const releaseDefault = holdPlan(defaulted)
  const realTimeout = globalThis.setTimeout
  const waits = []
  let beforeDefaultPlan = []
  globalThis.setTimeout = (task, ms, ...rest) => { if (ms >= 1000) waits.push(ms); return realTimeout(task, ms >= 1000 ? 1 : ms, ...rest) }
  try {
    const defaultRunning = defaulted.run()
    await until(() => defaulted.launched.length === 1)
    beforeDefaultPlan = launchesIn(defaulted)
    releaseDefault()
    await defaultRunning
  } finally { globalThis.setTimeout = realTimeout }
  same("drive: the default wait for a slow plan is one timer of at most 2 minutes, then the free slot starts a worker", [waits.length, waits.every((ms) => ms <= 2 * MINUTE), beforeDefaultPlan], [1, true, ["8 build"]])

  // The hold is read again before each early launch: a limit that the plan finds between two launches stops the second one.
  const between = scenario({ tickets: [ticket(7), ticket(8), ticket(9)], reading: { utilization: 0, resetsAt: RESETS_AT, at: NOW - 5 * MINUTE }, pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun(77, 30)], routes: [["--log-failed", LIMIT_LOG]] })
  between.env.planWindowMs = 20
  const releaseBetween = holdPlan(between)
  const write = between.env.github.comment
  between.env.github.comment = async (key, number, body) => {
    await write(key, number, body)
    if (key !== "tickets" || number !== 8) return
    releaseBetween()
    await until(() => only(between.calls, "createTicket").length === 1)
  }
  await between.run()
  same("drive: a limit that the plan finds during an early launch stops the next early launch", [only(between.calls, "createTicket").length, launchesIn(between)], [1, ["8 build"]])

  // An early admission that fails never ends the tick before its plan, so the next tick cannot act on the same pull request again.
  let failedReads = 0
  const unrequested = pull(30, { reviews: [], comments: [comment("ticket", "T")] })
  const failedEarly = scenario({ tickets: [ticket(7), ticket(8)], pulls: { ui: [unrequested] }, routes: [["--state merged", () => { if (++failedReads === 1) throw new Error("gh failed"); return "[]" }]] })
  failedEarly.env.planWindowMs = 20
  const releaseFailed = holdPlan(failedEarly)
  const post = failedEarly.env.github.comment
  // A posted request shows on the pull request at the next read, as on GitHub.
  failedEarly.env.github.comment = async (key, number, body) => {
    await post(key, number, body)
    if (key === "ui" && body === marked("request", PLAIN)) unrequested.comments.push(comment("request", PLAIN, 0))
  }
  // The loop starts the next tick when this tick ends, whether it ends well or not.
  const firstTick = failedEarly.run().catch(() => {})
  const secondTick = firstTick.then(() => failedEarly.run())
  await until(() => failedReads === 1)
  await new Promise((resolve) => setTimeout(resolve, 100))
  releaseFailed()
  await secondTick
  same("drive: a failed early admission is logged and two ticks post one Pullfrog request", [failedEarly.messages.filter((line) => line.includes("tick early-launch-error (gh failed)")).length, only(failedEarly.calls, "comment").filter((entry) => entry[1] === "ui" && entry[3] === marked("request", PLAIN)).length], [1, 1])

  // A plan that ends inside the window keeps the fix order first.
  const quick = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.6, resetsAt: RESETS_AT, at: NOW - MINUTE }, pulls: { ui: [failing(30)] }, ...FAILED_LOG })
  await quick.run()
  same("drive: a plan that ends in time gives the one free slot to the fix order", [launchesIn(quick), quick.messages.some((line) => line.includes("early-launch"))], [["7 ci-fix"], false])
  const ordered = scenario({ tickets: [ticket(7), ticket(8)], reading: { utilization: 0.35, resetsAt: RESETS_AT, at: NOW - MINUTE }, pulls: { ui: [failing(30)] }, ...FAILED_LOG })
  await ordered.run()
  same("drive: with two free slots the fix order starts before the build order", launchesIn(ordered), ["7 ci-fix", "8 build"])

  // With no free slot, a slow plan admits nothing early.
  const noSlot = scenario({ tickets: [ticket(8)], reading: { utilization: 0.95, resetsAt: RESETS_AT, at: NOW - MINUTE }, pulls: { ui: [pull(30, { tracks: null })] } })
  noSlot.env.planWindowMs = 0
  slowRunList(noSlot)
  await noSlot.run()
  same("drive: with no free slot a slow plan starts no early admission", [noSlot.launched.length, noSlot.messages.some((line) => line.includes("early-launch"))], [0, false])

  // A dry run starts no worker, however slow the plan is.
  const dry = scenario({ tickets: [ticket(8)], dryRun: true, pulls: { ui: [pull(30, { tracks: null })] } })
  dry.env.planWindowMs = 0
  slowRunList(dry)
  await dry.run()
  same("drive: a dry run starts no worker early", [dry.launched.length, dry.messages.some((line) => line.includes("early-launch"))], [0, false])
}

/** The reads that the tick makes at the same time: their highest count. Each read stays open for 10 ms. */
const inFlight = (read) => {
  const gauge = { live: 0, most: 0, total: 0 }
  gauge.read = async (...args) => {
    gauge.live += 1
    gauge.total += 1
    gauge.most = Math.max(gauge.most, gauge.live)
    await new Promise((resolve) => setTimeout(resolve, 10))
    gauge.live -= 1
    return read(...args)
  }
  return gauge
}

const planShapeCases = async () => {
  // The plan reads at most 4 pull requests at once, counted over all repositories, and never one after another.
  const repositories = { ui: [7, 30], api: [8, 40], landing: [9, 50] }
  const tickets = Object.entries(repositories).map(([key, [number]]) => ticket(number, { repoKey: key, labels: [`repo:${key}`, "Improvement"] }))
  const pulls = Object.fromEntries(Object.entries(repositories).map(([key, [number, first]]) => [key, [first, first + 1, first + 2].map((entry) => failing(entry, { headRef: `chore/ticket-${number}-${entry}`, tracks: number, body: `Tracks thomasluizon/orbit-tickets#${number}\n\nRemaining: none` }))]))
  const wide = scenario({ tickets, pulls })
  const steps = inFlight(async () => ["Unit tests"])
  wide.env.github.readFailedSteps = steps.read
  const world = inFlight(wide.env.github.readRepositoryState)
  wide.env.github.readRepositoryState = world.read
  const wideResult = await wide.run()
  same("drive: the plan reads at most 4 pull requests of all repositories at once, and reads each one", [steps.most, steps.total], [4, 9])
  same("drive: the tick reads the three repositories at the same time", world.most, 3)
  same("drive: every planned pull request gets its line", wideResult.lines.filter((line) => line.startsWith("pull ")).length, 9)

  // A plan that fails for one pull request logs it, and the plans of the others still act.
  const broken = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30), pull(31, { headRef: "chore/ticket-7-31" })] } })
  broken.env.github.runsNaming = (list, number) => { if (number === 30) throw new Error("no runs for 30"); return list }
  await broken.run()
  same("drive: a failed plan of one pull request is logged and the next pull request still merges", [broken.messages.filter((line) => line.includes("ui#30 error (no runs for 30)")).length, only(broken.calls, "merge").map((entry) => entry[2])], [1, [31]])

  // Every plan is ready before the first action, and every pull request that meets the bar merges in number order.
  const mergeable = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(31, { headRef: "chore/ticket-7-31" }), pull(30)] } })
  await mergeable.run()
  same("drive: every pull request that meets the bar merges in number order, with every plan ready before the first merge", only(mergeable.calls, "merge").map((entry) => entry[2]), [30, 31])

  // An earlier pull request of a ticket labels the ticket needs:owner in the act step, so a later pull request of the ticket plans again against the label.
  const missedTwice = [comment("ticket", "T"), comment("request", PLAIN, -80 * MINUTE), comment("request", PLAIN, -50 * MINUTE)]
  const labelled = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [], comments: missedTwice }), pull(31, { headRef: "chore/ticket-7-31" })] } })
  const labelledTick = await labelled.run()
  same("drive: a pull request that follows a park of its ticket in the same tick waits on the label and does not merge", [labelledTick.lines.filter((line) => line.startsWith("pull ui#31:")), only(labelled.calls, "merge").map((entry) => entry[2])], [["pull ui#31: wait: parked"], []])

  // Each pull request reads only the Pullfrog runs that name it, from the one list of its repository.
  const named = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun(77, 30), failedRun(78, 99)], routes: [["run view 77 ", "boring failure"], ["run view 78 ", LIMIT_LOG]] })
  named.env.github.runsNaming = runsNaming
  await named.run()
  same("drive: a Pullfrog run that names no open pull request is not read and pauses nothing", [logReads(named), only(named.calls, "createTicket").length], [["77"], 0])

  // One failed log for each run: two pull requests that share a run read it once, and a later tick does not read it again.
  const shared = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { reviews: [] }), pull(31, { reviews: [], headRef: "chore/ticket-7-31" })] }, runs: [failedRun(77, 30)], routes: [["--log-failed", "boring failure"]] })
  await shared.run()
  const firstTick = logReads(shared)
  await shared.run()
  same("drive: a Pullfrog run log is read once for all pull requests and never again after that tick", [firstTick, logReads(shared)], [["77"], ["77"]])

  // The actions run one repository after another, so two limits in two repositories open one pause issue.
  const twice = scenario({ tickets, pulls: { ui: [pull(30, { reviews: [] })], api: [pull(40, { reviews: [], tracks: 8, headRef: "chore/ticket-8-40" })] }, runs: [failedRun(77, 30)], routes: [["--log-failed", LIMIT_LOG]] })
  const create = twice.env.github.createTicket
  twice.env.github.createTicket = async (input) => { await new Promise((resolve) => setTimeout(resolve, 10)); return create(input) }
  await twice.run()
  same("drive: two repositories with a Pullfrog limit open one pause issue", only(twice.calls, "createTicket").length, 1)

  // The seconds of the pace line cover the whole tick: the first read, the plan and the last step.
  const timed = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30)] } })
  let clock = 0
  timed.env.clock = () => clock
  const after = (seconds, read) => async (...args) => { clock += seconds * 1000; return read(...args) }
  timed.env.github.readTickets = after(40, timed.env.github.readTickets)
  timed.env.github.pullfrogRuns = after(100, timed.env.github.pullfrogRuns)
  timed.env.keychain = after(7, timed.env.keychain)
  timed.mem.lastIntakeAt = NOW - 2 * 60 * MINUTE
  await timed.run()
  same("drive: the tick seconds count from the start of the tick to its last step", timed.messages.filter((line) => line.includes(" pace ")).map((line) => /; tick (\d+)s\)$/.exec(line)?.[1]), ["147"])
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

  // The facts file of a launch comes only from the real writers: `startWorker` writes it and the reap adds the exit.
  const factsTickets = [ticket(7)]
  const factsReview = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: REAL-FINDING" }] })
  let afterExit = false
  const factsScene = scenario({ tickets: factsTickets, pulls: { ui: [pull(30, { reviews: [factsReview] })] }, gitRoutes: [["rev-parse", () => `${afterExit ? NEXT_HEAD : HEAD}\n`]] })
  keepWrites(factsScene, factsTickets)
  // Each launch has its own start time, so each gets its own log name and facts file.
  let factsClock = NOW
  factsScene.env.now = () => factsClock
  factsScene.env.worker.launch = (options) => { factsScene.launched.push(options); return Promise.resolve({ ...clean, exitCode: 1, killed: "hard-ceiling", killReason: "passed its hard ceiling" }) }
  const factsOf = (name) => JSON.parse(readFileSync(join(factsScene.env.stateDir, "logs", `${name}.facts.json`), "utf8"))
  const logNames = () => commentsOf(factsScene.calls, 7).filter((text) => text.startsWith(marked("launch", ""))).map((text) => JSON.parse(text.split("\n")[1]).log)
  await factsScene.run()
  factsClock += MINUTE
  const [firstLog] = logNames()
  const atLaunch = factsOf(firstLog)
  afterExit = true
  await factsScene.run()
  factsClock += MINUTE
  const [, secondLog] = logNames()
  const { exitCode, killReason, headAfter } = factsOf(firstLog)
  same("drive: a launch writes its facts file with the order's findings, and the reap adds its exit code, kill reason and head", [atLaunch.kind, atLaunch.model, atLaunch.headBefore, atLaunch.blocking.map((entry) => entry.body), atLaunch.exitCode, exitCode, killReason, headAfter], ["fix", "claude-sonnet-5-5", HEAD, ["BLOCKING: REAL-FINDING"], undefined, 1, "passed its hard ceiling", NEXT_HEAD])
  await factsScene.run()
  const opusOrder = factsScene.launched[2]?.order ?? ""
  T("drive: the Opus order holds the exit, heads and findings that the real facts files of the two earlier launches hold", factsScene.launched.length === 3 && secondLog !== undefined && factsScene.launched[2].invocation.model === "claude-opus-5-5" && opusOrder.includes("## Earlier launches") && opusOrder.includes("Exit: 1, killed: passed its hard ceiling.") && opusOrder.includes(`${HEAD} to ${NEXT_HEAD}`) && opusOrder.includes("tools/a.mjs:3: BLOCKING: REAL-FINDING") && !opusOrder.includes("Exit: unknown"), opusOrder.slice(opusOrder.indexOf("## Earlier launches"), opusOrder.indexOf("## Brief")))
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

const launchComment = (kind, branch, offset = -3600 * 1000, part = null, extra = {}) => comment("launch", JSON.stringify({ kind, part, branch, ...extra }), offset)
const mergedPull = (number, branch, remaining) => ({ number: 40, body: `Tracks ${REPOSITORY}#${number}\n\n${remaining}`, mergedAt: iso(-60 * 1000), headRefName: branch })
const mergedRoute = (number, history) => ["--state merged", (args) => (args.join(" ").includes(`#${number}"`) ? JSON.stringify(history) : "[]")]
const blockingChanges = () => review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: a class" }] })
const needsOwnerComments = (calls, number) => commentsOf(calls, number).filter((text) => text.startsWith(marked("needs-owner", "")))
/** A pull request whose merge-forward launch left its conflict: the one stop of a pull request that still reports `needs-owner`. */
const stuckPull = (number, extra = {}) => pull(number, { mergeState: "DIRTY", ...extra })
const forwardMark = (branch, head = HEAD) => comment("launch", JSON.stringify({ kind: "merge-forward", part: null, branch, baseMerge: head }))
const stopReason = (number, head = HEAD) => `ui#${number} at ${head}: ui#${number} still conflicts with the base branch after a merge-forward launch at this head. Launches: 1. Open: merge conflict with the base branch`

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
  same("drive: a fix cap on a ticket that already carries needs:owner gets the Opus launch with no label, no cap comment and no notice", [capped.launched.length, only(capped.calls, "editLabels").length, needsOwnerComments(capped.calls, 7).length, only(capped.calls, "notify").length], [1, 0, 0, 0])

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
  same("drive: an open pull request on the order's branch with no Tracks line keeps the order on that branch and and parks the ticket", [untracked.launched.length, parkWrites(untracked), commentsOf(untracked.calls, 7).filter((text) => text.startsWith(marked("parked", ""))).map((text) => /ui#30/.test(text) && /Tracks/.test(text))], [0, PARKED_ONCE, [true]])

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

  const findKept = async (label, prepare, reason) => {
    const scene = scenario({ tickets: findTickets(), gitRoutes: [["worktree list", "worktree /r/orbit-worktrees/ui/chore-ticket-7-part-1\nHEAD abc\nbranch refs/heads/chore/ticket-7-part-1\n"]] })
    prepare(scene)
    leftBehind(scene, { kind: "find", partNumber: 1, branch: "chore/ticket-7-part-1", worktree: "/r/orbit-worktrees/ui/chore-ticket-7-part-1" }, resultLine("Area: tools\n\nsrc/a.mjs:3 | class | fix"))
    await scene.run()
    const git = scene.calls.filter((entry) => entry[0] === "git").map((entry) => entry.slice(1).join(" "))
    same(`drive: the reap of a find worker keeps its worktree and branch when ${label}`, [git.some((text) => /worktree remove/.test(text)), git.some((text) => /branch -D/.test(text)), scene.messages.some((line) => line.includes("worktree-kept") && line.includes(reason))], [false, false, true])
  }
  await findKept("a process holds the worktree by its cwd", (scene) => { scene.env.worker.processDirectories = () => [{ pid: 5151, path: "/r/orbit-worktrees/ui/chore-ticket-7-part-1" }] }, "a process holds it: pid 5151")
  await findKept("the worktree holds another worktree", (scene) => { scene.env.findRepositories = (path) => [path, join(path, ".claude/worktrees/agent-1")] }, "it holds a repository or worktree")

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
  const branchOf = (number) => `chore/ticket-7-part-${number}`
  const missedPull = (number, extra = {}) => stuckPull(number, { headRef: branchOf(number), ...extra })
  const reports = (scene) => needsOwnerComments(scene.calls, 7).map((text) => text.split("\n")[1])

  const two = scenario({ tickets: [ticket(7, { comments: [forwardMark(branchOf(30)), forwardMark(branchOf(31))] })], pulls: { ui: [missedPull(30), missedPull(31)] } })
  await two.run()
  same("drive: two pull requests of one ticket that both miss a review in one tick are two reports, each labelled and notified", [only(two.calls, "editLabels").map((entry) => entry.slice(1, 3).join(":")), reports(two), only(two.calls, "notify").length], [["tickets:7"], [stopReason(30), stopReason(31)], 2])
  same("drive: a needs-owner report changes no label of an open pull request", only(two.calls, "editLabels").filter((entry) => entry[1] !== "tickets").length, 0)

  const later = scenario({ tickets: [ticket(7, { comments: [comment("needs-owner", stopReason(30)), forwardMark(branchOf(31))] })], pulls: { ui: [missedPull(31)] } })
  await later.run()
  same("drive: a later pull request of the ticket is reported after an earlier report of another pull request", [reports(later), only(later.calls, "editLabels").map((entry) => entry.slice(1, 3).join(":")), only(later.calls, "notify").length], [[stopReason(31)], ["tickets:7"], 1])

  const reportedAtOldHead = comment("needs-owner", stopReason(30))
  const newHead = scenario({ tickets: [ticket(7, { comments: [reportedAtOldHead, forwardMark(branchOf(30), NEXT_HEAD)] })], pulls: { ui: [missedPull(30, { headSha: NEXT_HEAD })] } })
  await newHead.run()
  same("drive: a later head of the same pull request is a new report", [reports(newHead), only(newHead.calls, "notify").length], [[stopReason(30, NEXT_HEAD)], 1])

  const restarted = scenario({ tickets: [ticket(7, { labels: ["repo:ui", "Improvement", OWNER_LABEL], comments: [reportedAtOldHead, forwardMark(branchOf(30))] })], pulls: { ui: [missedPull(30)] } })
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
  same("drive: two comments of one part launch nothing, whatever order the API lists them in", [part.launched.length, only(part.calls, "editLabels").length], [0, 1])
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
  same("drive: a pid file whose pid names a live program that is not a worker is never signaled by the clocks or the reap, and its record is reaped", [signals(stale), existsSync(staleRecord)], [[], false])

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
  const ownerOnly = (number) => [["--state merged", JSON.stringify([{ number: 30, body: `Tracks ${REPOSITORY}#${number}\n\nRemaining: owner: set the listing URL`, mergedAt: iso(-3600 * 1000), headRefName: `chore/ticket-${number}` }])]]
  const tickets = [ticket(7), ticket(8, { comments: [launchComment("build", "chore/ticket-8", -7200 * 1000)] }), ticket(9)]
  const scene = scenario({ tickets, sleeping: true, gitRoutes: [["ls-remote", `${HEAD}\trefs/heads/chore/ticket-7\n`]], routes: ownerOnly(8) })
  keepWrites(scene, tickets)
  leftBehind(scene, {}, resultLine("Done.\nNEEDS_DECISION: Raise the price?"))
  await scene.run()
  same("drive: sleep on: a NEEDS_DECISION and an owner-only Remaining line get a label and one comment each, and no notification", [only(scene.calls, "notify").length, only(scene.calls, "editLabels").map((entry) => entry.slice(1, 3).join(":")).sort(), slept(needsOwnerComments(scene.calls, 7)), slept(needsOwnerComments(scene.calls, 8))], [0, ["tickets:7", "tickets:8"], 1, 1])
  same("drive: sleep on: the driver keeps working on every other item", scene.launched.map((entry) => entry.worktree.split("/").at(-1)), ["chore-ticket-9"])
  same("drive: sleep on: each held item keeps its link for the wake notification", heldItems(scene).map((item) => item.link).sort(), [ISSUE_URL(7), ISSUE_URL(8)])
  const repeated = [ticket(8, { comments: [launchComment("build", "chore/ticket-8", -7200 * 1000)] })]
  const again = scenario({ tickets: repeated, sleeping: true, routes: ownerOnly(8) })
  keepWrites(again, repeated)
  await again.run()
  await again.run()
  same("drive: sleep on: a later tick holds no second item, posts no second comment and sends no notification", [heldItems(again).length, slept(needsOwnerComments(again.calls, 8)), only(again.calls, "notify").length], [1, 1, 0])

  const lines = []
  same("drive: --sleep off prints the state it reads back and the count of held items", [setSleep(scene.env, "off", { out: (line) => lines.push(line) }), readSleep(scene.env.stateDir).on, lines], [0, false, ["Sleep is off. The driver sends one notification for 2 held items on its next tick."]])
  await scene.run()
  const woken = only(scene.calls, "notify")
  same("drive: sleep off: one notification lists every item held during the sleep, each with its link", [woken.length, woken[0]?.[1].startsWith("Orbit: sleep ended. 2 items need you.\n"), woken[0]?.[1].includes(ISSUE_URL(7)), woken[0]?.[1].includes(ISSUE_URL(8)), woken[0]?.[1].includes("NEEDS_DECISION: Raise the price?")], [1, true, true, true, true])
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
  const paceOutputs = []
  const paceOff = setPace(cli.env, "worker", "off", { out: (line) => paceOutputs.push(line) })
  const afterOff = readUnpaced(cli.env.stateDir)
  const paceOn = setPace(cli.env, "worker", "on", { out: (line) => paceOutputs.push(line) })
  same("drive: --pace worker off turns off only the worker account's pace, and on turns it back on", [paceOff, afterOff, paceOn, readUnpaced(cli.env.stateDir), paceOutputs], [0, ["worker"], 0, [], ["The worker account runs 3 workers with no weekly pace until a worker ends on its usage limit.", "The worker account follows the weekly pace."]])
  same("drive: --pace takes an account and on or off, and nothing else", [parseArguments(["--pace", "worker", "off"]), parseArguments(["--pace", "main", "on"]).account, parseArguments(["--pace", "worker"]).error !== undefined, parseArguments(["--pace", "other", "off"]).error !== undefined, parseArguments(["--pace", "worker", "off", "--once"]).error !== undefined], [{ help: false, mode: "pace", account: "worker", word: "off" }, "main", true, true, true])
}

const QUESTIONS_ORDER = "/questions --auto"
const QUESTIONS_WORKTREE = "/r/orbit-worktrees/ui/questions"
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
  same("drive: questions: the run is headless in its own worktree and its order is the slash command", [run.worktree, run.order, run.pidFile, run.logFile.startsWith(join(first.env.stateDir, "logs", "questions-"))], [QUESTIONS_WORKTREE, QUESTIONS_ORDER, join(first.env.stateDir, "questions.pid"), true])
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
  writeFileSync(join(live.env.stateDir, "questions.pid"), `${JSON.stringify({ pid: process.pid, worktree: QUESTIONS_WORKTREE, startedAt: iso(-MINUTE) })}\n`)
  await live.run()
  same("drive: questions: a live run of an earlier driver process holds the next one back", questionRuns(live).length, 0)
  const plain = scenario({ tickets: [heldTicket(8)] })
  await plain.run()
  same("drive: questions: a tick with no driver worktree starts none", questionRuns(plain).length, 0)

  // The launch of the real worker writes the pid file of its child. The mock writes the same file, with a live pid.
  const livePidFile = (scene, worktree) => writeFileSync(join(scene.env.stateDir, "questions.pid"), `${JSON.stringify({ pid: process.pid, worktree, startedAt: iso(-MINUTE) })}\n`)
  const holding = (scene) => {
    const release = { leave: () => {} }
    scene.env.worker.launch = (options) => { scene.launched.push(options); if (options.order === QUESTIONS_ORDER) livePidFile(scene, options.worktree); return new Promise((resolve) => { release.leave = () => resolve({ exitCode: 0 }) }) }
    return release
  }

  const switching = driverScene({ tickets: [heldTicket(8)] })
  const release = holding(switching)
  const switchTick = await switching.run()
  same("drive: questions: a tick with a live run and a newer driver commit switches the driver in that tick", [switchTick.switched, switching.checkouts(), questionRuns(switching).length], [true, [`checkout --detach ${NEW_PIN}`], 1])
  same("drive: questions: the run starts in a worktree on origin/main, never the driver worktree", [switching.calls.some((entry) => entry[0] === "git" && entry[1] === "worktree" && entry.join(" ").includes(`add --detach ${QUESTIONS_WORKTREE} origin/main`)), questionRuns(switching).every((entry) => entry.worktree !== "/r/driver")], [true, true])

  // The restarted driver reads the pid file of the live run and starts no second one.
  const restarted = driverScene({ tickets: [heldTicket(8)], stateDirectory: switching.env.stateDir })
  const restartedResult = await restarted.run()
  same("drive: questions: the restarted driver adopts the live run and starts no second one", [questionRuns(restarted).length, restartedResult.switched], [0, true])
  release.leave()
  await switching.mem.questions

  const reused = scenario({ driver: {}, tickets: [heldTicket(8)], gitRoutes: [["worktree list", `worktree /r/ui\nHEAD ${OLD_PIN}\nbranch refs/heads/main\n\nworktree ${QUESTIONS_WORKTREE}\nHEAD ${OLD_PIN}\ndetached\n`]] })
  const reuse = holding(reused)
  await reused.run()
  same("drive: questions: a listed questions worktree moves to origin/main and is not added again", [reused.calls.some((entry) => entry.join(" ") === "git checkout --detach origin/main"), reused.calls.some((entry) => entry.join(" ").includes("worktree add"))], [true, false])
  reuse.leave()
  await reused.mem.questions

  const unadopted = driverScene({ tickets: [heldTicket(8)] })
  unadopted.env.worker.launch = (options) => { unadopted.launched.push(options); return new Promise(() => {}) }
  const unadoptedResult = await unadopted.run()
  same("drive: questions: a launch of this tick with no live pid file holds the switch, as a worker does", [unadoptedResult.switched, unadopted.checkouts()], [false, []])

  const overdue = driverScene({ driver: {}, tickets: [] })
  writeFileSync(join(overdue.env.stateDir, "questions.pid"), `${JSON.stringify({ pid: process.pid, worktree: QUESTIONS_WORKTREE, startedAt: new Date(NOW - WORKER_LIMITS.hardCeilingMs - MINUTE).toISOString() })}\n`)
  await overdue.run()
  await overdue.run()
  same("drive: questions: an adopted run past its hard ceiling gets SIGTERM, then SIGKILL on the next tick", only(overdue.calls, "kill"), [["kill", process.pid, "SIGTERM"], ["kill", process.pid, "SIGKILL"]])
  const young = driverScene({ driver: {}, tickets: [] })
  writeFileSync(join(young.env.stateDir, "questions.pid"), `${JSON.stringify({ pid: process.pid, worktree: QUESTIONS_WORKTREE, startedAt: iso(-MINUTE) })}\n`)
  await young.run()
  same("drive: questions: an adopted run inside its ceiling is left alone", only(young.calls, "kill"), [])
}

const REVIEW_ORDER = "/ticket --auto --parked"
const REVIEW_WORKTREE = "/r/orbit-worktrees/ui/harness-review"
const HOUR = 60 * MINUTE
const reviewRuns = (scene) => scene.launched.filter((entry) => entry.order === REVIEW_ORDER)
const reviewLines = (scene) => scene.messages.filter((line) => / harness-review (launch|exit|wait|refused|kill)/.test(line)).map((line) => line.slice(line.indexOf(" harness-review ") + 1))
const reviewStart = (scene) => { try { return JSON.parse(readFileSync(join(scene.env.stateDir, "harness-review.json"), "utf8")).startedAt } catch { return null } }
const startedReviewAt = (scene, offset) => writeFileSync(join(scene.env.stateDir, "harness-review.json"), `${JSON.stringify({ startedAt: iso(offset) })}\n`)
const reviewPidFile = (scene, offset = -MINUTE) => writeFileSync(join(scene.env.stateDir, "harness-review.pid"), `${JSON.stringify({ pid: process.pid, worktree: REVIEW_WORKTREE, startedAt: iso(offset) })}\n`)
const parkedTicket = (number = 8, extra = {}) => ticket(number, { labels: ["repo:ui", "Improvement", "parked"], ...extra })

/** The daily harness review of parked items: when it starts, how it runs, and the new branch of an item that it takes back. */
const harnessReviewCases = async () => {
  const reviewed = async (label, expected, options, before = () => {}) => {
    const scene = scenario({ driver: {}, ...options })
    before(scene)
    await scene.run()
    await scene.mem.harnessReview
    same(`drive: harness review: ${label}`, reviewRuns(scene).length, expected)
    return scene
  }

  const first = scenario({ driver: {}, tickets: [parkedTicket()], sleeping: true })
  let finish
  first.env.worker.launch = (options) => { first.launched.push(options); return new Promise((resolve) => { finish = () => resolve({ exitCode: 0 }) }) }
  await first.run()
  const [run] = reviewRuns(first)
  same("drive: harness review: a parked item and no review in 24 hours start exactly one run", first.launched.length, 1)
  same("drive: harness review: the run is headless in its own worktree, with its order, pid file and log", [run.worktree, run.order, run.pidFile, run.logFile.startsWith(join(first.env.stateDir, "logs", "harness-review-"))], [REVIEW_WORKTREE, REVIEW_ORDER, join(first.env.stateDir, "harness-review.pid"), true])
  same("drive: harness review: the run uses its own invocation on the coordinator model and the owner login", [run.invocation.command.args, run.invocation.environment.GH_TOKEN], [["--model", "claude-opus-5-5", "harness-review"], "owner-token"])
  same("drive: harness review: the start is kept in harness-review.json and the launch is logged", [reviewStart(first), reviewLines(first)], [iso(0), ["harness-review launch"]])
  await first.run()
  same("drive: harness review: the next tick starts none while the run is live", reviewRuns(first).length, 1)
  finish()
  await first.mem.harnessReview
  await first.run()
  same("drive: harness review: a second tick inside 24 hours starts none after the exit, and the exit is logged", [reviewRuns(first).length, reviewLines(first)], [1, ["harness-review launch", "harness-review exit (0)"]])
  const sleepFile = join(first.env.stateDir, "sleep-items.json")
  same("drive: harness review: the driver sends no notice, writes no sleep item and writes nothing to GitHub for the run", [only(first.calls, "notify").length, existsSync(sleepFile), first.messages.filter((line) => line.includes("sleep held")).length, only(first.calls, "comment").length, only(first.calls, "editLabels").length], [0, false, 0, 0, 0])

  await reviewed("no parked item means no run", 0, { tickets: [ticket(8)] })
  await reviewed("a needs:owner item alone means no run", 0, { tickets: [heldTicket(8)] })
  await reviewed("a parked pull request alone starts one run", 1, { tickets: [ticket(7)], pulls: { ui: [pull(30, { labels: ["parked"] })] } })
  await reviewed("a start 23 hours old starts none, as after a restart", 0, { tickets: [parkedTicket()] }, (scene) => startedReviewAt(scene, -23 * HOUR))
  await reviewed("a start exactly 24 hours old starts none", 0, { tickets: [parkedTicket()] }, (scene) => startedReviewAt(scene, -24 * HOUR))
  const daily = await reviewed("a start more than 24 hours old starts one", 1, { tickets: [parkedTicket()] }, (scene) => startedReviewAt(scene, -24 * HOUR - MINUTE))
  same("drive: harness review: the new start replaces the old one", reviewStart(daily), iso(0))
  await reviewed("the dry run starts none", 0, { tickets: [parkedTicket()], dryRun: true })
  const plain = scenario({ tickets: [parkedTicket()] })
  await plain.run()
  same("drive: harness review: a tick with no driver worktree starts none", reviewRuns(plain).length, 0)

  const both = scenario({ driver: {}, tickets: [ticket(7), parkedTicket()], token: "worker-token" })
  await both.run()
  await both.mem.harnessReview
  same("drive: harness review: the run takes no worker slot, so the admissible ticket starts on the worker token", both.launched.map((entry) => [entry.order === REVIEW_ORDER ? "review" : entry.worktree.split("/").at(-1), entry.invocation.environment.GH_TOKEN]).sort(), [["chore-ticket-7", "worker-token"], ["review", "owner-token"]])

  const stopped = await reviewed("the main account at 90% with no allowance starts none", 0, { tickets: [parkedTicket()], reading: { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE } })
  await stopped.run()
  same("drive: harness review: the stop is logged once with the parked item and the start stays unwritten", [reviewLines(stopped), reviewStart(stopped)], [["harness-review wait (the main account is stopped: ticket#8)"], null])
  await reviewed("the main account at 90% with the allowance starts one", 1, { tickets: [parkedTicket()], reading: { utilization: 0.92, resetsAt: RESETS_AT, at: NOW - MINUTE }, allowance: { resetsAt: RESETS_AT } })
  await reviewed("a signed-out login starts none", 0, { tickets: [parkedTicket()], auth: { ...AUTH, loggedIn: false } })
  const noLogin = await reviewed("a missing owner login starts none, also with a worker token", 0, { tickets: [parkedTicket()], ownerToken: null, token: "worker-token" })
  same("drive: harness review: a missing owner login is logged and the start stays unwritten", [reviewLines(noLogin), reviewStart(noLogin)], [["harness-review refused (no owner gh login: run gh auth login)"], null])
  await reviewed("a live run of an earlier driver process holds the next one back", 0, { tickets: [parkedTicket()] }, (scene) => reviewPidFile(scene))

  const switching = driverScene({ tickets: [parkedTicket()] })
  let leave = () => {}
  switching.env.worker.launch = (options) => { switching.launched.push(options); reviewPidFile(switching); return new Promise((resolve) => { leave = () => resolve({ exitCode: 0 }) }) }
  const switchTick = await switching.run()
  same("drive: harness review: a live run with its pid file does not hold the driver switch", [switchTick.switched, reviewRuns(switching).length], [true, 1])
  leave()
  await switching.mem.harnessReview
  const unadopted = driverScene({ tickets: [parkedTicket()] })
  unadopted.env.worker.launch = (options) => { unadopted.launched.push(options); return new Promise(() => {}) }
  const unadoptedResult = await unadopted.run()
  same("drive: harness review: a launch with no live pid file holds the switch, as a worker does", [unadoptedResult.switched, unadopted.checkouts()], [false, []])

  const overdue = driverScene({ driver: {}, tickets: [] })
  reviewPidFile(overdue, -WORKER_LIMITS.hardCeilingMs - MINUTE)
  await overdue.run()
  await overdue.run()
  same("drive: harness review: an adopted run past its hard ceiling gets SIGTERM, then SIGKILL on the next tick", [only(overdue.calls, "kill"), reviewLines(overdue).length], [[["kill", process.pid, "SIGTERM"], ["kill", process.pid, "SIGKILL"]], 1])

  // The review removes `parked`. Each branch that launched before the park counts as used, so the new plan has its own launches.
  const OPUS = "claude-opus-5-5"
  const ladder = (branch, kind = "build", part = null) => [launchComment(kind, branch, -50 * HOUR, part), launchComment(kind, branch, -49 * HOUR, part), launchComment(kind, branch, -48 * HOUR, part, { model: OPUS })]
  const park = comment("parked", "Parked by the driver.", -40 * HOUR)
  const replanned = (branch, offset) => [comment("replan", JSON.stringify({ plan: "fresh", branch, pr: null, part: null, count: 1, at: iso(offset) }), offset), launchComment("replan", "chore/ticket-7-replan", offset - MINUTE, null, { model: OPUS })]
  const takenBack = async (label, comments, expected, extra = {}) => {
    const scene = scenario({ tickets: [ticket(7, { comments })], ...extra })
    await scene.run()
    const record = commentsOf(scene.calls, 7).filter((text) => text.startsWith(marked("launch", ""))).map((text) => JSON.parse(text.split("\n").slice(1).join("\n")))[0]
    same(`drive: harness review: ${label}`, [record?.kind, record?.branch, record?.model, commentsOf(scene.calls, 7).filter((text) => text.startsWith(marked("parked", ""))).length], [...expected, 0])
  }
  await takenBack("a ticket that the review took back builds on a new branch on the worker model", [...ladder("chore/ticket-7"), park], ["build", "chore/ticket-7-r2", "claude-sonnet-5-5"])
  await takenBack("a ticket that parked after its re-plans skips every left branch", [...ladder("chore/ticket-7"), ...replanned("chore/ticket-7", -47 * HOUR), ...ladder("chore/ticket-7-r2"), park], ["build", "chore/ticket-7-r3", "claude-sonnet-5-5"])
  const newSet = [1, 2].map((number) => comment(null, `## Part ${number} of 3: new ${number}`, -(39 * HOUR) + number))
  await takenBack("a new part set of the review builds its open part on a new branch and keeps the merged part", [...ladder("chore/ticket-7-part-2", "build part", 2), park, ...newSet, comment(null, "## Part 3 of 3: new 3", -39 * HOUR + 3)], ["build part", "chore/ticket-7-part-2-r2", "claude-sonnet-5-5"], { routes: [mergedRoute(7, [mergedPull(7, "chore/ticket-7-part-1", "Remaining: part 2")])] })
  await takenBack("a branch with a launch only after the park keeps its name and its count", [...ladder("chore/ticket-7"), park, launchComment("build", "chore/ticket-7-r2", -30 * HOUR), launchComment("build", "chore/ticket-7-r2", -29 * HOUR)], ["build", "chore/ticket-7-r2", OPUS])
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
  const stems = ["chore-ticket-7", "chore-ticket-8", "chore-ticket-9"]
  const recordPaths = stems.map((stem, index) => {
    const path = leftBehind(busy, { ticketNumber: 7 + index, branch: stem.replace("chore-", "chore/") }, "", stem)
    writeFileSync(join(busy.env.stateDir, `${stem}.pid`), `${JSON.stringify({ pid: process.pid, worktree: "/w", startedAt: iso(0) })}\n`)
    return path
  })
  const busyResult = await busy.run()
  same("drive: a main commit that changes the driver switches the driver while 3 workers run, and their launch records and pid files stay", [busyResult.switched, busy.checkouts(), pinOf(busy).to, recordPaths.every((path) => existsSync(path)), stems.every((stem) => existsSync(join(busy.env.stateDir, `${stem}.pid`)))], [true, [`checkout --detach ${NEW_PIN}`], NEW_PIN, true, true])

  const restarted = driverScene({ head: NEW_PIN, main: NEW_PIN, stateDirectory: busy.env.stateDir })
  restarted.mem.account = { key: ACCOUNT.key, email: AUTH.email, orgId: AUTH.orgId }
  const restartedResult = await restarted.run()
  same("drive: after the restart the 3 workers are still running: no reap, no new launch on their branches", [restartedResult.switched, recordPaths.every((path) => existsSync(path)), restarted.launched.length], [false, true, 0])

  const adopted = scenario({ tickets: [ticket(7), ticket(8), ticket(9)] })
  adopted.env.processAlive = (pid) => pid === 4343
  adopted.env.pidHeld = (pid) => pid === 4343
  const pidFileOfStem = (stem) => join(adopted.env.stateDir, `${stem}.pid`)
  const pids = { "chore-ticket-7": 4242, "chore-ticket-8": 4343 }
  Object.entries(pids).forEach(([stem, pid], index) => {
    leftBehind(adopted, { ticketNumber: 7 + index, branch: stem.replace("chore-", "chore/") }, "", stem)
    writeFileSync(pidFileOfStem(stem), `${JSON.stringify({ pid, worktree: "/w", startedAt: iso(0) })}\n`)
  })
  leftBehind(adopted, { ticketNumber: 9, branch: "chore/ticket-9" }, "", "chore-ticket-9")
  adopted.mem.results.set("chore-ticket-9", { ...clean })
  await adopted.run()
  same("drive: the reap of an adopted worker kills its process group, and leaves a live worker and a worker that this process reaped", [only(adopted.calls, "kill"), existsSync(pidFileOfStem("chore-ticket-7")), existsSync(pidFileOfStem("chore-ticket-8"))], [[["kill", 4242, "SIGKILL"]], false, true])

  const owned = driverScene()
  owned.mem.running.set("chore-ticket-7", Promise.resolve())
  writeFileSync(join(owned.env.stateDir, "chore-ticket-7.pid"), `${JSON.stringify({ pid: process.pid, worktree: "/w", startedAt: iso(0) })}\n`)
  leftBehind(owned, {})
  same("drive: a worker of this process that has a live pid file is no block for the switch", [(await owned.run()).switched, owned.checkouts()], [true, [`checkout --detach ${NEW_PIN}`]])

  const unadoptable = driverScene()
  unadoptable.mem.running.set("chore-ticket-7", Promise.resolve())
  same("drive: no switch while a launch of this process has no live pid file to adopt", [(await unadoptable.run()).switched, unadoptable.checkouts()], [false, []])

  const unreaped = driverScene()
  unreaped.mem.results.set("chore-ticket-7", { exitCode: 0 })
  same("drive: no switch while a result of this process waits for its reap", [(await unreaped.run()).switched, unreaped.checkouts()], [false, []])

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
  same("drive: three crashes within ten minutes check the previous commit out, write the pin, send one notification and open one harness Bug issue", [outcomes, rolled.checkouts(), pinOf(rolled).rolledBack, pinOf(rolled).from, pinOf(rolled).to, only(rolled.calls, "notify").length, only(rolled.calls, "createTicket").length, only(rolled.calls, "createTicket")[0]?.[1].labels], [[false, false, false, true], [`checkout --detach ${OLD_PIN}`], true, NEW_PIN, OLD_PIN, 1, 1, BUG_LABELS])
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

  // The main account holds the Pullfrog request while the worker account has slots: the hold is chosen, so it starts nothing and posts nothing.
  const holdOf = async (label, { reading, usageLimit }) => {
    const scene = scenario({ tickets: [ticket(8)], pulls: { ui: [waitingPull] }, reading, workerAuth: WORKER_AUTH, workerReading: below, probeReading: { utilization: 0.5, resetsAt: RESETS_AT, status: "rejected" } })
    if (usageLimit) scene.mem.stoppedUntil = NOW + 60 * MINUTE
    await scene.run()
    same(`drive: ${label} starts no worker and posts no request`, [scene.launched.length, commentsOf(scene.calls, 30).length], [0, 0])
  }
  await holdOf("main at 0.92 with the worker account at 0.35 and one pull request waiting for its first review", { reading: stoppedReading })
  await holdOf("main stopped by a usage limit with the worker account at 0.35 and one pull request waiting for its first review", { reading: below, usageLimit: true })

  const both = scenario({ tickets: [ticket(7), ticket(8), ticket(9), ticket(10), ticket(11)], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  await both.run()
  same("drive: both accounts below their lines give the sum of their slots, and the worker account fills first", both.launched.map(accountOfLaunch), [WORKER_DIRECTORY, WORKER_DIRECTORY, null, null])
  const line = both.messages.find((entry) => entry.includes(" pace "))
  same("drive: the pace line names both accounts by key with their slots and stop state", [line.includes(`main ${ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 0, free 2, stop no`), line.includes(`worker ${WORKER_ACCOUNT.key}: utilization 0.350, line 0.450, slots 2, running 0, free 2, stop no`)], [true, true])
  same("drive: no log line, issue or notification holds an email of either account", JSON.stringify([both.messages, both.calls]).match(/@example/g), null)

  const unpaced = scenario({ tickets: [ticket(7), ticket(8), ticket(9), ticket(10)], reading: stoppedReading, workerAuth: WORKER_AUTH, workerReading: stoppedReading })
  writeFileSync(join(unpaced.env.stateDir, "pace-setting.json"), `${JSON.stringify({ main: { paced: true }, worker: { paced: false } })}\n`)
  await unpaced.run()
  const unpacedLine = unpaced.messages.find((entry) => entry.includes(" pace "))
  same("drive: the worker account with its pace off runs 3 workers over 90%, and the main account keeps its 90% stop", [unpaced.launched.map(accountOfLaunch), unpacedLine.includes(`worker ${WORKER_ACCOUNT.key}: utilization 0.920, line unknown, slots 3, running 0, free 3, stop no`), unpacedLine.includes(`main ${ACCOUNT.key}: utilization 0.920`) && unpacedLine.includes("stop yes")], [[WORKER_DIRECTORY, WORKER_DIRECTORY, WORKER_DIRECTORY], true, true])

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
  const pullfrogLimitedMany = scenario({ tickets: [ticket(7), ticket(8), ticket(9), ticket(10)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun], routes: [["--log-failed", limitLine]], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  await pullfrogLimitedMany.run()
  same("drive: with two accounts a Pullfrog usage limit that a plan found starts no launch on the main account, even with orders left", pullfrogLimitedMany.launched.map(accountOfLaunch), [WORKER_DIRECTORY, WORKER_DIRECTORY])
  // A fix order whose build session is on the main account starts cold on the worker account when a plan found a Pullfrog limit, and it does not end the launches of the tick.
  const lowReading = { utilization: 0.1, resetsAt: RESETS_AT, at: NOW - MINUTE }
  const sessionComment = comment("launch-session", JSON.stringify({ kind: "build", part: null, branch: "chore/ticket-7-30", pr: 30, session: "sess-1", account: ACCOUNT.key, tokens: 90000 }))
  const blockingReview = review(CHANGES_REQUESTED, HEAD, -5 * MINUTE, { blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }] })
  const sessionLimited = scenario({ tickets: [ticket(7, { comments: [sessionComment] }), ticket(8)], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-30", reviews: [blockingReview] }), pull(31, { reviews: [], tracks: 8, headRef: "chore/ticket-8-31" })] }, runs: [{ ...failedRun, displayTitle: `Respond to mention on #${31} [abc]` }], routes: [["--log-failed", limitLine]], reading: lowReading, workerAuth: WORKER_AUTH, workerReading: lowReading })
  await sessionLimited.run()
  same("drive: with two accounts a fix order of a main account session starts cold on the worker account when a plan found a Pullfrog limit", [sessionLimited.launched.map(accountOfLaunch), sessionLimited.launched[0]?.invocation.command.args], [[WORKER_DIRECTORY], []])
  const pullfrogLimitedQuestions = scenario({ driver: {},tickets: [ticket(7), heldTicket(8)], pulls: { ui: [pull(30, { reviews: [] })] }, runs: [failedRun], routes: [["--log-failed", limitLine]], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  await pullfrogLimitedQuestions.run()
  await pullfrogLimitedQuestions.mem.questions
  same("drive: with two accounts a Pullfrog usage limit that a plan found starts no questions run on the main account", [questionRuns(pullfrogLimitedQuestions).length, questionLines(pullfrogLimitedQuestions), startedFile(pullfrogLimitedQuestions)], [0, ["questions wait (a Pullfrog limit stops the main account: ticket#8)"], null])
  // The early admission chooses 8 to 11, and the limit that the plan finds stops the early launch before it starts one. Those tickets go back to the late admission.
  const unreached = scenario({ tickets: [7, 8, 9, 10, 11, 12, 13, 14].map((number) => ticket(number)), pulls: { ui: [pull(30, { reviews: [], tracks: 7, headRef: "chore/ticket-7-30" })] }, runs: [{ ...failedRun, displayTitle: `Respond to mention on #${30} [abc]` }], routes: [["--log-failed", limitLine], ["--state merged", async () => { releaseUnreached(); await until(() => logReads(unreached).length > 0); await new Promise((resolve) => setTimeout(resolve, 20)); return "[]" }]], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
  unreached.env.planWindowMs = 20
  const releaseUnreached = holdPlan(unreached)
  const unreachedResult = await unreached.run()
  same("drive: an early order that never starts goes back to the late admission, so the ticket below it takes no free slot", [launchesIn(unreached), unreached.messages.some((line) => line.includes("early-launch"))], [["8 build", "9 build"], true])
  const lineOf = (number) => unreachedResult.lines.find((line) => line.startsWith(`ticket ${REPOSITORY}#${number}:`))
  same("drive: the tick lines name no admit for a ticket whose early order never started", [10, 11].map(lineOf), [10, 11].map((number) => `ticket ${REPOSITORY}#${number}: wait: a Pullfrog limit stops the main account`))
  // The plan finds the limit while an early start prepares its worktree. A start on the main account launches no worker and takes its launch back.
  const limitMidStart = async (numbers, midNumber) => {
    const tickets = numbers.map((number) => ticket(number))
    const scene = scenario({ tickets, pulls: { ui: [pull(30, { reviews: [], tracks: 7, headRef: "chore/ticket-7-30" })] }, runs: [failedRun], routes: [["--log-failed", limitLine]], reading: below, workerAuth: WORKER_AUTH, workerReading: below })
    keepWrites(scene, tickets)
    scene.env.planWindowMs = 20
    const release = holdPlan(scene)
    const git = scene.env.git
    scene.env.git = async (cwd, args) => {
      if (args[0] === "worktree" && args[1] === "add" && args.includes(`chore/ticket-${midNumber}`)) { release(); await until(() => scene.mem.stoppedUntil !== null) }
      return git(cwd, args)
    }
    const { lines } = await scene.run()
    const midTicket = tickets.find((entry) => entry.number === midNumber)
    return { scene, midTicket, midLine: lines.find((line) => line.startsWith(`ticket ${REPOSITORY}#${midNumber}:`)) }
  }
  const midStop = await limitMidStart([7, 8, 9, 10], 10)
  same("drive: a Pullfrog limit that arrives while a start on the main account prepares its worktree launches no worker on that account", [midStop.scene.launched.map(accountOfLaunch), midStop.midLine], [[WORKER_DIRECTORY, WORKER_DIRECTORY], `ticket ${REPOSITORY}#${midStop.midTicket.number}: wait: a Pullfrog limit stops the main account`])
  same("drive: the start that a limit stops is refunded, so it counts toward no cap and leaves no launch record", [midStop.midTicket.comments.map((entry) => entry.kind), launchesOf(midStop.midTicket).length, existsSync(join(midStop.scene.env.stateDir, "chore-ticket-10.launch.json"))], [["launch", "launch-refund"], 0, false])
  const midWorker = await limitMidStart([7, 8], 8)
  same("drive: a limit that arrives while a start on the worker account prepares its worktree leaves that worker to start", [midWorker.scene.launched.map(accountOfLaunch), launchesOf(midWorker.midTicket).length], [[WORKER_DIRECTORY], 1])

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
  same("drive: a held API step files one harness Bug ticket that names the step, with no needs:owner comment and no needs:owner label", [created.length, created[0]?.[1].labels, created[0]?.[1].body.includes("api-staging"), only(held.calls, "comment").length], [1, BUG_LABELS, true, 0])
  same("drive: a held release step looks for an open ticket by the harness label", only(held.calls, "gh").filter((entry) => entry[1].startsWith("issue list")).map((entry) => entry[1].includes("--label harness") && !entry[1].includes(OWNER_LABEL)), [true])
  const heldAsleep = scenario({ releasePorts: fakePorts([], { migration: true }), sleeping: true })
  await heldAsleep.run()
  same("drive: while sleep is on, a held release step opens a Bug ticket and writes no sleep item", [only(heldAsleep.calls, "createTicket").map((entry) => entry[1].labels), existsSync(join(heldAsleep.env.stateDir, "sleep-items.json")) ? JSON.parse(readFileSync(join(heldAsleep.env.stateDir, "sleep-items.json"), "utf8")) : []], [[BUG_LABELS], []])
  await held.run()
  same("drive: the next tick of a train with a held step files no second ticket", only(held.calls, "createTicket").length, 1)

  const asleep = scenario({ releasePorts: fakePorts([]), sleeping: true })
  await asleep.run()
  T("drive: sleep mode does not stop the train", asleep.messages.some((line) => line.includes(" release train ") && line.includes(" start: ")), asleep.messages.join("\n"))

  same("drive: --release-now and --release-status are modes", [parseArguments(["--release-now"]).mode, parseArguments(["--release-status"]).mode, parseArguments(["--release-now", "--once"]).error !== undefined], ["release-now", "release-status", true])
  const usage = await usageText()
  T("drive: the usage names the release train and both flags", /release train/.test(usage) && /--release-now/.test(usage) && /--release-status/.test(usage), usage)
}

/** The driver log says each hold and each wait once, an owner report keys on pull request, head and cause, and a check that cannot change is not rerun. */
const quietLogCases = async () => {
  // A launch cap is no hold, and a technical stop parks. The hold here is a conflict that a merge-forward launch left.
  const marks = [forwardMark("chore/ticket-7-30"), forwardMark("chore/ticket-7-30", NEXT_HEAD)]
  const barrier = () => stuckPull(30)
  const BARRIER = []
  const heldItems = (scene) => JSON.parse(readFileSync(join(scene.env.stateDir, "sleep-items.json"), "utf8"))
  const holdLines = (scene) => scene.messages.filter((line) => line.includes(" needs-owner ("))

  const tickets = [ticket(7, { comments: [...marks] })]
  const three = scenario({ tickets, pulls: { ui: [barrier()] }, failedSteps: BARRIER })
  keepWrites(three, tickets)
  for (let index = 0; index < 3; index += 1) await three.run()
  same("drive: the same hold on 3 ticks logs one needs-owner line and writes one report", [holdLines(three).length, needsOwnerComments(three.calls, 7).length, only(three.calls, "notify").length], [1, 1, 1])
  T("drive: the hold line names the pull request, the head and the check", holdLines(three)[0].includes(`ui#30 at ${HEAD}`) && holdLines(three)[0].includes("merge conflict"))

  // A driver switch ends the process, so the next process starts with an empty log memory: the report in the comment still gates the line.
  for (let restart = 0; restart < 3; restart += 1) {
    const fresh = createMemory()
    fresh.reading = three.mem.reading
    fresh.lastIntakeAt = NOW
    await tick(three.env, fresh)
    await Promise.all(fresh.running.values())
  }
  same("drive: a hold that was reported keeps one needs-owner line, one report and one notification across 3 restarts of the memory", [holdLines(three).length, needsOwnerComments(three.calls, 7).length, only(three.calls, "notify").length], [1, 1, 1])

  // A hold that goes on keeps its log memory when a tick does not plan its item: a merge ends the pull loop and a plan can throw.
  const holdOf = (scene) => holdLines(scene).filter((line) => line.includes("ui#30 needs-owner ("))
  const merged = [ticket(7, { comments: [...marks] }), ticket(8)]
  const other = pull(20, { tracks: 8, body: "Tracks thomasluizon/orbit-tickets#8\n\nRemaining: none", headRef: "chore/ticket-8-20", draft: true })
  const mergePulls = [other, barrier()]
  const afterMerge = scenario({ tickets: merged, pulls: { ui: mergePulls }, failedSteps: BARRIER })
  keepWrites(afterMerge, merged)
  await afterMerge.run()
  other.draft = false
  await afterMerge.run()
  mergePulls.splice(0, 1)
  await afterMerge.run()
  same("drive: a merge before a held pull request in the same tick keeps one needs-owner line and one report for the hold", [only(afterMerge.calls, "merge").length, holdOf(afterMerge).length, needsOwnerComments(afterMerge.calls, 7).length], [1, 1, 1])

  const thrown = [ticket(7, { comments: [...marks] })]
  const failing = scenario({ tickets: thrown, pulls: { ui: [barrier()] }, failedSteps: BARRIER })
  keepWrites(failing, thrown)
  const namingRuns = failing.env.github.runsNaming
  let failNext = false
  failing.env.github.runsNaming = (...input) => { if (failNext) { failNext = false; throw new Error("gh read failed") } return namingRuns(...input) }
  await failing.run()
  failNext = true
  await failing.run()
  await failing.run()
  same("drive: a plan that throws once keeps one needs-owner line for a hold that goes on", [failing.messages.filter((line) => line.includes("ui#30 error (gh read failed)")).length, holdOf(failing).length], [1, 1])

  const changed = [ticket(7, { comments: [...marks] })]
  const scene = scenario({ tickets: changed, pulls: { ui: [barrier()] }, sleeping: true })
  keepWrites(scene, changed)
  await scene.run()
  await scene.run()
  same("drive: the same pull request, head and cause keeps one report, one log line and one sleep item", [needsOwnerComments(scene.calls, 7).length, holdLines(scene).length, heldItems(scene).length], [1, 1, 1])
  scene.env.now = () => NOW
  const states = scene.env.github.readRepositoryState
  scene.env.github.readRepositoryState = async (key) => { const state = await states(key); for (const entry of state.pulls) Object.assign(entry, { headSha: NEXT_HEAD, commits: [{ sha: NEXT_HEAD, parents: 1 }] }); return state }
  await scene.run()
  same("drive: a new head of the same pull request is a new report and a new sleep item", [needsOwnerComments(scene.calls, 7).length, holdLines(scene).length, heldItems(scene).length], [2, 2, 2])

  const waiting = scenario({ tickets: [ticket(7, { blockedBy: [blocker(5)] })] })
  for (let index = 0; index < 3; index += 1) await waiting.run()
  const waits = waiting.messages.filter((line) => line.includes(" ticket#7 wait ("))
  same("drive: a ticket wait reason is logged once outside --dry-run", waits.length, 1)

  const running = (extra = {}) => pull(30, { checks: [check("Unit Tests", "FAILURE"), check("Lint", null, { status: "IN_PROGRESS", conclusion: null, databaseId: 13, ...extra }), approvalCheck()] })
  const busy = scenario({ tickets: [ticket(7)], pulls: { ui: [running()] }, failedSteps: ["Set up job"] })
  await busy.run()
  await busy.run()
  same("drive: a failed job of a run that still runs gets no rerun request and no order", [only(busy.calls, "rerunFailed").length, busy.launched.length, busy.messages.filter((line) => line.includes("ui#30 wait (") && line.includes("still runs")).length], [0, 0, 1])
  const done = scenario({ tickets: [ticket(7)], pulls: { ui: [running({ status: "COMPLETED", conclusion: "SUCCESS" })] }, failedSteps: ["Set up job"] })
  await done.run()
  same("drive: the same failed job is rerun once the run has ended", only(done.calls, "rerunFailed"), [["rerunFailed", "ui", "9001"]])

  for (const [name, steps] of [["PR Metadata", ["Set up job"]], ["PR Metadata", ["Check the body"]], ["Guards", ["Set up job"]], ["Guards", ["Run guards"]]]) {
    const deterministic = scenario({ tickets: [ticket(7)], pulls: { ui: [pull(30, { checks: [check(name, "FAILURE"), approvalCheck()] })] }, failedSteps: steps })
    await deterministic.run()
    same(`drive: ${name} that failed at ${steps[0]} is never rerun and gets one ci-fix order`, [only(deterministic.calls, "rerunFailed").length, deterministic.launched.length, commentsOf(deterministic.calls, 30).filter((text) => text.includes("driver rerun")).length], [0, 1, 0])
  }

  // The merge bar names `needs-owner` and `behind:N`. A pull request that carries `needs:owner` waits with one stable reason, so the log holds no `needs-owner` line for it.
  const approved = pull(30, { labels: [OWNER_LABEL], mergeState: "BEHIND", behindBy: 1 })
  const behindScene = scenario({ tickets: [ticket(7)], pulls: { ui: [approved] } })
  for (const behindBy of [1, 1, 2, 3]) {
    approved.behindBy = behindBy
    await behindScene.run()
  }
  for (const behindBy of [4, 5]) {
    approved.behindBy = behindBy
    const fresh = createMemory()
    fresh.reading = behindScene.mem.reading
    fresh.lastIntakeAt = NOW
    await tick(behindScene.env, fresh)
    await Promise.all(fresh.running.values())
  }
  same("drive: an approved pull request that carries needs:owner and falls behind logs no needs-owner line across ticks and fresh memories", [behindScene.messages.filter((line) => line.includes("needs-owner")).length, behindScene.messages.filter((line) => line.includes("ui#30 wait (carries needs:owner)")).length, only(behindScene.calls, "merge").length, only(behindScene.calls, "updateBranch").length], [0, 3, 0, 0])
}

const noticeCases = async () => {
  const BOT_TOKEN = "123456:bot-secret"
  const CHAT_ID = "4242"
  const ITEMS = { "telegram-bot-token": BOT_TOKEN, "telegram-chat-id": CHAT_ID }
  const ISSUE_URL = (number) => `https://github.com/${REPOSITORY}/issues/${number}`
  const asking = { limit: { exitCode: 0, result: { usageLimitReached: false, authenticationFailed: false, error: null, needsDecision: "Raise the price?" } } }
  const capped = () => [ticket(8, { title: "Show the streak on the widget" })]
  const phone = (options = {}, items = ITEMS) => {
    const scene = scenario({ ...asking, ...options })
    scene.env.keychain = async (item) => items[item] ?? null
    return scene
  }
  const sent = (scene) => only(scene.calls, "fetch").map((entry) => ({ url: entry[1], method: entry[2].method, ...JSON.parse(entry[2].body) }))
  const noticeLines = (scene) => scene.messages.filter((line) => line.includes(" notice "))
  const stored = (scene, file) => JSON.parse(readFileSync(join(scene.env.stateDir, file), "utf8"))

  const tickets = capped()
  const owed = phone({ tickets })
  keepWrites(owed, tickets)
  await owed.run()
  await owed.run()
  const [message] = sent(owed)
  same("drive: a new needs:owner item sends one Telegram message and no macOS notification, also after a second tick", [sent(owed).length, only(owed.calls, "notify").length], [1, 0])
  same("drive: the message goes to sendMessage with the chat id and no link preview", [message?.url, message?.method, message?.chat_id, message?.link_preview_options], [`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, "POST", CHAT_ID, { is_disabled: true }])
  same("drive: the message names the ticket, the cause and the link", message?.text.split("\n"), ["Orbit needs you: Show the streak on the widget", "chore/ticket-8: NEEDS_DECISION: Raise the price?", ISSUE_URL(8)])
  same("drive: the log keeps one line for the sent notice and no line holds the bot token", [noticeLines(owed).map((line) => line.includes(" notice sent (telegram: Orbit needs you: ")), owed.messages.join("\n").includes(BOT_TOKEN)], [[true], false])

  const asleepTickets = capped()
  const asleep = phone({ tickets: asleepTickets, sleeping: true })
  keepWrites(asleep, asleepTickets)
  await asleep.run()
  await asleep.run()
  same("drive: with sleep on nothing is sent and the item lands in sleep-items.json", [sent(asleep).length, only(asleep.calls, "notify").length, stored(asleep, "sleep-items.json").map((item) => item.link)], [0, 0, [ISSUE_URL(8)]])
  setSleep(asleep.env, "off", { out: () => {} })
  await asleep.run()
  await asleep.run()
  same("drive: sleep off sends the held list to Telegram in one message", sent(asleep).map((entry) => [entry.text.startsWith("Orbit: sleep ended. 1 item needs you.\n"), entry.text.endsWith(ISSUE_URL(8))]), [[true, true]])

  const many = phone({})
  const held = Array.from({ length: 90 }, (_, index) => ({ link: ISSUE_URL(1000 + index), reason: `ui#30 at ${HEAD}: ${"A long cause. ".repeat(20)}` }))
  writeFileSync(join(many.env.stateDir, "sleep-items.json"), JSON.stringify(held))
  await many.run()
  const summary = sent(many)[0]?.text ?? ""
  const listed = summary.split("\n").filter((line) => line.startsWith("https://"))
  same("drive: a list over the message limit stays one message of whole links that counts the rest, with no head sha", [sent(many).length, summary.length <= 4096, listed.every((line, index) => line === held[index].link), summary.endsWith(`And ${held.length - listed.length} more. Run /driver to see them.`), summary.includes(HEAD)], [1, true, true, true, false])

  for (const missing of ["telegram-bot-token", "telegram-chat-id"]) {
    const without = phone({ tickets: capped() }, { ...ITEMS, [missing]: null })
    await without.run()
    await without.run()
    same(`drive: with no ${missing} item the notice is a macOS notification and one log line names the item`, [sent(without).length, only(without.calls, "notify").length, noticeLines(without).map((line) => line.includes(`notice sent (osascript, the Keychain item ${missing} is missing: `))], [0, 1, [true]])
  }

  const refusedTickets = capped()
  const refused = phone({ tickets: refusedTickets })
  keepWrites(refused, refusedTickets)
  const accept = refused.env.fetch
  refused.env.fetch = async (...args) => { await accept(...args); return { status: 401, json: async () => ({ ok: false, error_code: 401, description: "Unauthorized" }) } }
  await refused.run()
  await refused.run()
  await refused.run()
  same("drive: a notice that Telegram refuses shows once on the Mac and each tick sends it again", [sent(refused).length, only(refused.calls, "notify").length, stored(refused, "notices.json").pending.length, noticeLines(refused).every((line) => line.includes("notice unsent (Telegram: HTTP 401: Unauthorized."))], [2, 1, 1, true])
  writeFileSync(join(refused.env.stateDir, "sleep.json"), JSON.stringify({ on: true, since: iso(0) }))
  await refused.run()
  same("drive: sleep on holds a notice that waits for Telegram", sent(refused).length, 2)
  writeFileSync(join(refused.env.stateDir, "sleep.json"), JSON.stringify({ on: false, since: iso(0) }))
  refused.env.fetch = accept
  await refused.run()
  await refused.run()
  same("drive: the notice goes out once when Telegram takes it", [sent(refused).length, only(refused.calls, "notify").length, stored(refused, "notices.json").pending], [3, 1, []])

  const unreachable = phone({ tickets: capped() })
  unreachable.env.fetch = async (url) => { throw new TypeError("fetch failed", { cause: new Error(`connect to ${url} timed out`) }) }
  await unreachable.run()
  await unreachable.run()
  same("drive: a network error that quotes the address logs no bot token and keeps the notice", [unreachable.messages.join("\n").includes(BOT_TOKEN), stored(unreachable, "notices.json").pending.length, noticeLines(unreachable)[0]?.includes("bot<token>/sendMessage")], [false, 1, true])

  const finished = phone({ tickets: [ticket(7, { title: "Fix the widget count" })], routes: [["--state merged", JSON.stringify([{ number: 29, body: "Tracks thomasluizon/orbit-tickets#7\n\nRemaining: none", mergedAt: iso(-60 * MINUTE), headRefName: "chore/ticket-7" }])]] })
  await finished.run()
  await finished.run()
  same("drive: a finished ticket sends one notice with its title and link, also while GitHub still lists it", sent(finished).map((entry) => entry.text), [`Orbit finished: Fix the widget count\nIts last pull request is merged.\n${ISSUE_URL(7)}`])

  const noToken = phone({ tickets: [ticket(7)], token: null })
  await noToken.run()
  const restarted = phone({ tickets: [ticket(7)], token: null, stateDirectory: noToken.env.stateDir })
  await restarted.run()
  const returned = phone({ tickets: [ticket(7)], stateDirectory: noToken.env.stateDir })
  await returned.run()
  const lost = phone({ tickets: [ticket(9)], token: null, stateDirectory: noToken.env.stateDir })
  await lost.run()
  same("drive: a restart repeats no notice of the same cause, and the cause that comes back is told again", [sent(noToken).length, sent(restarted).length, sent(returned).length, sent(lost).length], [1, 0, 0, 1])

  const blind = phone({ reading: null, probeReading: null })
  await blind.run()
  blind.env.now = () => NOW + 61 * MINUTE
  blind.mem.lastIntakeAt = NOW + 61 * MINUTE
  await blind.run()
  same("drive: a probe that fails again an hour later sends no second notice", [only(blind.calls, "probe").length, sent(blind).filter((entry) => entry.text.includes("cannot read the weekly usage")).length], [2, 1])

  const unopened = phone({ tickets: [ticket(7)], auth: { ...AUTH, loggedIn: false } })
  unopened.env.github.createTicket = async () => { throw new Error("HTTP 502") }
  for (let round = 0; round < 2; round++) await unopened.run().catch(() => {})
  same("drive: a problem whose issue cannot be opened is still told once, with no link", sent(unopened).map((entry) => entry.text), ["Orbit starts no new work: Claude is signed out on the Mac.\nRun claude auth login to start work again."])

  const dry = phone({ tickets: capped(), dryRun: true })
  writeFileSync(join(dry.env.stateDir, "notices.json"), JSON.stringify({ sent: [], held: [], pending: ["Waiting notice"] }))
  await dry.run()
  same("drive: a dry run sends nothing, not even a notice that waits", [sent(dry).length, only(dry.calls, "notify").length, stored(dry, "notices.json").pending], [0, 0, ["Waiting notice"]])
}

/** The dry-run line that names the next ticket in line, whatever holds the launches now. */
const nextTicketCases = async () => {
  const next = async (options) => {
    const scene = scenario({ ...options, dryRun: true })
    const printed = []
    scene.env.log = (line) => printed.push(line)
    await scene.run()
    return { scene, lines: printed.filter((line) => line.startsWith("next ticket ")), printed }
  }
  const stopped = { utilization: 0.9, resetsAt: RESETS_AT, at: NOW - MINUTE }
  const line = (number, order) => [`next ticket ${REPOSITORY}#${number}: ${order}`]
  const ranked = [ticket(5, { blockedBy: [blocker(4)] }), ticket(8), ticket(9, { labels: ["repo:ui", "Bug"] })]
  same("drive: with room the dry run names the first ticket in rank order as the next one, not the first one listed", (await next({ tickets: ranked })).lines, line(9, "build on fix/ticket-9"))
  const underStop = await next({ tickets: ranked, reading: stopped })
  same("drive: under the weekly usage stop the dry run still names the next ticket in line", underStop.lines, line(9, "build on fix/ticket-9"))
  same("drive: under the weekly usage stop the ticket lines still say that the stop holds", underStop.printed.filter((entry) => entry.startsWith(`ticket ${REPOSITORY}#9:`)), [`ticket ${REPOSITORY}#9: wait: the weekly usage stop holds every worker`])
  const pause = ticket(60, { title: "Driver paused: a worker stopped at a usage limit or a sign-in failure", labels: [OWNER_LABEL], repoKey: null })
  same("drive: while the driver is paused the dry run still names the next ticket in line", (await next({ tickets: [...ranked, pause] })).lines, line(9, "build on fix/ticket-9"))
  same("drive: with a signed-out login the dry run still names the next ticket in line", (await next({ tickets: ranked, auth: { ...AUTH, loggedIn: false } })).lines, line(9, "build on fix/ticket-9"))

  const inOpenPull = ticket(7, { labels: ["repo:ui", "Bug"], comments: [partComment(1, 1)] })
  same("drive: a ticket whose only part waits in an open pull request is not next, under the stop too", (await next({ tickets: [inOpenPull, ticket(8)], pulls: { ui: [pull(30, { headRef: "fix/ticket-7-part-1" })] }, reading: stopped })).lines, line(8, "build on chore/ticket-8"))
  const spent = ticket(7, { labels: ["repo:ui", "Bug"], comments: [launchComment("build", "fix/ticket-7", -7200 * 1000), launchComment("build", "fix/ticket-7")] })
  const pastSpent = await next({ tickets: [spent, ticket(8)], reading: stopped })
  // At the cap the ticket is next with its Opus launch. The line names the order, not the model.
  same("drive: a ticket that used its Sonnet launches is next for its Opus launch", pastSpent.lines, line(7, "build on fix/ticket-7"))
  const afterOpus = ticket(7, { labels: ["repo:ui", "Bug"], comments: [launchComment("build", "fix/ticket-7", -7200 * 1000), launchComment("build", "fix/ticket-7", -3600 * 1000), launchComment("build", "fix/ticket-7", -1800 * 1000, null, { model: "claude-opus-5-5" })] })
  same("drive: a ticket whose Opus launch ran is next for its re-plan run", (await next({ tickets: [afterOpus, ticket(8)], reading: stopped })).lines, line(7, "replan on chore/ticket-7-replan"))
  const parkedNext = ticket(7, { labels: ["repo:ui", "Bug", "parked"], comments: afterOpus.comments })
  same("drive: a parked ticket is not next", (await next({ tickets: [parkedNext, ticket(8)], reading: stopped })).lines, line(8, "build on chore/ticket-8"))
  same("drive: the next ticket line writes nothing", pastSpent.scene.calls.filter((entry) => ["comment", "editLabels", "createTicket", "notify", "merge"].includes(entry[0])).length, 0)
  same("drive: the next ticket line logs no needs-owner report for a launch cap", (await next({ tickets: [spent, ticket(8)] })).printed.filter((entry) => / ticket#7 needs-owner /.test(entry)).length, 0)
  const parts = ticket(7, { comments: [partComment(1, 2), partComment(2, 2)] })
  same("drive: the next ticket line names the number of the next part", (await next({ tickets: [parts], routes: [mergedRoute(7, [mergedPull(7, "chore/ticket-7-part-1", "Remaining: part 2")])], reading: stopped })).lines, line(7, "build part on chore/ticket-7-part-2, partNumber 2"))
  same("drive: with no ticket that can start the dry run says that none is next", (await next({ tickets: [ticket(7, { blockedBy: [blocker(5)] })] })).lines, ["next ticket none"])
  const real = scenario({ tickets: [ticket(7)] })
  await real.run()
  same("drive: a real tick prints no next ticket line", real.env.lines.filter((entry) => entry.startsWith("next ticket")), [])
}


/** The ladder end: the re-plan run, its answers, the park at the bound and the skip of a parked item. */
const replanCases = async () => {
  const branch = "chore/ticket-7-30"
  const OPUS = "claude-opus-5-5"
  const ladder = (b, kind = "fix", part = null) => [launchComment(kind, b, -300 * MINUTE, part), launchComment(kind, b, -200 * MINUTE, part), launchComment(kind, b, -100 * MINUTE, part, { model: OPUS })]
  const replanRecord = (count, b, plan = "fresh", offset = -60 * MINUTE) => comment("replan", JSON.stringify({ plan, branch: b, pr: null, part: null, count, at: iso(offset) }), offset)
  // The launch of a re-plan run: the bound counts these, since startWorker writes one before the spawn.
  const replanLaunch = (offset) => launchComment("replan", "chore/ticket-7-replan", offset, null, { model: OPUS })
  const recordsOn = (scene, kind, number = 7) => commentsOf(scene.calls, number).filter((text) => text.startsWith(marked(kind, ""))).map((text) => text.split("\n").slice(1).join("\n"))
  const noNotice = (scene) => [only(scene.calls, "notify").length, scene.messages.filter((line) => line.includes("sleep held")).length, needsOwnerComments(scene.calls, 7).length, only(scene.calls, "editLabels").filter((entry) => entry[3].add?.includes("needs:owner")).length]
  const finding = blockingChanges()
  const plainOn = (scene, number = 7) => commentsOf(scene.calls, number).filter((text) => !text.startsWith("<!--"))

  // A build order whose ladder ended.
  const build = scenario({ tickets: [ticket(7, { comments: ladder("chore/ticket-7", "build") })] })
  await build.run()
  const buildRecord = JSON.parse(recordsOn(build, "launch")[0])
  same("drive: a build order whose Opus launch failed starts one re-plan run on the coordinator model, with its record, log line and no owner write", [build.launched.length, build.launched[0]?.invocation.model, [buildRecord.kind, buildRecord.model, buildRecord.branch], build.messages.some((line) => line.includes("launch replan model claude-opus-5-5")), noNotice(build)], [1, OPUS, ["replan", OPUS, "chore/ticket-7-replan"], true, [0, 0, 0, 0]])
  const replanOrder = build.launched[0]?.order ?? ""
  T("drive: the re-plan order is read only: it holds the ticket body, the failure history and the answer format, and it names no delivery", replanOrder.includes("## This order (replan)") && replanOrder.includes("Do the work.") && replanOrder.includes("## Earlier launches") && replanOrder.includes("Plan: fresh") && replanOrder.includes("This is a read-only order.") && !replanOrder.includes("Open one non-draft pull request"))
  same("drive: the re-plan worktree starts from origin/main on its own branch and the launch file names the stuck plan", [only(build.calls, "git").some((entry) => entry.join(" ").includes("worktree add -b chore/ticket-7-replan")), JSON.parse(readFileSync(join(build.env.stateDir, "chore-ticket-7-replan.launch.json"), "utf8")).stuck], [true, { branch: "chore/ticket-7", pr: null, partNumber: null }])

  // A pull request whose ladder ended.
  const pr = scenario({ tickets: [ticket(7, { comments: ladder(branch) })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await pr.run()
  same("drive: a pull request whose Opus launch failed starts one re-plan run that names the pull request", [pr.launched.length, pr.launched[0]?.invocation.model, JSON.parse(recordsOn(pr, "launch")[0]).kind, JSON.parse(readFileSync(join(pr.env.stateDir, "chore-ticket-7-replan.launch.json"), "utf8")).stuck, noNotice(pr)], [1, OPUS, "replan", { branch, pr: 30, partNumber: null }, [0, 0, 0, 0]])

  // The order of a ticket with a part set names the merged parts and holds every part in full.
  const partBranch2 = "chore/ticket-7-part-2"
  const partTicket = ticket(7, { comments: [partComment(1, 2, "BODY-ONE"), partComment(2, 2, "BODY-TWO"), ...ladder(partBranch2, "fix", 2)] })
  const partScene = scenario({ tickets: [partTicket], pulls: { ui: [pull(30, { headRef: partBranch2, reviews: [finding] })] }, routes: [mergedRoute(7, [mergedPull(7, "chore/ticket-7-part-1", "Remaining: part 2")])] })
  await partScene.run()
  T("drive: the re-plan order of a part names the merged parts, the total in force and each part in full", partScene.launched.length === 1 && partScene.launched[0].order.includes("Merged parts: 1.") && partScene.launched[0].order.includes("Total of the part set in force: 2.") && partScene.launched[0].order.includes("BODY-ONE") && partScene.launched[0].order.includes("BODY-TWO"))

  // A running re-plan run holds the plan, and two pull requests of one ticket start one run.
  const running = runningScene({ tickets: [ticket(7, { comments: ladder(branch) })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await tick(running.env, running.mem)
  await tick(running.env, running.mem)
  same("drive: while a re-plan run works the next tick starts no second run and writes no notice", [running.launched.length, only(running.calls, "notify").length], [1, 0])
  const twoBranches = ["chore/ticket-7-30", "chore/ticket-7-31"]
  const two = scenario({ tickets: [ticket(7, { comments: twoBranches.flatMap((name) => ladder(name)) })], pulls: { ui: [pull(30, { reviews: [finding] }), pull(31, { headRef: "chore/ticket-7-31", reviews: [finding] })] } })
  await two.run()
  same("drive: two pull requests of one ticket that end their ladders in one tick start one re-plan run", two.launched.length, 1)

  // The bound: after 2 re-plans the ticket parks.
  const spent = [...ladder(branch), replanLaunch(-90 * MINUTE), replanLaunch(-80 * MINUTE), replanRecord(1, "chore/ticket-7-old"), replanRecord(2, "chore/ticket-7-older")]
  const parked = scenario({ tickets: [ticket(7, { comments: spent })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await parked.run()
  const parkedComments = recordsOn(parked, "parked")
  same("drive: the third failed ladder parks the ticket and its pull request, with no launch, no notice and no needs:owner", [parked.launched.length, only(parked.calls, "editLabels").map((entry) => entry.slice(1)), parkedComments.length, noNotice(parked), commentsOf(parked.calls, 30).length], [0, [["tickets", 7, { add: ["parked"] }], ["ui", 30, { add: ["parked"] }]], 1, [0, 0, 0, 0], 0])
  same("drive: parking creates the label in the ticket repository and the three code repositories", only(parked.calls, "ensureLabel").map((entry) => [entry[1], entry[2].name]), [["tickets", "parked"], ["ui", "parked"], ["api", "parked"], ["landing", "parked"]])
  T("drive: the parked comment names the reason, each plan with its launches and each re-plan", parkedComments[0].includes("used its launches after 2 re-plans") && parkedComments[0].includes("\`" + branch + "\`: fix on claude-sonnet-5-5, fix on claude-sonnet-5-5, fix on claude-opus-5-5") && parkedComments[0].includes("Re-plan 1 after") && parkedComments[0].includes("Re-plan 2 after"))
  T("drive: a park is logged once", parked.messages.filter((line) => line.includes("ticket#7 parked (")).length === 1 && parked.messages.some((line) => line.includes("1 parked today")))
  const parkedAsleep = scenario({ tickets: [ticket(7, { comments: spent })], pulls: { ui: [pull(30, { reviews: [finding] })] }, sleeping: true })
  await parkedAsleep.run()
  const sleepItems = join(parkedAsleep.env.stateDir, "sleep-items.json")
  same("drive: while sleep is on a park holds no sleep item and logs no sleep line", [existsSync(sleepItems) ? JSON.parse(readFileSync(sleepItems, "utf8")).length : 0, parkedAsleep.messages.filter((line) => line.includes("sleep held")).length], [0, 0])
  const parkedBuild = scenario({ tickets: [ticket(7, { comments: [...ladder("chore/ticket-7-r3", "build"), replanLaunch(-90 * MINUTE), replanLaunch(-80 * MINUTE), replanRecord(1, "chore/ticket-7"), replanRecord(2, "chore/ticket-7-r2")] })] })
  await parkedBuild.run()
  same("drive: a build order that ends its ladder after 2 re-plans parks the ticket and starts nothing", [parkedBuild.launched.length, recordsOn(parkedBuild, "parked").length, only(parkedBuild.calls, "editLabels").map((entry) => entry.slice(1)), noNotice(parkedBuild)], [0, 1, [["tickets", 7, { add: ["parked"] }]], [0, 0, 0, 0]])
  const afterPark = scenario({ tickets: [ticket(7, { comments: [...ladder(branch), replanLaunch(-95 * MINUTE), replanLaunch(-85 * MINUTE), replanRecord(1, "chore/ticket-7-old", "fresh", -90 * MINUTE), replanRecord(2, "chore/ticket-7-older", "fresh", -80 * MINUTE), comment("parked", "Parked.", -30 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await afterPark.run()
  same("drive: the re-plans before the newest parked comment no longer count, so a ticket that the review took back gets a re-plan run", [afterPark.launched.length, JSON.parse(recordsOn(afterPark, "launch")[0]).kind, recordsOn(afterPark, "parked").length], [1, "replan", 0])

  // A park that fails after its first write leaves the ticket skipped, so the bound holds.
  const partialTickets = [ticket(7, { comments: [...spent] })]
  const partial = scenario({ tickets: partialTickets, pulls: { ui: [pull(30, { reviews: [finding] })] } })
  keepWrites(partial, partialTickets)
  const relabeled = partial.env.github.editLabels
  let labelWrites = 0
  partial.env.github.editLabels = async (...args) => { labelWrites += 1; if (labelWrites === 1) throw new Error("HTTP 502 from the label write"); return relabeled(...args) }
  await partial.run()
  await partial.run()
  same("drive: a label write that fails during a park starts no re-plan run and the next tick parks with one comment", [partial.launched.length, recordsOn(partial, "parked").length, recordsOn(partial, "replan").length, partialTickets[0].labels.includes("parked")], [0, 1, 0, true])
  const labelFirst = scenario({ tickets: [ticket(7, { comments: spent })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await labelFirst.run()
  T("drive: a park writes the ticket label before the parked comment", labelFirst.calls.findIndex((entry) => entry[0] === "editLabels" && entry[1] === "tickets") < labelFirst.calls.findIndex((entry) => entry[0] === "comment" && entry[3].startsWith(marked("parked", ""))))

  // The bound counts the launches of re-plan runs, so a run whose record never lands still counts.
  const unrecorded = scenario({ tickets: [ticket(7, { comments: [...ladder(branch), replanLaunch(-90 * MINUTE), replanLaunch(-80 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await unrecorded.run()
  same("drive: two re-plan launches with no replan record park the ticket and start no third run", [unrecorded.launched.length, recordsOn(unrecorded, "parked").length, noNotice(unrecorded)], [0, 1, [0, 0, 0, 0]])
  const refunded = scenario({ tickets: [ticket(7, { comments: [...ladder(branch), replanLaunch(-90 * MINUTE), replanLaunch(-80 * MINUTE), comment("launch-refund", JSON.stringify({ kind: "replan", part: null, branch: "chore/ticket-7-replan", pr: null }), -70 * MINUTE)] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await refunded.run()
  same("drive: a re-plan launch that hit a usage limit and was refunded counts toward no bound", [refunded.launched.length, recordsOn(refunded, "parked").length], [1, 0])
  const failingTickets = [ticket(7, { comments: ladder(branch) })]
  const failingPulls = { ui: [pull(30, { reviews: [finding] })], api: [], landing: [] }
  const writeFails = scenario({ tickets: failingTickets, pulls: failingPulls })
  keepWrites(writeFails, failingTickets)
  const keptComment = writeFails.env.github.comment
  writeFails.env.github.comment = async (key, number, body) => {
    if (body.startsWith(marked("replan", "{"))) throw new Error("HTTP 502 from the record write")
    return keptComment(key, number, body)
  }
  for (let round = 0; round < 4; round += 1) await writeFails.run()
  same("drive: a record write that throws on each run still ends the ladder: 2 re-plan runs, then the park", [writeFails.launched.filter((entry) => entry.order.includes("## This order (replan)")).length, recordsOn(writeFails, "parked").length, failingTickets[0].labels.includes("parked")], [2, 1, true])

  // A park in this tick stops the order of every other pull request of the ticket, planned before or after the park.
  const partsSpent = () => ticket(7, { comments: [partComment(1, 2, "Paths: a/"), partComment(2, 2, "Paths: b/"), ...ladder("chore/ticket-7-part-1", "fix", 1), replanLaunch(-90 * MINUTE), replanLaunch(-80 * MINUTE), replanRecord(1, "chore/ticket-7-old"), replanRecord(2, "chore/ticket-7-older")] })
  for (const sibling of [31, 29]) {
    const siblingScene = scenario({ tickets: [partsSpent()], pulls: { ui: [pull(30, { headRef: "chore/ticket-7-part-1", reviews: [finding] }), pull(sibling, { headRef: "chore/ticket-7-part-2", reviews: [finding] })] } })
    await siblingScene.run()
    same(`drive: a park in the act step starts no order for the sibling pull request ${sibling} and labels it`, [siblingScene.launched.length, only(siblingScene.calls, "editLabels").map((entry) => entry.slice(1, 3)).sort(), recordsOn(siblingScene, "parked").length, noNotice(siblingScene)], [0, [["tickets", 7], ["ui", Math.min(30, sibling)], ["ui", Math.max(30, sibling)]], 1, [0, 0, 0, 0]])
  }
  const buildSpent = ticket(7, { comments: [partComment(1, 2, "Paths: a/"), partComment(2, 2, "Paths: b/"), ...ladder("chore/ticket-7-part-2", "build part", 2), replanLaunch(-90 * MINUTE), replanLaunch(-80 * MINUTE), replanRecord(1, "chore/ticket-7-old"), replanRecord(2, "chore/ticket-7-older")] })
  const admitPark = scenario({ tickets: [buildSpent], pulls: { ui: [pull(31, { headRef: "chore/ticket-7-part-1", reviews: [finding] })] } })
  await admitPark.run()
  same("drive: a park in admission starts no order that the act step planned for the ticket, and labels its open pull request", [admitPark.launched.length, only(admitPark.calls, "editLabels").map((entry) => entry.slice(1, 3)), recordsOn(admitPark, "parked").length, noNotice(admitPark)], [0, [["tickets", 7], ["ui", 31]], 1, [0, 0, 0, 0]])

  // A parked item gets no order and no notice.
  const skipTicket = scenario({ tickets: [ticket(7, { labels: ["repo:ui", "Improvement", "parked"], comments: ladder(branch) })], pulls: { ui: [pull(30, { reviews: [finding] })] }, sleeping: true })
  await skipTicket.run()
  same("drive: a pull request of a parked ticket gets no order, no write and no notice", [skipTicket.launched.length, only(skipTicket.calls, "comment").length, only(skipTicket.calls, "editLabels").length, only(skipTicket.calls, "notify").length, skipTicket.messages.filter((line) => line.includes("sleep held")).length], [0, 0, 0, 0, 0])
  const skipPull = scenario({ tickets: [ticket(7, { comments: ladder(branch) })], pulls: { ui: [pull(30, { labels: ["parked"], reviews: [finding] })] } })
  await skipPull.run()
  same("drive: a parked pull request gets no order and no write", [skipPull.launched.length, only(skipPull.calls, "comment").length, only(skipPull.calls, "editLabels").length], [0, 0, 0])
  const skipBuild = scenario({ tickets: [ticket(7, { labels: ["repo:ui", "Improvement", "parked"] }), ticket(8)] })
  await skipBuild.run()
  same("drive: a parked ticket gets no build order while the next ticket does", [skipBuild.launched.length, skipBuild.launched[0]?.order.startsWith("# Ticket 8")], [1, true])
  const parkedMerged = scenario({ tickets: [ticket(7, { labels: ["repo:ui", "Improvement", "parked"] })], routes: [mergedRoute(7, [mergedPull(7, "chore/ticket-7", "Remaining: none")])] })
  await parkedMerged.run()
  same("drive: a parked ticket is not closed by the close pass", only(parkedMerged.calls, "closeTicket").length, 0)

  // A pull request that a re-plan record names closes, whatever step failed.
  const stranded = scenario({ tickets: [ticket(7, { comments: [...ladder(branch), replanRecord(1, branch, "split")] })], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await stranded.run()
  same("drive: an open pull request on the branch of a re-plan record closes with a replan comment and loses its branch, and nothing launches for it", [only(stranded.calls, "closePull").map((entry) => entry.slice(1)), only(stranded.calls, "deleteBranch").map((entry) => entry.slice(1)), commentsOf(stranded.calls, 30).map((text) => text.split("\n")[0]), stranded.launched.length], [[["ui", 30]], [["ui", branch]], [marked("replan", "").trim()], 0])

  // The answers.
  const reaped = async ({ tickets = [ticket(7, { comments: ladder(branch) })], answer, stuck = { branch, pr: 30, partNumber: null }, partNumber = null, routes = [], headRef = branch, otherPulls = [] }) => {
    const pulls = { ui: [pull(30, { headRef, reviews: [finding] }), ...otherPulls], api: [], landing: [] }
    const scene = scenario({ tickets, pulls, routes })
    keepWrites(scene, tickets)
    scene.env.github.closePull = async (key, number) => { scene.calls.push(["closePull", key, number]); pulls.ui.splice(pulls.ui.findIndex((entry) => entry.number === number), 1) }
    leftBehind(scene, { kind: "replan", branch: "chore/ticket-7-replan", stuck, partNumber, worktree: "/r/orbit-worktrees/ui/chore-ticket-7-replan" }, resultLine(answer), "chore-ticket-7-replan")
    await scene.run()
    return scene
  }
  const fresh = await reaped({ answer: "Plan: fresh\nUse the smaller path." })
  const freshRecord = JSON.parse(recordsOn(fresh, "replan")[0])
  same("drive: a fresh answer writes the replan record, closes the pull request with a replan comment, deletes its branch and posts the note", [[freshRecord.plan, freshRecord.branch, freshRecord.pr, freshRecord.count], only(fresh.calls, "closePull").map((entry) => entry.slice(1)), only(fresh.calls, "deleteBranch").map((entry) => entry.slice(1)), commentsOf(fresh.calls, 30).map((text) => text.split("\n")[0]), recordsOn(fresh, "replan-note")], [["fresh", branch, 30, 1], [["ui", 30]], [["ui", branch]], [marked("replan", "").trim()], ["Use the smaller path."]])
  T("drive: the replan comment names the plan and links the ticket that holds the answer", commentsOf(fresh.calls, 30)[0].includes("chose fresh") && /The answer of the re-plan run is on (\S+)\.$/m.exec(commentsOf(fresh.calls, 30)[0])?.[1] === "https://github.com/thomasluizon/orbit-tickets/issues/7" && freshRecord.answer.includes("Use the smaller path."))
  T("drive: the replan record comes before the close, so a failed step never gives a free re-plan", fresh.calls.findIndex((entry) => entry[0] === "comment" && entry[3].startsWith(marked("replan", "{"))) < fresh.calls.findIndex((entry) => entry[0] === "closePull"))
  same("drive: after a fresh answer the same tick builds with the note and counts no launch of the old plan", [fresh.launched.length, fresh.launched[0]?.order.includes("## Notes of the re-plan") && fresh.launched[0].order.includes("Use the smaller path."), fresh.launched[0]?.invocation.model], [1, true, "claude-sonnet-5-5"])
  // A note whose post fails after the record and the close is posted on a later read, once.
  const noteTickets = [ticket(7, { comments: ladder(branch) })]
  const notePulls = { ui: [pull(30, { reviews: [finding] })], api: [], landing: [] }
  const noteScene = scenario({ tickets: noteTickets, pulls: notePulls })
  keepWrites(noteScene, noteTickets)
  noteScene.env.github.closePull = async (key, number) => { noteScene.calls.push(["closePull", key, number]); notePulls.ui.splice(notePulls.ui.findIndex((entry) => entry.number === number), 1) }
  const noteWrite = noteScene.env.github.comment
  let noteWrites = 0
  noteScene.env.github.comment = async (key, number, body) => {
    if (body.startsWith(marked("replan-note", "")) && (noteWrites += 1) === 1) throw new Error("HTTP 502 from the comment write")
    return noteWrite(key, number, body)
  }
  leftBehind(noteScene, { kind: "replan", branch: "chore/ticket-7-replan", stuck: { branch, pr: 30, partNumber: null }, worktree: "/r/orbit-worktrees/ui/chore-ticket-7-replan" }, resultLine("Plan: fresh\nUse the smaller path."), "chore-ticket-7-replan")
  await noteScene.run()
  await noteScene.run()
  same("drive: a fresh note whose post fails is posted on a later read, once, and the record keeps it whole", [noteTickets[0].comments.filter((entry) => entry.kind === "replan-note").map((entry) => entry.body.split("\n").slice(1).join("\n")), JSON.parse(recordsOn(noteScene, "replan")[0]).note], [["Use the smaller path."], "Use the smaller path."])
  const dropped = await reaped({ answer: "I could not decide." })
  same("drive: a missing answer counts as fresh with no note", [JSON.parse(recordsOn(dropped, "replan")[0]).plan, recordsOn(dropped, "replan-note").length, only(dropped.calls, "closePull").length], ["fresh", 0, 1])

  const rotated = scenario({ tickets: [ticket(7, { comments: [...ladder("chore/ticket-7", "build"), replanRecord(1, "chore/ticket-7"), comment("replan-note", "NOTE-TEXT")] })] })
  await rotated.run()
  same("drive: after a fresh plan the next build order takes the branch with the suffix -r2, on the worker model, with the note", [JSON.parse(recordsOn(rotated, "launch")[0]).branch, JSON.parse(recordsOn(rotated, "launch")[0]).model, rotated.launched[0]?.order.includes("NOTE-TEXT"), rotated.launched[0]?.order.includes("## Earlier launches")], ["chore/ticket-7-r2", "claude-sonnet-5-5", true, false])
  const rotatedAgain = scenario({ tickets: [ticket(7, { comments: [replanRecord(1, "chore/ticket-7"), replanRecord(2, "chore/ticket-7-r2")] })] })
  await rotatedAgain.run()
  same("drive: the closed branch of every re-plan counts as used, so the third plan takes -r3", JSON.parse(recordsOn(rotatedAgain, "launch")[0]).branch, "chore/ticket-7-r3")

  const setTicket = () => ticket(7, { comments: [partComment(1, 2, "Paths: a/"), comment(null, "Part 2 of 2: part 2\nPaths: b/", -7200 * 1000), ...ladder(partBranch2, "fix", 2)] })
  const mergedOne = mergedRoute(7, [mergedPull(7, "chore/ticket-7-part-1", "Remaining: part 2")])
  const split = await reaped({ tickets: [setTicket()], answer: "Plan: split\n## Part 1 of 4: reworded one\n## Part 2 of 4: second a\nBODY-2\n## Part 3 of 4: second b\n## Part 4 of 4: second c", stuck: { branch: partBranch2, pr: 30, partNumber: 2 }, partNumber: 2, headRef: partBranch2, routes: [mergedOne] })
  const posted = plainOn(split)
  same("drive: a split answer posts each part as a plain comment, keeps the merged part with its number and its text, and closes the pull request", [posted.length, posted[0], posted[1].split("\n")[0], posted[3].split("\n")[0], only(split.calls, "closePull").length, JSON.parse(recordsOn(split, "replan")[0]).plan], [4, "Part 1 of 4: part 1\nPaths: a/", "## Part 2 of 4: second a", "## Part 4 of 4: second c", 1, "split"])
  const next = split.launched.find((entry) => entry.order.includes("## This order (build part)"))
  T("drive: after a split the merged part stays done and the next part builds on a new branch of the new set", split.launched.length === 1 && next !== undefined && next.order.includes("(Part 2 of 4)") && next.worktree.endsWith("chore-ticket-7-part-2-r2"), split.launched.map((entry) => entry.worktree).join(" "))
  T("drive: the split record keeps each part of the new set whole", JSON.stringify(JSON.parse(recordsOn(split, "replan")[0]).parts) === JSON.stringify(posted))
  // A split whose part post fails partway ends on a later read: each part of the newest split record that the ticket lacks is posted once.
  const failTickets = [setTicket()]
  const failPulls = { ui: [pull(30, { headRef: partBranch2, reviews: [finding] })], api: [], landing: [] }
  const failing = scenario({ tickets: failTickets, pulls: failPulls, routes: [mergedOne] })
  keepWrites(failing, failTickets)
  failing.env.github.closePull = async (key, number) => { failing.calls.push(["closePull", key, number]); failPulls.ui.splice(failPulls.ui.findIndex((entry) => entry.number === number), 1) }
  const keptWrite = failing.env.github.comment
  let plainWrites = 0
  failing.env.github.comment = async (key, number, body) => {
    if (key === "tickets" && !body.startsWith("<!--") && (plainWrites += 1) === 3) throw new Error("HTTP 502 from the comment write")
    return keptWrite(key, number, body)
  }
  leftBehind(failing, { kind: "replan", branch: "chore/ticket-7-replan", stuck: { branch: partBranch2, pr: 30, partNumber: 2 }, partNumber: 2, worktree: "/r/orbit-worktrees/ui/chore-ticket-7-replan" }, resultLine("Plan: split\n## Part 1 of 4: reworded one\n## Part 2 of 4: second a\n## Part 3 of 4: second b\n## Part 4 of 4: second c"), "chore-ticket-7-replan")
  await failing.run()
  await failing.run()
  const setHeads = () => failTickets[0].comments.filter((entry) => entry.kind === null && /of 4/.test(entry.body.split("\n")[0])).map((entry) => entry.body.split("\n")[0])
  same("drive: a split whose third part post fails posts the missing parts before admission, each once", setHeads(), ["Part 1 of 4: part 1", "## Part 2 of 4: second a", "## Part 3 of 4: second b", "## Part 4 of 4: second c"])
  // A part that a later comment superseded counts as posted, so the resume never brings it back.
  const supersededTickets = [ticket(7, { comments: [partComment(1, 2, "Paths: a/"), comment("replan", JSON.stringify({ plan: "split", branch: partBranch2, pr: 30, part: 2, count: 1, at: iso(-60 * MINUTE), parts: ["## Part 1 of 3: one", "## Part 2 of 3: two", "## Part 3 of 3: three"] }), -60 * MINUTE), comment(null, "## Part 1 of 3: one", -59 * MINUTE), comment(null, "Superseded: ## Part 2 of 3: two", -58 * MINUTE), comment(null, "## Part 3 of 3: three", -57 * MINUTE)] })]
  const superseded = scenario({ tickets: supersededTickets })
  keepWrites(superseded, supersededTickets)
  await superseded.run()
  same("drive: the resume of a split never posts a part that a comment superseded", plainOn(superseded).length, 0)
  // A part whose pull request is open keeps its number in a split, as a merged part does: its pull request stands for that number.
  const threeParts = () => ticket(7, { comments: [partComment(1, 3, "Paths: a/"), partComment(2, 3, "Paths: b/"), partComment(3, 3, "Paths: c/"), ...ladder(partBranch2, "fix", 2)] })
  const openThree = () => pull(31, { headRef: "chore/ticket-7-part-3", checksComplete: false, reviews: [] })
  const openSplit = await reaped({ tickets: [threeParts()], answer: "Plan: split\n## Part 1 of 4: reworded one\n## Part 2 of 4: two a\n## Part 3 of 4: two b\n## Part 4 of 4: three", stuck: { branch: partBranch2, pr: 30, partNumber: 2 }, partNumber: 2, headRef: partBranch2, routes: [mergedOne], otherPulls: [openThree()] })
  const openPosted = plainOn(openSplit)
  same("drive: a split keeps the part whose pull request is open with its number and its text, and closes only the stuck pull request", [openPosted.length, openPosted[0], openPosted[1].split("\n")[0], openPosted[2], openPosted[3].split("\n")[0], only(openSplit.calls, "closePull").map((entry) => entry.slice(1))], [4, "Part 1 of 4: part 1\nPaths: a/", "## Part 2 of 4: two a", "Part 3 of 4: part 3\nPaths: c/", "## Part 4 of 4: three", [["ui", 30]]])
  const openScene = scenario({ tickets: [threeParts()], pulls: { ui: [pull(30, { headRef: partBranch2, reviews: [finding] }), openThree()] }, routes: [mergedOne] })
  await openScene.run()
  const openOrder = openScene.launched.find((entry) => entry.order.includes("## This order (replan)"))?.order ?? ""
  T("drive: the re-plan order names the part with an open pull request as a part to keep", openOrder.includes("Merged parts: 1.") && openOrder.includes("Open parts: 3."), openOrder.slice(0, 400))
  // A record that GitHub would refuse counts a split as fresh with a note, so the write always lands.
  const hugeParts = Array.from({ length: 20 }, (_, index) => `## Part ${index + 1} of 20: big ${index + 1}\n${"x".repeat(4000)}`).join("\n")
  const huge = await reaped({ answer: `Plan: split\n${hugeParts}` })
  const hugeRecord = recordsOn(huge, "replan")[0] ?? ""
  T("drive: a split whose record is over the comment limit counts as fresh with a note, posts no part and writes a record under the limit", JSON.parse(hugeRecord).plan === "fresh" && marked("replan", hugeRecord).length <= 65000 && plainOn(huge).length === 0 && recordsOn(huge, "replan-note")[0]?.includes("too long"), `${hugeRecord.length}`)
  const longNote = await reaped({ answer: `Plan: fresh\n${"y".repeat(70000)}` })
  T("drive: a fresh note is cut so the record and the note stay under the comment limit", marked("replan", recordsOn(longNote, "replan")[0] ?? "").length <= 65000 && marked("replan-note", recordsOn(longNote, "replan-note")[0] ?? "").length <= 65000)
  const smallSplit = await reaped({ tickets: [setTicket()], answer: "Plan: split\n## Part 1 of 4: reworded one\n## Part 2 of 4: second a\n## Part 3 of 4: second b\n## Part 4 of 4: second c", stuck: { branch: partBranch2, pr: 30, partNumber: 2 }, partNumber: 2, headRef: partBranch2, routes: [mergedOne] })
  T("drive: the record of a usable split keeps its parts and no answer", JSON.parse(recordsOn(smallSplit, "replan")[0]).parts.length === 4 && JSON.parse(recordsOn(smallSplit, "replan")[0]).answer === undefined)

  const refused = await reaped({ tickets: [setTicket()], answer: "Plan: split\n## Part 1 of 2: one\n## Part 2 of 2: two", stuck: { branch: partBranch2, pr: 30, partNumber: 2 }, partNumber: 2, headRef: partBranch2, routes: [mergedOne] })
  same("drive: a split with the total in force is no usable part set, so it counts as fresh with a note that says why", [JSON.parse(recordsOn(refused, "replan")[0]).plan, plainOn(refused).length, recordsOn(refused, "replan-note")[0]?.includes("is not higher than the total 2")], ["fresh", 0, true])
  const olderLarger = [...[1, 2, 3, 4].map((number) => comment(null, `Part ${number} of 4: old ${number}`, -(9000 - number) * 1000)), ...[1, 2, 3].map((number) => comment(null, `Part ${number} of 3: new ${number}`, -(8000 - number) * 1000))]
  const largerTicket = () => ticket(7, { comments: [...olderLarger, ...ladder(branch)] })
  const bigSplit = await reaped({ tickets: [largerTicket()], answer: "Plan: split\n## Part 1 of 4: one\n## Part 2 of 4: two\n## Part 3 of 4: three\n## Part 4 of 4: four" })
  same("drive: a split that brings back the total of an older, larger part set counts as fresh, posts no part and names the highest total", [JSON.parse(recordsOn(bigSplit, "replan")[0]).plan, plainOn(bigSplit).length, recordsOn(bigSplit, "replan-note")[0]?.includes("is not higher than the total 4"), needsOwnerComments(bigSplit.calls, 7).length], ["fresh", 0, true, 0])
  const largerOrder = scenario({ tickets: [largerTicket()], pulls: { ui: [pull(30, { reviews: [finding] })] } })
  await largerOrder.run()
  const largerReplan = largerOrder.launched.find((entry) => entry.order.includes("## This order (replan)"))
  T("drive: the re-plan order names the highest total of any part set, not only the set in force", largerReplan !== undefined && largerReplan.order.includes("Total of the part set in force: 3. Highest total of any part set on the ticket: 4.") && largerReplan.order.includes("make m higher than 4."))
}

const CHECKS_FILE = ".github/required-checks.json"
const MERGE_BASE = "d".repeat(40)
const requiredList = (...contexts) => ({ strict: false, checks: contexts.map((context) => ({ context, app_id: context === "pullfrog-approval" ? APP : 15368 })) })
const OLD_CHECKS = requiredList("Checks", "pullfrog-approval")
const NEW_CHECKS = requiredList("PR Tests", "pullfrog-approval")

/** A pull request that renames a required check: its head reports `PR Tests`, and GitHub blocks it while `Checks` is required. */
const renamingPull = (extra = {}) => pull(30, { files: [CHECKS_FILE], changedFiles: 1, checks: [check("PR Tests"), approvalCheck()], requiredChecks: [{ context: "Checks", appId: 15368 }, { context: "pullfrog-approval", appId: APP }], mergeState: "BLOCKED", ...extra })

/**
 * A scene with a stateful ui protection and required checks file. Like GitHub, its merge refuses a head that misses a
 * required check, and a merge puts the head file on main. `world.protection` and `world.main` hold the current state.
 */
const protectedScene = ({ main = OLD_CHECKS, protection = OLD_CHECKS, base = main, head = NEW_CHECKS, pulls = [], dryRun = false } = {}) => {
  const scene = scenario({ tickets: [ticket(7)], pulls: { ui: pulls }, dryRun, gitRoutes: [["merge-base", `${MERGE_BASE}\n`]] })
  const world = { main, protection: structuredClone(protection) }
  const file = (required) => (required === undefined ? null : { required: structuredClone(required) })
  scene.env.github.readRequiredChecksFile = async (key, ref) => {
    if (key !== "ui") return null
    return file(ref === "main" ? world.main : ref === MERGE_BASE ? base : head)
  }
  scene.env.github.readProtectionChecks = async () => structuredClone(world.protection)
  scene.env.github.writeProtectionChecks = async (key, branch, required) => {
    scene.calls.push(["protect", key, branch, structuredClone(required)])
    world.protection = structuredClone(required)
  }
  scene.env.github.merge = async (key, number, sha) => {
    const reported = pulls.find((entry) => entry.number === number).checks.map((entry) => entry.name)
    const missing = world.protection.checks.find((need) => !reported.includes(need.context))
    if (missing) throw new Error(`gh pr merge failed: Required status check "${missing.context}" is expected.`)
    scene.calls.push(["merge", key, number, sha])
    world.main = head
  }
  return { ...scene, world }
}

const protectionSteps = (scene) => scene.calls.filter((entry) => entry[0] === "protect" || entry[0] === "merge").map((entry) => (entry[0] === "merge" ? "merge" : entry[3].checks.map((need) => need.context).join(",")))
const requiredLines = (scene, kind = "required-checks") => scene.messages.filter((line) => line.split(" ")[2] === kind).map((line) => line.slice(line.indexOf(" ") + 1))
const OLD_LINE = "strict false: Checks [15368], pullfrog-approval [1768019]"
const NEW_LINE = "strict false: PR Tests [15368], pullfrog-approval [1768019]"
/** The list that the driver writes just before a merge: the checks that stay, then the checks that the change adds. */
const DURING_LINE = "strict false: pullfrog-approval [1768019], PR Tests [15368]"
const DURING = "pullfrog-approval,PR Tests"

const requiredChecksDriftCases = async () => {
  const drifted = protectedScene({ main: NEW_CHECKS })
  await drifted.run()
  same("drive: a protection that differs from the file on main is set back on the tick", [drifted.calls.filter((entry) => entry[0] === "protect"), drifted.world.protection], [[["protect", "ui", "main", NEW_CHECKS]], NEW_CHECKS])
  same("drive: the drift write logs one line with the old and the new list", requiredLines(drifted), [`ui required-checks (${OLD_LINE} -> ${NEW_LINE})`])
  await drifted.run()
  same("drive: the next tick writes nothing while the protection equals the file", protectionSteps(drifted).length, 1)
  drifted.world.protection = structuredClone(OLD_CHECKS)
  await drifted.run()
  same("drive: a protection that someone changes again is set back on the next tick", [protectionSteps(drifted).length, drifted.world.protection], [2, NEW_CHECKS])

  const strict = protectedScene({ protection: { ...OLD_CHECKS, strict: true } })
  await strict.run()
  same("drive: another strict value is a difference", strict.world.protection, OLD_CHECKS)
  const reordered = protectedScene({ protection: { strict: false, checks: [...OLD_CHECKS.checks].reverse() } })
  await reordered.run()
  same("drive: the same checks in another order write nothing", protectionSteps(reordered), [])
  const none = scenario({ tickets: [ticket(7)] })
  let protectionReads = 0
  none.env.github.readProtectionChecks = async () => { protectionReads += 1 }
  await none.run()
  same("drive: a repository with no required checks file keeps its protection and reads none", [protectionReads, only(none.calls, "writeProtectionChecks").length], [0, 0])
  const dry = protectedScene({ main: NEW_CHECKS, dryRun: true })
  await dry.run()
  same("drive: a dry run names the difference and writes nothing", [protectionSteps(dry), requiredLines(dry)], [[], [`ui required-checks (${OLD_LINE} -> ${NEW_LINE}, dry run)`]])
  const invalid = protectedScene({ main: null, pulls: [pull(31, { changedFiles: 1 })] })
  invalid.env.github.merge = async (...args) => { invalid.calls.push(["merge", ...args]) }
  await invalid.run()
  same("drive: a file on main of another shape logs an error, writes nothing and the tick goes on", [protectionSteps(invalid), requiredLines(invalid, "required-checks-error")], [["merge"], ["ui required-checks-error (.github/required-checks.json on main has a wrong shape)"]])
}

const requiredChecksMergeCases = async () => {
  const renamed = protectedScene({ pulls: [renamingPull()] })
  await renamed.run()
  same("drive: a rename of a required check moves the protection, merges at the head and applies the file of main", protectionSteps(renamed), [DURING, "merge", "PR Tests,pullfrog-approval"])
  same("drive: after the merge the protection of main equals the file", renamed.world.protection, renamed.world.main)
  same("drive: the merge logs the old and the new list before and after", requiredLines(renamed), [`ui#30 required-checks (${OLD_LINE} -> ${DURING_LINE}, before the merge)`, `ui required-checks (${OLD_LINE} -> ${NEW_LINE})`])
  const gits = renamed.calls.filter((entry) => entry[0] === "git").map((entry) => entry.slice(1).join(" "))
  same("drive: the merge base of the change comes from a fresh fetch of main and the head", [gits.includes("fetch origin main refs/pull/30/head"), gits.includes(`merge-base origin/main ${HEAD}`)], [true, true])

  const added = requiredList("Checks", "PR Tests", "pullfrog-approval")
  const adding = protectedScene({ head: added, pulls: [renamingPull({ checks: [check("Checks"), check("PR Tests"), approvalCheck()], mergeState: "CLEAN" })] })
  await adding.run()
  same("drive: a change that only adds a check writes the protection after the merge only", protectionSteps(adding), ["merge", "Checks,PR Tests,pullfrog-approval"])

  const refused = protectedScene({ pulls: [renamingPull()] })
  refused.env.github.merge = async () => { throw new Error("gh pr merge failed: the base branch policy prohibits the merge") }
  await refused.run()
  same("drive: a failed merge puts the protection back", [protectionSteps(refused), refused.world.protection], [[DURING, "Checks,pullfrog-approval"], OLD_CHECKS])
  same("drive: a failed merge logs the protection that comes back", requiredLines(refused).at(-1), `ui#30 required-checks (${DURING_LINE} -> ${OLD_LINE}, the merge failed)`)
  T("drive: a failed merge keeps its error line", refused.messages.some((line) => line.includes(" ui#30 error (gh pr merge failed")), refused.messages.join(" | "))

  const late = protectedScene({ pulls: [renamingPull()] })
  const write = late.env.github.writeProtectionChecks
  let writes = 0
  late.env.github.writeProtectionChecks = async (...args) => { writes += 1; if (writes === 2) throw new Error("gh api failed: HTTP 502"); return write(...args) }
  await late.run()
  same("drive: a protection write that fails after the merge logs its own error and keeps the merge", [protectionSteps(late), requiredLines(late, "required-checks-error").length, late.messages.some((line) => line.includes(" ui#30 error "))], [[DURING, "merge"], 1, false])

  const waiting = protectedScene({ pulls: [renamingPull({ checks: [approvalCheck()] })] })
  await waiting.run()
  same("drive: a head that misses the added check gets no merge and no protection write", protectionSteps(waiting), [])
  const unrelated = protectedScene({ pulls: [pull(31, { files: ["tools/a.mjs"], changedFiles: 1, checks: [check("Checks"), approvalCheck()], requiredChecks: [{ context: "Checks", appId: 15368 }] })] })
  await unrelated.run()
  same("drive: a pull request that does not change the file merges with no protection write", protectionSteps(unrelated), ["merge"])
  const long = protectedScene({ head: OLD_CHECKS, pulls: [pull(31, { files: ["tools/a.mjs"], changedFiles: 101, checks: [check("Checks"), approvalCheck()], requiredChecks: [{ context: "Checks", appId: 15368 }], reviews: [review("APPROVED", HEAD, -5 * MINUTE, { body: "Whole diff: no finding" })], comments: [comment("ticket", "Ticket"), comment("request", "@pullfrog review whole diff", -20 * MINUTE)] })] })
  await long.run()
  same("drive: a pull request with more files than GitHub lists and the same file as its merge base writes no protection", protectionSteps(long), ["merge"])
  const stacked = protectedScene({ pulls: [renamingPull({ baseRef: "feature/parent" }), pull(29, { headRef: "feature/parent", draft: true })] })
  let headReads = 0
  const read = stacked.env.github.readRequiredChecksFile
  stacked.env.github.readRequiredChecksFile = async (key, ref) => { if (ref !== "main") headReads += 1; return read(key, ref) }
  await stacked.run()
  same("drive: a pull request into another branch never moves the protection of main", [headReads, protectionSteps(stacked).filter((step) => step !== "merge")], [0, []])
}

export const driverUnit = async () => {
  await requiredChecksDriftCases()
  await requiredChecksMergeCases()
  await noticeCases()
  await nextTicketCases()
  await releaseCases()
  await admissionCases()
  await checkOnlyCases()
  await heldPullCases()
  await paceCases()
  await sleepCases()
  await questionsCases()
  await harnessReviewCases()
  await usageLimitCases()
  await workerCases()
  await resumeCases()
  await capCases()
  await replanCases()
  await classCases()
  await baseMergeCases()
  await reviewRunCases()
  await worktreeOccupantCases()
  await unpreparedCases()
  await reviewCases()
  await reviewOnceCases()
  await ownerAndBodyCases()
  await mergeCases()
  await trainMergeCases()
  await updateCases()
  await ciCases()
  await gateCheckCases()
  await closeCases()
  await sweepCases()
  await intakeCases()
  await accountCases()
  await robustnessCases()
  await readFailureCases()
  await holdCases()
  await healthReadCases()
  await healthBarCases()
  await cliCases()
  await blockingClassCases()
  await reportHoldCases()
  await laneAndReviewPassCases()
  await logOnlyCases()
  await runningWorkCases()
  await paceStampCases()
  await planSpeedCases()
  await planShapeCases()
  await reapOutcomeCases()
  await unreadLogCases()
  await gatedReportCases()
  await branchKeyCases()
  await restartCases()
  await echoedLimitCases()
  await reasonKeyCases()
  await quietLogCases()
  await orderOfApiCases()
  await orphanClockCases()
  await paceRestartCases()
  await twoAccountCases()
}
