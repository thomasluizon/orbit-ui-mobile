/** Mechanical final-head readiness receipts. Evidence is retained, never silently cleared: when
 * head or base moves, readinessVerdicts names exactly which receipt became stale. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { gitDirectoryOf } from "./run-state.mjs"

const safeKey = (value) => String(value).replaceAll(/[^A-Za-z0-9_.-]/g, "-")

export const readinessReceiptPath = (repoRoot, repositoryKey, prNumber) =>
  join(gitDirectoryOf(repoRoot), "orbit-pr-readiness", `${safeKey(repositoryKey)}-${prNumber}.json`)

export const readReadinessReceipt = (repoRoot, repositoryKey, prNumber) => {
  try {
    return JSON.parse(readFileSync(readinessReceiptPath(repoRoot, repositoryKey, prNumber), "utf8"))
  } catch {
    return null
  }
}

export const writeReadinessReceipt = (repoRoot, receipt) => {
  const path = readinessReceiptPath(repoRoot, receipt.repositoryKey, receipt.prNumber)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`)
  return path
}

const currentEvidence = (evidence, receipt) =>
  evidence?.headSha === receipt.currentHeadSha && evidence?.baseSha === receipt.currentBaseSha

/**
 * The independent review is NOT an axis of this receipt. Pullfrog reviews every pull request in
 * GitHub Actions and publishes `pullfrog-approval`, which is a required status check on both
 * `main` branches, so the review verdict arrives through the required checks like any other gate.
 * A separate review axis here would be a second, weaker copy of a fact branch protection already
 * enforces, and the harness spent its worst failures keeping that copy pinned to the current head.
 *
 * That delegation only holds while this file reads a required check the way GitHub does. Protection
 * pins `pullfrog-approval` to app 1768019, so a same-named success from another producer must NOT
 * clear it: the receipt would say READY on a pull request GitHub refuses to merge.
 */

// Confirmed with live GraphQL enum introspection on 2026-08-07. Passing is an allowlist so a new
// GitHub conclusion cannot silently become green; STALE and every unknown value fail closed.
export const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"])

/**
 * ONE GraphQL request, and the same one `gh pr view --json statusCheckRollup` already sent. Measured
 * on 2026-08-12 with `GH_DEBUG=api gh pr view 716 --json number,statusCheckRollup`: that command
 * issues exactly one POST to https://api.github.com/graphql, asking for
 * `statusCheckRollup: commits(last: 1) { ... contexts(first: 100) }`, and its selection set carries
 * no producing app at all. One request replaces one request, so the per-user GraphQL budget the
 * header of record-readiness.mjs protects is unchanged, and the read now carries the identity that
 * branch protection pins.
 *
 * `contexts(first: 100)` is the page size gh itself uses. A rollup wider than one page arrives
 * short, a required check then reads as absent, and absent is already not green, so a truncated
 * page blocks rather than passes.
 */
const PULL_REQUEST_STATE_QUERY = `query PullRequestState($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      baseRefName
      baseRefOid
      headRefOid
      isDraft
      statusCheckRollup {
        contexts(first: 100) {
          nodes {
            __typename
            ... on CheckRun {
              name
              status
              conclusion
              startedAt
              completedAt
              detailsUrl
              checkSuite { app { databaseId } workflowRun { workflow { name } } }
            }
            ... on StatusContext { context state createdAt targetUrl }
          }
        }
      }
    }
  }
}`

/** The one argv the delivery reader and the readiness reader both send, so the two cannot drift. */
export const pullRequestStateArgv = (repository, prNumber) => {
  const [owner, name, ...rest] = String(repository).split("/")
  if (!owner || !name || rest.length > 0) throw new Error(`"${repository}" is not an owner/name GitHub repository`)
  return ["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${prNumber}`, "-f", `query=${PULL_REQUEST_STATE_QUERY}`]
}

const contextOf = (node) => (typeof node?.name === "string" ? node.name : typeof node?.context === "string" ? node.context : null)
const startedAtOf = (node) => String(node?.startedAt ?? node?.createdAt ?? "")

/**
 * The rollup mixes two node types with DIFFERENT fields, confirmed against a live response rather
 * than assumed. Normalising them here gives both tools one node shape whose `appId` is the GitHub
 * App that PUBLISHED the check.
 *
 * A StatusContext has no producing app: the GraphQL type carries avatarUrl, commit, context,
 * createdAt, creator, description, id, isRequired, state, targetUrl and updatedAt, and nothing
 * else (introspected 2026-08-12). Its producer is therefore unknown and its `appId` stays null.
 */
const normalizeRollupNode = (node) => {
  if (node?.__typename === "CheckRun") {
    return {
      __typename: "CheckRun",
      name: node.name,
      status: node.status ?? null,
      conclusion: node.conclusion ?? null,
      startedAt: node.startedAt ?? null,
      completedAt: node.completedAt ?? null,
      detailsUrl: node.detailsUrl ?? null,
      workflowName: node.checkSuite?.workflowRun?.workflow?.name ?? null,
      appId: node.checkSuite?.app?.databaseId ?? null,
    }
  }
  if (node?.__typename === "StatusContext") {
    return {
      __typename: "StatusContext",
      context: node.context,
      state: node.state ?? null,
      createdAt: node.createdAt ?? null,
      targetUrl: node.targetUrl ?? null,
      appId: null,
    }
  }
  return null
}

/**
 * The pull request state PULL_REQUEST_STATE_QUERY returns, or null when the response is not the
 * confirmed shape. Both callers turn null into a loud environment error rather than a verdict.
 *
 * `statusCheckRollup` is NULLABLE and null means no check exists on the head commit yet, which is
 * an empty rollup and not a broken read. Confirmed twice on 2026-08-12: schema introspection
 * reports `PullRequest.statusCheckRollup` as OBJECT rather than NON_NULL, and this repository's
 * root commit 1100e15b returns `"statusCheckRollup": null`.
 */
export const pullRequestStateFromGraphQl = (payload) => {
  const pullRequest = payload?.data?.repository?.pullRequest
  if (!pullRequest) return null
  const { number, baseRefName, baseRefOid, headRefOid, isDraft } = pullRequest
  if (!Number.isInteger(number) || typeof baseRefName !== "string" || typeof baseRefOid !== "string" || typeof headRefOid !== "string" || typeof isDraft !== "boolean") return null
  const nodes = pullRequest.statusCheckRollup === null ? [] : pullRequest.statusCheckRollup?.contexts?.nodes
  if (!Array.isArray(nodes)) return null
  const statusCheckRollup = []
  for (const node of nodes) {
    const normalized = normalizeRollupNode(node)
    if (!normalized || contextOf(normalized) === null) return null
    statusCheckRollup.push(normalized)
  }
  return { number, baseRefName, baseRefOid, headRefOid, isDraft, statusCheckRollup }
}

/**
 * Branch protection's `checks` array, NEVER its `contexts` array. `contexts` is the same list with
 * the producer erased. GitHub documents `checks` as `{ context: string, app_id: integer | null }`,
 * where `app_id` is the app that must provide the check and null means any app may provide it.
 * Read live on 2026-08-12 from
 * repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks, which
 * returned `{"context":"pullfrog-approval","app_id":1768019}` beside
 * `{"context":"Unit Tests","app_id":15368}`.
 */
export const requiredChecksOf = (payload) => {
  const checks = payload?.checks
  if (!Array.isArray(checks)) return null
  const required = []
  for (const entry of checks) {
    if (typeof entry?.context !== "string" || entry.context.length === 0) return null
    const appId = entry.app_id ?? null
    if (appId !== null && !Number.isInteger(appId)) return null
    required.push({ context: entry.context, appId })
  }
  return required
}

/** Both readers must classify the same protection response (#429). Confirmed live on 2026-09-05:
 * an unprotected branch returns a nonzero gh exit and JSON string status "404". Human-readable
 * error prose is not a contract; every other failed response remains an environment error. */
export const requiredChecksFromResponse = (payload, succeeded) =>
  succeeded ? requiredChecksOf(payload) : payload?.status === "404" ? [] : null

const requiredChecksAreValid = (required) =>
  Array.isArray(required) && required.every((entry) => typeof entry?.context === "string" && entry.context !== "" && (entry.appId === null || Number.isInteger(entry.appId)))

/**
 * Newest rerun wins, per PRODUCER. A rerun carries the same context and the same app, so it
 * replaces its own earlier entry, which is what the GitHub UI shows and the only reading under
 * which a re-run can go green. A same-named check from a DIFFERENT app is a different entry and
 * cannot displace the one branch protection requires.
 */
export const newestChecks = (rollup) => {
  if (!Array.isArray(rollup)) return null
  const newest = new Map()
  for (const node of rollup) {
    const context = contextOf(node)
    if (context === null) return null
    const key = JSON.stringify([context, node.appId ?? null])
    const previous = newest.get(key)
    if (!previous || startedAtOf(node) >= startedAtOf(previous)) newest.set(key, node)
  }
  return newest
}

/**
 * A required check is registered only when an observed entry carries BOTH its context and its
 * pinned producer, because that is the pairing GitHub itself enforces at the merge. A protection
 * entry with `appId: null` accepts any producer.
 *
 * A StatusContext carries no producing app, so a required check pinned to an app is NOT satisfied
 * by one and reads as absent, which already blocks. That fails closed, and it costs nothing on real
 * data: on 2026-08-12 all 21 required contexts on `main` arrived as CheckRun nodes whose
 * `checkSuite.app.databaseId` equalled the pinned `app_id`, and the single StatusContext in the
 * rollup (`Vercel`) is not a required check.
 */
export const findRegisteredCheck = (newest, required) => {
  for (const node of newest.values()) {
    if (contextOf(node) !== required.context) continue
    if (required.appId === null || node.appId === required.appId) return node
  }
  return null
}

/** The single pass rule. Delivery classifies a failure apart from a pending check, and its two
 * buckets are exactly the complement of this, so the two readings of CI cannot disagree. */
const checkPasses = (node) => {
  if (node.__typename === "StatusContext" || typeof node.state === "string") return node.state === "SUCCESS"
  return node.status === "COMPLETED" && PASSING_CONCLUSIONS.has(node.conclusion)
}

/** Same newest-rerun-wins CI reading as delivery, used by record-readiness's live evaluation. */
export const readinessCiIsGreen = (rollup, requiredChecks) => {
  if (!requiredChecksAreValid(requiredChecks)) return false
  const newest = newestChecks(rollup)
  if (!newest) return false
  if (requiredChecks.some((required) => !findRegisteredCheck(newest, required))) return false
  for (const node of newest.values()) {
    if (!checkPasses(node)) return false
  }
  return true
}

/** All verdicts are reported together, because fixing OUT_OF_DATE only to discover CI_STALE on
 * the next run turns a mechanical state machine back into a serial guessing loop. */
export const readinessVerdicts = (receipt) => {
  const verdicts = []
  if (!receipt || typeof receipt !== "object") return ["RECEIPT_MISSING"]
  if (receipt.draft) verdicts.push("DRAFT")
  if (!Number.isInteger(receipt.behindBy) || receipt.behindBy > 0) verdicts.push("OUT_OF_DATE")

  if (!currentEvidence(receipt.ci, receipt) || receipt.ci?.settled !== true || receipt.ci?.green !== true) {
    verdicts.push("CI_STALE")
  }

  const ticket = receipt.ticket
  if (!currentEvidence(ticket, receipt) || ticket?.lastSynchronizationResult !== "SUCCESS" || ticket?.lastPostedState !== "ready" || typeof ticket?.targetStatus !== "string" || ticket.targetStatus === "" || ticket?.status !== ticket.targetStatus) {
    verdicts.push("TICKET_STALE")
  }
  return [...new Set(verdicts)]
}

export const readinessReport = (receipt) => {
  const verdicts = readinessVerdicts(receipt)
  return {
    verdict: verdicts.length === 0 ? "READY" : verdicts[0],
    verdicts,
    repositoryKey: receipt?.repositoryKey ?? null,
    prNumber: receipt?.prNumber ?? null,
    baseBranch: receipt?.baseBranch ?? null,
    baseSha: receipt?.currentBaseSha ?? null,
    headSha: receipt?.currentHeadSha ?? null,
    behindBy: receipt?.behindBy ?? null,
    draft: receipt?.draft ?? null,
  }
}
