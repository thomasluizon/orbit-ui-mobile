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
import { currentBaseShaOf, findRegisteredCheck, newestChecks, readinessCiIsGreen, readinessReport, requiredChecksOf, reviewChecksFor, rollupFromGraphQlNodes, PASSING_CONCLUSIONS, REVIEW_APP_CONTEXT, REVIEW_APP_ID } from "./lib/readiness-receipt.mjs"
import { gitDirectoryOf, REPO_ROOT, readRunState, readWakeSourceStates, readWorkerLaunches, workerLaunchDirectory } from "./lib/run-state.mjs"
import { parseWorktreeList } from "./lib/git-worktrees.mjs"
import { listOpenTickets, readComments } from "./lib/github-issues.mjs"
import { readIntake } from "./lib/auto-work-intake.mjs"
import { latestRunNote } from "./lib/run-notes.mjs"
import { readinessReceiptPath } from "./lib/readiness-receipt.mjs"

const USAGE = `usage: run-status.mjs [--session <id>]

Reads the owning checkout's run, wake sources, launcher results, receipts and GitHub board.
With no run record in the checkout (a fresh clone, another computer, or after a reboot), it rebuilds the
run from GitHub alone and prints status COLD_START: the board queue, every open ticket pull request
with its next step, the latest round note and review of each in-flight ticket, and the intake marks.
A pull request with no worktree here gets CREATE_WORKTREE before the delivery command that needs one:
its command prints the new worktree path, which is $WORKTREE, and its "then" command checks out the head.
Prints one compact JSON object with observations and exact next commands. No verdict is decided.
A foreign session has no actions. A linked worktree names the main checkout without reading its run.
The wake-source reader removes registrations only when both recorded processes are dead.
One GraphQL read per eight pull requests and one queued-runs REST read per repository, in parallel,
plus one REST rate_limit read. The open pull requests of the repository owner outside the run cost
one more round of GraphQL reads, only when one exists.
MERGE_NOW, UPDATE_BRANCH and RETARGET come first. They come from GitHub alone: no receipt or run row decides them.
MERGE_NOW names the squash merge of the exact head into the default branch: every check green with
every required check present, pullfrog-approval SUCCESS, zero unresolved threads, behind_by 0 and a
clean merge state. UPDATE_BRANCH names the branch update when only behind_by fails.
RETARGET names the base change to the default branch, then the branch update that pushes a head.
It is for a pull request whose checks, review check and threads hold and whose base is the head
branch of a pull request that GitHub shows as merged or closed, and of no open one. A base that was
never the head of a pull request, such as an integration branch, gets no action. A merge conflict gets
no MERGE_NOW and no UPDATE_BRANCH. A draft and a pull request whose base is the head of an open pull
request get none of the three. Only a pull request on the default branch gets MERGE_NOW or UPDATE_BRANCH.
When such a base is found, one more GraphQL read asks for the merged or closed pull requests of those
head branches.
RECORD_MERGE names the write of the merge sha when GitHub shows a pull request of the run as MERGED and
its ledger row has no sha.
Errors are redacted; tokens are scoped to child environments; pull request bodies are never read.
Active auto-work wakes append INTAKE after in-flight actions, including with an empty queue.
Ordinary sleep keeps NO_ACTION; a pending relay drain suppresses intake.

  --session <id>  current orchestrating session id (required when a run exists; unused for a cold start)
  --help, -h     print this usage and exit 0

exit codes: 0 snapshot (including absent, foreign or unreadable runs), 2 usage or environment error`

/** One read for the merged or closed pull requests whose head branch is each named base. */
export const retiredBasesQuery = (bases) => `query RetiredBases($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ${bases.map((base, index) => `b${index}: pullRequests(headRefName: ${JSON.stringify(base)}, states: [MERGED, CLOSED], first: 1) { totalCount }`).join("\n    ")}
  }
}`

export const statusQuery = (numbers) => `query RunStatus($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    pullRequests(states: OPEN, first: 100) { totalCount nodes { number headRefName author { login } } }
    ${numbers.map((number) => `pr${number}: pullRequest(number: ${number}) {
      number state isDraft headRefName headRefOid baseRefName baseRefOid mergeStateStatus
      mergeCommit { oid }
      baseRef { name target { __typename oid }
        compare(headRef: "refs/pull/${number}/head") { behindBy baseTarget { oid } headTarget { oid } }
        branchProtectionRule { requiredStatusChecks { context app { databaseId } } } }
      statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes {
        __typename
        ... on CheckRun { databaseId name status conclusion startedAt checkSuite { app { databaseId } } }
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
// One read of sixteen pull requests takes about the 3.5 s bound of `githubRead`; a read of eight takes about 2.5 s.
const PULLS_PER_READ = 8
const basesToRetire = (pulls, { openBranches, defaultBranch }) => [...new Set(pulls.filter((pull) => pull?.state === "OPEN" && typeof pull.baseRefName === "string" &&
  defaultBranch !== null && pull.baseRefName !== defaultBranch && !openBranches.includes(pull.baseRefName)).map((pull) => pull.baseRefName))]
const READY_ACTIONS = ["MERGE_NOW", "UPDATE_BRANCH", "RETARGET"]
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
  (pull.state !== "OPEN" || currentBaseShaOf(pull) !== null) &&
  Array.isArray(pull.reviews?.nodes) && pull.reviews.nodes.every((review) => review && typeof review.state === "string" && typeof review.submittedAt === "string") && typeof pull.reviews.pageInfo?.hasPreviousPage === "boolean" &&
  Array.isArray(pull.reviewThreads?.nodes) && typeof pull.reviewThreads.pageInfo?.hasNextPage === "boolean" &&
  pull.reviewThreads.nodes.every((thread) => thread && typeof thread.isResolved === "boolean" && Array.isArray(thread.comments?.nodes)) &&
  (pull.statusCheckRollup === null || (Array.isArray(pull.statusCheckRollup?.contexts?.nodes) && pull.statusCheckRollup.contexts.nodes.every((check) => check.__typename === "CheckRun" ? typeof check.name === "string" && typeof check.status === "string" : check.__typename === "StatusContext" && typeof check.context === "string" && typeof check.state === "string") && typeof pull.statusCheckRollup.contexts.pageInfo?.hasNextPage === "boolean"))

/** What the merge bar reads from one repository snapshot. Every caller of `observePull` and `mergeBarOf` takes it from here, so one cannot omit a field. */
const mergeBarContext = (repository, snapshot) => ({ slug: repository.slug, openBranches: snapshot.openBranches, defaultBranch: snapshot.defaultBranch, retiredBases: snapshot.retiredBases })

/**
 * The merge bar of one open pull request, from the GitHub response alone. A fact that the response
 * does not confirm yields no action. A base that is the head of a merged or closed pull request gets
 * the retarget, and any other base but the default branch gets no action.
 */
const mergeBarOf = (pull, { repositoryKey, slug, openBranches, defaultBranch, retiredBases = [] }) => {
  const comparison = pull.baseRef?.compare
  const behindBy = comparison?.headTarget?.oid === pull.headRefOid && comparison?.baseTarget?.oid === currentBaseShaOf(pull) &&
    Number.isInteger(comparison.behindBy) ? comparison.behindBy : null
  const rollup = rollupFromGraphQlNodes(pull.statusCheckRollup?.contexts?.nodes ?? [])
  const newest = newestChecks(rollup)
  const reviewCheck = newest && findRegisteredCheck(newest, { context: REVIEW_APP_CONTEXT, appId: REVIEW_APP_ID })
  const approval = reviewCheck ? reviewCheck.conclusion ?? reviewCheck.status : null
  const required = requiredChecksOf({ checks: (pull.baseRef?.branchProtectionRule?.requiredStatusChecks ?? [])
    .map((check) => ({ context: check?.context, app_id: check?.app?.databaseId ?? null })) })
  const restHolds = pull.state === "OPEN" && !pull.isDraft && /^[0-9a-f]{40}$/.test(pull.headRefOid) && defaultBranch !== null && (pull.baseRefName === defaultBranch || !openBranches.includes(pull.baseRefName)) &&
    approval === "SUCCESS" && required !== null && readinessCiIsGreen(rollup, reviewChecksFor(required)) &&
    pull.statusCheckRollup.contexts.pageInfo?.hasNextPage === false && pull.reviewThreads.pageInfo.hasNextPage === false &&
    pull.reviewThreads.nodes.every((thread) => thread.isResolved)
  const mergeable = ["CLEAN", "HAS_HOOKS"].includes(pull.mergeStateStatus)
  const identity = { repositoryKey, prNumber: pull.number }
  if (restHolds && pull.baseRefName !== defaultBranch) {
    if (!retiredBases.includes(pull.baseRefName)) return { behindBy, approval, action: null }
    // A base change starts no check, and a squash merge leaves the child behind the default branch, so the update that pushes a head follows it.
    return { behindBy, approval, action: action("RETARGET", `gh pr edit ${pull.number} --repo ${quote(slug)} --base ${quote(defaultBranch)} && gh pr update-branch ${pull.number} --repo ${quote(slug)}`, identity) }
  }
  if (restHolds && behindBy === 0 && mergeable) {
    return { behindBy, approval, action: action("MERGE_NOW", `gh pr merge ${pull.number} --repo ${quote(slug)} --squash --match-head-commit ${pull.headRefOid}`, identity) }
  }
  if (restHolds && behindBy > 0 && (mergeable || pull.mergeStateStatus === "BEHIND")) {
    return { behindBy, approval, action: action("UPDATE_BRANCH", `gh pr update-branch ${pull.number} --repo ${quote(slug)}`, identity) }
  }
  return { behindBy, approval, action: null }
}

const deliveryIsCurrent = (row, pull, rejectedFingerprint) => {
  const delivery = readJson(row.deliveryPath ?? `${row.receiptPath}.delivery.json`)
  const state = delivery?.checks?.pullRequestState
  const ci = delivery?.checks?.ci
  return delivery?.checks?.prCount?.number === row.prNumber && state?.headSha === pull.headRefOid &&
    state?.baseSha === currentBaseShaOf(pull) && state?.baseBranch === pull.baseRefName &&
    ci?.pass === true && Array.isArray(ci.pending) && ci.pending.length === 0 &&
    Array.isArray(ci.failing) && ci.failing.length === 0 && typeof ci.registrationFingerprint === "string" &&
    ci.registrationFingerprint !== rejectedFingerprint
}

const observePull = (row, pull, launches, wakes) => {
  const identity = { repositoryKey: row.repositoryKey, prNumber: row.prNumber }
  if (!validPull(pull, row.prNumber)) return { observation: { ...identity, status: "UNREADABLE" }, actions: [] }
  const currentBaseSha = currentBaseShaOf(pull)
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
    : receipt.currentHeadSha !== pull.headRefOid || receipt.currentBaseSha !== currentBaseSha ? "RECEIPT_STALE" : "CURRENT"
  const receiptVerdict = receipt ? readinessReport(receipt).verdict : null
  const receiptCiCurrent = receiptStatus === "CURRENT" && !readinessReport(receipt).verdicts.includes("CI_STALE")
  // A CI_STALE receipt rejects the artifact it evaluated; refreshed evidence can still advance.
  const rejectedFingerprint = receiptStatus === "CURRENT" && !receiptCiCurrent ? receipt.ci?.checks?.registrationFingerprint : null
  const currentDelivery = deliveryIsCurrent(row, pull, rejectedFingerprint)
  const bar = mergeBarOf(pull, row)
  const observation = { ...identity, status: pull.state, draft: pull.isDraft, head: pull.headRefOid, base: currentBaseSha,
    baseBranch: pull.baseRefName, mergeStateStatus: pull.mergeStateStatus, behindBy: bar.behindBy, approval: bar.approval, checks,
    review: review ? { state: review.state, submittedAt: review.submittedAt } : null,
    unresolved: pull.reviewThreads.pageInfo.hasNextPage ? null : unresolved, ...(complete ? {} : { complete: false }), receipt: receiptStatus, ...(receiptStatus === "MISSING_OR_CORRUPT" ? {} : { receiptVerdict }) }
  const actions = []
  const add = (type, command) => actions.push(action(type, command, identity))
  if (pull.state === "MERGED") {
    // A merge from another session leaves the run row without its sha, and the stop hook waits for that sha.
    const sha = pull.mergeCommit?.oid
    return { observation, actions: /^[0-9a-f]{40}$/.test(sha ?? "") ? [action("RECORD_MERGE", `node tools/record-merge.mjs --repo ${quote(row.repositoryKey)} --pr ${row.prNumber} --sha ${sha}`, identity)] : [] }
  }
  if (pull.state !== "OPEN") return { observation, actions }
  if (bar.action) return { observation, actions: [bar.action] }
  if (unresolved > 0 || review?.state === "CHANGES_REQUESTED" || review?.state === "COMMENTED") {
    add("READ_REVIEW", reviewCommand(row))
    return { observation, actions }
  }
  if (!complete) return { observation, actions }
  if (pull.mergeStateStatus === "BEHIND") add("BEHIND_BASE", deliveryCommand(row, pull, launch, receipt))
  else if (checks.failed > 0) add("CHECK_FAILED", deliveryCommand(row, pull, launch, receipt))
  else if (receiptStatus !== "CURRENT" && !currentDelivery) add("VERIFY_DELIVERY", deliveryCommand(row, pull, launch, receipt))
  else if (checks.total === 0 || checks.pending > 0 || !review) {
    // The snapshot never posts a review request: the session that pushes asks, after its local review.
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
  if (result.status !== 0) return new Map()
  return new Map(parseWorktreeList(result.stdout).filter((worktree) => worktree.branch !== null).map((worktree) => [worktree.branch, worktree.path]))
}

const githubRead = async (args, auth, runner) => {
  const result = await runner(process.env.GH_BIN || "gh", args, { env: auth.environment, timeoutMs: 3500, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || result.timedOut || result.overflowed || result.status !== 0) throw new Error(redactSecrets(result.stderr || result.error?.message || (result.timedOut ? "GitHub read timed out" : `exit ${result.status}`), auth.secrets))
  let response
  try { response = JSON.parse(result.stdout) } catch (error) { throw new Error(redactSecrets(error.message, auth.secrets)) }
  if (response.errors) throw new Error(redactSecrets(JSON.stringify(response.errors), auth.secrets))
  return response
}

/** The repository fields of every named pull request, merged from parallel reads of `PULLS_PER_READ`. */
const readPulls = async (numbers, slug, authentication, runner) => {
  const [owner, name] = slug.split("/")
  const reads = Array.from({ length: Math.max(1, Math.ceil(numbers.length / PULLS_PER_READ)) }, (_, index) => numbers.slice(index * PULLS_PER_READ, (index + 1) * PULLS_PER_READ))
  const responses = await Promise.all(reads.map((read) => githubRead(["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-f", `query=${statusQuery(read)}`], authentication, runner)))
  if (responses.some((response) => !response?.data?.repository)) return null
  return Object.assign({}, ...responses.map((response) => response.data.repository))
}

const readRepository = async ({ key, slug, rows, auth, budget, runner, now }) => {
  const [owner, name] = slug.split("/")
  const snapshot = { repositoryKey: key, status: "OK", openPullRequests: null, queuedRuns: null, defaultBranch: null, openBranches: [], pulls: {}, ownerPulls: [], retiredBases: [] }
  try {
    const authentication = await auth
    const limited = budget?.action === "wait"
    const reads = await Promise.allSettled([
      limited ? Promise.resolve(null) : readPulls(rows.map((row) => row.prNumber), slug, authentication, runner),
      githubRead(["api", queuedRunsPath(slug, now)], authentication, runner),
    ])
    if (reads[1].status === "fulfilled" && Number.isInteger(reads[1].value?.total_count) && reads[1].value.total_count >= 0) snapshot.queuedRuns = reads[1].value.total_count
    if (reads[0].status === "rejected") throw reads[0].reason
    if (limited) snapshot.status = "RATE_LIMITED"
    else {
      const repository = reads[0].value
      if (!repository || !Number.isInteger(repository.pullRequests?.totalCount) || repository.pullRequests.totalCount < 0 || !Array.isArray(repository.pullRequests.nodes) || repository.pullRequests.nodes.some((pull) => typeof pull.headRefName !== "string")) throw new Error("repository response did not contain the recorded shape")
      snapshot.openPullRequests = repository.pullRequests.totalCount
      snapshot.openBranches = repository.pullRequests.nodes.map((pull) => pull.headRefName)
      if (typeof repository.defaultBranchRef?.name === "string") snapshot.defaultBranch = repository.defaultBranchRef.name
      snapshot.pulls = repository
      const outsideRun = repository.pullRequests.nodes.filter((pull) => Number.isInteger(pull.number) && !rows.some((row) => row.prNumber === pull.number) &&
        pull.author?.login?.toLowerCase() === slug.split("/")[0].toLowerCase()).map((pull) => pull.number)
      try {
        const owned = outsideRun.length > 0 ? await readPulls(outsideRun, slug, authentication, runner) : null
        snapshot.ownerPulls = outsideRun.map((number) => owned?.[`pr${number}`]).filter((pull, index) => validPull(pull, outsideRun[index]))
        const bases = basesToRetire([...rows.map((row) => repository[`pr${row.prNumber}`]), ...snapshot.ownerPulls], snapshot)
        if (bases.length > 0) {
          const retired = (await githubRead(["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-f", `query=${retiredBasesQuery(bases)}`], authentication, runner)).data?.repository
          snapshot.retiredBases = bases.filter((base, index) => retired?.[`b${index}`]?.totalCount > 0)
        }
      } catch (error) {
        snapshot.error = error.message.slice(0, 256)
      }
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

/** The delivery actions that run inside the pull request's worktree. */
const WORKTREE_ACTIONS = new Set(["BEHIND_BASE", "CHECK_FAILED", "VERIFY_DELIVERY"])
/**
 * A new computer has no worktree for an open pull request. The fetch makes the local head branch that the
 * wrapper's base check reads; `then` checks the head branch out in the path the wrapper prints as $WORKTREE.
 */
const createWorktreeAction = (row, pull, repositoryPath) => ({
  ...action("CREATE_WORKTREE", `git -C ${quote(repositoryPath)} fetch origin ${quote(`${pull.headRefName}:${pull.headRefName}`)} && node tools/create-worktree.mjs --repo ${quote(`path:${repositoryPath}`)} --name ${quote(`${row.repositoryKey}-pr-${row.prNumber}`)} --base-branch ${quote(pull.headRefName)} --issue ${row.issue.slice(1)} --no-parent --comment ${quote(`cold start of ${row.repositoryKey}#${row.prNumber}`)} --json`,
    { repositoryKey: row.repositoryKey, prNumber: row.prNumber }),
  then: `git -C "$WORKTREE" switch ${quote(pull.headRefName)}`,
})
const ticketOfBranch = (branch) => /ticket-(\d+)/.exec(branch)?.[1] ?? null
const noteSummary = (note) => note && { ...note.note, createdAt: note.createdAt, author: note.author }
const sourceSummary = (source) => ({ pending: Object.keys(source?.pending ?? {}).length, completed: Object.keys(source?.completed ?? {}).length,
  highWater: source?.highWater ?? null })

/**
 * A run rebuilt from GitHub alone: no run record, scratchpad or receipt is read as the record. Readiness is
 * recomputed from each pull request's checks, review and threads at its exact head, so a missing receipt only
 * names the verify-delivery command that writes a fresh one.
 */
const coldStart = async ({ repoRoot, config, runner, authenticate, now, reads }) => {
  const owner = repositorySlug(repoRoot).split("/")[0]
  const [repositories, board, intake] = await Promise.all([
    Promise.resolve(repositoryTargets({ config, rows: [], owner, authenticate })),
    reads.listTickets().then((tickets) => ({ tickets }), (error) => ({ error: redactSecrets(error.message).slice(0, 256) })),
    Promise.resolve().then(() => reads.readIntakeMarks(repoRoot)).then((marks) => ({ marks }), (error) => ({ error: redactSecrets(error.message).slice(0, 256) })),
  ])
  const listed = await Promise.all(repositories.map((repository) => readRepository({ ...repository, rows: [], budget: null, runner, now })))
  const rows = listed.flatMap((snapshot, index) => (snapshot.pulls.pullRequests?.nodes ?? [])
    .filter((pull) => Number.isInteger(pull.number) && ticketOfBranch(pull.headRefName))
    .map((pull) => ({ repositoryKey: repositories[index].key, prNumber: pull.number, issue: `#${ticketOfBranch(pull.headRefName)}`,
      receiptPath: readinessReceiptPath(repoRoot, repositories[index].key, pull.number) })))
  const snapshots = await Promise.all(repositories.map((repository) => readRepository({ ...repository, rows: rows.filter((row) => row.repositoryKey === repository.key), budget: null, runner, now })))
  const wakes = { live: [], orphaned: [] }
  const pullRequests = []
  const nextActions = []
  for (const row of rows) {
    const snapshot = snapshots.find((entry) => entry.repositoryKey === row.repositoryKey)
    if (snapshot?.status !== "OK") {
      pullRequests.push({ repositoryKey: row.repositoryKey, prNumber: row.prNumber, issue: row.issue, status: snapshot?.status ?? "UNREADABLE" })
      continue
    }
    const pull = snapshot.pulls[`pr${row.prNumber}`]
    const repository = repositories.find((entry) => entry.key === row.repositoryKey)
    const worktree = repository.worktrees.get(pull?.headRefName)
    const observed = observePull({ ...row, worktree, commandRoot: repoRoot, ...mergeBarContext(repository, snapshot) }, pull, [], wakes)
    pullRequests.push({ ...observed.observation, issue: row.issue })
    if (!worktree && observed.actions.some((entry) => WORKTREE_ACTIONS.has(entry.type))) nextActions.push(createWorktreeAction(row, pull, repository.path))
    nextActions.push(...observed.actions)
  }
  const inFlight = [...new Set([...rows.map((row) => Number(row.issue.slice(1))),
    ...(board.tickets ?? []).filter((ticket) => ["In Progress", "In Review"].includes(ticket.status)).map((ticket) => ticket.number)])].sort((left, right) => left - right)
  const tickets = await Promise.all(inFlight.map(async (number) => {
    try {
      const comments = await reads.readTicketComments(number)
      return { ticket: `#${number}`, latestRoundNote: noteSummary(latestRunNote(comments, "round-note")), latestReview: noteSummary(latestRunNote(comments, "review")),
        latestReport: noteSummary(latestRunNote(comments, "report")) }
    } catch (error) {
      return { ticket: `#${number}`, error: redactSecrets(error.message).slice(0, 256) }
    }
  }))
  const queue = board.tickets?.filter((ticket) => ticket.status !== null && !["Done", "Canceled", "Duplicate"].includes(ticket.status))
    .map(({ number, title, status }) => ({ ticket: `#${number}`, title, status }))
  if (queue?.some((ticket) => ["Todo", "Backlog"].includes(ticket.status))) nextActions.push(action("PLAN_QUEUE", "node tools/plan-queue.mjs --board --sleep"))
  if (nextActions.length === 0) nextActions.push(action("NO_ACTION", "node tools/run-status.mjs"))
  const marks = intake.marks
  return { status: "COLD_START", commandDirectory: repoRoot,
    repositories: snapshots.map(({ repositoryKey, status, openPullRequests, error }) => ({ repositoryKey, status, openPullRequests, error })),
    queue: queue ?? { error: board.error }, pullRequests, tickets,
    intake: marks ? { ...Object.fromEntries(["gmail", "play", "appStore"].map((source) => [source, sourceSummary(marks[source])])),
      wake: { seen: Object.fromEntries(Object.entries(marks.wake?.seen ?? {}).map(([source, keys]) => [source, keys.length])), sentryListedAt: marks.wake?.sentryListedAt ?? null } }
      : { error: intake.error },
    nextActions }
}

const GITHUB_READS = { listTickets: () => listOpenTickets(), readTicketComments: (number) => readComments(number), readIntakeMarks: (repoRoot) => readIntake(repoRoot) }

export const runStatus = async ({ repoRoot = REPO_ROOT, sessionId = "", config, runner = runBounded, authenticate = githubEnvironment, now = Date.now(), reads = GITHUB_READS } = {}) => {
  const state = readRunState(repoRoot)
  if (!state) {
    const gitdir = gitDirectoryOf(repoRoot)
    const linked = dirname(gitdir).endsWith(`${join(".git", "worktrees")}`)
    if (linked) return { status: "no run record", warning: "linked worktree has separate run state", mainCheckout: dirname(dirname(dirname(gitdir))), nextActions: [] }
    return coldStart({ repoRoot, config: config ?? readOrchestratorConfig(), runner, authenticate, now, reads })
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
    const repository = repositories.find((entry) => entry.key === row.repositoryKey)
    const worktree = row.worktree ?? repository.worktrees.get(pull?.headRefName)
    const observed = observePull({ ...row, worktree, commandRoot: repoRoot, ...mergeBarContext(repository, snapshot) }, pull, launches, wakes)
    observations.push(observed.observation)
    nextActions.push(...observed.actions)
  }
  for (const [index, snapshot] of snapshots.entries()) {
    for (const pull of snapshot.ownerPulls) {
      const bar = mergeBarOf(pull, { repositoryKey: snapshot.repositoryKey, ...mergeBarContext(repositories[index], snapshot) })
      if (bar.action) nextActions.push(bar.action)
    }
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
  if (state.remaining?.length > 0 && counts.slotFree && wakes.orphaned.filter((source) => source.research !== true).length === 0 && wakes.live.filter((source) => source.research !== true && (source.workerPid || (source.pending === true && source.what?.startsWith("worker ")))).length < config.caps.parallelTickets) {
    nextActions.push(action("SLOT_FREE", `node tools/plan-queue.mjs --tickets ${quote(state.remaining.join(","))}${state.sleep ? " --sleep" : ""}`))
  }
  const unsettled = rows.find((row) => observations.some((entry) => entry.repositoryKey === row.repositoryKey && entry.prNumber === row.prNumber && !["CLOSED", "MERGED"].includes(entry.status)))
  if (state.autoWork === true && state.sleep === true && state.relay?.pending !== true) nextActions.push(action("INTAKE", "/auto-work"))
  const rank = (entry) => (READY_ACTIONS.includes(entry.type) ? READY_ACTIONS.indexOf(entry.type) : READY_ACTIONS.length)
  nextActions.sort((left, right) => rank(left) - rank(right))
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
