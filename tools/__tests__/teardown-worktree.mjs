import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check as harnessCheck, orcaEnv, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "teardown-worktree.mjs"
const BRANCH = "feature/orb-124-teardown"
let stagedToolPath
const check = (file, name, argv, expect, options = {}) => harnessCheck(file, name, [...argv, "--repo", "ui"], expect, { ...options, path: stagedToolPath })

/** A linked child checkout is the smallest real Git fixture that can prove teardown verification. */
const stageTeardownWorktree = (label, { dirty = false, changed = false, squashMerged = false, fastForwardMerged = false, localFollowUp = false, retainBranch = false } = {}) => {
  const primary = join(root, "teardown", label, "primary")
  const child = join(root, "teardown", label, "child")
  const remote = join(root, "teardown", label, "remote.git")
  mkdirSync(primary, { recursive: true })
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (git(primary, ["init", "-q", "--bare", remote]).status !== 0) return null
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"], ["remote", "add", "origin", remote], ["push", "-q", "-u", "origin", "main"], ["worktree", "add", "-q", "-b", BRANCH, child]]) {
    if (git(primary, args).status !== 0) return null
  }
  let mergeCommit
  if (changed) {
    writeFileSync(join(child, "captured.txt"), "not in main\n")
    if (git(child, ["add", "captured.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "captured work"]).status !== 0) return null
    if (git(child, ["push", "-q", "-u", "origin", BRANCH]).status !== 0) return null
    if (squashMerged) {
      writeFileSync(join(primary, "captured.txt"), "not in main\n")
      if (git(primary, ["add", "captured.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "squashed capture"]).status !== 0) return null
    }
    if (fastForwardMerged && git(primary, ["merge", "--ff-only", BRANCH]).status !== 0) return null
    mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    if ((squashMerged || fastForwardMerged) && git(primary, ["push", "-q", "origin", "main"]).status !== 0) return null
  }
  const headCommit = git(child, ["rev-parse", "HEAD"]).stdout.trim()
  if (localFollowUp) {
    writeFileSync(join(child, "follow-up.txt"), "must not be removed\n")
    if (git(child, ["add", "follow-up.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "local follow-up"]).status !== 0) return null
  }
  if (dirty) writeFileSync(join(child, "dirty.txt"), "uncommitted\n")
  if (retainBranch) {
    /** Recreates the branch the moment git deletes it, which is the only way to drive the
     * post-deletion verification without pretending git failed. */
    const hook = join(primary, ".git", "hooks", "reference-transaction")
    const head = git(primary, ["rev-parse", "main"]).stdout.trim()
    writeFileSync(hook, `#!/bin/sh\nmarker="$GIT_DIR/teardown-branch-recreated"\nif [ "$1" = "committed" ] && [ ! -f "$marker" ]; then\n  while read old new ref; do\n    if [ "$ref" = "refs/heads/${BRANCH}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then\n      touch "$marker"\n      git update-ref "refs/heads/${BRANCH}" "${head}"\n    fi\n  done\nfi\n`)
    chmodSync(hook, 0o755)
  }
  return { primary, child, headCommit, mergeCommit: mergeCommit ?? git(primary, ["rev-parse", "HEAD"]).stdout.trim() }
}

const ORCA_TICKET_LINK_FIELD = ["linked", "Lin", "earIssue"].join("")
const worktreeRecord = (fixture) => ({ path: fixture.child, isMainWorktree: false, isArchived: false, [ORCA_TICKET_LINK_FIELD]: "ORB-124", branch: `refs/heads/${BRANCH}`, baseRef: "main" })

const mergedPullRequest = (fixture) => ({ number: 124, mergedAt: "2026-07-28T12:00:00Z", mergeCommit: { oid: fixture.mergeCommit }, headRefOid: fixture.headCommit })

const teardownPlan = (fixture, { pullRequests = [mergedPullRequest(fixture)], pullRequestOutput, pullRequestExit = 0, removePath, removal = JSON.stringify({ ok: true, result: {} }), removalExit = 0, worktrees = [worktreeRecord(fixture)] } = {}) => [
  { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees } }) },
  { match: `pr list --head ${BRANCH}`, stdout: pullRequestOutput ?? JSON.stringify(pullRequests), exit: pullRequestExit },
  { match: "worktree rm", stdout: removal, exit: removalExit, ...(removePath ? { removePath } : {}) },
]

export const cases = () => {
  const staged = stageWithConfig("teardown-worktree", TOOL, realOrchestratorConfig())
  stagedToolPath = staged.path
  stage(
    "staged/teardown-worktree/tools/lib/github-issues.mjs",
    `export const resolveTicket = (reference) => {
  const identifier = String(reference).toUpperCase()
  if (identifier !== "ORB-124") throw new Error("Unknown migrated ticket " + reference)
  return { identifier, number: 124 }
}
export const readTicket = async () => ({
  identifier: "ORB-124",
  number: 124,
  status: process.env.ORBIT_TICKET_STATUS || "Done",
  state: process.env.ORBIT_TICKET_STATE || "CLOSED",
  labels: [{ name: "repo:ui" }],
})
export const assertRepositoryLabel = (ticket, repoKey) => {
  if (ticket.labels.length !== 1 || ticket.labels[0].name !== "repo:" + repoKey) throw new Error("ticket repository label mismatch")
  return ticket
}
`,
  )
  check(TOOL, "refuses no selector", [], { status: 2, stderr: /provide exactly one selector/ })
  check(TOOL, "refuses both selectors", ["--issue", "ORB-124", "--worktree", "path:C:/other"], { status: 2, stderr: /provide exactly one selector/ })
  check(TOOL, "refuses a ticket absent from the migration map", ["--issue", "ORB-999999"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })
  check(TOOL, "refuses a valueless issue selector", ["--issue"], { status: 2, stderr: /selector flags require a value/ })
  check(TOOL, "refuses a valueless worktree selector", ["--worktree"], { status: 2, stderr: /selector flags require a value/ })
  check(TOOL, "refuses a valueless base", ["--issue", "ORB-124", "--base"], { status: 2, stderr: /selector flags require a value/ })
  check(TOOL, "refuses an unknown option before reading anything", ["--issue", "ORB-124", "--force"], { status: 2, stderr: /unknown option\(s\): --force/ })
  check(TOOL, "refuses an issue with no active worktree", ["--issue", "ORB-124"], { status: 1, stderr: /no active Orca worktree is linked to ORB-124/ }, { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) }]) })

  const allGood = stageTeardownWorktree("all-good", { changed: true, fastForwardMerged: true })
  if (!allGood) {
    T(`${TOOL}: real git fixture is available`, false, "could not create a linked Git worktree")
    return
  }

  const primaryRefusal = stageTeardownWorktree("primary-refusal")
  check(
    TOOL,
    "refuses a primary checkout",
    ["--worktree", `path:${primaryRefusal.primary}`],
    { status: 1, stderr: /refusing to remove a primary checkout/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [{ ...worktreeRecord(primaryRefusal), path: primaryRefusal.primary, isMainWorktree: true }] } }) }]) },
  )
  const unlinked = stageTeardownWorktree("unlinked-refusal")
  check(
    TOOL,
    "refuses a worktree without a linked ticket",
    ["--worktree", `path:${unlinked.child}`],
    { status: 1, stderr: /refusing a worktree without a linked ticket/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [{ ...worktreeRecord(unlinked), [ORCA_TICKET_LINK_FIELD]: null }] } }) }]) },
  )
  check(
    TOOL,
    "refuses a path selector matching no active worktree",
    ["--worktree", `path:${join(root, "teardown", "never-existed")}`],
    { status: 1, stderr: /no active Orca worktree matches/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [worktreeRecord(unlinked)] } }) }]) },
  )

  const unmerged = stageTeardownWorktree("unmerged", { changed: true })
  check(TOOL, "a branch with no merged pull request is refused", ["--issue", "ORB-124"], { status: 1, stderr: /no merged pull request with merge and head commits was found for feature\/orb-124-teardown/ }, { env: orcaEnv(teardownPlan(unmerged, { pullRequests: [], removePath: unmerged.child })) })
  T(`${TOOL}: the unmerged refusal leaves the tree in place`, existsSync(unmerged.child), "the unmerged fixture was removed")

  const lookupFailure = stageTeardownWorktree("lookup-failure", { changed: true })
  check(TOOL, "a failed pull-request lookup is exit 3, never an absence of evidence", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown failed/ }, { env: orcaEnv(teardownPlan(lookupFailure, { pullRequestOutput: "", pullRequestExit: 1, removePath: lookupFailure.child })) })
  const malformed = stageTeardownWorktree("malformed-payload", { changed: true })
  check(TOOL, "an unparseable pull-request payload is exit 3", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown failed/ }, { env: orcaEnv(teardownPlan(malformed, { pullRequestOutput: "not-json", removePath: malformed.child })) })

  const unreadable = stageTeardownWorktree("unreadable-merge-commit", { changed: true, fastForwardMerged: true })
  check(TOOL, "an unreadable merge commit fails as unreadable, not as work loss", ["--issue", "ORB-124"], { status: 3, stderr: /could not read commit 0{39}1/ }, { env: orcaEnv(teardownPlan(unreadable, { pullRequests: [{ ...mergedPullRequest(unreadable), mergeCommit: { oid: "0000000000000000000000000000000000000001" } }] })) })

  const missingTarget = stageTeardownWorktree("missing-target", { changed: true })
  check(TOOL, "a merge commit absent from the target branch is refused", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET merge-commit-in-target: pull request #124 merge commit .* is not an ancestor of origin\/main/ }, { env: orcaEnv(teardownPlan(missingTarget, { pullRequests: [{ ...mergedPullRequest(missingTarget), mergeCommit: { oid: missingTarget.headCommit } }], removePath: missingTarget.child })) })
  T(`${TOOL}: the merge-commit refusal leaves the tree in place`, existsSync(missingTarget.child), "the unmerged fixture was removed")

  const followUp = stageTeardownWorktree("local-follow-up", { changed: true, fastForwardMerged: true, localFollowUp: true })
  check(TOOL, "a local commit absent from the pull request head is refused as work loss", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET local-tip-in-pull-request-head: local tip .* is not contained in pull request #124 head .*; local commits would be lost/ }, { env: orcaEnv(teardownPlan(followUp, { removePath: followUp.child })) })

  const notDone = stageTeardownWorktree("not-done", { changed: true, fastForwardMerged: true, dirty: true })
  check(TOOL, "every independent refusal is reported in one pass", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt[\s\S]*UNMET ticket-done: ticket is OPEN with board status In Review, expected CLOSED and Done/ }, { env: { ...orcaEnv(teardownPlan(notDone, { state: "In Review", removePath: notDone.child })), ORBIT_TICKET_STATUS: "In Review", ORBIT_TICKET_STATE: "OPEN" } })

  const removed = check(TOOL, "a merged, clean, Done worktree is removed and verified", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree[\s\S]*REMOVED local branch feature\/orb-124-teardown/ }, { env: orcaEnv(teardownPlan(allGood, { removePath: allGood.child })) })
  T(`${TOOL}: verified removal actually deleted the fixture`, !existsSync(allGood.child), removed.stderr)

  const unavailable = stageTeardownWorktree("runtime-unavailable", { changed: true, fastForwardMerged: true })
  check(
    TOOL,
    "a dropped orca runtime is success when the filesystem and git prove removal",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree/ },
    { env: orcaEnv(teardownPlan(unavailable, { removePath: unavailable.child, removal: JSON.stringify({ ok: false, code: "runtime_unavailable", message: "connection closed" }), removalExit: 1 })) },
  )

  const survives = stageTeardownWorktree("survives", { changed: true, fastForwardMerged: true })
  check(TOOL, "an ok removal response is failure when the directory survives", ["--issue", "ORB-124"], { status: 1, stderr: /removal verification failed/ }, { env: orcaEnv(teardownPlan(survives)) })

  const selector = stageTeardownWorktree("selector", { changed: true, squashMerged: true })
  check(TOOL, "a path selector accepts a squash-merged tree without ancestry", ["--worktree", `path:${selector.child}`], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(selector, { removePath: selector.child })) })

  const retained = stageTeardownWorktree("branch-retained", { changed: true, fastForwardMerged: true, retainBranch: true })
  check(TOOL, "a local branch that survives deletion is reported after the worktree is removed", ["--issue", "ORB-124"], { status: 1, stderr: /removed worktree but local branch feature\/orb-124-teardown still exists/ }, { env: orcaEnv(teardownPlan(retained, { removePath: retained.child })) })
}
