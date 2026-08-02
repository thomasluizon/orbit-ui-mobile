import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { generateKeyPairSync } from "node:crypto"
import { dirname, join } from "node:path"

import { recordWorkerLaunch, signWorkerLaunchRecord } from "../lib/worker-launch-provenance.mjs"
import { REPO_ROOT, TOOLS_DIR, T, WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY, root, orcaEnv, run, check, exitedProbePid } from "./_harness.mjs"
import { WORKER_LAUNCH_LEDGER } from "./_harness.mjs"

/**
 * worker-watch cases against the one thing this tool must never do again: derive liveness itself.
 * It used to run its own `process.kill(pid, 0)`, read every non-ESRCH errno as alive, carry no
 * PID-reuse backstop and no third state, and print BUSY for a recycled id. Liveness and the
 * delivery verdict now come from worker-status.mjs, so these cases drive the REAL worker-status
 * wherever they can and assert that what the report prints is what that tool decided. Everything
 * else the report is for survives: the Linear state beside liveness, a contract verdict that
 * degrades visibly rather than vanishing, an empty fleet that says so, and a --repo filter that
 * actually excludes.
 */
const stageWorkerWatch = (label, repos) => {
  const base = join(root, "watch", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({
      worker: "codex",
      workers: {
        codex: {
          command: "codex",
          args: ["exec", "-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox"],
          models: {
            default: { model: "gpt-5.6-luna", args: ["-c", 'model_reasoning_effort="max"'] },
            cheap: { model: "gpt-5.6-luna", args: ["-c", 'model_reasoning_effort="low"'] },
            deep: { model: "gpt-5.6-sol", args: ["-c", 'model_reasoning_effort="high"'] },
          },
          interactive: false,
        },
      },
      maxParallelWorktrees: 4,
      attemptsBeforeRewrite: 2,
      linear: { team: "ORB", states: { working: "In Progress", review: "In Review", done: "Done" } },
      repos,
    }),
  )
  cpSync(join(TOOLS_DIR, "worker-watch.mjs"), join(base, "tools", "worker-watch.mjs"))
  cpSync(join(TOOLS_DIR, "worker-status.mjs"), join(base, "tools", "worker-status.mjs"))
  cpSync(join(TOOLS_DIR, "check-review-evidence.mjs"), join(base, "tools", "check-review-evidence.mjs"))
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return join(base, "tools", "worker-watch.mjs")
}

/**
 * A checkout the REAL worker-status.mjs can read end to end: a commit to resolve, and an `origin`
 * to fetch and ls-remote against, because worker-status treats a failed ls-remote as a hard error
 * rather than an unpushed branch. Everything beyond git (gh, orca) is stubbed by the shim.
 *
 * It sits under `workspaces`, NOT under either configured repo path, because that is where Orca
 * really puts a child worktree (measured on the live fleet: repos.ui is the Documents checkout
 * while its child is in C:\Users\thoma\orca\workspaces\orbit-ui-mobile\<slug>). A fixture parked
 * inside the repo path would agree with the deleted startsWith filter and prove nothing.
 */
const stageWatchedWorktree = (label) => {
  const path = join(root, "watch", "workspaces", label)
  const origin = join(root, "watch", "origins", `${label}.git`)
  mkdirSync(path, { recursive: true })
  spawnSync("git", ["init", "-q", "--bare", "--initial-branch=main", origin], { encoding: "utf8" })
  for (const argv of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["remote", "add", "origin", origin],
    ["push", "-q", "origin", "main"],
  ]) {
    spawnSync("git", ["-C", path, ...argv], { encoding: "utf8" })
  }
  return path
}

const HOUR_MS = 3_600_000

/**
 * The claim age is pinned at an ABSOLUTE number of hours, never at `PID_REUSE_BACKSTOP_HOURS + 1`.
 * That constant lives in worker-status.mjs; a fixture derived from it would follow it and the case
 * would stay green whatever it was moved to. 1 hour is inside the shipped 16h backstop and 17 hours
 * is outside it, so moving the constant in either direction turns these cases red, which is the
 * only way a fixture can hold a constant still.
 */
const writeWatchPidMarker = (worktreePath, { pid, claimedHoursAgo, issue = "ORB-75" }) => {
  const gitDirectory = join(
    worktreePath,
    spawnSync("git", ["-C", worktreePath, "rev-parse", "--git-dir"], { encoding: "utf8" }).stdout.trim(),
  )
  const marker = join(gitDirectory, "orbit-worker-pids.jsonl")
  const startedAt = new Date(Date.now() - claimedHoursAgo * HOUR_MS).toISOString()
  let launchRecord = {
    version: 1,
    launchId: `watch-fixture-${issue}-${pid}-${Date.now()}`,
    issue,
    worktreePath: join(worktreePath),
    pid,
    startedAt,
    launchMode: "existing-worktree",
    engine: "codex",
    invocation: {
      command: "codex",
      args: ["exec", "-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox", "-c", 'model_reasoning_effort="max"', "--model", "gpt-5.6-luna"],
    },
    branch: "feature/orb-75-prove-the-harness-gate",
    launcherPid: process.pid,
    issuedAt: new Date().toISOString(),
    completionAttestation: {
      algorithm: "ed25519",
      publicKey: generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    },
  }
  launchRecord = signWorkerLaunchRecord(launchRecord, WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY)
  recordWorkerLaunch(launchRecord, WORKER_LAUNCH_LEDGER)
  writeFileSync(marker, `${JSON.stringify(launchRecord)}\n`)
  return marker
}

/**
 * worker-status.mjs --json as it really answered on 2026-07-31, captured from
 * `node tools/worker-status.mjs --worktree <the live ORB-163 worktree> --issue ORB-163 --base main
 * --json` (exit 1). The live fleet had no stalled worker to capture, so exactly two fields are
 * substituted, `verdict` and `liveness`, to the (STALLED, gone) pair a live capture could not
 * produce; every field NAME and every other shape here is the real payload's. The `checks` array is
 * carried as the real run emitted its first entries, truncated, because worker-watch reads `unmet`
 * rather than `checks` and a longer copy would prove nothing more.
 */
const capturedStatusPayload = (worktree, { verdict, liveness, unmet }) => ({
  issue: "ORB-75",
  branch: "feature/orb-75-prove-the-harness-gate",
  base: "main",
  worktree,
  repo: "thomasluizon/orbit-ui-mobile",
  pullRequest: "https://github.com/thomasluizon/orbit-ui-mobile/pull/667",
  verifyReview: false,
  checks: [
    { name: "commits", ok: false, detail: "no commits on feature/orb-75-prove-the-harness-gate above origin/main" },
    { name: "worktree-clean", ok: false, detail: "30 uncommitted path(s), work is not captured" },
  ],
  unmet,
  ok: false,
  verdict,
  liveness,
  relaunch: {
    scope: "relaunch",
    headSha: "dcfa85da4cd4983360e1ef97f969696bee15bb0d",
    ledger: join(root, "watch", "captured-strikes.jsonl"),
    cap: 2,
    consumed: 0,
    remaining: 2,
    allowed: verdict === "STALLED",
    refusal: verdict === "STALLED" ? null : `the verdict is ${verdict}, and only STALLED spends a relaunch allowance`,
    unmet,
    findings: [],
  },
})

const stageStatusStub = (toolPath, source) => writeFileSync(join(dirname(toolPath), "worker-status.mjs"), source)

/** The two facts orca's payload really carries per repository: its main worktree path and its id. */
const UI_REPO = { path: join(root, "watch", "repos", "ui"), repoId: "42f5fd75-de83-43bc-8517-2ec181f11a0a" }
const API_REPO = { path: join(root, "watch", "repos", "api"), repoId: "9ef5a39a-17e6-47ce-bed2-a0642681e9db" }
const mainWorktree = ({ path, repoId }) => ({ path, repoId, isMainWorktree: true, isArchived: false, branch: "refs/heads/main", linkedLinearIssue: null })

const workerWatchCases = () => {
  const reviewClearContract = /CHANGES_REQUESTED blocks[\s\S]*No approval is required[\s\S]*If an approval exists[\s\S]*current head[\s\S]*zero unresolved threads and every automated review item is reconciled/
  const catalogReviewContract = /complete changed-file and review connections[\s\S]*Native approval is not required[\s\S]*when present at least one must name the current head[\s\S]*worker-status\.mjs[\s\S]*current-head local `APPROVE` evidence[\s\S]*zero unresolved or unreconciled review work[\s\S]*CHANGES_REQUESTED blocks[\s\S]*Native approval is not positively required[\s\S]*any native approval that exists must name the current head/
  for (const [label, path, contract] of [
    ["watch skill", join(REPO_ROOT, ".claude", "skills", "watch", "SKILL.md"), reviewClearContract],
    ["tools catalog", join(REPO_ROOT, "tools", "README.md"), catalogReviewContract],
  ]) {
    const source = readFileSync(path, "utf8")
    T(
      `worker-watch.mjs: the ${label} carries the approval-count-zero review-clear contract`,
      contract.test(source),
      `${path} no longer states the complete review-clear contract`,
    )
  }
  const conventionsSource = readFileSync(join(REPO_ROOT, "tools", "CONVENTIONS.md"), "utf8")
  T(
    "worker-watch.mjs: tool conventions no longer claim a CI reviewer exists",
    conventionsSource.includes("no CI reviewer exists") && !conventionsSource.includes("the CI reviewer reads the diff"),
    "tools/CONVENTIONS.md still assigns the gate to a deleted CI reviewer",
  )
  const dependabotWorkflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "dependabot-auto-merge.yml"), "utf8")
  T(
    "worker-watch.mjs: the Dependabot approval comment reflects zero required approvals",
    dependabotWorkflow.includes("Approval is not required by branch protection") && !dependabotWorkflow.includes('"require 1 approving review"'),
    "dependabot-auto-merge.yml still says its approval satisfies an obsolete branch-protection rule",
  )
  const repos = { ui: UI_REPO.path, api: API_REPO.path }
  const tool = stageWorkerWatch("fleet", repos)
  const strikeLedger = join(root, "watch", "strikes.jsonl")
  const watchPlan = (worktrees, mains = [mainWorktree(UI_REPO), mainWorktree(API_REPO)]) => [
    {
      match: "worktree list",
      stdout: JSON.stringify({ ok: true, result: { worktrees: [...mains, ...worktrees] } }),
    },
    {
      match: "linear issue ORB-75",
      stdout: JSON.stringify({
        ok: true,
        result: { issue: { identifier: "ORB-75", state: { name: "In Progress" }, labels: [] }, attachments: [] },
      }),
    },
    { match: "pr list", stdout: "[]" },
  ]
  const watched = (path) => ({
    path,
    repoId: UI_REPO.repoId,
    isMainWorktree: false,
    isArchived: false,
    branch: "refs/heads/feature/orb-75-prove-the-harness-gate",
    linkedLinearIssue: "ORB-75",
    baseRef: "main",
  })
  const watchEnv = (worktrees, mains) => ({ ...orcaEnv(watchPlan(worktrees, mains)), ORBIT_WORKER_STRIKE_LEDGER: strikeLedger })

  check(
    "worker-watch.mjs",
    "an empty fleet says so rather than printing nothing",
    [],
    { status: 0, stdout: /no Orca worktrees/ },
    { path: tool, env: watchEnv([]) },
  )

  const livePath = stageWatchedWorktree("live")
  writeWatchPidMarker(livePath, { pid: process.pid, claimedHoursAgo: 1 })
  const live = check(
    "worker-watch.mjs",
    "a launcher PID still running inside the reuse backstop is ALIVE with worker-status's own verdict",
    [],
    { status: 0, stdout: /worker ALIVE\s+verdict WORKING\s+ORB-75/ },
    { path: tool, env: watchEnv([watched(livePath)]) },
  )
  T(
    "worker-watch.mjs: the ticket's Linear state is reported alongside liveness",
    /In Progress/.test(live.stdout),
    live.stdout.slice(0, 400),
  )

  /**
   * The pair that costs a run: a worker process that exited without delivering. The verdict is
   * IDLE and not STALLED because no pull request is open, which is worker-status's distinction
   * between "needs a launch decision" and "needs a relaunch". worker-watch must carry whichever
   * one it was handed; the STALLED case below proves it is carried rather than inferred from
   * the same gone liveness.
   */
  const exitedPath = stageWatchedWorktree("exited")
  writeWatchPidMarker(exitedPath, { pid: exitedProbePid(), claimedHoursAgo: 1 })
  const exited = check(
    "worker-watch.mjs",
    "a launcher PID that has exited is GONE with the verdict worker-status decided for it",
    [],
    { status: 0, stdout: /worker GONE\s+verdict IDLE\s+ORB-75/ },
    { path: tool, env: watchEnv([watched(exitedPath)]) },
  )
  T(
    "worker-watch.mjs: a gone worker is never reported as alive",
    !/worker (ALIVE|UNKNOWN)/.test(exited.stdout),
    exited.stdout.slice(0, 400),
  )

  /**
   * The defect in one case: this pid answers alive, so the deleted local derivation printed BUSY.
   * worker-status fails closed on it because the claim is past the reuse backstop, and UNKNOWN
   * must survive the trip into the report as its own visible state.
   */
  const recycledPath = stageWatchedWorktree("recycled")
  writeWatchPidMarker(recycledPath, { pid: process.pid, claimedHoursAgo: 17 })
  const recycled = check(
    "worker-watch.mjs",
    "a pid answering alive past the reuse backstop is UNKNOWN, never busy",
    [],
    { status: 0, stdout: /worker UNKNOWN\s+verdict UNKNOWN\s+ORB-75/ },
    { path: tool, env: watchEnv([watched(recycledPath)]) },
  )
  T(
    "worker-watch.mjs: a possibly recycled pid is reported neither alive nor gone, and recommends nothing",
    !/worker (ALIVE|GONE)/.test(recycled.stdout) && !/relaunch/i.test(recycled.stdout),
    recycled.stdout.slice(0, 400),
  )
  T(
    "worker-watch.mjs: an UNKNOWN row says why the liveness could not be read",
    /liveness unread: pid \d+ answers alive but was claimed/.test(recycled.stdout),
    recycled.stdout.slice(0, 400),
  )

  const unmarkedPath = stageWatchedWorktree("unmarked")
  const unmarked = check(
    "worker-watch.mjs",
    "a worktree with no launcher PID marker is UNKNOWN rather than idle",
    [],
    { status: 0, stdout: /worker UNKNOWN\s+verdict UNKNOWN\s+ORB-75/ },
    { path: tool, env: watchEnv([watched(unmarkedPath)]) },
  )
  T(
    "worker-watch.mjs: a missing PID marker is named as the reason liveness is unread",
    /liveness unread: no launcher PID marker at/.test(unmarked.stdout),
    unmarked.stdout.slice(0, 400),
  )

  /**
   * IDLE plus NOT MET is the pair that costs a run, so it is the row that has to say WHAT is
   * unmet. worker-status.mjs already returns the list on stdout; reading only its exit code
   * threw away the one thing an operator acts on, while /watch's own worked example promised it.
   */
  const verdictTool = stageWorkerWatch("verdict", repos)
  const stalled = capturedStatusPayload(exitedPath, {
    verdict: "STALLED",
    liveness: {
      state: "gone",
      marker: join(exitedPath, ".git", "orbit-worker-pids.jsonl"),
      pids: [{ pid: 4242, state: "gone", detail: "pid 4242 is gone (ESRCH)" }],
      detail: "pid 4242 is gone (ESRCH)",
    },
    unmet: ["commits", "pushed", "pr-open"],
  })
  stageStatusStub(verdictTool, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(stalled, null, 2))})\nprocess.exit(1)\n`)
  const unmetReport = check(
    "worker-watch.mjs",
    "a NOT MET row names the unmet checklist rather than the bare verdict",
    [],
    { status: 0, stdout: /contract NOT MET: commits, pushed, pr-open/ },
    { path: verdictTool, env: watchEnv([watched(exitedPath)]) },
  )
  T(
    "worker-watch.mjs: the same gone liveness carries STALLED when worker-status says STALLED, so the verdict is read and not re-derived",
    /worker GONE\s+verdict STALLED\s+ORB-75/.test(unmetReport.stdout),
    unmetReport.stdout.slice(0, 400),
  )
  const verdictJson = run("worker-watch.mjs", ["--json"], { path: verdictTool, env: watchEnv([watched(exitedPath)]) })
  T(
    "worker-watch.mjs: the JSON report carries the same unmet list the text line names",
    /"unmet": \[\s*"commits",\s*"pushed",\s*"pr-open"\s*\]/.test(verdictJson.stdout),
    unmetReport.stdout.slice(0, 400),
  )
  T(
    "worker-watch.mjs: the JSON report carries worker-status's liveness state and its pid readings verbatim",
    /"liveness": "gone"/.test(verdictJson.stdout) && /"pid": 4242,\s*"state": "gone"/.test(verdictJson.stdout),
    verdictJson.stdout.slice(0, 600),
  )

  /**
   * worker-status can fail before it prints anything (exit 2 usage, exit 3 a git, gh or orca
   * failure). A report that filled that hole with a state of its own would be the same defect in
   * a new place, so both the verdict and the contract read unavailable and liveness reads UNKNOWN.
   */
  const silentTool = stageWorkerWatch("silent", repos)
  stageStatusStub(silentTool, `#!/usr/bin/env node\nconsole.error("orca linear issue ORB-75 failed: no such issue")\nprocess.exit(3)\n`)
  const silent = check(
    "worker-watch.mjs",
    "a worker-status run that printed no verdict is reported as unavailable, never invented",
    [],
    { status: 0, stdout: /worker UNKNOWN\s+verdict unavailable\s+ORB-75/ },
    { path: silentTool, env: watchEnv([watched(exitedPath)]) },
  )
  T(
    "worker-watch.mjs: an unreadable contract verdict is reported, never silently dropped",
    /contract unavailable/.test(silent.stdout) && /worker-status\.mjs exited 3 without a JSON verdict/.test(silent.stdout),
    silent.stdout.slice(0, 400),
  )

  check(
    "worker-watch.mjs",
    "--repo actually excludes a worktree belonging to another repo",
    ["--repo", "api"],
    { status: 0, stdout: /no Orca worktrees for api/ },
    { path: verdictTool, env: watchEnv([watched(exitedPath)]) },
  )
  /**
   * The regression guard for the filter itself: this worktree belongs to ui by repoId while living
   * nowhere near repos.ui, exactly as every real Orca worktree does. A filter that went back to
   * matching the configured path would report an empty ui fleet over a live worker, which is what
   * the shipped one did.
   */
  check(
    "worker-watch.mjs",
    "--repo keeps a worktree that belongs to that repo but does not live under its path",
    ["--repo", "ui"],
    { status: 0, stdout: /worker GONE\s+verdict STALLED/ },
    { path: verdictTool, env: watchEnv([watched(exitedPath)]) },
  )
  check(
    "worker-watch.mjs",
    "a --repo path orca does not list as a main worktree is refused, not reported as an empty fleet",
    ["--repo", "ui"],
    { status: 2, stderr: /orca does not list as a repository main worktree/ },
    { path: verdictTool, env: watchEnv([watched(exitedPath)], [mainWorktree(API_REPO)]) },
  )
  check("worker-watch.mjs", "refuses a repo outside orchestrator.json", ["--repo", "zzz"], { status: 2, stderr: /--repo must be one of/ }, { path: tool })
  check("worker-watch.mjs", "refuses an unknown option instead of ignoring it", ["--lines", "8"], { status: 2, stderr: /unknown option/ }, { path: tool })
  check("worker-watch.mjs", "documents the JSON report mode", ["--help"], { status: 0, stdout: /--json/ }, { path: tool })
}

export { workerWatchCases as cases }
