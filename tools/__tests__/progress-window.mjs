import { readFileSync } from "node:fs"
import { join } from "node:path"
import { T, REPO_ROOT, check, orcaEnv, realOrchestratorConfig, stage, stageWithConfig } from "./_harness.mjs"
import { fixture } from "./progress-window-core.mjs"

export const cases = async () => {
  const staged = stageWithConfig("progress-cli", "progress-window.mjs", realOrchestratorConfig())
  const sources = fixture("progress-cli-sources")
  const plan = []
  const runReply = (run) => JSON.stringify([{ databaseId: run.id, displayTitle: run.display_title,
    headBranch: run.head_branch, conclusion: run.conclusion ?? "", status: run.status,
    createdAt: run.created_at, updatedAt: run.updated_at, url: run.html_url }])
  for (const repository of ["orbit-ui-mobile", "orbit-api", "orbit-landing-page"]) {
    plan.push({ match: `repos/example/${repository}/pulls?`, stdout: JSON.stringify([sources.recorded.pull]) })
    plan.push({ match: `run list --repo example/${repository} --workflow release.yml`, stdout: runReply(sources.recorded.run) })
    if (repository === "orbit-ui-mobile") plan.push({ match: `run list --repo example/${repository} --workflow android-release.yml`, stdout: runReply(sources.recorded.android) })
  }
  plan.push({ match: "repos/thomasluizon/orbit-tickets/issues?", stdout: JSON.stringify([sources.recorded.ticket]) })
  plan.push({ match: "auth token", stdout: "fixture-token" })
  const transcriptPath = stage("progress-cli/current.jsonl", `${JSON.stringify({ timestamp: "2026-10-01T00:00:00Z", type: "user" })}\n`)
  const env = { ...orcaEnv(plan), GIT_BIN: process.execPath }
  // Node receives Git's argv through the shared shim, without invoking a real repository.
  env.ORBIT_ORCA_STUB = JSON.stringify([...plan, { match: "remote get-url origin", stdout: "https://github.com/example/orbit-ui-mobile.git\n" }])
  const result = check("progress-window.mjs", "CLI reads paginated responses from outside the checkout", ["--session", "current", "--transcript", transcriptPath],
    { status: 0, stdout: /"baseline": "available"/ }, { path: staged.path, cwd: sources.repoRoot, env })
  const report = result.status === 0 ? JSON.parse(result.stdout) : null
  T("progress-window: CLI retains all repository sources and the Android upload", report?.entries[0].merges.length === 3 &&
    report.entries[0].releases.length === 4 && report.entries[0].closedTickets.length === 1)
  check("progress-window.mjs", "CLI reports an absent baseline without authentication", ["--session", "unrecorded"],
    { status: 0, stdout: /"baseline": "unavailable"/ }, { path: staged.path, cwd: sources.repoRoot, env: { ...env,
      ORBIT_ORCA_STUB: JSON.stringify([{ match: "remote get-url origin", stdout: "https://github.com/example/orbit-ui-mobile.git\n" }]) } })
  check("progress-window.mjs", "CLI reports a failed source on stderr", ["--session", "current", "--transcript", transcriptPath],
    { status: 1, stderr: /GitHub read failed/ }, { path: staged.path, cwd: sources.repoRoot, env: { ...env,
      ORBIT_ORCA_STUB: JSON.stringify([{ match: "api --paginate", exit: 1, stderr: "remote read failed" },
        ...JSON.parse(env.ORBIT_ORCA_STUB)]) } })
  check("progress-window.mjs", "CLI refuses a truncated release listing", ["--session", "current", "--transcript", transcriptPath],
    { status: 1, stderr: /incomplete release listing/ }, { path: staged.path, cwd: sources.repoRoot, env: { ...env,
      ORBIT_ORCA_STUB: JSON.stringify([{ match: "run list", stdout: JSON.stringify(Array(10000).fill({})) },
        ...JSON.parse(env.ORBIT_ORCA_STUB)]) } })
  check("progress-window.mjs", "CLI propagates a release listing failure", ["--session", "current", "--transcript", transcriptPath],
    { status: 1, stderr: /GitHub read failed/ }, { path: staged.path, cwd: sources.repoRoot, env: { ...env,
      ORBIT_ORCA_STUB: JSON.stringify([{ match: "run list", exit: 1, stderr: "release read failed" },
        ...JSON.parse(env.ORBIT_ORCA_STUB)]) } })
  check("progress-window.mjs", "CLI refuses a missing session", [], { status: 2 })
  T("progress-window: default skill gathers the full live window before ancestry checks",
    readFileSync(join(REPO_ROOT, ".claude/skills/progress/SKILL.md"), "utf8").includes("node tools/progress-window.mjs --session"))
}
