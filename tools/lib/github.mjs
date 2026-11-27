/** The driver's one GitHub adapter: reads of pull request and ticket state, the merge bar, and every write the driver makes. */

import { runBounded } from "./bounded-process.mjs"
import { readDriveConfig } from "./config.mjs"
import { escapeRegex } from "./escape-regex.mjs"
import { repositorySlug } from "./github-auth.mjs"
import { readRequiredChecksAt } from "./github-read.mjs"

const COMMAND_TIMEOUT_MS = 30000
const COMMAND_MAX_BUFFER = 32 * 1024 * 1024
const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"])
const PULLFROG_APPROVAL = { context: "pullfrog-approval", appId: 1768019 }
/** The merge bar failure that only a Pullfrog pass at the head clears: the required check exists only on a commit that Pullfrog reviewed. */
export const APPROVAL_CHECK_MISSING = `required-check-missing:${PULLFROG_APPROVAL.context}`
/** A state query with every open pull request of a large repository ends in HTTP 502 or 504 at GitHub, so each query holds this many at most. */
const PULLS_PER_STATE_QUERY = 8
const WHOLE_DIFF_FILES = 30
const WHOLE_DIFF_WINDOW_BYTES = 200
const MANIFEST_FILE = /(?:^|\/)(?:package\.json|package-lock\.json|Cargo\.toml|Cargo\.lock|Directory\.Packages\.props|packages\.lock\.json|[^/]+\.csproj)$/
const MARKER = /^<!-- orbit-drive:([a-z-]+) -->/
const SHA = /^[0-9a-f]{40}$/
const BARRIER_CHECK = "Guard Migrations"
const BARRIER_STEP = "Require deployment barriers for schema contractions"
const SETUP_STEP = "Set up job"
/** The checks that read only the pull request, so a rerun at the same head, text and labels gives the same result. */
const DETERMINISTIC_CHECKS = new Set(["PR Metadata", "Guards"])
/** The default name of a checkout step, or the name that `guards.yml` gives it. The post step is no checkout. */
const CHECKOUT_STEP = /^(?:Run actions\/checkout@\S+|Checkout)$/
/** The `test.yml` steps that read the result of a needed job. A failure there comes from that job, so it is no flake. */
const GATE_STEPS = new Set(["Require the plan", "Require every test job or its cached result", "Require the build and every shard"])
const OWNER_LABEL = "needs:owner"
const LINTABLE_PATH = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/
/**
 * The check that holds the lint of the pull requests of each repository: the `Checks` job of ui, whose step lints the changed files.
 * A repository that is absent has no lint check that could turn green, so the bar asks for none there.
 */
const LINT_CHECK_BY_REPOSITORY = { ui: "Checks" }
/** The name of the lint check of a repository, or null when the repository has none. */
export const lintCheckOf = (repositoryKey) => LINT_CHECK_BY_REPOSITORY[repositoryKey] ?? null
/** The merge bar failures that no worker order clears, so the driver hands them to the owner. */
export const OWNER_BAR_FAILURES = new Set(["diff-unknown", "lint-missing", "closing-keyword"])

const PULL_FIELDS = `number state isDraft headRefName headRefOid baseRefName baseRefOid mergeStateStatus body changedFiles
  author { login }
  labels(first: 50) { nodes { name } }
  mergeCommit { oid }
  commits(last: 100) { nodes { commit { oid parents(first: 3) { totalCount } statusCheckRollup { state } } } }
  baseRef { name
    branchProtectionRule { requiredStatusChecks { context app { databaseId } } } }
  statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes {
    __typename
    ... on CheckRun { databaseId name status conclusion startedAt detailsUrl checkSuite { app { databaseId } } }
    ... on StatusContext { context state createdAt }
  } } }
  reviews(last: 100, author: "pullfrog[bot]") { pageInfo { hasPreviousPage } nodes {
    state submittedAt body author { login } commit { oid }
    comments(first: 50) { nodes { body path line } }
  } }
  reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { id isResolved comments(first: 1) { nodes { author { login } } } } }
  comments(last: 100) { nodes { id body createdAt author { login } } }`

const stateQuery = (numbers) => `query DriveState($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    open: pullRequests(states: OPEN, first: 100) { pageInfo { hasNextPage } nodes { number } }
    ${numbers.map((number) => `pr${number}: pullRequest(number: ${number}) { ${PULL_FIELDS} }`).join("\n    ")}
  }
}`

/** A ticket page costs one point for each 100 nested reads, and the blockers are most of them, so the page reads this many blockers of a ticket. A ticket with that many reads all of its blockers in one more query. */
const BLOCKERS_PER_PAGE = 20
const ALL_BLOCKERS = 100
const BLOCKER_FIELDS = "number state labels(first: 50) { nodes { name } }"

const TICKETS_QUERY = `query DriveTickets($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 50, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body
        labels(first: 50) { nodes { name } }
        blockedBy(first: ${BLOCKERS_PER_PAGE}) { nodes { ${BLOCKER_FIELDS} } }
        comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { id url body createdAt author { login } } }
      }
    }
  }
}`

const MORE_COMMENTS_QUERY = `query DriveComments($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { comments(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id url body createdAt author { login } } } }
  }
}`

const ALL_BLOCKERS_QUERY = `query DriveBlockers($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { blockedBy(first: ${ALL_BLOCKERS}) { nodes { ${BLOCKER_FIELDS} } } }
  }
}`

const PROJECT_ITEMS_QUERY = `query DriveProjectItems($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { id projectItems(first: 10) { nodes { id project { id } } } }
  }
}`

const SET_STATUS_MUTATION = `mutation DriveStatus($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
}`

const ADD_ITEM_MUTATION = `mutation DriveAddItem($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`

const defaultRun = async (args, { input } = {}) => {
  const result = await runBounded(process.env.GH_BIN || "gh", args, { env: process.env, timeoutMs: COMMAND_TIMEOUT_MS, maxBuffer: COMMAND_MAX_BUFFER, input })
  const command = `gh ${args.join(" ")}`
  if (result.timedOut) throw new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms`)
  if (result.overflowed) throw new Error(`${command} exceeded ${COMMAND_MAX_BUFFER} bytes of output`)
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()}`)
  return result.stdout
}

/** One call's seams. `run` is the gh runner and `config` the driver configuration; a test passes both. */
let loadedConfig
const bind = ({ run = defaultRun, config = (loadedConfig ??= readDriveConfig()) } = {}) => ({
  run,
  config,
  slugOf: (key) => (key === "tickets" ? config.tickets.repository : repositorySlug(config.repos[key])),
})

const parseJson = (command, text) => {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${command} returned invalid JSON: ${error.message}`)
  }
}

const graphql = async (api, query, variables = {}) => {
  const args = ["api", "graphql", "-f", `query=${query}`]
  for (const [name, value] of Object.entries(variables)) args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`)
  const response = parseJson("gh api graphql", await api.run(args))
  if (response?.errors || !response?.data) throw new Error(`gh api graphql returned errors: ${JSON.stringify(response?.errors ?? response).slice(0, 500)}`)
  return response.data
}

const splitSlug = (slug) => {
  const [owner, name] = slug.split("/")
  return { owner, name }
}

const nodes = (connection) => connection?.nodes ?? []
const botLogin = (author) => (author?.login ?? "").replace(/\[bot\]$/, "")
const labelNames = (connection) => nodes(connection).map((label) => label.name)
const repoKeyOf = (labels) => {
  const keys = labels.filter((name) => name.startsWith("repo:")).map((name) => name.slice(5))
  return keys.length === 1 ? keys[0] : null
}

/** The ticket number of the line `Tracks <ticket repository>#<N>` in a pull request body, or null. */
const tracksOf = (body, ticketRepository) => {
  const match = new RegExp(`(?:^|\\s)Tracks ${escapeRegex(ticketRepository)}#(\\d+)(?!\\d)`).exec(body)
  return match ? Number(match[1]) : null
}

/**
 * The BLOCKING findings in the body of a review. A finding runs from a line that starts with `BLOCKING:` to the next such line,
 * a `## ` heading or the Pullfrog divider. Pullfrog writes a finding in the body when its file has no diff line, as a binary file
 * has none. A body finding has no path and no line.
 */
export const bodyFindings = (body) => {
  const findings = []
  let open = null
  for (const line of body.split("\n")) {
    if (line.startsWith("BLOCKING:")) {
      open = [line]
      findings.push(open)
    } else if (/^## |^<!-- PULLFROG_DIVIDER/.test(line)) open = null
    else open?.push(line)
  }
  return findings.map((lines) => ({ path: null, line: null, body: lines.join("\n").trim() }))
}

/**
 * True when the text holds GitHub's closing grammar for a ticket of the ticket repository: a close, fix or resolve word in any
 * case, an optional colon, white space, then `<repository>#N` or the issue URL, with nothing between. `Tracks <repository>#N` is no match.
 */
export const closesTicket = (text, ticketRepository) => {
  const repository = escapeRegex(ticketRepository)
  return new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\s+(?:${repository}#\\d+|https://github\\.com/${repository}/issues/\\d+)`, "i").test(text)
}

const normalizeComment = (comment) => ({
  id: comment.id,
  url: comment.url,
  author: comment.author?.login ?? null,
  body: comment.body,
  createdAt: comment.createdAt,
  kind: MARKER.exec(comment.body)?.[1] ?? null,
})

const normalizePull = (raw, ticketRepository) => {
  const protection = raw.baseRef?.branchProtectionRule
  return {
    number: raw.number,
    state: raw.state,
    draft: raw.isDraft,
    author: botLogin(raw.author),
    labels: labelNames(raw.labels),
    headRef: raw.headRefName,
    headSha: raw.headRefOid,
    baseRef: raw.baseRefName,
    baseSha: raw.baseRefOid,
    mergeState: raw.mergeStateStatus,
    body: raw.body ?? "",
    tracks: tracksOf(raw.body ?? "", ticketRepository),
    changedFiles: raw.changedFiles,
    // The driver sets `files` and `commitMessages` from git before it plans: the query reads no file list, which GitHub cuts at 100.
    files: null,
    commitMessages: null,
    ticketRepository,
    commits: nodes(raw.commits).map(({ commit }) => ({ sha: commit.oid, parents: commit.parents.totalCount, checkState: commit.statusCheckRollup?.state ?? null })),
    mergeCommit: raw.mergeCommit?.oid ?? null,
    checks: nodes(raw.statusCheckRollup?.contexts),
    checksComplete: raw.statusCheckRollup === null || raw.statusCheckRollup?.contexts?.pageInfo?.hasNextPage === false,
    requiredChecks: nodes({ nodes: protection?.requiredStatusChecks }).map((check) => ({ context: check.context, appId: check.app?.databaseId ?? null })),
    reviews: nodes(raw.reviews).map((review) => ({
      state: review.state,
      commit: review.commit?.oid ?? null,
      submittedAt: review.submittedAt,
      body: review.body ?? "",
      author: botLogin(review.author),
      blocking: [
        ...nodes(review.comments).filter((comment) => comment.body.startsWith("BLOCKING:")).map((comment) => ({ path: comment.path, line: comment.line, body: comment.body })),
        ...bodyFindings(review.body ?? ""),
      ],
    })),
    threads: nodes(raw.reviewThreads).map((thread) => ({ id: thread.id, resolved: thread.isResolved, author: botLogin(thread.comments?.nodes?.[0]?.author) })),
    threadsComplete: raw.reviewThreads?.pageInfo?.hasNextPage === false,
    comments: nodes(raw.comments).filter((comment) => MARKER.test(comment.body) || /@pullfrog review/.test(comment.body)).map(normalizeComment),
  }
}

/** True for a failure that GitHub gave because a rate limit holds: HTTP 403 or a rate limit message. A read again at once fails the same way. */
export const isRateLimited = (error) => /\bHTTP 403\b|rate limit/i.test(error?.message ?? "")

/** The read of one batch of pull requests. A failed read runs again once at half size: the two halves of the batch, or the same single pull request. A rate limit fails at once. */
const readBatch = async (numbers, read) => {
  try {
    return [await read(numbers)]
  } catch (error) {
    if (isRateLimited(error)) throw error
    const middle = Math.ceil(numbers.length / 2)
    const halves = numbers.length < 2 ? [numbers] : [numbers.slice(0, middle), numbers.slice(middle)]
    const reads = []
    for (const half of halves) reads.push(await read(half))
    return reads
  }
}

/**
 * Every open pull request of one repository. The first read lists the open numbers and holds the first `knownNumbers` of the last
 * tick. The other open numbers follow in batches, one after the other, so the reads add no burst on the rate limit. A failed batch
 * reads again once at half size. A batch that fails twice fails the whole call, so no caller gets a partial state.
 */
export const readRepositoryState = async (repositoryKey, { knownNumbers = [], ...seams } = {}) => {
  if (!knownNumbers.every((number) => Number.isInteger(number) && number > 0)) throw new Error("knownNumbers must be positive integers")
  const api = bind(seams)
  const slug = api.slugOf(repositoryKey)
  const { owner, name } = splitSlug(slug)
  const read = async (numbers) => (await graphql(api, stateQuery(numbers), { owner, name })).repository
  let firstNumbers = knownNumbers.slice(0, PULLS_PER_STATE_QUERY)
  let first
  try {
    first = await read(firstNumbers)
  } catch (error) {
    if (isRateLimited(error)) throw error
    // The numbers that the smaller read leaves out count as unread below, so the next batches read them.
    firstNumbers = firstNumbers.slice(0, Math.ceil(firstNumbers.length / 2))
    first = await read(firstNumbers)
  }
  if (first.open.pageInfo.hasNextPage) throw new Error(`${slug} has more than 100 open pull requests; the driver reads 100`)
  const open = first.open.nodes.map((pull) => pull.number)
  const unread = open.filter((number) => !firstNumbers.includes(number))
  const raw = { ...first }
  for (let start = 0; start < unread.length; start += PULLS_PER_STATE_QUERY) {
    for (const part of await readBatch(unread.slice(start, start + PULLS_PER_STATE_QUERY), read)) Object.assign(raw, part)
  }
  const pulls = open.map((number) => normalizePull(raw[`pr${number}`], api.config.tickets.repository))
  return { repositoryKey, slug, defaultBranch: first.defaultBranchRef.name, numbers: open, pulls }
}

const readMoreComments = async (api, number, after) => {
  const { owner, name } = splitSlug(api.config.tickets.repository)
  const comments = []
  for (let cursor = after; cursor !== null;) {
    const page = (await graphql(api, MORE_COMMENTS_QUERY, { owner, name, number, after: cursor })).repository.issue.comments
    comments.push(...page.nodes)
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  }
  return comments
}

const readAllBlockers = async (api, number) => {
  const { owner, name } = splitSlug(api.config.tickets.repository)
  return nodes((await graphql(api, ALL_BLOCKERS_QUERY, { owner, name, number })).repository.issue.blockedBy)
}

/** Every open ticket with its labels, blockers and comments. */
export const readTickets = async (seams = {}) => {
  const api = bind(seams)
  const { owner, name } = splitSlug(api.config.tickets.repository)
  const tickets = []
  for (let after = null; ;) {
    const page = (await graphql(api, TICKETS_QUERY, after === null ? { owner, name } : { owner, name, after })).repository.issues
    for (const issue of page.nodes) {
      const labels = labelNames(issue.labels)
      const more = issue.comments.pageInfo.hasNextPage ? await readMoreComments(api, issue.number, issue.comments.pageInfo.endCursor) : []
      const blockers = nodes(issue.blockedBy).length < BLOCKERS_PER_PAGE ? nodes(issue.blockedBy) : await readAllBlockers(api, issue.number)
      tickets.push({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? "",
        labels,
        repoKey: repoKeyOf(labels),
        blockedBy: blockers.map((blocker) => {
          const blockerLabels = labelNames(blocker.labels)
          return { number: blocker.number, open: blocker.state === "OPEN", labels: blockerLabels, repoKey: repoKeyOf(blockerLabels) }
        }),
        comments: [...issue.comments.nodes, ...more].map(normalizeComment),
      })
    }
    if (!page.pageInfo.hasNextPage) return tickets
    after = page.pageInfo.endCursor
  }
}

/** The `deploy-first:<environment>/<task>` holds a ticket label list carries. */
export const deployFirstHolds = (labels) => labels.flatMap((label) => {
  const match = /^deploy-first:([^/]+)\/(.+)$/.exec(label)
  return match ? [{ environment: match[1], task: match[2] }] : []
})

/** The newest check of each producer: a rerun replaces its own earlier entry, and a same-named check of another app stays separate. Each entry keeps its rollup `node`. */
const newestChecks = (nodesOfRollup) => {
  const newest = new Map()
  for (const node of nodesOfRollup) {
    const check = node.__typename === "CheckRun"
      ? { name: node.name, appId: node.checkSuite?.app?.databaseId ?? null, passed: node.status === "COMPLETED" && PASSING_CONCLUSIONS.has(node.conclusion), at: node.startedAt ?? "", id: node.databaseId, node }
      : { name: node.context, appId: null, passed: node.state === "SUCCESS", at: node.createdAt ?? "", id: 0, node }
    const key = JSON.stringify([check.name, check.appId])
    const previous = newest.get(key)
    // Two runs can start in the same second and GitHub lists the newer first, so the higher check run id is the newer run.
    if (!previous || check.at > previous.at || (check.at === previous.at && check.id > previous.id)) newest.set(key, check)
  }
  return [...newest.values()]
}

const holdsCheck = (checks, wanted) => checks.some((check) => check.context === wanted.context && check.app_id === wanted.app_id)

/**
 * The required checks that the default branch has after a change of the required checks file: `current` without the checks
 * that the change removes, plus the checks that it adds. `base` is the file at the merge base, or null when the change
 * creates the file, and then `current` stands for it. So a branch behind its base keeps the checks that the base gained.
 */
const checksAfter = (current, { base, head }) => {
  const before = base?.checks ?? current
  const kept = current.filter((check) => !holdsCheck(before, check) || holdsCheck(head.checks, check))
  return [...kept, ...head.checks.filter((check) => !holdsCheck(before, check) && !holdsCheck(kept, check))]
}

/** The protection to write just before the merge of a change that removes a required check, or null when it removes none. */
export const protectionForMerge = (protection, change) => {
  const checks = checksAfter(protection.checks, change)
  return protection.checks.every((check) => holdsCheck(checks, check)) ? null : { strict: protection.strict, checks }
}

/** True when two sets of required checks hold the same `strict` value and the same checks in any order. */
export const sameRequiredChecks = (first, second) => first.strict === second.strict &&
  first.checks.every((check) => holdsCheck(second.checks, check)) && second.checks.every((check) => holdsCheck(first.checks, check))

/** The checks that the merge bar requires: those of the branch protection, changed as the pull request changes the required checks file. */
const requiredOf = (pull) => {
  const change = pull.requiredChecksChange
  if (!change?.head) return pull.requiredChecks
  const current = pull.requiredChecks.map((check) => ({ context: check.context, app_id: check.appId }))
  return checksAfter(current, change).map((check) => ({ context: check.context, appId: check.app_id }))
}

const reportsCheck = (newest, need) => newest.some((check) => check.name === need.context && (need.appId === null || check.appId === need.appId))

const checkFailures = (pull) => {
  if (!pull.checksComplete) return ["checks-incomplete"]
  const newest = newestChecks(pull.checks)
  const needed = requiredOf(pull)
  const required = [...needed, ...(needed.some((check) => check.context === PULLFROG_APPROVAL.context && check.appId === PULLFROG_APPROVAL.appId) ? [] : [PULLFROG_APPROVAL])]
  const missing = required.filter((need) => !reportsCheck(newest, need))
  return [...missing.map((need) => `required-check-missing:${need.context}`), ...newest.filter((check) => !check.passed).map((check) => `check-not-green:${check.name}`)]
}

/** True when GitHub can block the merge for a check that this pull request removes: the protection requires it and the head never reports it. The driver removes it from the protection before the merge. */
const blockedByRemovedCheck = (pull) => {
  if (pull.mergeState !== "BLOCKED") return false
  const needed = requiredOf(pull)
  const newest = newestChecks(pull.checks)
  return pull.requiredChecks.some((check) => !needed.some((need) => need.context === check.context && need.appId === check.appId) && !reportsCheck(newest, check))
}

const inWholeDiffWindow = (body) => Buffer.from(body).subarray(0, WHOLE_DIFF_WINDOW_BYTES).toString().includes("Whole diff:")

/** True when the pull request needs an approval-head whole-diff pass: a fix launch, over 30 changed files, or a dependency manifest. */
export const needsWholeDiff = (pull, { fixLaunches = 0 } = {}) =>
  fixLaunches > 0 || pull.changedFiles > WHOLE_DIFF_FILES || (pull.files ?? []).some((file) => MANIFEST_FILE.test(file))

/**
 * An APPROVED whole-diff review submitted after the driver's request for its own commit. It covers the head at that
 * commit, or at a later head when every later commit is a clean base merge (two parents and an empty remerge diff) or the
 * own diff of that commit equals the diff of the head (`pull.sameDiffAs`).
 */
export const wholeDiffApproved = (pull, { wholeDiffRequests = {}, cleanMerges = [] } = {}) =>
  pull.reviews.some((review) => {
    const requestedAt = wholeDiffRequests[review.commit]
    if (review.state !== "APPROVED" || !inWholeDiffWindow(review.body) || requestedAt === undefined || Date.parse(review.submittedAt) <= Date.parse(requestedAt)) return false
    if ((pull.sameDiffAs ?? []).includes(review.commit)) return true
    const position = pull.commits.findIndex((commit) => commit.sha === review.commit)
    return position >= 0 && pull.commits.slice(position + 1).every((commit) => commit.parents === 2 && cleanMerges.includes(commit.sha))
  })

/** A Pullfrog review that is a pass: its reply to a review thread is a COMMENTED review with an empty body and no BLOCKING comment. */
export const isReviewPass = (review) => review.state !== "COMMENTED" || review.body.trim() !== "" || review.blocking.length > 0

const newestReview = (pull) => [...pull.reviews].filter(isReviewPass).sort((first, second) => first.submittedAt.localeCompare(second.submittedAt)).at(-1) ?? null

/** The time of the review that the merge bar reads, or null when the pull request has no review pass. */
export const approvalTime = (pull) => newestReview(pull)?.submittedAt ?? null

/**
 * The newest review pass when it approves an earlier commit whose own diff equals the diff of the head, or null. `pull.sameDiffAs`
 * lists the commits with that diff. The approval carries to the head, so a clean merge of the base asks for no new review.
 */
export const carriedApproval = (pull) => {
  const review = newestReview(pull)
  return review !== null && review.state === "APPROVED" && review.commit !== pull.headSha && (pull.sameDiffAs ?? []).includes(review.commit) ? review : null
}

/** The first of major, minor and patch that differs between two dotted versions, or null when either is not numeric. */
const semverChange = (from, to) => {
  if (!from || !to) return null
  const [before, after] = [from.split(".").map(Number), to.split(".").map(Number)]
  if ([...before, ...after].some(Number.isNaN)) return null
  const index = before.findIndex((value, position) => value !== after[position])
  return index < 0 ? null : ["major", "minor"][index] ?? "patch"
}

/**
 * The update type of each dependency in the `updated-dependencies` block of Dependabot commit messages. The block names
 * `update-type` only for some updates, so the rest compare `dependency-version` with the `from <old> to <new>` that the
 * same message prints. A type the message does not settle is null.
 */
export const dependabotUpdateTypes = (messages) => messages.flatMap((message) => {
  const block = /^---\nupdated-dependencies:\n([\s\S]*?)^\.\.\.$/m.exec(message)?.[1]
  return (block?.split(/^- /m).slice(1) ?? []).map((entry) => {
    const explicit = /update-type: version-update:semver-(major|minor|patch)/.exec(entry)?.[1]
    const to = /dependency-version: (\S+)/.exec(entry)?.[1]
    const from = to === undefined ? undefined : new RegExp(`from (\\S+) to ${escapeRegex(to)}\\b`).exec(message)?.[1]
    return explicit ?? semverChange(from, to)
  })
})

/** The update types of one Dependabot pull request, read from its commit messages. */
export const readDependabotUpdateTypes = async (repositoryKey, prNumber, seams = {}) => {
  const api = bind(seams)
  const messages = parseJson("gh api pull commits", await api.run(["api", `repos/${api.slugOf(repositoryKey)}/pulls/${prNumber}/commits?per_page=100`, "--jq", "[.[].commit.message]"]))
  return dependabotUpdateTypes(messages)
}

const dependabotFailures = (types) => {
  if (types === undefined || types.length === 0 || types.includes(null)) return ["dependabot-update-type-unknown"]
  return types.includes("major") ? ["dependabot-major"] : []
}

/** The newest check of the given name, or null when none ran. */
const newestCheckNamed = (pull, name) => newestChecks(pull.checks).filter((check) => check.name === name).reduce((first, second) => (first === null || second.at > first.at ? second : first), null)

/**
 * The failures that the git diff of the pull request settles: a diff the driver did not read, a lintable path with no green Lint,
 * and a closing line for a ticket in the body or a commit message. Only the driver closes a ticket. A Lint that still runs is
 * already a `check-not-green` failure, so it adds none.
 */
const diffFailures = (pull, context) => {
  if (!Array.isArray(pull.files) || !Array.isArray(pull.commitMessages)) return ["diff-unknown"]
  const failed = []
  if (context.lintCheck && pull.files.some((file) => LINTABLE_PATH.test(file))) {
    const lint = newestCheckNamed(pull, context.lintCheck)
    const running = lint !== null && lint.node.__typename === "CheckRun" && lint.node.status !== "COMPLETED"
    const green = lint !== null && (lint.node.__typename === "CheckRun" ? lint.node.status === "COMPLETED" && lint.node.conclusion === "SUCCESS" : lint.node.state === "SUCCESS")
    if (!green && !running) failed.push("lint-missing")
  }
  if ([pull.body, ...pull.commitMessages].some((text) => closesTicket(text, pull.ticketRepository))) failed.push("closing-keyword")
  return failed
}

/**
 * The failed conditions of the merge bar at the exact head; an empty list means the bar holds.
 * `context`: `fixLaunches`, `wholeDiffRequests` (ISO time of the request, by head sha), `cleanMerges` (shas of empty
 * remerge diffs), `blockers` (open blockedBy numbers), `ticketLabels` (label names of the tracked ticket), `reportHeld`
 * (true while a `needs-owner` report holds a pull request with no open ticket), `lintCheck` (the name of the lint check of the repository,
 * which `lintCheckOf` gives; none means the repository has no lint check and the bar asks for none) and, for a Dependabot pull request,
 * `updateTypes`. `pull.files` is the list of `git diff --name-only --no-renames` and `pull.commitMessages` the messages of the commits
 * between base and head, both read by the driver.
 */
export const mergeBar = (pull, context = {}) => {
  const failed = []
  if (pull.state !== "OPEN") failed.push("not-open")
  if (pull.draft) failed.push("draft")
  const dependabot = pull.author === "dependabot"
  if (!dependabot && pull.tracks === null) failed.push("untracked")
  if (!SHA.test(pull.headSha)) failed.push("head-unknown")
  if (pull.requiredChecksChange?.head === null) failed.push("required-checks-invalid")
  failed.push(...checkFailures(pull))
  failed.push(...diffFailures(pull, context))
  const review = newestReview(pull)
  if (review === null || (review.commit !== pull.headSha && carriedApproval(pull) === null) || review.state !== "APPROVED") failed.push("review-not-approved-at-head")
  if (needsWholeDiff(pull, context) && !wholeDiffApproved(pull, context)) failed.push("whole-diff-review-missing")
  if (!pull.threadsComplete) failed.push("threads-incomplete")
  const unresolved = pull.threads.filter((thread) => !thread.resolved).length
  if (unresolved > 0) failed.push(`threads-unresolved:${unresolved}`)
  if (pull.mergeState !== "CLEAN" && !blockedByRemovedCheck(pull)) failed.push(`merge-state:${pull.mergeState}`)
  if ((context.blockers ?? []).length > 0) failed.push(`blocked-by:${context.blockers.join(",")}`)
  if (dependabot) failed.push(...dependabotFailures(context.updateTypes))
  if (pull.labels.includes(OWNER_LABEL) || (context.ticketLabels ?? []).includes(OWNER_LABEL) || context.reportHeld) failed.push("needs-owner")
  return failed
}

/**
 * The failing checks of a pull request, from the same newest run of each check that the merge bar reads. A check run of
 * GitHub Actions is one job, so its id names the job inside the run of its details URL. The Pullfrog approval check is
 * never one: it fails when a review withholds the approval, so the review state owns it.
 */
export const failedChecks = (pull) => newestChecks(pull.checks)
  .filter((check) => !(check.name === PULLFROG_APPROVAL.context && check.appId === PULLFROG_APPROVAL.appId))
  .map((check) => check.node)
  .filter((node) => node.__typename === "CheckRun" && node.status === "COMPLETED" && !PASSING_CONCLUSIONS.has(node.conclusion))
  .map((node) => ({ name: node.name, conclusion: node.conclusion, jobId: node.databaseId, runId: /\/actions\/runs\/(\d+)/.exec(node.detailsUrl ?? "")?.[1] ?? null }))

/** The newest passing check runs of a pull request, each with the id of its workflow run. A check of another kind has a null run id. */
export const passedChecks = (pull) => newestChecks(pull.checks)
  .filter((check) => check.passed && check.node.__typename === "CheckRun")
  .map((check) => ({ name: check.name, runId: /\/actions\/runs\/(\d+)/.exec(check.node.detailsUrl ?? "")?.[1] ?? null }))

/** True for a check whose result does not change on a rerun at the same head: the driver never reruns it. */
export const isDeterministicCheck = (name) => DETERMINISTIC_CHECKS.has(name)

/**
 * What to do about one failed check, from the names of its failed steps: a rerun for the job setup, the checkout or a gate step, the owner for a barrier,
 * otherwise a fix order. A deterministic check is never a rerun: its failure goes to a fix order.
 */
export const classifyCheckFailure = ({ name, failedSteps }) => {
  if (name === BARRIER_CHECK && failedSteps.includes(BARRIER_STEP)) return "needs-owner"
  return failedSteps.some((step) => step === SETUP_STEP || CHECKOUT_STEP.test(step) || GATE_STEPS.has(step)) && !isDeterministicCheck(name) ? "rerun" : "ci-fix"
}

/** True while a job of one workflow run has not completed. GitHub refuses to rerun the failed jobs of such a run. */
export const runInProgress = (pull, runId) => newestChecks(pull.checks).some((check) => check.node.__typename === "CheckRun" && check.node.status !== "COMPLETED" && /\/actions\/runs\/(\d+)/.exec(check.node.detailsUrl ?? "")?.[1] === runId)

/** The names of the failed steps of one job of a workflow run. */
export const readFailedSteps = async (repositoryKey, runId, jobId, seams = {}) => {
  const api = bind(seams)
  const response = parseJson("gh run view", await api.run(["run", "view", String(runId), "--repo", api.slugOf(repositoryKey), "--json", "jobs"]))
  return response.jobs.filter((job) => job.databaseId === jobId).flatMap((job) => job.steps.filter((step) => step.conclusion === "failure").map((step) => step.name))
}

/** The newest 200 `pullfrog.yml` runs of a repository. One list serves every pull request of the repository. */
export const pullfrogRuns = async (repositoryKey, seams = {}) => {
  const api = bind(seams)
  const args = ["run", "list", "--repo", api.slugOf(repositoryKey), "--workflow", "pullfrog.yml", "--json", "databaseId,displayTitle,status,conclusion,createdAt,updatedAt", "--limit", "200"]
  return parseJson("gh run list", await api.run(args))
}

/** The runs of a `pullfrogRuns` list that name one pull request in their display title. */
export const runsNaming = (runs, prNumber) => {
  const mention = new RegExp(`#${prNumber}(?!\\d)`)
  return runs.filter((run) => mention.test(run.displayTitle))
}

/** The newest deployment of an environment and task whose latest status is `success`, or null. */
export const deployedAt = async (repositoryKey, environment, task, seams = {}) => {
  const api = bind(seams)
  const slug = api.slugOf(repositoryKey)
  const query = `environment=${encodeURIComponent(environment)}&task=${encodeURIComponent(task)}&per_page=100`
  const deployments = parseJson("gh api deployments", await api.run(["api", `repos/${slug}/deployments?${query}`]))
  for (const deployment of [...deployments].sort((first, second) => second.created_at.localeCompare(first.created_at))) {
    const latest = parseJson("gh api deployment statuses", await api.run(["api", `repos/${slug}/deployments/${deployment.id}/statuses?per_page=1`]))[0]
    if (latest?.state === "success") return { id: deployment.id, sha: deployment.sha, createdAt: deployment.created_at }
  }
  return null
}

/** True when `sha` is contained in `ofSha`: the compare status is `ahead` or `identical`. */
export const isAncestor = async (repositoryKey, sha, ofSha, seams = {}) => {
  if (!SHA.test(sha) || !SHA.test(ofSha)) throw new Error("isAncestor needs two full 40-character shas")
  const api = bind(seams)
  const status = (await api.run(["api", `repos/${api.slugOf(repositoryKey)}/compare/${sha}...${ofSha}`, "--jq", ".status"])).trim()
  return status === "ahead" || status === "identical"
}

/** The merge commit of the newest merged pull request whose body holds `Tracks <ticket repository>#<N>`, or null. */
export const trackedMergeSha = async (repositoryKey, ticketNumber, seams = {}) => {
  const api = bind(seams)
  const ticketRepository = api.config.tickets.repository
  const args = ["pr", "list", "--repo", api.slugOf(repositoryKey), "--state", "merged", "--search", `"Tracks ${ticketRepository}#${ticketNumber}" in:body`, "--json", "number,body,mergedAt,mergeCommit", "--limit", "50"]
  const merged = parseJson("gh pr list", await api.run(args)).filter((pull) => tracksOf(pull.body, ticketRepository) === ticketNumber)
  return merged.sort((first, second) => second.mergedAt.localeCompare(first.mergedAt))[0]?.mergeCommit?.oid ?? null
}

/** The unmet holds of one blocker: each `deploy-first` label whose newest successful deployment does not contain the blocker's merge. */
export const unmetDeployFirst = async (blocker, seams = {}) => {
  if (blocker.repoKey === null) return deployFirstHolds(blocker.labels)
  const mergeSha = await trackedMergeSha(blocker.repoKey, blocker.number, seams)
  const unmet = []
  for (const hold of deployFirstHolds(blocker.labels)) {
    const deployment = mergeSha === null ? null : await deployedAt(blocker.repoKey, hold.environment, hold.task, seams)
    if (deployment === null || !(await isAncestor(blocker.repoKey, mergeSha, deployment.sha, seams))) unmet.push(hold)
  }
  return unmet
}

const nonEmpty = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`)
  return value
}

/** Resolves review threads by id, one mutation with an alias for each. */
export const resolveThreads = async (threadIds, seams = {}) => {
  if (threadIds.length === 0) return
  const api = bind(seams)
  const calls = threadIds.map((id, index) => `t${index}: resolveReviewThread(input: { threadId: ${JSON.stringify(id)} }) { thread { id isResolved } }`)
  const data = await graphql(api, `mutation DriveResolve { ${calls.join(" ")} }`)
  const open = Object.values(data).filter((result) => result.thread.isResolved !== true)
  if (open.length > 0) throw new Error(`resolveReviewThread left ${open.length} thread(s) unresolved`)
}

export const merge = async (repositoryKey, prNumber, headSha, seams = {}) => {
  if (!SHA.test(headSha)) throw new Error("merge needs the full 40-character head sha")
  const api = bind(seams)
  await api.run(["pr", "merge", String(prNumber), "--repo", api.slugOf(repositoryKey), "--squash", "--match-head-commit", headSha])
}

/** The required checks file of a repository at a ref: null when the ref holds none, and `required` is null when its shape is wrong. */
export const readRequiredChecksFile = async (repositoryKey, ref, seams = {}) => {
  const api = bind(seams)
  return readRequiredChecksAt(api.slugOf(repositoryKey), ref, api.run)
}

const protectionPath = (api, repositoryKey, branch) => `repos/${api.slugOf(repositoryKey)}/branches/${nonEmpty(branch, "branch name")}/protection/required_status_checks`

/** The required status checks of the protection of a branch, in the shape of the required checks file. */
export const readProtectionChecks = async (repositoryKey, branch, seams = {}) => {
  const api = bind(seams)
  const { strict, checks } = parseJson("gh api required status checks", await api.run(["api", protectionPath(api, repositoryKey, branch)]))
  return { strict, checks: checks.map((check) => ({ context: check.context, app_id: check.app_id })) }
}

/** Replaces the required status checks of the protection of a branch. GitHub reads the app id -1 as every app. */
export const writeProtectionChecks = async (repositoryKey, branch, { strict, checks }, seams = {}) => {
  const api = bind(seams)
  const body = { strict, checks: checks.map((check) => ({ context: check.context, app_id: check.app_id ?? -1 })) }
  await api.run(["api", protectionPath(api, repositoryKey, branch), "--method", "PATCH", "--input", "-"], { input: JSON.stringify(body) })
}

export const updateBranch = async (repositoryKey, prNumber, seams = {}) => {
  const api = bind(seams)
  await api.run(["pr", "update-branch", String(prNumber), "--repo", api.slugOf(repositoryKey)])
}

export const retarget = async (repositoryKey, prNumber, base, seams = {}) => {
  const api = bind(seams)
  await api.run(["pr", "edit", String(prNumber), "--repo", api.slugOf(repositoryKey), "--base", nonEmpty(base, "base branch")])
}

export const rerunFailed = async (repositoryKey, runId, seams = {}) => {
  const api = bind(seams)
  await api.run(["run", "rerun", String(runId), "--failed", "--repo", api.slugOf(repositoryKey)])
}

/** Posts one comment on a pull request or a ticket; `repositoryKey` is `tickets` for a ticket. */
export const comment = async (repositoryKey, number, body, seams = {}) => {
  const api = bind(seams)
  await api.run(["api", `repos/${api.slugOf(repositoryKey)}/issues/${number}/comments`, "--method", "POST", "--input", "-"], { input: JSON.stringify({ body: nonEmpty(body, "comment body") }) })
}

const EDIT_COMMENT_MUTATION = `mutation DriveEditComment($id: ID!, $body: String!) {
  updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
}`

/** Replaces the body of one issue comment, by its node id. The body goes on stdin, because a comment can be long. */
export const editComment = async (id, body, seams = {}) => {
  const api = bind(seams)
  const input = JSON.stringify({ query: EDIT_COMMENT_MUTATION, variables: { id: nonEmpty(id, "comment id"), body: nonEmpty(body, "comment body") } })
  const response = parseJson("gh api graphql", await api.run(["api", "graphql", "--input", "-"], { input }))
  if (response?.errors || response?.data?.updateIssueComment?.issueComment?.id !== id) throw new Error(`updateIssueComment failed: ${JSON.stringify(response?.errors ?? response).slice(0, 500)}`)
}

const listLabels = async (api, repositoryKey) => {
  const labels = parseJson("gh label list", await api.run(["label", "list", "--repo", api.slugOf(repositoryKey), "--limit", "1000", "--json", "name"]))
  return labels.map((label) => label.name)
}

/** Adds and removes labels on a pull request or a ticket; an unknown label is refused before any change. */
export const editLabels = async (repositoryKey, number, { add = [], remove = [] } = {}, seams = {}) => {
  const api = bind(seams)
  const wanted = [...new Set([...add, ...remove])]
  if (wanted.length === 0) throw new Error("editLabels needs at least one label to add or remove")
  const available = await listLabels(api, repositoryKey)
  const unknown = wanted.filter((label) => !available.includes(label))
  if (unknown.length > 0) throw new Error(`Unknown label(s): ${unknown.join(", ")}`)
  const command = repositoryKey === "tickets" ? "issue" : "pr"
  await api.run([command, "edit", String(number), "--repo", api.slugOf(repositoryKey), ...add.flatMap((label) => ["--add-label", label]), ...remove.flatMap((label) => ["--remove-label", label])])
}

/** Creates a label in a repository when it has none. The name, the color and the description are the caller's. */
export const ensureLabel = async (repositoryKey, { name, color, description }, seams = {}) => {
  const api = bind(seams)
  if ((await listLabels(api, repositoryKey)).includes(name)) return false
  await api.run(["api", `repos/${api.slugOf(repositoryKey)}/labels`, "--method", "POST", "--input", "-"], { input: JSON.stringify({ name, color, description }) })
  return true
}

/** Closes a pull request with no merge. */
export const closePull = async (repositoryKey, number, seams = {}) => {
  const api = bind(seams)
  await api.run(["api", `repos/${api.slugOf(repositoryKey)}/pulls/${number}`, "--method", "PATCH", "--input", "-"], { input: JSON.stringify({ state: "closed" }) })
}

/** Deletes a remote branch by its name. */
export const deleteBranch = async (repositoryKey, branch, seams = {}) => {
  const api = bind(seams)
  await api.run(["api", `repos/${api.slugOf(repositoryKey)}/git/refs/heads/${nonEmpty(branch, "branch name")}`, "--method", "DELETE"])
}

const projectItemOf = async (api, number) => {
  const { owner, name } = splitSlug(api.config.tickets.repository)
  const issue = (await graphql(api, PROJECT_ITEMS_QUERY, { owner, name, number })).repository.issue
  return { contentId: issue.id, itemId: nodes(issue.projectItems).find((item) => item.project.id === api.config.tickets.projectId)?.id ?? null }
}

/** Sets the board Status of one ticket. */
export const setStatus = async (number, status, seams = {}) => {
  const api = bind(seams)
  const { tickets } = api.config
  const option = tickets.statusOptions[status]
  if (option === undefined) throw new Error(`Unknown ticket status ${JSON.stringify(status)}`)
  const { itemId } = await projectItemOf(api, number)
  if (itemId === null) throw new Error(`Ticket ${number} is not on the configured project`)
  await graphql(api, SET_STATUS_MUTATION, { project: tickets.projectId, item: itemId, field: tickets.statusFieldId, option })
}

/** Closes a ticket as completed, then sets its Status to Done. */
export const closeTicket = async (number, seams = {}) => {
  const api = bind(seams)
  await api.run(["issue", "close", String(number), "--repo", api.config.tickets.repository, "--reason", "completed"])
  await setStatus(number, "Done", seams)
}

/**
 * Creates a ticket, adds its Projects card, sets its Status and writes its blockedBy links. GitHub CLI prints exactly
 * the created issue URL on stdout after a successful create (pkg/cmd/issue/create/create.go, `fmt.Fprintln(opts.IO.Out, newIssue.URL)`).
 */
export const createTicket = async ({ title, body, labels, milestone = null, status = "Todo", blockedBy = [] }, seams = {}) => {
  const api = bind(seams)
  const { tickets } = api.config
  if (milestone !== null) throw new Error("The driver adapter does not set milestones")
  nonEmpty(title, "Ticket title")
  nonEmpty(body, "Ticket body")
  if (!Array.isArray(labels) || labels.length === 0) throw new Error("Ticket labels must be a non-empty array")
  if (status === "Done" || tickets.statusOptions[status] === undefined) throw new Error(`A new ticket cannot start at ${JSON.stringify(status)}`)
  const available = await listLabels(api, "tickets")
  const missing = [...new Set(labels)].filter((label) => !available.includes(label))
  if (missing.length > 0) throw new Error(`Unknown ticket label(s): ${missing.join(", ")}`)
  const blockers = [...new Set(blockedBy.map((reference) => {
    const match = /^#?([1-9]\d*)$/.exec(String(reference).trim())
    if (!match) throw new Error(`Ticket blocker must be #N or N, got ${JSON.stringify(reference)}`)
    return match[1]
  }))]
  for (const blocker of blockers) await api.run(["api", `repos/${tickets.repository}/issues/${blocker}`, "--jq", ".number"])
  const created = (await api.run(["issue", "create", "--repo", tickets.repository, "--title", title, "--body-file", "-", ...[...new Set(labels)].flatMap((label) => ["--label", label])], { input: body })).trim()
  const number = Number(new RegExp(`^https://github\\.com/${tickets.repository}/issues/([1-9]\\d*)$`).exec(created)?.[1])
  if (!Number.isInteger(number)) throw new Error(`gh issue create printed no issue URL for ${tickets.repository}`)
  const { contentId } = await projectItemOf(api, number)
  await graphql(api, ADD_ITEM_MUTATION, { project: tickets.projectId, content: contentId })
  await setStatus(number, status, seams)
  if (blockers.length > 0) await api.run(["issue", "edit", String(number), "--repo", tickets.repository, "--add-blocked-by", blockers.join(",")])
  return { number, url: created, title, milestone: null, status }
}

const SENTRY_ORGANIZATION = "orbit-ai-habit-tracker"
const SENTRY_REPO = { "orbit-api": "api", "orbit-web": "ui", "orbit-mobile": "ui" }
const SENTRY_TITLE_LIMIT = 120
const REVIEWER_SECRET = "CLAUDE_CODE_OAUTH_TOKEN"

/** All pages of the unresolved Sentry issues of the organization: a page names the next one in its `Link` header with `results="true"`. */
export const sentryIssues = async (fetchJson, token) => {
  const issues = []
  for (let url = `https://sentry.io/api/0/organizations/${SENTRY_ORGANIZATION}/issues/?query=is:unresolved`; url !== null;) {
    const page = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } })
    issues.push(...page.body)
    url = /<([^>]+)>; rel="next"; results="true"/.exec(page.link ?? "")?.[1] ?? null
  }
  return issues
}

/** True when `text` holds `needle` and the next character does not continue a word or a number (an alert url ends in its number). */
export const holds = (text, needle) => new RegExp(`${escapeRegex(needle)}(?![A-Za-z0-9])`).test(text)

/** True when `text` names the Sentry short id as a whole word: `ORBIT-API-1A` is not named by `ORBIT-API-1AB`. */
const namesShortId = (text, shortId) => new RegExp(`(?<![A-Za-z0-9])${escapeRegex(shortId)}(?![A-Za-z0-9])`).test(text)

/** The `Bug` ticket for a Sentry issue, or null for a project with no repository. A ticket holds the issue when it names the short id, the permalink or the `/issues/<id>/` path. A regressed issue also carries `regressedAt`, the time of its last event. */
export const sentryCandidate = (issue) => {
  const repoKey = SENTRY_REPO[issue.project?.slug]
  if (!repoKey) return null
  const suffix = ` (Sentry ${issue.shortId})`
  return {
    repoKey,
    title: `${issue.title.slice(0, SENTRY_TITLE_LIMIT - suffix.length)}${suffix}`,
    body: `${issue.title}\n\n${issue.permalink}\n\nProject: ${issue.project.slug}`,
    held: (text) => namesShortId(text, issue.shortId) || holds(text, issue.permalink) || holds(text, `/issues/${issue.id}/`),
    label: issue.permalink,
    ...(issue.substatus === "regressed" ? { regressedAt: Date.parse(issue.lastSeen) } : {}),
  }
}

/** Sets the reviewer secret of each repository from the token on stdin of `gh`. It prints each result and never the token. Returns the exit code. */
export const setReviewerToken = async ({ token, slugs, runGh, out }) => {
  let failures = 0
  for (const slug of slugs) {
    const result = await runGh(["secret", "set", REVIEWER_SECRET, "--repo", slug], token)
    const done = result.status === 0 && !result.error
    if (!done) failures += 1
    out(`${slug}: ${done ? "set" : `failed, exit ${result.status ?? "none"}`}`)
  }
  return failures === 0 ? 0 : 3
}
