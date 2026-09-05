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
 * The two app ids are live, read on 2026-08-12 from
 * `gh api repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks`,
 * which pins every workflow check to 15368 (github-actions) and `pullfrog-approval` to 1768019.
 */
const GITHUB_ACTIONS_APP = 15368
const PULLFROG_APP = 1768019

/**
 * A CheckRun reports `status` plus `conclusion` and carries its producing app under
 * `checkSuite.app.databaseId`; a StatusContext reports `state` alone and carries no app at all.
 * Both shapes appear here: a rollup fixture carrying only one kind would let a reader that ignores
 * the other pass. Every field NAME below was read off the live GraphQL response for pull request
 * 716 on 2026-08-12 before being written down, per CLAUDE.md standard 8.
 */
const checkRun = (name, { status = "COMPLETED", conclusion = "SUCCESS", startedAt = "2026-08-06T10:00:00Z", detailsUrl = null, workflow = null, appId = GITHUB_ACTIONS_APP } = {}) => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
  startedAt,
  completedAt: startedAt,
  detailsUrl,
  checkSuite: { app: { databaseId: appId }, workflowRun: workflow === null ? null : { workflow: { name: workflow } } },
})
const statusContext = (context, state, createdAt = "2026-08-06T10:00:00Z") => ({ __typename: "StatusContext", context, state, createdAt, targetUrl: null })

/**
 * Branch protection pins each required context to the app that must provide it, so the default
 * required list here is derived from the fixture's own producers. `checks` is what the tool reads;
 * `contexts` is the same list with the producer erased and is present because GitHub returns both.
 */
const requiredFrom = (nodes) => nodes.map((node) => ({ context: node.name ?? node.context, app_id: node.checkSuite?.app?.databaseId ?? null }))

/** The envelope the confirmed GraphQL query returns, keyed exactly like the live #716 response. */
const prState = (nodes, headRefOid, isDraft = false) => ({
  data: { repository: { pullRequest: { number: 200, baseRefName: "main", baseRefOid: "base-sha", headRefOid, isDraft, statusCheckRollup: { contexts: { nodes } } } } },
})

const boardReadMarker = stage("verify-delivery/board-read", "must remain")

const ghPlan = (stdout, exit = 0, nodes = [checkRun("Lint")], comparison = { behind_by: 0 }, requiredChecks = null, { baseRefName = "main", protectionResponse, protectionExit = 0, states, sequenceFile } = {}) => {
  let headRefOid = "fixture-head"
  try {
    headRefOid = JSON.parse(stdout)?.[0]?.headRefOid ?? headRefOid
  } catch {
    /* the malformed-output tests fail before this state is read */
  }
  const required = requiredChecks ?? requiredFrom(nodes)
  const state = prState(nodes, headRefOid)
  state.data.repository.pullRequest.baseRefName = baseRefName
  return orcaEnv([
    /**
     * Only the repository label is asserted from the ticket, so a whole-board read here is pure
     * GraphQL cost on the path the orchestrator runs two or three times per ticket. The marker
     * survives exactly while no board read happens.
     */
    { match: "project item-list 2 --owner thomasluizon", stdout: JSON.stringify({ items: [], totalCount: 0 }), removePath: boardReadMarker },
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: `pr list --head ${BRANCH}`, stdout, exit },
    { match: "api graphql", stdout: JSON.stringify(state), stdoutSequence: states?.map((entry) => JSON.stringify(entry)), sequenceFile },
    { match: `branches/${encodeURIComponent(baseRefName)}/protection/required_status_checks`, stdout: protectionResponse ?? JSON.stringify({ contexts: required.map((entry) => entry.context), checks: required }), exit: protectionExit },
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
    `import { rmSync } from "node:fs"

export const resolveTicket = (reference) => {
  const value = String(reference).toUpperCase()
  if (value === "ORB-200") return { identifier: "ORB-200", number: 200 }
  if (value === "#9001" || value === "9001") return { identifier: null, number: 9001 }
  throw new Error("Unknown migrated ticket " + reference)
}
/**
 * The stub OBSERVES the hydration flag rather than ignoring it. A stub that dropped the options
 * argument made the marker below unfailable: the board read could be restored in production and the
 * gate stayed green, which is the defect this coverage exists to prevent.
 */
export const readTicket = async (number, options) => {
  if (options?.withProjectItem !== false) rmSync(${JSON.stringify(boardReadMarker)}, { force: true })
  return { identifier: number === 200 ? "ORB-200" : null, number, labels: [{ name: "repo:ui" }] }
}
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

  const residue = stageDelivery("dirty-residue", { dirty: ["apps/web/next-env.d.ts", "apps/web/e2e/orb-39-evidence.spec.ts"] })
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
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint")], { behind_by: 1 }) },
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

  /**
   * Pullfrog publishes `pullfrog-approval`, which branch protection requires on `main` and pins to
   * Pullfrog's own app 1768019, so the review verdict reaches this tool as one more required check.
   * An approval the rollup does not carry is CI_PENDING, and a delivery that carries it under the
   * pinned app is DELIVERED like any other green check.
   */
  const requiredWithApproval = [{ context: "Lint", app_id: GITHUB_ACTIONS_APP }, { context: "pullfrog-approval", app_id: PULLFROG_APP }]
  const approval = checkRun("pullfrog-approval", { appId: PULLFROG_APP, startedAt: "2026-08-06T10:30:00Z" })
  check(
    TOOL,
    "a required pullfrog-approval that has not registered is CI_PENDING",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"name": "pullfrog-approval"[\s\S]*"status": "NOT_REGISTERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint")], { behind_by: 0 }, requiredWithApproval) },
  )
  check(
    TOOL,
    "a SUCCESS pullfrog-approval alongside the other required checks is DELIVERED",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 0, stdout: /"verdict": "DELIVERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint"), approval], { behind_by: 0 }, requiredWithApproval) },
  )

  /**
   * THE producer case. Branch protection pins `pullfrog-approval` to app 1768019, so a SUCCESS of
   * that exact name published by app 15368 satisfies nothing: GitHub still refuses the merge, and a
   * reader keyed on the context alone called this pull request DELIVERED.
   */
  const impostorApproval = check(
    TOOL,
    "a SUCCESS pullfrog-approval from the WRONG app is CI_PENDING, never DELIVERED",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 1, stdout: /"verdict": "CI_PENDING"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint"), checkRun("pullfrog-approval", { appId: GITHUB_ACTIONS_APP })], { behind_by: 0 }, requiredWithApproval) },
  )
  T(
    `${TOOL}: the wrong-producer report names the pinned app it never saw`,
    /"name": "pullfrog-approval"[\s\S]*"status": "NOT_REGISTERED"[\s\S]*"requiredAppId": 1768019/.test(impostorApproval.stdout),
    impostorApproval.stdout,
  )
  /** `app_id: null` is GitHub's "any app may provide this check", so the same rollup delivers. */
  check(
    TOOL,
    "a required check with a null app id is satisfied by any producer",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 0, stdout: /"verdict": "DELIVERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint"), checkRun("pullfrog-approval", { appId: GITHUB_ACTIONS_APP })], { behind_by: 0 }, [{ context: "Lint", app_id: GITHUB_ACTIONS_APP }, { context: "pullfrog-approval", app_id: null }]) },
  )
  /** A StatusContext carries no producing app, so it can never satisfy a check pinned to one. */
  check(
    TOOL,
    "a StatusContext cannot satisfy a required check pinned to an app",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"name": "pullfrog-approval"[\s\S]*"status": "NOT_REGISTERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint"), statusContext("pullfrog-approval", "SUCCESS")], { behind_by: 0 }, requiredWithApproval) },
  )
  /** `contexts` alone cannot decide, so a protection payload without `checks` fails closed. */
  check(
    TOOL,
    "a protection payload carrying no checks array is an environment error",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"],
    { status: 2, stderr: /returned no \{ context, app_id \} checks array/ },
    { path: testedToolPath, env: orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: `pr list --head ${BRANCH}`, stdout: JSON.stringify([pullRequest(pushed.head)]) },
      { match: "api graphql", stdout: JSON.stringify(prState([checkRun("Lint")], pushed.head)) },
      { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Lint"] }) },
      { match: "api repos/", stdout: JSON.stringify({ behind_by: 0 }) },
    ]) },
  )

  /**
   * A pull request that cannot merge was never delivered. Every case below passes every OTHER check,
   * so only the CI verdict can be what moves it, which is what makes these assertions able to fail.
   */
  const withChecks = (nodes) => ({ path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, nodes) })
  const ciArgv = ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH, "--repo", "ui"]

  /** Complete error body read live on 2026-09-05 from
   * gh api repos/thomasluizon/orbit-ui-mobile/branches/redesign%2Fmain/protection/required_status_checks.
   * HTTP 404, gh exits nonzero. The protected main response still uses the checks array above. */
  const unprotectedResponse = {
    message: "Branch not protected",
    documentation_url: "https://docs.github.com/rest/branches/branch-protection#get-status-checks-protection",
    status: "404",
  }
  /** Advance only the verifier's clock at its real polling sleep; no production timing bypass.
   * Git/GitHub fixtures and the complete CLI verdict/receipt path still execute on every poll. */
  const observationClock = stage("verify-delivery/observation-clock.cjs", `
if (process.argv[1]?.endsWith("verify-delivery.mjs")) {
  let now = 0
  Date.now = () => now
  Atomics.wait = (_buffer, _index, _value, milliseconds) => { now += milliseconds; return "timed-out" }
}
`)
  const onUnprotectedBase = (nodes, protectionResponse = JSON.stringify(unprotectedResponse), sequence = {}) => {
    const env = ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, nodes, { behind_by: 0 }, [], {
      baseRefName: "redesign/main", protectionResponse, protectionExit: 1, ...sequence,
    })
    env.NODE_OPTIONS += ` --require "${observationClock.replaceAll("\\", "/")}"`
    return { path: testedToolPath, env }
  }
  const observedCiArgv = [...ciArgv, "--wait-ci", "60"]
  check(TOOL, "an unprotected base delivers after observing unchanged successful CI", observedCiArgv,
    { status: 0, stdout: /"verdict": "DELIVERED"[\s\S]*"requiredChecks": \[\]/ }, onUnprotectedBase([checkRun("Lint"), statusContext("Vercel", "SUCCESS")]))
  check(TOOL, "an unprotected base with no checks is pending with an explicit reason", ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"pass": false[\s\S]*No checks reported; an empty required set is not evidence[\s\S]*"requiredChecks": \[\]/ }, onUnprotectedBase([]))
  check(TOOL, "an empty successful protection response also needs observed CI", ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*No checks reported/ }, withChecks([]))
  check(TOOL, "one fast successful check is pending with its registration reason in the receipt", ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*1 checks: 0 failing, 1 pending[\s\S]*"status": "OBSERVING"[\s\S]*unchanged for 0s; requires 60s/ }, onUnprotectedBase([checkRun("Lint")]))
  check(TOOL, "a fast successful check enters the wait loop despite having no running checks", [...ciArgv, "--wait-ci", "30"],
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*unchanged for 30s; requires 60s/ }, onUnprotectedBase([checkRun("Lint")]))
  check(TOOL, "an empty rollup remains pending even after the observation window", observedCiArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*No checks reported/ }, onUnprotectedBase([]))

  /** Same 25-check cardinality and mixed CheckRun/StatusContext shape as the live #821 proof in
   * PR #822; synthetic names and timings exercise registration without depending on live CI. */
  const completeRollup = [...Array.from({ length: 24 }, (_, index) => checkRun(`Gate ${index + 1}`)), statusContext("Vercel", "SUCCESS")]
  check(TOOL, "a complete 25-check unprotected rollup delivers after the observation window", observedCiArgv,
    { status: 0, stdout: /"verdict": "DELIVERED"[\s\S]*25 checks: 0 failing, 0 pending[\s\S]*"requiredChecks": \[\]/ }, onUnprotectedBase(completeRollup))
  const sequenceOptions = (label, rollups) => {
    const sequenceFile = stage(`verify-delivery/${label}-sequence.txt`, "0")
    const states = rollups.map((nodes) => {
      const state = prState(nodes, pushed.head)
      state.data.repository.pullRequest.baseRefName = "redesign/main"
      return state
    })
    return { sequenceFile, states }
  }
  const registrationRace = [[completeRollup[0]], completeRollup]
  const shortRace = sequenceOptions("short-registration", registrationRace)
  check(TOOL, "one-to-25 registration resets the window and cannot deliver at the original deadline", observedCiArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*25 checks: 0 failing, 1 pending[\s\S]*unchanged for 30s; requires 60s/ },
    onUnprotectedBase(registrationRace[0], undefined, shortRace))
  T(`${TOOL}: the partial rollup forced two additional GitHub observations`, readFileSync(shortRace.sequenceFile, "utf8") === "3")
  check(TOOL, "one-to-25 registration eventually delivers once the complete rollup stabilizes", [...ciArgv, "--wait-ci", "90"],
    { status: 0, stdout: /"verdict": "DELIVERED"[\s\S]*25 checks: 0 failing, 0 pending/ },
    onUnprotectedBase(registrationRace[0], undefined, sequenceOptions("settled-registration", registrationRace)))
  check(TOOL, "rollup ordering alone does not restart observation", observedCiArgv,
    { status: 0, stdout: /"verdict": "DELIVERED"/ },
    onUnprotectedBase(completeRollup, undefined, sequenceOptions("reordered", [completeRollup, [...completeRollup].reverse(), completeRollup])))
  for (const [label, changed] of [
    ["same-count replacement", [checkRun("Replacement")]],
    ["new rerun", [checkRun("Lint", { startedAt: "2026-08-06T11:00:00Z" })]],
    ["new producer", [checkRun("Lint", { appId: PULLFROG_APP })]],
    ["status completion", [checkRun("Lint")]],
  ]) {
    const first = [checkRun("Lint", label === "status completion" ? { status: "IN_PROGRESS", conclusion: null } : {})]
    check(TOOL, `${label} restarts the observation window`, observedCiArgv,
      { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*unchanged for 30s; requires 60s/ },
      onUnprotectedBase(first, undefined, sequenceOptions(label, [first, changed])))
  }
  const movedBase = sequenceOptions("moved-base", [completeRollup, completeRollup])
  movedBase.states[1].data.repository.pullRequest.baseRefOid = "new-base-sha"
  check(TOOL, "a base change restarts the observation window even if the rollup is unchanged", observedCiArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*unchanged for 30s; requires 60s/ },
    onUnprotectedBase(completeRollup, undefined, movedBase))
  check(TOOL, "a non-required failure on an unprotected base still blocks delivery", ciArgv,
    { status: 1, stdout: /"verdict": "CI_FAILING"/ }, onUnprotectedBase([checkRun("Lint"), checkRun("Build", { conclusion: "FAILURE" })]))
  check(TOOL, "a non-required pending check on an unprotected base still blocks delivery", ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"/ }, onUnprotectedBase([checkRun("Lint"), checkRun("Build", { status: "IN_PROGRESS", conclusion: null })]))
  check(TOOL, "a failed status context on an unprotected base still blocks delivery", ciArgv,
    { status: 1, stdout: /"verdict": "CI_FAILING"/ }, onUnprotectedBase([statusContext("Vercel", "FAILURE")]))
  check(TOOL, "an unprotected base retains the shared skipped and neutral conclusions", observedCiArgv,
    { status: 0, stdout: /"verdict": "DELIVERED"/ }, onUnprotectedBase([checkRun("Optional", { conclusion: "SKIPPED" }), checkRun("Advisory", { conclusion: "NEUTRAL" })]))
  check(TOOL, "an unprotected base retains newest-rerun-wins", observedCiArgv,
    { status: 0, stdout: /"verdict": "DELIVERED"/ }, onUnprotectedBase([checkRun("Lint", { conclusion: "FAILURE" }), checkRun("Lint", { startedAt: "2026-08-06T11:00:00Z" })]))
  check(TOOL, "the unprotected response is recognized by status rather than message prose", observedCiArgv,
    { status: 0, stdout: /"verdict": "DELIVERED"/ }, onUnprotectedBase([checkRun("Lint")], JSON.stringify({ ...unprotectedResponse, message: "Changed wording" })))
  for (const [label, response] of [
    ["another error status", JSON.stringify({ ...unprotectedResponse, status: "503" })],
    ["an error without a status", JSON.stringify({ message: "Branch not protected" })],
    ["a malformed error body", "not json"],
    ["an empty error body", ""],
  ]) {
    check(TOOL, `${label} remains an environment error`, ciArgv,
      { status: 2, stderr: /gh api required status checks failed/ }, onUnprotectedBase([checkRun("Lint")], response))
  }

  const failedCi = check(TOOL, "a red required check is CI_FAILING, never DELIVERED", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([checkRun("React Doctor", { conclusion: "FAILURE", detailsUrl: "https://github.com/useorbitai/orbit-ui-mobile/actions/runs/12345/job/67890", workflow: "React Doctor" })]))
  T(`${TOOL}: failed CI retains exact inspectable run metadata`, /"runId": "12345"[\s\S]*"jobId": "67890"[\s\S]*"detailsUrl": "https:\/\/github\.com\/[^"\s]+"[\s\S]*"workflow": "React Doctor"[\s\S]*"name": "React Doctor"[\s\S]*"status": "COMPLETED"[\s\S]*"conclusion": "FAILURE"[\s\S]*"appId": 15368/.test(failedCi.stdout), failedCi.stdout)

  check(TOOL, "a still-running check is CI_PENDING, so nothing is called delivered mid-flight", ciArgv, { status: 1, stdout: /"verdict": "CI_PENDING"/ }, withChecks([checkRun("Build", { status: "IN_PROGRESS", conclusion: null })]))
  check(
    TOOL,
    "an empty rollup is CI_PENDING until required checks register",
    ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"name": "Lint"[\s\S]*"status": "NOT_REGISTERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [], { behind_by: 0 }, [{ context: "Lint", app_id: GITHUB_ACTIONS_APP }]) },
  )
  check(
    TOOL,
    "a partial rollup is CI_PENDING until every required check registers",
    ciArgv,
    { status: 1, stdout: /"verdict": "CI_PENDING"[\s\S]*"name": "Unit Tests"[\s\S]*"status": "NOT_REGISTERED"/ },
    { path: testedToolPath, env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, [checkRun("Lint")], { behind_by: 0 }, [{ context: "Lint", app_id: GITHUB_ACTIONS_APP }, { context: "Unit Tests", app_id: GITHUB_ACTIONS_APP }]) },
  )

  const stateSequenceFile = stage("verify-delivery/pr-state-sequence.txt", "0")
  const pendingState = prState([checkRun("Build", { status: "IN_PROGRESS", conclusion: null })], pushed.head)
  const advancedState = prState([checkRun("Build")], "0000000000000000000000000000000000000000")
  const advancedDuringPoll = check(
    TOOL,
    "a branch advance during CI polling is revalidated before delivery",
    [...ciArgv, "--wait-ci", "1"],
    { status: 1, stdout: /"verdict": "STALE_PR"[\s\S]*"headSha": "0000000000000000000000000000000000000000"/ },
    { path: testedToolPath, env: orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: `pr list --head ${BRANCH}`, stdout: JSON.stringify([pullRequest(pushed.head)]) },
      { match: "api graphql", stdout: JSON.stringify(pendingState), stdoutSequence: [JSON.stringify(pendingState), JSON.stringify(advancedState)], sequenceFile: stateSequenceFile },
      { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Build"], checks: [{ context: "Build", app_id: GITHUB_ACTIONS_APP }] }) },
      { match: "api repos/", stdout: JSON.stringify({ behind_by: 0 }) },
    ]) },
  )
  T(`${TOOL}: the poll persisted the refreshed PR identity`, /"pullRequestState": \{[\s\S]*"headSha": "0000000000000000000000000000000000000000"/.test(advancedDuringPoll.stdout), advancedDuringPoll.stdout)

  check(TOOL, "a StatusContext failure counts too, despite carrying state instead of conclusion", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([statusContext("Vercel", "FAILURE")]))

  check(TOOL, "SKIPPED and NEUTRAL are not failures", ciArgv, { status: 0, stdout: /"verdict": "DELIVERED"/ }, withChecks([
    checkRun("auto-merge", { conclusion: "SKIPPED" }),
    checkRun("Advisory", { conclusion: "NEUTRAL" }),
  ]))
  check(TOOL, "GitHub's completed STALE conclusion fails closed", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([checkRun("Required gate", { conclusion: "STALE" })]))
  check(TOOL, "an unknown completed conclusion fails closed", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([checkRun("Future gate", { conclusion: "A_FUTURE_VALUE" })]))

  /**
   * The trap this exists for: a re-run does NOT replace the old entry, so the rollup carries the old
   * FAILURE and the new SUCCESS under ONE name and ONE producer. Reading every entry leaves the
   * check permanently red and permanently pending at once, and no re-run could ever clear it.
   * Measured on #685.
   */
  check(TOOL, "a re-run supersedes its own failed entry rather than counting twice", ciArgv, { status: 0, stdout: /"verdict": "DELIVERED"/ }, withChecks([
    checkRun("Dash Ban", { conclusion: "FAILURE" }),
    checkRun("Dash Ban", { startedAt: "2026-08-06T11:00:00Z" }),
  ]))
  /**
   * A re-run supersedes ITS OWN entry and no other. A same-named check from a different app is a
   * different producer, so it cannot bury the failing entry branch protection actually requires.
   */
  check(TOOL, "a later same-named check from another app cannot bury a failing required check", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"[\s\S]*"name": "Dash Ban"/ }, withChecks([
    checkRun("Dash Ban", { conclusion: "FAILURE" }),
    checkRun("Dash Ban", { startedAt: "2026-08-06T11:00:00Z", appId: PULLFROG_APP }),
  ]))

  check(TOOL, "CI_FAILING names the checks, so the report never says merely that something is red", ciArgv, { status: 1, stdout: /"failing": \[[\s\S]*"name": "CodeQL"/ }, withChecks([checkRun("CodeQL", { conclusion: "TIMED_OUT" })]))
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

  T(`${TOOL}: verifying delivery reads no Projects board item`, existsSync(boardReadMarker))
}
