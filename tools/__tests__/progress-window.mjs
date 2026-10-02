import { readFileSync } from "node:fs"
import { join } from "node:path"
import { T, REPO_ROOT, check, orcaEnv, realOrchestratorConfig, stage, stageWithConfig } from "./_harness.mjs"
import { fixture } from "./progress-window-core.mjs"

export const cases = async () => {
  const staged = stageWithConfig("progress-cli", "progress-window.mjs", realOrchestratorConfig())
  const sources = fixture("progress-cli-sources")
  const plan = []
  for (const repository of ["orbit-ui-mobile", "orbit-api", "orbit-landing-page"]) {
    for (const [endpoint, reply] of [
      ["pulls?", [[sources.recorded.pull]]],
      ["actions/workflows/release.yml/runs?", [{ total_count: 1, workflow_runs: [sources.recorded.run] }]],
      ...(repository === "orbit-ui-mobile" ? [["actions/workflows/android-release.yml/runs?", [{ total_count: 1, workflow_runs: [sources.recorded.android] }]]] : []),
    ]) plan.push({ match: `repos/example/${repository}/${endpoint}`, stdout: reply.map((page) => JSON.stringify(page)).join("\n") })
  }
  plan.push({ match: "repos/thomasluizon/orbit-tickets/issues?", stdout: JSON.stringify([sources.recorded.ticket]) })
  plan.push({ match: "auth token", stdout: "fixture-token" })
  const transcriptPath = stage("progress-cli/transcript.jsonl", `${JSON.stringify({ timestamp: "2026-10-01T00:00:00Z", type: "user" })}\n`)
  const env = { ...orcaEnv(plan), GIT_BIN: process.execPath }
  // Node receives Git's argv through the shared shim, without invoking a real repository.
  env.ORBIT_ORCA_STUB = JSON.stringify([...plan, { match: "remote get-url origin", stdout: "https://github.com/example/orbit-ui-mobile.git\n" }])
  check("progress-window.mjs", "CLI reads paginated responses from outside the checkout", ["--session", "current", "--transcript", transcriptPath],
    { status: 0, stdout: /"baseline": "available"/ }, { path: staged.path, cwd: sources.repoRoot, env })
  check("progress-window.mjs", "CLI refuses a missing session", [], { status: 2 })
  T("progress-window: default skill gathers the full live window before ancestry checks",
    readFileSync(join(REPO_ROOT, ".claude/skills/progress/SKILL.md"), "utf8").includes("node tools/progress-window.mjs --session"))
}
