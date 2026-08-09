import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, orcaEnv, processIsRunning, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "verify-delivery.mjs"
const BRANCH = "feature/orb-200-delivery"
const ISSUE = "ORB-200"
let testedToolPath = null

/**
 * A real git repository is the whole point: this tool exists because a worker's own report is not
 * evidence, so every fixture below is an artifact on disk that git can be asked about. `commit`
 * false is openai/codex#19945's real shape and the reason the tool exists: the process exits 0, the
 * branch is pushed by setup, and nothing was ever committed. `dirty` takes the paths to leave
 * behind, because WHICH paths are dirty is now part of the verdict.
 */
const stageDelivery = (label, { commit = true, push = true, dirty = [] } = {}) => {
  const repo = stageRepo(`verify-delivery-${label}`)
  if (!repo || repo.git(["switch", "-q", "-c", BRANCH]).status !== 0) return null
  if (commit) {
    writeFileSync(join(repo.path, "worked.txt"), `${label}\n`)
    if (repo.git(["add", "worked.txt"]).status !== 0 || repo.git(["commit", "-q", "-m", `${label} the ticket's real work`]).status !== 0) return null
  }
  if (push && repo.git(["push", "-q", "-u", "origin", BRANCH]).status !== 0) return null
  for (const path of dirty) {
    mkdirSync(dirname(join(repo.path, path)), { recursive: true })
    writeFileSync(join(repo.path, path), "left behind\n")
  }
  return { ...repo, head: repo.git(["rev-parse", "HEAD"]).stdout.trim() }
}

/**
 * Every key here was read off a REAL `gh pr list --json` response before being written down, per
 * CLAUDE.md standard 8. `changedFiles` is an integer and was confirmed against
 * `gh pr view 690 --json changedFiles`, which reported 8 for a commit touching 8 files. It replaces
 * counting the `files` array, which the API truncates at 100 entries.
 */
const pullRequest = (headRefOid, additions = 10, deletions = 5, number = 200, changedFiles = 3) => ({
  number,
  url: `https://github.com/useorbitai/orbit-ui-mobile/pull/${number}`,
  headRefOid,
  additions,
  deletions,
  changedFiles,
  title: `${ISSUE} do the thing`,
  body: `Implements ${ISSUE}.`,
})

/**
 * A CheckRun reports `status` plus `conclusion` and a StatusContext reports `state` alone, so both
 * shapes appear here: a rollup fixture carrying only one kind would let a reader that ignores the
 * other pass. Confirmed against a live `gh pr view --json statusCheckRollup` response.
 */
const rollup = (nodes = [{ __typename: "CheckRun", name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T10:00:00Z" }]) =>
  JSON.stringify({ statusCheckRollup: nodes })

const ghPlan = (stdout, exit = 0, checks = rollup(), comparison = { behind_by: 0 }, requiredContexts = null, workflowRuns = []) => {
  let headRefOid = "fixture-head"
  try {
    headRefOid = JSON.parse(stdout)?.[0]?.headRefOid ?? headRefOid
  } catch {
    /* the malformed-output tests fail before this state is read */
  }
  let state = {}
  try {
    state = JSON.parse(checks)
  } catch {
    state = {}
  }
  const required = requiredContexts ?? (state.statusCheckRollup ?? []).map((node) => node.name ?? node.context).filter(Boolean)
  return orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: `pr list --head ${BRANCH}`, stdout, exit },
    { match: "pr view", stdout: JSON.stringify({ baseRefName: "main", baseRefOid: "base-sha", headRefOid, isDraft: false, ...state }) },
    { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: required }) },
    { match: "run list --workflow guards.yml", stdout: JSON.stringify(workflowRuns) },
    { match: "api repos/", stdout: JSON.stringify(comparison) },
  ])
}

const verdictOf = (fixture, stdout, expected, status, name) =>
  check(TOOL, name, ["--issue", "ORB-200", "--worktree", fixture.path, "--branch", BRANCH, "--repo", "ui"], { status, stdout: new RegExp(`"verdict": "${expected}"`) }, { path: testedToolPath, env: ghPlan(stdout) })

export const cases = () => {
  check(TOOL, "refuses a missing issue", ["--worktree", ".", "--branch", BRANCH], { status: 2, stderr: /--issue requires ORB-N, #N, or N/ })
  check(TOOL, "refuses a malformed issue", ["--issue", "orbit200", "--worktree", ".", "--branch", BRANCH, "--repo", "ui"], { status: 2, stderr: /ticket assertion failed: Ticket reference must be/ })
  check(TOOL, "refuses a missing branch", ["--issue", "ORB-200", "--worktree", "."], { status: 2, stderr: /--branch requires a branch name/ })
  check(TOOL, "refuses a missing repository", ["--issue", "ORB-200", "--worktree", ".", "--branch", BRANCH], { status: 2, stderr: /--repo requires a repository key/ })
  check(TOOL, "refuses an unknown option before doing any work", ["--issue", "ORB-200", "--worktree", ".", "--branch", BRANCH, "--force"], { status: 2, stderr: /unknown option\(s\): --force/ })
  check(TOOL, "refuses a worktree that is a file rather than a directory", ["--issue", "ORB-200", "--worktree", stage("verify-delivery/not-a-directory", "x"), "--branch", BRANCH, "--repo", "ui"], { status: 2, stderr: /--worktree does not name a directory/ })

  const nothing = stageDelivery("no-commit", { commit: false })
  if (!nothing) {
    T(`${TOOL}: real git fixtures are available`, false, "could not stage a git repository with a bare origin")
    return
  }
  const githubContext = stageRepo("verify-delivery-github-context")
  if (!githubContext || githubContext.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"]).status !== 0) {
    T(`${TOOL}: a repository-qualified GitHub context fixture is available`, false, "could not stage GitHub context")
    return
  }
  const hermeticConfig = realOrchestratorConfig()
  hermeticConfig.repos = { ...hermeticConfig.repos, ui: githubContext.path }
  const hermeticStaged = stageWithConfig("verify-delivery-hermetic", TOOL, hermeticConfig)
  testedToolPath = hermeticStaged.path
  stage(
    "staged/verify-delivery-hermetic/tools/lib/github-issues.mjs",
    `export const resolveTicket = (reference) => {
  const value = String(reference).toUpperCase()
  if (value === "ORB-200") return { identifier: "ORB-200", number: 200 }
  if (value === "#9001" || value === "9001") return { identifier: null, number: 9001 }
  throw new Error("Unknown migrated ticket " + reference)
}
export const readTicket = async (number) => ({ identifier: number === 200 ? "ORB-200" : null, number, labels: [{ name: "repo:ui" }] })
export const assertRepositoryLabel = (ticket, repoKey) => {
  if (ticket.labels.length !== 1 || ticket.labels[0].name !== "repo:" + repoKey) throw new Error("ticket repository label mismatch")
  return ticket
}
`,
  )

  /**
   * THE case. A worker that exits 0 having committed nothing must be caught here and nowhere else:
   * its branch exists on the remote, its tree is clean, and every self-report says success.
   */
  const noCommit = verdictOf(nothing, JSON.stringify([pullRequest(nothing.head)]), "NO_COMMIT", 1, "a worker that exited 0 having committed nothing is NO_COMMIT")
  T(
    `${TOOL}: NO_COMMIT reports the commit count it actually counted`,
    /"hasCommits": \{\s*"pass": false,\s*"observed": 0/.test(noCommit.stdout),
    noCommit.stdout || noCommit.stderr,
  )

  /**
   * The ORB-39 pair, and the reason DIRTY_TREE exists. Both worktrees are dirty; one carries the
   * finished ticket as a commit and one carries nothing. They had the SAME verdict and the same
   * one-key report, so a morning summary could not tell 221 lines of correct work from a worker that
   * did nothing, and the recoveries have nothing in common: discard the residue and push, against
   * re-run the whole ticket.
   */
  const dirtyNoCommit = stageDelivery("dirty-no-commit", { commit: false, dirty: ["src/half-done.ts"] })
  verdictOf(dirtyNoCommit, JSON.stringify([pullRequest(dirtyNoCommit.head)]), "NO_COMMIT", 1, "no commits and a dirty tree is NO_COMMIT, which now means exactly that")

  const residue = stageDelivery("dirty-residue", { dirty: ["apps/web/next-env.d.ts", "apps/web/e2e/visual/orb-39-evidence.visual.ts"] })
  const residueResult = verdictOf(residue, JSON.stringify([pullRequest(residue.head)]), "DIRTY_TREE", 1, "commits plus a dirty tree is DIRTY_TREE, never NO_COMMIT")
  T(
    `${TOOL}: DIRTY_TREE still evaluates hasCommits, so the report says the work exists`,
    /"hasCommits": \{\s*"pass": true,\s*"observed": 1/.test(residueResult.stdout) && /the ticket's real work/.test(residueResult.stdout),
    residueResult.stdout || residueResult.stderr,
  )
  T(
    `${TOOL}: DIRTY_TREE carries the head commit's stat, so nobody has to open the worktree`,
    /"headStat": "[^"]*worked\.txt[^"]*1 \+/.test(residueResult.stdout),
    residueResult.stdout,
  )
  T(
    `${TOOL}: generated and evidence residue is classified as discardable`,
    /"allDiscardable": true/.test(residueResult.stdout) && /next-env\.d\.ts/.test(residueResult.stdout) && /"source": \[\]/.test(residueResult.stdout),
    residueResult.stdout,
  )

  const orcaResidue = stageDelivery("dirty-orca-residue", { dirty: [".orca/web-port"] })
  const orcaResidueResult = verdictOf(orcaResidue, JSON.stringify([pullRequest(orcaResidue.head)]), "DIRTY_TREE", 1, "untracked .orca runtime residue is DIRTY_TREE but discardable")
  T(`${TOOL}: untracked .orca residue is discardable`, /"allDiscardable": true/.test(orcaResidueResult.stdout) && /\.orca\/web-port/.test(orcaResidueResult.stdout), orcaResidueResult.stdout)

  const trackedOrca = stageRepo("verify-delivery-tracked-orca")
  if (trackedOrca && trackedOrca.git(["switch", "-q", "-c", BRANCH]).status === 0) {
    mkdirSync(join(trackedOrca.path, ".orca"), { recursive: true })
    writeFileSync(join(trackedOrca.path, ".orca", "source.json"), "committed source\n")
    trackedOrca.git(["add", ".orca/source.json"])
    trackedOrca.git(["commit", "-q", "-m", "the ticket's real work"])
    trackedOrca.git(["push", "-q", "-u", "origin", BRANCH])
    writeFileSync(join(trackedOrca.path, ".orca", "source.json"), "unfinished source edit\n")
    const head = trackedOrca.git(["rev-parse", "HEAD"]).stdout.trim()
    const trackedOrcaResult = verdictOf({ ...trackedOrca, head }, JSON.stringify([pullRequest(head)]), "DIRTY_TREE", 1, "tracked .orca source is protected")
    T(
      `${TOOL}: tracked .orca is source and never discardable runtime residue`,
      /"allDiscardable": false/.test(trackedOrcaResult.stdout) && /"source": \[\s*"\.orca\/source\.json"/.test(trackedOrcaResult.stdout),
      trackedOrcaResult.stdout,
    )
  } else {
    T(`${TOOL}: the tracked .orca fixture staged`, false, "could not stage a repository carrying tracked .orca source")
  }

  /**
   * The repository has a TRACKED e2e suite, so `e2e/` cannot be discardable by path alone: a modified
   * or deleted file there is somebody's real edit, and step 7 permits the run to throw residue away.
   * Only an UNTRACKED file under e2e/ is a worker's invented evidence. The fixture commits the suite
   * first, so the dirty entry is a tracked modification rather than a new file.
   */
  const trackedSuite = stageRepo("verify-delivery-tracked-e2e")
  if (trackedSuite && trackedSuite.git(["switch", "-q", "-c", BRANCH]).status === 0) {
    mkdirSync(join(trackedSuite.path, "apps", "web", "e2e"), { recursive: true })
    writeFileSync(join(trackedSuite.path, "apps", "web", "e2e", "login.spec.ts"), "the real suite\n")
    trackedSuite.git(["add", "-A"])
    trackedSuite.git(["commit", "-q", "-m", "the ticket's real work"])
    trackedSuite.git(["push", "-q", "-u", "origin", BRANCH])
    writeFileSync(join(trackedSuite.path, "apps", "web", "e2e", "login.spec.ts"), "half an edit\n")
    const head = trackedSuite.git(["rev-parse", "HEAD"]).stdout.trim()
    const trackedResult = verdictOf({ ...trackedSuite, head }, JSON.stringify([pullRequest(head)]), "DIRTY_TREE", 1, "a MODIFIED tracked e2e file is DIRTY_TREE like any other source edit")
    T(
      `${TOOL}: a tracked e2e edit is source, never discardable evidence`,
      /"allDiscardable": false/.test(trackedResult.stdout) && /"source": \[\s*"apps\/web\/e2e\/login\.spec\.ts"/.test(trackedResult.stdout) && /"discardable": \[\]/.test(trackedResult.stdout),
      trackedResult.stdout || trackedResult.stderr,
    )
    /** The path is reported WHOLE. A trim over the blob ate the first line's leading status space,
     * so ` M apps/...` lost its "a" and every tracked-modification path was reported one character
     * short. Nothing caught it while every fixture happened to start with an untracked `??` line. */
    T(
      `${TOOL}: a tracked modification's path survives parsing intact`,
      !/"[a-z]?pps\/web/.test(trackedResult.stdout) || /"apps\/web\/e2e\/login\.spec\.ts"/.test(trackedResult.stdout),
      trackedResult.stdout,
    )
  } else {
    T(`${TOOL}: the tracked e2e fixture staged`, false, "could not stage a repository carrying a committed e2e suite")
  }

  const midEdit = stageDelivery("dirty-source", { dirty: ["apps/web/src/store.ts"] })
  const midEditResult = verdictOf(midEdit, JSON.stringify([pullRequest(midEdit.head)]), "DIRTY_TREE", 1, "a tracked source file left mid-edit is DIRTY_TREE too, but not discardable")
  T(
    `${TOOL}: source residue is never reported as safe to discard`,
    /"allDiscardable": false/.test(midEditResult.stdout) && /"source": \[\s*"apps\/web\/src\/store\.ts"/.test(midEditResult.stdout),
    midEditResult.stdout,
  )

  const unpushed = stageDelivery("unpushed", { push: false })
  verdictOf(unpushed, JSON.stringify([pullRequest(unpushed.head)]), "UNPUSHED", 1, "a commit that never reached origin is UNPUSHED")

  const pushed = stageDelivery("pushed")
  const ghDescendantPidFile = stage("verify-delivery/gh-descendant.pid", "")
  const hangingGh = run(
    TOOL,
    ["--issue", ISSUE, "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui", "--command-timeout-seconds", "1"],
    { path: testedToolPath, env: orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: `pr list --head ${BRANCH}`, stdout: "", hangTreePidFile: ghDescendantPidFile },
    ]) },
  )
  const ghDescendantPid = Number(readFileSync(ghDescendantPidFile, "utf8"))
  T(`${TOOL}: a hanging GitHub child is bounded with an explicit timeout`, hangingGh.status === 2 && /timed out after 1s/.test(hangingGh.stderr), hangingGh.stderr || hangingGh.stdout)
  T(`${TOOL}: a timed-out GitHub child leaves no descendant process`, Number.isInteger(ghDescendantPid) && !processIsRunning(ghDescendantPid), `descendant ${ghDescendantPid} still alive`)
  verdictOf(pushed, "[]", "NO_PR", 1, "a pushed branch with no pull request is NO_PR")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head), pullRequest(pushed.head, 1, 1, 201)]), "NO_PR", 1, "two pull requests on one branch is NO_PR rather than a silent pick")
  verdictOf(pushed, JSON.stringify([pullRequest("0000000000000000000000000000000000000000")]), "STALE_PR", 1, "a pull request head behind the local head is STALE_PR")
  const large = verdictOf(pushed, JSON.stringify([pullRequest(pushed.head, 500, 200, 200, 14)]), "DELIVERED", 0, "a 14-file 700-line valid pull request is DELIVERED without an override")
  T(`${TOOL}: size is retained as advisory output without altering the verdict`, /"sizeAdvisory": \{[\s\S]*"changedFiles": 14[\s\S]*"diffLines": 700[\s\S]*"blocking": false/.test(large.stdout), large.stdout)

  const outOfDate = check(
    TOOL,
    "base advancement with behind_by 1 is OUT_OF_DATE",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 1, stdout: /"verdict": "OUT_OF_DATE"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, rollup(), { behind_by: 1 }) },
  )
  T(`${TOOL}: OUT_OF_DATE reports base SHA, head SHA, and behind count`, /"baseSha": "base-sha"[\s\S]*"headSha": "[^"\s]+"[\s\S]*"behindBy": 1/.test(outOfDate.stdout), outOfDate.stdout)

  const delivered = check(
    TOOL,
    "a clean, pushed, single, current, in-cap pull request is DELIVERED and exits 0",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 0, stdout: /"verdict": "DELIVERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)])) },
  )
  T(
    `${TOOL}: DELIVERED carries the pull request number and url every later step needs`,
    /"number": 200/.test(delivered.stdout) && /"url": "https:\/\/github\.com\/[^"]+\/pull\/200"/.test(delivered.stdout),
    delivered.stdout || delivered.stderr,
  )

  const numericPullRequest = { ...pullRequest(pushed.head), title: "#9001 do the thing", body: "Implements #9001." }
  check(
    TOOL,
    "a post-migration #N reference links and delivers without an invented ORB identifier",
    ["--issue", "#9001", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 0, stdout: /"issue": "#9001"[\s\S]*"verdict": "DELIVERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([numericPullRequest])) },
  )

  const marker = stage("verify-delivery/degraded-edit-not-called", "pending")
  const codexBody = pullRequest(pushed.head)
  codexBody.body = `Implements ${ISSUE}.`
  const codexOnly = check(
    TOOL,
    "codex-only delivery restores the degraded first line and invalidates pre-edit CI",
    ["--issue", ISSUE, "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui", "--codex-only"],
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"invalidatedByBodyEdit": true/ },
    { path: testedToolPath, env: orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: `pr list --head ${BRANCH}`, stdout: JSON.stringify([codexBody]) },
      { match: "pr edit 200 --body-file -", stdout: "", removePath: marker },
      { match: "pr view", stdout: JSON.stringify({ baseRefName: "main", baseRefOid: "base-sha", headRefOid: pushed.head, isDraft: false, statusCheckRollup: [{ __typename: "CheckRun", name: "Lint", workflowName: "Guards", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T10:00:00Z" }] }) },
      { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Lint"] }) },
      { match: "run list --workflow guards.yml", stdout: JSON.stringify([{ databaseId: 10, createdAt: "2026-08-06T09:00:00Z", headSha: pushed.head, status: "completed", conclusion: "success" }]) },
      { match: "api repos/", stdout: JSON.stringify({ behind_by: 0 }) },
    ]) },
  )
  T(`${TOOL}: degraded body enforcement invoked the PR edit before delivery`, !existsSync(marker), codexOnly.stdout || codexOnly.stderr)
  const markedBody = { ...codexBody, body: `DEGRADED: same-vendor review\n\nImplements ${ISSUE}.\n` }
  check(
    TOOL,
    "the next codex-only invocation cannot reuse pre-edit checks before replacements register",
    ["--issue", ISSUE, "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui", "--codex-only", "--wait-ci", "1"],
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"post-edit Guards workflow"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([markedBody]), 0, rollup([{ __typename: "CheckRun", name: "Lint", workflowName: "Guards", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T10:00:00Z" }]), { behind_by: 0 }, null, [{ databaseId: 10, createdAt: "2026-08-06T09:00:00Z", headSha: pushed.head, status: "completed", conclusion: "success" }]) },
  )
  check(
    TOOL,
    "a later codex-only invocation settles after the replacement Guards checks register",
    ["--issue", ISSUE, "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui", "--codex-only"],
    { status: 0, stdout: /"verdict": "DELIVERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([markedBody]), 0, rollup([{ __typename: "CheckRun", name: "Lint", workflowName: "Guards", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2099-08-08T10:00:00Z" }]), { behind_by: 0 }, null, [
      { databaseId: 10, createdAt: "2026-08-06T09:00:00Z", headSha: pushed.head, status: "completed", conclusion: "success" },
      { databaseId: 11, createdAt: "2099-08-08T09:00:00Z", headSha: pushed.head, status: "completed", conclusion: "success" },
    ]) },
  )

  /**
   * A pull request that cannot merge was never delivered. Every case below passes every OTHER check,
   * so only the CI verdict can be what moves it, which is what makes these assertions able to fail.
   */
  const withChecks = (nodes) => ({ path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, rollup(nodes)) })
  const ciArgv = ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"]

  const failedCi = check(TOOL, "a red required check is CI_FAILING, never DELIVERED", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([{ __typename: "CheckRun", name: "React Doctor", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-08-06T10:00:00Z", detailsUrl: "https://github.com/useorbitai/orbit-ui-mobile/actions/runs/12345/job/67890", workflowName: "React Doctor" }]))
  T(`${TOOL}: failed CI retains exact inspectable run metadata`, /"runId": "12345"[\s\S]*"jobId": "67890"[\s\S]*"detailsUrl": "https:\/\/github\.com\/[^"\s]+"[\s\S]*"workflow": "React Doctor"[\s\S]*"name": "React Doctor"[\s\S]*"status": "COMPLETED"[\s\S]*"conclusion": "FAILURE"/.test(failedCi.stdout), failedCi.stdout)

  check(TOOL, "a still-running check is CI_PENDING, so nothing is called delivered mid-flight", ciArgv, { status: 1, stdout: /"verdict": "CI_PENDING"/ }, withChecks([{ __typename: "CheckRun", name: "Build", status: "IN_PROGRESS", conclusion: "", startedAt: "2026-08-06T10:00:00Z" }]))
  check(
    TOOL,
    "an empty rollup is CI_PENDING until required checks register",
    ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"name": "Lint"[\s\S]*"status": "NOT_REGISTERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, rollup([]), { behind_by: 0 }, ["Lint"]) },
  )
  check(
    TOOL,
    "a partial rollup is CI_PENDING until every required check registers",
    ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"name": "Unit Tests"[\s\S]*"status": "NOT_REGISTERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, rollup([{ __typename: "CheckRun", name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T10:00:00Z" }]), { behind_by: 0 }, ["Lint", "Unit Tests"]) },
  )

  const stateSequenceFile = stage("verify-delivery/pr-view-sequence.txt", "0")
  const pendingState = { baseRefName: "main", baseRefOid: "base-sha", headRefOid: pushed.head, isDraft: false, statusCheckRollup: [{ __typename: "CheckRun", name: "Build", status: "IN_PROGRESS", conclusion: "", startedAt: "2026-08-06T10:00:00Z" }] }
  const advancedState = { ...pendingState, headRefOid: "0000000000000000000000000000000000000000", statusCheckRollup: [{ __typename: "CheckRun", name: "Build", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T10:00:00Z" }] }
  const advancedDuringPoll = check(
    TOOL,
    "a branch advance during CI polling is revalidated before delivery",
    [...ciArgv, "--wait-ci", "1"],
    { status: 1, stdout: /"verdict": "STALE_PR"[\s\S]*"headSha": "0000000000000000000000000000000000000000"/ },
    { path: testedToolPath, env: orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: `pr list --head ${BRANCH}`, stdout: JSON.stringify([pullRequest(pushed.head)]) },
      { match: "pr view", stdout: JSON.stringify(pendingState), stdoutSequence: [JSON.stringify(pendingState), JSON.stringify(advancedState)], sequenceFile: stateSequenceFile },
      { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Build"] }) },
      { match: "api repos/", stdout: JSON.stringify({ behind_by: 0 }) },
    ]) },
  )
  T(`${TOOL}: the poll persisted the refreshed PR identity`, /"pullRequestState": \{[\s\S]*"headSha": "0000000000000000000000000000000000000000"/.test(advancedDuringPoll.stdout), advancedDuringPoll.stdout)

  check(TOOL, "a StatusContext failure counts too, despite carrying state instead of conclusion", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([{ __typename: "StatusContext", context: "Vercel", state: "FAILURE" }]))

  check(TOOL, "SKIPPED and NEUTRAL are not failures", ciArgv, { status: 0, stdout: /"verdict": "DELIVERED"/ }, withChecks([
    { __typename: "CheckRun", name: "auto-merge", status: "COMPLETED", conclusion: "SKIPPED", startedAt: "2026-08-06T10:00:00Z" },
    { __typename: "CheckRun", name: "Advisory", status: "COMPLETED", conclusion: "NEUTRAL", startedAt: "2026-08-06T10:00:00Z" },
  ]))
  check(TOOL, "GitHub's completed STALE conclusion fails closed", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([
    { __typename: "CheckRun", name: "Required gate", status: "COMPLETED", conclusion: "STALE", startedAt: "2026-08-06T10:00:00Z" },
  ]))
  check(TOOL, "an unknown completed conclusion fails closed", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([
    { __typename: "CheckRun", name: "Future gate", status: "COMPLETED", conclusion: "A_FUTURE_VALUE", startedAt: "2026-08-06T10:00:00Z" },
  ]))

  /**
   * The trap this exists for: a re-run does NOT replace the old entry, so the rollup carries the old
   * FAILURE and the new SUCCESS under ONE name. Reading every entry leaves the check permanently red
   * and permanently pending at once, and no re-run could ever clear it. Measured on #685.
   */
  check(TOOL, "a re-run supersedes its own failed entry rather than counting twice", ciArgv, { status: 0, stdout: /"verdict": "DELIVERED"/ }, withChecks([
    { __typename: "CheckRun", name: "Dash Ban", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-08-06T10:00:00Z" },
    { __typename: "CheckRun", name: "Dash Ban", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T11:00:00Z" },
  ]))

  check(TOOL, "CI_FAILING names the checks, so the report never says merely that something is red", ciArgv, { status: 1, stdout: /"failing": \[[\s\S]*"name": "CodeQL"/ }, withChecks([{ __typename: "CheckRun", name: "CodeQL", status: "COMPLETED", conclusion: "TIMED_OUT", startedAt: "2026-08-06T10:00:00Z" }]))
  T(
    `${TOOL}: stdout carries ONE JSON object and nothing else`,
    (() => {
      try {
        return JSON.parse(delivered.stdout).verdict === "DELIVERED"
      } catch {
        return false
      }
    })(),
    delivered.stdout,
  )

  const argv = ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"]
  check(TOOL, "a failing gh is an environment error, never a verdict", ciArgv, { status: 2, stderr: /gh pr list --head .* failed/ }, { path: testedToolPath, env: ghPlan("", 1) })
  check(TOOL, "unparseable gh output is an environment error", ciArgv, { status: 2, stderr: /returned unparseable JSON/ }, { path: testedToolPath, env: ghPlan("not json at all") })
  check(TOOL, "a non-array gh payload is an environment error", ciArgv, { status: 2, stderr: /did not return an array/ }, { path: testedToolPath, env: ghPlan(JSON.stringify({ number: 200 })) })
  check(
    TOOL,
    "a pull request with no numeric diff size is an environment error, not fabricated advisory data",
    argv,
    { status: 2, stderr: /reported no numeric additions and deletions/ },
    // title is present so the run reaches the size check: linksTicket is asserted earlier in the
    // ladder, and a payload missing it would short-circuit to UNLINKED_PR and never test this.
    { path: testedToolPath, env: ghPlan(JSON.stringify([{ number: 200, url: "https://example.test/pull/200", headRefOid: pushed.head, title: `${ISSUE} x` }])) },
  )
  check(
    TOOL,
    "a pull request with no numeric changedFiles is an environment error, not fabricated advisory data",
    argv,
    { status: 2, stderr: /reported no numeric changedFiles/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([{ number: 200, url: "https://example.test/pull/200", headRefOid: pushed.head, title: `${ISSUE} x`, additions: 1, deletions: 1 }])) },
  )

  verdictOf(pushed, JSON.stringify([{ ...pullRequest(pushed.head), title: "no ticket here", body: "none either" }]), "UNLINKED_PR", 1, "a pull request that never names the ticket is UNLINKED_PR")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head, 10, 5, 200, 355)]), "DELIVERED", 0, "a generated 355-file change remains deliverable")

  const real = realOrchestratorConfig()
  const staged = stageWithConfig("verify-delivery-repo", TOOL, { ...real, repos: { ui: pushed.path } })
  stage("staged/verify-delivery-repo/.claude/linear-to-github-map.json", JSON.stringify({ issues: { "ORB-200": { number: 200 } } }))
  const unknownRepoArgv = argv.slice()
  unknownRepoArgv[unknownRepoArgv.indexOf("ui")] = "ghost"
  const unknownRepo = run(TOOL, unknownRepoArgv, { path: staged.path, env: ghPlan("[]") })
  T(
    `${TOOL}: an unknown --repo key is refused naming the keys that are configured`,
    unknownRepo.status === 2 && /--repo must name a configured repository \(known: ui\)/.test(unknownRepo.stderr),
    `exit ${unknownRepo.status}: ${unknownRepo.stderr || unknownRepo.stdout}`,
  )
}
