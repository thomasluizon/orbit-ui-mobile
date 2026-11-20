import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
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

const UNITS = { "lib/config.mjs": configUnit, "lib/github.mjs": githubUnit }

/**
 * Every row of the registry that names this module runs cases() once, and the runner passes no argument. The rows are
 * read from the registry in its own order, so the nth call runs the unit that the nth row names.
 */
const registeredUnits = readFileSync(toolPath(SELF), "utf8").split("\n").flatMap((line) => /^\s*\["([^"]+)", "drive"\],?$/.exec(line)?.[1] ?? [])
let calls = 0

export const cases = async () => {
  const unit = registeredUnits[calls++]
  T(`registry: row ${calls} of ${registeredUnits.length} for the drive module names a unit that has cases`, UNITS[unit] !== undefined, `row ${unit} has no cases in tools/__tests__/drive.mjs`)
  await UNITS[unit]?.()
}
