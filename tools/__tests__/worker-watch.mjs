import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { TOOLS_DIR, T, root, orcaEnv, run, check, stageWorkerPidMarker, exitedProbePid } from "./_harness.mjs"

/**
 * worker-watch cases against the PID model that replaced the repaint delta. Liveness is now a
 * launcher-written PID the harness can prove alive or dead, but everything else the report is for
 * survives: the Linear state beside liveness, a contract verdict that degrades visibly rather than
 * vanishing, an empty fleet that says so, and a --repo filter that actually excludes.
 */
const stageWorkerWatch = (label, repoPath) => {
  const base = join(root, "watch", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({ worker: "codex", maxParallelWorktrees: 4, repos: { ui: repoPath, api: join(root, "watch", "absent-api") } }),
  )
  cpSync(join(TOOLS_DIR, "worker-watch.mjs"), join(base, "tools", "worker-watch.mjs"))
  cpSync(join(TOOLS_DIR, "worker-status.mjs"), join(base, "tools", "worker-status.mjs"))
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return join(base, "tools", "worker-watch.mjs")
}

const stageWatchedWorktree = (label) => {
  const path = join(root, "watch", "repos", label)
  mkdirSync(path, { recursive: true })
  spawnSync("git", ["-C", path, "init", "--initial-branch=main"], { encoding: "utf8" })
  return path
}

const workerWatchCases = () => {
  const repoPath = join(root, "watch", "repos")
  const tool = stageWorkerWatch("fleet", repoPath)
  const watchPlan = (worktrees) => [
    { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees } }) },
    { match: "linear issue ORB-75", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-75", state: { name: "In Progress" } } } }) },
  ]
  const watched = (path) => ({
    path,
    isMainWorktree: false,
    isArchived: false,
    branch: "refs/heads/feature/orb-75-prove-the-harness-gate",
    linkedLinearIssue: "ORB-75",
    baseRef: "main",
  })

  check(
    "worker-watch.mjs",
    "an empty fleet says so rather than printing nothing",
    [],
    { status: 0, stdout: /no Orca worktrees/ },
    { path: tool, env: orcaEnv(watchPlan([])) },
  )

  const livePath = stageWatchedWorktree("live")
  stageWorkerPidMarker(livePath, process.pid)
  const live = check(
    "worker-watch.mjs",
    "a launcher PID that is still running is BUSY",
    [],
    { status: 0, stdout: /BUSY\s+ORB-75/ },
    { path: tool, env: orcaEnv(watchPlan([watched(livePath)])) },
  )
  T(
    "worker-watch.mjs: the ticket's Linear state is reported alongside liveness",
    /In Progress/.test(live.stdout),
    live.stdout.slice(0, 400),
  )
  T(
    "worker-watch.mjs: an unreadable contract verdict is reported, never silently dropped",
    /contract\s+unavailable/.test(live.stdout),
    `worker-status ran against a checkout with no Orbit contract, so the verdict must degrade visibly\n     ${live.stdout.slice(0, 400)}`,
  )
  /**
   * IDLE plus NOT MET is the pair that costs a run, so it is the row that has to say WHAT is
   * unmet. worker-status.mjs already returns the list on stdout; reading only its exit code
   * threw away the one thing an operator acts on, while /watch's own worked example promised it.
   */
  const verdictTool = stageWorkerWatch("verdict", repoPath)
  writeFileSync(
    join(dirname(verdictTool), "worker-status.mjs"),
    `#!/usr/bin/env node\nconsole.log(JSON.stringify({ issue: "ORB-75", unmet: ["commits", "pushed", "pr-open"], pullRequest: null, ok: false }))\nprocess.exit(1)\n`,
  )
  const unmetReport = check(
    "worker-watch.mjs",
    "a NOT MET row names the unmet checklist rather than the bare verdict",
    [],
    { status: 0, stdout: /contract\s+NOT MET: commits, pushed, pr-open/ },
    { path: verdictTool, env: orcaEnv(watchPlan([watched(livePath)])) },
  )
  T(
    "worker-watch.mjs: the JSON report carries the same unmet list the text line names",
    /"unmet": \[\s*"commits",\s*"pushed",\s*"pr-open"\s*\]/.test(
      run("worker-watch.mjs", ["--json"], { path: verdictTool, env: orcaEnv(watchPlan([watched(livePath)])) }).stdout,
    ),
    unmetReport.stdout.slice(0, 400),
  )

  const exitedPath = stageWatchedWorktree("exited")
  stageWorkerPidMarker(exitedPath, exitedProbePid())
  check(
    "worker-watch.mjs",
    "a launcher PID that has exited is IDLE",
    [],
    { status: 0, stdout: /IDLE\s+ORB-75/ },
    { path: tool, env: orcaEnv(watchPlan([watched(exitedPath)])) },
  )

  check(
    "worker-watch.mjs",
    "--repo actually excludes a worktree outside that repo",
    ["--repo", "api"],
    { status: 0, stdout: /no Orca worktrees for api/ },
    { path: tool, env: orcaEnv(watchPlan([watched(livePath)])) },
  )
  check(
    "worker-watch.mjs",
    "--repo keeps a worktree inside that repo",
    ["--repo", "ui"],
    { status: 0, stdout: /BUSY\s+ORB-75/ },
    { path: tool, env: orcaEnv(watchPlan([watched(livePath)])) },
  )
  check(
    "worker-watch.mjs",
    "the JSON report carries the PID liveness the text line summarises",
    ["--json"],
    { status: 0, stdout: /"liveness": "BUSY"[\s\S]*"pid": \d+,\s*"alive": true/ },
    { path: tool, env: orcaEnv(watchPlan([watched(livePath)])) },
  )
  check("worker-watch.mjs", "refuses a repo outside orchestrator.json", ["--repo", "zzz"], { status: 2, stderr: /--repo must be one of/ }, { path: tool })
  check("worker-watch.mjs", "refuses an unknown option instead of ignoring it", ["--lines", "8"], { status: 2, stderr: /unknown option/ }, { path: tool })
  check("worker-watch.mjs", "documents the JSON report mode", ["--help"], { status: 0, stdout: /--json/ }, { path: tool })
}

export { workerWatchCases as cases }
