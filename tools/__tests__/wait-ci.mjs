import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { T, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"
import { readWakeSources } from "../lib/run-state.mjs"

const TOOL = "wait-ci.mjs"
const SHA_A = "a".repeat(40)
const SHA_B = "b".repeat(40)
const pull = (sha = SHA_A, state = "open") => JSON.stringify({ state, head: { sha } })
const checks = (rows) => JSON.stringify({ total_count: rows.length, check_runs: rows })
const completed = (name, conclusion = "success") => ({ name, status: "completed", conclusion })
const queued = (name) => ({ name, status: "queued", conclusion: null })
const runs = (rows) => JSON.stringify({ total_count: rows.length, workflow_runs: rows })
const statuses = (rows, total = rows.length) => JSON.stringify({ state: "success", total_count: total, statuses: rows })

const fixture = (label, overrides = []) => {
  const repo = stageRepo(`wait-ci-${label}`)
  repo.git(["remote", "set-url", "origin", `https://github.com/test-owner/${label}.git`])
  const real = realOrchestratorConfig()
  const config = { ...real, repos: { ...real.repos, ui: repo.path }, timeouts: { ...real.timeouts, pollSeconds: 0.01 } }
  const staged = stageWithConfig(`wait-ci-${label}`, TOOL, config)
  const env = orcaEnv([
    ...overrides.filter((entry) => entry.kind === "first"),
    { match: "auth token --user test-owner", stdout: "test-github-token" },
    { match: "/pulls/12", stdout: pull(), ...overrides.find((entry) => entry.kind === "pull") },
    { match: "/check-runs?", stdout: checks([completed("Lint")]), ...overrides.find((entry) => entry.kind === "checks") },
    { match: "/status?", stdout: statuses([]) },
    { match: "actions/runs?head_sha=", stdout: runs([{ name: "CI", status: "completed" }]), ...overrides.find((entry) => entry.kind === "runs") },
  ])
  return { ...staged, env }
}

const argumentsFor = (...extra) => ["--repo", "ui", "--pr", "12", ...extra]

export const cases = async () => {
  const settled = fixture("settled")
  const settledResult = run(TOOL, argumentsFor("--require-check", "Lint"), { path: settled.path, env: settled.env })
  T("wait-ci: completed checks settle and clear wake source", settledResult.status === 0 && JSON.parse(settledResult.stdout).pullRequests[0].settled && readWakeSources(settled.base).length === 0, settledResult.stderr)

  const requiredSequence = stage("wait-ci/required-sequence", "")
  const required = fixture("required", [{ kind: "checks", stdoutSequence: [checks([]), checks([completed("pullfrog-approval")])], sequenceFile: requiredSequence }])
  const requiredResult = run(TOOL, argumentsFor("--require-check", "pullfrog-approval"), { path: required.path, env: required.env })
  T("wait-ci: absent required check waits for completion", requiredResult.status === 0 && JSON.parse(requiredResult.stdout).reason === "SETTLED", requiredResult.stderr)

  const movedSequence = stage("wait-ci/moved-sequence", "")
  const moved = fixture("moved", [
    { kind: "pull", stdoutSequence: [pull(SHA_A), pull(SHA_B)], sequenceFile: movedSequence },
    { kind: "checks", stdout: checks([queued("Lint")]) },
  ])
  const movedResult = run(TOOL, argumentsFor(), { path: moved.path, env: moved.env })
  T("wait-ci: moved head exits", movedResult.status === 0 && JSON.parse(movedResult.stdout).reason === "HEAD_MOVED", movedResult.stderr)

  const ceiling = fixture("ceiling", [{ kind: "checks", stdout: checks([queued("Lint")]) }])
  const ceilingResult = run(TOOL, argumentsFor("--ceiling-minutes", "0.0001"), { path: ceiling.path, env: ceiling.env })
  T("wait-ci: ceiling exits unsettled", ceilingResult.status === 3 && !JSON.parse(ceilingResult.stdout).pullRequests[0].settled, ceilingResult.stderr)

  const empty = fixture("empty", [{ kind: "checks", stdout: checks([]) }])
  const emptyResult = run(TOOL, argumentsFor("--ceiling-minutes", "0.0001"), { path: empty.path, env: empty.env })
  T("wait-ci: a head with no registered check never settles", emptyResult.status === 3 && JSON.parse(emptyResult.stdout).reason === "CEILING" && !JSON.parse(emptyResult.stdout).pullRequests[0].settled, emptyResult.stderr)

  const lateSequence = stage("wait-ci/late-sequence", "")
  const late = fixture("late", [{ kind: "checks", sequenceFile: lateSequence, stdoutSequence: [
    checks([completed("Fast")]), checks([completed("Fast"), queued("Slow")]), checks([completed("Fast"), completed("Slow")]),
  ] }])
  const lateResult = run(TOOL, argumentsFor(), { path: late.path, env: late.env })
  T("wait-ci: a check that registers after a fast one keeps the head unsettled until it completes",
    lateResult.status === 0 && JSON.parse(lateResult.stdout).reason === "SETTLED" && Number(readFileSync(lateSequence, "utf8")) >= 4, lateResult.stderr)

  const runSequence = stage("wait-ci/run-sequence", "")
  const pendingRun = fixture("pending-run", [{ kind: "runs", sequenceFile: runSequence, stdoutSequence: [
    runs([{ name: "Guards", status: "queued" }]), runs([{ name: "Guards", status: "completed" }]),
  ] }])
  const pendingRunResult = run(TOOL, argumentsFor(), { path: pendingRun.path, env: pendingRun.env })
  T("wait-ci: a queued workflow run with no check yet keeps the head unsettled",
    pendingRunResult.status === 0 && JSON.parse(pendingRunResult.stdout).reason === "SETTLED" && Number(readFileSync(runSequence, "utf8")) >= 3, pendingRunResult.stderr)

  const secondPageSequence = stage("wait-ci/second-page-sequence", "")
  const secondPage = fixture("second-page", [
    { kind: "first", match: "/status?per_page=100&page=2", sequenceFile: secondPageSequence, stdoutSequence: [
      statuses([{ context: "Late", state: "pending" }], 2), statuses([{ context: "Late", state: "success" }], 2),
    ] },
    { kind: "first", match: "/status?per_page=100&page=1", stdout: statuses([{ context: "Vercel", state: "success" }], 2) },
  ])
  const secondPageResult = run(TOOL, argumentsFor(), { path: secondPage.path, env: secondPage.env })
  T("wait-ci: a pending status on a later page keeps the head unsettled",
    secondPageResult.status === 0 && JSON.parse(secondPageResult.stdout).reason === "SETTLED" &&
      existsSync(secondPageSequence) && Number(readFileSync(secondPageSequence, "utf8")) >= 3, secondPageResult.stderr)

  const failing = fixture("failing", [{ kind: "checks", stdout: checks([completed("Lint", "failure")]) }])
  const failingResult = run(TOOL, argumentsFor(), { path: failing.path, env: failing.env })
  T("wait-ci: settled result names failing checks", failingResult.status === 0 && JSON.parse(failingResult.stdout).pullRequests[0].failingChecks.includes("Lint"), failingResult.stderr)

  const closed = fixture("closed", [{ kind: "pull", stdout: pull(SHA_A, "closed") }])
  const closedResult = run(TOOL, argumentsFor(), { path: closed.path, env: closed.env })
  T("wait-ci: closed pull request exits", closedResult.status === 0 && JSON.parse(closedResult.stdout).reason === "PR_CLOSED", closedResult.stderr)

  const signalled = fixture("signal", [{ kind: "checks", stdout: checks([queued("Lint")]) }])
  const child = spawn(process.execPath, [signalled.path, ...argumentsFor()], { env: { ...process.env, ...signalled.env } })
  let output = ""
  child.stdout.on("data", (chunk) => { output += chunk })
  let observed = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (readWakeSources(signalled.base).some((source) => source.pid === child.pid)) { observed = true; break }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  child.kill("SIGTERM")
  const exit = await new Promise((resolve) => child.once("close", resolve))
  T("wait-ci: SIGTERM clears registered wake source", observed && exit === 143 && JSON.parse(output).reason === "SIGTERM" && readWakeSources(signalled.base).length === 0)
}
