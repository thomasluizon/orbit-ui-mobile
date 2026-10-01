import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, stage, stageRepo, TOOLS_DIR } from "./_harness.mjs"
import { runStatus, statusQuery } from "../run-status.mjs"
import { readAdmissionCounts, RELEASE_HOLD_MS } from "../lib/admission.mjs"
import { writeReadinessReceipt } from "../lib/readiness-receipt.mjs"
import { clearWakeSource, readRunState, registerWakeSource, runStatePath, workerLaunchDirectory, writeRunState } from "../lib/run-state.mjs"

const fixture = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "gh-run-status.json"), "utf8"))
const sessionId = "status-session"
const readyPull = () => {
  const pull = structuredClone(fixture.response.data.repository.pr1459)
  pull.mergeStateStatus = "CLEAN"
  pull.statusCheckRollup.contexts.nodes = pull.statusCheckRollup.contexts.nodes.map((check) => ({ ...check, status: "COMPLETED", conclusion: "SUCCESS" }))
  return pull
}

export const cases = async () => {
  const repo = stageRepo("run-status")
  repo.git(["remote", "set-url", "origin", "https://github.com/test-owner/ui.git"])
  const config = { repos: { ui: repo.path }, caps: { parallelTickets: 6, maxOpenPullRequests: 10, maxQueuedRuns: 30 } }
  const options = { repoRoot: repo.path, sessionId, config, now: Date.parse("2026-10-01T21:00:00Z") }
  const readCalls = []
  let response = structuredClone(fixture.response)
  let rateLimit = structuredClone(fixture.rateLimit)
  let queued = 0
  let failingOwner = null
  let malformedJson = false
  const authenticate = async (path) => {
    if (path === failingOwner) throw new Error("auth failure ghp_abcdefghijklmnopqrstuvwx")
    return { environment: { GH_TOKEN: "status-secret" }, secrets: ["status-secret"] }
  }
  const runner = async (file, args, invocation) => {
    readCalls.push(args)
    T("run-status: spy rejects every write command and GraphQL mutation", args[0] === "api" &&
      (args[1] === "rate_limit" || args[1].includes("actions/runs?status=queued") || (args[1] === "graphql" && args.at(-1).startsWith("query=query RunStatus") && !args.at(-1).includes("mutation"))))
    T("run-status: the token exists only in the child environment", invocation.env.GH_TOKEN === "status-secret" && !args.some((argument) => argument.includes("status-secret")))
    const payload = args[1] === "rate_limit" ? rateLimit : args[1] === "graphql" ? response : { total_count: queued, workflow_runs: [] }
    return { status: 0, stdout: malformedJson ? "status-secret" : JSON.stringify(payload), stderr: "", error: null, timedOut: false, overflowed: false }
  }
  const snapshot = (extra = {}) => runStatus({ ...options, authenticate, runner, ...extra })
  T("run-status: no record exits without any GitHub calls", (await snapshot()).status === "no run record" && readCalls.length === 0)
  check("run-status.mjs", "the CLI reports its linked checkout and names the main checkout", [], { status: 0, stdout: /no run record/ })
  const linked = dirname(stage("run-status-linked/.git", `gitdir: ${join(repo.path, ".git", "worktrees", "linked")}\n`))
  const linkedStatus = await snapshot({ repoRoot: linked })
  T("run-status: linked worktrees never read the main checkout's run", linkedStatus.mainCheckout === repo.path && linkedStatus.warning.includes("linked worktree"))

  const number = 1459
  const receipt = (pull) => ({ issue: "#1092", repositoryKey: "ui", prNumber: number, baseBranch: pull.baseRefName,
    currentHeadSha: pull.headRefOid, currentBaseSha: pull.baseRefOid, behindBy: 0, draft: false,
    ci: { settled: true, green: true, headSha: pull.headRefOid, baseSha: pull.baseRefOid },
    ticket: { status: "In Review", targetStatus: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: pull.headRefOid, baseSha: pull.baseRefOid } })
  let pull = readyPull()
  const receiptPath = writeReadinessReceipt(repo.path, receipt(pull))
  const row = { repositoryKey: "ui", prNumber: number, receiptPath, issue: "#1092", worktree: repo.path,
    deliveryPath: join(repo.path, "delivery.json"), ticketPath: join(repo.path, "ticket.json") }
  const state = (remaining = []) => writeRunState({ sessionId, sleep: true, remaining, pullRequests: [row] }, repo.path)
  const resultDirectory = join(workerLaunchDirectory(repo.path), "results")
  mkdirSync(resultDirectory, { recursive: true })
  const launchResultPath = join(resultDirectory, "123.json")
  const launch = { sessionId, launcherPid: 123, repositoryKey: "ui", issue: "#1092", runDirectory: repo.path, branch: pull.headRefName, outcome: "EXITED", exitCode: 0 }
  const setPull = (next) => {
    response = { data: { repository: { pullRequests: { totalCount: 1, nodes: [{ headRefName: next.headRefName }] }, [`pr${number}`]: next } } }
  }
  const reset = () => { state(); pull = readyPull(); setPull(pull); writeReadinessReceipt(repo.path, receipt(pull)); writeFileSync(launchResultPath, JSON.stringify(launch)); readCalls.length = 0 }
  reset()
  T("run-status: foreign sessions have no actions or external reads", (await snapshot({ sessionId: "foreign" })).nextActions.length === 0 && readCalls.length === 0)
  T("run-status: ledger keeps exact command inputs across later sightings", readRunState(repo.path).readinessLedger[0].deliveryPath === row.deliveryPath)
  let report = await snapshot()
  T("run-status: approved clean head with a quoted receipt is a merge candidate", report.nextActions.some((entry) => entry.type === "MERGE_CANDIDATE") && report.pullRequests[0].receiptVerdict === "READY")
  T("run-status: read budget is one GraphQL, queued-runs and rate_limit", readCalls.length === 3 && readCalls.filter((args) => args[1] === "graphql").length === 1 && readCalls.filter((args) => args[1] === "rate_limit").length === 1)
  T("run-status: production query matches the recorded producer's fields", statusQuery([1462, 1459]).includes('reviews(last: 100, author: "pullfrog[bot]")') && fixture.response.data.repository.pr1462.reviewThreads.nodes[0].comments.nodes[0].author.login === "pullfrog")
  T("run-status: scenario enum changes come from schema introspection", fixture.enums.MergeStateStatus.enumValues.some((entry) => entry.name === "BEHIND") && fixture.enums.PullRequestReviewState.enumValues.some((entry) => entry.name === "APPROVED"))

  reset(); pull.statusCheckRollup.contexts.nodes[0].status = "IN_PROGRESS"; pull.statusCheckRollup.contexts.nodes[0].conclusion = null; setPull(pull)
  report = await snapshot()
  T("run-status: all pending work re-arms CI", report.nextActions[0].type === "REARM_WAIT_CI" && report.nextActions[0].command.includes("wait-ci.mjs"))
  registerWakeSource({ pid: process.pid, repositoryKey: "ui", prNumbers: [number], what: "CI fixture" }, repo.path)
  report = await snapshot()
  T("run-status: a matching live waiter yields no action", report.nextActions.length === 1 && report.nextActions[0].type === "NO_ACTION")
  clearWakeSource(process.pid, repo.path)

  reset(); pull.reviewThreads.nodes[0].isResolved = false; setPull(pull)
  report = await snapshot()
  T("run-status: an unresolved Pullfrog thread requests read-only review", report.pullRequests[0].unresolved === 1 && report.nextActions.some((entry) => entry.type === "READ_REVIEW" && entry.command.includes("--no-request --wait-seconds 0")))
  T("run-status: no pull request or review bodies appear", !JSON.stringify(report).includes("reviewBody") && !JSON.stringify(report).includes('"body"'))

  reset(); pull.mergeStateStatus = "BEHIND"; setPull(pull)
  T("run-status: behind base names the delivery decision tool", (await snapshot()).nextActions[0].type === "BEHIND_BASE")
  reset(); pull.statusCheckRollup.contexts.nodes[0].conclusion = "FAILURE"; setPull(pull)
  T("run-status: a completed failed check names delivery verification", (await snapshot()).nextActions[0].type === "CHECK_FAILED")
  reset(); rmSync(receiptPath)
  T("run-status: missing receipts request verification", (await snapshot()).nextActions[0].type === "VERIFY_DELIVERY")
  reset(); writeFileSync(receiptPath, "broken")
  T("run-status: corrupt receipts request verification", (await snapshot()).nextActions[0].type === "VERIFY_DELIVERY")
  reset(); rmSync(launchResultPath)
  T("run-status: missing launcher result requests verification", (await snapshot()).nextActions[0].type === "VERIFY_DELIVERY")
  reset(); writeFileSync(launchResultPath, "broken")
  T("run-status: corrupt launcher results request verification", (await snapshot()).nextActions[0].type === "VERIFY_DELIVERY")
  reset(); pull.headRefOid = "a".repeat(40); pull.reviews.nodes.at(-1).commit.oid = pull.headRefOid; setPull(pull)
  report = await snapshot()
  T("run-status: moved heads report stale receipts and request verification", report.pullRequests[0].receipt === "RECEIPT_STALE" && report.nextActions[0].type === "VERIFY_DELIVERY")
  reset(); writeReadinessReceipt(repo.path, { ...receipt(pull), ci: { ...receipt(pull).ci, green: false } })
  report = await snapshot()
  T("run-status: non-ready current receipts name the recorder and exact artifacts", report.nextActions[0].type === "RECORD_READINESS" && report.nextActions[0].command.includes("delivery.json") && report.nextActions[0].command.includes("ticket.json"))
  reset(); pull.isDraft = true; setPull(pull)
  T("run-status: drafts cannot become merge candidates", !(await snapshot()).nextActions.some((entry) => entry.type === "MERGE_CANDIDATE"))

  for (const state of ["CLOSED", "MERGED"]) {
    reset(); pull.state = state; setPull(pull)
    report = await snapshot()
    T(`run-status: ${state.toLowerCase()} outside the run is observed without PR actions`, report.pullRequests[0].status === state && report.nextActions[0].type === "NO_ACTION")
  }
  reset(); rateLimit.resources.graphql.remaining = 1; rateLimit.resources.graphql.reset = options.now / 1000 + 500
  report = await snapshot()
  T("run-status: low budget does not query or invent actions from missing rows", report.pullRequests[0].status === "RATE_LIMITED" && report.nextActions[0].type === "NO_ACTION" && !readCalls.some((args) => args[1] === "graphql"))
  rateLimit = structuredClone(fixture.rateLimit)

  reset(); state(["#1100"])
  report = await snapshot()
  T("run-status: admission capacity and remaining work produce a slot action", report.nextActions.some((entry) => entry.type === "SLOT_FREE" && entry.command.includes("plan-queue.mjs")))
  queued = 31
  T("run-status: admission pressure suppresses the slot action", !(await snapshot()).nextActions.some((entry) => entry.type === "SLOT_FREE"))
  queued = 0
  reset(); writeRunState({ sessionId, sleep: true, remaining: [], pullRequests: [] }, repo.path)
  writeFileSync(runStatePath(repo.path), JSON.stringify({ sessionId, sleep: true, remaining: [], pullRequests: [], readinessLedger: [] }))
  report = await snapshot()
  T("run-status: an exited worker without a PR requests verification", report.nextActions.some((entry) => entry.type === "VERIFY_DELIVERY" && entry.launcherPid === 123))

  reset(); registerWakeSource({ pid: 999999999, workerPid: process.pid, logFile: stage("run-status/worker.log", "worker remains live"), what: "orphan" }, repo.path)
  report = await snapshot()
  T("run-status: live orphan workers are reported and suppress capacity actions", report.wakeSources.orphaned.length === 1 && report.nextActions.some((entry) => entry.type === "ORPHANED_WORKER"))
  clearWakeSource(999999999, repo.path)

  reset(); pull.reviewThreads.pageInfo.hasNextPage = true; setPull(pull)
  T("run-status: truncated connections cannot produce a merge or verification inference", !(await snapshot()).nextActions.some((entry) => ["MERGE_CANDIDATE", "VERIFY_DELIVERY", "RECORD_READINESS"].includes(entry.type)))
  reset(); response.data.repository[`pr${number}`] = { number }
  T("run-status: malformed PRs are unreadable without crashing", (await snapshot()).pullRequests[0].status === "UNREADABLE")

  reset(); malformedJson = true
  report = await snapshot()
  T("run-status: invalid JSON errors redact the selected child token", !JSON.stringify(report).includes("status-secret"))
  malformedJson = false

  reset(); const sibling = stageRepo("run-status-other-owner"); sibling.git(["remote", "set-url", "origin", "https://github.com/another-owner/api.git"])
  failingOwner = sibling.path
  report = await snapshot({ config: { ...config, repos: { ui: repo.path, api: sibling.path } } })
  T("run-status: one owner's auth failure preserves other repository rows and redacts errors", report.repositories[1].status === "UNREADABLE" && report.pullRequests[0].status === "OPEN" && !JSON.stringify(report).includes("ghp_"))
  failingOwner = null

  reset(); const ten = Array.from({ length: 10 }, (_, index) => ({ ...row, prNumber: number + index }))
  writeFileSync(runStatePath(repo.path), JSON.stringify({ sessionId, sleep: true, remaining: [], readinessLedger: ten }))
  const repository = response.data.repository
  for (const entry of ten) {
    repository[`pr${entry.prNumber}`] = { ...structuredClone(pull), number: entry.prNumber }
    repository[`pr${entry.prNumber}`].statusCheckRollup.contexts.nodes[0].status = "IN_PROGRESS"
  }
  report = await snapshot()
  T(`run-status: ten PRs fit the output budget (${Buffer.byteLength(JSON.stringify(report))} bytes)`, Buffer.byteLength(JSON.stringify(report)) <= 8192, `bytes: ${Buffer.byteLength(JSON.stringify(report))}`)
  T("run-status: ten PRs still use one GraphQL query", readCalls.filter((args) => args[1] === "graphql").length === 1)

  const admissionPath = join(workerLaunchDirectory(repo.path), "admission-invalid.json")
  writeFileSync(admissionPath, "broken")
  const before = readdirSync(workerLaunchDirectory(repo.path)).join(",")
  const counts = readAdmissionCounts({ repoRoot: repo.path, snapshots: [{ status: "OK", slug: "test-owner/ui", openPullRequests: 1, queuedRuns: 0, openBranches: [] }], limits: config.caps })
  T("run-status: count-only admission neither cleans nor reserves", !counts.complete && !counts.slotFree && before === readdirSync(workerLaunchDirectory(repo.path)).join(",") && existsSync(admissionPath))
  rmSync(admissionPath)
  const expiredPath = join(workerLaunchDirectory(repo.path), "admission-expired.json")
  writeFileSync(expiredPath, JSON.stringify({ pid: process.pid, startIdentity: "fixture", repository: "test-owner/ui", branch: "fixture", releasedAt: options.now - RELEASE_HOLD_MS - 1 }))
  const expiredCounts = readAdmissionCounts({ repoRoot: repo.path, snapshots: [{ status: "OK", slug: "test-owner/ui", openPullRequests: 1, queuedRuns: 0, openBranches: [] }], limits: config.caps, now: options.now })
  T("run-status: expired admission holds do not count and remain untouched", expiredCounts.reservations.queuedRuns === 0 && existsSync(expiredPath))
}
