import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, processIsRunning, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "salvage-worker.mjs"
const ADAPTER_STUB = `export const resolveTicket = (reference) => {
  const identifier = String(reference).toUpperCase()
  if (identifier !== "ORB-250") throw new Error("Unknown migrated ticket " + reference)
  return { identifier, number: 250 }
}
export const readTicket = async () => ({ identifier: "ORB-250", number: 250, labels: [{ name: "repo:ui" }] })
export const assertRepositoryLabel = (ticket, repoKey) => {
  if (ticket.labels.length !== 1 || ticket.labels[0].name !== "repo:" + repoKey) throw new Error("ticket repository label mismatch")
  return ticket
}
`
const stageSalvage = (label, config) => {
  const staged = stageWithConfig(label, TOOL, config)
  stage(`staged/${label}/tools/lib/github-issues.mjs`, ADAPTER_STUB)
  return staged
}

export const cases = () => {
  const repo = stageRepo("salvage-worker-repo")
  if (!repo || repo.git(["switch", "-q", "-c", "feature/salvage"]).status !== 0) {
    T(`${TOOL}: a salvage repository fixture is available`, false, "could not stage repository")
    return
  }
  const staged = stageSalvage("salvage-worker", realOrchestratorConfig())
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

  const wrongBranch = stageRepo("salvage-worker-wrong-branch")
  if (wrongBranch?.git(["switch", "-q", "-c", "feature/actual"]).status === 0) {
    writeFileSync(join(wrongBranch.path, "wrong.txt"), "must remain local\n")
    const wrongBranchStaged = stageSalvage("salvage-worker-wrong-branch", { ...config, repos: { ...config.repos, ui: wrongBranch.path } })
    const wrongCommon = ["--issue", "ORB-250", "--repo", "ui", "--worktree", wrongBranch.path, "--run-root", wrongBranch.path, "--test-command", failedOrder, "--test-receipt", receipt, "--message", "never", "--path", "wrong.txt"]
    check(TOOL, "a stale salvage branch is rejected before testing or pushing", [...wrongCommon, "--branch", "feature/other"], { status: 2, stderr: /must exactly match.*feature\/actual.*feature\/other/ }, { path: wrongBranchStaged.path })
    check(TOOL, "the protected main branch is rejected before testing or pushing", [...wrongCommon, "--branch", "main"], { status: 2, stderr: /may not name the protected main branch/ }, { path: wrongBranchStaged.path })
    T(`${TOOL}: branch refusal leaves the salvage change uncommitted`, wrongBranch.git(["rev-list", "--count", "main..HEAD"]).stdout.trim() === "0", "wrong branch reached a commit")
  } else {
    T(`${TOOL}: wrong-branch salvage fixture is available`, false, "could not create branch")
  }

  const passedOrder = stage("salvage-worker/pass-command.json", JSON.stringify({ command: process.execPath, args: ["-e", "process.exit(0)"] }))
  const mutating = stageRepo("salvage-worker-mutating-test")
  if (mutating?.git(["switch", "-q", "-c", "feature/mutating-test"]).status === 0) {
    const mutatingPath = join(mutating.path, "mutated.txt")
    writeFileSync(mutatingPath, "before test\n")
    const mutatingOrder = stage("salvage-worker/mutating-command.json", JSON.stringify({ command: process.execPath, args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'after test\\n')", mutatingPath] }))
    const mutatingStaged = stageSalvage("salvage-worker-mutating-test", { ...config, repos: { ...config.repos, ui: mutating.path } })
    check(
      TOOL,
      "a green test that mutates a named path cannot publish untested bytes",
      ["--issue", "ORB-250", "--repo", "ui", "--worktree", mutating.path, "--branch", "feature/mutating-test", "--run-root", mutating.path, "--test-command", mutatingOrder, "--test-receipt", receipt, "--message", "never", "--path", "mutated.txt"],
      { status: 1, stderr: /workspace test mutated named paths.*mutated\.txt/ },
      { path: mutatingStaged.path },
    )
    T(`${TOOL}: a mutating test leaves the changed bytes uncommitted and unstaged`, mutating.git(["rev-list", "--count", "main..HEAD"]).stdout.trim() === "0" && mutating.git(["diff", "--cached", "--name-only"]).stdout.trim() === "", "mutated test output was published")
  } else {
    T(`${TOOL}: mutating-test salvage fixture is available`, false, "could not create branch")
  }
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

  const beforePr = stageRepo("salvage-worker-before-pr")
  if (beforePr?.git(["switch", "-q", "-c", "feature/before-pr"]).status === 0) {
    writeFileSync(join(beforePr.path, "before-pr.txt"), "salvage before PR creation\n")
    const beforePrStaged = stageSalvage("salvage-worker-before-pr", { ...config, repos: { ...config.repos, ui: beforePr.path } })
    const beforePrResult = check(
      TOOL,
      "salvage can commit and push before a PR number exists",
      ["--issue", "ORB-250", "--repo", "ui", "--worktree", beforePr.path, "--branch", "feature/before-pr", "--run-root", beforePr.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "salvage before PR", "--path", "before-pr.txt"],
      { status: 0, stdout: /"prNumber": null[\s\S]*"readinessRegistrationPending": true/ },
      { path: beforePrStaged.path },
    )
    T(`${TOOL}: pre-PR salvage pushes the named branch`, beforePr.git(["ls-remote", "--heads", "origin", "feature/before-pr"]).stdout.includes("refs/heads/feature/before-pr"), beforePrResult.stdout || beforePrResult.stderr)
  } else {
    T(`${TOOL}: pre-PR salvage fixture is available`, false, "could not create branch")
  }

  const indexed = stageRepo("salvage-worker-indexed")
  if (indexed?.git(["switch", "-q", "-c", "feature/indexed"]).status === 0) {
    writeFileSync(join(indexed.path, "named.txt"), "named\n")
    writeFileSync(join(indexed.path, "unrelated.txt"), "must not publish\n")
    indexed.git(["add", "unrelated.txt"])
    const indexedStaged = stageSalvage("salvage-worker-indexed", { ...config, repos: { ...config.repos, ui: indexed.path } })
    check(
      TOOL,
      "an unrelated pre-staged path blocks salvage instead of entering the commit",
      ["--issue", "ORB-250", "--repo", "ui", "--worktree", indexed.path, "--branch", "feature/indexed", "--run-root", indexed.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "named only", "--path", "named.txt"],
      { status: 2, stderr: /index contains staged paths not named by --path: unrelated\.txt/ },
      { path: indexedStaged.path },
    )
    T(`${TOOL}: blocked salvage leaves the unrelated index entry intact and uncommitted`, indexed.git(["diff", "--cached", "--name-only"]).stdout.trim() === "unrelated.txt" && indexed.git(["rev-list", "--count", "main..HEAD"]).stdout.trim() === "0", "unrelated staged state changed or was committed")
  } else {
    T(`${TOOL}: pre-staged salvage fixture is available`, false, "could not create branch")
  }

  const omitted = stageRepo("salvage-worker-omitted")
  if (omitted?.git(["switch", "-q", "-c", "feature/omitted"]).status === 0) {
    writeFileSync(join(omitted.path, "named.txt"), "named\n")
    writeFileSync(join(omitted.path, "omitted.txt"), "must not influence the test\n")
    const omittedStaged = stageSalvage("salvage-worker-omitted", { ...config, repos: { ...config.repos, ui: omitted.path } })
    check(
      TOOL,
      "an unselected dirty source path blocks a subset-only salvage",
      ["--issue", "ORB-250", "--repo", "ui", "--worktree", omitted.path, "--branch", "feature/omitted", "--run-root", omitted.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "named only", "--path", "named.txt"],
      { status: 2, stderr: /dirty source paths not named by --path.*omitted\.txt/ },
      { path: omittedStaged.path },
    )
    T(`${TOOL}: blocked subset salvage commits nothing`, omitted.git(["rev-list", "--count", "main..HEAD"]).stdout.trim() === "0", "unselected source reached a commit")
  } else {
    T(`${TOOL}: omitted-source salvage fixture is available`, false, "could not create branch")
  }

  const hanging = stageRepo("salvage-worker-hanging-test")
  if (hanging?.git(["switch", "-q", "-c", "feature/hanging-test"]).status === 0) {
    writeFileSync(join(hanging.path, "hung.txt"), "must remain uncommitted\n")
    const descendantPid = stage("salvage-worker/hanging-test-child.pid", "")
    const hangingScript = stage("salvage-worker/hanging-test.cjs", `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })\nwriteFileSync(process.argv[2], String(child.pid))\nsetInterval(() => {}, 1000)\n`)
    const hangingOrder = stage("salvage-worker/hanging-test.json", JSON.stringify({ command: process.execPath, args: [hangingScript, descendantPid] }))
    const shortConfig = { ...config, repos: { ...config.repos, ui: hanging.path }, timeouts: { ...config.timeouts, hardCeilingMinutes: 0.02 } }
    const hangingStaged = stageSalvage("salvage-worker-hanging-test", shortConfig)
    const timed = check(
      TOOL,
      "a hanging workspace test is bounded before staging",
      ["--issue", "ORB-250", "--repo", "ui", "--worktree", hanging.path, "--branch", "feature/hanging-test", "--run-root", hanging.path, "--test-command", hangingOrder, "--test-receipt", receipt, "--message", "never", "--path", "hung.txt"],
      { status: 1, stderr: /workspace test failed; nothing was staged or pushed/ },
      { path: hangingStaged.path },
    )
    const childPid = Number(readFileSync(descendantPid, "utf8"))
    T(`${TOOL}: a timed-out workspace test leaves no descendant process`, timed.status === 1 && !processIsRunning(childPid), `descendant ${childPid} survived`)
  } else {
    T(`${TOOL}: hanging-test salvage fixture is available`, false, "could not create branch")
  }

  const hangingGit = stageRepo("salvage-worker-hanging-git")
  if (hangingGit?.git(["switch", "-q", "-c", "feature/hanging-git"]).status === 0) {
    writeFileSync(join(hangingGit.path, "hung-git.txt"), "must remain unpushed\n")
    const gitChildPid = stage("salvage-worker/hanging-git-child.pid", "")
    const hookRunner = stage("salvage-worker/hanging-git-hook.cjs", `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })\nwriteFileSync(process.argv[2], String(child.pid))\nsetInterval(() => {}, 1000)\n`)
    const hooksDir = stage("salvage-worker/hanging-git-hooks/.keep", "").replace(/[\\/]\.keep$/, "")
    const preCommit = join(hooksDir, "pre-commit")
    writeFileSync(preCommit, `#!/bin/sh\nexec "${process.execPath.replaceAll("\\", "/")}" "${hookRunner.replaceAll("\\", "/")}" "${gitChildPid.replaceAll("\\", "/")}"\n`)
    chmodSync(preCommit, 0o755)
    hangingGit.git(["config", "core.hooksPath", hooksDir])
    const gitStaged = stageSalvage("salvage-worker-hanging-git", { ...config, repos: { ...config.repos, ui: hangingGit.path } })
    const timedGit = check(
      TOOL,
      "a hanging Git commit is bounded",
      ["--issue", "ORB-250", "--repo", "ui", "--worktree", hangingGit.path, "--branch", "feature/hanging-git", "--run-root", hangingGit.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "never", "--path", "hung-git.txt", "--command-timeout-seconds", "1"],
      { status: 1, stderr: /git commit timed out after 1s; the complete child process tree was terminated/ },
      { path: gitStaged.path },
    )
    const gitPid = Number(readFileSync(gitChildPid, "utf8"))
    T(`${TOOL}: a timed-out Git operation leaves no descendant process`, timedGit.status === 1 && !processIsRunning(gitPid), `descendant ${gitPid} survived`)
  } else {
    T(`${TOOL}: hanging-Git salvage fixture is available`, false, "could not create branch")
  }

  const second = stageRepo("salvage-worker-broad")
  second?.git(["switch", "-q", "-c", "feature/salvage"])
  const broadStaged = stageSalvage("salvage-worker-broad", config)
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
  literal?.git(["switch", "-q", "-c", "feature/salvage"])
  const route = "apps/web/app/api/[...path]/route.ts"
  mkdirSync(join(literal.path, "apps", "web", "app", "api", "[...path]"), { recursive: true })
  writeFileSync(join(literal.path, route), "export const route = true\n")
  const literalStaged = stageSalvage("salvage-worker-literal", config)
  check(
    TOOL,
    "a bracketed explicit filename is staged with literal pathspec semantics",
    ["--issue", "ORB-250", "--repo", "ui", "--pr", "79", "--worktree", literal.path, "--branch", "feature/salvage", "--run-root", literal.path, "--test-command", passedOrder, "--test-receipt", receipt, "--message", "literal route", "--path", route],
    { status: 0, stdout: /apps\/web\/app\/api\/\[\.\.\.path\]\/route\.ts/ },
    { path: literalStaged.path },
  )
}
