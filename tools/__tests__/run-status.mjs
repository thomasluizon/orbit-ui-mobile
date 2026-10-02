import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, stage, stageRepo, stageWithConfig, TOOLS_DIR } from "./_harness.mjs"
import { runStatus, statusQuery } from "../run-status.mjs"
import { readAdmissionCounts, RELEASE_HOLD_MS } from "../lib/admission.mjs"
import { writeReadinessReceipt } from "../lib/readiness-receipt.mjs"
import { clearWakeSource, readRunState, registerWakeSource, reserveWorkerLaunch, runStatePath, workerLaunchDirectory, writeRunState } from "../lib/run-state.mjs"

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
  const row = { repositoryKey: "ui", prNumber: number, receiptPath, issue: "#1092", worktree: repo.path, branch: pull.headRefName,
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
  rmSync(receiptPath)
  T("run-status: missing launcher result requests verification", (await snapshot()).nextActions[0].type === "VERIFY_DELIVERY")
  reset(); writeFileSync(launchResultPath, "broken")
  rmSync(receiptPath)
  T("run-status: corrupt launcher results request verification", (await snapshot()).nextActions[0].type === "VERIFY_DELIVERY")
  reset(); pull.headRefOid = "a".repeat(40); pull.reviews.nodes.at(-1).commit.oid = pull.headRefOid; setPull(pull)
  report = await snapshot()
  T("run-status: moved heads report stale receipts and request verification", report.pullRequests[0].receipt === "RECEIPT_STALE" && report.nextActions[0].type === "VERIFY_DELIVERY")
  reset(); writeReadinessReceipt(repo.path, { ...receipt(pull), ticket: { ...receipt(pull).ticket, lastPostedState: "pending" } })
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

  reset()
  const previousRun = readFileSync(runStatePath(repo.path), "utf8")
  writeFileSync(runStatePath(repo.path), JSON.stringify({ sessionId, readinessLedger: [{ ...row, merged: "a".repeat(40) }] }))
  report = await snapshot()
  T("run-status: recorded merges are compact and omitted from the live query", report.settledPullRequests.ui.includes(number) && !readCalls.find((args) => args[1] === "graphql").at(-1).includes(`pr${number}:`))
  writeFileSync(runStatePath(repo.path), previousRun)
  reset()
  writeFileSync(runStatePath(repo.path), JSON.stringify({ sessionId, readinessLedger: [{ ...row, closed: true }] }))
  report = await snapshot()
  T("run-status: a previously closed unmerged PR is queried and a reopen is observed", report.pullRequests[0].status === "OPEN" && readCalls.some((args) => args[1] === "graphql"))
  writeFileSync(runStatePath(repo.path), previousRun)

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

  reset()
  const indexedLaunch = { ...launch, launcherPid: 999999998 }
  reserveWorkerLaunch(indexedLaunch, 2, repo.path)
  rmSync(launchResultPath)
  rmSync(receiptPath)
  report = await snapshot()
  T("run-status: a missing final result recovers exact commands from the launch ledger", report.launcherResults.some((entry) => entry.launcherPid === indexedLaunch.launcherPid && entry.corrupt) && report.nextActions.some((entry) => entry.type === "VERIFY_DELIVERY" && !entry.command.includes("$WORKTREE")))

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

  reset(); state(["#1100"])
  const atCap = { ...config, caps: { ...config.caps, parallelTickets: 1 } }
  const startedAt = new Date().toISOString()
  registerWakeSource({ pid: process.pid, workerPid: null, what: "worker #1100", logFile: stage("run-status/pending.log", ""), startedAt, pending: true, pendingAt: startedAt }, repo.path)
  report = await snapshot({ config: atCap })
  T("run-status: a fresh pending launcher occupies the last parallel slot", report.wakeSources.live.length === 1 && !report.nextActions.some((entry) => entry.type === "SLOT_FREE"))
  clearWakeSource(process.pid, repo.path)
  registerWakeSource({ pid: process.pid, workerPid: null, repositoryKey: "ui", prNumbers: [number], what: "CI ui pull requests #1459" }, repo.path)
  T("run-status: a CI waiter never occupies a parallel worker slot", (await snapshot({ config: atCap })).nextActions.some((entry) => entry.type === "SLOT_FREE"))
  clearWakeSource(process.pid, repo.path)

  const worker = stageRepo("run-status-transition-worker")
  const baseSha = worker.git(["rev-parse", "HEAD"]).stdout.trim()
  worker.git(["switch", "-q", "-c", launch.branch])
  writeFileSync(join(worker.path, "worked.txt"), "delivery transition\n")
  worker.git(["add", "--", "worked.txt"])
  worker.git(["commit", "-q", "-m", "delivery transition"])
  worker.git(["push", "-q", "-u", "origin", launch.branch])
  const headSha = worker.git(["rev-parse", "HEAD"]).stdout.trim()
  const staged = stageWithConfig("run-status-transition", "verify-delivery.mjs", { ...realOrchestratorConfig(), repos: { ui: repo.path } })
  cpSync(join(TOOLS_DIR, "record-readiness.mjs"), join(staged.base, "tools", "record-readiness.mjs"))
  stage("staged/run-status-transition/tools/lib/github-issues.mjs", `export const resolveTicket = () => ({ number: 1092, reference: "#1092" })
export const readTicket = async () => ({ status: "In Review", state: "OPEN", stateReason: null, labels: [{ name: "repo:ui" }] })
export const assertRepositoryLabel = (ticket) => ticket
`)
  row.worktree = worker.path
  row.deliveryPath = join(repo.path, ".git", "delivery.json")
  row.ticketPath = join(repo.path, ".git", "ticket.json")
  const transitionPull = () => ({ ...readyPull(), headRefOid: headSha, baseRefOid: baseSha, baseRefName: "main" })
  const decidingEnvironment = () => {
    const livePull = { ...pull, headRepository: { nameWithOwner: "test-owner/ui" }, commits: { nodes: [{ commit: { oid: headSha } }] } }
    livePull.reviews.nodes = [{ ...pull.reviews.nodes.at(-1), commit: { oid: headSha }, submittedAt: "2026-10-01T21:00:00Z" }]
    livePull.reviews.pageInfo.startCursor = null
    return orcaEnv([
      { match: "auth token --user test-owner", stdout: "status-secret" },
      { match: `pr list --head ${pull.headRefName}`, stdout: JSON.stringify([{ number, url: `https://github.com/test-owner/ui/pull/${number}`, headRefOid: headSha, baseRefName: "main", additions: 1, deletions: 0, changedFiles: 1, title: "#1092 delivery", body: "", labels: [] }]) },
      { match: "api graphql", stdout: JSON.stringify({ data: { repository: { nameWithOwner: "test-owner/ui", pullRequest: livePull } } }) },
      { match: "/activity?", stdout: JSON.stringify([{ activity_type: "push", actor: { login: "<actor>" }, after: headSha, before: baseSha, id: 1, node_id: "<activity-id>", ref: `refs/heads/${pull.headRefName}`, timestamp: "2026-10-01T20:00:00Z" }]) },
      { match: "protection/required_status_checks", stdout: JSON.stringify({ contexts: pull.statusCheckRollup.contexts.nodes.map((check) => check.name), checks: pull.statusCheckRollup.contexts.nodes.map((check) => ({ context: check.name, app_id: check.checkSuite.app.databaseId })) }) },
      { match: "api repos/", stdout: JSON.stringify({ behind_by: 0 }) },
    ])
  }
  const execute = (command) => spawnSync("bash", ["-c", command.replace("node tools/", `node '${staged.base}/tools/'`)], { cwd: repo.path, encoding: "utf8", env: { ...process.env, ...decidingEnvironment(), GH_TOKEN: "status-secret" } })
  const verify = () => `node tools/verify-delivery.mjs --repo ui --issue '#1092' --worktree '${worker.path}' --branch '${pull.headRefName}' --base main > '${row.deliveryPath}'`
  const record = () => `node tools/record-readiness.mjs --repo ui --pr ${number} --delivery '${row.deliveryPath}' --ticket '${row.ticketPath}'`
  const resetTransition = () => {
    reset(); pull = transitionPull(); pull.reviews.nodes.at(-1).commit.oid = headSha; setPull(pull)
    writeFileSync(runStatePath(repo.path), JSON.stringify({ sessionId, remaining: [], pullRequests: [row], readinessLedger: [row] }))
    writeFileSync(join(resultDirectory, `${indexedLaunch.launcherPid}.json`), JSON.stringify(indexedLaunch))
    writeFileSync(row.ticketPath, JSON.stringify({ issue: "#1092", repositoryKey: "ui", prNumber: number, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha, baseSha }))
    rmSync(receiptPath)
    rmSync(row.deliveryPath, { force: true })
  }
  resetTransition()
  pull.statusCheckRollup.contexts.nodes[0].status = "IN_PROGRESS"
  pull.statusCheckRollup.contexts.nodes[0].conclusion = null
  setPull(pull)
  const pendingDelivery = execute(verify())
  const pendingReceipt = execute(record())
  T("run-status: deciding tools produce pending delivery and CI_STALE evidence", pendingDelivery.status === 1 && /CI_STALE/.test(pendingReceipt.stdout), pendingDelivery.stderr + pendingReceipt.stdout + pendingReceipt.stderr)
  report = await snapshot()
  T("run-status: pending evidence waits for live CI", report.nextActions[0].type === "REARM_WAIT_CI", JSON.stringify(report))
  pull.statusCheckRollup.contexts.nodes[0].status = "COMPLETED"
  pull.statusCheckRollup.contexts.nodes[0].conclusion = "SUCCESS"
  setPull(pull)
  report = await snapshot()
  T("run-status: settled live CI refreshes pending delivery before recording", report.nextActions[0].type === "VERIFY_DELIVERY", JSON.stringify(report.nextActions))
  let advanced = execute(report.nextActions[0].command)
  report = await snapshot()
  T("run-status: refreshed delivery advances to recording", advanced.status === 0 && report.nextActions[0].type === "RECORD_READINESS", JSON.stringify(report.nextActions) + readFileSync(row.deliveryPath, "utf8") + advanced.stderr)
  advanced = execute(report.nextActions[0].command)
  T("run-status: the pending-to-green command sequence reaches a quoted READY receipt", advanced.status === 0 && /"verdict": "READY"/.test(advanced.stdout) && (await snapshot()).nextActions[0].type === "MERGE_CANDIDATE", advanced.stdout + advanced.stderr)

  for (const telemetry of ["absent", "corrupt"]) {
    resetTransition()
    for (const path of [launchResultPath, join(resultDirectory, `${indexedLaunch.launcherPid}.json`)]) {
      if (telemetry === "absent") rmSync(path)
      else writeFileSync(path, "broken")
    }
    report = await snapshot()
    T(`run-status: ${telemetry} telemetry without evidence requests recovery`, report.nextActions[0].type === "VERIFY_DELIVERY")
    advanced = execute(report.nextActions[0].command)
    report = await snapshot()
    T(`run-status: verified delivery supersedes ${telemetry} telemetry`, advanced.status === 0 && report.nextActions[0].type === "RECORD_READINESS", JSON.stringify(report.nextActions))
    // Drive the recorder even on the defective snapshot, so the READY recovery assertion runs too.
    advanced = execute(record())
    report = await snapshot()
    T(`run-status: recorded READY supersedes ${telemetry} telemetry`, advanced.status === 0 && report.nextActions[0].type === "MERGE_CANDIDATE" && (telemetry === "absent" ? !existsSync(launchResultPath) : readFileSync(launchResultPath, "utf8") === "broken"), JSON.stringify(report.nextActions))
  }
}
