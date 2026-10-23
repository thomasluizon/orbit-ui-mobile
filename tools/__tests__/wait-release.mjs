import { readFileSync } from "node:fs"
import { T, orcaEnv, realOrchestratorConfig, run, stage, stageWithConfig, toolPath } from "./_harness.mjs"
import { readWakeSources } from "../lib/run-state.mjs"

const TOOL = "wait-release.mjs"
const SHA = "a".repeat(40)
const fixture = JSON.parse(readFileSync(toolPath("__tests__/release-fixture.json"), "utf8"))
const staged = (name, responses, liveCommit = SHA, repository = "api", healthStatus = "Healthy", httpStatus = 200) => {
  const installation = stageWithConfig(`wait-release-${name}`, TOOL, realOrchestratorConfig())
  const sequenceFile = stage(`wait-release/${name}-sequence`, "")
  const env = orcaEnv([{ match: `api repos/thomasluizon/${repository === "api" ? "orbit-api" : repository === "ui" ? "orbit-ui-mobile" : "orbit-landing-page"}/actions/runs/1`, stdoutSequence: responses.map(JSON.stringify), sequenceFile }])
  const health = repository === "api" ? { status: healthStatus, commit: liveCommit, checks: [
    { name: "background-services", status: "Healthy", description: "All background services running" },
    { name: "database", status: "Healthy", description: "Database reachable" },
  ] } : { status: healthStatus, commit: liveCommit }
  const endpoint = repository === "api" ? "/health" : repository === "ui" ? "/api/health" : "/"
  const fetchStub = stage(`wait-release/${name}-fetch.mjs`, `globalThis.fetch = async (url) => {
    if (url.pathname !== ${JSON.stringify(endpoint)}) throw new Error("Unexpected verification endpoint")
    return { ok: ${httpStatus === 200}, status: ${httpStatus}, json: async () => (${JSON.stringify(health)}),
      text: async () => ${JSON.stringify(`<html><head><meta name="orbit-build" content="${liveCommit}" /></head></html>`)} }
  }`)
  return { ...installation, env: { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS} --import=${fetchStub}` }, sequenceFile }
}
const workflowRun = (status, conclusion = null) => ({
  ...structuredClone(fixture.run), id: 1, head_sha: SHA, status, conclusion,
})
const args = ["--repo", "api", "--run", "1", "--sha", SHA, "--service-url", "https://example.invalid", "--poll-seconds", "0.001"]

export async function cases() {
  const completed = staged("completed", [workflowRun("queued"), workflowRun("completed", "success")])
  const completedResult = run(TOOL, args, { path: completed.path, env: completed.env })
  T("release waiter waits for completion", completedResult.status === 0 &&
    JSON.parse(completedResult.stdout).reason === "SUCCESS" &&
    Number(readFileSync(completed.sequenceFile, "utf8")) >= 2, completedResult.stderr)
  T("release waiter clears its wake source", readWakeSources(completed.base).length === 0)

  const unstaged = staged("unstaged", [workflowRun("completed", "success")], "b".repeat(40))
  const unstagedResult = run(TOOL, args, { path: unstaged.path, env: unstaged.env })
  T("release waiter rejects a successful run serving another planned commit", unstagedResult.status === 1 &&
    JSON.parse(unstagedResult.stdout).reason === "READ_ERROR" && JSON.parse(unstagedResult.stdout).error.includes("expected planned SHA"), unstagedResult.stdout + unstagedResult.stderr)

  for (const repository of ["api", "ui", "landing"]) {
    for (const matches of [true, false]) {
      const workflowSha = "c".repeat(40)
      const installation = staged(`${repository}-${matches}`, [{ ...workflowRun("completed", "success"), head_sha: workflowSha }],
        matches ? SHA : "b".repeat(40), repository, repository === "ui" ? "ok" : "Healthy")
      const argv = [...args, "--workflow-sha", workflowSha]
      argv[1] = repository
      const observed = run(TOOL, argv, { path: installation.path, env: installation.env })
      const receipt = JSON.parse(observed.stdout)
      T(`${repository} verifies planned commit separately from workflow commit (${matches})`, observed.status === (matches ? 0 : 1) &&
        receipt.deployedSha === (matches ? SHA : "b".repeat(40)) && receipt.workflowSha === workflowSha, observed.stdout + observed.stderr)
    }
  }
  for (const [status, httpStatus] of [["Unhealthy", 200], ["Healthy", 503]]) {
    const installation = staged(`health-${httpStatus}`, [workflowRun("completed", "success")], SHA, "api", status, httpStatus)
    const observed = run(TOOL, args, { path: installation.path, env: installation.env })
    T(`release waiter rejects unhealthy service ${status} HTTP ${httpStatus}`, observed.status === 1 &&
      JSON.parse(observed.stdout).reason === "READ_ERROR", observed.stdout + observed.stderr)
  }
  const native = staged("android", [workflowRun("completed", "success")], SHA, "ui")
  const nativeResult = run(TOOL, ["--repo", "ui", "--workflow", "android", "--run", "1", "--sha", SHA], { path: native.path, env: native.env })
  T("Android verifies its workflow commit without requiring a service origin", nativeResult.status === 0, nativeResult.stdout + nativeResult.stderr)
  for (const origin of [undefined, "http://example.invalid", "https://example.invalid/path", "https://user:secret@example.invalid"]) {
    const argv = ["--repo", "api", "--run", "1", "--sha", SHA, ...(origin ? ["--service-url", origin] : [])]
    const observed = run(TOOL, argv, { path: completed.path, env: completed.env })
    T("release waiter requires an HTTPS service origin", observed.status === 2, observed.stdout + observed.stderr)
  }

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
