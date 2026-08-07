import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "salvage-worker.mjs"

export const cases = () => {
  const repo = stageRepo("salvage-worker-repo")
  if (!repo || repo.git(["switch", "-q", "-c", "feature/salvage"]).status !== 0) {
    T(`${TOOL}: a salvage repository fixture is available`, false, "could not stage repository")
    return
  }
  const staged = stageWithConfig("salvage-worker", TOOL, realOrchestratorConfig())
  const config = realOrchestratorConfig()
  config.repos = { ...config.repos, ui: repo.path }
  writeFileSync(staged.configPath, `${JSON.stringify(config, null, 2)}\n`)
  const changed = join(repo.path, "salvaged.txt")
  writeFileSync(changed, "worker output\n")
  const receipt = stage("salvage-worker/test-receipt.json", "")
  const failedOrder = stage("salvage-worker/fail-command.json", JSON.stringify({ command: process.execPath, args: ["-e", "process.exit(7)"] }))
  const common = [
    "--issue", "ORB-250", "--repo", "ui", "--pr", "77", "--worktree", repo.path,
    "--branch", "feature/salvage", "--run-root", repo.path, "--test-receipt", receipt,
    "--message", "salvage worker output", "--path", "salvaged.txt",
  ]

  const failed = check(
    TOOL,
    "a salvaged push without a green workspace test receipt fails",
    [...common, "--test-command", failedOrder],
    { status: 1, stderr: /workspace test failed; nothing was staged or pushed/ },
    { path: staged.path },
  )
  T(
    `${TOOL}: failed salvage stages nothing`,
    repo.git(["diff", "--cached", "--name-only"]).stdout.trim() === "" && JSON.parse(readFileSync(receipt, "utf8")).exitCode === 1,
    failed.stdout || failed.stderr,
  )
  T(
    `${TOOL}: failed salvage pushes no branch`,
    repo.git(["ls-remote", "--heads", "origin", "feature/salvage"]).stdout.trim() === "",
    "failed test reached the remote",
  )

  const passedOrder = stage("salvage-worker/pass-command.json", JSON.stringify({ command: process.execPath, args: ["-e", "process.exit(0)"] }))
  const passed = check(
    TOOL,
    "a green real test receipt permits named-path commit and push",
    [...common, "--test-command", passedOrder],
    { status: 0, stdout: /"stagedPaths": \[\s*"salvaged\.txt"/ },
    { path: staged.path },
  )
  const state = JSON.parse(readFileSync(join(repo.path, ".git", "orbit-orchestrate-run.json"), "utf8"))
  T(
    `${TOOL}: salvage registers a repository-qualified unreviewed readiness receipt before delivery`,
    state.pullRequests?.[0]?.repositoryKey === "ui" && state.pullRequests[0].prNumber === 77 && /ui-77\.json$/.test(state.pullRequests[0].receiptPath),
    JSON.stringify(state),
  )
  T(`${TOOL}: successful salvage reached the named remote branch`, repo.git(["ls-remote", "--heads", "origin", "feature/salvage"]).stdout.includes("refs/heads/feature/salvage"), passed.stdout || passed.stderr)

  const second = stageRepo("salvage-worker-broad")
  const broadStaged = stageWithConfig("salvage-worker-broad", TOOL, config)
  for (const broad of [".", "sub/..", ":(glob)**"]) {
    check(
      TOOL,
      `broad staging path ${broad} is rejected before the test runs`,
      ["--issue", "ORB-250", "--repo", "ui", "--pr", "78", "--worktree", second.path, "--branch", "feature/salvage", "--run-root", second.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "x", "--path", broad],
      { status: 2, stderr: /never broad staging/ },
      { path: broadStaged.path },
    )
  }
  for (const broad of ["*", "src/**"]) {
    check(
      TOOL,
      `broad staging path ${broad} cannot match an exact dirty file`,
      ["--issue", "ORB-250", "--repo", "ui", "--pr", "78", "--worktree", second.path, "--branch", "feature/salvage", "--run-root", second.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "x", "--path", broad],
      { status: 2, stderr: /must name one exact dirty file/ },
      { path: broadStaged.path },
    )
  }

  const literal = stageRepo("salvage-worker-literal")
  const route = "apps/web/app/api/[...path]/route.ts"
  mkdirSync(join(literal.path, "apps", "web", "app", "api", "[...path]"), { recursive: true })
  writeFileSync(join(literal.path, route), "export const route = true\n")
  const literalStaged = stageWithConfig("salvage-worker-literal", TOOL, config)
  check(
    TOOL,
    "a bracketed explicit filename is staged with literal pathspec semantics",
    ["--issue", "ORB-250", "--repo", "ui", "--pr", "79", "--worktree", literal.path, "--branch", "feature/salvage", "--run-root", literal.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "literal route", "--path", route],
    { status: 0, stdout: /apps\/web\/app\/api\/\[\.\.\.path\]\/route\.ts/ },
    { path: literalStaged.path },
  )
}
