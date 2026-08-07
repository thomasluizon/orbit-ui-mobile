import { join } from "node:path"

import { T, check, realOrchestratorConfig, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

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
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const review = stage("record-readiness/review.json", JSON.stringify({ reviewerKind: "claude", verdict: "CLEAN", rounds: 1, reviewedHeadOid: HEAD, baseSha: BASE, artifactPath: "C:/scratch/review.json" }))
  const bot = stage("record-readiness/bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: HEAD, headRefOid: HEAD, counts: { unresolved: 0 }, threads: [] }))
  const linear = stage("record-readiness/linear.json", JSON.stringify({ status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  const argv = ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--review", review, "--bot", bot, "--linear", linear]
  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path })

  const staleBot = stage("record-readiness/stale-bot.json", JSON.stringify({ pr: 700, verdict: "REVIEWED", reviewedCommit: BASE, headRefOid: HEAD, counts: { unresolved: 0 }, threads: [] }))
  check(TOOL, "a connector review pinned to another commit is BOT_REVIEW_STALE", [...argv.slice(0, -4), "--bot", staleBot, "--linear", linear], { status: 1, stdout: /BOT_REVIEW_STALE/ }, { path: staged.path })
  check(TOOL, "a missing artifact fails closed", [...argv.slice(0, -1), join(repo.path, "missing.json")], { status: 2, stderr: /could not be read as JSON/ }, { path: staged.path })
}
