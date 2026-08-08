import { copyFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, stage, stageRepo, stageWithConfig, toolPath } from "./_harness.mjs"

const TOOL = "record-readiness.mjs"
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const BASE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

export const cases = () => {
  const repo = stageRepo("record-readiness")
  if (!repo) {
    T(`${TOOL}: a git fixture is available`, false, "could not stage repository")
    return
  }
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("record-readiness", TOOL, { ...real, repos: { ui: repo.path } })
  copyFileSync(toolPath("list-bot-threads.mjs"), join(staged.base, "tools", "list-bot-threads.mjs"))
  repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ issue: "ORB-700", verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const review = stage("record-readiness/review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", rubricBaseOid: BASE, rubricArtifactPath: "C:/scratch/rubric.md", findings: [] }))
  const bot = stage("record-readiness/bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: true, counts: { unresolved: 0 }, threads: [] }))
  const linear = stage("record-readiness/linear.json", JSON.stringify({ issue: "ORB-700", repositoryKey: "ui", prNumber: 700, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  const argv = ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", review, "--bot", bot, "--linear", linear]
  const greenCheck = { __typename: "CheckRun", name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z", workflowName: "Guards" }
  const live = (headRefOid = HEAD, baseRefOid = BASE, behindBy = 0, body = "Implements ORB-700", linearState = { name: "In Review", type: "started" }, labels = [], options = {}) => {
    const reviewState = options.reviewState ?? "COMMENTED"
    const reviewThreads = options.openThread
      ? [{ id: "PRRT_open", isResolved: false, isOutdated: false, path: "tools/x.mjs", line: 1, comments: { nodes: [{ author: { login: "chatgpt-codex-connector" }, body: "P1 open" }] } }]
      : []
    return orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "pr view 700", stdout: JSON.stringify({ number: 700, baseRefName: "main", baseRefOid, headRefOid, isDraft: false, body, statusCheckRollup: options.statusCheckRollup ?? [greenCheck] }) },
    { match: "pr edit 700", stdout: "" },
    { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Lint"] }) },
    { match: "api graphql", stdout: JSON.stringify({ data: { repository: { pullRequest: {
      number: 700, isDraft: false, baseRefOid, headRefOid,
      reviews: { nodes: [{ author: { login: "chatgpt-codex-connector" }, state: reviewState, submittedAt: "2026-08-07T10:00:00Z", body: "", commit: { oid: headRefOid } }] },
      comments: { nodes: [] },
      reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: reviewThreads },
    } } } }) },
    { match: "api repos/", stdout: JSON.stringify({ behind_by: behindBy }) },
    { match: "linear issue ORB-700 --full --json", stdout: JSON.stringify({ id: "linear-read", ok: true, result: { issue: { identifier: "ORB-700", state: linearState, labels } } }) },
    ])
  }
  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })
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
  const replacementCheck = { ...greenCheck, startedAt: "2026-08-07T11:00:00Z" }
  check(TOOL, "codex-only aggregation is READY after newer Guards runs replace the invalidated baseline", [...argv, "--codex-only"], { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live(HEAD, BASE, 0, "DEGRADED: same-vendor review\n\nImplements ORB-700\n", { name: "In Review", type: "started" }, [], { statusCheckRollup: [replacementCheck] }) })
  T(`${TOOL}: recorder removes a settled body-edit invalidation`, !existsSync(bodyEditMarkerPath), bodyEditMarkerPath)

  const failedRerun = { ...greenCheck, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  check(TOOL, "a same-SHA failed CI rerun prevents READY during aggregation", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", { name: "In Review", type: "started" }, [], { statusCheckRollup: [greenCheck, failedRerun] }) })
  check(TOOL, "a dismissed current-head connector review prevents READY during aggregation", argv, { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", { name: "In Review", type: "started" }, [], { reviewState: "DISMISSED" }) })
  check(TOOL, "a reopened same-SHA thread prevents READY during aggregation", argv, { status: 1, stdout: /THREADS_OPEN/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", { name: "In Review", type: "started" }, [], { openThread: true }) })

  const advancedHead = "cccccccccccccccccccccccccccccccccccccccc"
  const advanced = check(TOOL, "a live head advance after delivery cannot persist READY", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(advancedHead) })
  T(`${TOOL}: live revalidation reports the actual current head`, new RegExp(`"headSha": "${advancedHead}"`).test(advanced.stdout), advanced.stdout)
  const advancedBase = "dddddddddddddddddddddddddddddddddddddddd"
  const behind = check(TOOL, "live base advancement and behind_by cannot persist READY", argv, { status: 1, stdout: /OUT_OF_DATE/ }, { path: staged.path, env: live(HEAD, advancedBase, 1) })
  T(`${TOOL}: live compare reports the current behind count`, /"behindBy": 1/.test(behind.stdout), behind.stdout)

  const staleBot = stage("record-readiness/stale-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: BASE, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: true, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "a connector review pinned to another commit is BOT_REVIEW_STALE", [...argv.slice(0, -4), "--bot", staleBot, "--linear", linear], { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live() })
  const partialBot = stage("record-readiness/partial-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: false, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "an incomplete review-thread page cannot persist READY", [...argv.slice(0, -4), "--bot", partialBot, "--linear", linear], { status: 1, stdout: /THREADS_OPEN/ }, { path: staged.path, env: live() })
  const openReview = stage("record-readiness/open-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 2, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", rubricBaseOid: BASE, rubricArtifactPath: "C:/scratch/rubric.md", findings: [{ id: "F1", blocking: true, status: "OPEN" }] }))
  check(TOOL, "an OPEN blocker cannot hide behind a CLEAN review verdict", [...argv.slice(0, -6), "--review", openReview, "--bot", bot, "--linear", linear], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  const staleRubricReview = stage("record-readiness/stale-rubric-review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", rubricBaseOid: HEAD, rubricArtifactPath: "C:/scratch/rubric.md", findings: [] }))
  check(TOOL, "a review frozen from another base rubric cannot persist READY", [...argv.slice(0, -6), "--review", staleRubricReview, "--bot", bot, "--linear", linear], { status: 1, stdout: /REVIEW_STALE/ }, { path: staged.path, env: live() })
  check(TOOL, "a live Linear status change invalidates the synchronization artifact", argv, { status: 1, stdout: /LINEAR_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", { name: "In Progress", type: "started" }) })
  check(TOOL, "a live visible-effect label invalidates an ordinary ready artifact", argv, { status: 1, stdout: /LINEAR_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "Implements ORB-700", { name: "In Progress", type: "started" }, [{ id: "visible", name: "visible-effect" }]) })
  const wrongLinear = stage("record-readiness/wrong-linear.json", JSON.stringify({ issue: "ORB-701", repositoryKey: "api", prNumber: 701, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  check(TOOL, "a Linear receipt for another ticket, repository, or PR is rejected", [...argv.slice(0, -1), wrongLinear], { status: 2, stderr: /does not name this delivery issue, repository, and pull request/ }, { path: staged.path, env: live() })
  check(TOOL, "a missing artifact fails closed", [...argv.slice(0, -1), join(repo.path, "missing.json")], { status: 2, stderr: /could not be read as JSON/ }, { path: staged.path, env: live() })
}
