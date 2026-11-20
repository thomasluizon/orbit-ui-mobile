import { spawnSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { readDriveConfig, workerEnvironment } from "../lib/config.mjs"
import {
  classifyCheckFailure,
  closeTicket,
  comment,
  createTicket,
  dependabotUpdateTypes,
  deployedAt,
  deployFirstHolds,
  editLabels,
  failedChecks,
  isAncestor,
  merge,
  mergeBar,
  needsWholeDiff,
  pullfrogRunsFor,
  readDependabotUpdateTypes,
  readFailedSteps,
  readRepositoryState,
  readTickets,
  rerunFailed,
  resolveThreads,
  retarget,
  setStatus,
  trackedMergeSha,
  unmetDeployFirst,
  updateBranch,
  wholeDiffApproved,
} from "../lib/github.mjs"
import { ORDER_KINDS, partOf, renderBrief, renderOrder } from "../lib/order.mjs"
import {
  finalResult,
  isUsageLimitMessage,
  launch,
  listSkillNames,
  logEvent,
  logFinalResult,
  NO_STOP,
  probe,
  readEvent,
  readWorkerToken,
  WORKER_DENY,
  WORKER_LIMITS,
  workerCommand,
  workerEnvironmentFor,
  workerInvocation,
  workerSettings,
} from "../lib/worker.mjs"
import { T, realOrchestratorConfig, root, same, toolPath, SELF } from "./_harness.mjs"

const FIXTURE = JSON.parse(readFileSync(new URL("../__fixtures__/drive-github.json", import.meta.url), "utf8"))
const TICKETS = realOrchestratorConfig().tickets
const UI = "thomasluizon/orbit-ui-mobile"
const TICKET_REPOSITORY = "thomasluizon/orbit-tickets"
const HEAD = "d77a67c4c0ae619b41e7ffb03316f142aad46606"
const NEWEST_TICKET = 2074
const OLDER_TICKET = 2131
const OPEN_BLOCKER = 2186

const git = (directory, args) => {
  const result = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const stageRepository = (name, slug) => {
  const path = join(root, "drive", name)
  mkdirSync(path, { recursive: true })
  git(path, ["init", "-q", "--initial-branch=main"])
  git(path, ["remote", "add", "origin", `https://github.com/${slug}.git`])
  return path
}

const thrown = async (call) => {
  try {
    await call()
    return null
  } catch (error) {
    return error.message
  }
}

/** A gh runner that answers by route and keeps every call. A route matches when its text is inside the joined arguments. */
const scripted = (routes) => {
  const calls = []
  const run = async (args, options = {}) => {
    calls.push({ args, text: args.join(" "), input: options.input })
    const route = routes.find(([text]) => args.join(" ").includes(text))
    if (!route) throw new Error(`unexpected gh call: ${args.join(" ").slice(0, 160)}`)
    return typeof route[1] === "function" ? route[1](args, options) : route[1]
  }
  return { run, calls }
}

const json = JSON.stringify

const stateResponse = (numbers) => {
  const copy = structuredClone(FIXTURE.pullState.response)
  copy.data.repository.open.nodes = numbers.map((number) => ({ number }))
  return copy
}

const configCases = () => {
  const keySource = readFileSync(new URL("../lib/config.mjs", import.meta.url), "utf8")
  const keys = [.../const CLAUDE_ACCOUNT_OVERRIDE_KEYS = \[([^\]]*)\]/.exec(keySource)[1].matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1])
  T("lib/config.mjs: the override list is written as double-quoted strings that the grader can read from the source", keys.length >= 20 && keys.includes("CLAUDE_CODE_OAUTH_TOKEN") && keys.includes("ANTHROPIC_API_KEY"))
  const environment = { PATH: "/usr/bin", HOME: "/home/x", CLAUDE_CONFIG_DIR: "/somewhere", ...Object.fromEntries(keys.map((key) => [key, "set"])) }
  same("lib/config.mjs: workerEnvironment keeps only the variables that name no account", workerEnvironment(environment), { PATH: "/usr/bin", HOME: "/home/x" })
  T("lib/config.mjs: workerEnvironment leaves the parent environment unchanged", environment.CLAUDE_CONFIG_DIR === "/somewhere" && environment.ANTHROPIC_API_KEY === "set")

  const base = realOrchestratorConfig()
  const stageConfig = (label, config) => {
    const path = join(root, "drive-config", label)
    mkdirSync(join(path, ".claude"), { recursive: true })
    git(path, ["init", "-q", "--initial-branch=main"])
    writeFileSync(join(path, ".claude", "orchestrator.json"), json(config))
    return path
  }
  const minimal = { tickets: base.tickets, repos: base.repos, relay: "ignored", anythingElse: { nested: true } }
  const primary = stageConfig("primary", minimal)
  const read = readDriveConfig({ directory: primary })
  same("lib/config.mjs: the ticket keys come from the file", read.tickets.repository, TICKET_REPOSITORY)
  same("lib/config.mjs: each repository resolves from the primary root", read.repos, { ui: join(primary, base.repos.ui), api: join(primary, base.repos.api), landing: join(primary, base.repos.landing) })
  T("lib/config.mjs: every other key of the file is ignored", !("relay" in read) && !("anythingElse" in read))
  const worktree = join(root, "drive-config", "linked")
  git(primary, ["-c", "user.name=Gate", "-c", "user.email=gate@orbit.test", "commit", "-q", "--allow-empty", "-m", "base"])
  git(primary, ["worktree", "add", "-q", "--detach", worktree])
  same("lib/config.mjs: a linked worktree reads the primary checkout's file and roots", readDriveConfig({ directory: worktree }).repos.ui, join(primary, base.repos.ui))
  T("lib/config.mjs: the shipped file passes", readDriveConfig().tickets.statusOptions.Done === base.tickets.statusOptions.Done)
}

const configRefusals = async () => {
  const base = realOrchestratorConfig()
  const refuse = async (label, change) => {
    const config = structuredClone({ tickets: base.tickets, repos: base.repos })
    change(config)
    const path = join(root, "drive-config", label)
    mkdirSync(join(path, ".claude"), { recursive: true })
    git(path, ["init", "-q", "--initial-branch=main"])
    writeFileSync(join(path, ".claude", "orchestrator.json"), json(config))
    return await thrown(() => readDriveConfig({ directory: path }))
  }
  T("lib/config.mjs: a ticket repository that is not owner/name is refused", /owner\/repository slug/.test(await refuse("slug", (config) => { config.tickets.repository = "orbit-tickets" })))
  T("lib/config.mjs: a missing Done option is refused", /statusOptions\.Done/.test(await refuse("done", (config) => { delete config.tickets.statusOptions.Done })))
  T("lib/config.mjs: a project number that is not an integer is refused", /projectNumber/.test(await refuse("number", (config) => { config.tickets.projectNumber = "2" })))
  T("lib/config.mjs: a missing repository path is refused", /repos\.landing/.test(await refuse("repo", (config) => { delete config.repos.landing })))
}

const githubUnit = async () => {
  const config = { tickets: TICKETS, repos: { ui: stageRepository("ui", UI), api: stageRepository("api", "thomasluizon/orbit-api"), landing: stageRepository("landing", "thomasluizon/orbit-landing-page") } }
  const seams = (run) => ({ run, config })

  const readPulls = async (numbers, knownNumbers = [2509, 2510], response = stateResponse(numbers)) => {
    const { run, calls } = scripted([["DriveState", () => json(response)]])
    return { state: await readRepositoryState("ui", { knownNumbers, ...seams(run) }), calls }
  }
  const [open] = (await readPulls([2509])).state.pulls
  const [approved] = (await readPulls([2510])).state.pulls

  const { state: openState, calls: openCalls } = await readPulls([2509])
  same("lib/github.mjs: one read holds every open pull request when the numbers are known", [openCalls.length, openState.numbers, openState.defaultBranch, openState.slug], [1, [2509], "main", UI])
  same("lib/github.mjs: a pull request keeps its identity fields", [open.number, open.state, open.draft, open.author, open.headRef, open.headSha, open.baseRef, open.mergeState, open.changedFiles, open.files.length], [2509, "OPEN", false, "thomasluizon", "feature/ticket-2181-pace-governor", "a4c62a196324df595f5597e00863abc65f86435f", "main", "DIRTY", 23, 23])
  same("lib/github.mjs: behindBy comes from the comparison that names this head and this base tip", open.behindBy, 1)
  const labelled = stateResponse([2509])
  labelled.data.repository.pr2509.labels = FIXTURE.pullLabels.response.data.repository.pr7.labels
  same("lib/github.mjs: a pull request keeps the names of its labels", [open.labels, (await readPulls([2509], [2509, 2510], labelled)).state.pulls[0].labels], [[], ["parity:exempt"]])
  same("lib/github.mjs: the short form of a Tracks line names no ticket", open.tracks, null)
  same("lib/github.mjs: the full Tracks line names its ticket", approved.tracks, NEWEST_TICKET)
  same("lib/github.mjs: the required checks of branch protection carry their app ids", [open.requiredChecks.length, open.requiredChecks.find((check) => check.context === "pullfrog-approval")], [13, { context: "pullfrog-approval", appId: 1768019 }])
  same("lib/github.mjs: Pullfrog reviews keep state, commit, time and author", open.reviews.map((review) => [review.state, review.commit, review.author, review.blocking.length]), [["COMMENTED", open.headSha, "pullfrog", 0]])
  same("lib/github.mjs: threads keep their ids, state and first author", open.threads.map((thread) => [thread.id, thread.resolved, thread.author]), [["PRRT_kwDOR5Siws650OlW", false, "pullfrog"], ["PRRT_kwDOR5Siws650Olc", false, "pullfrog"], ["PRRT_kwDOR5Siws650Oll", false, "pullfrog"]])
  same("lib/github.mjs: only a request for a Pullfrog review stays of the issue comments", open.comments.map((entry) => [entry.author, entry.kind, entry.body]), [["thomasluizon", null, "@pullfrog review"]])
  T("lib/github.mjs: a rollup that holds every check reads as complete", open.checksComplete && open.threadsComplete && open.checks.length === 27)

  const missingHead = await readPulls([2509], [2509, 2510], (() => {
    const response = stateResponse([2509])
    response.data.repository.pr2509.baseRef.compare.headTarget.oid = "0".repeat(40)
    return response
  })())
  same("lib/github.mjs: a comparison that names another head gives no behindBy", missingHead.state.pulls[0].behindBy, null)

  const synthetic = stateResponse([2509])
  const reviewComments = synthetic.data.repository.pr2509.reviews.nodes[0].comments.nodes
  reviewComments.push({ body: "BLOCKING: a class\n\nsrc/a.mjs:4, src/b.mjs:9", path: "src/a.mjs", line: 4 })
  synthetic.data.repository.pr2509.comments.nodes.push({ id: "IC_x", body: "<!-- orbit-drive:request -->\n@pullfrog review whole diff", createdAt: "2026-11-20T10:00:00Z", author: { login: "thomasluizon" } })
  const { state: syntheticState } = await readPulls([2509], [2509, 2510], synthetic)
  same("lib/github.mjs: a review comment that starts with BLOCKING: is kept with its path and line", syntheticState.pulls[0].reviews[0].blocking.map((entry) => [entry.path, entry.line, entry.body.split("\n")[0]]), [["src/a.mjs", 4, "BLOCKING: a class"]])
  same("lib/github.mjs: a driver comment is kept with its marker kind", syntheticState.pulls[0].comments.map((entry) => entry.kind), [null, "request"])

  const unknown = await readPulls([2509, 2510], [])
  same("lib/github.mjs: a number the last tick did not know costs one more read for those numbers only", [unknown.calls.length, unknown.calls[0].text.includes("pr2509"), unknown.calls[1].text.includes("pr2509"), unknown.calls[1].text.includes("pr2510")], [2, false, true, true])
  same("lib/github.mjs: a known pull request that is no longer open is not returned", (await readPulls([2509], [2509, 2510])).state.pulls.map((pull) => pull.number), [2509])
  T("lib/github.mjs: more than 100 open pull requests is refused", /more than 100 open/.test(await thrown(() => {
    const response = stateResponse([2509])
    response.data.repository.open.pageInfo.hasNextPage = true
    return readPulls([2509], [2509], response)
  })))
  T("lib/github.mjs: a known number that is not a positive integer is refused before any call", /positive integers/.test(await thrown(() => readRepositoryState("ui", { knownNumbers: [1, "2) { id } x: pullRequest(number: 3"], ...seams(scripted([]).run) }))))
  T("lib/github.mjs: a GraphQL error is refused with its text", /errors: .*boom/.test(await thrown(() => readRepositoryState("ui", { knownNumbers: [], ...seams(async () => json({ errors: [{ message: "boom" }] })) }))))
  T("lib/github.mjs: output that is not JSON is refused", /invalid JSON/.test(await thrown(() => readRepositoryState("ui", { knownNumbers: [], ...seams(async () => "<html>") }))))

  const ticketRoute = (response) => scripted([["DriveTickets", () => json(response)]])
  const ticketRun = ticketRoute(FIXTURE.tickets.response)
  const tickets = await readTickets(seams(ticketRun.run))
  same("lib/github.mjs: every open ticket comes back in one read", [ticketRun.calls.length, tickets.map((ticket) => ticket.number)], [1, [2183, 2186, 2187, 2191, 2125]])
  const byNumber = Object.fromEntries(tickets.map((ticket) => [ticket.number, ticket]))
  same("lib/github.mjs: a ticket keeps its labels and its one repo: label", [byNumber[2186].labels, byNumber[2186].repoKey], [["repo:ui", "Improvement", "parity:no", "harness"], "ui"])
  same("lib/github.mjs: a blocker keeps its state, labels and repository", byNumber[2191].blockedBy.map((blocker) => [blocker.number, blocker.open, blocker.repoKey]), [[2187, true, "ui"], [2190, true, "api"]])
  same("lib/github.mjs: a closed blocker is not open", byNumber[2125].blockedBy.map((blocker) => [blocker.number, blocker.open]), [[2117, false], [2123, true]])
  same("lib/github.mjs: the owner's part comments keep their first line", byNumber[2186].comments.slice(0, 3).map((entry) => entry.body.split("\n")[0].slice(0, 11)), ["Part 1 of 3", "Part 2 of 3", "Part 3 of 3"])
  T("lib/github.mjs: a ticket with two repo: labels has no repository", (await readTickets(seams(ticketRoute((() => {
    const response = structuredClone(FIXTURE.tickets.response)
    response.data.repository.issues.nodes[0].labels.nodes.push({ name: "repo:api" })
    return response
  })()).run)))[0].repoKey === null)
  const paged = structuredClone(FIXTURE.tickets.response)
  paged.data.repository.issues.nodes[1].comments.pageInfo = { hasNextPage: true, endCursor: "cursor-1" }
  paged.data.repository.issues.pageInfo = { hasNextPage: true, endCursor: "issues-1" }
  const extraComment = { ...structuredClone(paged.data.repository.issues.nodes[1].comments.nodes[0]), id: "IC_more" }
  const pagedRun = scripted([
    ["DriveComments", () => json({ data: { repository: { issue: { comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [extraComment] } } } } })],
    ["after=issues-1", () => json(FIXTURE.tickets.response)],
    ["DriveTickets", () => json(paged)],
  ])
  const pagedTickets = await readTickets(seams(pagedRun.run))
  same("lib/github.mjs: a ticket whose comments run past one page reads the rest", pagedTickets[1].comments.map((entry) => entry.id).slice(-1), ["IC_more"])
  same("lib/github.mjs: a second page of tickets is read after the first", [pagedTickets.length, pagedRun.calls.filter((call) => call.text.includes("after=issues-1")).length], [10, 1])
  same("lib/github.mjs: deploy-first labels become environment and task pairs", deployFirstHolds(byNumber[2191].labels), [{ environment: "production", task: "deploy" }, { environment: "production", task: "android-release" }, { environment: "production", task: "ios-release" }])
  same("lib/github.mjs: a label that only starts like a hold is no hold", deployFirstHolds(["deploy-first:production", "deploy-first:", "repo:ui"]), [])

  mergeBarCases(approved)
  await pullfrogAndDeploymentCases(seams)
  await writeCases(seams)
  await dependabotCases(seams)
  ciCases(open, approved)
  await failureStepCases(seams)
}

const mergeBarCases = (approved) => {
  const ready = { ...approved, state: "OPEN", mergeState: "CLEAN", behindBy: 0, threads: approved.threads.map((thread) => ({ ...thread, resolved: true })) }
  const barOf = (changes, context) => mergeBar({ ...ready, ...changes }, context)
  same("lib/github.mjs: the bar holds for an approved head with green checks, no thread, no lag", barOf({}), [])
  same("lib/github.mjs: a merged pull request is not open", barOf({ state: "MERGED" }), ["not-open"])
  same("lib/github.mjs: a draft fails the bar", barOf({ draft: true }), ["draft"])
  same("lib/github.mjs: a pull request with no Tracks line fails the bar", barOf({ tracks: null }), ["untracked"])
  same("lib/github.mjs: a head that is not a full sha fails the bar", barOf({ headSha: "d77a67c" }), ["head-unknown", "review-not-approved-at-head"])
  const failing = ready.checks.map((check) => (check.name === "Lint" ? { ...check, conclusion: "FAILURE" } : check))
  same("lib/github.mjs: a failed check fails the bar", barOf({ checks: failing }), ["check-not-green:Lint"])
  const pending = ready.checks.map((check) => (check.name === "Lint" ? { ...check, status: "IN_PROGRESS", conclusion: null } : check))
  same("lib/github.mjs: a pending check fails the bar", barOf({ checks: pending }), ["check-not-green:Lint"])
  same("lib/github.mjs: a required check that never ran fails the bar", barOf({ checks: ready.checks.filter((check) => check.name !== "Guards") }), ["required-check-missing:Guards"])
  const wrongApp = ready.checks.map((check) => (check.name === "pullfrog-approval" ? { ...check, checkSuite: { app: { databaseId: 15368 } } } : check))
  same("lib/github.mjs: a check from the wrong app id does not satisfy the required check", barOf({ checks: wrongApp }), ["required-check-missing:pullfrog-approval"])
  same("lib/github.mjs: the Pullfrog check is required even when branch protection omits it", barOf({ requiredChecks: ready.requiredChecks.filter((check) => check.context !== "pullfrog-approval"), checks: ready.checks.filter((check) => check.name !== "pullfrog-approval") }), ["required-check-missing:pullfrog-approval"])
  const rerun = ready.checks.filter((check) => check.name === "PR Metadata")
  const older = rerun.reduce((first, second) => (first.startedAt < second.startedAt ? first : second))
  const markedOlder = ready.checks.map((check) => (check === older ? { ...check, conclusion: "FAILURE" } : check))
  same("lib/github.mjs: the newest rerun of a check replaces its earlier failed run", barOf({ checks: markedOlder }), [])
  const markedNewer = ready.checks.map((check) => (check !== older && check.name === "PR Metadata" ? { ...check, conclusion: "FAILURE" } : check))
  same("lib/github.mjs: a failed newest rerun fails the bar", barOf({ checks: markedNewer }), ["check-not-green:PR Metadata"])
  same("lib/github.mjs: the failed checks of a pull request leave out a run that a newer run replaced", failedChecks({ checks: markedOlder }), [])
  same("lib/github.mjs: the failed checks of a pull request name the newest run when it failed", failedChecks({ checks: markedNewer }).map((check) => [check.name, check.conclusion]), [["PR Metadata", "FAILURE"]])
  same("lib/github.mjs: the failed checks and the bar agree on every check of the recorded rollup", failedChecks({ checks: failing }).map((check) => `check-not-green:${check.name}`), barOf({ checks: failing }))
  same("lib/github.mjs: a check list that ends early fails the bar", barOf({ checksComplete: false }), ["checks-incomplete"])
  const review = ready.reviews.at(-1)
  same("lib/github.mjs: a review that is not APPROVED fails the bar", barOf({ reviews: [{ ...review, state: "COMMENTED" }] }), ["review-not-approved-at-head"])
  same("lib/github.mjs: a dismissed newest review fails the bar", barOf({ reviews: [...ready.reviews, { ...review, state: "DISMISSED", submittedAt: "2026-11-20T09:30:00Z" }] }), ["review-not-approved-at-head"])
  same("lib/github.mjs: an approval at an earlier commit fails the bar", barOf({ reviews: [{ ...review, commit: ready.commits[3].sha }] }), ["review-not-approved-at-head"])
  same("lib/github.mjs: no review fails the bar", barOf({ reviews: [] }), ["review-not-approved-at-head"])
  same("lib/github.mjs: an unresolved thread fails the bar", barOf({ threads: [...ready.threads, { id: "t", resolved: false, author: "pullfrog" }] }), ["threads-unresolved:1"])
  same("lib/github.mjs: an unresolved thread of any author fails the bar", barOf({ threads: [{ id: "t", resolved: false, author: "someone" }] }), ["threads-unresolved:1"])
  same("lib/github.mjs: a thread list that ends early fails the bar", barOf({ threadsComplete: false }), ["threads-incomplete"])
  same("lib/github.mjs: a pull request behind its base fails the bar", barOf({ behindBy: 2 }), ["behind:2"])
  same("lib/github.mjs: an unknown lag fails the bar", barOf({ behindBy: null }), ["behind-unknown"])
  same("lib/github.mjs: a merge state that is not CLEAN fails the bar", barOf({ mergeState: "BLOCKED" }), ["merge-state:BLOCKED"])
  same("lib/github.mjs: an open blocker of the tracked ticket fails the bar", barOf({}, { blockers: [3, 4] }), ["blocked-by:3,4"])
  same("lib/github.mjs: a pull request that carries needs:owner fails the bar", barOf({ labels: ["parity:exempt", "needs:owner"] }), ["needs-owner"])
  same("lib/github.mjs: a tracked ticket that carries needs:owner fails the bar", barOf({}, { ticketLabels: ["repo:ui", "needs:owner"] }), ["needs-owner"])
  same("lib/github.mjs: needs:owner on both the pull request and its ticket is one failed condition", barOf({ labels: ["needs:owner"] }, { ticketLabels: ["needs:owner"] }), ["needs-owner"])
  same("lib/github.mjs: other labels on the pull request and its ticket leave the bar alone", barOf({ labels: ["parity:exempt"] }, { ticketLabels: ["repo:ui", "needs:conversation"] }), [])
  same("lib/github.mjs: every failed condition is listed, not only the first", barOf({ draft: true, behindBy: 1, mergeState: "BEHIND" }), ["draft", "behind:1", "merge-state:BEHIND"])

  const dependabot = { author: "dependabot", tracks: null }
  same("lib/github.mjs: a Dependabot patch and minor update passes the bar with no Tracks line", barOf(dependabot, { updateTypes: ["patch", "minor"] }), [])
  same("lib/github.mjs: a Dependabot major update fails the bar", barOf(dependabot, { updateTypes: ["patch", "major"] }), ["dependabot-major"])
  same("lib/github.mjs: a Dependabot update of unknown type fails the bar", barOf(dependabot, { updateTypes: [null] }), ["dependabot-update-type-unknown"])
  same("lib/github.mjs: a Dependabot pull request with no type read fails the bar", barOf(dependabot, {}), ["dependabot-update-type-unknown"])
  same("lib/github.mjs: another author's patch types do not change the bar", barOf({}, { updateTypes: ["major"] }), [])

  const files = (count) => Array.from({ length: count }, (_, index) => `src/file${index}.mjs`)
  T("lib/github.mjs: a pull request with a fix launch needs the whole-diff pass", needsWholeDiff({ changedFiles: 3, files: files(3) }, { fixLaunches: 1 }))
  T("lib/github.mjs: 31 changed files need the whole-diff pass", needsWholeDiff({ changedFiles: 31, files: files(31) }))
  T("lib/github.mjs: 30 changed files do not", !needsWholeDiff({ changedFiles: 30, files: files(30) }))
  T("lib/github.mjs: a 3-file pull request with no fix launch does not", !needsWholeDiff({ changedFiles: 3, files: files(3) }, { fixLaunches: 0 }))
  for (const path of ["package-lock.json", "apps/web/package.json", "Directory.Packages.props", "src/Orbit.Api/Orbit.Api.csproj", "src/packages.lock.json"]) {
    T(`lib/github.mjs: a change to ${path} needs the whole-diff pass`, needsWholeDiff({ changedFiles: 1, files: [path] }))
  }
  for (const path of ["docs/package.json.md", "my-package.json", "src/Directory.Packages.props.bak", "csproj.txt"]) {
    T(`lib/github.mjs: a change to ${path} is not a manifest`, !needsWholeDiff({ changedFiles: 1, files: [path] }))
  }

  const wholeDiffReview = (body, changes = {}) => ({ ...review, body, ...changes })
  const requests = { [HEAD]: "2026-11-20T09:00:00Z" }
  const wholeDiffCases = [
    ["a body that starts with a quote line and holds Whole diff: in its first 200 bytes counts", wholeDiffReview("> ✅ Whole diff: no new issues.\n\nmore"), true],
    ["a lower case whole diff: does not count", wholeDiffReview("> ✅ No new issues. See the whole diff: none."), false],
    ["a marker after the first 200 bytes does not count", wholeDiffReview(`${"x".repeat(195)} Whole diff:`), false],
    ["a review submitted before the request does not count", wholeDiffReview("Whole diff: ok", { submittedAt: "2026-11-20T08:59:59Z" }), false],
    ["a review submitted at the request time does not count", wholeDiffReview("Whole diff: ok", { submittedAt: "2026-11-20T09:00:00Z" }), false],
    ["a review that is not APPROVED does not count", wholeDiffReview("Whole diff: ok", { state: "COMMENTED" }), false],
  ]
  for (const [name, entry, want] of wholeDiffCases) {
    T(`lib/github.mjs: ${name}`, wholeDiffApproved({ ...ready, reviews: [entry] }, { wholeDiffRequests: requests }) === want)
  }
  T("lib/github.mjs: a whole-diff review with no recorded request does not count", !wholeDiffApproved({ ...ready, reviews: [wholeDiffReview("Whole diff: ok")] }, {}))
  same("lib/github.mjs: a fix-launch pull request with no whole-diff review fails the bar", barOf({}, { fixLaunches: 1 }), ["whole-diff-review-missing"])
  same("lib/github.mjs: a fix-launch pull request with a whole-diff approval at its head passes the bar", barOf({ reviews: [wholeDiffReview("> Whole diff: ok")] }, { fixLaunches: 1, wholeDiffRequests: requests }), [])

  const [first, second, last] = [ready.commits.at(-3), ready.commits.at(-2), ready.commits.at(-1)]
  const merges = ready.commits.map((commit) => ([second.sha, last.sha].includes(commit.sha) ? { ...commit, parents: 2 } : commit))
  const earlier = wholeDiffReview("> Whole diff: ok", { commit: first.sha, submittedAt: "2026-11-20T09:10:00Z" })
  const checkOnly = { ...review, submittedAt: "2026-11-20T09:20:00Z" }
  const earlierContext = (cleanMerges) => ({ fixLaunches: 1, wholeDiffRequests: { [first.sha]: "2026-11-20T09:00:00Z" }, cleanMerges })
  same("lib/github.mjs: a whole-diff approval at an earlier commit holds when only clean base merges follow", barOf({ commits: merges, reviews: [earlier, checkOnly] }, earlierContext([second.sha, last.sha])), [])
  same("lib/github.mjs: a base merge that resolved a conflict breaks the earlier approval", barOf({ commits: merges, reviews: [earlier, checkOnly] }, earlierContext([second.sha])), ["whole-diff-review-missing"])
  same("lib/github.mjs: a later commit with one parent breaks the earlier approval", barOf({ reviews: [earlier, checkOnly] }, earlierContext([second.sha, last.sha])), ["whole-diff-review-missing"])
  same("lib/github.mjs: an earlier approval at a commit that left the branch breaks it", barOf({ commits: merges.slice(0, 3), reviews: [earlier, checkOnly] }, earlierContext([second.sha, last.sha])), ["whole-diff-review-missing"])
  same("lib/github.mjs: an earlier whole-diff approval without a head approval fails the bar", barOf({ commits: merges, reviews: [earlier] }, earlierContext([second.sha, last.sha])), ["review-not-approved-at-head"])
}

const pullfrogAndDeploymentCases = async (seams) => {
  const runsFor = async (responseRuns, number) => {
    const { run, calls } = scripted([["--workflow pullfrog.yml", () => json(responseRuns)]])
    return { runs: await pullfrogRunsFor("ui", number, seams(run)), calls }
  }
  const named = { ...FIXTURE.pullfrogRuns.response[0], databaseId: 1, displayTitle: `Respond to mention on #${7 * 10} [zzzzz]` }
  const { runs, calls } = await runsFor([...FIXTURE.pullfrogRuns.response, named], 7)
  same("lib/github.mjs: the Pullfrog runs of a pull request are the runs that name it", runs.map((entry) => entry.databaseId), FIXTURE.pullfrogRuns.response.map((entry) => entry.databaseId))
  same("lib/github.mjs: the run list asks for pullfrog.yml with the recorded fields", calls[0].args.slice(0, 7), ["run", "list", "--repo", UI, "--workflow", "pullfrog.yml", "--json"])
  same("lib/github.mjs: a run keeps its status, conclusion and times", [runs[0].status, runs[0].conclusion, runs[0].createdAt, runs[0].updatedAt], ["completed", "success", "2026-11-20T08:59:18Z", "2026-11-20T09:05:30Z"])

  const deploymentRoutes = (statusByDeployment) => [
    ["deployments?environment=production&task=deploy", () => json(FIXTURE.deployments.deploy.list)],
    ["deployments?environment=production&task=android-release", () => json(FIXTURE.deployments["android-release"].list)],
    ...Object.entries(statusByDeployment).map(([id, state]) => [`deployments/${id}/statuses`, () => json([{ ...FIXTURE.deployments.deploy.latestStatus[0], state }])]),
  ]
  const [newest, older] = FIXTURE.deployments.deploy.list
  const latest = async (statuses) => deployedAt("ui", "production", "deploy", seams(scripted(deploymentRoutes(statuses)).run))
  same("lib/github.mjs: the newest deployment whose latest status is success is returned", (await latest({ [newest.id]: "success" })).sha, newest.sha)
  same("lib/github.mjs: a newest deployment whose latest status is failure is skipped", (await latest({ [newest.id]: "failure", [older.id]: "success" })).sha, older.sha)
  same("lib/github.mjs: a deployment that is still in progress is skipped", (await latest({ [newest.id]: "in_progress", [older.id]: "success" })).sha, older.sha)
  same("lib/github.mjs: no successful deployment gives null", await latest({ [newest.id]: "failure", [older.id]: "inactive" }), null)
  const recorded = scripted([...deploymentRoutes({}).slice(0, 2), [`deployments/${newest.id}/statuses`, () => json(FIXTURE.deployments.deploy.latestStatus)], [`deployments/${older.id}/statuses`, () => json(FIXTURE.deployments.deploy.supersededLatestStatus)]])
  same("lib/github.mjs: the newest deployment wins, and a superseded one reads as inactive in the recorded answers", [(await deployedAt("ui", "production", "deploy", seams(recorded.run))).id, FIXTURE.deployments.deploy.supersededLatestStatus[0].state, recorded.calls.length], [newest.id, "inactive", 2])
  const failedNewest = scripted([...deploymentRoutes({}).slice(0, 2), [`deployments/${newest.id}/statuses`, () => json([{ ...FIXTURE.deployments.deploy.latestStatus[0], state: "failure" }])], [`deployments/${older.id}/statuses`, () => json(FIXTURE.deployments.deploy.supersededLatestStatus)]])
  same("lib/github.mjs: a failed newest deployment and a superseded older one leave no successful deployment", await deployedAt("ui", "production", "deploy", seams(failedNewest.run)), null)
  const askedFor = scripted(deploymentRoutes({ [newest.id]: "success", [FIXTURE.deployments["android-release"].list[0].id]: "success" }))
  await deployedAt("ui", "production", "android-release", seams(askedFor.run))
  same("lib/github.mjs: the deployment read filters by environment and task", askedFor.calls[0].args[1], `repos/${UI}/deployments?environment=production&task=android-release&per_page=100`)

  const compareRun = (answer) => scripted([["/compare/", () => answer]])
  for (const [status, want] of [["ahead", true], ["identical", true], ["behind", false], ["diverged", false]]) {
    const { run, calls } = compareRun(`${status}\n`)
    T(`lib/github.mjs: a compare status of ${status} means ${want ? "deployed" : "not deployed"}`, (await isAncestor("ui", "a".repeat(40), "b".repeat(40), seams(run))) === want && calls[0].args[1] === `repos/${UI}/compare/${"a".repeat(40)}...${"b".repeat(40)}`)
  }
  T("lib/github.mjs: a sha that is not 40 hex characters is refused before any call", /40-character/.test(await thrown(() => isAncestor("ui", "../x", "b".repeat(40), seams(scripted([]).run)))))
  T("lib/github.mjs: the recorded compare answers read as the recorded facts", (await isAncestor("ui", "a".repeat(40), "b".repeat(40), seams(compareRun(FIXTURE.compare.ahead).run))) && !(await isAncestor("ui", "a".repeat(40), "b".repeat(40), seams(compareRun(FIXTURE.compare.behind).run))) && (await isAncestor("ui", "a".repeat(40), "b".repeat(40), seams(compareRun(FIXTURE.compare.identical).run))))

  const trackedRun = (merges) => scripted([["pr list", () => json(merges)]])
  const newestRun = trackedRun(FIXTURE.trackedMerges.newest)
  same("lib/github.mjs: the merge commit of the newest merged pull request that tracks the ticket", await trackedMergeSha("ui", NEWEST_TICKET, seams(newestRun.run)), "7947f08946e43df08d7182a337a882f9cef61e07")
  same("lib/github.mjs: the search names the ticket and the body", newestRun.calls[0].args.slice(0, 8), ["pr", "list", "--repo", UI, "--state", "merged", "--search", `"Tracks ${TICKET_REPOSITORY}#${NEWEST_TICKET}" in:body`])
  same("lib/github.mjs: a ticket that no merged body names gives null", await trackedMergeSha("ui", 3, seams(newestRun.run)), null)
  same("lib/github.mjs: a ticket number that only starts like another does not match", await trackedMergeSha("ui", 207, seams(newestRun.run)), null)

  const holdRoutes = (tracked, compareByDeployment) => [
    ["pr list", () => json(tracked)],
    ...deploymentRoutes({ [newest.id]: "success", [FIXTURE.deployments["android-release"].list[0].id]: "success" }),
    ["/compare/", (args) => compareByDeployment[args[1].split("...")[1]]],
  ]
  const [deploy, android] = [newest.sha, FIXTURE.deployments["android-release"].list[0].sha]
  const blocker = { number: OLDER_TICKET, repoKey: "ui", labels: ["deploy-first:production/deploy", "deploy-first:production/android-release"] }
  const answers = (deployAnswer, androidAnswer) => ({ [deploy]: deployAnswer, [android]: androidAnswer })
  same("lib/github.mjs: a blocker merged before both deployments has no unmet hold", await unmetDeployFirst(blocker, seams(scripted(holdRoutes(FIXTURE.trackedMerges.older, answers(FIXTURE.compare.ahead, FIXTURE.compare.identical))).run)), [])
  same("lib/github.mjs: a hold is unmet when only one of two tasks contains the merge", await unmetDeployFirst(blocker, seams(scripted(holdRoutes(FIXTURE.trackedMerges.older, answers(FIXTURE.compare.ahead, FIXTURE.compare.behind))).run)), [{ environment: "production", task: "android-release" }])
  same("lib/github.mjs: a blocker merged after both deployments has both holds unmet", (await unmetDeployFirst({ ...blocker, number: NEWEST_TICKET }, seams(scripted(holdRoutes(FIXTURE.trackedMerges.newest, answers(FIXTURE.compare.behind, FIXTURE.compare.behind))).run))).length, 2)
  same("lib/github.mjs: a blocker with no merged pull request has every hold unmet", (await unmetDeployFirst({ ...blocker, number: 3 }, seams(scripted(holdRoutes(FIXTURE.trackedMerges.newest, {})).run))).length, 2)
  same("lib/github.mjs: a blocker with no repository label has every hold unmet", (await unmetDeployFirst({ ...blocker, repoKey: null }, seams(scripted([]).run))).length, 2)
  same("lib/github.mjs: a blocker with no deploy-first label has no hold", await unmetDeployFirst({ ...blocker, labels: ["repo:ui"] }, seams(scripted(holdRoutes(FIXTURE.trackedMerges.older, {})).run)), [])
}

const writeCases = async (seams) => {
  const { threadId, response } = FIXTURE.resolveThread
  const resolveRun = scripted([["resolveReviewThread", () => json(response)]])
  await resolveThreads([threadId], seams(resolveRun.run))
  const mutation = resolveRun.calls[0].args.find((argument) => argument.startsWith("query="))
  same("lib/github.mjs: the thread mutation names each thread id from the caller", [mutation.includes(`resolveReviewThread(input: { threadId: "${threadId}" })`), resolveRun.calls.length], [true, 1])
  const two = scripted([["resolveReviewThread", () => json({ data: { t0: response.data.t0, t1: { thread: { id: "other", isResolved: true } } } })]])
  await resolveThreads([threadId, "other"], seams(two.run))
  T("lib/github.mjs: two threads are two aliases of one call", two.calls.length === 1 && two.calls[0].text.includes("t0: resolveReviewThread") && two.calls[0].text.includes("t1: resolveReviewThread"))
  T("lib/github.mjs: a thread that stays unresolved is refused", /left 1 thread/.test(await thrown(() => resolveThreads([threadId], seams(scripted([["resolveReviewThread", () => json({ data: { t0: { thread: { id: threadId, isResolved: false } } } })]]).run)))))
  const none = scripted([])
  await resolveThreads([], seams(none.run))
  same("lib/github.mjs: no thread makes no call", none.calls.length, 0)

  const head = "f".repeat(40)
  const mergeRun = scripted([["pr merge", () => ""]])
  await merge("ui", 8, head, seams(mergeRun.run))
  same("lib/github.mjs: the merge is one squash merge that matches the exact head", mergeRun.calls.map((call) => call.args), [["pr", "merge", "8", "--repo", UI, "--squash", "--match-head-commit", head]])
  T("lib/github.mjs: a merge never carries --admin", !mergeRun.calls[0].text.includes("--admin"))
  T("lib/github.mjs: a short head sha is refused before any call", /40-character/.test(await thrown(() => merge("ui", 8, "f".repeat(7), seams(scripted([]).run)))))
  const branchRun = scripted([["pr ", () => ""], ["run rerun", () => ""]])
  await updateBranch("api", 3, seams(branchRun.run))
  await retarget("landing", 4, "main", seams(branchRun.run))
  await rerunFailed("ui", 99, seams(branchRun.run))
  same("lib/github.mjs: update, retarget and rerun are one command each", branchRun.calls.map((call) => call.args), [
    ["pr", "update-branch", "3", "--repo", "thomasluizon/orbit-api"],
    ["pr", "edit", "4", "--repo", "thomasluizon/orbit-landing-page", "--base", "main"],
    ["run", "rerun", "99", "--failed", "--repo", UI],
  ])

  const commentRun = scripted([["issues/", () => ""]])
  await comment("tickets", 12, "<!-- orbit-drive:notice -->\nbody", seams(commentRun.run))
  await comment("ui", 8, "text", seams(commentRun.run))
  same("lib/github.mjs: a comment is one POST of a JSON body on stdin", commentRun.calls.map((call) => [call.args, call.input]), [
    [["api", `repos/${TICKET_REPOSITORY}/issues/12/comments`, "--method", "POST", "--input", "-"], json({ body: "<!-- orbit-drive:notice -->\nbody" })],
    [["api", `repos/${UI}/issues/8/comments`, "--method", "POST", "--input", "-"], json({ body: "text" })],
  ])
  T("lib/github.mjs: an empty comment is refused", /non-empty/.test(await thrown(() => comment("ui", 8, " ", seams(commentRun.run)))))

  const labelRoutes = [["label list", () => json(FIXTURE.ticketOperations.labels)], ["edit", () => ""]]
  const labelRun = scripted(labelRoutes)
  await editLabels("tickets", 12, { add: ["needs:owner"], remove: ["owner-work"] }, seams(labelRun.run))
  await editLabels("ui", 8, { add: ["needs:owner"] }, seams(labelRun.run))
  same("lib/github.mjs: a ticket and a pull request each get their own edit command", labelRun.calls.filter((call) => call.args[1] === "edit").map((call) => call.args), [
    ["issue", "edit", "12", "--repo", TICKET_REPOSITORY, "--add-label", "needs:owner", "--remove-label", "owner-work"],
    ["pr", "edit", "8", "--repo", UI, "--add-label", "needs:owner"],
  ])
  const unknownRun = scripted(labelRoutes)
  T("lib/github.mjs: an unknown label is refused before any edit", /Unknown label\(s\): nope/.test(await thrown(() => editLabels("tickets", 12, { add: ["nope"] }, seams(unknownRun.run)))) && unknownRun.calls.every((call) => call.args[1] !== "edit"))
  T("lib/github.mjs: an edit with nothing to change is refused", /at least one label/.test(await thrown(() => editLabels("tickets", 12, {}, seams(unknownRun.run)))))

  const statusRoutes = (items) => [["DriveProjectItems", () => json(items)], ["DriveStatus", () => json(FIXTURE.ticketStatus.update)]]
  const statusRun = scripted(statusRoutes(FIXTURE.ticketStatus.projectItems))
  await setStatus(4, "In Review", seams(statusRun.run))
  const update = statusRun.calls[1].args
  same("lib/github.mjs: the Status write sends the project, item, field and option ids that the configuration and the read name", update.filter((argument) => /^(project|item|field|option)=/.test(argument)), [
    `project=${TICKETS.projectId}`,
    `item=${FIXTURE.ticketStatus.projectItems.data.repository.issue.projectItems.nodes[0].id}`,
    `field=${TICKETS.statusFieldId}`,
    `option=${TICKETS.statusOptions["In Review"]}`,
  ])
  T("lib/github.mjs: the project read passes the ticket number as a number", statusRun.calls[0].args.includes("number=4") && statusRun.calls[0].args[statusRun.calls[0].args.indexOf("number=4") - 1] === "-F")
  T("lib/github.mjs: an unknown Status is refused", /Unknown ticket status/.test(await thrown(() => setStatus(4, "Nope", seams(statusRun.run)))))
  const offBoard = structuredClone(FIXTURE.ticketStatus.projectItems)
  offBoard.data.repository.issue.projectItems.nodes[0].project.id = "PVT_other"
  T("lib/github.mjs: a ticket that is not on the configured project is refused", /not on the configured project/.test(await thrown(() => setStatus(4, "Done", seams(scripted(statusRoutes(offBoard)).run)))))

  const closeRun = scripted([["issue close", () => ""], ...statusRoutes(FIXTURE.ticketStatus.projectItems)])
  await closeTicket(4, seams(closeRun.run))
  same("lib/github.mjs: a close is the completed close, then Status Done", [closeRun.calls[0].args, closeRun.calls.at(-1).args.includes(`option=${TICKETS.statusOptions.Done}`)], [["issue", "close", "4", "--repo", TICKET_REPOSITORY, "--reason", "completed"], true])

  const created = (extra = []) => scripted([
    ...extra,
    ["label list", () => json(FIXTURE.ticketOperations.labels)],
    ["issues/2186", () => FIXTURE.ticketOperations.blockerNumber],
    ["issue create", () => `https://github.com/${TICKET_REPOSITORY}/issues/77\n`],
    ["DriveProjectItems", () => json(FIXTURE.ticketStatus.projectItems)],
    ["DriveAddItem", () => json({ data: FIXTURE.ticketOperations.addItem.data })],
    ["DriveStatus", () => json(FIXTURE.ticketStatus.update)],
    ["--add-blocked-by", () => ""],
  ])
  const createRun = created()
  const ticket = await createTicket({ title: "A bug", body: "Body text", labels: ["Bug", "repo:ui", "Bug"], blockedBy: [`#${OPEN_BLOCKER}`, String(OPEN_BLOCKER)] }, seams(createRun.run))
  same("lib/github.mjs: a created ticket returns its number, url, title and Status", ticket, { number: 77, url: `https://github.com/${TICKET_REPOSITORY}/issues/77`, title: "A bug", milestone: null, status: "Todo" })
  const createCall = createRun.calls.find((call) => call.args[1] === "create")
  same("lib/github.mjs: the create call sends the body on stdin and each label once", [createCall.args, createCall.input], [["issue", "create", "--repo", TICKET_REPOSITORY, "--title", "A bug", "--body-file", "-", "--label", "Bug", "--label", "repo:ui"], "Body text"])
  T("lib/github.mjs: the new ticket gets its card, then Status Todo, then one blocker edit", createRun.calls.findIndex((call) => call.text.includes("DriveAddItem")) < createRun.calls.findIndex((call) => call.text.includes("DriveStatus")) && createRun.calls.at(-1).args.join(" ") === `issue edit 77 --repo ${TICKET_REPOSITORY} --add-blocked-by ${OPEN_BLOCKER}`)
  T("lib/github.mjs: the card add and the Status write use the configured ids", createRun.calls.find((call) => call.text.includes("DriveAddItem")).args.includes(`project=${TICKETS.projectId}`) && createRun.calls.find((call) => call.text.includes("DriveStatus")).args.includes(`option=${TICKETS.statusOptions.Todo}`))
  const refused = [
    ["an unknown label", { labels: ["nope"] }, /Unknown ticket label/],
    ["a blocker that is not a number", { labels: ["Bug"], blockedBy: ["one"] }, /#N or N/],
    ["a milestone", { labels: ["Bug"], milestone: "M1" }, /milestones/],
    ["the Done Status", { labels: ["Bug"], status: "Done" }, /cannot start at/],
    ["no label", { labels: [] }, /non-empty array/],
    ["an empty title", { labels: ["Bug"], title: " " }, /Ticket title/],
  ]
  for (const [name, change, pattern] of refused) {
    const run = created()
    T(`lib/github.mjs: createTicket refuses ${name} before it creates anything`, pattern.test(await thrown(() => createTicket({ title: "A bug", body: "Body", ...change }, seams(run.run)))) && run.calls.every((call) => call.args[1] !== "create"))
  }
  T("lib/github.mjs: a create that prints no issue URL is refused", /printed no issue URL/.test(await thrown(() => createTicket({ title: "A bug", body: "Body", labels: ["Bug"] }, seams(created([["issue create", () => "oops"]]).run)))))
}

const dependabotCases = async (seams) => {
  same("lib/github.mjs: a grouped update names the type of each dependency", dependabotUpdateTypes(FIXTURE.dependabotCommits.group), ["patch", "minor"])
  same("lib/github.mjs: an update with no update-type compares the versions that its message prints", dependabotUpdateTypes(FIXTURE.dependabotCommits.patch), ["patch"])
  same("lib/github.mjs: a NuGet bump with no update-type reads as patch", dependabotUpdateTypes(FIXTURE.dependabotCommits.nuget), ["patch"])
  same("lib/github.mjs: a bump of the minor number reads as minor", dependabotUpdateTypes(FIXTURE.dependabotCommits.minor), ["minor"])
  const major = FIXTURE.dependabotCommits.minor.map((message) => message.replaceAll("7.4.12", "8.0.0"))
  same("lib/github.mjs: a bump of the first number reads as major", dependabotUpdateTypes(major), ["major"])
  same("lib/github.mjs: a commit with no updated-dependencies block adds no type", dependabotUpdateTypes(["fix: a change by a person\n\nTracks a ticket"]), [])
  same("lib/github.mjs: a version that its message never prints reads as unknown", dependabotUpdateTypes(FIXTURE.dependabotCommits.minor.map((message) => message.replaceAll("from 7.3.5 to 7.4.12", "from nothing"))), [null])
  const read = scripted([["pulls/134/commits", () => json(FIXTURE.dependabotCommits.minor)]])
  same("lib/github.mjs: the update types of a pull request come from its commit messages", await readDependabotUpdateTypes("landing", 134, seams(read.run)), ["minor"])
  same("lib/github.mjs: the commit read is one REST call for 100 commits", read.calls[0].args.slice(0, 2), ["api", "repos/thomasluizon/orbit-landing-page/pulls/134/commits?per_page=100"])
}

const ciCases = (open, approved) => {
  const failed = failedChecks(open)
  same("lib/github.mjs: a failed check names its run and its job", failed.map((check) => [check.name, check.conclusion, check.runId, check.jobId]), [["pullfrog-approval", "FAILURE", "44663065457", 136048537814]])
  same("lib/github.mjs: a pull request with green checks has no failed check", failedChecks(approved), [])
  const stepsOf = (jobName, change = (steps) => steps) => FIXTURE.failedJobs.response.jobs.find((job) => job.name === jobName).steps.map((step) => ({ ...step })).map((step, position, steps) => change(steps)[position])
  const barrierSteps = stepsOf("Guard Migrations").filter((step) => step.conclusion === "failure").map((step) => step.name)
  same("lib/github.mjs: the recorded barrier failure is one failed step", barrierSteps, ["Require deployment barriers for schema contractions"])
  same("lib/github.mjs: a failed barrier step of Guard Migrations goes to the owner", classifyCheckFailure({ name: "Guard Migrations", failedSteps: barrierSteps }), "needs-owner")
  same("lib/github.mjs: a failed Set up job step gets a rerun", classifyCheckFailure({ name: "Lint", failedSteps: ["Set up job"] }), "rerun")
  same("lib/github.mjs: any other failure is a fix order", classifyCheckFailure({ name: "Unit Tests", failedSteps: ["Run Domain Tests"] }), "ci-fix")
  same("lib/github.mjs: another step of Guard Migrations is a fix order", classifyCheckFailure({ name: "Guard Migrations", failedSteps: ["Fail on edits to applied migrations"] }), "ci-fix")
  same("lib/github.mjs: the barrier step under another check name is a fix order", classifyCheckFailure({ name: "Unit Tests", failedSteps: barrierSteps }), "ci-fix")
}

const failureStepCases = async (seams) => {
  const [guard, scan] = FIXTURE.failedJobs.response.jobs
  const viewRun = scripted([["run view", () => json(FIXTURE.failedJobs.response)]])
  same("lib/github.mjs: the failed steps of a job come from the run's job list", await readFailedSteps("api", 41466313763, guard.databaseId, seams(viewRun.run)), ["Require deployment barriers for schema contractions"])
  same("lib/github.mjs: the job read asks for the jobs of the run", viewRun.calls[0].args, ["run", "view", "41466313763", "--repo", "thomasluizon/orbit-api", "--json", "jobs"])
  same("lib/github.mjs: a job with no failed step has none", await readFailedSteps("api", 41466313763, scan.databaseId, seams(viewRun.run)), [])
  const setup = structuredClone(FIXTURE.failedJobs.response)
  setup.jobs[1].steps[0].conclusion = "failure"
  same("lib/github.mjs: a failed Set up job step is read by its recorded name", await readFailedSteps("api", 1, scan.databaseId, seams(scripted([["run view", () => json(setup)]]).run)), ["Set up job"])
  const claimsFailed = scripted([["run rerun", () => ""]])
  await rerunFailed("ui", 5, seams(claimsFailed.run))
  T("lib/github.mjs: a rerun reruns only the failed jobs", claimsFailed.calls[0].args.includes("--failed"))
}

const configUnit = async () => {
  configCases()
  await configRefusals()
}

const WORKER_FIXTURE = JSON.parse(readFileSync(new URL("../__fixtures__/drive-worker.json", import.meta.url), "utf8"))
const HOME = "/home/driver"
const TOKEN = "worker-token-value"

/** A clock that runs its timers in time order when a test advances it. */
const fakeClock = () => {
  let now = 0
  let nextId = 0
  const timers = new Map()
  const add = (callback, ms, repeat) => {
    timers.set(++nextId, { callback, at: now + ms, ms, repeat })
    return nextId
  }
  return {
    now: () => now,
    setTimeout: (callback, ms) => add(callback, ms, false),
    clearTimeout: (handle) => timers.delete(handle),
    setInterval: (callback, ms) => add(callback, ms, true),
    clearInterval: (handle) => timers.delete(handle),
    pending: () => timers.size,
    advance: async (ms) => {
      const target = now + ms
      for (let due = nextTimer(timers, target); due !== null; due = nextTimer(timers, target)) {
        const [key, timer] = due
        now = timer.at
        if (timer.repeat) timer.at += timer.ms
        else timers.delete(key)
        await timer.callback()
      }
      now = target
    },
  }
}

const nextTimer = (timers, target) => [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at)[0] ?? null

/** A child process that records its stdin, and ends when the test says so. */
const fakeChild = (pid = 4242) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdinText = null
  child.stdin = { on: () => {}, end: (text) => { child.stdinText = text } }
  return child
}

const sortedKeys = (record) => Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))

const resultLine = (record) => JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done", session_id: "fixture-session", ...record })

const workerLaunchHarness = (name, { logText = "", fingerprint = () => "same", logSize = () => 0, limits } = {}) => {
  const directory = join(root, "drive-worker", name)
  mkdirSync(directory, { recursive: true })
  const logFile = join(directory, "worker.log")
  const pidFile = join(directory, "worker.pid")
  writeFileSync(logFile, logText)
  const child = fakeChild()
  const clock = fakeClock()
  const spawned = []
  const signals = []
  const invocation = { command: { executable: "claude", args: ["-p"] }, environment: { GH_TOKEN: TOKEN } }
  const run = launch({
    invocation, worktree: directory, order: "the order", logFile, pidFile, clock, limits,
    spawnChild: (...call) => { spawned.push(call); return child },
    kill: (pid, signal) => signals.push([pid, signal]),
    fingerprint, logSize,
  })
  return { run, child, clock, spawned, signals, logFile, pidFile, invocation, directory, ends: (code = 0, signal = null) => child.emit("exit", code, signal) }
}

const settingsCases = () => {
  const settings = workerSettings({ hotPath: `${HOME}/Developer/brain/hot.md`, skillNames: ["brain", "humanizer", "pdf"] })
  same("lib/worker.mjs: the settings JSON holds exactly the keys the order names", Object.keys(settings), ["claudeMdExcludes", "autoMemoryEnabled", "outputStyle", "skillOverrides", "permissions"])
  same("lib/worker.mjs: the hot file is excluded from loading", settings.claudeMdExcludes, [`${HOME}/Developer/brain/hot.md`])
  same("lib/worker.mjs: auto memory is off and the output style is the default", [settings.autoMemoryEnabled, settings.outputStyle], [false, "default"])
  same("lib/worker.mjs: every skill is off except humanizer", settings.skillOverrides, { brain: "off", pdf: "off" })
  same("lib/worker.mjs: the deny list is the one the order names", settings.permissions.deny, [
    "Edit(**/.github/migration-contracts.json)", "Write(**/.github/migration-contracts.json)", "Edit(**/.github/migration-locks.json)", "Write(**/.github/migration-locks.json)",
    "Bash(render *)", "Bash(terraform *)", "Bash(aws *)", "Bash(stripe *)", "Bash(gh workflow *)", "Bash(gh secret *)", "Bash(gh pr merge*)", "Bash(gh api *merge*)",
    "Bash(gh api * -X *)", "Bash(gh api -X *)", "Bash(gh api * --method *)", "Bash(gh api --method *)", "Bash(gh auth *)", "Bash(env -u GH_TOKEN *)", "Bash(unset GH_TOKEN*)", "Bash(*GH_TOKEN=*)", "Bash(security *)",
  ])
  T("lib/worker.mjs: the deny list of the settings is a copy, so a caller cannot change the constant", settings.permissions.deny !== WORKER_DENY && Object.isFrozen(WORKER_DENY))
  const schema = WORKER_FIXTURE.skillOverridesSchema
  const allowedValues = JSON.parse(/U\((\[[^\]]*\])\)/.exec(schema.schema)[1])
  T("lib/worker.mjs: every skillOverrides value that the worker writes is one the installed CLI accepts", Object.values(settings.skillOverrides).every((value) => allowedValues.includes(value)))
  T("lib/worker.mjs: the installed CLI reads claudeMdExcludes as a list of paths and autoMemoryEnabled as a boolean", /C\(n\(\)\)/.test(schema.claudeMdExcludes) && /absolute paths/.test(schema.claudeMdExcludes) && /O\(\)/.test(schema.autoMemoryEnabled))
  const json = JSON.stringify(settings)
  const command = workerCommand(json)
  same("lib/worker.mjs: the command is the one the order names, with the settings last", [command.executable, command.args], ["claude", [
    "-p", "--model", "claude-sonnet-5-5", "--effort", "high", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--permission-mode", "bypassPermissions",
    "--disallowed-tools", "Task", "AskUserQuestion", "--settings", json,
  ]])
  const run = WORKER_FIXTURE.workerCommandRun
  same("lib/worker.mjs: the real run of this command started with the permission mode and output style the command names", [run.init.permissionMode, run.init.output_style], [command.args[command.args.indexOf("--permission-mode") + 1], settings.outputStyle])
  T("lib/worker.mjs: the command names no prompt, so the order goes in on stdin", !command.args.some((argument) => argument.includes("the order")) && command.args.at(-2) === "--settings")
}

const skillAndEnvironmentCases = async () => {
  const skills = join(root, "drive-worker", "skills")
  const make = (path, withSkill = true) => {
    mkdirSync(join(skills, path), { recursive: true })
    if (withSkill) writeFileSync(join(skills, path, "SKILL.md"), "---\nname: x\n---\n")
  }
  make("brain")
  make("humanizer")
  make("synced/account-a/pdf")
  make("synced/account-b/pdf")
  make("synced/account-a/xlsx")
  make("empty-folder", false)
  mkdirSync(join(root, "drive-worker", "linked-target"), { recursive: true })
  writeFileSync(join(root, "drive-worker", "linked-target", "SKILL.md"), "x")
  symlinkSync(join(root, "drive-worker", "linked-target"), join(skills, "linked"))
  symlinkSync(join(root, "drive-worker", "missing-target"), join(skills, "broken"))
  writeFileSync(join(skills, "README.md"), "not a skill")
  same("lib/worker.mjs: skill names come from every folder with a SKILL.md, synced folders and links included, once each", listSkillNames(skills), ["brain", "humanizer", "linked", "pdf", "xlsx"])

  const parent = { PATH: "/usr/bin", HOME, CLAUDE_CONFIG_DIR: "/other", ANTHROPIC_API_KEY: "key", CLAUDE_CODE_OAUTH_TOKEN: "oauth", CLAUDE_CODE_TMPDIR: "/scratch/claude", GH_TOKEN: "owner-token" }
  const environment = workerEnvironmentFor(parent, TOKEN)
  same("lib/worker.mjs: the worker environment holds no account override and the worker token", sortedKeys(environment), sortedKeys({
    PATH: "/usr/bin", HOME, CLAUDE_CODE_TMPDIR: "/scratch/claude", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1", GH_TOKEN: TOKEN,
  }))
  T("lib/worker.mjs: the parent environment stays unchanged", parent.GH_TOKEN === "owner-token" && parent.ANTHROPIC_API_KEY === "key")
  T("lib/worker.mjs: a parent with no temporary directory gives the worker none", !("CLAUDE_CODE_TMPDIR" in workerEnvironmentFor({ PATH: "/usr/bin" }, TOKEN)))
  T("lib/worker.mjs: an empty token is refused", /needs a GitHub token/.test(await thrown(() => workerEnvironmentFor(parent, ""))))
  T("lib/worker.mjs: a missing token is refused", /needs a GitHub token/.test(await thrown(() => workerEnvironmentFor(parent, null))))

  const keychain = async (answer) => {
    const calls = []
    const token = await readWorkerToken({ run: async (...call) => { calls.push(call); return answer } })
    return { token, calls }
  }
  const found = await keychain({ status: 0, stdout: `${TOKEN}\n` })
  same("lib/worker.mjs: the token is the Keychain item without its line end", found.token, TOKEN)
  same("lib/worker.mjs: the Keychain read asks for the one item by name", [found.calls[0][0], found.calls[0][1]], ["security", ["find-generic-password", "-s", "orbit-worker-github-token", "-w"]])
  same("lib/worker.mjs: a missing Keychain item gives null", (await keychain({ status: 44, stdout: "", stderr: "could not be found" })).token, null)
  same("lib/worker.mjs: an empty Keychain answer gives null", (await keychain({ status: 0, stdout: "\n" })).token, null)

  const home = join(root, "drive-worker", "home")
  mkdirSync(join(home, ".claude", "skills", "pdf"), { recursive: true })
  mkdirSync(join(home, ".claude", "skills", "humanizer"), { recursive: true })
  writeFileSync(join(home, ".claude", "skills", "pdf", "SKILL.md"), "x")
  writeFileSync(join(home, ".claude", "skills", "humanizer", "SKILL.md"), "x")
  const invocation = workerInvocation({ home, parentEnvironment: parent, token: TOKEN })
  const settings = JSON.parse(invocation.command.args.at(-1))
  same("lib/worker.mjs: the invocation excludes the hot file of the home folder and turns off the listed skills", [settings.claudeMdExcludes, settings.skillOverrides], [[join(home, "Developer", "brain", "hot.md")], { pdf: "off" }])
  same("lib/worker.mjs: the invocation carries the worker environment", invocation.environment.GH_TOKEN, TOKEN)
}

const eventCases = () => {
  const recorded = readEvent(`{"type":"system"}\nnot json\n${WORKER_FIXTURE.rateLimitEvent.line}\n`)
  same("lib/worker.mjs: the recorded event gives the session id, the utilization, the reset time and the status", recorded, { sessionId: "2b299b6a-be9f-4eec-b671-10dc5e21bca4", utilization: 0.4, resetsAt: 1794391200, status: "allowed" })
  const warning = readEvent(WORKER_FIXTURE.rateLimitEventWarning.line)
  same("lib/worker.mjs: a warning event reads the window of seven days, not the line's top level", [warning.utilization, warning.resetsAt, warning.status], [0.58, 1795676400, "allowed_warning"])
  const newest = readEvent([WORKER_FIXTURE.rateLimitEvent.line, WORKER_FIXTURE.rateLimitEventWarning.line].join("\n"))
  same("lib/worker.mjs: the newest event wins", newest.utilization, 0.58)
  same("lib/worker.mjs: a log with no event reads null for the reading", readEvent(WORKER_FIXTURE.signInStop.lines.join("\n")), { sessionId: JSON.parse(WORKER_FIXTURE.signInStop.lines[0]).session_id, utilization: null, resetsAt: null, status: null })
  const other = JSON.parse(WORKER_FIXTURE.rateLimitEvent.line)
  other.rate_limit_info.unifiedWindows = { five_hour: other.rate_limit_info.unifiedWindows.seven_day }
  same("lib/worker.mjs: an event with no seven_day window gives no reading", readEvent(JSON.stringify(other)).utilization, null)
  same("lib/worker.mjs: an empty log gives no session and no reading", readEvent(""), { sessionId: null, utilization: null, resetsAt: null, status: null })

  const logFile = join(root, "drive-worker", "big-event.log")
  const filler = `${JSON.stringify({ type: "user", session_id: "later", message: "x".repeat(900) })}\n`
  writeFileSync(logFile, [WORKER_FIXTURE.signInStop.lines[0], "\n", filler.repeat(1500), WORKER_FIXTURE.rateLimitEvent.line, "\n", filler.repeat(900), WORKER_FIXTURE.rateLimitEventWarning.line].join(""))
  const big = logEvent(logFile)
  T("lib/worker.mjs: a log of over two chunks gives the first session id and the newest event, even with no final line end", big.sessionId === JSON.parse(WORKER_FIXTURE.signInStop.lines[0]).session_id && big.utilization === 0.58, JSON.stringify(big))
  same("lib/worker.mjs: a log that cannot be read gives no reading", logEvent(join(root, "drive-worker", "no-such.log")).utilization, null)
}

const resultCases = () => {
  const { assistantLine, resultLine: limitLine } = WORKER_FIXTURE.limitStop
  const limit = finalResult([assistantLine, limitLine].join("\n"))
  same("lib/worker.mjs: a result with the weekly limit text is a usage limit", [limit.usageLimitReached, limit.authenticationFailed, limit.error, limit.needsDecision], [true, false, "You've hit your weekly limit · resets 4am (America/Sao_Paulo)", null])
  const transientText = "API Error: Server is temporarily limiting requests (not your usage limit) · this may be a temporary capacity issue."
  const transient = JSON.parse(limitLine)
  transient.result = transientText
  delete transient.api_error
  const transientVerdict = finalResult(JSON.stringify(transient))
  same("lib/worker.mjs: a transient 429 is not a usage limit and keeps its text", [transientVerdict.usageLimitReached, transientVerdict.error], [false, transientText])
  const success = resultLine({})
  same("lib/worker.mjs: a later success line clears an earlier limit", finalResult([limitLine, success].join("\n")), { ...NO_STOP })
  const signIn = finalResult(WORKER_FIXTURE.signInStop.lines.join("\n"))
  same("lib/worker.mjs: the recorded sign-in failure is authenticationFailed, not a limit", [signIn.authenticationFailed, signIn.usageLimitReached, signIn.error], [true, false, "Not logged in · Please run /login"])
  same("lib/worker.mjs: a limit text in a successful result is no limit", finalResult(resultLine({ result: "You've hit your weekly limit" })).usageLimitReached, false)
  same("lib/worker.mjs: a log with no result gives no stop", finalResult(`${assistantLine}\nnot json\n`), { ...NO_STOP })
  const decision = finalResult(WORKER_FIXTURE.needsDecision.resultLine)
  T("lib/worker.mjs: the last line of a result that says NEEDS_DECISION gives the question", decision.needsDecision?.startsWith("The API branch of #7") && decision.needsDecision.endsWith("the name of its kind."), JSON.stringify(decision))
  same("lib/worker.mjs: NEEDS_DECISION that is not the last line gives no question", finalResult(resultLine({ result: "NEEDS_DECISION: a question\nthen more text" })).needsDecision, null)
  same("lib/worker.mjs: NEEDS_DECISION with no question gives none", finalResult(resultLine({ result: "NEEDS_DECISION: " })).needsDecision, null)
  same("lib/worker.mjs: an error result gives no question", finalResult(resultLine({ is_error: true, result: "NEEDS_DECISION: a question" })).needsDecision, null)
  T("lib/worker.mjs: the usage limit rules read a prefix, a pattern, and nothing else", isUsageLimitMessage("You're out of extra usage") && isUsageLimitMessage("Opus requires usage credits. Switch.") && !isUsageLimitMessage("Opus is experiencing high load.") && !isUsageLimitMessage(undefined) && !isUsageLimitMessage(`prefix ${"You've hit your"}`))

  const logFile = join(root, "drive-worker", "long-result.log")
  const filler = `${JSON.stringify({ type: "user", message: "y".repeat(1000) })}\n`
  writeFileSync(logFile, [limitLine, "\n", filler.repeat(400), success].join(""))
  same("lib/worker.mjs: a log read from its tail sees the last result and ignores an earlier one", logFinalResult(logFile), { ...NO_STOP })
  writeFileSync(logFile, [limitLine, "\n", filler.repeat(400)].join(""))
  same("lib/worker.mjs: a limit line more than 256 KiB from the end is not read", logFinalResult(logFile), { ...NO_STOP })
  writeFileSync(logFile, [filler.repeat(400), limitLine].join(""))
  same("lib/worker.mjs: a limit line inside the last 256 KiB is read", logFinalResult(logFile).usageLimitReached, true)
  same("lib/worker.mjs: a log that cannot be read gives no stop", logFinalResult(join(root, "drive-worker", "no-such.log")), { ...NO_STOP })
}

const probeCases = async () => {
  const invocation = { command: { executable: "claude", args: ["-p", "--settings", "{}"] }, environment: { GH_TOKEN: TOKEN } }
  const calls = []
  const answer = (stdout) => async (...call) => { calls.push(call); return { status: 0, stdout, stderr: "" } }
  const reading = await probe({ invocation, cwd: "/tmp/probe", run: answer(`${WORKER_FIXTURE.signInStop.lines[0]}\n${WORKER_FIXTURE.rateLimitEventWarning.line}\n`) })
  same("lib/worker.mjs: the probe reads the event of its output", reading, { sessionId: JSON.parse(WORKER_FIXTURE.signInStop.lines[0]).session_id, utilization: 0.58, resetsAt: 1795676400, status: "allowed_warning" })
  const [file, args, options] = calls[0]
  same("lib/worker.mjs: the probe runs the worker command with one turn", [file, args], ["claude", ["-p", "--settings", "{}", "--max-turns", "1"]])
  same("lib/worker.mjs: the probe sends the prompt on stdin with the worker environment and a bound", [options.input, options.env, options.cwd, options.timeoutMs], ["reply ok", { GH_TOKEN: TOKEN }, "/tmp/probe", 120000])
  same("lib/worker.mjs: a probe with no event gives null", await probe({ invocation, run: answer(WORKER_FIXTURE.signInStop.lines.join("\n")) }), null)
  same("lib/worker.mjs: a probe with no output gives null", await probe({ invocation, run: async () => ({ status: 1, stdout: "", stderr: "" }) }), null)
}

const launchCases = async () => {
  T("lib/worker.mjs: the clocks are the ones the order names", WORKER_LIMITS.hardCeilingMs === 45 * 60000 && WORKER_LIMITS.noProgressMs === 10 * 60000 && WORKER_LIMITS.logCapBytes === 512 * 1024 * 1024)

  const normal = workerLaunchHarness("normal")
  same("lib/worker.mjs: the worker starts detached in the worktree with its stdin open and its log on stdout and stderr", [normal.spawned[0][0], normal.spawned[0][1], normal.spawned[0][2].cwd, normal.spawned[0][2].detached, normal.spawned[0][2].env, normal.spawned[0][2].stdio.slice(0, 1), normal.spawned[0][2].stdio[1] === normal.spawned[0][2].stdio[2]], ["claude", ["-p"], normal.directory, true, { GH_TOKEN: TOKEN }, ["pipe"], true])
  same("lib/worker.mjs: the order goes to the worker on stdin", normal.child.stdinText, "the order")
  T("lib/worker.mjs: the pid file names the worker while it runs", existsSync(normal.pidFile) && JSON.parse(readFileSync(normal.pidFile, "utf8")).pid === 4242)
  writeFileSync(normal.logFile, [WORKER_FIXTURE.rateLimitEventWarning.line, WORKER_FIXTURE.needsDecision.resultLine].join("\n"))
  normal.ends(0)
  const facts = await normal.run
  same("lib/worker.mjs: a worker that exits gives its exit, session, reading and verdict", [facts.exitCode, facts.killed, facts.sessionId, facts.utilization, facts.resetsAt, facts.result.usageLimitReached, typeof facts.result.needsDecision], [0, null, "6e8fb04c-31b7-4d70-af4e-05ffb45ee449", 0.58, 1795676400, false, "string"])
  T("lib/worker.mjs: the pid file is gone when the worker is", !existsSync(normal.pidFile))
  same("lib/worker.mjs: the worker's group gets a last kill when the worker exits", normal.signals.at(-1), [4242, "SIGKILL"])
  same("lib/worker.mjs: a worker that exits clears every timer", normal.clock.pending(), 0)

  let tick = 0
  const moving = workerLaunchHarness("ceiling-moving", { fingerprint: () => `step-${tick++}` })
  await moving.clock.advance(44 * 60000)
  same("lib/worker.mjs: a worker that moves is not killed before the hard ceiling", moving.signals, [])
  await moving.clock.advance(60000)
  same("lib/worker.mjs: the hard ceiling kills the process group with TERM", moving.signals, [[4242, "SIGTERM"]])
  await moving.clock.advance(10000)
  same("lib/worker.mjs: the group gets KILL after the grace time", moving.signals.at(-1), [4242, "SIGKILL"])
  moving.ends(null, "SIGKILL")
  const hard = await moving.run
  same("lib/worker.mjs: a ceiling kill names its clock", [hard.killed, hard.killReason, hard.exitCode, hard.signal], ["hard-ceiling", "passed its hard ceiling", null, "SIGKILL"])

  const stalled = workerLaunchHarness("stalled")
  await stalled.clock.advance(9 * 60000)
  same("lib/worker.mjs: a silent worker is not killed before ten minutes", stalled.signals, [])
  await stalled.clock.advance(2 * 60000)
  same("lib/worker.mjs: ten minutes with no change in the files, HEAD or log kill the group", stalled.signals[0], [4242, "SIGTERM"])
  stalled.ends(null, "SIGTERM")
  same("lib/worker.mjs: a stall kill names its clock", (await stalled.run).killed, "no-progress")

  let size = 0
  const growing = workerLaunchHarness("growing", { logSize: () => (size += 10) })
  await growing.clock.advance(30 * 60000)
  same("lib/worker.mjs: a log that grows counts as progress", growing.signals, [])
  growing.ends(0)
  await growing.run

  let changes = 0
  const editing = workerLaunchHarness("editing", { fingerprint: () => `files-${Math.floor(changes++ / 10)}` })
  await editing.clock.advance(30 * 60000)
  same("lib/worker.mjs: a change in the files or HEAD counts as progress", editing.signals, [])
  editing.ends(0)
  await editing.run

  const flood = workerLaunchHarness("flood", { logSize: () => 512 * 1024 * 1024 + 1 })
  await flood.clock.advance(30000)
  same("lib/worker.mjs: a log past the cap kills the group", flood.signals[0], [4242, "SIGTERM"])
  flood.ends(null, "SIGTERM")
  same("lib/worker.mjs: a cap kill names its clock", (await flood.run).killed, "log-cap")

  const dir = join(root, "drive-worker", "refused")
  mkdirSync(dir, { recursive: true })
  const refused = await launch({ invocation: { command: { executable: "claude", args: [] }, environment: {} }, worktree: dir, order: "x", logFile: join(dir, "a.log"), pidFile: join(dir, "a.pid"), clock: fakeClock(), spawnChild: () => { throw new Error("spawn failed") } })
  same("lib/worker.mjs: a spawn that throws gives a spawn error and no exit", [refused.spawnError, refused.exitCode], ["spawn failed", null])
  const errored = workerLaunchHarness("errored")
  errored.child.emit("error", new Error("ENOENT"))
  same("lib/worker.mjs: an error event of the child gives a spawn error", [(await errored.run).spawnError], ["ENOENT"])
}

const workerUnit = async () => {
  settingsCases()
  await skillAndEnvironmentCases()
  eventCases()
  resultCases()
  await probeCases()
  await launchCases()
}

const RETIRED_NAMES = ["ast", "ra"].join("")
const BANNED_TEXT = new RegExp(`(^|[^&\\w])#[0-9]{2,5}(?![0-9A-Fa-f])|ORB-[0-9]|\\b(${RETIRED_NAMES}|re${"design"}|re${"brand"})\\b`, "im")

const PLACE = { repoKey: "ui", repoPath: "/work/orbit-ui-mobile", worktree: "/work/orbit-worktrees/ui/chore-ticket-9-part-2", branch: "chore/ticket-9-part-2", base: "main" }
const TICKET = { number: 9, title: "A ticket title", body: "The ticket body, in the owner's words.\n\nSecond paragraph.", repository: TICKET_REPOSITORY }
const ownerComment = (body, kind = null) => ({ id: `c-${body.length}`, author: "owner", createdAt: "2026-11-20T10:00:00Z", body, kind })
const PART_COMMENTS = [
  ownerComment("Part 1 of 3: the first behaviour\n\nSECRET-BODY-OF-PART-1 with details."),
  ownerComment("## Part 2 of 3: the second behaviour\n\nBODY-OF-PART-2 holds the paths.\nPaths: a/, b"),
  ownerComment("Part 3 of 3: the third behaviour\n\nSECRET-BODY-OF-PART-3."),
  ownerComment("An owner note that is no part.\n\nNOTE-WITHOUT-PART."),
  ...["launch", "record", "request", "needs-owner", "notice", "close"].map((kind) => ownerComment(`<!-- orbit-drive:${kind} -->\nDRIVER-${kind.toUpperCase()}`, kind)),
]
const FINDINGS = [ownerComment("<!-- orbit-drive:findings -->\nFindings, part 1\n\nsrc/a.ts:4 | class | fix", "findings")]
const REVIEW = {
  blocking: [
    { path: "src/a.ts", line: 10, body: "BLOCKING: correctness bug. Instances: `src/a.ts:10`, `src/b.ts:22`." },
    { path: "src/c.ts", line: 3, body: "BLOCKING: broken contract.\nInstances: `src/c.ts:3`." },
    { path: "src/d.ts", line: 8, body: "BLOCKING: missed requirement. Instances: `src/d.ts:8`." },
  ],
}
const PULL = { number: 50, headSha: "d77a67c4c0ae619b41e7ffb03316f142aad46606" }
const FAILURE = { checks: [{ name: "Unit Tests", failedSteps: ["Run Domain Tests"], logLines: Array.from({ length: 80 }, (_, index) => `log line ${index}`) }, { name: "Lint", failedSteps: [], logLines: [] }], conflicts: ["a.ts", "b.ts"] }
const order = (kind, extra = {}) => renderOrder({ kind, ticket: TICKET, partComments: PART_COMMENTS, place: PLACE, ...extra })

const orderCases = async () => {
  same("lib/order.mjs: the order kinds are the six of the spec", ORDER_KINDS, ["build", "build part", "fix", "ci-fix", "merge-forward", "find"])
  same("lib/order.mjs: a part comment is read with or without its heading marks", [PART_COMMENTS[0], PART_COMMENTS[1], PART_COMMENTS[3]].map(partOf), [{ number: 1, total: 3 }, { number: 2, total: 3 }, null])
  same("lib/order.mjs: a line that only starts like a part is no part", ["Parts of speech", "Part 1 of", "part 1 of 3", " Part 1 of 3"].map((body) => partOf({ body })), [null, null, null, null])
  same("lib/order.mjs: two digits and a colon after the total still read as a part", partOf({ body: "Part 12 of 14: a" }), { number: 12, total: 14 })

  for (const kind of ORDER_KINDS) {
    const brief = renderBrief({ kind, place: PLACE, ticket: TICKET })
    const longPlace = { ...PLACE, repoPath: `/${"long-directory-name/".repeat(12)}orbit`, worktree: `/${"worktree-directory/".repeat(12)}branch`, branch: `chore/${"x".repeat(80)}` }
    const longest = Buffer.byteLength(renderBrief({ kind, place: longPlace, ticket: TICKET }))
    T(`lib/order.mjs: the ${kind} brief is at most 6,000 bytes (${Buffer.byteLength(brief)} with a short place, ${longest} with a long one)`, Buffer.byteLength(brief) <= 6000 && longest <= 6000)
    T(`lib/order.mjs: the ${kind} brief matches no name of a ticket, a feature or a project`, !BANNED_TEXT.test(brief), (BANNED_TEXT.exec(brief) ?? [])[0])
    T(`lib/order.mjs: the ${kind} brief names the place and no draft`, brief.includes(PLACE.worktree) && brief.includes(PLACE.branch) && !brief.includes("--draft ") && (!kind.startsWith("build") || brief.includes("non-draft")))
  }

  const build = order("build", { partComments: [] })
  T("lib/order.mjs: a build order holds the title, the ticket body and the brief, and no part section", build.startsWith("# A ticket title\n\nThe ticket body") && build.includes("Second paragraph.") && build.includes("## Brief") && !build.includes("## Parts"))
  T("lib/order.mjs: a build order tells the worker to rebase before its first push", /Rebase on `origin\/main` before the first push/.test(build))
  const delivery = build.slice(build.indexOf("**Delivery.**"))
  T("lib/order.mjs: the delivery rules name the Tracks line, the three sections, the Remaining line and the attribution ban", delivery.includes(`Tracks ${TICKET_REPOSITORY}#9`) && delivery.includes("never `Closes`") && ["## Assumptions", "## Manual steps", "## Test evidence", "`Remaining:`", "`Co-Authored-By`", "`Generated with`", "git rm", "rmSync", "Stage named paths only", "never `--no-verify`"].every((text) => delivery.includes(text)))
  T("lib/order.mjs: the brief tells the worker to decide with the recommended option and to end with NEEDS_DECISION only for the four owner matters", /Decide every choice with the recommended option/.test(build) && /NEEDS_DECISION: <question>.*money.*model or effort.*standing owner order.*irreversible/.test(build))
  T("lib/order.mjs: the brief bans a browser, a dev server and the production CLI, and names the two barrier files", /Open no browser\. Start no dev server\. Run no production CLI/.test(build) && build.includes(".github/migration-contracts.json") && build.includes(".github/migration-locks.json"))
  T("lib/order.mjs: the brief names the copy rule", build.includes("`/humanizer`") && build.includes("`/second-opinion`") && build.includes("`BRAND.md`"))

  const part = order("build part", { partNumber: 2, findings: [] })
  T("lib/order.mjs: a part order holds the full comment of its part under a title, with the heading marks cut", part.includes("### Part 2 of 3: the second behaviour (this order)") && part.includes("BODY-OF-PART-2 holds the paths.") && part.includes("Paths: a/, b"))
  T("lib/order.mjs: a part order holds only the first line of each other part", part.includes("- Part 1 of 3: the first behaviour") && part.includes("- Part 3 of 3: the third behaviour") && !part.includes("SECRET-BODY-OF-PART-1") && !part.includes("SECRET-BODY-OF-PART-3"))
  T("lib/order.mjs: an order holds none of the comments of the driver and no owner note that is no part", ["launch", "record", "request", "needs-owner", "notice", "close"].every((kind) => !part.includes(`DRIVER-${kind.toUpperCase()}`)) && !part.includes("NOTE-WITHOUT-PART") && !part.includes("orbit-drive:"))
  T("lib/order.mjs: a part order names its part and the part-only rule", part.includes("## This order (build part)") && part.includes("Build Part 2 of this ticket and no other part"))
  const apply = order("build part", { partNumber: 2, findings: FINDINGS })
  T("lib/order.mjs: an apply part holds the findings it applies, in full and without the marker", apply.includes("## Findings to apply") && apply.includes("src/a.ts:4 | class | fix") && !apply.includes("<!-- orbit-drive:findings -->") && !apply.includes("DRIVER-LAUNCH"))

  const fix = order("fix", { pull: PULL, review: REVIEW })
  T("lib/order.mjs: a fix order lists every class and every instance of the review", ["src/a.ts:10", "src/b.ts:22", "src/c.ts:3", "src/d.ts:8", "BLOCKING: correctness bug", "BLOCKING: broken contract", "BLOCKING: missed requirement"].every((text) => fix.includes(text)), fix)
  T("lib/order.mjs: a fix order names the head and asks for one commit, one red table test per class, one push", fix.includes(PULL.headSha) && /in one commit/.test(fix) && /one table test per class/.test(fix) && /Push once/.test(fix) && /Merge `origin\/main`/.test(fix))
  const ciFix = order("ci-fix", { pull: PULL, failure: FAILURE })
  T("lib/order.mjs: a ci-fix order names each failed check, its failed steps and the last 60 log lines", ciFix.includes("### Unit Tests (failed steps: Run Domain Tests)") && ciFix.includes("### Lint\n") && ciFix.includes("log line 79") && ciFix.includes("log line 20") && !ciFix.includes("log line 19\n"))
  const forward = order("merge-forward", { pull: PULL, failure: FAILURE })
  T("lib/order.mjs: a merge-forward order names the conflicts and asks for one push", forward.includes("in: a.ts, b.ts") && /Merge `origin\/main` into the branch/.test(forward) && /Push once/.test(forward))
  T("lib/order.mjs: a merge-forward order without a conflict list still reads", /conflicts with `origin\/main`\. Merge/.test(order("merge-forward", { pull: PULL, failure: null })))
  const find = order("find", { partNumber: 1 })
  T("lib/order.mjs: a find order is read only and ends with the findings table", /path:line \| class \| fix/.test(find) && /Commit nothing, push nothing and open no pull request/.test(find) && /read-only order/.test(find) && !find.includes("gh pr create"))

  const orders = {
    build: build,
    "build part": part,
    fix,
    "ci-fix": ciFix,
    "merge-forward": forward,
    find,
  }
  for (const [kind, text] of Object.entries(orders)) {
    const reads = kind === "find"
    const pushes = kind === "fix" || kind === "ci-fix" || kind === "merge-forward"
    const opens = !reads && !pushes
    T(`lib/order.mjs: the ${kind} brief gives the final message the rule of its own kind`, reads
      ? !text.includes("at most 12 lines") && /final message is the area list and the findings table of "This order", with nothing after the table/.test(text)
      : /final message is at most 12 lines/.test(text) && text.includes("the pull request URL"))
    T(`lib/order.mjs: the ${kind} brief puts the decisions where its kind can write`, reads
      ? !text.includes("pull request body") && !text.includes("commit message") && !text.includes("NEEDS_DECISION")
      : text.includes(pushes ? "in the commit message" : "in the pull request body") && !text.includes(pushes ? "in the pull request body" : "in the commit message"))
    T(`lib/order.mjs: the ${kind} brief names only the GitHub writes that its kind may make`, text.includes("`gh pr create`") === opens && (reads || text.includes("Write to GitHub only with `git push`")))
    T(`lib/order.mjs: the ${kind} brief asks for verification evidence only when the order makes a change`, reads
      ? !text.includes("Report each command") && !text.includes("Spend at most 25 minutes")
      : text.includes("Report each command with its exit code") && text.includes("Spend at most 25 minutes"))
  }

  for (const [label, call, message] of [
    ["an unknown kind", () => renderOrder({ kind: "review", ticket: TICKET, place: PLACE }), /unknown order kind/],
    ["a part order with no part number", () => order("build part"), /needs the number of its part/],
    ["a part order whose part has no comment", () => order("build part", { partNumber: 7 }), /no comment for part 7/],
    ["a fix order with no blocking class", () => order("fix", { pull: PULL, review: { blocking: [] } }), /needs its pull request/],
    ["a ci-fix order with no failed check", () => order("ci-fix", { pull: PULL, failure: { checks: [] } }), /needs its pull request/],
    ["a merge-forward order with no pull request", () => order("merge-forward"), /needs its pull request/],
  ]) T(`lib/order.mjs: ${label} is refused`, message.test(await thrown(call)))
  T("lib/order.mjs: a brief over the limit is refused", /over the 6000 byte limit/.test(await thrown(() => renderBrief({ kind: "build", place: { ...PLACE, repoPath: "x".repeat(7000) }, ticket: TICKET }))))
}

const selfSufficiencyCases = () => {
  const files = ["lib/worker.mjs", "lib/order.mjs", "lib/github.mjs", "lib/config.mjs", "__tests__/drive.mjs", "__fixtures__/drive-github.json", "__fixtures__/drive-worker.json"]
  for (const file of files) {
    const path = toolPath(file)
    const found = readFileSync(path, "utf8").split("\n").map((line, index) => [index + 1, line]).filter(([, line]) => BANNED_TEXT.test(line))
    T(`${file}: names no ticket, feature, rename or one-time project`, found.length === 0, found.slice(0, 3).map(([number, line]) => `${number}: ${line.slice(0, 120)}`).join("\n"))
  }
}

const orderUnit = async () => {
  await orderCases()
  selfSufficiencyCases()
}

const UNITS = { "lib/config.mjs": configUnit, "lib/github.mjs": githubUnit, "lib/worker.mjs": workerUnit, "lib/order.mjs": orderUnit }

/** The runner calls cases() once for a module, so one call runs the unit of every registry row that names this module. */
const registeredUnits = readFileSync(toolPath(SELF), "utf8").split("\n").flatMap((line) => /^\s*\["([^"]+)", "drive"\],?$/.exec(line)?.[1] ?? [])

export const cases = async () => {
  for (const unit of registeredUnits) {
    T(`registry: the drive row for ${unit} names a unit that has cases`, UNITS[unit] !== undefined, `row ${unit} has no cases in tools/__tests__/drive.mjs`)
    await UNITS[unit]?.()
  }
}
