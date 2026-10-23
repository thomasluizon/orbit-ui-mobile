import { readFileSync } from "node:fs"
import { T, orcaEnv, realOrchestratorConfig, run, stage, stageWithConfig, toolPath } from "./_harness.mjs"
import { readWakeSources } from "../lib/run-state.mjs"

const TOOL = "wait-release.mjs"
const SHA = "a".repeat(40)
const fixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))
const staged = (name, responses) => {
  const installation = stageWithConfig(`wait-release-${name}`, TOOL, realOrchestratorConfig())
  const sequenceFile = stage(`wait-release/${name}-sequence`, "")
  const env = orcaEnv([{ match: "api repos/thomasluizon/orbit-api/actions/runs/1", stdoutSequence: responses.map(JSON.stringify), sequenceFile }])
  return { ...installation, env, sequenceFile }
}
const workflowRun = (status, conclusion = null) => ({
  ...structuredClone(fixture.run), id: 1, head_sha: SHA, status, conclusion,
})
const args = ["--repo", "api", "--run", "1", "--sha", SHA, "--poll-seconds", "0.001"]

export async function cases() {
  const completed = staged("completed", [workflowRun("queued"), workflowRun("completed", "success")])
  const completedResult = run(TOOL, args, { path: completed.path, env: completed.env })
  T("release waiter waits for completion", completedResult.status === 0 &&
    JSON.parse(completedResult.stdout).reason === "SUCCESS" &&
    Number(readFileSync(completed.sequenceFile, "utf8")) >= 2, completedResult.stderr)
  T("release waiter clears its wake source", readWakeSources(completed.base).length === 0)

  const failed = staged("failed", [workflowRun("completed", "failure")])
  const failedResult = run(TOOL, args, { path: failed.path, env: failed.env })
  T("release waiter stops on a failed run with its link", failedResult.status === 1 &&
    JSON.parse(failedResult.stdout).reason === "FAILED" && JSON.parse(failedResult.stdout).url === fixture.run.html_url, failedResult.stderr)

  const ceiling = staged("ceiling", [workflowRun("queued")])
  const ceilingResult = run(TOOL, [...args, "--ceiling-minutes", "0.0001"], { path: ceiling.path, env: ceiling.env })
  T("release waiter stops at its ceiling", ceilingResult.status === 3 &&
    JSON.parse(ceilingResult.stdout).reason === "CEILING" && readWakeSources(ceiling.base).length === 0, ceilingResult.stderr)

  const wrongHead = staged("wrong-head", [{ ...workflowRun("completed", "success"), head_sha: "b".repeat(40) }])
  const wrongResult = run(TOOL, args, { path: wrongHead.path, env: wrongHead.env })
  T("release waiter refuses a run for another commit", wrongResult.status === 1 &&
    JSON.parse(wrongResult.stdout).reason === "READ_ERROR", wrongResult.stderr)

  for (const [label, failure] of [
    ["unavailable", { stdout: "HTTP/2.0 503 Service Unavailable\r\nRetry-After: 0\r\n\r\nService Unavailable", stderr: "gh: HTTP 503\n", exit: 1 }],
    ["rate-limited", { stderr: "gh: HTTP 429", exit: 1 }],
    ["secondary", { stderr: "gh: You have exceeded a secondary rate limit (HTTP 403)", exit: 1 }],
    ["timeout", { stderr: "context deadline exceeded", exit: 1 }],
  ]) {
    const installation = staged(label, [])
    const env = orcaEnv([{ match: "api repos/", sequenceFile: installation.sequenceFile, responseSequence: [
      failure, failure, { stdout: JSON.stringify(workflowRun("completed", "success")), stderr: "", exit: 0 },
    ] }])
    const observed = run(TOOL, args, { path: installation.path, env })
    const body = JSON.parse(observed.stdout)
    T(`release waiter: ${label} recovers`, observed.status === 0 && body.reason === "SUCCESS" &&
      body.transientErrors.count === 2 && body.transientErrors.last.length > 0 && readWakeSources(installation.base).length === 0, observed.stdout)
  }
  const outage = staged("outage", [])
  const outageEnv = orcaEnv([{ match: "api repos/", stderr: "gh: HTTP 503", exit: 1 }])
  const outageResult = run(TOOL, [...args, "--ceiling-minutes", "0.01"], { path: outage.path, env: outageEnv })
  const outageBody = JSON.parse(outageResult.stdout)
  T("release waiter: persistent outage reaches ceiling", outageResult.status === 3 && outageBody.reason === "CEILING" &&
    outageBody.transientErrors.count > 0 && readWakeSources(outage.base).length === 0, outageResult.stdout)
  for (const [label, failure] of [
    ["unauthorized", { stderr: "gh: HTTP 401", exit: 1 }],
    ["forbidden", { stderr: "gh: HTTP 403", exit: 1 }],
    ["missing", { stderr: "gh: HTTP 404", exit: 1 }],
    ["invalid-json", { stdout: "not json" }],
    ["invalid-shape", { stdout: "{}" }],
  ]) {
    const installation = staged(label, [])
    const env = orcaEnv([{ match: "api repos/", ...failure }])
    const observed = run(TOOL, args, { path: installation.path, env })
    const body = JSON.parse(observed.stdout)
    T(`release waiter: ${label} remains fatal`, observed.status === 1 && body.reason === "READ_ERROR" && body.transientErrors.count === 0, observed.stdout)
  }
}
