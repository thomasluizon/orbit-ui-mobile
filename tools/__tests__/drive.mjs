import { spawnSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { readDriveConfig, workerEnvironment } from "../lib/config.mjs"
import {
  bodyFindings,
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
  carriedApproval,
  closePull,
  deleteBranch,
  ensureLabel,
  mergeBar,
  closesTicket,
  OWNER_BAR_FAILURES,
  needsWholeDiff,
  pullfrogRuns,
  runsNaming,
  isRateLimited,
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
import { ORDER_KINDS, partOf, renderBrief, renderOrder, renderResumeOrder } from "../lib/order.mjs"
import { parityExemptTerms } from "../lib/parity-scope.mjs"
import { sendTelegram } from "../lib/telegram.mjs"
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
  readOwnerToken,
  CODE_WORKER_DENY,
  WORKER_DENIED_TOOLS,
  WORKER_DENY,
  WORKER_LIMITS,
  logContextTokens,
  RESUME_TOKEN_LIMIT,
  resumeInvocation,
  sessionExists,
  sessionFile,
  WORKER_SKILLS_OFF,
  workerCommand,
  workerAccountEnvironment,
  workerConfigDirectory,
  workerEnvironmentFor,
  questionsInvocation,
  harnessReviewInvocation,
  workerInvocation,
  workerSettings,
  worktreeOccupants,
  processDirectories,
  directoryHolders,
} from "../lib/worker.mjs"
import { driverUnit, pinUnit } from "./_drive-tick.mjs"
import { REPO_ROOT, T, realOrchestratorConfig, root, same, toolPath } from "./_harness.mjs"

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

/** A gh runner that lists `open` and answers each pull request that a state query names. `requested` keeps the numbers of each query. */
const batchedState = (open, { failOn = [], message = "HTTP 502" } = {}) => {
  const requested = []
  let active = 0
  let mostActive = 0
  const run = async (args) => {
    const numbers = [...args.join(" ").matchAll(/pr(\d+): pullRequest\(number: (\d+)\)/g)].map((match) => Number(match[1]))
    requested.push(numbers)
    const call = requested.length
    mostActive = Math.max(mostActive, ++active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    if (failOn.includes(call)) throw new Error(`gh api graphql failed: ${message}`)
    const response = stateResponse(open)
    const sample = response.data.repository.pr2509
    delete response.data.repository.pr2509
    delete response.data.repository.pr2510
    for (const number of numbers) response.data.repository[`pr${number}`] = { ...sample, number }
    return json(response)
  }
  return { run, requested, mostActive: () => mostActive }
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
  same("lib/github.mjs: one read holds every open pull request when at most 8 numbers are known", [openCalls.length, openState.numbers, openState.defaultBranch, openState.slug], [1, [2509], "main", UI])
  same("lib/github.mjs: a pull request keeps its identity fields", [open.number, open.state, open.draft, open.author, open.headRef, open.headSha, open.baseRef, open.mergeState, open.changedFiles, open.files, open.commitMessages], [2509, "OPEN", false, "thomasluizon", "feature/ticket-2181-pace-governor", "a4c62a196324df595f5597e00863abc65f86435f", "main", "DIRTY", 23, null, null])
  T("lib/github.mjs: the pull request query reads no file list, which GitHub cuts at 100", openCalls.every((call) => !call.text.includes("files(first")))
  const rolled = stateResponse([2509])
  rolled.data.repository.pr2509.commits.nodes = FIXTURE.commitRollups.nodes
  same("lib/github.mjs: a commit keeps the state of its own check rollup, from the recorded answer", (await readPulls([2509], [2509, 2510], rolled)).state.pulls[0].commits.map((commit) => [commit.sha.slice(0, 7), commit.parents, commit.checkState]), [["fffd31f", 1, "FAILURE"], ["21741e7", 1, "SUCCESS"]])
  same("lib/github.mjs: a commit with no rollup in the answer has a null check state", open.commits.map((commit) => commit.checkState).every((state) => state === null), true)
  same("lib/github.mjs: a pull request read holds no behind count and the query asks for none", [open.behindBy, /behindBy/.test(JSON.stringify(openCalls))], [undefined, false])
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


  const synthetic = stateResponse([2509])
  const reviewComments = synthetic.data.repository.pr2509.reviews.nodes[0].comments.nodes
  reviewComments.push({ body: "BLOCKING: a class\n\nsrc/a.mjs:4, src/b.mjs:9", path: "src/a.mjs", line: 4 })
  synthetic.data.repository.pr2509.comments.nodes.push({ id: "IC_x", body: "<!-- orbit-drive:request -->\n@pullfrog review whole diff", createdAt: "2026-11-20T10:00:00Z", author: { login: "thomasluizon" } })
  const { state: syntheticState } = await readPulls([2509], [2509, 2510], synthetic)
  same("lib/github.mjs: a review comment that starts with BLOCKING: is kept with its path and line", syntheticState.pulls[0].reviews[0].blocking.map((entry) => [entry.path, entry.line, entry.body.split("\n")[0]]), [["src/a.mjs", 4, "BLOCKING: a class"]])
  same("lib/github.mjs: a driver comment is kept with its marker kind", syntheticState.pulls[0].comments.map((entry) => entry.kind), [null, "request"])

  const withBody = stateResponse([2509])
  const bodyReviews = withBody.data.repository.pr2509.reviews.nodes
  bodyReviews.length = 0
  bodyReviews.push(...FIXTURE.bodyBlockingReviews.nodes.map((node) => ({ ...node, commit: { oid: FIXTURE.bodyBlockingReviews.head } })))
  const bodyState = (await readPulls([2509], [2509, 2510], withBody)).state.pulls[0].reviews
  same("lib/github.mjs: a BLOCKING paragraph of a review body is a finding with no path and no line, and its text runs to the Pullfrog divider", bodyState.map((review) => [review.blocking.length, review.blocking[0].path, review.blocking[0].line, review.blocking[0].body.startsWith("BLOCKING: missed requirement"), review.blocking[0].body.includes("Smallest fix:"), review.blocking[0].body.includes("PULLFROG_DIVIDER")]), [[1, null, null, true, true, false], [1, null, null, true, true, false]])
  same("lib/github.mjs: bodyFindings splits at the next BLOCKING line, stops at a heading, and ignores a BLOCKING word inside a line", bodyFindings("Two classes. BLOCKING: not at a line start.\n\nBLOCKING: first\nmore of first\n\nBLOCKING: second\n\n## Outside this change\n\nnot a finding").map((entry) => entry.body), ["BLOCKING: first\nmore of first", "BLOCKING: second"])
  same("lib/github.mjs: a body with no BLOCKING line gives no finding", [bodyFindings("").length, bodyFindings("No BLOCKING finding remains.").length], [0, 0])

  const unknown = await readPulls([2509, 2510], [])
  same("lib/github.mjs: a number the last tick did not know costs one more read for those numbers only", [unknown.calls.length, unknown.calls[0].text.includes("pr2509"), unknown.calls[1].text.includes("pr2509"), unknown.calls[1].text.includes("pr2510")], [2, false, true, true])
  same("lib/github.mjs: a known pull request that is no longer open is not returned", (await readPulls([2509], [2509, 2510])).state.pulls.map((pull) => pull.number), [2509])
  const many = Array.from({ length: 35 }, (_, index) => 3035 - index)
  for (const [label, knownNumbers, sizes] of [["no number is known", [], [0, 8, 8, 8, 8, 3]], ["every number is known", many, [8, 8, 8, 8, 3]]]) {
    const gh = batchedState(many)
    const state = await readRepositoryState("ui", { knownNumbers, ...seams(gh.run) })
    same(`lib/github.mjs: no state query holds more than 8 of 35 open pull requests when ${label}`, gh.requested.map((numbers) => numbers.length), sizes)
    same(`lib/github.mjs: 35 open pull requests come back in the order of the open list when ${label}`, [state.numbers, state.pulls.map((pull) => pull.number)], [many, many])
    T(`lib/github.mjs: the state queries run one after the other when ${label}`, gh.mostActive() === 1)
  }

  const known = Array.from({ length: 12 }, (_, index) => 4001 + index)
  const current = [4021, ...known.slice(1), 4022, 4023]
  const mixed = batchedState(current)
  const mixedState = await readRepositoryState("ui", { knownNumbers: known, ...seams(mixed.run) })
  const read = mixed.requested.flat()
  same("lib/github.mjs: known and new numbers make one merged state", mixedState.pulls.map((pull) => pull.number), current)
  same("lib/github.mjs: no number is read twice, and each open number is read", [read.length, new Set(read).size, current.every((number) => read.includes(number))], [15, 15, true])

  const failing = batchedState(many, { failOn: [3, 4] })
  const failure = await thrown(() => readRepositoryState("ui", { knownNumbers: many, ...seams(failing.run) }))
  same("lib/github.mjs: a batch that fails again at half size fails the whole read and stops the later batches", [/HTTP 502/.test(failure), failing.requested.map((numbers) => numbers.length)], [true, [8, 8, 8, 4]])
  const half = batchedState(many, { failOn: [3] })
  const halved = await readRepositoryState("ui", { knownNumbers: many, ...seams(half.run) })
  same("lib/github.mjs: a failed batch reads again as two halves and the read goes on with the later batches", half.requested.map((numbers) => numbers.length), [8, 8, 8, 4, 4, 8, 3])
  same("lib/github.mjs: the halves of a failed batch fill the state in the order of the open list", halved.pulls.map((pull) => pull.number), many)
  const lone = batchedState(many.slice(0, 9), { failOn: [3] })
  await readRepositoryState("ui", { knownNumbers: [], ...seams(lone.run) })
  same("lib/github.mjs: a failed batch of one pull request reads that one again", lone.requested.map((numbers) => numbers.length), [0, 8, 1, 1])
  const firstFail = batchedState(many, { failOn: [1] })
  const recovered = await readRepositoryState("ui", { knownNumbers: many, ...seams(firstFail.run) })
  const firstRead = firstFail.requested.slice(1).flat()
  same("lib/github.mjs: a failed first read goes on with half of the known numbers and the rest read in later batches", [firstFail.requested[1].length, recovered.pulls.length, firstRead.length, new Set(firstRead).size], [4, 35, 35, 35])
  const limited = batchedState(many, { failOn: [3], message: "HTTP 403: API rate limit exceeded" })
  same("lib/github.mjs: a rate limit on a batch fails at once with no read at half size", [/rate limit/.test(await thrown(() => readRepositoryState("ui", { knownNumbers: many, ...seams(limited.run) }))), limited.requested.length], [true, 3])
  const limitedFirst = batchedState(many, { failOn: [1], message: "HTTP 403" })
  same("lib/github.mjs: a rate limit on the first read fails at once", [/HTTP 403/.test(await thrown(() => readRepositoryState("ui", { knownNumbers: many, ...seams(limitedFirst.run) }))), limitedFirst.requested.length], [true, 1])
  same("lib/github.mjs: HTTP 403 and a rate limit message are rate limits and HTTP 502 is not", ["gh api graphql failed: HTTP 403: Forbidden", "You have exceeded a secondary rate limit", "gh api graphql failed: HTTP 502"].map((message) => isRateLimited(new Error(message))), [true, true, false])

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
  T("lib/github.mjs: the ticket page reads 20 blockers of each ticket", ticketRun.calls[0].text.includes("blockedBy(first: 20)") && !ticketRun.calls[0].text.includes("blockedBy(first: 100)"))
  const blockerNode = (number) => ({ number, state: number % 2 === 0 ? "OPEN" : "CLOSED", labels: { nodes: [{ name: "repo:ui" }] } })
  const crowded = structuredClone(FIXTURE.tickets.response)
  crowded.data.repository.issues.nodes[0].blockedBy.nodes = Array.from({ length: 20 }, (_, index) => blockerNode(index + 1))
  crowded.data.repository.issues.nodes[1].blockedBy.nodes = Array.from({ length: 19 }, (_, index) => blockerNode(index + 1))
  const crowdedRun = scripted([
    ["DriveBlockers", () => json({ data: { repository: { issue: { blockedBy: { nodes: Array.from({ length: 34 }, (_, index) => blockerNode(index + 1)) } } } } })],
    ["DriveTickets", () => json(crowded)],
  ])
  const crowdedTickets = await readTickets(seams(crowdedRun.run))
  const blockerReads = crowdedRun.calls.filter((call) => call.text.includes("DriveBlockers"))
  same("lib/github.mjs: a ticket with a full page of 20 blockers reads all of its blockers in one more query", [blockerReads.length, blockerReads[0].text.includes("number=2183"), blockerReads[0].text.includes("blockedBy(first: 100)"), crowdedTickets[0].blockedBy.length], [1, true, true, 34])
  same("lib/github.mjs: a ticket with 19 blockers reads no more", crowdedTickets[1].blockedBy.length, 19)
  same("lib/github.mjs: the blockers of the second read keep their state and repository", crowdedTickets[0].blockedBy.slice(0, 2).map((blocker) => [blocker.number, blocker.open, blocker.repoKey]), [[1, false, "ui"], [2, true, "ui"]])
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
  const ready = { ...approved, state: "OPEN", mergeState: "CLEAN", behindBy: 0, files: ["tools/README.md"], commitMessages: ["docs(tools): explain the bar"], threads: approved.threads.map((thread) => ({ ...thread, resolved: true })) }
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
  same("lib/github.mjs: an approval of an earlier commit with the diff of the head carries to the bar", [barOf({ reviews: [{ ...review, commit: ready.commits[3].sha }], sameDiffAs: [ready.commits[3].sha] }), carriedApproval({ ...ready, reviews: [{ ...review, commit: ready.commits[3].sha }], sameDiffAs: [ready.commits[3].sha] })?.commit], [[], ready.commits[3].sha])
  same("lib/github.mjs: an earlier approval whose diff differs from the head does not carry", carriedApproval({ ...ready, reviews: [{ ...review, commit: ready.commits[3].sha }], sameDiffAs: [] }), null)
  same("lib/github.mjs: a carried approval does not replace a newer review that is not an approval", barOf({ reviews: [{ ...review, commit: ready.commits[3].sha }, { ...review, state: "CHANGES_REQUESTED", body: "x", submittedAt: "2026-11-20T09:30:00Z" }], sameDiffAs: [ready.commits[3].sha] }), ["review-not-approved-at-head"])
  same("lib/github.mjs: an unresolved thread fails the bar", barOf({ threads: [...ready.threads, { id: "t", resolved: false, author: "pullfrog" }] }), ["threads-unresolved:1"])
  same("lib/github.mjs: an unresolved thread of any author fails the bar", barOf({ threads: [{ id: "t", resolved: false, author: "someone" }] }), ["threads-unresolved:1"])
  same("lib/github.mjs: a thread list that ends early fails the bar", barOf({ threadsComplete: false }), ["threads-incomplete"])
  same("lib/github.mjs: a pull request that is behind its base passes the bar", [barOf({ behindBy: 2 }), barOf({ behindBy: null }), barOf({})], [[], [], []])
  same("lib/github.mjs: a merge state that is not CLEAN fails the bar", barOf({ mergeState: "BLOCKED" }), ["merge-state:BLOCKED"])
  same("lib/github.mjs: an open blocker of the tracked ticket fails the bar", barOf({}, { blockers: [3, 4] }), ["blocked-by:3,4"])
  same("lib/github.mjs: a pull request that carries needs:owner fails the bar", barOf({ labels: ["parity:exempt", "needs:owner"] }), ["needs-owner"])
  same("lib/github.mjs: a tracked ticket that carries needs:owner fails the bar", barOf({}, { ticketLabels: ["repo:ui", "needs:owner"] }), ["needs-owner"])
  same("lib/github.mjs: needs:owner on both the pull request and its ticket is one failed condition", barOf({ labels: ["needs:owner"] }, { ticketLabels: ["needs:owner"] }), ["needs-owner"])
  same("lib/github.mjs: a pull request that its needs-owner report holds fails the bar", barOf({}, { reportHeld: true }), ["needs-owner"])
  same("lib/github.mjs: other labels on the pull request and its ticket leave the bar alone", barOf({ labels: ["parity:exempt"] }, { ticketLabels: ["repo:ui", "needs:conversation"] }), [])
  same("lib/github.mjs: a pull request whose diff the driver did not read fails the bar", [barOf({ files: null }), barOf({ commitMessages: null })], [["diff-unknown"], ["diff-unknown"]])
  const green = (name) => ({ ...ready.checks[0], name, status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-11-20T09:00:00Z", databaseId: 777 })
  const without = (name) => ready.checks.filter((check) => check.name !== name)
  const unrequired = ready.requiredChecks.filter((check) => check.context !== "Lint")
  const lintOf = (conclusion, status = "COMPLETED") => [...without("Lint"), { ...green("Lint"), conclusion, status }]
  const lintable = (list) => ({ files: ["tools/README.md", ...list] })
  const manyFiles = Array.from({ length: 120 }, (_, index) => (index === 109 ? "tools/lib/github.mjs" : `docs/page${index}.md`))
  same("lib/github.mjs: a lintable path at file 110 of 120 fails the bar when Lint was skipped", barOf({ ...lintable(manyFiles), changedFiles: 120, checks: lintOf("SKIPPED") }), ["lint-missing", "whole-diff-review-missing"])
  same("lib/github.mjs: a SKIPPED Lint fails the bar for a lintable path", barOf({ ...lintable(["apps/web/a.ts"]), checks: lintOf("SKIPPED") }), ["lint-missing"])
  for (const extension of ["ts", "tsx", "js", "jsx", "mjs", "cjs"]) {
    same(`lib/github.mjs: a .${extension} path needs a green Lint`, barOf({ ...lintable([`apps/web/a.${extension}`]), checks: lintOf("SKIPPED") }), ["lint-missing"])
  }
  same("lib/github.mjs: a path that is no lintable extension needs no Lint", barOf({ ...lintable(["apps/web/a.json", "apps/web/a.tsx.md", "apps/web/b.d.mts"]), checks: lintOf("SKIPPED") }), [])
  same("lib/github.mjs: a SUCCESS Lint passes the bar for a lintable path", barOf({ ...lintable(["apps/web/a.ts"]), checks: lintOf("SUCCESS") }), [])
  same("lib/github.mjs: a NEUTRAL Lint fails the bar for a lintable path", barOf({ ...lintable(["apps/web/a.ts"]), checks: lintOf("NEUTRAL") }), ["lint-missing"])
  same("lib/github.mjs: a lintable path with no Lint check at all fails the bar", barOf({ ...lintable(["apps/web/a.ts"]), checks: without("Lint"), requiredChecks: unrequired }), ["lint-missing"])
  same("lib/github.mjs: a Lint that still runs is one failed check and no lint-missing", barOf({ ...lintable(["apps/web/a.ts"]), checks: lintOf(null, "IN_PROGRESS") }), ["check-not-green:Lint"])
  same("lib/github.mjs: the Checks job that holds the lint step stands in when no Lint check exists", [barOf({ ...lintable(["apps/web/a.ts"]), checks: [...without("Lint"), green("Checks")], requiredChecks: unrequired }), barOf({ ...lintable(["apps/web/a.ts"]), checks: [...without("Lint"), { ...green("Checks"), conclusion: "SKIPPED" }], requiredChecks: unrequired })], [[], ["lint-missing"]])

  const closing = (text) => closesTicket(text, "thomasluizon/orbit-tickets")
  for (const text of ["Closes thomasluizon/orbit-tickets#1", "Closes: thomasluizon/orbit-tickets#1", "closed thomasluizon/orbit-tickets#12", "FIXES thomasluizon/orbit-tickets#3", "fix: thomasluizon/orbit-tickets#3", "Fixed\tthomasluizon/orbit-tickets#3", "resolve thomasluizon/orbit-tickets#4", "Resolved: thomasluizon/orbit-tickets#4", "Resolves https://github.com/thomasluizon/orbit-tickets/issues/9", "close: https://github.com/thomasluizon/orbit-tickets/issues/9", "done.\nCloses thomasluizon/orbit-tickets#1"]) {
    T(`lib/github.mjs: closing grammar "${text.replace(/\s+/g, " ")}" matches`, closing(text))
  }
  for (const text of ["Tracks thomasluizon/orbit-tickets#2066", "cut fixed context. Tracks thomasluizon/orbit-tickets#2066", "Closes thomasluizon/orbit-ui-mobile#1", "Closes #1", "prefixes thomasluizon/orbit-tickets#1", "Closes the thomasluizon/orbit-tickets#1 ticket", "see thomasluizon/orbit-tickets#1", "Fixes thomasluizon/orbit-tickets", "closer thomasluizon/orbit-tickets#1"]) {
    T(`lib/github.mjs: "${text.replace(/\s+/g, " ")}" does not match the closing grammar`, !closing(text))
  }
  const tracks = "Tracks thomasluizon/orbit-tickets#2066"
  same("lib/github.mjs: a commit message with Closes: thomasluizon/orbit-tickets#1 fails the bar", barOf({ commitMessages: ["feat: a change", "Closes: thomasluizon/orbit-tickets#1"] }), ["closing-keyword"])
  same("lib/github.mjs: a body with a closing line fails the bar", barOf({ body: `${tracks}\n\nFixes thomasluizon/orbit-tickets#2066` }), ["closing-keyword"])
  same("lib/github.mjs: a commit message with fixed context and a Tracks line passes the bar", barOf({ commitMessages: [`cut fixed context. ${tracks}`], body: tracks }), [])
  same("lib/github.mjs: a closing line of the 101st commit message fails the bar", barOf({ commitMessages: [...Array.from({ length: 100 }, () => "chore: step"), "Resolves thomasluizon/orbit-tickets#5"] }), ["closing-keyword"])
  same("lib/github.mjs: a lint failure and a closing line are both listed", barOf({ ...lintable(["apps/web/a.ts"]), checks: lintOf("SKIPPED"), commitMessages: ["Closes thomasluizon/orbit-tickets#1"] }), ["lint-missing", "closing-keyword"])
  same("lib/github.mjs: the failures that no worker order clears are the three that the diff settles", [...OWNER_BAR_FAILURES].sort(), ["closing-keyword", "diff-unknown", "lint-missing"])
  same("lib/github.mjs: every failed condition is listed, not only the first", barOf({ draft: true, mergeState: "DIRTY" }), ["draft", "merge-state:DIRTY"])

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
  const named = { ...FIXTURE.pullfrogRuns.response[0], databaseId: 1, displayTitle: `Respond to mention on #${7 * 10} [zzzzz]` }
  const { run, calls } = scripted([["--workflow pullfrog.yml", () => json([...FIXTURE.pullfrogRuns.response, named])]])
  const all = await pullfrogRuns("ui", seams(run))
  const runs = runsNaming(all, 7)
  same("lib/github.mjs: one read of the Pullfrog runs serves every pull request of the repository", [calls.length, all.length, runsNaming(all, 70).map((entry) => entry.databaseId)], [1, FIXTURE.pullfrogRuns.response.length + 1, [1]])
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
  const unsorted = scripted([["deployments?environment=production&task=deploy", () => json([older, newest])], ...deploymentRoutes({ [newest.id]: "success", [older.id]: "success" })])
  same("lib/github.mjs: the newest deployment wins when the API lists the older one first", (await deployedAt("ui", "production", "deploy", seams(unsorted.run))).sha, newest.sha)
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

  const parkedLabel = { name: "parked", color: "FBCA04", description: "A parked item." }
  const missingLabel = scripted([["label list", () => json(FIXTURE.ticketOperations.labels)], ["labels", () => ""]])
  same("lib/github.mjs: a label that is missing is created with one POST of a JSON body", [await ensureLabel("ui", parkedLabel, seams(missingLabel.run)), missingLabel.calls.at(-1).args, missingLabel.calls.at(-1).input], [true, ["api", `repos/${UI}/labels`, "--method", "POST", "--input", "-"], json(parkedLabel)])
  const knownLabel = scripted([["label list", () => json([...FIXTURE.ticketOperations.labels, { name: "parked" }])]])
  same("lib/github.mjs: a label that exists is not created again", [await ensureLabel("tickets", parkedLabel, seams(knownLabel.run)), knownLabel.calls.length], [false, 1])
  const closePullRun = scripted([["pulls/", () => ""], ["git/refs", () => ""]])
  await closePull("ui", 8, seams(closePullRun.run))
  await deleteBranch("ui", "chore/ticket-7-part-2", seams(closePullRun.run))
  same("lib/github.mjs: a close is one PATCH of the state and a branch delete is one DELETE of its ref", closePullRun.calls.map((call) => [call.args, call.input]), [
    [["api", `repos/${UI}/pulls/8`, "--method", "PATCH", "--input", "-"], json({ state: "closed" })],
    [["api", `repos/${UI}/git/refs/heads/chore/ticket-7-part-2`, "--method", "DELETE"], undefined],
  ])
  T("lib/github.mjs: an empty branch name is refused before any call", /non-empty/.test(await thrown(() => deleteBranch("ui", " ", seams(scripted([]).run)))))

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
  same("lib/github.mjs: the failed Pullfrog approval check is no failed check, its review owns it", failed, [])
  const approval = open.checks.find((check) => check.name === "pullfrog-approval")
  const unitTests = { ...approval, name: "Unit Tests", databaseId: 5, checkSuite: { app: { databaseId: 15368 } } }
  same("lib/github.mjs: a failed check names its run and its job beside the failed approval check", failedChecks({ ...open, checks: [...open.checks, unitTests] }).map((check) => [check.name, check.conclusion, check.runId, check.jobId]), [["Unit Tests", "FAILURE", "44663065457", 5]])
  same("lib/github.mjs: a pull request with green checks has no failed check", failedChecks(approved), [])
  const stepsOf = (jobName, change = (steps) => steps) => FIXTURE.failedJobs.response.jobs.find((job) => job.name === jobName).steps.map((step) => ({ ...step })).map((step, position, steps) => change(steps)[position])
  const barrierSteps = stepsOf("Guard Migrations").filter((step) => step.conclusion === "failure").map((step) => step.name)
  same("lib/github.mjs: the recorded barrier failure is one failed step", barrierSteps, ["Require deployment barriers for schema contractions"])
  same("lib/github.mjs: a failed barrier step of Guard Migrations goes to the owner", classifyCheckFailure({ name: "Guard Migrations", failedSteps: barrierSteps }), "needs-owner")
  same("lib/github.mjs: a failed Set up job step gets a rerun", classifyCheckFailure({ name: "Lint", failedSteps: ["Set up job"] }), "rerun")
  const checkoutTable = [
    ["the default name of a checkout step", ["Run actions/checkout@v7"], "rerun"],
    ["the default name of a checkout step pinned to a commit", ["Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"], "rerun"],
    ["the checkout step that Guards names", ["Checkout", "Set up Node"], "rerun"],
    ["only the cleanup step of a checkout", ["Post Run actions/checkout@v7"], "ci-fix"],
    ["a repository step whose name starts with Checkout", ["Checkout flow tests"], "ci-fix"],
  ]
  for (const [label, failedSteps, verdict] of checkoutTable) same(`lib/github.mjs: ${label} gives ${verdict}`, classifyCheckFailure({ name: "Lint", failedSteps }), verdict)
  same("lib/github.mjs: any other failure is a fix order", classifyCheckFailure({ name: "Unit Tests", failedSteps: ["Run Domain Tests"] }), "ci-fix")
  same("lib/github.mjs: another step of Guard Migrations is a fix order", classifyCheckFailure({ name: "Guard Migrations", failedSteps: ["Fail on edits to applied migrations"] }), "ci-fix")
  same("lib/github.mjs: the barrier step under another check name is a fix order", classifyCheckFailure({ name: "Unit Tests", failedSteps: barrierSteps }), "ci-fix")
  const workflowSteps = readFileSync(toolPath("../.github/workflows/test.yml"), "utf8").split(/^ {6}- /m)
  const gateSteps = workflowSteps.filter((step) => /\$\{\{ needs\.[\w-]+\.result \}\}/.test(step)).map((step) => /^name: (.+)$/m.exec(step)?.[1])
  T("lib/github.mjs: test.yml has steps that read the result of a needed job", gateSteps.length > 0)
  same("lib/github.mjs: each test.yml step that reads the result of a needed job is a gate step, which gets a rerun", gateSteps.filter((step) => classifyCheckFailure({ name: "Gate", failedSteps: [step] }) !== "rerun"), [])
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
  same("lib/worker.mjs: the settings JSON holds exactly the keys the order names", Object.keys(settings), ["claudeMdExcludes", "autoMemoryEnabled", "outputStyle", "skillOverrides", "permissions", "hooks"])
  same("lib/worker.mjs: the hot file is excluded from loading", settings.claudeMdExcludes, [`${HOME}/Developer/brain/hot.md`])
  same("lib/worker.mjs: auto memory is off and the output style is the default", [settings.autoMemoryEnabled, settings.outputStyle], [false, "default"])
  const ownerSkillsOff = Object.fromEntries(WORKER_SKILLS_OFF.map((name) => [name, "off"]))
  same("lib/worker.mjs: every skill is off except humanizer, and the skills a worker never uses are off by name", settings.skillOverrides, { brain: "off", pdf: "off", ...ownerSkillsOff })
  T("lib/worker.mjs: no owner skill loads in a worker", ["driver", "questions", "sleep", "morning", "over-limit"].every((name) => settings.skillOverrides[name] === "off"))
  T("lib/worker.mjs: a skill that a worker uses is not turned off by name", !WORKER_SKILLS_OFF.some((name) => ["humanizer", "second-opinion"].includes(name)))
  same("lib/worker.mjs: the deny list is the one the order names", settings.permissions.deny, [
    "Edit(**/.github/migration-contracts.json)", "Write(**/.github/migration-contracts.json)", "Edit(**/.github/migration-locks.json)", "Write(**/.github/migration-locks.json)",
    "Bash(render *)", "Bash(terraform *)", "Bash(aws *)", "Bash(stripe *)", "Bash(gh workflow *)", "Bash(gh secret *)", "Bash(gh pr merge*)", "Bash(gh api *merge*)",
    "Bash(gh api * -X *)", "Bash(gh api -X *)", "Bash(gh api * --method *)", "Bash(gh api --method *)", "Bash(gh auth *)", "Bash(env -u GH_TOKEN *)", "Bash(unset GH_TOKEN*)", "Bash(*GH_TOKEN=*)", "Bash(security *)",
    "Bash(gh pr close*)", "Bash(gh issue close*)", "Bash(gh issue comment*)", "Bash(gh issue edit*)",
  ])
  T("lib/worker.mjs: no deny rule refuses the edit or the comment of a pull request", !settings.permissions.deny.some((rule) => /gh pr (edit|comment)/.test(rule)))
  T("lib/worker.mjs: the deny list of the settings is a copy, so a caller cannot change the constant", settings.permissions.deny !== WORKER_DENY && Object.isFrozen(WORKER_DENY) && Object.isFrozen(CODE_WORKER_DENY))
  T("lib/worker.mjs: a code worker with no branch gets the hook with no target", !settings.hooks.PreToolUse[0].hooks[0].command.includes("--branch"))
  const schema = WORKER_FIXTURE.skillOverridesSchema
  const allowedValues = JSON.parse(/U\((\[[^\]]*\])\)/.exec(schema.schema)[1])
  T("lib/worker.mjs: every skillOverrides value that the worker writes is one the installed CLI accepts", Object.values(settings.skillOverrides).every((value) => allowedValues.includes(value)))
  T("lib/worker.mjs: the installed CLI reads claudeMdExcludes as a list of paths and autoMemoryEnabled as a boolean", /C\(n\(\)\)/.test(schema.claudeMdExcludes) && /absolute paths/.test(schema.claudeMdExcludes) && /O\(\)/.test(schema.autoMemoryEnabled))
  const json = JSON.stringify(settings)
  const command = workerCommand(json)
  same("lib/worker.mjs: the command is the one the order names, with the settings last", [command.executable, command.args], ["claude", [
    "-p", "--model", "claude-sonnet-5-5", "--effort", "high", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--permission-mode", "bypassPermissions",
    "--disallowed-tools", ...WORKER_DENIED_TOOLS, "--settings", json,
  ]])
  T("lib/worker.mjs: the denied tools keep Task and AskUserQuestion and add the tools a worker never calls", ["Task", "AskUserQuestion", "CronCreate", "DesignSync", "PushNotification", "RemoteTrigger", "ScheduleWakeup", "Workflow"].every((name) => command.args.includes(name)) && Object.isFrozen(WORKER_DENIED_TOOLS))
  T("lib/worker.mjs: no tool of the denied list is a tool that a worker needs", !["Bash", "Read", "Edit", "Write", "Skill", "ToolSearch"].some((name) => WORKER_DENIED_TOOLS.includes(name)))
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
    PATH: "/usr/bin", HOME, CLAUDE_CODE_TMPDIR: "/scratch/claude", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1", BRAIN_SESSION_CAPTURE: "1", GH_TOKEN: TOKEN,
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

  const ownerCalls = []
  const owner = async (answer, parentEnvironment = { PATH: "/usr/bin", GH_TOKEN: "worker-token", GITHUB_TOKEN: "x", GH_ENTERPRISE_TOKEN: "y", GITHUB_ENTERPRISE_TOKEN: "z" }) => readOwnerToken({ parentEnvironment, run: async (...call) => { ownerCalls.push(call); return answer } })
  same("lib/worker.mjs: the owner token is the gh keyring login without its line end", await owner({ status: 0, stdout: "gho_owner\n" }), "gho_owner")
  same("lib/worker.mjs: the owner read runs gh auth token for github.com", [ownerCalls[0][0], ownerCalls[0][1]], ["gh", ["auth", "token", "--hostname", "github.com"]])
  same("lib/worker.mjs: the owner read drops every token variable and keeps the rest", ownerCalls[0][2].env, { PATH: "/usr/bin" })
  same("lib/worker.mjs: no gh login gives null", await owner({ status: 1, stdout: "", stderr: "no oauth token found for github.com" }), null)
  same("lib/worker.mjs: an empty gh answer gives null", await owner({ status: 0, stdout: "\n" }), null)

  const home = join(root, "drive-worker", "home")
  mkdirSync(join(home, ".claude", "skills", "pdf"), { recursive: true })
  mkdirSync(join(home, ".claude", "skills", "humanizer"), { recursive: true })
  writeFileSync(join(home, ".claude", "skills", "pdf", "SKILL.md"), "x")
  writeFileSync(join(home, ".claude", "skills", "humanizer", "SKILL.md"), "x")
  const invocation = workerInvocation({ home, parentEnvironment: parent, token: TOKEN })
  const settings = JSON.parse(invocation.command.args.at(-1))
  same("lib/worker.mjs: the invocation excludes the hot file of the home folder and turns off the listed skills", [settings.claudeMdExcludes, settings.skillOverrides], [[join(home, "Developer", "brain", "hot.md")], { pdf: "off", ...Object.fromEntries(WORKER_SKILLS_OFF.map((name) => [name, "off"])) }])
  same("lib/worker.mjs: the invocation carries the worker environment", invocation.environment.GH_TOKEN, TOKEN)
  const questionsHome = join(root, "drive-worker", "questions-home")
  for (const name of ["pdf", "humanizer", "questions"]) {
    mkdirSync(join(questionsHome, ".claude", "skills", name), { recursive: true })
    writeFileSync(join(questionsHome, ".claude", "skills", name, "SKILL.md"), "x")
  }
  const questions = questionsInvocation({ home: questionsHome, parentEnvironment: parent, token: "owner-login-token" })
  const questionsSettings = JSON.parse(questions.command.args.at(-1))
  same("lib/worker.mjs: the questions run uses the coordinator model at the worker effort and no other argument changes", [questions.command.args.slice(0, 5), questions.command.args.slice(5, -1)], [["-p", "--model", "claude-opus-5-5", "--effort", "high"], invocation.command.args.slice(5, -1)])
  same("lib/worker.mjs: the questions run keeps the questions skill on and turns off the rest", questionsSettings.skillOverrides, { pdf: "off", ...Object.fromEntries(WORKER_SKILLS_OFF.filter((name) => name !== "questions").map((name) => [name, "off"])) })
  same("lib/worker.mjs: the questions run keeps the shared deny list and environment, with the owner token", [questionsSettings.permissions.deny, questions.environment], [[...WORKER_DENY], { ...invocation.environment, GH_TOKEN: "owner-login-token" }])
  T("lib/worker.mjs: the questions run writes ticket bodies, so it gets no GitHub hook and no code worker rule", !("hooks" in questionsSettings) && !questionsSettings.permissions.deny.includes("Bash(gh issue edit*)"))
  const reviewHome = join(root, "drive-worker", "review-home")
  for (const name of ["pdf", "humanizer", "ticket"]) {
    mkdirSync(join(reviewHome, ".claude", "skills", name), { recursive: true })
    writeFileSync(join(reviewHome, ".claude", "skills", name, "SKILL.md"), "x")
  }
  const review = harnessReviewInvocation({ home: reviewHome, parentEnvironment: parent, token: "owner-login-token" })
  const reviewSettings = JSON.parse(review.command.args.at(-1))
  same("lib/worker.mjs: the harness review uses claude-opus-5-5 at effort high and no other argument changes", [review.command.args.slice(0, 5), review.command.args.slice(5, -1)], [["-p", "--model", "claude-opus-5-5", "--effort", "high"], invocation.command.args.slice(5, -1)])
  same("lib/worker.mjs: the harness review keeps the ticket skill and the humanizer skill on and turns off the rest", reviewSettings.skillOverrides, { pdf: "off", ...Object.fromEntries(WORKER_SKILLS_OFF.filter((name) => name !== "ticket").map((name) => [name, "off"])) })
  same("lib/worker.mjs: the harness review keeps the shared deny list and environment, with the owner token", [reviewSettings.permissions.deny, review.environment], [[...WORKER_DENY], { ...invocation.environment, GH_TOKEN: "owner-login-token" }])
  T("lib/worker.mjs: the harness review writes tickets and labels, so it gets no GitHub hook", !("hooks" in reviewSettings))
  const ownSettings = JSON.parse(workerInvocation({ home, parentEnvironment: parent, token: TOKEN, own: { worktree: "/work/tree", branch: "chore/ticket-9" } }).command.args.at(-1))
  T("lib/worker.mjs: the invocation of a launch names its working tree and branch to the hook", ownSettings.hooks.PreToolUse[0].hooks[0].command.endsWith("--worktree '/work/tree' --branch 'chore/ticket-9' || exit 2"), ownSettings.hooks.PreToolUse[0].hooks[0].command)
  same("lib/worker.mjs: the worker, questions and worker account environments all carry BRAIN_SESSION_CAPTURE=1", [invocation.environment.BRAIN_SESSION_CAPTURE, questions.environment.BRAIN_SESSION_CAPTURE, workerInvocation({ home, parentEnvironment: parent, token: TOKEN, configDirectory: workerConfigDirectory(home) }).environment.BRAIN_SESSION_CAPTURE], ["1", "1", "1"])
  same("lib/worker.mjs: a parent that sets BRAIN_SESSION_CAPTURE to 0 does not turn the capture back on", workerInvocation({ home, parentEnvironment: { ...parent, BRAIN_SESSION_CAPTURE: "0" }, token: TOKEN }).environment.BRAIN_SESSION_CAPTURE, "1")
  T("lib/worker.mjs: the questions environment holds no worker token", !Object.values(questions.environment).includes(TOKEN))
  const workerDirectory = workerConfigDirectory(home)
  const onWorker = workerInvocation({ home, parentEnvironment: { ...parent, CLAUDE_CONFIG_DIR: "/somewhere/else" }, token: TOKEN, configDirectory: workerDirectory })
  same("lib/worker.mjs: the worker account sets CLAUDE_CONFIG_DIR to its directory and the main account sets none", [workerDirectory, onWorker.environment.CLAUDE_CONFIG_DIR, "CLAUDE_CONFIG_DIR" in invocation.environment], [join(home, ".claude-orbit-workers"), workerDirectory, false])
  const { CLAUDE_CONFIG_DIR: _directory, ...onWorkerRest } = onWorker.environment
  same("lib/worker.mjs: the worker account changes nothing else in the invocation", [onWorkerRest, onWorker.command], [invocation.environment, invocation.command])
  same("lib/worker.mjs: the account status call of the worker account has the config directory and no account override", [workerAccountEnvironment({ ...parent, CLAUDE_CODE_OAUTH_TOKEN: "x" }, workerDirectory).CLAUDE_CONFIG_DIR, "CLAUDE_CODE_OAUTH_TOKEN" in workerAccountEnvironment({ ...parent, CLAUDE_CODE_OAUTH_TOKEN: "x" }, workerDirectory)], [workerDirectory, false])
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

const occupantCases = () => {
  const stateDirectory = join(root, "occupant-state")
  const worktree = join(root, "occupant-worktrees", "chore-ticket-7")
  mkdirSync(stateDirectory, { recursive: true })
  mkdirSync(worktree, { recursive: true })
  const listing = (...rows) => ({ status: 0, stdout: `  PID COMMAND\n${rows.join("\n")}\n`, stderr: "" })
  const occupants = (rows, extra = {}) => worktreeOccupants(worktree, { stateDirectory, run: () => listing(...rows), alive: () => false, ownPid: 1, ...extra })
  same("lib/worker.mjs: a worktree with no process on its path has no occupant", occupants(["  10 /usr/bin/vim notes.txt"]), [])
  same("lib/worker.mjs: a process whose command names the worktree is an occupant", occupants([` 4242 claude --add-dir ${worktree}`, " 10 /usr/bin/vim notes.txt"]), [4242])
  same("lib/worker.mjs: a process that names a file under the worktree is an occupant", occupants([` 4243 node ${join(worktree, "a.mjs")}`]), [4243])
  same("lib/worker.mjs: a sibling path that starts with the same text is no occupant", occupants([` 4244 node ${worktree}-b/a.mjs`, ` 4245 node ${worktree}2`]), [])
  same("lib/worker.mjs: the driver's own process is never an occupant", occupants([` 77 node ${worktree}`], { ownPid: 77 }), [])
  writeFileSync(join(stateDirectory, "chore-ticket-7.pid"), `${JSON.stringify({ pid: 555, worktree })}\n`)
  writeFileSync(join(stateDirectory, "chore-ticket-8.pid"), `${JSON.stringify({ pid: 556, worktree: join(root, "other") })}\n`)
  writeFileSync(join(stateDirectory, "broken.pid"), "not json")
  same("lib/worker.mjs: a live pid file of the worktree is an occupant and a pid file of another worktree is not", occupants([], { alive: () => true }), [555])
  same("lib/worker.mjs: a dead pid file is no occupant", occupants([], { alive: () => false }), [])
  const failed = (() => { try { worktreeOccupants(worktree, { stateDirectory, run: () => ({ status: 1, stdout: "", stderr: "denied" }), alive: () => false }); return "" } catch (error) { return error.message } })()
  same("lib/worker.mjs: a ps that fails is an error, so the launch waits", failed, "ps failed: denied")
}

const directoryCases = () => {
  const worktree = join(root, "directory-worktrees", "chore-ticket-9")
  // The shape is the real output of `lsof -d cwd -Fpn`: a p line, an fcwd line and an n line for each process.
  const output = `p178\nfcwd\nn/\np5151\nfcwd\nn${worktree}/apps/web\np5152\nfcwd\nn${worktree}\np5153\nfcwd\nn${worktree}-b\np77\nfcwd\nn${worktree}\n`
  const read = (extra = {}) => processDirectories({ run: () => ({ status: 0, stdout: output, stderr: "" }), ...extra })
  same("lib/worker.mjs: lsof output gives one pid and one path for each process", read().slice(0, 3), [{ pid: 178, path: "/" }, { pid: 5151, path: `${worktree}/apps/web` }, { pid: 5152, path: worktree }])
  same("lib/worker.mjs: a process whose cwd is the worktree or a path under it holds it", directoryHolders(read(), worktree, { ownPid: 1 }), [77, 5151, 5152])
  same("lib/worker.mjs: a sibling path with the same prefix and the driver's own process hold nothing", directoryHolders(read(), worktree, { ownPid: 77 }), [5151, 5152])
  same("lib/worker.mjs: an lsof that exits 1 with output is read", read({ run: () => ({ status: 1, stdout: output, stderr: "can't stat" }) }).length, 5)
  const failed = (() => { try { processDirectories({ run: () => ({ status: 1, stdout: "", stderr: "denied" }) }); return "" } catch (error) { return error.message } })()
  same("lib/worker.mjs: an lsof that gives nothing is an error, so the worktree stays", failed, "lsof failed: denied")
  const real = processDirectories()
  T("lib/worker.mjs: the real lsof lists the cwd of this process", real.some(({ pid, path }) => pid === process.pid && path === realpathSync(process.cwd())), JSON.stringify(real.filter(({ pid }) => pid === process.pid)))
}

const resumeCases = () => {
  const invocation = { command: { executable: "claude", args: ["-p", "--model", "m"] }, environment: { A: "1" } }
  same("lib/worker.mjs: a resume adds --resume and the session id to the worker arguments and changes nothing else", resumeInvocation(invocation, "sess-9"), { command: { executable: "claude", args: ["-p", "--model", "m", "--resume", "sess-9"] }, environment: { A: "1" } })
  same("lib/worker.mjs: a resume leaves the invocation that it reads unchanged", invocation.command.args, ["-p", "--model", "m"])
  mkdirSync(join(root, "resume-home", ".claude", "skills"), { recursive: true })
  const real = workerInvocation({ home: join(root, "resume-home"), parentEnvironment: {}, token: "t" })
  const resumed = resumeInvocation(real, "sess-9")
  same("lib/worker.mjs: a resumed worker keeps the worker model, effort and settings", [resumed.command.args.slice(0, -2), resumed.command.args.slice(-2), resumed.environment], [real.command.args, ["--resume", "sess-9"], real.environment])
  T("lib/worker.mjs: the resume token limit is 200000", RESUME_TOKEN_LIMIT === 200000)

  const usage = (input, write, read, extra = {}) => JSON.stringify({ type: "assistant", message: { usage: { input_tokens: input, cache_creation_input_tokens: write, cache_read_input_tokens: read, ...extra } } })
  const logOf = (name, lines) => { const path = join(root, name); writeFileSync(path, lines.join("\n")); return path }
  const result = JSON.stringify({ type: "result", usage: { input_tokens: 9, cache_creation_input_tokens: 9, cache_read_input_tokens: 9999999 } })
  same("lib/worker.mjs: the context is the usage of the last assistant record and not the usage of the result", logContextTokens(logOf("context-a.log", [usage(2, 300, 1000), usage(3, 400, 5000), result, ""])), 5403)
  same("lib/worker.mjs: a usage with only some counts sums those counts", logContextTokens(logOf("context-b.log", [usage(10, undefined, 20)])), 30)
  same("lib/worker.mjs: a log with no assistant usage gives null", [logContextTokens(logOf("context-c.log", [result])), logContextTokens(logOf("context-d.log", [JSON.stringify({ type: "assistant", message: {} })])), logContextTokens(join(root, "context-missing.log"))], [null, null, null])
  same("lib/worker.mjs: an assistant record with a count that is no number gives null", logContextTokens(logOf("context-e.log", [usage("x", 1, 2)])), null)
  const big = JSON.stringify({ type: "user", message: { content: "x".repeat(1024 * 1024 + 50) } })
  same("lib/worker.mjs: the last assistant record is found across read chunks, with no final line end", logContextTokens(logOf("context-f.log", [usage(1, 1, 1), big, usage(5, 6, 7)])), 18)

  const worktree = join(root, "resume-worktree")
  mkdirSync(worktree, { recursive: true })
  const real1 = realpathSync(worktree)
  const file = sessionFile({ configDirectory: "/c", worktree, sessionId: "sess-1" })
  same("lib/worker.mjs: the transcript is under the config directory, in the real working path with each other character as a dash", file, `/c/projects/${real1.replace(/[^A-Za-z0-9]/g, "-")}/sess-1.jsonl`)
  same("lib/worker.mjs: a path over 200 characters has no known transcript", sessionFile({ configDirectory: "/c", worktree: `/${"a".repeat(201)}`, sessionId: "s" }), null)
  const config = join(root, "resume-config")
  const transcript = sessionFile({ configDirectory: config, worktree, sessionId: "sess-1" })
  const before = sessionExists({ configDirectory: config, worktree, sessionId: "sess-1" })
  mkdirSync(dirname(transcript), { recursive: true })
  writeFileSync(transcript, "{}\n")
  same("lib/worker.mjs: a session exists when its transcript is on disk", [before, sessionExists({ configDirectory: config, worktree, sessionId: "sess-1" }), sessionExists({ configDirectory: config, worktree, sessionId: "sess-2" })], [false, true, false])
}

const workerUnit = async () => {
  resumeCases()
  occupantCases()
  directoryCases()
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
  same("lib/order.mjs: the order kinds are the seven of the spec", ORDER_KINDS, ["build", "build part", "fix", "ci-fix", "merge-forward", "find", "replan"])
  same("lib/order.mjs: a part comment is read with or without its heading marks", [PART_COMMENTS[0], PART_COMMENTS[1], PART_COMMENTS[3]].map(partOf), [{ number: 1, total: 3 }, { number: 2, total: 3 }, null])
  same("lib/order.mjs: a line that only starts like a part is no part", ["Parts of speech", "Part 1 of", "Part 5 is complete", "See Part 1 of 3"].map((body) => partOf({ body })), [null, null, null, null])
  same("lib/order.mjs: two digits and a colon after the total still read as a part", partOf({ body: "Part 12 of 14: a" }), { number: 12, total: 14 })

  for (const kind of ORDER_KINDS) {
    const brief = renderBrief({ kind, place: PLACE, ticket: TICKET })
    const longPlace = { ...PLACE, repoPath: `/${"long-directory-name/".repeat(12)}orbit`, worktree: `/${"worktree-directory/".repeat(12)}branch`, branch: `chore/${"x".repeat(80)}` }
    const longest = Buffer.byteLength(renderBrief({ kind, place: longPlace, ticket: TICKET }))
    T(`lib/order.mjs: the ${kind} brief is at most 6,000 bytes (${Buffer.byteLength(brief)} with a short place, ${longest} with a long one)`, Buffer.byteLength(brief) <= 6000 && longest <= 6000)
    T(`lib/order.mjs: the ${kind} brief matches no name of a ticket, a feature or a project`, !BANNED_TEXT.test(brief), (BANNED_TEXT.exec(brief) ?? [])[0])
    T(`lib/order.mjs: the ${kind} brief names the place and no draft`, brief.includes(PLACE.worktree) && brief.includes(PLACE.branch) && !brief.includes("--draft ") && (!kind.startsWith("build") || brief.includes("non-draft")))
  }

  const noted = order("fix", { pull: PULL, review: { blocking: [{ path: null, line: null, body: "BLOCKING: body finding" }] } })
  T("lib/order.mjs: a fix order names a body finding by the review body and holds no owner comment section", noted.includes("- the review body\n\n  BLOCKING: body finding") && !noted.includes("## Owner comment") && !noted.includes("## Earlier launches"))

  const launch = (index, extra = {}) => ({ kind: "fix", model: "claude-sonnet-5-5", at: `2026-11-19T0${index}:00:00.000Z`, exitCode: index, killReason: null, headBefore: "a".repeat(40), headAfter: "b".repeat(40), blocking: [{ path: "a.mjs", line: index, body: `BLOCKING: finding ${index}` }], checks: [], result: `RESULT-${index}`, ...extra })
  const earlier = order("fix", { pull: PULL, review: { blocking: [{ path: "a.mjs", line: 1, body: "BLOCKING: x" }] }, history: [launch(2, { model: "claude-opus-5-5", killReason: "made no progress" }), launch(1, { checks: FAILURE.checks })] })
  const section = earlier.slice(earlier.indexOf("## Earlier launches"), earlier.indexOf("## Brief"))
  T("lib/order.mjs: an order with a history holds the section Earlier launches before the brief, newest first, with the closing line", earlier.indexOf("## This order") < earlier.indexOf("## Earlier launches") && earlier.indexOf("## Earlier launches") < earlier.indexOf("## Brief") && section.indexOf("claude-opus-5-5") < section.indexOf("claude-sonnet-5-5") && section.trimEnd().endsWith("The launches above failed. Find why before you change code."))
  T("lib/order.mjs: each earlier launch names its model, exit, kill reason, heads, findings, failing checks and result", ["fix on claude-opus-5-5, started 2026-11-19T02:00:00.000Z", "Exit: 2, killed: made no progress.", `Head: ${"a".repeat(40)} to ${"b".repeat(40)}.`, "- a.mjs:2: BLOCKING: finding 2", "#### Unit Tests (failed steps: Run Domain Tests)", "log line 79", "RESULT-1"].every((text) => section.includes(text)) && !section.includes("log line 19\n"))
  const bulky = Array.from({ length: 9 }, (_, index) => launch(index + 1, { blocking: [{ path: "a.mjs", line: index, body: `BLOCKING: ${"x".repeat(3000)} OLD${index + 1}` }] }))
  const capped = order("fix", { pull: PULL, review: { blocking: [{ path: "a.mjs", line: 1, body: "BLOCKING: x" }] }, history: [...bulky].reverse() })
  const cappedSection = capped.slice(capped.indexOf("## Earlier launches"), capped.indexOf("## Brief"))
  T("lib/order.mjs: the earlier launches stay under 16,000 bytes and the oldest launch drops first", Buffer.byteLength(cappedSection) <= 16000 + 200 && cappedSection.includes("OLD9") && !cappedSection.includes("OLD1 ") && !cappedSection.includes("OLD1\n"), `${Buffer.byteLength(cappedSection)} bytes`)
  T("lib/order.mjs: the tail of a worker result is cut to 2,000 bytes", order("fix", { pull: PULL, review: { blocking: [{ path: "a.mjs", line: 1, body: "BLOCKING: x" }] }, history: [launch(1, { result: `CUT-AWAY${"y".repeat(2500)}END-OF-RESULT` })] }).includes("END-OF-RESULT") && !order("fix", { pull: PULL, review: { blocking: [{ path: "a.mjs", line: 1, body: "BLOCKING: x" }] }, history: [launch(1, { result: `CUT-AWAY${"y".repeat(2500)}END-OF-RESULT` })] }).includes("CUT-AWAY"))
  const longChecks = ["Unit Tests", "Web Tests"].map((name, index) => ({ name, failedSteps: ["Run tests"], logLines: Array.from({ length: 120 }, (_, line) => `${name} LOG LINE ${line} ${"z".repeat(110)}`) }))
  const oneLong = order("ci-fix", { pull: PULL, failure: FAILURE, history: [launch(1, { checks: longChecks, result: `CUT-AWAY${"y".repeat(2500)}RESULT-TAIL-KEPT` })] })
  const longSection = oneLong.slice(oneLong.indexOf("## Earlier launches"), oneLong.indexOf("## Brief"))
  const fenceLines = longSection.split("\n").filter((line) => /^`{3,}$/.test(line))
  T("lib/order.mjs: one earlier launch that is over 16,000 bytes drops its oldest check-log lines and keeps the result tail and every fence", Buffer.byteLength(longSection.slice(0, longSection.indexOf("\n\nThe launches above failed."))) <= 16000 + 40 && longSection.includes("RESULT-TAIL-KEPT") && !longSection.includes("CUT-AWAY") && fenceLines.length > 0 && fenceLines.length % 2 === 0 && longSection.indexOf("The launches above failed. Find why before you change code.") >= 0 && oneLong.indexOf("The launches above failed. Find why before you change code.") < oneLong.indexOf("## Brief") && longSection.includes("LOG LINE 119"), `${Buffer.byteLength(longSection)} bytes, ${fenceLines.length} fence lines`)

  const resumed = renderResumeOrder({ kind: "fix", pull: PULL, review: { blocking: [{ path: "a.mjs", line: 4, body: "BLOCKING: x" }] } })
  T("lib/order.mjs: a resumed fix order holds the findings, the class rule and the one delivery change, and no ticket, part or brief", resumed.startsWith("## This order (fix, resumed)") && resumed.includes("- a.mjs:4") && resumed.includes("Fix the whole class of each finding") && resumed.includes("Your first order and its brief still hold. One delivery rule changes: push to the branch of the open pull request and open no other pull request.") && !resumed.includes("except for the delivery") && !resumed.includes("## Brief") && !resumed.includes("The ticket body") && !resumed.includes("## Parts"))
  T("lib/order.mjs: a resumed ci-fix and a resumed merge-forward order hold their own work", renderResumeOrder({ kind: "ci-fix", pull: PULL, failure: { checks: [{ name: "Unit Tests", logLines: ["boom"] }] } }).includes("### Unit Tests") && renderResumeOrder({ kind: "merge-forward", pull: PULL }).includes("conflicts with `origin/main`"))
  const resumedGrant = renderResumeOrder({ kind: "merge-forward", pull: PULL, ownerNote: "Keep the left side of the conflict." })
  T("lib/order.mjs: a resumed merge-forward order that an owner comment granted holds the comment, and one with no comment holds no owner section", resumedGrant.includes("## Owner comment") && resumedGrant.includes("Keep the left side of the conflict.") && resumedGrant.indexOf("## Owner comment") < resumedGrant.indexOf("Your first order and its brief still hold.") && !renderResumeOrder({ kind: "merge-forward", pull: PULL }).includes("## Owner comment"))
  for (const [label, call, message] of [
    ["a build order", () => renderResumeOrder({ kind: "build" }), /does not resume a session/],
    ["a fix order with no blocking class", () => renderResumeOrder({ kind: "fix", pull: PULL, review: { blocking: [] } }), /needs its pull request/],
  ]) T(`lib/order.mjs: a resumed order refuses ${label}`, message.test(String(((() => { try { call() } catch (error) { return error.message } return "" })()))))

  const build = order("build", { partComments: [] })
  T("lib/order.mjs: a build order holds the title, the ticket body and the brief, and no part section", build.startsWith("# A ticket title\n\nThe ticket body") && build.includes("Second paragraph.") && build.includes("## Brief") && !build.includes("## Parts"))
  T("lib/order.mjs: a build order tells the worker to rebase before its first push", /Rebase on `origin\/main` before the first push/.test(build))
  const delivery = build.slice(build.indexOf("**Delivery.**"))
  T("lib/order.mjs: the delivery rules name the Tracks line, the three sections, the Remaining line and the attribution ban", delivery.includes(`Tracks ${TICKET_REPOSITORY}#9`) && !delivery.includes("never `Closes`") && ["## Assumptions", "## Manual steps", "## Test evidence", "`Remaining:`", "`Co-Authored-By`", "`Generated with`", "git rm", "rmSync", "Stage named paths only", "Never merge and never force-push"].every((text) => delivery.includes(text)))
  T("lib/order.mjs: an opening order names the parity:exempt label, the ## Parity line and every term that the PR Metadata gate accepts", ["build", "build part"].every((kind) => {
    const opening = order(kind, { partNumber: 2 })
    return opening.includes("`parity:exempt`") && opening.includes("`## Parity`") && parityExemptTerms.every((term) => opening.includes(term))
  }))
  T("lib/order.mjs: the brief tells the worker to decide with the recommended option and to end with NEEDS_DECISION only for the four owner matters", /Decide every choice with the recommended option/.test(build) && /NEEDS_DECISION: <question>.*money.*model or effort.*standing owner order.*irreversible/.test(build))
  T("lib/order.mjs: the brief bans a browser, a dev server and the production CLI, and names the two barrier files", /Open no browser\. Start no dev server\. Run no production CLI/.test(build) && build.includes(".github/migration-contracts.json") && build.includes(".github/migration-locks.json"))
  T("lib/order.mjs: the brief names the copy rule", build.includes("`/humanizer`") && build.includes("`/second-opinion`") && !build.includes("`BRAND.md`"))

  const part = order("build part", { partNumber: 2, findings: [] })
  T("lib/order.mjs: a part order holds the full comment of its part under a title, with the heading marks cut", part.includes("### Part 2 of 3: the second behaviour (this order)") && part.includes("BODY-OF-PART-2 holds the paths.") && part.includes("Paths: a/, b"))
  T("lib/order.mjs: a part order holds only the first line of each other part", part.includes("- Part 1 of 3: the first behaviour") && part.includes("- Part 3 of 3: the third behaviour") && !part.includes("SECRET-BODY-OF-PART-1") && !part.includes("SECRET-BODY-OF-PART-3"))
  T("lib/order.mjs: an order holds none of the comments of the driver and no owner note that is no part", ["launch", "record", "request", "needs-owner", "notice", "close"].every((kind) => !part.includes(`DRIVER-${kind.toUpperCase()}`)) && !part.includes("NOTE-WITHOUT-PART") && !part.includes("orbit-drive:"))
  T("lib/order.mjs: a part order names its part and the part-only rule", part.includes("## This order (build part)") && part.includes("Build Part 2 of this ticket and no other part"))
  const apply = order("build part", { partNumber: 2, findings: FINDINGS })
  T("lib/order.mjs: an apply part holds the findings it applies, in full and without the marker", apply.includes("## Findings to apply") && apply.includes("src/a.ts:4 | class | fix") && !apply.includes("<!-- orbit-drive:findings -->") && !apply.includes("DRIVER-LAUNCH"))

  const fix = order("fix", { pull: PULL, review: REVIEW })
  T("lib/order.mjs: a fix order lists every class and every instance of the review", ["src/a.ts:10", "src/b.ts:22", "src/c.ts:3", "src/d.ts:8", "BLOCKING: correctness bug", "BLOCKING: broken contract", "BLOCKING: missed requirement"].every((text) => fix.includes(text)), fix)
  T("lib/order.mjs: a fix order names the head and asks for one commit, one red test per class, one push", fix.includes(PULL.headSha) && /in one commit/.test(fix) && /fails without the fix, and run it red before the fix/.test(fix) && /Push once/.test(fix) && /Do not merge `origin\/main`/.test(fix))
  const ciFix = order("ci-fix", { pull: PULL, failure: FAILURE })
  T("lib/order.mjs: a ci-fix order names each failed check, its failed steps and the last 60 log lines", ciFix.includes("### Unit Tests (failed steps: Run Domain Tests)") && ciFix.includes("### Lint\n") && ciFix.includes("log line 79") && ciFix.includes("log line 20") && !ciFix.includes("log line 19\n"))
  T("lib/order.mjs: a fix order and a ci-fix order never tell the worker to merge origin/main", [fix, ciFix].every((text) => /Do not merge `origin\/main`\. Push once/.test(text) && !/(^|[.] )Merge `origin\/main`/.test(text)))
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
  const files = ["drive.mjs", "__tests__/_drive-tick.mjs", "lib/driver-pin.mjs", "lib/driver-health.mjs", "lib/telegram.mjs", "lib/worker.mjs", "lib/worker-gh-hook.mjs", "lib/order.mjs", "lib/github.mjs", "lib/config.mjs", "__tests__/drive.mjs", "__fixtures__/drive-github.json", "__fixtures__/drive-worker.json"]
  for (const file of files) {
    const path = toolPath(file)
    const found = readFileSync(path, "utf8").split("\n").map((line, index) => [index + 1, line]).filter(([, line]) => BANNED_TEXT.test(line))
    T(`${file}: names no ticket, feature, rename or one-time project`, found.length === 0, found.slice(0, 3).map(([number, line]) => `${number}: ${line.slice(0, 120)}`).join("\n"))
  }
}

const skillText = (name) => readFileSync(join(REPO_ROOT, ".claude", "skills", name, "SKILL.md"), "utf8")

const skillMarkerCases = () => {
  const questions = skillText("questions")
  // The driver reads a comment's kind only from "<!-- orbit-drive:<kind> -->". A bare marker has the kind null, so the driver reads it as an owner comment.
  const bare = [...questions.matchAll(/<!-- (?!orbit-drive:)([a-z-]+) -->/g)].map((match) => match[1])
  same("skills/questions: the only bare marker is the owner-review decision, which is no driver kind", [...new Set(bare)], ["owner-review"])
  same("skills/questions: the queued question and its reader use the orbit-drive:owner-question marker", questions.split("<!-- orbit-drive:owner-question -->").length - 1, 2)
  // An order carries the ticket body, the part comments and the findings. A plain answer comment reaches no worker, so the body holds every answer.
  T("skills/questions: section 4 writes each answer into the ticket body with gh issue edit --body-file under ## Owner decisions", questions.includes(`gh issue edit <number> --repo ${TICKET_REPOSITORY} --body-file <file>`) && questions.includes("`## Owner decisions`"), "section 4 has no body write")
  T("skills/questions: section 4 also records each answer with update-ticket.mjs note --decision", questions.includes("node tools/update-ticket.mjs note --decision --ticket <number> --body-file <file>"), "section 4 has no note call")
  // A sleep decision is an answer too, so the sleep skill writes the body and the note, as section 4 says.
  const sleep = skillText("sleep")
  T("skills/sleep: each sleep decision goes into the ticket body and into a note --decision comment", sleep.includes("ticket body") && sleep.includes("node tools/update-ticket.mjs note --decision"), "the sleep skill misses the body write or the note call")
  same("skills/questions: no step records an answer by a reference to the old comment-only step", questions.match(/as in step 4|comment of step 4/g) ?? [], [])
  same("skills/questions: the manual answer, the owner change and the sleep-on decision all record through section 4", questions.split("as in section 4").length - 1, 3)
  // A pull request with no open ticket gets no label, so a skill finds it by its report, and only the owner-answer comment ends its hold.
  const listing = questions.split("\n").find((line) => line.startsWith("2. ") && line.includes("pull request")) ?? ""
  T("skills/questions: step 1 lists a pull request with no open ticket by its needs-owner report", listing.includes("no open ticket") && listing.includes("<!-- orbit-drive:needs-owner -->"), listing)
  T("skills/questions: section 4 ends the hold of such a pull request with the orbit-drive:owner-answer marker", questions.includes("<!-- orbit-drive:owner-answer -->"), "no step writes the answer marker")
  const drivers = skillText("driver")
  T("skills/driver: a held report with no label is handled only when its pull request is closed or answered", drivers.includes("orbit-drive:owner-answer"), "the sleep report reads only the label")
  const unlink = drivers.split("\n").find((line) => line.includes("fs.unlinkSync")) ?? ""
  T("skills/driver: a worktree skill link is deleted only when the pull request of its branch is merged", unlink.includes("--state merged") && unlink.includes("--head"), unlink)
  // Run from a code checkout, gh reads the issues of that repository, so each issue command of a skill names the ticket repository.
  const skillNames = readdirSync(join(REPO_ROOT, ".claude", "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const issueCommands = skillNames.flatMap((name) => [...skillText(name).matchAll(/`(gh issue [^`]*)`/g)].map((match) => [name, match[1]]))
  same("skills: every gh issue command names the ticket repository", issueCommands.filter(([, command]) => !command.includes(`--repo ${TICKET_REPOSITORY}`)), [])
  const parkedRun = skillText("ticket").split("\n## --auto --parked\n")[1] ?? ""
  T("skills/ticket: the --auto --parked section writes an owner step with the needs-owner marker that the driver reads, and names the owner list of /questions", parkedRun.includes("<!-- orbit-drive:needs-owner -->") && parkedRun.includes(".claude/skills/questions/SKILL.md"), "the section is missing or incomplete")
  T("skills/ticket: the --auto --parked section removes parked from pull requests and tickets as its last step", /8\. Remove `parked` last.*gh pr edit .*--remove-label parked.*gh issue edit .*--remove-label parked/.test(parkedRun), parkedRun)
  const progress = skillText("progress")
  // A part is a comment of its ticket, and `partNumber` is the number in its first line, never an issue number.
  T("skills/progress: the part title comes from the part comment of the ticket", progress.includes(`gh issue view <ticketNumber> --repo ${TICKET_REPOSITORY} --json title,comments`) && progress.includes("Part <partNumber> of <m>") && !/for the part\b/.test(progress), "the skill reads the part as an issue")
  T("skills/progress: the next ticket in line comes from the next ticket line of the dry run", progress.includes("`next ticket `") && progress.includes("`next ticket none`") && !progress.includes("action is `admit`"), "the skill reads another line")
}

const telegramUnit = async () => {
  const requests = []
  const keychain = async (item) => ({ "telegram-bot-token": "123456:bot-secret", "telegram-chat-id": "4242" })[item] ?? null
  const answering = (status, body) => async (url, init) => { requests.push({ url, init }); return { status, json: async () => body } }
  same("lib/telegram.mjs: an ok answer is a sent message", await sendTelegram("a".repeat(5000), { keychain, fetch: answering(200, { ok: true, result: {} }) }), { status: "sent" })
  same("lib/telegram.mjs: one JSON POST holds the chat id and a text cut to the limit", [requests.length, requests[0].init.method, requests[0].init.headers["content-type"], JSON.parse(requests[0].init.body).chat_id, JSON.parse(requests[0].init.body).text.length], [1, "POST", "application/json", "4242", 4096])
  same("lib/telegram.mjs: a refusal gives the status and the description", await sendTelegram("text", { keychain, fetch: answering(400, { ok: false, description: "Bad Request: chat not found" }) }), { status: "failed", reason: "HTTP 400: Bad Request: chat not found" })
  same("lib/telegram.mjs: an answer that is no JSON is a failure", await sendTelegram("text", { keychain, fetch: async () => ({ status: 502, json: async () => { throw new SyntaxError("no JSON") } }) }), { status: "failed", reason: "HTTP 502: no description" })
  same("lib/telegram.mjs: a missing Keychain item makes no request and names the item", [await sendTelegram("text", { keychain: async () => null, fetch: answering(200, { ok: true }) }), requests.length], [{ status: "unset", missing: "telegram-bot-token" }, 2])
}

const orderUnit = async () => {
  await orderCases()
  selfSufficiencyCases()
  skillMarkerCases()
}

const UNITS = { "drive.mjs": driverUnit, "lib/driver-pin.mjs": pinUnit, "lib/telegram.mjs": telegramUnit, "lib/config.mjs": configUnit, "lib/github.mjs": githubUnit, "lib/worker.mjs": workerUnit, "lib/order.mjs": orderUnit }

export const cases = async () => {
  for (const unit of Object.values(UNITS)) await unit()
}
