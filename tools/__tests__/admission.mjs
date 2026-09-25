import { readFileSync } from "node:fs"
import { join } from "node:path"

import { T, TOOLS_DIR, orcaEnv, stageRepo } from "./_harness.mjs"
import { checkAdmission, queuedRunsPath } from "../lib/admission.mjs"

const repository = (name) => {
  const entry = stageRepo(`admission-${name}`)
  entry.git(["remote", "set-url", "origin", `https://github.com/test-owner/${name}.git`])
  return entry.path
}

export const cases = async () => {
  const observed = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "gh-admission-shapes.json"), "utf8"))
  T("admission: every parsed GitHub count and pull request field was observed live",
    observed.endpoints["actions/runs?status=queued"].response.total_count === "number" &&
    observed.endpoints["pulls?state=open"].pull.number === "number" &&
    observed.endpoints["pulls/{number}"].head.sha === "string" &&
    observed.endpoints["commits/{sha}/check-runs"].response.total_count === "number" &&
    observed.endpoints["commits/{sha}/status"].response.statuses === "array" &&
    observed.endpoints["actions/runs?head_sha"].response.total_count === "number" &&
    observed.endpoints["actions/runs?head_sha"].workflowRun.status === "string")
  const config = {
    repos: { ui: repository("ui"), api: repository("api"), landing: repository("landing") },
    caps: { maxOpenPullRequests: 10, maxQueuedRuns: 30 },
  }
  const plan = (pulls, runs, branchPulls = [], fail = false) => orcaEnv([
    { match: "pulls?head=", stdout: JSON.stringify(branchPulls) },
    { match: `actions/runs?status=queued&created=${encodeURIComponent(">=2026-09-24T03:00:00Z")}&per_page=1`, stdout: JSON.stringify({ total_count: runs, workflow_runs: [] }), exit: fail ? 1 : 0, stderr: fail ? "GitHub unavailable" : "" },
    { match: "pulls?state=open", stdout: JSON.stringify(pulls.map((number) => ({ number }))) },
  ])
  const check = (environment) => checkAdmission({ config, repositoryKey: "ui", branch: "feature/new", environment, now: Date.parse("2026-09-25T03:00:00Z") })
  T("admission: the queued-run read counts only runs created in the last 24 hours",
    queuedRunsPath("o/r", Date.parse("2026-09-25T03:00:00Z")) === "repos/o/r/actions/runs?status=queued&created=%3E%3D2026-09-24T03%3A00%3A00Z&per_page=1")
  const below = await check(plan([1, 2], 3))
  T("admission: below both caps is admitted", below.admitted, JSON.stringify(below))
  const tooManyPulls = await check(plan(Array.from({ length: 4 }, (_, index) => index + 1), 0))
  T("admission: open pull requests above cap refuse", !tooManyPulls.admitted && tooManyPulls.reason === "ADMISSION_REFUSED" && tooManyPulls.counts.openPullRequests === 12, JSON.stringify(tooManyPulls))
  const tooManyRuns = await check(plan([], 11))
  T("admission: queued runs above cap refuse", !tooManyRuns.admitted && tooManyRuns.counts.queuedRuns === 33, JSON.stringify(tooManyRuns))
  const existing = await check(plan(Array.from({ length: 4 }, (_, index) => index + 1), 11, [{ number: 99 }]))
  T("admission: existing pull request is exempt", existing.admitted && existing.existingPullRequest === 99, JSON.stringify(existing))
  const failure = await check(plan([], 0, [], true))
  T("admission: failed GitHub read refuses", !failure.admitted && failure.error.includes("GitHub unavailable"), JSON.stringify(failure))
}
