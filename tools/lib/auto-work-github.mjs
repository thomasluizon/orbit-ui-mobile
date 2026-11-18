import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { configuredRepositorySlug } from "./admission.mjs"
import { activeIntakeRun, carryingTicket, intakeRun } from "./auto-work-intake.mjs"
import { runBounded } from "./bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./github-auth.mjs"
import { resolveTicket } from "./github-issues.mjs"
import { readOrchestratorConfig } from "./orchestrator-config.mjs"
import { REPO_ROOT, claudeConfigDirectory, gitDirectoryOf, liveSessionProcesses, readRunState, updateRunState } from "./run-state.mjs"

/** The three code repositories whose open pull requests and alerts auto-work reads every cycle. */
const REPOSITORY_KEYS = ["ui", "api", "landing"]

/*
 * The REST logins of the bots each repository configures to open pull requests: Dependabot (dependabot.yml
 * and the security updates setting) and the App of ui's contract-rebaseline.yml. Runs open as the owner.
 */
const CONFIGURED_PULL_REQUEST_BOTS = {
  ui: ["dependabot[bot]", "orbit-contract-rebaseline[bot]"],
  api: ["dependabot[bot]"],
  landing: ["dependabot[bot]"],
}

const ownerOf = (slug) => slug.split("/")[0]

/** An author outside the configured bots and the repository owner is unexpected. */
export const unexpectedAuthor = ({ key, slug }, author) => author !== ownerOf(slug) && !(CONFIGURED_PULL_REQUEST_BOTS[key] ?? []).includes(author)

/** The actions that each class of pull request permits, and the refusal of every other action. */
export const PULL_REQUEST_CLASSES = {
  unexpectedAuthor: { actions: ["reported"], refusal: "a pull request from an unexpected author is never merged, fixed or closed; report it to the owner" },
  otherRun: { actions: [], refusal: "another live run drives this pull request, or the live runs could not be read; skip it" },
  unread: { actions: [], refusal: "the tickets of this pull request could not be read; skip it until the next collection reads them" },
  closedTickets: { actions: ["closed", "reported"], refusal: "a pull request whose tickets are closed is never merged or fixed; close it as superseded or report it to the owner" },
  configured: { actions: ["merged", "fix", "closed"], refusal: "only a pull request from an unexpected author or with closed tickets is reported" },
}

/**
 * The class of one open pull request: an unexpected author, an owner pull request whose ticket read failed, an owner pull
 * request of another live run, an owner pull request whose tickets are all closed, or a configured author.
 */
export const pullRequestClass = (pull) => pull.unexpectedAuthor ? "unexpectedAuthor" : pull.unread ? "unread" : pull.otherRun ? "otherRun" : pull.closedTickets ? "closedTickets" : "configured"

/*
 * Each projection prints one JSON line per item across every page. The fields come from live reads;
 * the secret scanning fields come from GitHub's published REST description, because no repository
 * has had a secret scanning alert. The secret is never projected, and hide_secret omits it.
 */
const PULL_REQUEST_PROJECTION = ".[] | {number, author: .user.login, authorType: .user.type, head: .head.sha, branch: .head.ref, base: .base.ref, draft, title, url: .html_url} | tojson"

const ALERT_READS = [
  { kind: "code-scanning", query: "state=open&per_page=100",
    projection: ".[] | {number, rule: .rule.id, severity: (.rule.security_severity_level // .rule.severity), tool: .tool.name, path: .most_recent_instance.location.path, line: .most_recent_instance.location.start_line, message: .most_recent_instance.message.text, url: .html_url} | tojson" },
  { kind: "secret-scanning", query: "state=open&per_page=100&hide_secret=true",
    projection: ".[] | {number, rule: .secret_type, path: .first_location_detected.path, line: .first_location_detected.start_line, message: .secret_type_display_name, url: .html_url} | tojson" },
  { kind: "dependabot", query: "state=open&per_page=100",
    projection: ".[] | {number, rule: .security_advisory.ghsa_id, severity: .security_advisory.severity, tool: .dependency.package.ecosystem, path: .dependency.manifest_path, message: ((.dependency.package.name // \"\") + \": \" + .security_advisory.summary), url: .html_url} | tojson" },
]

const lastLine = (text) => String(text ?? "").trim().split("\n").at(-1)?.trim() ?? ""

/** The repository keys and GitHub slugs, resolved from the checkout as the progress report does. */
export const autoWorkRepositories = (config = readOrchestratorConfig(), repoRoot = REPO_ROOT) => {
  const owner = repositorySlug(resolve(repoRoot, config.repos.ui)).split("/")[0]
  return REPOSITORY_KEYS.map((key) => ({ key, slug: configuredRepositorySlug(resolve(repoRoot, config.repos[key]), owner) }))
}

/** Runs one gh api call with the token of the repository owner and returns its stdout. */
const ownerGitHub = ({ config, repoRoot, run, signal }) => {
  let authentication
  return async (verb, path, args, input) => {
    // A failed token read is not kept, so the next call of a long-lived waiter tries again.
    const auth = await (authentication ??= githubEnvironment(resolve(repoRoot, config.repos.ui))
      .catch((error) => { authentication = undefined; throw error }))
    const result = await run(process.env.GH_BIN || "gh", ["api", ...args],
      { env: auth.environment, timeoutMs: config.timeouts.gitRemoteSeconds * 1000, signal, ...(input === undefined ? {} : { input }) })
    if (result.error || result.timedOut || result.status !== 0) {
      const reason = result.error?.message ?? (result.timedOut ? "timed out" : lastLine(result.stderr) || `exit ${result.status}`)
      throw new Error(`GitHub ${verb} failed at ${path}: ${redactSecrets(reason, auth.secrets)}`)
    }
    return result.stdout
  }
}

/**
 * Reads every page of one REST list through gh with the token of the repository owner. With
 * `allPages: false` it reads the first page only, for a list whose first item is all a caller needs.
 */
export const githubPageReader = ({ config = readOrchestratorConfig(), repoRoot = REPO_ROOT, run = runBounded, signal } = {}) => {
  const call = ownerGitHub({ config, repoRoot, run, signal })
  return async (path, projection, { allPages = true } = {}) => (await call("read", path, [...(allPages ? ["--paginate"] : []), path, "--jq", projection]))
    .split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line))
}

/** Sends one JSON body to a REST path through gh with the token of the repository owner. */
export const githubWriter = ({ config = readOrchestratorConfig(), repoRoot = REPO_ROOT, run = runBounded } = {}) => {
  const call = ownerGitHub({ config, repoRoot, run })
  return (method, path, body) => call("write", path, ["--method", method, "--input", "-", path], JSON.stringify(body))
}

/** Runs each read on its own; a failed read is a named failure and never an empty list. */
const settleReads = async (reads) => {
  const outcomes = await Promise.allSettled(reads.map((read) => read.list()))
  const items = []
  const failures = []
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") items.push(...outcome.value)
    else failures.push({ read: reads[index].read, message: String(outcome.reason?.message ?? outcome.reason) })
  })
  return { items, failures, reads: reads.map((read) => read.read) }
}

/** A ticket that does not exist answers 404, and a deleted one answers 410 Gone; both name no ticket. Any other failed read is a failure. */
const ticketIsMissing = (error) => /\(HTTP (?:404|410)\)/.test(String(error?.message))

/**
 * The tickets among `numbers` that carry `repo:<key>` of a pull request, each with its state and close reason. A pull request number in a
 * title, such as the `(#N)` of a squash merge subject, names no ticket when it has no issue or its issue routes to another repository; a
 * number that is also an issue of this repository still counts, so check the tickets of an adopted pull request by hand. A missing or
 * deleted issue names no ticket; any other failed read throws. This is the one read of these tickets in a collection.
 */
const routedTickets = async (repositoryKey, numbers, readTicketState) => {
  const read = await Promise.all(numbers.map(async (number) => {
    try { return await readTicketState(number) } catch (error) {
      if (ticketIsMissing(error)) return null
      throw error
    }
  }))
  return read.flatMap((ticket, index) => ticket?.labels.some((label) => label.name === `repo:${repositoryKey}`)
    ? [{ number: numbers[index], state: ticket.state, stateReason: ticket.stateReason ?? null }] : [])
}

/**
 * Lists the open pull requests. Each owner pull request carries `tickets`, the tickets of its repository that its branch and title name,
 * each with its state; the ownership and closed ticket rules read only that field. A failed ticket read withholds only the pull request
 * that named the number: the listing names it in `failures` with its `key`, and it is not an item.
 */
export const listOpenPullRequests = async ({ repositories, readPages, readTicketState }) => {
  const listing = await settleReads(repositories.map((repository) => ({
    read: `${repository.key} pulls`,
    list: async () => Promise.all((await readPages(`repos/${repository.slug}/pulls?state=open&per_page=100`, PULL_REQUEST_PROJECTION)).map(async (pull) => {
      const ownerAuthor = pull.author === ownerOf(repository.slug)
      const item = { key: `${repository.key}#${pull.number}`, read: `${repository.key} pulls`, repository: repository.key, ...pull, ownerAuthor,
        unexpectedAuthor: unexpectedAuthor(repository, pull.author) }
      try { return { ...item, tickets: ownerAuthor ? await routedTickets(repository.key, ticketNumbersOf(pull), readTicketState) : [] } } catch (error) {
        return { key: item.key, read: item.read, ticketReadFailure: String(error?.message ?? error) }
      }
    })),
  })))
  return { ...listing, items: listing.items.filter((item) => !item.ticketReadFailure),
    failures: [...listing.failures, ...listing.items.filter((item) => item.ticketReadFailure)
      .map(({ key, read, ticketReadFailure }) => ({ read, key, message: `Cannot read the tickets of ${key}: ${ticketReadFailure}` }))] }
}

export const listOpenAlerts = ({ repositories, readPages }) => settleReads(repositories.flatMap(({ key, slug }) => ALERT_READS.map((source) => ({
  read: `${key} ${source.kind}`,
  list: async () => (await readPages(`repos/${slug}/${source.kind}/alerts?${source.query}`, source.projection)).map((alert) => ({
    key: `${key} ${source.kind} ${alert.number}`, read: `${key} ${source.kind}`, repository: key, kind: source.kind, ...alert,
    message: String(alert.message ?? "").trim().split("\n")[0] })),
}))))

/** The pull requests this run recorded, which /orchestrate already drives from its readiness ledger. */
export const runPullRequestKeys = (state) => new Set([...(state?.pullRequests ?? []), ...(state?.readinessLedger ?? [])]
  .filter((entry) => typeof entry?.repositoryKey === "string" && Number.isInteger(entry?.prNumber))
  .map((entry) => `${entry.repositoryKey}#${entry.prNumber}`))

/** The ticket names of a branch or a title: `ticket-<N>-` (as sync-issue-state.mjs reads it), `(#N)` and `ORB-N`. */
const TICKET_NAMES = [/(?:^|[^A-Z0-9])ticket-([1-9]\d*)(?=-)/gi, /\(#([1-9]\d*)\)/g, /(?:^|[^A-Z0-9])(ORB-[1-9]\d*)(?![0-9])/gi]

/** The GitHub issue number of one name; an `ORB-N` outside the migration map names no ticket, so it gives null. */
const issueNumberOf = (name) => {
  try { return resolveTicket(name).number } catch { return null }
}

/** The numbers that the branch and the title of a pull request name, before any is proved a ticket of its repository. */
const ticketNumbersOf = (pull) => {
  const text = `${pull.branch ?? ""}\n${pull.title ?? ""}`
  return [...new Set(TICKET_NAMES.flatMap((pattern) => [...text.matchAll(pattern)].map(([, name]) => issueNumberOf(name))).filter((number) => number !== null))]
}

/**
 * A pull request is the run's own only when the owner account opened it, and the run recorded it or
 * it names a ticket in `remaining`: a worker of this run carries it before the run records its
 * number. Both sides resolve to the GitHub issue number, so `#33` and `ORB-27` are one ticket.
 */
const runOwnedPullRequest = (state) => {
  const recorded = runPullRequestKeys(state)
  const inFlight = new Set((Array.isArray(state?.remaining) ? state.remaining : []).map((entry) => resolveTicket(entry).number))
  return (pull) => pull.ownerAuthor === true && (recorded.has(pull.key) || pull.tickets.some(({ number }) => inFlight.has(number)))
}

/** The root of the checkout that contains `directory`: the nearest directory with a `.git` entry, as gitDirectoryOf reads it; null outside any checkout. */
const checkoutRootOf = (directory) => {
  for (let current = resolve(directory); ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return current
    if (dirname(current) === current) return null
  }
}

/**
 * The owner pull requests that another live run drives: per checkout that contains a live session cwd, its run record
 * claims by runOwnedPullRequest while its session or pending relay successor is live, as foreignRunHold counts a run.
 * This run's session must be live, or a missing record proves nothing. A failed read claims every owner pull request
 * and names the failure, so it never adopts one.
 */
export const otherLiveRuns = (state, { repoRoot = REPO_ROOT, sessions = liveSessionProcesses, readState = readRunState } = {}) => {
  try {
    const live = sessions()
    if (!live.some((session) => session.sessionId === state?.sessionId)) {
      throw new Error(`the session ${state?.sessionId} of this run is not among the live Claude sessions of ${claudeConfigDirectory()}, so the other runs are unknown`)
    }
    const liveIds = new Set(live.map((session) => session.sessionId))
    const driven = (record) => liveIds.has(record?.sessionId) || (record?.relay?.pending === true && liveIds.has(record.relay.successorSessionId))
    const own = gitDirectoryOf(repoRoot)
    const checkouts = new Map(live.flatMap((session) => typeof session.cwd === "string" ? [checkoutRootOf(session.cwd)] : [])
      .filter((checkout) => checkout !== null && gitDirectoryOf(checkout) !== own).map((checkout) => [gitDirectoryOf(checkout), checkout]))
    const owners = [...checkouts.values()].map((checkout) => readState(checkout)).filter(driven).map(runOwnedPullRequest)
    return { claims: (pull) => owners.some((owns) => owns(pull)) }
  } catch (error) {
    return { claims: (pull) => pull.ownerAuthor === true, failure: { read: "live runs", message: `Cannot read the other live runs: ${error.message}` } }
  }
}

/**
 * The waiter key of a pull request carries its head, so a new head is a new key. The owner hears
 * about a pull request from an unexpected author or with a reported mark once, so its key has no head.
 */
const pullRequestWakeKey = (pull, mark) => pull.unexpectedAuthor || mark?.action === "reported" ? pull.key : `${pull.key} ${pull.head}`

/**
 * Turns a listing into waiter keys; it rejects only when no read succeeded. `unreadPrefixes` holds the key prefix of
 * each failed read and `unreadKeys` the key of each withheld item, so the waiter keeps the seen keys that failure cannot confirm.
 */
const wakeKeys = (listing, keyOf, prefixOf) => {
  const failure = listing.failures.map((entry) => entry.message).join("; ")
  const failedReads = listing.failures.filter((entry) => entry.key === undefined)
  const withheld = listing.failures.filter((entry) => entry.key !== undefined)
  if (failedReads.length === listing.reads.length) throw new Error(failure)
  return { keys: listing.items.map(keyOf), ...(failure ? { failure, unreadPrefixes: failedReads.map((entry) => prefixOf(entry.read)),
    ...(withheld.length ? { unreadKeys: withheld.map((entry) => entry.key) } : {}) } : {}) }
}

/**
 * Keys each pull request that neither this run nor another live run owns. When the live runs cannot be read, the
 * withheld owner pull requests keep their seen keys, so the same failure wakes the model once and its recovery is not new.
 */
export const pullRequestCheck = ({ list, readState, readOtherRuns }) => async () => {
  const listing = await list()
  const state = readState()
  const owned = runOwnedPullRequest(state)
  const otherRuns = readOtherRuns(state)
  const marks = state?.intake?.pullRequests?.marks ?? {}
  const keyOf = (pull) => pullRequestWakeKey(pull, marks[pull.key])
  const checked = wakeKeys({ ...listing, items: listing.items.filter((pull) => !owned(pull) && !otherRuns.claims(pull)) }, keyOf, (read) => `${read.split(" ")[0]}#`)
  if (!otherRuns.failure) return checked
  const withheld = listing.items.filter((pull) => !owned(pull) && otherRuns.claims(pull)).map(keyOf)
  return { keys: checked.keys, failure: [checked.failure, otherRuns.failure.message].filter(Boolean).join("; "),
    unreadPrefixes: [...(checked.unreadPrefixes ?? []), ...withheld], ...(checked.unreadKeys ? { unreadKeys: checked.unreadKeys } : {}) }
}

/**
 * The waiter key of an open alert whose carrying ticket is closed. For code scanning of a ticket closed
 * as completed it carries the commit of the newest scan of the default branch, so a later scan that
 * still finds the alert is new. No other close reason compares scans, so a new scan wakes nothing.
 */
const ticketClosedWakeKey = (alert) => `${alert.key} ticket-closed${alert.scannedCommit ? ` ${alert.scannedCommit}` : ""}`

/** Reads the commit of the newest code scanning analysis of the default branch from one page. */
export const newestScanCommit = async ({ repositories, readPages }, repositoryKey) => {
  const slug = repositories.find((repository) => repository.key === repositoryKey)?.slug
  if (!slug) throw new Error(`No repository matches ${repositoryKey}`)
  const [analysis] = await readPages(`repos/${slug}/code-scanning/analyses?ref=refs/heads/main&per_page=1`, ".[] | {commit: .commit_sha} | tojson", { allPages: false })
  return analysis?.commit ?? null
}

/**
 * Keys each open alert, and each open alert whose carrying ticket is closed a second time, so the
 * close of that ticket wakes the model. An alert whose ticket or scan read failed keeps its seen key.
 */
export const alertCheck = ({ list, readState = () => ({}), readTicketState, readNewestScan }) => async () => {
  const listing = await list()
  const marks = readState()?.intake?.alerts?.marks ?? {}
  const checked = wakeKeys(listing, (alert) => alert.key, (read) => `${read} `)
  if (!Object.values(marks).some((mark) => TICKETED_ALERT_ACTIONS.includes(mark?.action))) return checked
  const closed = await alertsWithClosedTickets({ open: Object.fromEntries(listing.items.map((alert) => [alert.key, alert])), marks }, { readTicketState, readNewestScan })
  const failure = [checked.failure, ...closed.failures.map((entry) => entry.message)].filter(Boolean).join("; ")
  const unreadPrefixes = [...(checked.unreadPrefixes ?? []), ...closed.unreadKeys.map((key) => `${key} ticket-closed`)]
  return { keys: [...checked.keys, ...closed.items.map(ticketClosedWakeKey)], ...(failure ? { failure, unreadPrefixes } : {}) }
}

/** The keys the model listed in its last cycle, so the waiter does not wake for them again. */
export const listedWakeKeys = (intake) => ({
  ...(intake?.pullRequests?.open ? { pullRequests: Object.values(intake.pullRequests.open).filter((pull) => !pull.runOwned && !pull.otherRun)
    .map((pull) => pullRequestWakeKey(pull, intake.pullRequests.marks?.[pull.key])) } : {}),
  ...(intake?.alerts?.open ? { alerts: [...Object.keys(intake.alerts.open), ...(intake.alerts.ticketClosed ?? [])] } : {}),
})

const sourceOf = (state, source) => ({ open: {}, marks: {}, ...state.intake?.[source] })

const writeSource = (source, change, repoRoot) => {
  let contents
  const written = updateRunState((current) => {
    const state = activeIntakeRun(current, repoRoot)
    contents = change(sourceOf(state, source), state)
    return { ...state, intake: { ...state.intake, [source]: contents } }
  }, repoRoot)
  if (JSON.stringify(sourceOf(written, source)) !== JSON.stringify(contents)) throw new Error(`intake.${source} write was not confirmed`)
  return contents
}

/**
 * Replaces the open items of every read that succeeded. A failed read keeps its previous items, so
 * a failure never empties a source. Marks remain only for items that are still open. A pull request
 * listing needs `otherRuns` from otherLiveRuns, and a failed live run read is named in its failures.
 */
export const recordListing = (source, listing, repoRoot = REPO_ROOT, { listedAt = new Date().toISOString(), otherRuns } = {}) => {
  if (source === "pullRequests" && !otherRuns) throw new Error("a pull request listing needs the live runs")
  return writeSource(source, (previous, state) => {
    const failed = new Set(listing.failures.filter((failure) => failure.key === undefined).map((failure) => failure.read))
    const withheld = new Set(listing.failures.filter((failure) => failure.key !== undefined).map((failure) => failure.key))
    const owned = runOwnedPullRequest(state)
    const ownership = (item) => {
      const runOwned = owned(item)
      return { runOwned, otherRun: !runOwned && otherRuns.claims(item) }
    }
    const open = {
      ...Object.fromEntries(Object.entries(previous.open).flatMap(([key, item]) => withheld.has(key) ? [[key, { ...item, unread: true }]] : failed.has(item.read) ? [[key, item]] : [])),
      ...Object.fromEntries(listing.items.map((item) => [item.key, source === "pullRequests" ? { ...item, ...ownership(item) } : item])),
    }
    const failures = [...listing.failures, ...(otherRuns?.failure ? [otherRuns.failure] : [])]
    return { open, marks: Object.fromEntries(Object.entries(previous.marks).filter(([key]) => key in open)), listedAt,
      ...(failures.length ? { failures } : {}) }
  }, repoRoot)
}

/** A pull request mark holds at its head; a reported mark holds at every head, until the collection drops it. */
const unmarkedAtHead = (source, contents, item) => {
  const mark = contents.marks[item.key]
  return !mark || (source === "pullRequests" && mark.action !== "reported" && mark.head !== item.head)
}

/**
 * An open item needs the model when it has no mark or, for a pull request, when its head moved. A
 * pull request from an unexpected author or with closed tickets is never pending: it has its own list.
 */
export const pendingItems = (source, contents) => Object.values(contents.open)
  .filter((item) => !item.runOwned && (source !== "pullRequests" || pullRequestClass(item) === "configured") && unmarkedAtHead(source, contents, item))

/** The pull requests from an unexpected author that the owner did not hear about yet. */
export const unreportedPullRequests = (contents) => Object.values(contents.open).filter((pull) => pull.unexpectedAuthor && !contents.marks[pull.key])

/** The pull requests whose every named ticket is closed, with no mark that holds at their current head. */
export const closedTicketPullRequests = (contents) => Object.values(contents.open).filter((pull) => pull.closedTickets && !pull.unread && unmarkedAtHead("pullRequests", contents, pull))

/** Reads the state of each ticket number once. A missing or deleted ticket reads as closed with no reason, so the owner decides its alert once; any other failed read is a named failure. */
const readTicketStates = async (numbers, readTicketState) => {
  const unique = [...new Set(numbers)]
  const states = await Promise.allSettled(unique.map((number) => readTicketState(number).catch((error) => {
    if (ticketIsMissing(error)) return { number, state: "CLOSED", stateReason: null }
    throw error
  })))
  return {
    stateOf: new Map(unique.flatMap((number, index) => states[index].status === "fulfilled" ? [[number, states[index].value]] : [])),
    failures: unique.flatMap((number, index) => states[index].status === "rejected"
      ? [{ read: `ticket #${number}`, number, message: String(states[index].reason?.message ?? states[index].reason) }] : []),
  }
}

const ticketNumberOfUrl = (url) => Number(String(url).split("/").at(-1))

/** The alert marks whose ticket carries the alert: a ticket, or the report of a ticket the owner decides. */
const TICKETED_ALERT_ACTIONS = ["ticket", "reported"]

/** The close reasons of a carrying ticket that the run acts on: completed compares scans, and a duplicate takes the surviving ticket. */
const RUN_DECIDED_CLOSE_REASONS = ["COMPLETED", "DUPLICATE"]

/** An alert whose carrying ticket closed as not planned or with no reason waits for the owner's decision. */
const ownerDecidesAlert = (alert) => Boolean(alert.closedTicket) && !RUN_DECIDED_CLOSE_REASONS.includes(alert.closedTicket.stateReason)

/**
 * The open alerts whose carrying ticket is closed, each with the close reason of its ticket. Only code
 * scanning of a completed ticket reads the newest scan of main. A reported mark holds while its ticket
 * stays closed with that reason. A failed ticket or scan read is a named failure; its alerts stay quiet.
 */
export const alertsWithClosedTickets = async (contents, { readTicketState, readNewestScan }) => {
  const marked = Object.values(contents.open).filter((alert) => TICKETED_ALERT_ACTIONS.includes(contents.marks[alert.key]?.action))
  const tickets = await readTicketStates(marked.map((alert) => ticketNumberOfUrl(contents.marks[alert.key].ticket)), readTicketState)
  const unreadTicket = new Set(tickets.failures.map((failure) => failure.number))
  const ticketOf = (alert) => tickets.stateOf.get(ticketNumberOfUrl(contents.marks[alert.key].ticket))
  const reasonOf = (alert) => ticketOf(alert).stateReason ?? null
  const decided = (alert) => contents.marks[alert.key].action === "reported" && (contents.marks[alert.key].stateReason ?? null) === reasonOf(alert)
  const closed = marked.filter((alert) => ticketOf(alert)?.state === "CLOSED" && !decided(alert))
  const comparesScan = (alert) => alert.kind === "code-scanning" && reasonOf(alert) === "COMPLETED"
  const scanned = [...new Set(closed.filter(comparesScan).map((alert) => alert.repository))]
  const scans = await Promise.allSettled(scanned.map((repository) => readNewestScan(repository)))
  const commitOf = new Map(scanned.flatMap((repository, index) => scans[index].status === "fulfilled" ? [[repository, scans[index].value]] : []))
  const unscanned = (alert) => comparesScan(alert) && !commitOf.has(alert.repository)
  return {
    items: closed.filter((alert) => !unscanned(alert)).map((alert) => ({ ...alert, ticket: contents.marks[alert.key].ticket, stateReason: reasonOf(alert),
      ...(comparesScan(alert) && commitOf.get(alert.repository) ? { scannedCommit: commitOf.get(alert.repository) } : {}) })),
    failures: [...tickets.failures.map(({ read, message }) => ({ read, message })),
      ...scanned.flatMap((repository, index) => scans[index].status === "rejected"
        ? [{ read: `${repository} code-scanning analyses`, message: String(scans[index].reason?.message ?? scans[index].reason) }] : [])],
    unreadKeys: [...marked.filter((alert) => unreadTicket.has(ticketNumberOfUrl(contents.marks[alert.key].ticket))), ...closed.filter(unscanned)].map((alert) => alert.key),
  }
}

/**
 * The pending and reported owner pull requests whose every named ticket is closed, with the close
 * reasons; one with an open ticket stays pending. `staleReports` names each reported pull request whose
 * tickets or close reasons differ from its mark, so the collection drops that mark. It makes no read:
 * it uses the ticket states of the listing, and a pull request whose ticket read failed never reaches it.
 */
export const pullRequestsWithClosedTickets = (contents) => {
  const reported = (pull) => contents.marks[pull.key]?.action === "reported"
  const closedTicketsOf = ({ tickets }) => tickets.length > 0 && tickets.every(({ state }) => state === "CLOSED")
    ? tickets.map(({ number, stateReason }) => ({ number, stateReason })) : null
  const candidates = Object.values(contents.open).filter((pull) => pull.ownerAuthor === true && !pull.runOwned && pullRequestClass(pull) === "configured" &&
    (reported(pull) || unmarkedAtHead("pullRequests", contents, pull))).map((pull) => ({ pull, closedTickets: closedTicketsOf(pull) }))
  return {
    items: candidates.filter(({ closedTickets }) => closedTickets).map(({ pull, closedTickets }) => ({ key: pull.key, closedTickets })),
    staleReports: candidates.filter(({ pull, closedTickets }) => reported(pull) &&
      JSON.stringify(contents.marks[pull.key].closedTickets ?? null) !== JSON.stringify(closedTickets)).map(({ pull }) => pull.key),
  }
}

/**
 * Records the closed tickets of each pull request in this collection on its open item, drops the
 * reported mark of each stale report, and reads it back.
 */
export const recordClosedTicketPullRequests = ({ items, staleReports = [] }, repoRoot = REPO_ROOT) => writeSource("pullRequests", (current) => {
  const closedTicketsOf = new Map(items.map((item) => [item.key, item.closedTickets]))
  return { ...current, open: Object.fromEntries(Object.entries(current.open)
    .map(([key, pull]) => [key, closedTicketsOf.has(key) ? { ...pull, closedTickets: closedTicketsOf.get(key) } : pull])),
  marks: Object.fromEntries(Object.entries(current.marks).filter(([key]) => !staleReports.includes(key))) }
}, repoRoot)

/**
 * Records the closed carrying ticket and its close reason on each closed-ticket alert of this
 * collection, for the receipt check, and their waiter keys, so the waiter does not wake for them again.
 */
export const recordTicketClosedAlerts = (items, repoRoot = REPO_ROOT) => writeSource("alerts", (current) => {
  const closedTicketOf = new Map(items.map((alert) => [alert.key, { ticket: alert.ticket, stateReason: alert.stateReason }]))
  return { ...current, open: Object.fromEntries(Object.entries(current.open).map(([key, alert]) =>
    [key, { ...alert, closedTicket: closedTicketOf.get(key) ?? null }])), ticketClosed: items.map(ticketClosedWakeKey) }
}, repoRoot)

const text = (value) => typeof value === "string" && value.trim().length > 0

const ACTIONS = {
  pullRequests: {
    merged: { valid: () => true },
    fix: { valid: (receipt) => carryingTicket(receipt.ticket), requirement: "a fix needs its carrying ticket" },
    closed: { valid: (receipt) => text(receipt.reason), requirement: "a closed pull request needs the written reason" },
    reported: { valid: () => true },
  },
  alerts: {
    ticket: { valid: (receipt) => carryingTicket(receipt.ticket) && text(receipt.cause), requirement: "an alert needs its carrying ticket and the verified cause" },
    reported: { valid: () => true },
    "false-positive": { valid: (receipt) => carryingTicket(receipt.ticket) && text(receipt.reason),
      requirement: "a false positive needs the ticket that holds the analysis and the reason" },
  },
}
export const INTAKE_GITHUB_SOURCES = Object.keys(ACTIONS)

const markOf = (source, item, receipt) => source === "pullRequests"
  ? { head: item.head, action: receipt.action, ...(receipt.ticket ? { ticket: receipt.ticket } : {}), ...(receipt.reason ? { reason: receipt.reason } : {}),
    ...(receipt.action === "reported" && item.closedTickets ? { closedTickets: item.closedTickets } : {}) }
  : { action: receipt.action, rule: item.rule ?? null, location: item.path ? `${item.path}${item.line ? `:${item.line}` : ""}` : null,
    ...(receipt.action === "reported" ? { ticket: item.closedTicket.ticket, stateReason: item.closedTicket.stateReason } : { ticket: receipt.ticket }),
    ...(receipt.cause ? { cause: receipt.cause } : {}), ...(receipt.reason ? { reason: receipt.reason } : {}) }

/** Returns the open item of a valid receipt, or throws the requirement the receipt misses. */
const receiptItem = (source, current, receipt) => {
  const actions = ACTIONS[source]
  if (!actions) throw new Error(`Unknown source ${source}; use ${INTAKE_GITHUB_SOURCES.join(" or ")}`)
  const item = current.open[receipt?.key]
  if (!item) throw new Error(`No open ${source} item matches the receipt key`)
  if (!Object.hasOwn(actions, receipt.action)) throw new Error(`Unknown ${source} action; use ${Object.keys(actions).join(", ")}`)
  if (!actions[receipt.action].valid(receipt)) throw new Error(actions[receipt.action].requirement)
  if (source === "alerts") {
    const ownerDecides = ownerDecidesAlert(item)
    if (ownerDecides !== (receipt.action === "reported")) throw new Error(ownerDecides
      ? "an alert whose carrying ticket closed as not planned or with no reason goes to the owner; record reported"
      : "only an alert whose carrying ticket closed as not planned or with no reason is reported")
    return item
  }
  const { actions: permitted, refusal } = PULL_REQUEST_CLASSES[pullRequestClass(item)]
  if (!permitted.includes(receipt.action)) throw new Error(refusal)
  if (receipt.head !== item.head) throw new Error(`The receipt head is not the current head ${item.head}`)
  return item
}

const writeMark = (source, receipt, repoRoot) => writeSource(source, (current) => {
  const item = receiptItem(source, current, receipt)
  return { ...current, marks: { ...current.marks, [item.key]: { ...markOf(source, item, receipt), markedAt: new Date().toISOString() } } }
}, repoRoot)

/**
 * Records what the model did with one open item, at the head it acted on for a pull request. A false
 * positive is recorded only by dismissAlert, so the mark never exists without its dismissal.
 */
export const markItem = (source, receipt, repoRoot = REPO_ROOT) => {
  if (source === "alerts" && receipt?.action === "false-positive") throw new Error("a false positive is recorded only by --dismiss, which dismisses the alert first")
  return writeMark(source, receipt, repoRoot)
}

/** The request of each alert kind that closes a false positive, from the REST description of each "Update an alert" endpoint. */
const DISMISSALS = {
  "code-scanning": { body: { state: "dismissed", dismissed_reason: "false positive" }, comment: "dismissed_comment" },
  dependabot: { body: { state: "dismissed", dismissed_reason: "inaccurate" }, comment: "dismissed_comment" },
  "secret-scanning": { body: { state: "resolved", resolution: "false_positive" }, comment: "resolution_comment" },
}

/**
 * Dismisses a false positive on GitHub, then records its mark. A failed write records nothing.
 * The comment names the ticket that holds the analysis; it stays below the 280-character limit.
 */
export const dismissAlert = async (receipt, { repositories, write, repoRoot = REPO_ROOT }) => {
  const dismissal = { ...receipt, action: "false-positive" }
  const alert = receiptItem("alerts", sourceOf(intakeRun(repoRoot), "alerts"), dismissal)
  const slug = repositories.find((repository) => repository.key === alert.repository)?.slug
  if (!slug) throw new Error(`No repository matches ${alert.repository}`)
  const { body, comment } = DISMISSALS[alert.kind]
  await write("PATCH", `repos/${slug}/${alert.kind}/alerts/${alert.number}`, { ...body, [comment]: `False positive; the analysis is on ${receipt.ticket}` })
  return writeMark("alerts", dismissal, repoRoot)
}
