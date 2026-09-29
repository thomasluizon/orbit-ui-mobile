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
}
