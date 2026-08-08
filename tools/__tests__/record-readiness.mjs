import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, stage, stageRepo, stageWithConfig, toolPath } from "./_harness.mjs"

const TOOL = "record-readiness.mjs"
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const ROUND_ONE_HEAD = "cccccccccccccccccccccccccccccccccccccccc"
const RUBRIC_BODY = "# pr-review rubric\n\nThe only review authority.\n"

/**
 * BASE is a REAL commit in the fixture repository, not a placeholder, because rubric provenance is
 * proven with git: record-readiness.mjs reads the rubric blob at this commit and compares the
 * materialized snapshot against it byte for byte. A fake SHA would exercise only the refusal arm.
 */
let BASE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

export const cases = () => {
  const repo = stageRepo("record-readiness")
  if (!repo) {
    T(`${TOOL}: a git fixture is available`, false, "could not stage repository")
    return
  }
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("record-readiness", TOOL, { ...real, repos: { ui: repo.path } })
  copyFileSync(toolPath("list-bot-threads.mjs"), join(staged.base, "tools", "list-bot-threads.mjs"))
  stage(
    "staged/record-readiness/tools/lib/github-issues.mjs",
    `export const resolveTicket = (reference) => {
  const identifier = String(reference).toUpperCase()
  if (!/^ORB-\\d+$/.test(identifier)) throw new Error("unknown ticket")
  return { identifier, number: Number(identifier.slice(4)) }
}
export const readTicket = async (number) => ({
  identifier: "ORB-" + number,
  number,
  status: process.env.ORBIT_TICKET_STATUS || "In Review",
  state: "OPEN",
  stateReason: null,
  labels: JSON.parse(process.env.ORBIT_TICKET_LABELS || '[{"name":"repo:ui"}]'),
})
export const assertRepositoryLabel = (ticket, repoKey) => {
  const labels = ticket.labels.filter((label) => label.name.startsWith("repo:")).map((label) => label.name)
  if (labels.length !== 1 || labels[0] !== "repo:" + repoKey) throw new Error("ticket repository label mismatch")
  return ticket
}
`,
  )

  mkdirSync(join(repo.path, ".claude", "skills", "pr-review"), { recursive: true })
  writeFileSync(join(repo.path, ".claude", "skills", "pr-review", "rubric.md"), RUBRIC_BODY)
  const committed =
    repo.git(["add", "--", ".claude/skills/pr-review/rubric.md"]).status === 0 &&
    repo.git(["commit", "-q", "-m", "rubric"]).status === 0 &&
    repo.git(["push", "-q", "origin", "main"]).status === 0
  T(`${TOOL}: the fixture repository carries a committed rubric`, committed, "could not commit the rubric into the fixture")
  BASE = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  const RUBRIC_BLOB = repo.git(["rev-parse", "HEAD:.claude/skills/pr-review/rubric.md"]).stdout.trim()
  const rubricSnapshot = stage("record-readiness/rubric.md", RUBRIC_BODY)
  const rubricProvenance = { rubricRepositoryKey: "ui", rubricCommitOid: BASE, rubricBlobOid: RUBRIC_BLOB, rubricArtifactPath: rubricSnapshot }
  T(`${TOOL}: the fixture resolved a real base commit and rubric blob`, /^[0-9a-f]{40}$/.test(BASE) && /^[0-9a-f]{40}$/.test(RUBRIC_BLOB), `base ${BASE}, blob ${RUBRIC_BLOB}`)

  repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ issue: "ORB-700", verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const review = stage("record-readiness/review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", ...rubricProvenance, frozenFindingIds: [], findings: [] }))
  const bot = stage("record-readiness/bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: true, counts: { unresolved: 0 }, threads: [] }))
  const ticketArtifact = stage("record-readiness/ticket.json", JSON.stringify({ issue: "ORB-700", repositoryKey: "ui", prNumber: 700, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  const argv = ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", review, "--bot", bot, "--ticket", ticketArtifact]
  const greenCheck = { __typename: "CheckRun", name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z", workflowName: "Guards" }
  const openedWorkflowRun = { databaseId: 10, createdAt: "2026-08-07T09:00:00Z", headSha: HEAD, status: "completed", conclusion: "success" }
  const live = (headRefOid = HEAD, baseRefOid = BASE, behindBy = 0, body = "Implements ORB-700", ticketStatus = "In Review", labels = [{ name: "repo:ui" }], options = {}) => {
    const reviewState = options.reviewState ?? "COMMENTED"
    const reviewThreads = options.openThread
      ? [{ id: "PRRT_open", isResolved: false, isOutdated: false, path: "tools/x.mjs", line: 1, comments: { nodes: [{ author: { login: "chatgpt-codex-connector" }, body: "P1 open" }] } }]
      : []
    const initialIdentity = { number: 700, baseRefName: "main", baseRefOid, headRefOid, isDraft: false, body, statusCheckRollup: options.statusCheckRollup ?? [greenCheck] }
    const finalIdentity = options.finalIdentity ?? initialIdentity
    const graphqlResponse = (state, threads) => JSON.stringify({ data: { repository: { pullRequest: {
      number: 700, isDraft: false, baseRefOid, headRefOid,
      reviews: { nodes: [{ author: { login: "chatgpt-codex-connector" }, state, submittedAt: "2026-08-07T10:00:00Z", body: "", commit: { oid: headRefOid } }] },
      comments: { nodes: [] },
      reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: threads },
    } } } })
    const finalReviewState = options.finalReviewState ?? reviewState
    const finalReviewThreads = options.finalOpenThread
      ? [{ id: "PRRT_final_open", isResolved: false, isOutdated: false, path: "tools/y.mjs", line: 2, comments: { nodes: [{ author: { login: "chatgpt-codex-connector" }, body: "P1 reopened" }] } }]
      : reviewThreads
    return {
      ...orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "pr view 700", stdout: JSON.stringify(initialIdentity), ...(options.identitySequenceFile ? { stdoutSequence: [JSON.stringify(initialIdentity), JSON.stringify(finalIdentity)], sequenceFile: options.identitySequenceFile } : {}) },
    { match: "pr edit 700", stdout: "" },
    { match: "run list --repo", stdout: JSON.stringify(options.guardsWorkflowRuns ?? [openedWorkflowRun]) },
    { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Lint"] }) },
    { match: "api graphql", stdout: graphqlResponse(reviewState, reviewThreads), ...(options.botSequenceFile ? { stdoutSequence: [graphqlResponse(reviewState, reviewThreads), graphqlResponse(finalReviewState, finalReviewThreads)], sequenceFile: options.botSequenceFile } : {}) },
    { match: "api repos/", stdout: JSON.stringify({ behind_by: behindBy }) },
      ]),
      ORBIT_TICKET_STATUS: ticketStatus,
      ORBIT_TICKET_LABELS: JSON.stringify(labels.length > 0 ? labels : [{ name: "repo:ui" }]),
    }
  }
  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })

  /**
   * Rubric provenance, proven end to end against real git rather than only as a pure unit. Each of
   * these is a way a dishonest or stale review could otherwise reach READY, and the receipt must
   * refuse every one of them even though the rest of the evidence is perfect.
   */
  const tampered = stage("record-readiness/rubric-tampered.md", `${RUBRIC_BODY}\nand a rule the reviewer added itself\n`)
  const withRubric = (overrides) =>
    stage(`record-readiness/review-${Object.keys(overrides).join("-")}.json`, JSON.stringify({
      reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE,
      artifactPath: "C:/scratch/review.json", ...rubricProvenance, ...overrides, frozenFindingIds: [], findings: [],
    }))
  const withArgv = (reviewPath) => ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", reviewPath, "--bot", bot, "--ticket", ticketArtifact]

  check(
    TOOL,
    "a hand-edited rubric snapshot cannot reach READY",
    withArgv(withRubric({ rubricArtifactPath: tampered })),
    { status: 1, stdout: /REVIEW_STALE/ },
    { path: staged.path, env: live() },
  )
  check(
    TOOL,
    "a review citing a rubric commit that is not this pull request's base cannot reach READY",
    withArgv(withRubric({ rubricCommitOid: HEAD })),
    { status: 1, stdout: /REVIEW_STALE/ },
    { path: staged.path, env: live() },
  )
  check(
    TOOL,
    "a review citing the wrong rubric blob cannot reach READY",
    withArgv(withRubric({ rubricBlobOid: "0000000000000000000000000000000000000000" })),
    { status: 1, stdout: /REVIEW_STALE/ },
    { path: staged.path, env: live() },
  )
  check(
    TOOL,
    "a review artifact carrying no rubric provenance at all is refused as an artifact error",
    withArgv(stage("record-readiness/review-no-provenance.json", JSON.stringify({
      reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE,
      artifactPath: "C:/scratch/review.json", frozenFindingIds: [], findings: [],
    }))),
    { status: 2, stderr: /complete rubric provenance/ },
    { path: staged.path, env: live() },
  )
  check(TOOL, "a codex-only body edit invalidates the earlier CI artifact", [...argv, "--codex-only"], { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live() })
  const bodyEditMarkerPath = join(repo.path, ".git", "orbit-body-edit-invalidations", "700.json")
  let bodyEditMarker = null
  try {
    bodyEditMarker = JSON.parse(readFileSync(bodyEditMarkerPath, "utf8"))
  } catch {
    bodyEditMarker = null
  }
  T(`${TOOL}: recorder persists exact pre-edit head/base and Guards baseline before editing`, bodyEditMarker?.headSha === HEAD && bodyEditMarker?.baseSha === BASE && bodyEditMarker?.guardsRuns?.[0]?.name === "Lint", JSON.stringify(bodyEditMarker))
  check(TOOL, "codex-only aggregation cannot reuse unchanged pre-edit Guards runs", [...argv, "--codex-only"], { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "DEGRADED: same-vendor review\n\nImplements ORB-700\n") })
  const replacementCheck = { ...greenCheck, startedAt: "2099-08-07T11:00:00Z" }
  const editedWorkflowRun = { databaseId: 11, createdAt: "2099-08-07T10:00:00Z", headSha: HEAD, status: "completed", conclusion: "success" }
  check(TOOL, "codex-only aggregation is READY after the completed edited-event Guards run replaces the invalidated baseline", [...argv, "--codex-only"], { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live(HEAD, BASE, 0, "DEGRADED: same-vendor review\n\nImplements ORB-700\n", "In Review", [], { statusCheckRollup: [replacementCheck], guardsWorkflowRuns: [openedWorkflowRun, editedWorkflowRun] }) })
  T(`${TOOL}: recorder removes a settled body-edit invalidation`, !existsSync(bodyEditMarkerPath), bodyEditMarkerPath)

  const failedRerun = { ...greenCheck, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  check(TOOL, "a same-SHA failed CI rerun prevents READY during aggregation", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { statusCheckRollup: [greenCheck, failedRerun] }) })
  check(TOOL, "a dismissed current-head connector review prevents READY during aggregation", argv, { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { reviewState: "DISMISSED" }) })
  check(TOOL, "a reopened same-SHA thread prevents READY during aggregation", argv, { status: 1, stdout: /THREADS_OPEN/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { openThread: true }) })

  const advancedHead = "cccccccccccccccccccccccccccccccccccccccc"
  const advanced = check(TOOL, "a live head advance after delivery cannot persist READY", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(advancedHead) })
  T(`${TOOL}: live revalidation reports the actual current head`, new RegExp(`"headSha": "${advancedHead}"`).test(advanced.stdout), advanced.stdout)
  const advancedBase = "dddddddddddddddddddddddddddddddddddddddd"
  const behind = check(TOOL, "live base advancement and behind_by cannot persist READY", argv, { status: 1, stdout: /OUT_OF_DATE/ }, { path: staged.path, env: live(HEAD, advancedBase, 1) })
  T(`${TOOL}: live compare reports the current behind count`, /"behindBy": 1/.test(behind.stdout), behind.stdout)
  const finalIdentitySequence = stage("record-readiness/final-identity-sequence.txt", "0")
  check(TOOL, "a head change during aggregation is refused before the readiness receipt is written", argv, { status: 2, stderr: /changed while readiness was being aggregated/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { identitySequenceFile: finalIdentitySequence, finalIdentity: { number: 700, baseRefOid: advancedBase, headRefOid: HEAD, isDraft: false } }) })
  const closingCiSequence = stage("record-readiness/closing-ci-sequence.txt", "0")
  check(TOOL, "a failed CI rerun during aggregation is caught by the closing read", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { identitySequenceFile: closingCiSequence, finalIdentity: { number: 700, baseRefName: "main", baseRefOid: BASE, headRefOid: HEAD, isDraft: false, body: "Implements ORB-700", statusCheckRollup: [failedRerun] } }) })
  const closingBotSequence = stage("record-readiness/closing-bot-sequence.txt", "0")
  check(TOOL, "a connector dismissal during aggregation is caught by the closing read", argv, { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { botSequenceFile: closingBotSequence, finalReviewState: "DISMISSED" }) })
  const closingThreadSequence = stage("record-readiness/closing-thread-sequence.txt", "0")
  check(TOOL, "a thread reopened during aggregation is caught by the closing read", argv, { status: 1, stdout: /THREADS_OPEN/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Review", [], { botSequenceFile: closingThreadSequence, finalOpenThread: true }) })

  const staleBot = stage("record-readiness/stale-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: BASE, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: true, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "a connector review pinned to another commit is BOT_REVIEW_STALE", [...argv.slice(0, -4), "--bot", staleBot, "--ticket", ticketArtifact], { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live() })
  const partialBot = stage("record-readiness/partial-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: false, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "an incomplete review-thread page cannot persist READY", [...argv.slice(0, -4), "--bot", partialBot, "--ticket", ticketArtifact], { status: 1, stdout: /THREADS_OPEN/ }, { path: staged.path, env: live() })
  const openRoundOneBody = JSON.stringify({ reviewerKind: "independent", verdict: "BLOCKING", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true }] })
  const openRoundOneReview = stage("record-readiness/open-round-one-review.json", openRoundOneBody)
  const openRoundOneHash = createHash("sha256").update(Buffer.from(openRoundOneBody)).digest("hex")
  check(TOOL, "round one is independently registered before its fixer transition", ["--repo", "ui", "--pr", "700", "--review", openRoundOneReview, "--register-round-one"], { status: 0, stdout: /ROUND_ONE_REGISTERED/ }, { path: staged.path, env: live() })
  const openReview = stage("record-readiness/open-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", ...rubricProvenance, roundOneArtifactPath: openRoundOneReview, roundOneArtifactSha256: openRoundOneHash, frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true, status: "OPEN" }] }))
  check(TOOL, "an OPEN blocker cannot hide behind a CLEAN review verdict", [...argv.slice(0, -6), "--review", openReview, "--bot", bot, "--ticket", ticketArtifact], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  const staleRubricReview = stage("record-readiness/stale-rubric-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", ...rubricProvenance, rubricCommitOid: HEAD, findings: [] }))
  check(TOOL, "a review frozen from another base rubric cannot persist READY", [...argv.slice(0, -6), "--review", staleRubricReview, "--bot", bot, "--ticket", ticketArtifact], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  const roundOneReviewBody = JSON.stringify({ reviewerKind: "independent", verdict: "BLOCKING", rounds: 1, reviewedHeadOid: ROUND_ONE_HEAD, baseSha: BASE, frozenFindingIds: ["F1", "F2"], findings: [{ id: "F1", blocking: true }, { id: "F2", blocking: true }] })
  const roundOneReview = stage("record-readiness/round-one-review.json", roundOneReviewBody)
  const roundOneHash = createHash("sha256").update(Buffer.from(roundOneReviewBody)).digest("hex")
  check(TOOL, "the frozen round-one path and hash are persisted before round two", ["--repo", "ui", "--pr", "700", "--review", roundOneReview, "--register-round-one"], { status: 0, stdout: /ROUND_ONE_REGISTERED/ }, { path: staged.path, env: live() })
  check(TOOL, "an identical round-one registration is idempotent", ["--repo", "ui", "--pr", "700", "--review", roundOneReview, "--register-round-one"], { status: 0, stdout: /"idempotent": true/ }, { path: staged.path, env: live() })
  const roundTwoReview = stage("record-readiness/round-two-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/round-two.json", ...rubricProvenance, roundOneArtifactPath: roundOneReview, roundOneArtifactSha256: roundOneHash, frozenFindingIds: ["F1", "F2"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }, { id: "F2", blocking: true, status: "CLOSED" }] }))
  check(TOOL, "round two preserves the exact hash-verified round-one blocker list", [...argv.slice(0, -6), "--review", roundTwoReview, "--bot", bot, "--ticket", ticketArtifact], { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })
  const droppedRoundTwo = stage("record-readiness/dropped-round-two-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/round-two.json", ...rubricProvenance, roundOneArtifactPath: roundOneReview, roundOneArtifactSha256: roundOneHash, frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }] }))
  check(TOOL, "round two cannot drop a blocker from both the frozen IDs and final findings", [...argv.slice(0, -6), "--review", droppedRoundTwo, "--bot", bot, "--ticket", ticketArtifact], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  const rewrittenRoundOneBody = JSON.stringify({ reviewerKind: "independent", verdict: "BLOCKING", rounds: 1, reviewedHeadOid: ROUND_ONE_HEAD, baseSha: BASE, frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true }] })
  const rewrittenRoundOne = stage("record-readiness/rewritten-round-one-review.json", rewrittenRoundOneBody)
  const rewrittenRoundOneHash = createHash("sha256").update(Buffer.from(rewrittenRoundOneBody)).digest("hex")
  check(TOOL, "a second registration cannot replace the immutable round-one identity", ["--repo", "ui", "--pr", "700", "--review", rewrittenRoundOne, "--register-round-one"], { status: 2, stderr: /refusing to replace its immutable identity/ }, { path: staged.path, env: live() })
  const forgedRoundTwo = stage("record-readiness/forged-round-two-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/round-two.json", ...rubricProvenance, roundOneArtifactPath: rewrittenRoundOne, roundOneArtifactSha256: rewrittenRoundOneHash, frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }] }))
  check(TOOL, "round two cannot substitute a rewritten round-one file and matching caller hash", [...argv.slice(0, -6), "--review", forgedRoundTwo, "--bot", bot, "--ticket", ticketArtifact], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  check(TOOL, "a live ticket status change invalidates the synchronization artifact", argv, { status: 1, stdout: /TICKET_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Progress") })
  const wrongTicket = stage("record-readiness/wrong-ticket.json", JSON.stringify({ issue: "ORB-701", repositoryKey: "api", prNumber: 701, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  check(TOOL, "a ticket receipt for another ticket, repository, or PR is rejected", [...argv.slice(0, -1), wrongTicket], { status: 2, stderr: /does not name this delivery issue, repository, and pull request/ }, { path: staged.path, env: live() })
  check(TOOL, "a missing artifact fails closed", [...argv.slice(0, -1), join(repo.path, "missing.json")], { status: 2, stderr: /could not be read as JSON/ }, { path: staged.path, env: live() })
}
