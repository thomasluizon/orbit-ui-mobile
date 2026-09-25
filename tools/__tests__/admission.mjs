import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, TOOLS_DIR, orcaEnv, realOrchestratorConfig, stageRepo } from "./_harness.mjs"
import { checkAdmission, configuredRepositorySlug, queuedRunsPath } from "../lib/admission.mjs"

const repository = (name) => {
  const entry = stageRepo(`admission-${name}`)
  entry.git(["remote", "set-url", "origin", `https://github.com/test-owner/${name}.git`])
  return entry.path
}

export const cases = async () => {
  T("admission: configured repository names resolve on macOS and Windows",
    configuredRepositorySlug(realOrchestratorConfig().repos.ui, "thomasluizon") === "thomasluizon/orbit-ui-mobile")
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
  const check = (environment, caps = config.caps) => checkAdmission({ config: { ...config, caps }, repositoryKey: "ui", branch: "feature/new", environment, now: Date.parse("2026-09-25T03:00:00Z") })
  T("admission: the queued-run read counts only runs created in the last 24 hours",
    queuedRunsPath("o/r", Date.parse("2026-09-25T03:00:00Z")) === "repos/o/r/actions/runs?status=queued&created=%3E%3D2026-09-24T03%3A00%3A00Z&per_page=1")
  const below = await check(plan([1, 2], 3))
  T("admission: below both caps is admitted", below.admitted, JSON.stringify(below))
  const tooManyPulls = await check(plan(Array.from({ length: 4 }, (_, index) => index + 1), 0))
  T("admission: open pull requests above cap refuse", !tooManyPulls.admitted && tooManyPulls.reason === "ADMISSION_REFUSED" && tooManyPulls.counts.openPullRequests === 12, JSON.stringify(tooManyPulls))
  const tooManyRuns = await check(plan([], 11))
  T("admission: queued runs above cap refuse", !tooManyRuns.admitted && tooManyRuns.counts.queuedRuns === 33, JSON.stringify(tooManyRuns))
  // Each stubbed repository answers the same counts, so the fleet totals are multiples of three.
  const atPullCap = await check(plan(Array.from({ length: 4 }, (_, index) => index + 1), 0), { maxOpenPullRequests: 12, maxQueuedRuns: 30 })
  T("admission: open pull requests exactly at the cap leave no new-work capacity", !atPullCap.admitted && atPullCap.counts.openPullRequests === 12, JSON.stringify(atPullCap))
  const atRunCap = await check(plan([], 11), { maxOpenPullRequests: 10, maxQueuedRuns: 33 })
  T("admission: queued runs exactly at the cap leave no new-work capacity", !atRunCap.admitted && atRunCap.counts.queuedRuns === 33, JSON.stringify(atRunCap))
  const existing = await check(plan(Array.from({ length: 4 }, (_, index) => index + 1), 11, [{ number: 99 }]))
  T("admission: existing pull request is exempt", existing.admitted && existing.existingPullRequest === 99, JSON.stringify(existing))
  const failure = await check(plan([], 0, [], true))
  T("admission: failed GitHub read refuses", !failure.admitted && failure.error.includes("GitHub unavailable"), JSON.stringify(failure))

  const checkout = repository("admission-reservations")
  const reservationDirectory = join(checkout, ".git", "orbit-admission-reservations")
  const edgeConfig = { ...config, repos: { ui: checkout }, caps: { maxOpenPullRequests: 10, maxQueuedRuns: 30 } }
  const edge = (branch, environment = plan(Array.from({ length: 9 }, (_, index) => index + 1), 0), extra = {}) =>
    checkAdmission({ config: edgeConfig, repositoryKey: "ui", branch, environment, worktree: checkout, repoRoot: checkout,
      now: Date.parse("2026-09-25T03:00:00Z"), ...extra })
  const raced = await Promise.all([edge("feature/one"), edge("feature/two")])
  T("admission: two launchers racing for one allowance admit exactly one",
    raced.filter((result) => result.admitted).length === 1, JSON.stringify(raced))
  rmSync(reservationDirectory, { recursive: true, force: true })

  mkdirSync(reservationDirectory, { recursive: true })
  const deadPath = join(reservationDirectory, "dead.json")
  writeFileSync(deadPath, JSON.stringify({ pid: 999999999, startIdentity: "dead", repository: "test-owner/admission-reservations", branch: "feature/dead", timestamp: new Date().toISOString() }))
  await edge("feature/after-dead", plan([], 0))
  T("admission: a dead launcher's reservation is removed", !existsSync(deadPath))
  rmSync(reservationDirectory, { recursive: true, force: true })

  const prior = await edge("feature/pr-created", plan([], 0))
  const afterPrEnvironment = orcaEnv([
    { match: "pulls?head=test-owner%3Afeature%2Fafter-pr", stdout: "[]" },
    { match: "pulls?head=test-owner%3Afeature%2Fpr-created", stdout: '[{"number":101}]' },
    { match: "pulls?state=open", stdout: JSON.stringify(Array.from({ length: 9 }, (_, index) => ({ number: index + 1 }))) },
    { match: "actions/runs?status=queued", stdout: '{"total_count":0,"workflow_runs":[]}' },
  ])
  const counted = await edge("feature/after-pr", afterPrEnvironment)
  T("admission: a reservation whose branch has an open pull request is not counted twice",
    typeof prior.reservationId === "string" && counted.admitted, JSON.stringify({ prior, counted }))

  const lockPath = join(checkout, ".git", "orbit-admission.lock")
  const startIdentity = spawnSync("ps", ["-p", String(process.pid), "-o", "lstart="], { encoding: "utf8" }).stdout.trim()
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startIdentity, timestamp: new Date().toISOString() }))
  const locked = await edge("feature/locked", plan([], 0), { lockWaitMs: 75 })
  T("admission: an unverified lock times out closed", !locked.admitted && /lock/.test(locked.error ?? ""), JSON.stringify(locked))
  rmSync(lockPath, { force: true })
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startIdentity: "previous process with reused pid", timestamp: new Date().toISOString() }))
  const recycled = await edge("feature/recycled-lock", plan([], 0))
  T("admission: a lock with a reused pid is stale", recycled.admitted && !existsSync(lockPath), JSON.stringify(recycled))
}
