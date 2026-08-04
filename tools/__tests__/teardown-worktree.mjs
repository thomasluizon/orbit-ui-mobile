import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { appendFileSync, chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, orcaEnv, check, stageWorkerPidMarker, exitedProbePid, toolPath } from "./_harness.mjs"

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

const teardownPlan = (fixture, { state = "Done", pullRequest = mergedPullRequest(fixture), pullRequestOutput = JSON.stringify(pullRequest ? [pullRequest] : []), pullRequestExit = 0, removePath, removal = JSON.stringify({ ok: true, result: {} }), removalExit = 0, finalActive = false, finalAgents = [] } = {}) => [
  { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [teardownWorktreeRecord(fixture)] } }) },
  { match: "linear issue ORB-124", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-124", state: { name: state } } } }) },
  { match: "pr list --head feature/orb-124-teardown --base main --state merged --limit 1 --json number,mergeCommit,headRefOid,mergedAt", stdout: pullRequestOutput, exit: pullRequestExit },
  { match: "worktree ps", stdout: JSON.stringify({ ok: true, result: { worktrees: [{ path: fixture.child, isActive: finalActive, agents: finalAgents }], totalCount: 1, truncated: false } }) },
  { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
  { match: "worktree rm", stdout: removal, exit: removalExit, ...(removePath ? { removePath } : {}) },
]

const teardownWorktreeCases = () => {
  const source = readFileSync(new URL("../teardown-worktree.mjs", import.meta.url), "utf8")
  const forceRemoved = !/worktree", "rm"[^\n]+"--force"/.test(source)
  T(
    "teardown-worktree.mjs: Orca removal never uses --force",
    forceRemoved,
    "the shipped worktree rm call still carries --force and may follow a Windows junction target",
  )
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
  const lifecycleLocked = stageTeardownWorktree("lifecycle-lock")
  const lockedToolRoot = join(root, "teardown", "lifecycle-lock-tool")
  mkdirSync(lockedToolRoot, { recursive: true })
  const lockedTool = join(lockedToolRoot, "teardown-worktree.mjs")
  cpSync(toolPath("teardown-worktree.mjs"), lockedTool)
  cpSync(toolPath("lib"), join(lockedToolRoot, "lib"), { recursive: true })
  const lockHelper = join(lockedToolRoot, "lib", "worktree-lifecycle-lock.mjs")
  writeFileSync(lockHelper, readFileSync(lockHelper, "utf8").replace("timeoutMs = 5 * 60 * 1000", "timeoutMs = 200"))
  const lifecycleLockPath = join(lifecycleLocked.primary, ".git", "orbit-launch-worker.lock")
  writeFileSync(lifecycleLockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
  check(
    "teardown-worktree.mjs",
    "a live worker launch lifecycle lock blocks teardown before loss-prevention reads",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /timed out waiting for worktree lifecycle lock/ },
    { path: lockedTool, env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [teardownWorktreeRecord(lifecycleLocked)] } }) }]) },
  )
  T("teardown-worktree.mjs: a live lifecycle lock preserves the worktree", existsSync(lifecycleLocked.child), "the lock holder did not prevent removal")
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

  const finalActivity = stageTeardownWorktree("final-activity")
  check(
    "teardown-worktree.mjs",
    "a final Orca activity re-read refuses removal",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /refusing removal because Orca reports active work/ },
    { env: orcaEnv(teardownPlan(finalActivity, { finalActive: true, finalAgents: [{ state: "working" }] })) },
  )
  T("teardown-worktree.mjs: final Orca activity refusal preserves the worktree", existsSync(finalActivity.child), "the final activity check allowed removal")

  const enumerationActivity = stageTeardownWorktree("enumeration-activity")
  const enumerationMarker = join(root, "teardown", "enumeration-activity.marker")
  const enumerationObserver = join(root, "teardown", "enumeration-activity-observer.cjs")
  writeFileSync(enumerationObserver, `const fs = require("node:fs")
const original = fs.readdirSync
fs.readdirSync = function (directory, ...args) {
  if (directory === process.env.ORBIT_ENUMERATION_ACTIVITY_PATH && !fs.existsSync(process.env.ORBIT_ENUMERATION_ACTIVITY_MARKER)) {
    fs.writeFileSync(process.env.ORBIT_ENUMERATION_ACTIVITY_MARKER, "activity appeared during enumeration\\n")
  }
  return original.call(this, directory, ...args)
}
`)
  const enumerationEnvironment = orcaEnv(teardownPlan(enumerationActivity, { removePath: enumerationActivity.child }))
  const enumerationResult = check(
    "teardown-worktree.mjs",
    "a worktree that becomes active during junction enumeration is refused",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /refusing removal because Orca reports active work/ },
    {
      env: {
        ...enumerationEnvironment,
        NODE_OPTIONS: `--require "${enumerationObserver.replaceAll("\\", "/")}" ${enumerationEnvironment.NODE_OPTIONS}`,
        ORBIT_ENUMERATION_ACTIVITY_MARKER: enumerationMarker,
        ORBIT_ENUMERATION_ACTIVITY_PATH: enumerationActivity.child,
      },
    },
  )
  T(
    "teardown-worktree.mjs: activity introduced during enumeration preserves the worktree",
    enumerationResult.status === 1 && existsSync(enumerationActivity.child),
    enumerationResult.stderr || `worktree exists: ${existsSync(enumerationActivity.child)}`,
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
  check("teardown-worktree.mjs", "a local follow-up after the merged pull request is refused by content mismatch", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET local-content-in-pull-request-head: local tip .* has different content from pull request #124's head .*; local changes would be lost/ }, { env: orcaEnv(teardownPlan(localFollowUp)) })

  const mergedLocalFollowUp = stageTeardownWorktree("merged-local-follow-up", { changed: true, serverMerged: true, localFollowUp: true, localFollowUpMerged: true })
  check("teardown-worktree.mjs", "a forge head with different content preserves the local worktree", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET local-content-in-pull-request-head: local tip .* has different content from pull request #124's head/ }, { env: orcaEnv(teardownPlan(mergedLocalFollowUp, { pullRequest: { ...mergedPullRequest(mergedLocalFollowUp), headRefOid: mergedLocalFollowUp.targetTip } })) })

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

  if (!forceRemoved) {
    T(
      "teardown-worktree.mjs: a real Windows junction target survives teardown",
      false,
      "fixture withheld while the shipped removal still uses --force",
    )
    return
  }

  const internalJunction = stageTeardownWorktree("internal-junction-present-at-removal")
  const internalTarget = join(internalJunction.child, "node_modules", ".store", "shared")
  const internalLink = join(internalJunction.child, "node_modules", "shared")
  const internalSentinel = join(internalTarget, "sentinel.txt")
  const internalObservation = join(root, "teardown", "internal-junction-observation.json")
  const junctionObserver = join(root, "teardown", "junction-observer.cjs")
  mkdirSync(internalTarget, { recursive: true })
  writeFileSync(internalSentinel, "target must exist when Orca removal starts\n")
  appendFileSync(join(internalJunction.primary, ".git", "info", "exclude"), "\nnode_modules/\n")
  symlinkSync(internalTarget, internalLink, "junction")
  writeFileSync(junctionObserver, `const { existsSync, writeFileSync } = require("node:fs")
if (process.argv.slice(1).join(" ").includes("worktree rm")) {
  writeFileSync(process.env.ORBIT_JUNCTION_OBSERVATION, JSON.stringify({
    link: existsSync(process.env.ORBIT_JUNCTION_LINK),
    target: existsSync(process.env.ORBIT_JUNCTION_SENTINEL),
  }))
}
`)
  const internalPlan = teardownPlan(internalJunction, { removePath: internalJunction.child })
  const internalEnv = orcaEnv(internalPlan)
  check(
    "teardown-worktree.mjs",
    "unlinks an internal Windows junction before ordinary Orca removal",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED junction link[\s\S]*PRESERVED junction target[\s\S]*REMOVED worktree/ },
    {
      env: {
        ...internalEnv,
        NODE_OPTIONS: `--require "${junctionObserver.replaceAll("\\", "/")}" ${internalEnv.NODE_OPTIONS}`,
        ORBIT_JUNCTION_OBSERVATION: internalObservation,
        ORBIT_JUNCTION_LINK: internalLink,
        ORBIT_JUNCTION_SENTINEL: internalSentinel,
      },
    },
  )
  const observedInternalJunction = existsSync(internalObservation)
    ? JSON.parse(readFileSync(internalObservation, "utf8"))
    : null
  T(
    "teardown-worktree.mjs: internal junction target exists at the Orca removal boundary",
    observedInternalJunction?.link === false && observedInternalJunction?.target === true,
    `observation: ${JSON.stringify(observedInternalJunction)}`,
  )

  const junction = stageTeardownWorktree("junction-survives")
  const junctionTarget = join(root, "teardown", "junction-target")
  const junctionParent = join(junction.child, "node_modules")
  const junctionLink = join(junctionParent, "shared")
  const sentinel = join(junctionTarget, "sentinel.txt")
  mkdirSync(junctionTarget, { recursive: true })
  mkdirSync(junctionParent, { recursive: true })
  writeFileSync(sentinel, "target must survive\n")
  appendFileSync(join(junction.primary, ".git", "info", "exclude"), "\nnode_modules/\n")
  symlinkSync(junctionTarget, junctionLink, "junction")
  T(
    "teardown-worktree.mjs: junction fixture is a real filesystem link",
    lstatSync(junctionLink).isSymbolicLink(),
    `${junctionLink} is not a junction or symbolic link`,
  )
  const junctionLog = join(root, "teardown", "junction-calls.log")
  const junctionResult = check(
    "teardown-worktree.mjs",
    "removes the verified junction link before safe Orca teardown",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED junction link[\s\S]*PRESERVED junction target[\s\S]*REMOVED worktree/ },
    { env: { ...orcaEnv(teardownPlan(junction, { removePath: junction.child })), ORBIT_ORCA_LOG: junctionLog } },
  )
  const junctionCalls = existsSync(junctionLog)
    ? readFileSync(junctionLog, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "teardown-worktree.mjs: safe Orca removal omits --force",
    junctionCalls.some((call) => {
      const command = call.findIndex((token) => token === "worktree" || token.endsWith("\\worktree") || token.endsWith("/worktree"))
      return command !== -1 && call[command + 1] === "rm" && !call.includes("--force")
    }),
    junctionResult.stderr || `calls: ${JSON.stringify(junctionCalls)}`,
  )
  T(
    "teardown-worktree.mjs: a real Windows junction target survives teardown",
    existsSync(junctionTarget) && existsSync(sentinel),
    `target=${existsSync(junctionTarget)}, sentinel=${existsSync(sentinel)}`,
  )
}

export { teardownWorktreeCases as cases }
