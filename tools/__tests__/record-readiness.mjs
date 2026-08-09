import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, stage, stageRepo, stageWithConfig, toolPath } from "./_harness.mjs"

const TOOL = "record-readiness.mjs"
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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

  /** A real commit, so the fixture's origin/main is a resolvable ref like the one delivery reads. */
  mkdirSync(join(repo.path, ".claude", "skills", "pr-review"), { recursive: true })
  writeFileSync(join(repo.path, ".claude", "skills", "pr-review", "rubric.md"), "# pr-review rubric\n")
  const committed =
    repo.git(["add", "--", ".claude/skills/pr-review/rubric.md"]).status === 0 &&
    repo.git(["commit", "-q", "-m", "rubric"]).status === 0 &&
    repo.git(["push", "-q", "origin", "main"]).status === 0
  T(`${TOOL}: the fixture repository carries a commit`, committed, "could not commit into the fixture")
  BASE = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  const rubricSnapshot = stage("record-readiness/rubric.md", "# pr-review rubric\n")

  repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ issue: "ORB-700", verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const review = stage("record-readiness/review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", rubricSnapshotPath: rubricSnapshot, frozenFindingIds: [], findings: [] }))
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
    const identity = { number: 700, baseRefName: "main", baseRefOid, headRefOid, isDraft: false, body, statusCheckRollup: options.statusCheckRollup ?? [greenCheck] }
    const graphqlResponse = JSON.stringify({ data: { repository: { pullRequest: {
      number: 700, isDraft: false, baseRefOid, headRefOid,
      reviews: { nodes: [{ author: { login: "chatgpt-codex-connector" }, state: reviewState, submittedAt: "2026-08-07T10:00:00Z", body: "", commit: { oid: headRefOid } }] },
      comments: { nodes: [] },
      reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: reviewThreads },
    } } } })
    return {
      ...orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "pr view 700", stdout: JSON.stringify(identity) },
    { match: "pr edit 700", stdout: "" },
    { match: "run list --repo", stdout: JSON.stringify(options.guardsWorkflowRuns ?? [openedWorkflowRun]) },
    { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Lint"] }) },
    { match: "api graphql", stdout: graphqlResponse },
    { match: "api repos/", stdout: JSON.stringify({ behind_by: behindBy }) },
      ]),
      ORBIT_TICKET_STATUS: ticketStatus,
      ORBIT_TICKET_LABELS: JSON.stringify(labels.length > 0 ? labels : [{ name: "repo:ui" }]),
    }
  }
  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })

  /** The receipt records the snapshot path as information; there is no provenance proof to fail. */
  const readyReceipt = JSON.parse(readFileSync(join(repo.path, ".git", "orbit-pr-readiness", "ui-700.json"), "utf8"))
  T(`${TOOL}: the receipt records the rubric snapshot path the reviewer read`, readyReceipt?.independentReview?.rubricSnapshotPath === rubricSnapshot, JSON.stringify(readyReceipt?.independentReview))

  check(
    TOOL,
    "a review artifact with no reviewedHeadOid, artifactPath, or findings is refused as an artifact error",
    ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", stage("record-readiness/review-invalid.json", JSON.stringify({ verdict: "CLEAN", rounds: 1 })), "--bot", bot, "--ticket", ticketArtifact],
    { status: 2, stderr: /no reviewedHeadOid, artifactPath, or findings/ },
    { path: staged.path, env: live() },
  )
  const staleHeadReview = stage("record-readiness/review-stale-head.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: "cccccccccccccccccccccccccccccccccccccccc", baseSha: BASE, artifactPath: "C:/scratch/review.json", frozenFindingIds: [], findings: [] }))
  check(
    TOOL,
    "a review of another head cannot reach READY",
    ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", staleHeadReview, "--bot", bot, "--ticket", ticketArtifact],
    { status: 1, stdout: /REVIEW_STALE/ },
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

  const staleBot = stage("record-readiness/stale-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: BASE, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: true, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "a connector review pinned to another commit is BOT_REVIEW_STALE", [...argv.slice(0, -4), "--bot", staleBot, "--ticket", ticketArtifact], { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live() })
  const partialBot = stage("record-readiness/partial-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: false, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "an incomplete review-thread page cannot persist READY", [...argv.slice(0, -4), "--bot", partialBot, "--ticket", ticketArtifact], { status: 1, stdout: /THREADS_OPEN/ }, { path: staged.path, env: live() })

  /** Round-2 discipline is verified from the receipt itself: an OPEN blocker can never hide behind
   * a CLEAN verdict, and a frozen id must still be represented by a Blocking finding. */
  const openReview = stage("record-readiness/open-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", frozenFindingIds: ["F1"], findings: [{ id: "F1", blocking: true, status: "OPEN" }] }))
  check(TOOL, "an OPEN blocker cannot hide behind a CLEAN review verdict", [...argv.slice(0, -6), "--review", openReview, "--bot", bot, "--ticket", ticketArtifact], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  const closedRoundTwo = stage("record-readiness/closed-round-two.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/round-two.json", frozenFindingIds: ["F1", "F2"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }, { id: "F2", blocking: true, status: "CLOSED" }] }))
  check(TOOL, "a round two with every frozen blocker CLOSED is READY", [...argv.slice(0, -6), "--review", closedRoundTwo, "--bot", bot, "--ticket", ticketArtifact], { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })
  const droppedRoundTwo = stage("record-readiness/dropped-round-two.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/round-two.json", frozenFindingIds: ["F1", "F2"], findings: [{ id: "F1", blocking: true, status: "CLOSED" }] }))
  check(TOOL, "a frozen blocker absent from the round-two findings is refused", [...argv.slice(0, -6), "--review", droppedRoundTwo, "--bot", bot, "--ticket", ticketArtifact], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })

  check(TOOL, "a live ticket status change invalidates the synchronization artifact", argv, { status: 1, stdout: /TICKET_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", "In Progress") })
  const wrongTicket = stage("record-readiness/wrong-ticket.json", JSON.stringify({ issue: "ORB-701", repositoryKey: "api", prNumber: 701, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  check(TOOL, "a ticket receipt for another ticket, repository, or PR is rejected", [...argv.slice(0, -1), wrongTicket], { status: 2, stderr: /does not name this delivery issue, repository, and pull request/ }, { path: staged.path, env: live() })
  check(TOOL, "a missing artifact fails closed", [...argv.slice(0, -1), join(repo.path, "missing.json")], { status: 2, stderr: /could not be read as JSON/ }, { path: staged.path, env: live() })
}
