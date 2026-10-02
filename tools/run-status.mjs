#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { configuredRepositorySlug, queuedRunsPath, readAdmissionCounts } from "./lib/admission.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { graphqlBudgetDecision } from "./lib/github-rate-limit.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { newestChecks, readinessReport, PASSING_CONCLUSIONS } from "./lib/readiness-receipt.mjs"
import { gitDirectoryOf, REPO_ROOT, readRunState, readWakeSourceStates, readWorkerLaunches, workerLaunchDirectory } from "./lib/run-state.mjs"

const USAGE = `usage: run-status.mjs --session <id>

Reads the owning checkout's run, wake sources, launcher results, receipts and GitHub board.
Prints one compact JSON object with observations and exact next commands. No verdict is decided.
A foreign session has no actions. A linked worktree names the main checkout without reading its run.
The wake-source reader removes registrations only when both recorded processes are dead.
At most one GraphQL and one queued-runs REST read per repository, plus one REST rate_limit read.
Errors are redacted; tokens are scoped to child environments; pull request bodies are never read.

  --session <id>  current orchestrating session id (required when a run exists)
  --help, -h     print this usage and exit 0

exit codes: 0 snapshot (including absent, foreign or unreadable runs), 2 usage or environment error`

export const statusQuery = (numbers) => `query RunStatus($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100) { totalCount nodes { headRefName } }
    ${numbers.map((number) => `pr${number}: pullRequest(number: ${number}) {
      number state isDraft headRefName headRefOid baseRefName baseRefOid mergeStateStatus
      statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes {
        __typename
        ... on CheckRun { name status conclusion startedAt checkSuite { app { databaseId } } }
        ... on StatusContext { context state createdAt }
      } } }
      reviews(last: 100, author: "pullfrog[bot]") { pageInfo { hasPreviousPage } nodes {
        state submittedAt author { __typename login } commit { oid }
      } }
      reviewThreads(first: 100) { pageInfo { hasNextPage } nodes {
        isResolved comments(first: 1) { nodes { author { __typename login } } }
      } }
    }`).join("\n")}
  }
}`

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, "utf8")) } catch { return null }
}
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`
const action = (type, command, identity = {}) => ({ type,
  ...(identity.repositoryKey ? { pr: `${identity.repositoryKey}#${identity.prNumber}` } : identity), command })
const commandPath = (path, root) => {
  if (!isAbsolute(path)) return path
  const local = relative(root, path) || "."
  return local.length < path.length ? local : path
}
const commandFor = (tool, row) => `node tools/${tool}.mjs --repo ${quote(row.repositoryKey)} --pr ${row.prNumber}`
const waitCommand = (row) => commandFor("wait-ci", row)
const reviewCommand = (row) => `${commandFor("list-bot-threads", row)} --no-request --wait-seconds 0`
const deliveryCommand = (row, pull, launch, receipt) => {
  const issue = row.issue ?? launch?.issue ?? receipt?.issue ?? (/ticket-(\d+)/.exec(pull.headRefName)?.[1] ?? /ORB-\d+/i.exec(pull.headRefName)?.[0])
  const worktree = row.worktree ?? launch?.runDirectory
  return `node tools/verify-delivery.mjs --repo ${quote(row.repositoryKey)} --issue ${issue ? quote(issue) : '"$TICKET_REFERENCE"'} --worktree ${worktree ? quote(commandPath(worktree, row.commandRoot)) : '"$WORKTREE"'} --branch ${quote(pull.headRefName)} --base ${quote(pull.baseRefName)} > ${quote(commandPath(row.deliveryPath ?? `${row.receiptPath}.delivery.json`, row.commandRoot))}`
}

const checkCounts = (rollup) => {
  const counts = { total: 0, pending: 0, failed: 0 }
  for (const check of newestChecks((rollup?.contexts?.nodes ?? []).map((check) => ({ ...check, appId: check.checkSuite?.app?.databaseId ?? null }))).values()) {
    counts.total++
    if (check.__typename === "StatusContext") {
      if (["ERROR", "FAILURE"].includes(check.state)) counts.failed++
      else if (check.state !== "SUCCESS") counts.pending++
    } else if (check.status !== "COMPLETED") counts.pending++
    else if (!PASSING_CONCLUSIONS.has(check.conclusion)) counts.failed++
  }
  return counts
}

const validPull = (pull, number) => pull?.number === number &&
  ["OPEN", "CLOSED", "MERGED"].includes(pull.state) && typeof pull.isDraft === "boolean" &&
  ["headRefName", "headRefOid", "baseRefName", "baseRefOid", "mergeStateStatus"].every((key) => typeof pull[key] === "string") &&
  Array.isArray(pull.reviews?.nodes) && pull.reviews.nodes.every((review) => review && typeof review.state === "string" && typeof review.submittedAt === "string") && typeof pull.reviews.pageInfo?.hasPreviousPage === "boolean" &&
  Array.isArray(pull.reviewThreads?.nodes) && typeof pull.reviewThreads.pageInfo?.hasNextPage === "boolean" &&
  pull.reviewThreads.nodes.every((thread) => thread && typeof thread.isResolved === "boolean" && Array.isArray(thread.comments?.nodes)) &&
  (pull.statusCheckRollup === null || (Array.isArray(pull.statusCheckRollup?.contexts?.nodes) && pull.statusCheckRollup.contexts.nodes.every((check) => check.__typename === "CheckRun" ? typeof check.name === "string" && typeof check.status === "string" : check.__typename === "StatusContext" && typeof check.context === "string" && typeof check.state === "string") && typeof pull.statusCheckRollup.contexts.pageInfo?.hasNextPage === "boolean"))

const deliveryIsCurrent = (row, pull) => {
  const delivery = readJson(row.deliveryPath ?? `${row.receiptPath}.delivery.json`)
  const state = delivery?.checks?.pullRequestState
  const ci = delivery?.checks?.ci
  return delivery?.checks?.prCount?.number === row.prNumber && state?.headSha === pull.headRefOid &&
    state?.baseSha === pull.baseRefOid && state?.baseBranch === pull.baseRefName &&
    ci?.pass === true && Array.isArray(ci.pending) && ci.pending.length === 0 &&
    Array.isArray(ci.failing) && ci.failing.length === 0 && typeof ci.registrationFingerprint === "string"
}

const observePull = (row, pull, launches, wakes) => {
  const identity = { repositoryKey: row.repositoryKey, prNumber: row.prNumber }
  if (!validPull(pull, row.prNumber)) return { observation: { ...identity, status: "UNREADABLE" }, actions: [] }
  const receipt = readJson(row.receiptPath)
  const launch = launches.filter((entry) => entry.repositoryKey === row.repositoryKey && entry.branch === pull.headRefName).at(-1)
  const checks = checkCounts(pull.statusCheckRollup)
  const reviews = pull.reviews.nodes.filter((review) => review.author?.__typename === "Bot" &&
    ["pullfrog", "pullfrog[bot]"].includes(review.author.login) && review.commit?.oid === pull.headRefOid)
  const review = reviews.sort((left, right) => String(left.submittedAt).localeCompare(String(right.submittedAt))).at(-1)
  const unresolved = pull.reviewThreads.nodes.filter((thread) => !thread.isResolved &&
    thread.comments.nodes[0]?.author?.__typename === "Bot" && ["pullfrog", "pullfrog[bot]"].includes(thread.comments.nodes[0]?.author?.login)).length
  const complete = !pull.reviewThreads.pageInfo.hasNextPage && !pull.statusCheckRollup?.contexts.pageInfo.hasNextPage &&
    (review !== undefined || !pull.reviews.pageInfo.hasPreviousPage)
  const receiptStatus = !receipt || typeof receipt.ci !== "object" || typeof receipt.ticket !== "object" || !Number.isInteger(receipt.behindBy) || typeof receipt.draft !== "boolean" || receipt.repositoryKey !== row.repositoryKey || receipt.prNumber !== row.prNumber ||
    typeof receipt.currentHeadSha !== "string" || typeof receipt.currentBaseSha !== "string" ? "MISSING_OR_CORRUPT"
    : receipt.currentHeadSha !== pull.headRefOid || receipt.currentBaseSha !== pull.baseRefOid ? "RECEIPT_STALE" : "CURRENT"
  const receiptVerdict = receipt ? readinessReport(receipt).verdict : null
  const receiptCiCurrent = receiptStatus === "CURRENT" && !readinessReport(receipt).verdicts.includes("CI_STALE")
  const currentDelivery = deliveryIsCurrent(row, pull)
  const observation = { ...identity, status: pull.state, draft: pull.isDraft, head: pull.headRefOid, base: pull.baseRefOid,
    baseBranch: pull.baseRefName, mergeStateStatus: pull.mergeStateStatus, checks,
    review: review ? { state: review.state, submittedAt: review.submittedAt } : null,
    unresolved: pull.reviewThreads.pageInfo.hasNextPage ? null : unresolved, ...(complete ? {} : { complete: false }), receipt: receiptStatus, ...(receiptStatus === "MISSING_OR_CORRUPT" ? {} : { receiptVerdict }) }
  const actions = []
  const add = (type, command) => actions.push(action(type, command, identity))
  if (pull.state !== "OPEN") return { observation, actions }
  if (unresolved > 0 || review?.state === "CHANGES_REQUESTED" || review?.state === "COMMENTED") {
    add("READ_REVIEW", reviewCommand(row))
    return { observation, actions }
  }
  if (!complete) return { observation, actions }
  if (pull.mergeStateStatus === "BEHIND") add("BEHIND_BASE", deliveryCommand(row, pull, launch, receipt))
  else if (checks.failed > 0) add("CHECK_FAILED", deliveryCommand(row, pull, launch, receipt))
  else if (receiptStatus !== "CURRENT" && !currentDelivery) add("VERIFY_DELIVERY", deliveryCommand(row, pull, launch, receipt))
  else if (checks.total === 0 || checks.pending > 0 || !review) {
    const waiter = wakes.live.some((source) =>
      (source.repositoryKey === row.repositoryKey && source.prNumbers?.includes(row.prNumber)) ||
      (source.what?.startsWith(`CI ${row.repositoryKey} pull requests `) && source.what.split(/[, ]+/).includes(`#${row.prNumber}`)))
    if (!waiter) add(checks.pending > 0 || checks.total === 0 ? "REARM_WAIT_CI" : "READ_REVIEW", checks.pending > 0 || checks.total === 0 ? waitCommand(row) : reviewCommand(row))
  } else if (!receiptCiCurrent && !currentDelivery) add("VERIFY_DELIVERY", deliveryCommand(row, pull, launch, receipt))
  else if (receiptStatus !== "CURRENT" || receiptVerdict !== "READY") {
    const delivery = row.deliveryPath ?? `${row.receiptPath}.delivery.json`
    const ticket = row.ticketPath ?? `${row.receiptPath}.ticket.json`
    add("RECORD_READINESS", `${commandFor("record-readiness", row)} --delivery ${quote(commandPath(delivery, row.commandRoot))} --ticket ${quote(commandPath(ticket, row.commandRoot))}`)
  } else if (!pull.isDraft && unresolved === 0 && review.state === "APPROVED" && ["CLEAN", "HAS_HOOKS"].includes(pull.mergeStateStatus)) {
    add("MERGE_CANDIDATE", `${commandFor("record-readiness", row)} --delivery ${quote(commandPath(row.deliveryPath ?? `${row.receiptPath}.delivery.json`, row.commandRoot))} --ticket ${quote(commandPath(row.ticketPath ?? `${row.receiptPath}.ticket.json`, row.commandRoot))}`)
  }
  return { observation, actions }
}

const readLaunchResults = (repoRoot) => {
  const directory = join(workerLaunchDirectory(repoRoot), "results")
  let names
  try { names = readdirSync(directory).filter((name) => /^\d+\.json$/.test(name)) } catch { return [] }
  return names.map((name) => ({ name, result: readJson(join(directory, name)), modified: statSync(join(directory, name)).mtimeMs }))
    .sort((left, right) => left.modified - right.modified).map(({ name, result }) =>
      result && result.launcherPid === Number(name.slice(0, -5)) && Number.isInteger(result.exitCode) &&
      ["repositoryKey", "issue", "runDirectory", "branch", "outcome"].every((key) => typeof result[key] === "string")
        ? result : { launcherPid: Number(name.slice(0, -5)), corrupt: true })
}

const readWorktrees = (repoRoot) => {
  const result = spawnSync(process.env.GIT_BIN || "git", ["-C", repoRoot, "worktree", "list", "--porcelain"], { encoding: "utf8", timeout: 1000 })
  const worktrees = new Map()
  if (result.status !== 0) return worktrees
  let path = null
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length)
    if (path && line.startsWith("branch refs/heads/")) worktrees.set(line.slice("branch refs/heads/".length), path)
  }
  return worktrees
}

const githubRead = async (args, auth, runner) => {
  const result = await runner(process.env.GH_BIN || "gh", args, { env: auth.environment, timeoutMs: 3500, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || result.timedOut || result.overflowed || result.status !== 0) throw new Error(redactSecrets(result.stderr || result.error?.message || (result.timedOut ? "GitHub read timed out" : `exit ${result.status}`), auth.secrets))
  let response
  try { response = JSON.parse(result.stdout) } catch (error) { throw new Error(redactSecrets(error.message, auth.secrets)) }
  if (response.errors) throw new Error(redactSecrets(JSON.stringify(response.errors), auth.secrets))
  return response
}

const readRepository = async ({ key, slug, rows, auth, budget, runner, now }) => {
  const snapshot = { repositoryKey: key, status: "OK", openPullRequests: null, queuedRuns: null, openBranches: [], pulls: {} }
  try {
    const authentication = await auth
    const [owner, name] = slug.split("/")
    const limited = budget?.action === "wait"
    const reads = await Promise.allSettled([
      limited ? Promise.resolve(null) : githubRead(["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-f", `query=${statusQuery(rows.map((row) => row.prNumber))}`], authentication, runner),
      githubRead(["api", queuedRunsPath(slug, now)], authentication, runner),
    ])
    if (reads[1].status === "fulfilled" && Number.isInteger(reads[1].value?.total_count) && reads[1].value.total_count >= 0) snapshot.queuedRuns = reads[1].value.total_count
    if (reads[0].status === "rejected") throw reads[0].reason
    if (limited) snapshot.status = "RATE_LIMITED"
    else {
      const repository = reads[0].value?.data?.repository
      if (!repository || !Number.isInteger(repository.pullRequests?.totalCount) || repository.pullRequests.totalCount < 0 || !Array.isArray(repository.pullRequests.nodes) || repository.pullRequests.nodes.some((pull) => typeof pull.headRefName !== "string")) throw new Error("repository response did not contain the recorded shape")
      snapshot.openPullRequests = repository.pullRequests.totalCount
      snapshot.openBranches = repository.pullRequests.nodes.map((pull) => pull.headRefName)
      snapshot.pulls = repository
    }
    if (reads[1].status === "rejected") snapshot.error = reads[1].reason.message.slice(0, 256)
  } catch (error) {
    snapshot.status = "UNREADABLE"
    snapshot.error = redactSecrets(error.message).slice(0, 256)
  }
  return snapshot
}

const repositoryTargets = ({ config, rows, owner, authenticate }) => {
  const authentications = new Map()
  return Object.entries(config.repos).map(([key, path]) => {
    const slug = configuredRepositorySlug(path, owner)
    const repositoryOwner = slug.split("/")[0]
    if (!authentications.has(repositoryOwner)) {
      const pending = authenticate(path, { timeoutMs: 3500 })
      pending.catch(() => {})
      authentications.set(repositoryOwner, pending)
    }
    return { key, path, slug, worktrees: readWorktrees(path), rows: rows.filter((row) => row.repositoryKey === key), auth: authentications.get(repositoryOwner) }
  })
}

const recoverLaunchResults = ({ repositories, wakes, launches, sessionId }) => {
  const indexed = repositories.flatMap((repository) => [...repository.worktrees.values()].flatMap((worktree) => readWorkerLaunches(worktree)))
    .filter((launch) => launch.sessionId === sessionId && typeof launch.issue === "string" && typeof launch.runDirectory === "string")
  const results = new Map(launches.map((launch) => [launch.launcherPid, launch]))
  for (const launch of indexed) {
    if ([...wakes.live, ...wakes.orphaned].some((source) => source.pid === launch.launcherPid)) continue
    const result = results.get(launch.launcherPid)
    if (!result || result.corrupt) results.set(launch.launcherPid, { ...launch, corrupt: true })
  }
  return [...results.values()]
}

export const runStatus = async ({ repoRoot = REPO_ROOT, sessionId = "", config, runner = runBounded, authenticate = githubEnvironment, now = Date.now() } = {}) => {
  const state = readRunState(repoRoot)
  if (!state) {
    const gitdir = gitDirectoryOf(repoRoot)
    const linked = dirname(gitdir).endsWith(`${join(".git", "worktrees")}`)
    return { status: "no run record", ...(linked ? { warning: "linked worktree has separate run state", mainCheckout: dirname(dirname(dirname(gitdir))) } : {}), nextActions: [] }
  }
  if (!sessionId) throw new Error("--session is required when a run exists")
  if (state.sessionId !== sessionId) return { status: "FOREIGN_SESSION", nextActions: [] }
  config ??= readOrchestratorConfig()
  const wakes = readWakeSourceStates(repoRoot)
  let launches = readLaunchResults(repoRoot).filter((launch) => !launch.sessionId || launch.sessionId === sessionId)
  const rows = [...new Map([...(Array.isArray(state.pullRequests) ? state.pullRequests : []), ...(Array.isArray(state.readinessLedger) ? state.readinessLedger : [])]
    .filter((row) => typeof row?.repositoryKey === "string" && Number.isInteger(row.prNumber) && row.prNumber > 0 && typeof row.receiptPath === "string")
    .map((row) => [`${row.repositoryKey}#${row.prNumber}`, row])).values()]
  const liveRows = rows.filter((row) => !(typeof row.merged === "string" && /^[0-9a-f]{7,40}$/.test(row.merged)))
  const owner = repositorySlug(repoRoot).split("/")[0]
  const repositories = repositoryTargets({ config, rows: liveRows, owner, authenticate })
  launches = recoverLaunchResults({ repositories, wakes, launches, sessionId })
  let budget = null
  try {
    const auth = await repositories[0].auth
    const limits = await githubRead(["api", "rate_limit"], auth, runner)
    budget = graphqlBudgetDecision(limits.resources.graphql, { nowSeconds: now / 1000 })
  } catch { /* The shared budget rule attempts the query when its budget could not be read. */ }
  const snapshots = await Promise.all(repositories.map((repository) => readRepository({ ...repository, budget: repository.slug.startsWith(`${repositories[0].slug.split("/")[0]}/`) ? budget : null, runner, now })))
  const observations = []
  const settledPullRequests = {}
  const nextActions = []
  for (const row of rows) {
    if (!liveRows.includes(row)) {
      settledPullRequests[row.repositoryKey] ??= []
      settledPullRequests[row.repositoryKey].push(row.prNumber)
      continue
    }
    const snapshot = snapshots.find((entry) => entry.repositoryKey === row.repositoryKey)
    if (!snapshot || snapshot.status !== "OK") {
      observations.push({ repositoryKey: row.repositoryKey, prNumber: row.prNumber, status: snapshot?.status ?? "UNREADABLE" })
      continue
    }
    const pull = snapshot.pulls[`pr${row.prNumber}`]
    const worktree = row.worktree ?? repositories.find((entry) => entry.key === row.repositoryKey)?.worktrees.get(pull?.headRefName)
    const observed = observePull({ ...row, worktree, commandRoot: repoRoot }, pull, launches, wakes)
    observations.push(observed.observation)
    nextActions.push(...observed.actions)
  }
  for (const launch of launches) {
    if (snapshots.find((entry) => entry.repositoryKey === launch.repositoryKey)?.status === "OK" && launch.sessionId === sessionId && launch.issue && launch.runDirectory && launch.branch &&
        !rows.some((row) => row.repositoryKey === launch.repositoryKey && snapshots.find((entry) => entry.repositoryKey === row.repositoryKey)?.pulls[`pr${row.prNumber}`]?.headRefName === launch.branch || (row.repositoryKey === launch.repositoryKey && row.branch === launch.branch))) {
      nextActions.push(action("VERIFY_DELIVERY", `node tools/verify-delivery.mjs --repo ${quote(launch.repositoryKey)} --issue ${quote(launch.issue)} --worktree ${quote(launch.runDirectory)} --branch ${quote(launch.branch)}`, { launcherPid: launch.launcherPid }))
    }
  }
  for (const source of wakes.orphaned) {
    const inspection = typeof source.logFile === "string"
      ? `node -e ${quote(`process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(source.logFile)},"utf8").slice(-8192))`)}`
      : `node -e ${quote(`process.kill(${source.workerPid},0)` )}`
    nextActions.push(action("ORPHANED_WORKER", inspection, { workerPid: source.workerPid }))
  }
  const counts = readAdmissionCounts({ repoRoot, snapshots: snapshots.map((entry, index) => ({ ...entry, slug: repositories[index].slug })), limits: config.caps, now })
  if (state.remaining?.length > 0 && counts.slotFree && wakes.orphaned.length === 0 && wakes.live.filter((source) => source.workerPid || (source.pending === true && source.what?.startsWith("worker "))).length < config.caps.parallelTickets) {
    nextActions.push(action("SLOT_FREE", `node tools/plan-queue.mjs --tickets ${quote(state.remaining.join(","))}${state.sleep ? " --sleep" : ""}`))
  }
  const unsettled = rows.find((row) => observations.some((entry) => entry.repositoryKey === row.repositoryKey && entry.prNumber === row.prNumber && !["CLOSED", "MERGED"].includes(entry.status)))
  if (nextActions.length === 0) nextActions.push(action("NO_ACTION", wakes.live.length > 0 || !unsettled
    ? `node tools/run-status.mjs --session ${quote(sessionId)}` : waitCommand(unsettled)))
  return { status: "CURRENT_SESSION", commandDirectory: repoRoot, settledPullRequests, wakeSources: { live: wakes.live.map(({ pid, workerPid, repositoryKey, prNumbers, what }) => ({ pid, workerPid, repositoryKey, prNumbers, what })), orphaned: wakes.orphaned.map(({ pid, workerPid }) => ({ pid, workerPid })) },
    launcherResults: launches.map(({ launcherPid, repositoryKey, issue, outcome, exitCode, corrupt }) => ({ launcherPid, repositoryKey, issue, outcome, exitCode, corrupt })),
    admission: counts, repositories: snapshots.map(({ repositoryKey, status, openPullRequests, queuedRuns, error }) => ({ repositoryKey, status, openPullRequests, queuedRuns, error })), pullRequests: observations, nextActions }
}

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); return }
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--session" || !args[1] || args[1].startsWith("-"))) throw new Error(USAGE)
  console.log(JSON.stringify(await runStatus({ sessionId: args[1] ?? "" })))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(redactSecrets(error.message)); process.exitCode = 2 })
}
