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
      reviews(last: 50, author: "pullfrog[bot]") {
        totalCount
        pageInfo { hasPreviousPage startCursor }
        nodes {
          state
          submittedAt
          author { __typename login }
          commit { oid }
        }
      }
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
 * The GitHub App that reviews every pull request, and the context it publishes when it can.
 *
 * The two APIs spell the same actor differently, confirmed live on 2026-09-08 rather than assumed:
 * REST `pulls/<n>/reviews` reports `user.login` as `pullfrog[bot]`, while GraphQL reports
 * `author.login` as `pullfrog` with `__typename: "Bot"`. Matching strips a trailing `[bot]` and
 * requires the Bot typename, so a human account named `pullfrog` could never satisfy the review axis.
 *
 * THE FIELDS THIS QUERY PARSES, introspected from the live schema on 2026-09-08 rather than inferred
 * from one response, because nullability is what decides whether a missing value is a verdict or a
 * broken read:
 *
 *   PullRequest.reviews  OBJECT PullRequestReviewConnection, NULLABLE
 *   review.state         NON_NULL enum PullRequestReviewState
 *   review.submittedAt   SCALAR DateTime, NULLABLE (a PENDING review has not been submitted)
 *   review.author        INTERFACE Actor, NULLABLE (a deleted account)
 *   review.commit        OBJECT Commit, NULLABLE
 *
 * The complete state enum is `PENDING`, `COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`, `DISMISSED`.
 * Only `APPROVED` satisfies the review axis, so each of the other four blocks by falling through, and
 * two of them matter specifically. A `DISMISSED` review is a withdrawn approval and GitHub rewrites the
 * review's own state, so taking the NEWEST review at the head sees `DISMISSED` rather than the approval
 * it used to be. A `PENDING` review carries a null `submittedAt`, which sorts first rather than last
 * and therefore cannot displace a submitted approval.
 */
export const REVIEW_APP_LOGIN = "pullfrog"
export const REVIEW_APP_CONTEXT = "pullfrog-approval"
export const REVIEW_APP_ID = 1768019

/**
 * The login the `reviews(author:)` FILTER accepts, which is NOT the login the same query REPORTS.
 * Measured against pull request 786 on 2026-09-08, never assumed:
 *
 *   author: "pullfrog[bot]"  totalCount 112
 *   author: "pullfrog"       totalCount 0
 *   author: "app/pullfrog"   totalCount 0
 *
 * while every returned node reports `author.login` as `pullfrog`. Filtering on the spelling the
 * response hands back therefore matches NOTHING and would have silently emptied the review axis,
 * which is why this constant exists separately from REVIEW_APP_LOGIN instead of reusing it.
 *
 * The filter is what makes the bounded window safe. Unfiltered, pull request 786 carries 174 reviews
 * against a 50-node window, so an exact-head approval could be evicted by unrelated reviews and read
 * as no verdict at all. Narrowed to this app, the newest 50 of ITS reviews always contain the head's
 * verdict when one exists, because no later review can arrive after the current head's.
 */
export const REVIEW_APP_AUTHOR_FILTER = "pullfrog[bot]"

/**
 * The key an out-of-band excuse is stored and looked up under: the required check's context AND its app
 * pin. Both readers build it from the same function, so a caller cannot excuse a pair it did not mean
 * to. `appId: null` on a protection entry means any producer may supply the check, so it is a distinct
 * key from a pinned one rather than a wildcard.
 */
export const outOfBandKey = (required) => JSON.stringify([required.context, required.appId ?? null])

/**
 * The excuses an exact-head review earns, as the keys `requiredCheckSatisfied` looks up.
 *
 * Both readers of the review axis build the set HERE. The defect that produced this function was the
 * two of them applying different halves of one rule: `record-readiness.mjs` honoured the fallback
 * while `verify-delivery.mjs` still recorded the absent context as pending, and the delivery
 * artifact's resulting `ci.pass: false` is a veto the receipt honours, so on a protected base the
 * fallback could never reach READY however correct the live evaluation was.
 *
 * An APPROVED review by the reviewing app speaks to a requirement pinned to THAT app, and to one
 * pinned to no app at all because any producer satisfies that. It says nothing about the same context
 * required from some OTHER app, so that pair is deliberately absent from the set.
 */
export const reviewSatisfiedOutOfBand = (reviewVerdict) => {
  if (reviewVerdict?.state !== "APPROVED") return new Set()
  return new Set([outOfBandKey({ context: REVIEW_APP_CONTEXT, appId: REVIEW_APP_ID }), outOfBandKey({ context: REVIEW_APP_CONTEXT, appId: null })])
}

const normalizeReviewNode = (node) => {
  if (typeof node?.state !== "string" || node.state === "") return null
  const commitOid = node.commit?.oid ?? null
  if (commitOid !== null && typeof commitOid !== "string") return null
  /**
   * `PullRequestReview.author` is NULLABLE in GitHub's schema: a review by a since-deleted account
   * returns `author: null`. Refusing that node would return null from pullRequestStateFromGraphQl and
   * turn the whole read into an environment error, so ONE unrelated deleted reviewer anywhere in the
   * last 50 reviews would break every readiness read on that pull request. That is a fail-shut bug and
   * it is worse than the gap it guards.
   *
   * An unidentifiable author is not the reviewing app, so it is kept as an ordinary non-app review:
   * `login: null` and `isBot: false` can never match REVIEW_APP_LOGIN, so it can never satisfy the
   * review axis, and it never poisons the read either.
   */
  const author = node.author
  const identified = typeof author?.login === "string" && typeof author?.__typename === "string"
  return {
    state: node.state,
    submittedAt: typeof node.submittedAt === "string" ? node.submittedAt : null,
    login: identified ? author.login.replace(/\[bot\]$/, "") : null,
    isBot: identified && author.__typename === "Bot",
    commitOid,
  }
}

/**
 * The reviewing app's NEWEST review at the exact head, or null when it has not reviewed that head.
 *
 * Newest, never first. Pullfrog often submits TWO reviews seconds apart, COMMENTED then APPROVED: on
 * PR 832 they arrived at 05:44:04Z and 05:44:39Z. A reader that returns on the first one reports
 * COMMENTED and hides a real approval, so this sorts by `submittedAt` and takes the last.
 */
export const reviewAppVerdictAtHead = (reviews, headOid) => {
  if (!Array.isArray(reviews) || typeof headOid !== "string" || headOid === "") return null
  const atHead = reviews.filter((review) => review.isBot && review.login === REVIEW_APP_LOGIN && review.commitOid === headOid)
  if (atHead.length === 0) return null
  return atHead.reduce((newest, review) => (String(review.submittedAt ?? "") >= String(newest.submittedAt ?? "") ? review : newest))
}

/**
 * ONE older page of the SAME filtered review connection, used only when the newest page did not
 * carry the current head's verdict AND reported more records behind it.
 *
 * It selects exactly the fields the newest page selects, so `reviewPageFromGraphQl` and
 * `pullRequestStateFromGraphQl` normalise identical nodes and the walk cannot see a different shape
 * on page two than it saw on page one.
 *
 * `before` is a nullable String argument on `PullRequest.reviews`, confirmed by introspection on
 * 2026-09-09 alongside `after`, `first`, `last`, `states` and `author`. Paging with `last` plus
 * `before` walks from the newest record towards the oldest, which is the direction a newest-wins
 * verdict has to be searched in.
 */
const REVIEW_PAGE_QUERY = `query ReviewPage($owner: String!, $name: String!, $number: Int!, $before: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews(last: 50, before: $before, author: "pullfrog[bot]") {
        totalCount
        pageInfo { hasPreviousPage startCursor }
        nodes {
          state
          submittedAt
          author { __typename login }
          commit { oid }
        }
      }
    }
  }
}`

/**
 * The truncation flag of a review connection, or null when the response is not the confirmed shape.
 *
 * `PageInfo` is NON_NULL and `PageInfo.hasPreviousPage` is NON_NULL `Boolean` (introspected
 * 2026-09-09), so an absent, null or non-boolean value is a BROKEN response and never `false`.
 * Reading it as `=== true` coerced exactly that case into "nothing older remains", which
 * `resolveReviewVerdict` then reported as a PROVEN absence. That is the fail-shut inversion this
 * file keeps warning about, one layer further down: a malformed page could hide a real exact-head
 * approval and be recorded as evidence that none exists.
 *
 * `startCursor` stays NULLABLE by contract, so a missing cursor is not a broken read; it simply ends
 * the walk as incomplete.
 */
const truncationOf = (connection) => {
  const hasPreviousPage = connection?.pageInfo?.hasPreviousPage
  return typeof hasPreviousPage === "boolean" ? hasPreviousPage : null
}

/** The one argv both readers send for an older review page, for the same reason they share the
 * state argv: two spellings of the same walk is how the two readers drift apart. */
export const reviewPageArgv = (repository, prNumber, before) => {
  const [owner, name, ...rest] = String(repository).split("/")
  if (!owner || !name || rest.length > 0) throw new Error(`"${repository}" is not an owner/name GitHub repository`)
  if (typeof before !== "string" || before === "") throw new Error("an older review page needs the cursor the previous page reported")
  return ["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${prNumber}`, "-F", `before=${before}`, "-f", `query=${REVIEW_PAGE_QUERY}`]
}

/**
 * One older review page, or null when the response is not the confirmed shape. Nullability matches
 * the newest page exactly: a null connection and a null node list both read as no reviews, a null
 * ELEMENT is skipped, and a malformed but PRESENT review object is refused.
 */
export const reviewPageFromGraphQl = (payload) => {
  const connection = payload?.data?.repository?.pullRequest?.reviews
  if (connection === undefined) return null
  const nodes = connection === null || connection?.nodes === null ? [] : connection?.nodes
  if (!Array.isArray(nodes)) return null
  const reviews = []
  for (const node of nodes) {
    if (node === null) continue
    const normalized = normalizeReviewNode(node)
    if (!normalized) return null
    reviews.push(normalized)
  }
  if (connection === null) return { reviews, truncated: false, startCursor: null }
  const truncated = truncationOf(connection)
  if (truncated === null) return null
  return {
    reviews,
    truncated,
    startCursor: typeof connection.pageInfo.startCursor === "string" ? connection.pageInfo.startCursor : null,
  }
}

/**
 * How many older pages the walk will read before it gives up and reports an INCOMPLETE read.
 *
 * A bound rather than an unbounded loop, because the per-user GraphQL budget that stalled a run on
 * 2026-08-09 is the reason this file reads once in the common case. Four extra pages cover 250
 * filtered reviews, which is past the largest history this repository has (112 on pull request 786,
 * read 2026-09-09). Past the bound the answer is "not proven", never "absent".
 */
export const MAX_REVIEW_PAGES = 4

/**
 * The reviewing app's newest APPROVED-or-otherwise verdict at the exact head, and whether that
 * answer is PROVEN.
 *
 * `reviewAppVerdictAtHead` alone cannot tell "this app never reviewed this head" from "the window
 * did not reach far enough to see it". Both come back as null, and both readers turned that null
 * into a blocked receipt, which is the false BLOCKED this pull request exists to remove. So the
 * walk goes backwards while the connection says more records remain, and stops the moment a verdict
 * appears.
 *
 * Newest-first is what makes stopping early correct: an at-head review found on page N is the
 * newest at-head review, because every newer record was already read on pages 1..N-1.
 *
 * `complete` is false ONLY when no verdict was found and older records provably remain. A caller
 * must not read that as an absence: it is a read that did not finish.
 *
 * `fetchOlderPage(cursor)` returns the parsed page, or null when the request failed. A failed page
 * ends the walk as INCOMPLETE rather than as an absence, for the same reason.
 */
export const resolveReviewVerdict = async (state, fetchOlderPage) => {
  const verdict = reviewAppVerdictAtHead(state?.reviews, state?.headRefOid)
  if (verdict) return { verdict, complete: true, pagesRead: 0 }
  let truncated = state?.reviewsTruncated === true
  let cursor = state?.reviewsStartCursor ?? null
  let pagesRead = 0
  while (truncated && cursor !== null && pagesRead < MAX_REVIEW_PAGES) {
    const page = await fetchOlderPage(cursor)
    pagesRead += 1
    if (!page) return { verdict: null, complete: false, pagesRead }
    const found = reviewAppVerdictAtHead(page.reviews, state?.headRefOid)
    if (found) return { verdict: found, complete: true, pagesRead }
    truncated = page.truncated
    cursor = page.startCursor
  }
  /**
   * `!truncated` and nothing else. A null cursor beside `hasPreviousPage: true` means older records
   * remain and there is no way to reach them, which is a read that could not finish, not a proof that
   * the verdict is absent. Treating an exhausted cursor as an absence would reintroduce the exact
   * silent false negative this walk exists to remove.
   */
  return { verdict: null, complete: !truncated, pagesRead }
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
  /**
   * THREE nullable layers on the review path, every one introspected rather than assumed, because
   * this exact mistake has now been made twice here in opposite directions:
   *
   *   PullRequest.reviews                    OBJECT PullRequestReviewConnection   nullable
   *   PullRequestReviewConnection.nodes      LIST(PullRequestReview)              nullable
   *   the LIST's own elements                PullRequestReview                    nullable
   *
   * `nodes` is a bare LIST of a bare OBJECT: neither the list nor its elements is wrapped in
   * NON_NULL, so `{ nodes: null }` and `[null]` are both responses the schema permits. Refusing
   * either turned the WHOLE read into an environment error, which aborts both readers before they can
   * use even a present, green approval check. That is the fail-shut shape again: a defensive read
   * that is worse than the gap it guards.
   *
   * So a null connection and a null node list both read as no reviews, and a null ELEMENT is skipped
   * as evidence that is simply not the reviewing app. A malformed but PRESENT review object is still
   * refused, because that is a genuinely broken read rather than a shape the schema allows.
   */
  const reviewsConnection = pullRequest.reviews
  const reviewNodes = reviewsConnection === null || reviewsConnection?.nodes === null ? [] : reviewsConnection?.nodes
  if (!Array.isArray(reviewNodes)) return null
  const reviews = []
  for (const node of reviewNodes) {
    if (node === null) continue
    const normalized = normalizeReviewNode(node)
    if (!normalized) return null
    reviews.push(normalized)
  }
  /**
   * Whether the window cut off older reviews BY THIS APP, and the cursor to walk back through them.
   *
   * An earlier comment here claimed truncation could never hide the current head's verdict, because
   * no review can be newer than the newest. That is wrong, and GitHub documents why: `commit_id` on
   * create-review may name a NON-latest pull request commit, so a review submitted later can be
   * pinned to an older commit. Fifty such records after an at-head approval evict it from this
   * window. Measured on 2026-09-09 against pull request 786, the filtered connection returns
   * `totalCount: 112` with `hasPreviousPage: true`, and one commit there carried fourteen reviews
   * inside thirty minutes, so the window is a real bound and not a theoretical one.
   *
   * `pageInfo` is NON_NULL and `hasPreviousPage` is NON_NULL Boolean (introspected 2026-09-09), so a
   * missing or non-boolean flag is a broken read and is refused by `truncationOf` rather than
   * silently becoming `false`. `startCursor` is NULLABLE, so an absent cursor reads as no cursor.
   */
  const reviewsTruncated = reviewsConnection === null || reviewsConnection === undefined ? false : truncationOf(reviewsConnection)
  if (reviewsTruncated === null) return null
  const reviewsStartCursor = typeof reviewsConnection?.pageInfo?.startCursor === "string" ? reviewsConnection.pageInfo.startCursor : null
  return { number, baseRefName, baseRefOid, headRefOid, isDraft, statusCheckRollup, reviews, reviewsTruncated, reviewsStartCursor }
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

/** Delivery observation and final aggregation bind the same normalized latest-check evidence
 * (#429). Sorting ignores API ordering while retaining rerun, producer, and PR identity changes. */
export const registrationFingerprint = (state, newestByCheck) => JSON.stringify([
  state.headRefOid, state.baseRefOid, state.baseRefName,
  [...newestByCheck].sort(([left], [right]) => left.localeCompare(right)),
])

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

/**
 * Whether a required check is registered under its pinned producer, or is absent from the rollup but
 * proved by evidence the rollup does not carry (#440).
 *
 * ONE predicate, because the delivery reader and the readiness reader must answer this question
 * identically. Answering it twice is how a fallback that worked in `record-readiness.mjs` still died
 * on the `ci.pass: false` that `verify-delivery.mjs` had already written.
 *
 * `satisfiedOutOfBand` is keyed by the context AND ITS APP PIN through `outOfBandKey`. Keying it by
 * context alone was a real hole: a requirement of `{ context: "pullfrog-approval", appId: 15368 }`
 * would have been excused by a review from app 1768019, and a review by one app proves nothing about a
 * check required from another.
 *
 * Three properties hold together, and each was a finding before it was a property:
 *
 *   - the context must be absent from the rollup ENTIRELY, under any producer. Excusing a context
 *     that merely failed its app pin would waive a check published by the WRONG app, which is what
 *     "unprotected review from the wrong app cannot reach READY" exists to catch;
 *   - the requirement's own app pin must be one the evidence speaks to, which the key enforces;
 *   - a check that IS registered is satisfied here and still faces its own pass rule in both readers,
 *     so a red check can never be waived this way.
 *
 * Absence of a check is not absence of a requirement; it is a requirement proved by something else.
 */
export const requiredCheckSatisfied = (newest, required, satisfiedOutOfBand = new Set()) => {
  if (findRegisteredCheck(newest, required)) return true
  if (!satisfiedOutOfBand.has(outOfBandKey(required))) return false
  return ![...newest.values()].some((node) => contextOf(node) === required.context)
}

/** The single pass rule. Delivery classifies a failure apart from a pending check, and its two
 * buckets are exactly the complement of this, so the two readings of CI cannot disagree. */
const checkPasses = (node) => {
  if (node.__typename === "StatusContext" || typeof node.state === "string") return node.state === "SUCCESS"
  return node.status === "COMPLETED" && PASSING_CONCLUSIONS.has(node.conclusion)
}

/** Same newest-rerun-wins CI reading as delivery, used by record-readiness's live evaluation. */
export const readinessCiIsGreen = (rollup, requiredChecks, satisfiedOutOfBand = new Set()) => {
  if (!requiredChecksAreValid(requiredChecks)) return false
  const newest = newestChecks(rollup)
  if (!newest) return false
  if (requiredChecks.some((required) => !requiredCheckSatisfied(newest, required, satisfiedOutOfBand))) return false
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
