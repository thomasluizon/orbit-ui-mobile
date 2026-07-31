import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, orcaEnv, check, stageWorkerPidMarker, exitedProbePid } from "./_harness.mjs"

/** A linked child checkout is the smallest real Git fixture that can prove teardown verification. */
const stageTeardownWorktree = (label, { dirty = false, changed = false, squashMerged = false, fastForwardMerged = false, serverMerged = false, localFollowUp = false, localFollowUpMerged = false, siblingTargetAdvance = false, branchDeleteMode } = {}) => {
  const primary = join(root, "teardown", label, "primary")
  const child = join(root, "teardown", label, "child")
  const remote = join(root, "teardown", label, "remote.git")
  mkdirSync(primary, { recursive: true })
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (git(primary, ["init", "-q", "--bare", remote]).status !== 0) return null
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"], ["remote", "add", "origin", remote], ["push", "-q", "-u", "origin", "main"], ["worktree", "add", "-q", "-b", "feature/orb-124-teardown", child]]) {
    if (git(primary, args).status !== 0) return null
  }
  let mergeCommit
  if (changed) {
    writeFileSync(join(child, "captured.txt"), "not in main\n")
    if (git(child, ["add", "captured.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "captured work"]).status !== 0) return null
    if (git(child, ["push", "-q", "-u", "origin", "feature/orb-124-teardown"]).status !== 0) return null
    if (squashMerged) {
      writeFileSync(join(primary, "captured.txt"), "not in main\n")
      if (git(primary, ["add", "captured.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "squashed capture"]).status !== 0) return null
      mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    }
    if (fastForwardMerged) {
      if (git(primary, ["merge", "--ff-only", "feature/orb-124-teardown"]).status !== 0) return null
      mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    }
    if (serverMerged) {
      if (git(primary, ["merge", "--no-ff", "-m", "server merge", "feature/orb-124-teardown"]).status !== 0) return null
      mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    }
    if (serverMerged) {
      writeFileSync(join(primary, "captured.txt"), "resolved on forge\n")
      if (git(primary, ["add", "captured.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "server resolution"]).status !== 0) return null
    }
    if (siblingTargetAdvance) {
      writeFileSync(join(primary, "sibling-ticket.txt"), "already in main\n")
      if (git(primary, ["add", "sibling-ticket.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "sibling ticket"]).status !== 0) return null
    }
    if ((squashMerged || fastForwardMerged || serverMerged || siblingTargetAdvance) && git(primary, ["push", "-q", "origin", "main"]).status !== 0) return null
  }
  const headCommit = git(child, ["rev-parse", "HEAD"]).stdout.trim()
  if (localFollowUp) {
    writeFileSync(join(child, "follow-up.txt"), "must not be removed\n")
    if (git(child, ["add", "follow-up.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "local follow-up"]).status !== 0) return null
  }
  if (localFollowUpMerged) {
    if (git(primary, ["merge", "--no-ff", "-m", "merged local follow-up", "feature/orb-124-teardown"]).status !== 0 || git(primary, ["push", "-q", "origin", "main"]).status !== 0) return null
  }
  if (dirty) writeFileSync(join(child, "dirty.txt"), "uncommitted\n")
  if (branchDeleteMode) {
    const branchRef = "refs/heads/feature/orb-124-teardown"
    const hook = join(primary, ".git", "hooks", "reference-transaction")
    const head = git(primary, ["rev-parse", "main"]).stdout.trim()
    const body = branchDeleteMode === "fail"
      ? `#!/bin/sh\nif [ "$1" = "prepared" ]; then\n  while read old new ref; do\n    if [ "$ref" = "${branchRef}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then exit 1; fi\n  done\nfi\n`
      : `#!/bin/sh\nmarker="$GIT_DIR/teardown-branch-recreated"\nif [ "$1" = "committed" ] && [ ! -f "$marker" ]; then\n  while read old new ref; do\n    if [ "$ref" = "${branchRef}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then\n      touch "$marker"\n      git update-ref "${branchRef}" "${head}"\n    fi\n  done\nfi\n`
    writeFileSync(hook, body)
    chmodSync(hook, 0o755)
  }
  return { primary, child, branch: "feature/orb-124-teardown", headCommit, mergeCommit: mergeCommit ?? git(primary, ["rev-parse", "HEAD"]).stdout.trim(), targetTip: git(primary, ["rev-parse", "HEAD"]).stdout.trim() }
}

const teardownWorktreeRecord = (fixture) => ({
  path: fixture.child,
  isMainWorktree: false,
  isArchived: false,
  linkedLinearIssue: "ORB-124",
  branch: `refs/heads/${fixture.branch}`,
  baseRef: "main",
})

const mergedPullRequest = (fixture, number = 124) => ({ number, mergedAt: "2026-07-28T12:00:00Z", mergeCommit: { oid: fixture.mergeCommit }, headRefOid: fixture.headCommit })

const missingTargetPullRequest = (fixture) => ({ ...mergedPullRequest(fixture), mergeCommit: { oid: fixture.headCommit } })

const teardownPlan = (fixture, { state = "Done", pullRequest = mergedPullRequest(fixture), pullRequestOutput = JSON.stringify(pullRequest ? [pullRequest] : []), pullRequestExit = 0, removePath, removal = JSON.stringify({ ok: true, result: {} }), removalExit = 0 } = {}) => [
  { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [teardownWorktreeRecord(fixture)] } }) },
  { match: "linear issue ORB-124", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-124", state: { name: state } } } }) },
  { match: "pr list --head feature/orb-124-teardown --base main --state merged --limit 1 --json number,mergeCommit,headRefOid,mergedAt", stdout: pullRequestOutput, exit: pullRequestExit },
  { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
  { match: "worktree rm", stdout: removal, exit: removalExit, ...(removePath ? { removePath } : {}) },
]

const teardownWorktreeCases = () => {
  check("teardown-worktree.mjs", "refuses no selector", [], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses both selectors", ["--issue", "ORB-124", "--worktree", "path:C:/other"], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses a malformed Linear issue selector", ["--issue", "orb-124"], { status: 2, stderr: /--issue must be a Linear identifier/ })
  check("teardown-worktree.mjs", "refuses a valueless issue selector", ["--issue"], { status: 2, stderr: /selector flags require a value/ })
  check("teardown-worktree.mjs", "refuses a valueless worktree selector", ["--worktree"], { status: 2, stderr: /selector flags require a value/ })
  check("teardown-worktree.mjs", "refuses a valueless base", ["--issue", "ORB-124", "--base"], { status: 2, stderr: /selector flags require a value/ })
  check(
    "teardown-worktree.mjs",
    "refuses an issue with no active worktree",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /no active Orca worktree is linked to ORB-124/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) }]) },
  )

  const allGood = stageTeardownWorktree("all-good")
  if (!allGood) {
    T("teardown-worktree.mjs: real git fixture is available", false, "could not create a linked Git worktree")
    return
  }
  const primaryRefusal = stageTeardownWorktree("primary-refusal")
  const primaryRecord = { ...teardownWorktreeRecord(primaryRefusal), path: primaryRefusal.primary, isMainWorktree: true }
  check(
    "teardown-worktree.mjs",
    "refuses a primary checkout",
    ["--worktree", `path:${primaryRefusal.primary}`],
    { status: 1, stderr: /refusing to remove a primary checkout/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [primaryRecord] } }) }]) },
  )

  const unlinkedRefusal = stageTeardownWorktree("unlinked-refusal")
  const unlinkedRecord = { ...teardownWorktreeRecord(unlinkedRefusal), linkedLinearIssue: null }
  check(
    "teardown-worktree.mjs",
    "refuses a worktree without a linked Linear issue",
    ["--worktree", `path:${unlinkedRefusal.child}`],
    { status: 1, stderr: /refusing a worktree without a linked Linear issue/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [unlinkedRecord] } }) }]) },
  )
  const unavailable = check(
    "teardown-worktree.mjs",
    "runtime_unavailable is success when filesystem and git verification prove removal",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree[\s\S]*REMOVED terminals[\s\S]*REMOVED local branch/ },
    {
      env: orcaEnv(
        teardownPlan(allGood, {
          removePath: allGood.child,
          removal: JSON.stringify({ ok: false, code: "runtime_unavailable", message: "connection closed" }),
          removalExit: 1,
        }),
      ),
    },
  )
  T("teardown-worktree.mjs: verified removal actually deleted the fixture", !existsSync(allGood.child), unavailable.stderr)

  const exitedWorker = stageTeardownWorktree("exited-worker")
  const exitedWorkerMarker = stageWorkerPidMarker(exitedWorker.child, exitedProbePid())
  check(
    "teardown-worktree.mjs",
    "a worker PID that has exited is torn down",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree/ },
    { env: orcaEnv(teardownPlan(exitedWorker, { removePath: exitedWorker.child })) },
  )
  T(
    "teardown-worktree.mjs: teardown prunes the worker PID marker it verified",
    !existsSync(exitedWorkerMarker),
    `marker still present at ${exitedWorkerMarker}`,
  )

  const dirty = stageTeardownWorktree("dirty", { dirty: true })
  check("teardown-worktree.mjs", "a dirty tree is refused with its uncommitted path", ["--issue", "ORB-124"], { status: 1, stderr: /worktree-clean[\s\S]*dirty\.txt/ }, { env: orcaEnv(teardownPlan(dirty, { removePath: dirty.child })) })
  T("teardown-worktree.mjs: dirty refusal leaves the tree untouched", existsSync(dirty.child), "the dirty fixture was removed")

  const unmerged = stageTeardownWorktree("unmerged", { changed: true })
  check("teardown-worktree.mjs", "content absent from the target branch is refused", ["--issue", "ORB-124"], { status: 1, stderr: /merge-commit-in-target/ }, { env: orcaEnv(teardownPlan(unmerged, { pullRequest: missingTargetPullRequest(unmerged), removePath: unmerged.child })) })

  const missingTarget = stageTeardownWorktree("missing-target", { changed: true })
  check("teardown-worktree.mjs", "a merged pull request whose content is absent from the target names its missing merge commit", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET merge-commit-in-target: pull request #124's merge commit .* is not an ancestor of origin\/main/ }, { env: orcaEnv(teardownPlan(missingTarget, { pullRequest: missingTargetPullRequest(missingTarget) })) })

  const unreadableMergeCommit = stageTeardownWorktree("unreadable-merge-commit")
  check("teardown-worktree.mjs", "an unreadable merge commit refuses with exit 3", ["--issue", "ORB-124"], { status: 3, stderr: /UNMET merge-commit-in-target: could not read pull request #124's merge commit/ }, { env: orcaEnv(teardownPlan(unreadableMergeCommit, { pullRequest: { ...mergedPullRequest(unreadableMergeCommit), mergeCommit: { oid: "0000000000000000000000000000000000000001" } } })) })

  const lookupFailure = stageTeardownWorktree("lookup-failure", { dirty: true })
  stageWorkerPidMarker(lookupFailure.child, process.pid)
  const lookupFailureLog = join(root, "teardown", "lookup-failure.log")
  check(
    "teardown-worktree.mjs",
    "a failed merged-commit lookup reports every independent refusal",
    ["--issue", "ORB-124"],
    { status: 3, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt[\s\S]*UNMET pull-request-merged: gh pr list for feature\/orb-124-teardown failed[\s\S]*UNMET linear-done: issue is In Review, expected Done[\s\S]*UNMET worker-pid-exited: worker PID is still running/ },
    {
      env: {
        ...orcaEnv(teardownPlan(lookupFailure, { state: "In Review", pullRequest: null, pullRequestExit: 1, removePath: lookupFailure.child })),
        ORBIT_ORCA_LOG: lookupFailureLog,
      },
    },
  )

  const unexpectedPullRequestPayload = stageTeardownWorktree("unexpected-pull-request-payload")
  check("teardown-worktree.mjs", "a merged-commit lookup with a non-array payload refuses", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown returned an unexpected payload/ }, { env: orcaEnv(teardownPlan(unexpectedPullRequestPayload, { pullRequestOutput: JSON.stringify({ number: 124 }) })) })

  const malformedPullRequestPayload = stageTeardownWorktree("malformed-pull-request-payload")
  check("teardown-worktree.mjs", "a merged-commit lookup with malformed JSON refuses", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown returned unparseable output/ }, { env: orcaEnv(teardownPlan(malformedPullRequestPayload, { pullRequestOutput: "not-json" })) })

  const notMerged = stageTeardownWorktree("not-merged", { dirty: true })
  stageWorkerPidMarker(notMerged.child, process.pid)
  const notMergedLog = join(root, "teardown", "not-merged.log")
  check(
    "teardown-worktree.mjs",
    "an unmerged pull request reports every independent refusal",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt[\s\S]*UNMET pull-request-merged: pull request for feature\/orb-124-teardown is not a merged pull request with merge and head commits[\s\S]*UNMET linear-done: issue is In Review, expected Done[\s\S]*UNMET worker-pid-exited: worker PID is still running/ },
    {
      env: {
        ...orcaEnv(teardownPlan(notMerged, { state: "In Review", pullRequest: null, removePath: notMerged.child })),
        ORBIT_ORCA_LOG: notMergedLog,
      },
    },
  )

  const ownLocalMerged = stageTeardownWorktree("own-local-merged", { changed: true, fastForwardMerged: true })
  check("teardown-worktree.mjs", "a pull request merged from the worker's own local commit tears down", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(ownLocalMerged, { removePath: ownLocalMerged.child })) })

  const serverSideMerge = stageTeardownWorktree("server-side-merge", { changed: true, serverMerged: true })
  check("teardown-worktree.mjs", "a server-side merged commit absent from the local branch tears down", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(serverSideMerge, { removePath: serverSideMerge.child })) })

  const localFollowUp = stageTeardownWorktree("local-follow-up", { changed: true, serverMerged: true, localFollowUp: true })
  check("teardown-worktree.mjs", "a local follow-up after the merged pull request is refused without suggesting a forceful merge check", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET local-tip-in-pull-request-head: local tip .* is not contained in pull request #124's head .*; local commits would be lost/ }, { env: orcaEnv(teardownPlan(localFollowUp)) })

  const mergedLocalFollowUp = stageTeardownWorktree("merged-local-follow-up", { changed: true, serverMerged: true, localFollowUp: true, localFollowUpMerged: true })
  check("teardown-worktree.mjs", "a local tip behind the forge pull request head tears down", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(mergedLocalFollowUp, { pullRequest: { ...mergedPullRequest(mergedLocalFollowUp), headRefOid: mergedLocalFollowUp.targetTip }, removePath: mergedLocalFollowUp.child })) })

  const notDone = stageTeardownWorktree("not-done")
  check("teardown-worktree.mjs", "a closed-looking but non-Done Linear issue is refused", ["--issue", "ORB-124"], { status: 1, stderr: /linear-done[\s\S]*In Review/ }, { env: orcaEnv(teardownPlan(notDone, { state: "In Review", removePath: notDone.child })) })

  const stillRunning = stageTeardownWorktree("still-running")
  const stillRunningMarker = stageWorkerPidMarker(stillRunning.child, process.pid)
  const stillRunningLog = join(root, "teardown", "still-running.log")
  check(
    "teardown-worktree.mjs",
    "a worker PID that is still running is refused because the worker is still working",
    ["--issue", "ORB-124"],
    { status: 1, stderr: new RegExp(`worker-pid-exited[\\s\\S]*worker PID is still running: ${process.pid}`) },
    { env: { ...orcaEnv(teardownPlan(stillRunning)), ORBIT_ORCA_LOG: stillRunningLog } },
  )
  T(
    "teardown-worktree.mjs: a refused teardown leaves the worker PID marker in place",
    existsSync(stillRunningMarker) && existsSync(stillRunning.child),
    `marker ${existsSync(stillRunningMarker)}, worktree ${existsSync(stillRunning.child)}`,
  )

  const survives = stageTeardownWorktree("survives")
  check("teardown-worktree.mjs", "an ok removal response is failure when the directory survives", ["--issue", "ORB-124"], { status: 1, stderr: /removal verification failed/ }, { env: orcaEnv(teardownPlan(survives)) })

  const selector = stageTeardownWorktree("selector", { changed: true, squashMerged: true })
  check("teardown-worktree.mjs", "a path selector accepts a squash-merged tree without ancestry", ["--worktree", `path:${selector.child}`], { status: 0 }, { env: orcaEnv(teardownPlan(selector, { removePath: selector.child })) })

  const siblingAdvanced = stageTeardownWorktree("sibling-advance", { changed: true, squashMerged: true, siblingTargetAdvance: true })
  check("teardown-worktree.mjs", "a squash-merged tree is present when the target advanced on unrelated paths", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(siblingAdvanced, { removePath: siblingAdvanced.child })) })

  const branchDeleteFails = stageTeardownWorktree("branch-delete-fails", { branchDeleteMode: "fail" })
  check(
    "teardown-worktree.mjs",
    "reports a branch deletion failure after removing the worktree",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /removed worktree but could not delete local branch feature\/orb-124-teardown/ },
    { env: orcaEnv(teardownPlan(branchDeleteFails, { removePath: branchDeleteFails.child })) },
  )

  const branchRemains = stageTeardownWorktree("branch-remains", { branchDeleteMode: "retain" })
  check(
    "teardown-worktree.mjs",
    "reports a branch that remains after deletion",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /removed worktree but local branch feature\/orb-124-teardown still exists/ },
    { env: orcaEnv(teardownPlan(branchRemains, { removePath: branchRemains.child })) },
  )
}

export { teardownWorktreeCases as cases }
