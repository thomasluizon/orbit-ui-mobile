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
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const review = stage("record-readiness/review.json", JSON.stringify({ reviewerKind: "independent", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json" }))
  const bot = stage("record-readiness/bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, baseRefOid: BASE, headRefOid: HEAD, counts: { unresolved: 0 }, threads: [] }))
  const linear = stage("record-readiness/linear.json", JSON.stringify({ status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  const argv = ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", review, "--bot", bot, "--linear", linear]
  const live = (headRefOid = HEAD, baseRefOid = BASE, behindBy = 0) => orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "pr view 700", stdout: JSON.stringify({ number: 700, baseRefName: "main", baseRefOid, headRefOid, isDraft: false }) },
    { match: "api repos/", stdout: JSON.stringify({ behind_by: behindBy }) },
  ])
  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })

  const advancedHead = "cccccccccccccccccccccccccccccccccccccccc"
  const advanced = check(TOOL, "a live head advance after delivery cannot persist READY", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(advancedHead) })
  T(`${TOOL}: live revalidation reports the actual current head`, new RegExp(`"headSha": "${advancedHead}"`).test(advanced.stdout), advanced.stdout)
  const advancedBase = "dddddddddddddddddddddddddddddddddddddddd"
  const behind = check(TOOL, "live base advancement and behind_by cannot persist READY", argv, { status: 1, stdout: /OUT_OF_DATE/ }, { path: staged.path, env: live(HEAD, advancedBase, 1) })
  T(`${TOOL}: live compare reports the current behind count`, /"behindBy": 1/.test(behind.stdout), behind.stdout)

  const staleBot = stage("record-readiness/stale-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: BASE, baseRefOid: BASE, headRefOid: HEAD, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "a connector review pinned to another commit is BOT_REVIEW_STALE", [...argv.slice(0, -4), "--bot", staleBot, "--linear", linear], { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path, env: live() })
  check(TOOL, "a missing artifact fails closed", [...argv.slice(0, -1), join(repo.path, "missing.json")], { status: 2, stderr: /could not be read as JSON/ }, { path: staged.path, env: live() })
}
