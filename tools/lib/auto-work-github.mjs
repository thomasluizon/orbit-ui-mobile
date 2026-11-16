import { resolve } from "node:path"
import { configuredRepositorySlug } from "./admission.mjs"
import { activeIntakeRun, carryingTicket } from "./auto-work-intake.mjs"
import { runBounded } from "./bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./github-auth.mjs"
import { readOrchestratorConfig } from "./orchestrator-config.mjs"
import { REPO_ROOT, updateRunState } from "./run-state.mjs"

/** The three code repositories whose open pull requests and alerts auto-work reads every cycle. */
export const REPOSITORY_KEYS = ["ui", "api", "landing"]

/*
 * The REST logins of the bots each repository configures to open pull requests: Dependabot (dependabot.yml
 * and the security updates setting) and the App of ui's contract-rebaseline.yml. Runs open as the owner.
 */
export const CONFIGURED_PULL_REQUEST_BOTS = {
  ui: ["dependabot[bot]", "orbit-contract-rebaseline[bot]"],
  api: ["dependabot[bot]"],
  landing: ["dependabot[bot]"],
}

/** An author outside the configured bots and the repository owner is unexpected. */
export const unexpectedAuthor = ({ key, slug }, author) => author !== slug.split("/")[0] && !(CONFIGURED_PULL_REQUEST_BOTS[key] ?? []).includes(author)

/*
 * Each projection prints one JSON line per item across every page. The fields come from live reads;
 * the secret scanning fields come from GitHub's published REST description, because no repository
 * has had a secret scanning alert. The secret is never projected, and hide_secret omits it.
 */
const PULL_REQUEST_PROJECTION = ".[] | {number, author: .user.login, authorType: .user.type, head: .head.sha, base: .base.ref, draft, title, url: .html_url} | tojson"

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

/** Reads every page of one REST list through gh with the token of the repository owner. */
export const githubPageReader = ({ config = readOrchestratorConfig(), repoRoot = REPO_ROOT, run = runBounded, signal } = {}) => {
  let authentication
  return async (path, projection) => {
    // A failed token read is not kept, so the next read of a long-lived waiter tries again.
    const auth = await (authentication ??= githubEnvironment(resolve(repoRoot, config.repos.ui))
      .catch((error) => { authentication = undefined; throw error }))
    const result = await run(process.env.GH_BIN || "gh", ["api", "--paginate", path, "--jq", projection],
      { env: auth.environment, timeoutMs: config.timeouts.gitRemoteSeconds * 1000, signal })
    if (result.error || result.timedOut || result.status !== 0) {
      const reason = result.error?.message ?? (result.timedOut ? "timed out" : lastLine(result.stderr) || `exit ${result.status}`)
      throw new Error(`GitHub read failed at ${path}: ${redactSecrets(reason, auth.secrets)}`)
    }
    return result.stdout.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line))
  }
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

export const listOpenPullRequests = ({ repositories, readPages }) => settleReads(repositories.map((repository) => ({
  read: `${repository.key} pulls`,
  list: async () => (await readPages(`repos/${repository.slug}/pulls?state=open&per_page=100`, PULL_REQUEST_PROJECTION)).map((pull) => ({
    key: `${repository.key}#${pull.number}`, read: `${repository.key} pulls`, repository: repository.key, ...pull,
    unexpectedAuthor: unexpectedAuthor(repository, pull.author) })),
})))

export const listOpenAlerts = ({ repositories, readPages }) => settleReads(repositories.flatMap(({ key, slug }) => ALERT_READS.map((source) => ({
  read: `${key} ${source.kind}`,
  list: async () => (await readPages(`repos/${slug}/${source.kind}/alerts?${source.query}`, source.projection)).map((alert) => ({
    key: `${key} ${source.kind} ${alert.number}`, read: `${key} ${source.kind}`, repository: key, kind: source.kind, ...alert,
    message: String(alert.message ?? "").trim().split("\n")[0] })),
}))))

/** The pull requests this run opened, which /orchestrate already drives from its readiness ledger. */
export const runPullRequestKeys = (state) => new Set([...(state?.pullRequests ?? []), ...(state?.readinessLedger ?? [])]
  .filter((entry) => typeof entry?.repositoryKey === "string" && Number.isInteger(entry?.prNumber))
  .map((entry) => `${entry.repositoryKey}#${entry.prNumber}`))

/**
 * The waiter key of a pull request carries its head, so a new head is a new key. The owner hears
 * about a pull request from an unexpected author once, so its key has no head.
 */
export const pullRequestWakeKey = (pull) => pull.unexpectedAuthor ? pull.key : `${pull.key} ${pull.head}`

/** Turns a listing into waiter keys; it rejects only when no read succeeded. */
const wakeKeys = (listing, keyOf) => {
  const failure = listing.failures.map((entry) => entry.message).join("; ")
  if (listing.failures.length === listing.reads.length) throw new Error(failure)
  return { keys: listing.items.map(keyOf), ...(failure ? { failure } : {}) }
}

export const pullRequestCheck = ({ list, ownedKeys = () => new Set() }) => async () => {
  const listing = await list()
  const owned = ownedKeys()
  return wakeKeys({ ...listing, items: listing.items.filter((pull) => !owned.has(pull.key)) }, pullRequestWakeKey)
}

export const alertCheck = ({ list }) => async () => wakeKeys(await list(), (alert) => alert.key)

/** The keys the model listed in its last cycle, so the waiter does not wake for them again. */
export const listedWakeKeys = (intake) => ({
  ...(intake?.pullRequests?.open ? { pullRequests: Object.values(intake.pullRequests.open).filter((pull) => !pull.runOwned).map(pullRequestWakeKey) } : {}),
  ...(intake?.alerts?.open ? { alerts: Object.keys(intake.alerts.open) } : {}),
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
 * a failure never empties a source. Marks remain only for items that are still open.
 */
export const recordListing = (source, listing, repoRoot = REPO_ROOT, listedAt = new Date().toISOString()) =>
  writeSource(source, (previous, state) => {
    const failed = new Set(listing.failures.map((failure) => failure.read))
    const owned = runPullRequestKeys(state)
    const open = {
      ...Object.fromEntries(Object.entries(previous.open).filter(([, item]) => failed.has(item.read))),
      ...Object.fromEntries(listing.items.map((item) => [item.key, source === "pullRequests" ? { ...item, runOwned: owned.has(item.key) } : item])),
    }
    return { open, marks: Object.fromEntries(Object.entries(previous.marks).filter(([key]) => key in open)), listedAt,
      ...(listing.failures.length ? { failures: listing.failures } : {}) }
  }, repoRoot)

/**
 * An open item needs the model when it has no mark or, for a pull request, when its head moved. A
 * pull request from an unexpected author is never pending: the model only reports it.
 */
export const pendingItems = (source, contents) => Object.values(contents.open).filter((item) => {
  if (item.runOwned || item.unexpectedAuthor) return false
  const mark = contents.marks[item.key]
  return !mark || (source === "pullRequests" && mark.head !== item.head)
})

/** The pull requests from an unexpected author that the owner did not hear about yet. */
export const unreportedPullRequests = (contents) => Object.values(contents.open).filter((pull) => pull.unexpectedAuthor && !contents.marks[pull.key])

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
    "false-positive": { valid: (receipt) => carryingTicket(receipt.ticket) && text(receipt.reason),
      requirement: "a false positive needs the ticket that holds the analysis and the reason" },
  },
}
export const INTAKE_GITHUB_SOURCES = Object.keys(ACTIONS)

const markOf = (source, item, receipt) => source === "pullRequests"
  ? { head: item.head, action: receipt.action, ...(receipt.ticket ? { ticket: receipt.ticket } : {}), ...(receipt.reason ? { reason: receipt.reason } : {}) }
  : { action: receipt.action, rule: item.rule ?? null, location: item.path ? `${item.path}${item.line ? `:${item.line}` : ""}` : null, ticket: receipt.ticket,
    ...(receipt.cause ? { cause: receipt.cause } : {}), ...(receipt.reason ? { reason: receipt.reason } : {}) }

/** Records what the model did with one open item, at the head it acted on for a pull request. */
export const markItem = (source, receipt, repoRoot = REPO_ROOT) => writeSource(source, (current) => {
  const actions = ACTIONS[source]
  if (!actions) throw new Error(`Unknown source ${source}; use ${INTAKE_GITHUB_SOURCES.join(" or ")}`)
  const item = current.open[receipt?.key]
  if (!item) throw new Error(`No open ${source} item matches the receipt key`)
  if (!Object.hasOwn(actions, receipt.action)) throw new Error(`Unknown ${source} action; use ${Object.keys(actions).join(", ")}`)
  if (!actions[receipt.action].valid(receipt)) throw new Error(actions[receipt.action].requirement)
  if (source === "pullRequests" && Boolean(item.unexpectedAuthor) !== (receipt.action === "reported")) {
    throw new Error(item.unexpectedAuthor ? "a pull request from an unexpected author is never merged, fixed or closed; report it to the owner"
      : "only a pull request from an unexpected author is reported")
  }
  if (source === "pullRequests" && receipt.head !== item.head) throw new Error(`The receipt head is not the current head ${item.head}`)
  return { ...current, marks: { ...current.marks, [item.key]: { ...markOf(source, item, receipt), markedAt: new Date().toISOString() } } }
}, repoRoot)
