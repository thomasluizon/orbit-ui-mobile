import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import {
  REVIEW_AUTHORITY_PRIVATE_KEY,
  REVIEW_AUTHORITY_PRIVATE_KEY_ENV,
  REVIEW_AUTHORITY_PUBLIC_KEY,
  REVIEW_AUTHORITY_PUBLIC_KEY_ENV,
  REVIEW_EVIDENCE_LEDGER,
  REPO_ROOT,
  T,
  forgedReviewMarker,
  reviewMarker,
  root,
  toolPath,
} from "./_harness.mjs"
import { issueReviewProvenance } from "../lib/review-provenance.mjs"

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const OLD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const MARKER = (head, recommendation, extra = {}) =>
  Object.keys(extra).length === 0
    ? reviewMarker({ head, recommendation, findingIds: recommendation === "NEEDS_WORK" ? ["finding-0123456789abcdef0123456789abcdef"] : [] })
    : `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head, recommendation, ...extra })} -->`
const review = ({ id = "PRR_local_review", body, commit = HEAD, state = "COMMENTED", at = "2026-07-31T10:00:00Z", submittedAt = at, edited = null }) => ({
  id,
  state,
  body,
  submittedAt,
  updatedAt: edited ?? submittedAt,
  lastEditedAt: edited,
  url: "https://github.com/orbit/ui/pull/1#pullrequestreview-1",
  author: { login: "reviewer" },
  commit: commit === null ? null : { oid: commit },
})
const connection = (nodes, hasNextPage = false) => ({ pageInfo: { hasNextPage }, nodes })
const snapshot = (nodes, expectedHead = HEAD, reviewsHaveNextPage = false, filesHaveNextPage = false) => ({
  headRefOid: expectedHead,
  files: connection([], filesHaveNextPage),
  reviews: connection(nodes, reviewsHaveNextPage),
})
const runEvidence = (nodes, expectedHead = HEAD, reviewsHaveNextPage = false, filesHaveNextPage = false, { ledgerPath = REVIEW_EVIDENCE_LEDGER, repository = "orbit/ui", pullRequest = 615 } = {}) =>
  spawnSync(process.execPath, [toolPath("check-review-evidence.mjs"), "--repository", repository, "--pull-request", String(pullRequest), "--expected-head", expectedHead], {
    encoding: "utf8",
    input: JSON.stringify(snapshot(nodes, expectedHead, reviewsHaveNextPage, filesHaveNextPage)),
    env: { ...process.env, ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: ledgerPath },
  })

const reviewEvidenceCases = () => {
  const help = spawnSync(process.execPath, [toolPath("check-review-evidence.mjs"), "--help"], { encoding: "utf8" })
  T("check-review-evidence.mjs: --help documents input and exits", help.status === 0 && /pull-request snapshot containing headRefOid plus complete files and reviews[\s\S]*0 approved, 1 held, 2 invalid input/.test(help.stdout), help.stderr || help.stdout)

  const absent = runEvidence([])
  T("check-review-evidence.mjs: absent local review evidence blocks", absent.status === 1 && /AWAITING_REVIEW/.test(absent.stdout), absent.stderr || absent.stdout)

  const approve = runEvidence([review({ body: `${MARKER(HEAD, "APPROVE")}\n\nReviewed locally.` })])
  T("check-review-evidence.mjs: current complete APPROVE evidence passes", approve.status === 0 && /\"status\":\s*\"APPROVE\"/.test(approve.stdout), approve.stderr || approve.stdout)

  const needsWork = runEvidence([review({ body: MARKER(HEAD, "NEEDS_WORK") })])
  T("check-review-evidence.mjs: NEEDS_WORK blocks", needsWork.status === 1 && /\"status\":\s*\"NEEDS_WORK\"/.test(needsWork.stdout), needsWork.stderr || needsWork.stdout)

  const forged = runEvidence([review({ body: forgedReviewMarker({ head: HEAD, recommendation: "APPROVE" }) })])
  T("check-review-evidence.mjs: a hostile worker marker without a launcher receipt blocks", forged.status === 1 && /UNAUTHENTICATED/.test(forged.stdout), forged.stderr || forged.stdout)

  const replayLedger = join(root, "review-replay.jsonl")
  const oldApproval = issueReviewProvenance({ repository: "orbit/ui", pullRequest: 615, head: HEAD, reviewNodeId: "PRR_old_approval", recommendation: "APPROVE", issuedAt: "2026-07-31T10:00:00Z", ledgerPath: replayLedger, privateKey: REVIEW_AUTHORITY_PRIVATE_KEY })
  const laterNeedsWork = issueReviewProvenance({ repository: "orbit/ui", pullRequest: 615, head: HEAD, reviewNodeId: "PRR_later_needs_work", recommendation: "NEEDS_WORK", findingIds: ["finding-0123456789abcdef0123456789abcdef"], issuedAt: "2026-07-31T11:00:00Z", ledgerPath: replayLedger, privateKey: REVIEW_AUTHORITY_PRIVATE_KEY })
  const markerFor = (provenance, recommendation) => `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head: HEAD, recommendation, provenance })} -->`
  const replayedApproval = runEvidence([
    review({ id: "PRR_later_needs_work", body: markerFor(laterNeedsWork, "NEEDS_WORK"), at: "2026-07-31T11:00:00Z" }),
    review({ id: "PRR_old_approval", body: markerFor(oldApproval, "APPROVE"), at: "2026-07-31T12:00:00Z" }),
  ], HEAD, false, false, { ledgerPath: replayLedger })
  T("check-review-evidence.mjs: an older APPROVE cannot replay after a later NEEDS_WORK issuance", replayedApproval.status === 1 && /REPLAYED/.test(replayedApproval.stdout), replayedApproval.stderr || replayedApproval.stdout)
  const forgedReviewId = runEvidence([review({ id: "PRR_later_needs_work", body: markerFor(oldApproval, "APPROVE"), at: "2026-07-31T11:00:00Z" })], HEAD, false, false, { ledgerPath: replayLedger })
  T("check-review-evidence.mjs: a signed marker cannot move to another immutable GitHub review node", forgedReviewId.status === 1 && /UNAUTHENTICATED/.test(forgedReviewId.stdout), forgedReviewId.stderr || forgedReviewId.stdout)
  const hiddenNewerIssuance = runEvidence([
    review({ id: "PRR_old_approval", body: markerFor(oldApproval, "APPROVE"), submittedAt: "2026-07-31T10:00:00Z", edited: "2026-07-31T13:00:00Z" }),
    review({ id: "PRR_later_needs_work", body: "", submittedAt: "2026-07-31T11:00:00Z", edited: "2026-07-31T12:00:00Z" }),
  ], HEAD, false, false, { ledgerPath: replayLedger })
  T("check-review-evidence.mjs: hiding a newer NEEDS_WORK body cannot restore an older approval", hiddenNewerIssuance.status === 1 && /REPLAYED/.test(hiddenNewerIssuance.stdout), hiddenNewerIssuance.stderr || hiddenNewerIssuance.stdout)
  const currentNeedsWork = runEvidence([review({ body: markerFor(laterNeedsWork, "NEEDS_WORK") })], HEAD, false, false, { ledgerPath: replayLedger })
  T("check-review-evidence.mjs: the newest same-PR issuance is the only accepted verdict", currentNeedsWork.status === 1 && /NEEDS_WORK/.test(currentNeedsWork.stdout), currentNeedsWork.stderr || currentNeedsWork.stdout)
  const rollbackLedger = join(root, "review-ledger-rollback.jsonl")
  const rollbackApproval = issueReviewProvenance({ repository: "orbit/ui", pullRequest: 615, head: HEAD, reviewNodeId: "PRR_rollback_approval", recommendation: "APPROVE", issuedAt: "2026-07-31T10:00:00Z", ledgerPath: rollbackLedger, privateKey: REVIEW_AUTHORITY_PRIVATE_KEY })
  const rollbackNeedsWork = issueReviewProvenance({ repository: "orbit/ui", pullRequest: 615, head: HEAD, reviewNodeId: "PRR_rollback_needs_work", recommendation: "NEEDS_WORK", findingIds: ["finding-0123456789abcdef0123456789abcdef"], issuedAt: "2026-07-31T11:00:00Z", ledgerPath: rollbackLedger, privateKey: REVIEW_AUTHORITY_PRIVATE_KEY })
  const firstLedgerRow = readFileSync(rollbackLedger, "utf8").split(/\r?\n/).filter(Boolean)[0]
  writeFileSync(rollbackLedger, `${firstLedgerRow}\n`)
  const rollback = runEvidence([
    review({ id: "PRR_rollback_needs_work", body: markerFor(rollbackNeedsWork, "NEEDS_WORK"), at: "2026-07-31T11:00:00Z" }),
    review({ id: "PRR_rollback_approval", body: markerFor(rollbackApproval, "APPROVE"), at: "2026-07-31T12:00:00Z" }),
  ], HEAD, false, false, { ledgerPath: rollbackLedger })
  T("check-review-evidence.mjs: a worker-truncated local ledger cannot replay an older APPROVE marker", rollback.status === 1 && /REPLAYED/.test(rollback.stdout), rollback.stderr || rollback.stdout)
  const crossPullRequestLedger = join(root, "review-cross-pr-replay.jsonl")
  const otherPullRequest = issueReviewProvenance({ repository: "orbit/ui", pullRequest: 616, head: HEAD, reviewNodeId: "PRR_other_pull_request", recommendation: "APPROVE", issuedAt: "2026-07-31T12:00:00Z", ledgerPath: crossPullRequestLedger, privateKey: REVIEW_AUTHORITY_PRIVATE_KEY })
  const crossPullRequest = runEvidence([review({ body: markerFor(otherPullRequest, "APPROVE") })], HEAD, false, false, { ledgerPath: crossPullRequestLedger, pullRequest: 615 })
  T("check-review-evidence.mjs: a receipt for another pull request cannot replay on this pull request", crossPullRequest.status === 1 && /UNAUTHENTICATED/.test(crossPullRequest.stdout), crossPullRequest.stderr || crossPullRequest.stdout)

  const workerLedger = join(root, "worker-review-attempt.jsonl")
  const workerReviewModule = pathToFileURL(join(REPO_ROOT, "tools", "lib", "review-provenance.mjs")).href
  const workerEnvironment = { ...process.env, [REVIEW_AUTHORITY_PUBLIC_KEY_ENV]: REVIEW_AUTHORITY_PUBLIC_KEY }
  delete workerEnvironment[REVIEW_AUTHORITY_PRIVATE_KEY_ENV]
  const workerAttempt = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import { generateKeyPairSync } from "node:crypto"; import { issueReviewProvenance } from ${JSON.stringify(workerReviewModule)}; const { privateKey } = generateKeyPairSync("ed25519"); try { issueReviewProvenance({ repository: "orbit/ui", pullRequest: 615, head: "${HEAD}", reviewNodeId: "PRR_worker_attempt", recommendation: "APPROVE", ledgerPath: ${JSON.stringify(workerLedger)}, privateKey: privateKey.export({ format: "pem", type: "pkcs8" }) }); process.exit(0) } catch (error) { console.error(error.message); process.exit(1) }`,
  ], { encoding: "utf8", env: workerEnvironment })
  T("check-review-evidence.mjs: an implementation worker importing production provenance cannot mint APPROVE with its own key", workerAttempt.status === 1 && /does not match/.test(workerAttempt.stderr) && !existsSync(workerLedger), `${workerAttempt.status}\n${workerAttempt.stderr}`)

  const staleMarker = runEvidence([review({ body: MARKER(OLD, "APPROVE"), commit: HEAD })])
  T("check-review-evidence.mjs: stale marker head blocks", staleMarker.status === 1 && /STALE/.test(staleMarker.stdout), staleMarker.stderr || staleMarker.stdout)

  const staleCommit = runEvidence([review({ body: MARKER(HEAD, "APPROVE"), commit: OLD })])
  T("check-review-evidence.mjs: stale GitHub review commit blocks", staleCommit.status === 1 && /STALE/.test(staleCommit.stdout), staleCommit.stderr || staleCommit.stdout)

  const malformedLatest = runEvidence([
    review({ body: MARKER(HEAD, "APPROVE"), at: "2026-07-31T10:00:00Z" }),
    review({ body: '<!-- orbit-local-review: {"version":1} -->', at: "2026-07-31T11:00:00Z" }),
  ])
  T("check-review-evidence.mjs: malformed latest evidence supersedes an older approval", malformedLatest.status === 1 && /MALFORMED/.test(malformedLatest.stdout), malformedLatest.stderr || malformedLatest.stdout)

  const extraKey = runEvidence([review({ body: MARKER(HEAD, "APPROVE", { note: "no" }) })])
  T("check-review-evidence.mjs: marker keys must be exact", extraKey.status === 1 && /MALFORMED/.test(extraKey.stdout), extraKey.stderr || extraKey.stdout)

  for (const [label, body] of [
    ["invalid JSON", '<!-- orbit-local-review: {"version":1,} -->'],
    ["wrong version", `<!-- orbit-local-review: ${JSON.stringify({ version: 2, head: HEAD, recommendation: "APPROVE" })} -->`],
    ["invalid head", `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head: HEAD.toUpperCase(), recommendation: "APPROVE" })} -->`],
    ["unknown recommendation", `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head: HEAD, recommendation: "COMMENT" })} -->`],
  ]) {
    const malformed = runEvidence([review({ body })])
    T(`check-review-evidence.mjs: ${label} is malformed`, malformed.status === 1 && /MALFORMED/.test(malformed.stdout), malformed.stderr || malformed.stdout)
  }

  const badTimestamp = runEvidence([review({ body: MARKER(HEAD, "APPROVE"), at: "not-a-time" })])
  T("check-review-evidence.mjs: an unorderable marker timestamp blocks", badTimestamp.status === 1 && /MALFORMED/.test(badTimestamp.stdout), badTimestamp.stderr || badTimestamp.stdout)

  const badConnection = spawnSync(process.execPath, [toolPath("check-review-evidence.mjs"), "--repository", "orbit/ui", "--pull-request", "615", "--expected-head", HEAD], {
    encoding: "utf8",
    input: JSON.stringify({ headRefOid: HEAD, files: connection([]), reviews: { nodes: [] } }),
    env: { ...process.env, ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: REVIEW_EVIDENCE_LEDGER },
  })
  T("check-review-evidence.mjs: an incomplete review connection shape blocks", badConnection.status === 1 && /INCOMPLETE/.test(badConnection.stdout), badConnection.stderr || badConnection.stdout)

  const incompleteFiles = runEvidence([review({ body: MARKER(HEAD, "APPROVE") })], HEAD, false, true)
  T("check-review-evidence.mjs: incomplete file inventory blocks", incompleteFiles.status === 1 && /INCOMPLETE/.test(incompleteFiles.stdout), incompleteFiles.stderr || incompleteFiles.stdout)

  const quoted = runEvidence([review({ body: `Context\n${MARKER(HEAD, "APPROVE")}` })])
  T("check-review-evidence.mjs: a marker below other content is absent rather than evidence", quoted.status === 1 && /AWAITING_REVIEW/.test(quoted.stdout), quoted.stderr || quoted.stdout)

  const tied = runEvidence([
    review({ body: MARKER(HEAD, "APPROVE"), at: "2026-07-31T10:00:00Z" }),
    review({ body: MARKER(HEAD, "NEEDS_WORK"), at: "2026-07-31T10:00:00Z" }),
  ])
  T("check-review-evidence.mjs: latest timestamp ties are ambiguous", tied.status === 1 && /AMBIGUOUS/.test(tied.stdout), tied.stderr || tied.stdout)

  const pagination = runEvidence([review({ body: MARKER(HEAD, "APPROVE") })], HEAD, true)
  T("check-review-evidence.mjs: incomplete review inventory blocks", pagination.status === 1 && /INCOMPLETE/.test(pagination.stdout), pagination.stderr || pagination.stdout)

  const movedSnapshot = spawnSync(process.execPath, [toolPath("check-review-evidence.mjs"), "--repository", "orbit/ui", "--pull-request", "615", "--expected-head", HEAD], {
    encoding: "utf8",
    input: JSON.stringify({ headRefOid: OLD, files: connection([]), reviews: connection([review({ body: MARKER(HEAD, "APPROVE") })]) }),
    env: { ...process.env, ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: REVIEW_EVIDENCE_LEDGER },
  })
  T("check-review-evidence.mjs: an atomically read moved PR head blocks", movedSnapshot.status === 1 && /STALE/.test(movedSnapshot.stdout), movedSnapshot.stderr || movedSnapshot.stdout)

  const staleNative = runEvidence([
    review({ body: MARKER(HEAD, "APPROVE"), commit: HEAD }),
    review({ body: "native", commit: OLD, state: "APPROVED", at: "2026-07-31T09:00:00Z" }),
  ])
  T("check-review-evidence.mjs: a stale native approval blocks", staleNative.status === 1 && /STALE_NATIVE_APPROVAL/.test(staleNative.stdout), staleNative.stderr || staleNative.stdout)

  const currentNative = runEvidence([
    review({ body: MARKER(HEAD, "APPROVE"), commit: HEAD }),
    review({ body: "native", commit: HEAD, state: "APPROVED", at: "2026-07-31T09:00:00Z" }),
  ])
  T("check-review-evidence.mjs: current native approval and local approval pass", currentNative.status === 0, currentNative.stderr || currentNative.stdout)

  const badInput = spawnSync(process.execPath, [toolPath("check-review-evidence.mjs"), "--repository", "orbit/ui", "--pull-request", "615", "--expected-head", HEAD], { encoding: "utf8", input: "not-json", env: { ...process.env, ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: REVIEW_EVIDENCE_LEDGER } })
  T("check-review-evidence.mjs: invalid input exits 2", badInput.status === 2, badInput.stderr || badInput.stdout)
}

export { reviewEvidenceCases as cases }
