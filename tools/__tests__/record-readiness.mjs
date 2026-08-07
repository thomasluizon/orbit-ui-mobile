import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

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
  repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ issue: "ORB-700", verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const review = stage("record-readiness/review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json", rubricBaseOid: BASE, rubricArtifactPath: "C:/scratch/rubric.md", findings: [] }))
  const bot = stage("record-readiness/bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, threadsComplete: true, counts: { unresolved: 0 }, threads: [] }))
  const linear = stage("record-readiness/linear.json", JSON.stringify({ issue: "ORB-700", repositoryKey: "ui", prNumber: 700, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  const argv = ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", review, "--bot", bot, "--linear", linear]
  const live = (headRefOid = HEAD, baseRefOid = BASE, behindBy = 0, body = "Implements ORB-700", linearState = { name: "In Review", type: "started" }, labels = []) => orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "pr view 700", stdout: JSON.stringify({ number: 700, baseRefName: "main", baseRefOid, headRefOid, isDraft: false, body }) },
    { match: "pr edit 700", stdout: "" },
    { match: "api repos/", stdout: JSON.stringify({ behind_by: behindBy }) },
    { match: "linear issue ORB-700 --full --json", stdout: JSON.stringify({ id: "linear-read", ok: true, result: { issue: { identifier: "ORB-700", state: linearState, labels } } }) },
  ])
  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })
  check(TOOL, "a codex-only body edit invalidates the earlier CI artifact", [...argv, "--codex-only"], { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live() })
  check(TOOL, "codex-only aggregation is READY after delivery rechecks the already-marked body", [...argv, "--codex-only"], { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live(HEAD, BASE, 0, "DEGRADED: same-vendor review\n\nImplements ORB-700\n") })

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
