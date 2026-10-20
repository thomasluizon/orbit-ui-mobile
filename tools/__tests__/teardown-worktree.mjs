import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check as harnessCheck, orcaEnv, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "teardown-worktree.mjs"
const BRANCH = "feature/orb-124-teardown"
const JUNCTION_SENTINEL = "the junction target must survive teardown\n"
const LOCKED_SENTINEL = "a locked worktree must survive teardown\n"
let stagedToolPath
let stagedConfigPath
const check = (file, name, argv, expect, options = {}) => harnessCheck(file, name, [...argv, "--repo", "ui"], expect, { ...options, path: stagedToolPath })

/** A linked child checkout is the smallest real Git fixture that can prove teardown verification. */
const stageTeardownWorktree = (label, { ticketNumber = 124, base = "main", dirty = false, changed = false, squashMerged = false, fastForwardMerged = false, localFollowUp = false, followUpBeforeMerge = false, localMerge = null, laterCleanMerge = false, contractSwitch = false, linkedDependency = false, lockReason } = {}) => {
  const primary = join(root, "teardown", label, "primary")
  const hasTicketName = !["no-ticket-name", "unlinked-refusal"].includes(label)
  const child = join(root, "teardown", label, hasTicketName ? `ticket-${ticketNumber}-${label}` : "child")
  const remote = join(root, "teardown", label, "remote.git")
  mkdirSync(primary, { recursive: true })
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (git(primary, ["init", "-q", "--bare", remote]).status !== 0) return null
  const initialBranch = contractSwitch ? "orca/ticket-124-teardown" : BRANCH
  for (const args of [["init", "-q", `--initial-branch=${base}`], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"]]) {
    if (git(primary, args).status !== 0) return null
  }
  writeFileSync(join(primary, ".gitignore"), "node_modules/\n")
  for (const args of [["add", ".gitignore"], ["commit", "-q", "-m", "base"], ["remote", "add", "origin", remote], ["push", "-q", "-u", "origin", base], ["worktree", "add", "-q", "-b", initialBranch, child]]) {
    if (git(primary, args).status !== 0) return null
  }
  if (contractSwitch && git(child, ["switch", "-q", "-c", BRANCH]).status !== 0) return null
  if (lockReason !== undefined) {
    /** node_modules is gitignored, so this file is invisible to every work-loss check the tool runs.
     * That is the point: a lock is the only thing protecting it, and teardown must honour it. */
    mkdirSync(join(child, "node_modules"), { recursive: true })
    writeFileSync(join(child, "node_modules", "locked-sentinel.txt"), LOCKED_SENTINEL)
    const lockArgs = lockReason === null
      ? ["worktree", "lock", child]
      : ["worktree", "lock", "--reason", lockReason, child]
    if (git(primary, lockArgs).status !== 0) return null
  }
  if (linkedDependency) {
    /** The sentinel is read back after teardown. Asserting only that the target DIRECTORY survives
     * passes even when removal follows the junction and empties it, which is the failure that
     * matters: the target is the primary checkout. */
    writeFileSync(join(primary, "junction-sentinel.txt"), JUNCTION_SENTINEL)
    const dependencyDirectory = join(child, "node_modules", "@orbit")
    mkdirSync(dependencyDirectory, { recursive: true })
    symlinkSync(primary, join(dependencyDirectory, "web"), "junction")
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
    if ((squashMerged || fastForwardMerged) && git(primary, ["push", "-q", "origin", base]).status !== 0) return null
  }
  const headCommit = git(child, ["rev-parse", "HEAD"]).stdout.trim()
  let followUpCommit
  const addFollowUp = () => {
    writeFileSync(join(child, "follow-up.txt"), "must not be removed\n")
    if (git(child, ["add", "follow-up.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "local follow-up"]).status !== 0) return false
    followUpCommit = git(child, ["rev-parse", "HEAD"]).stdout.trim()
    return true
  }
  if (localFollowUp && followUpBeforeMerge && !addFollowUp()) return null
  let resolvedMergeCommit
  if (localMerge) {
    const baseFile = localMerge === "resolved" ? "captured.txt" : "base-only.txt"
    writeFileSync(join(primary, baseFile), "base update\n")
    if (git(primary, ["add", baseFile]).status !== 0 || git(primary, ["commit", "-q", "-m", "base update"]).status !== 0) return null
    if (git(primary, ["push", "-q", "origin", base]).status !== 0) return null
    if (git(child, ["fetch", "-q", "origin", base]).status !== 0) return null
    const merge = git(child, ["merge", "--no-edit", `origin/${base}`])
    if (localMerge === "clean" && merge.status !== 0) return null
    if (localMerge === "resolved") {
      if (merge.status === 0) return null
      writeFileSync(join(child, "captured.txt"), "hand-resolved content\n")
      if (git(child, ["add", "captured.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "resolve base merge"]).status !== 0) return null
      resolvedMergeCommit = git(child, ["rev-parse", "HEAD"]).stdout.trim()
    }
  }
  if (laterCleanMerge) {
    writeFileSync(join(primary, "later-base.txt"), "later base update\n")
    if (git(primary, ["add", "later-base.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "later base update"]).status !== 0) return null
    if (git(primary, ["push", "-q", "origin", base]).status !== 0 || git(child, ["fetch", "-q", "origin", base]).status !== 0) return null
    if (git(child, ["merge", "--no-edit", `origin/${base}`]).status !== 0) return null
  }
  if (localFollowUp && !followUpBeforeMerge && !addFollowUp()) return null
  if (dirty) writeFileSync(join(child, "dirty.txt"), "uncommitted\n")
  return { primary, child, headCommit, followUpCommit, resolvedMergeCommit, baseRefName: base, mergeCommit: mergeCommit ?? git(primary, ["rev-parse", "HEAD"]).stdout.trim() }
}

const mergedPullRequest = (fixture) => ({ number: 124, mergedAt: "2026-07-28T12:00:00Z", mergeCommit: { oid: fixture.mergeCommit }, headRefOid: fixture.headCommit, baseRefName: fixture.baseRefName })

const pointConfigAt = (fixture) => {
  const config = realOrchestratorConfig()
  config.repos.ui = fixture.primary
  writeFileSync(stagedConfigPath, `${JSON.stringify(config, null, 2)}\n`)
}

const teardownPlan = (fixture, { pullRequests = [mergedPullRequest(fixture)], pullRequestOutput, pullRequestExit = 0 } = {}) => {
  pointConfigAt(fixture)
  return [
  { match: `pr list --head ${BRANCH}`, stdout: pullRequestOutput ?? JSON.stringify(pullRequests), exit: pullRequestExit },
  ]
}

const gitInterleaveEnv = (environment, mode, target) => {
  const preload = stage(
    `teardown/git-interleave-${mode}.cjs`,
    `const childProcess = require("node:child_process")
const { existsSync, mkdirSync, renameSync, writeFileSync } = require("node:fs")
const { resolve } = require("node:path")
const { syncBuiltinESMExports } = require("node:module")

const originalSpawnSync = childProcess.spawnSync
const target = process.env.ORBIT_GIT_INTERLEAVE_TARGET
const normalize = (value) => resolve(value).replaceAll("\\\\", "/").toLowerCase()
childProcess.spawnSync = (command, args, options) => {
  const worktreeIndex = args.indexOf("worktree")
  const removesTarget = worktreeIndex !== -1
    && args[worktreeIndex + 1] === "remove"
    && normalize(args.at(-1)) === normalize(target)
  if (!removesTarget) return originalSpawnSync(command, args, options)

  if (process.env.ORBIT_GIT_INTERLEAVE_MODE === "fail-after-deregister") {
    const heldPath = target + ".held-for-failed-remove"
    renameSync(target, heldPath)
    const result = originalSpawnSync(command, args, options)
    renameSync(heldPath, target)
    if (result.status !== 0) return result
    return { ...result, status: 9, stderr: "simulated failure after Git deregistered the worktree\\n" }
  }

  const result = originalSpawnSync(command, args, options)
  if (result.status === 0 && process.env.ORBIT_GIT_INTERLEAVE_MODE === "recreate-after-success") {
    if (existsSync(target)) throw new Error("Git unexpectedly left the regular fixture path behind")
    mkdirSync(target, { recursive: true })
    writeFileSync(target + "/recreated-sentinel.txt", "recreated content must survive teardown\\n")
  }
  return result
}
syncBuiltinESMExports()
`,
  )
  return {
    ...environment,
    NODE_OPTIONS: `${environment.NODE_OPTIONS} --require "${preload.replaceAll("\\", "/")}"`,
    ORBIT_GIT_INTERLEAVE_MODE: mode,
    ORBIT_GIT_INTERLEAVE_TARGET: target,
  }
}

export const cases = () => {
  const config = realOrchestratorConfig()
  T(`${TOOL}: shipped standing tickets are 556 and 746`, JSON.stringify(config.tickets.standing) === JSON.stringify([556, 746]))
  const staged = stageWithConfig("teardown-worktree", TOOL, config)
  stagedToolPath = staged.path
  stagedConfigPath = staged.configPath
  stage(
    "staged/teardown-worktree/tools/lib/github-issues.mjs",
    `export const resolveTicket = (reference) => {
  const value = String(reference).toUpperCase()
  if (value === "ORB-124") return { identifier: "ORB-124", number: 124 }
  if (value === "#556" || value === "556") return { identifier: null, number: 556 }
  if (value === "#746" || value === "746") return { identifier: null, number: 746 }
  if (value === "#9001" || value === "9001") return { identifier: null, number: 9001 }
  throw new Error("Unknown migrated ticket " + reference)
}
export const readTicket = async (number) => ({
  identifier: number === 124 ? "ORB-124" : null,
  number,
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
  const absent = stageTeardownWorktree("no-ticket-name")
  pointConfigAt(absent)
  check(TOOL, "refuses an issue with no matching worktree name", ["--issue", "ORB-124"], { status: 1, stderr: /no active Git worktree name matches ticket 124/ }, { env: orcaEnv([]) })

  const unreadableGitState = stageTeardownWorktree("unreadable-git-state")
  pointConfigAt(unreadableGitState)
  const malformedGitConfig = stage("teardown/unreadable-git-state/malformed.gitconfig", "[broken\n")
  check(
    TOOL,
    "an unreadable Git worktree state is exit 3, never an absent worktree",
    ["--issue", "ORB-124"],
    { status: 3, stderr: /git worktree list --porcelain failed/ },
    { env: { ...orcaEnv([]), GIT_CONFIG_GLOBAL: malformedGitConfig } },
  )

  const allGood = stageTeardownWorktree("all-good", { changed: true, fastForwardMerged: true, linkedDependency: true })
  if (!allGood) {
    T(`${TOOL}: real git fixture is available`, false, "could not create a linked Git worktree")
    return
  }

  const switched = stageTeardownWorktree("ticket-124-contract-switch", { changed: true, fastForwardMerged: true, contractSwitch: true })
  pointConfigAt(switched)
  const switchedResult = check(
    TOOL,
    "an issue selector finds and removes a worktree after the contract branch switch",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree[\s\S]*RETAINED local branch/ },
    { env: orcaEnv(teardownPlan(switched)) },
  )
  T(`${TOOL}: contract-switch removal actually deleted the fixture`, !existsSync(switched.child), switchedResult.stderr)

  const redesign = stageTeardownWorktree("redesign-base", { base: "redesign/main", changed: true, squashMerged: true, contractSwitch: true })
  const redesignResult = check(
    TOOL,
    "without --base a branch merged into redesign/main is removed",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree/ },
    { env: orcaEnv([
      { match: `pr list --head ${BRANCH} --base main`, stdout: "[]" },
      ...teardownPlan(redesign),
    ]) },
  )
  T(`${TOOL}: redesign-base removal actually deleted the fixture`, !existsSync(redesign.child), redesignResult.stderr)

  const primaryRefusal = stageTeardownWorktree("primary-refusal")
  pointConfigAt(primaryRefusal)
  check(
    TOOL,
    "refuses a primary checkout",
    ["--worktree", `path:${primaryRefusal.primary}`],
    { status: 1, stderr: /refusing to remove a primary checkout/ },
    { env: orcaEnv([]) },
  )
  const unlinked = stageTeardownWorktree("unlinked-refusal")
  pointConfigAt(unlinked)
  check(
    TOOL,
    "refuses a worktree whose name has no ticket number",
    ["--worktree", `path:${unlinked.child}`],
    { status: 1, stderr: /directory name has no ticket-<number>/ },
    { env: orcaEnv([]) },
  )
  check(
    TOOL,
    "refuses a path selector matching no active worktree",
    ["--worktree", `path:${join(root, "teardown", "never-existed")}`],
    { status: 1, stderr: /no active Git worktree matches/ },
    { env: orcaEnv([]) },
  )

  const unmerged = stageTeardownWorktree("unmerged", { changed: true })
  check(TOOL, "a branch with no merged pull request is refused", ["--issue", "ORB-124"], { status: 1, stderr: /no merged pull request with merge and head commits was found for feature\/orb-124-teardown/ }, { env: orcaEnv(teardownPlan(unmerged, { pullRequests: [], removePath: unmerged.child })) })
  T(`${TOOL}: the unmerged refusal leaves the tree in place`, existsSync(unmerged.child), "the unmerged fixture was removed")

  const standingOpen = stageTeardownWorktree("standing-open", { ticketNumber: 746, changed: true })
  check(TOOL, "a standing ticket with an open pull request is refused", ["--issue", "#746"], { status: 1, stderr: /no merged pull request with merge and head commits was found/ }, { env: { ...orcaEnv(teardownPlan(standingOpen, { pullRequests: [] })), ORBIT_TICKET_STATUS: "In Progress", ORBIT_TICKET_STATE: "OPEN" } })
  T(`${TOOL}: an open standing pull request leaves the tree in place`, existsSync(standingOpen.child))

  const ordinaryOpen = stageTeardownWorktree("ordinary-open", { ticketNumber: 9001, changed: true, fastForwardMerged: true })
  check(TOOL, "an ordinary open ticket with a merged pull request is refused", ["--issue", "#9001"], { status: 1, stderr: /UNMET ticket-done: ticket is OPEN with board status In Progress/ }, { env: { ...orcaEnv(teardownPlan(ordinaryOpen)), ORBIT_TICKET_STATUS: "In Progress", ORBIT_TICKET_STATE: "OPEN" } })
  T(`${TOOL}: an ordinary open ticket leaves the tree in place`, existsSync(ordinaryOpen.child))

  const standingMerged = stageTeardownWorktree("standing-merged", { ticketNumber: 556, changed: true, fastForwardMerged: true })
  check(TOOL, "a standing ticket with a merged pull request is removed", ["--issue", "#556"], { status: 0, stdout: /REMOVED worktree[\s\S]*RETAINED local branch/ }, { env: { ...orcaEnv(teardownPlan(standingMerged)), ORBIT_TICKET_STATUS: "In Progress", ORBIT_TICKET_STATE: "OPEN" } })
  T(`${TOOL}: a merged standing pull request deletes the fixture`, !existsSync(standingMerged.child))

  const standingMissingTarget = stageTeardownWorktree("standing-missing-target", { ticketNumber: 746, changed: true })
  check(TOOL, "a standing ticket whose merge commit is absent from the target is refused", ["--issue", "#746"], { status: 1, stderr: /UNMET merge-commit-in-target:[\s\S]*UNMET ticket-done:/ }, { env: { ...orcaEnv(teardownPlan(standingMissingTarget, { pullRequests: [{ ...mergedPullRequest(standingMissingTarget), mergeCommit: { oid: standingMissingTarget.headCommit } }] })), ORBIT_TICKET_STATUS: "In Progress", ORBIT_TICKET_STATE: "OPEN" } })
  T(`${TOOL}: a standing ticket without a merge in target leaves the tree in place`, existsSync(standingMissingTarget.child))

  const lookupFailure = stageTeardownWorktree("lookup-failure", { changed: true })
  check(TOOL, "a failed pull-request lookup is exit 3, never an absence of evidence", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown failed/ }, { env: orcaEnv(teardownPlan(lookupFailure, { pullRequestOutput: "", pullRequestExit: 1, removePath: lookupFailure.child })) })
  const malformed = stageTeardownWorktree("malformed-payload", { changed: true })
  check(TOOL, "an unparseable pull-request payload is exit 3", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown failed/ }, { env: orcaEnv(teardownPlan(malformed, { pullRequestOutput: "not-json", removePath: malformed.child })) })

  const unreadable = stageTeardownWorktree("unreadable-merge-commit", { changed: true, fastForwardMerged: true })
  check(TOOL, "an unreadable merge commit fails as unreadable, not as work loss", ["--issue", "ORB-124"], { status: 3, stderr: /could not read commit 0{39}1/ }, { env: orcaEnv(teardownPlan(unreadable, { pullRequests: [{ ...mergedPullRequest(unreadable), mergeCommit: { oid: "0000000000000000000000000000000000000001" } }] })) })

  const missingTarget = stageTeardownWorktree("missing-target", { changed: true })
  check(TOOL, "a merge commit absent from the target branch is refused", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET merge-commit-in-target: pull request #124 merge commit .* is not an ancestor of origin\/main/ }, { env: orcaEnv(teardownPlan(missingTarget, { pullRequests: [{ ...mergedPullRequest(missingTarget), mergeCommit: { oid: missingTarget.headCommit } }], removePath: missingTarget.child })) })
  T(`${TOOL}: the merge-commit refusal leaves the tree in place`, existsSync(missingTarget.child), "the unmerged fixture was removed")

  const followUp = stageTeardownWorktree("local-follow-up", { changed: true, squashMerged: true, localFollowUp: true, followUpBeforeMerge: true, localMerge: "clean" })
  check(TOOL, "a local commit absent from the pull request head is refused as work loss", ["--issue", "ORB-124"], { status: 1, stderr: new RegExp(`UNMET local-tip-in-pull-request-head: .*unsafe commit ${followUp.followUpCommit}`) }, { env: orcaEnv(teardownPlan(followUp, { removePath: followUp.child })) })
  T(`${TOOL}: unpushed commit leaves the tree in place`, existsSync(followUp.child))

  const cleanMerge = stageTeardownWorktree("clean-local-merge", { changed: true, squashMerged: true, localMerge: "clean" })
  const cleanMergeCommit = spawnSync("git", ["-C", cleanMerge.child, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
  const cleanDiff = spawnSync("git", ["-C", cleanMerge.child, "show", "--remerge-diff", "--format=", cleanMergeCommit], { encoding: "utf8" })
  T(`${TOOL}: clean merge fixture has an empty remerge diff`, cleanDiff.status === 0 && cleanDiff.stdout === "", cleanDiff.stderr || cleanDiff.stdout)
  const cleanRemoved = check(TOOL, "a clean local merge of base is removed and verified", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree[\s\S]*RETAINED local branch feature\/orb-124-teardown/ }, { env: orcaEnv(teardownPlan(cleanMerge)) })
  T(`${TOOL}: clean merge removal deleted the fixture`, !existsSync(cleanMerge.child), cleanRemoved.stderr)

  const resolvedMerge = stageTeardownWorktree("resolved-local-merge", { changed: true, squashMerged: true, localMerge: "resolved", laterCleanMerge: true })
  const resolvedDiff = spawnSync("git", ["-C", resolvedMerge.child, "show", "--remerge-diff", "--format=", resolvedMerge.resolvedMergeCommit], { encoding: "utf8" })
  T(`${TOOL}: resolved merge fixture has a nonempty remerge diff`, resolvedDiff.status === 0 && resolvedDiff.stdout !== "", resolvedDiff.stderr)
  check(TOOL, "a merge with conflict resolution content is refused as work loss", ["--issue", "ORB-124"], { status: 1, stderr: new RegExp(`UNMET local-tip-in-pull-request-head: .*unsafe commit ${resolvedMerge.resolvedMergeCommit}`) }, { env: orcaEnv(teardownPlan(resolvedMerge, { removePath: resolvedMerge.child })) })
  T(`${TOOL}: resolved merge leaves the tree in place`, existsSync(resolvedMerge.child))

  const dirty = stageTeardownWorktree("dirty", { changed: true, fastForwardMerged: true, dirty: true })
  check(TOOL, "a dirty worktree is refused as work loss", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt/ }, { env: orcaEnv(teardownPlan(dirty)) })
  T(`${TOOL}: the dirty refusal leaves the tree in place`, existsSync(dirty.child), "the dirty fixture was removed")

  const failedAfterDeregister = stageTeardownWorktree("failed-after-deregister", { changed: true, fastForwardMerged: true })
  const failedAfterDeregisterResult = check(
    TOOL,
    "a failed remove that already deregistered the worktree completes residue cleanup",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree/ },
    { env: gitInterleaveEnv(orcaEnv(teardownPlan(failedAfterDeregister)), "fail-after-deregister", failedAfterDeregister.child) },
  )
  T(
    `${TOOL}: post-deregistration failure residue is actually removed`,
    !existsSync(failedAfterDeregister.child),
    failedAfterDeregisterResult.stderr,
  )

  const recreatedAfterSuccess = stageTeardownWorktree("recreated-after-success", { changed: true, fastForwardMerged: true })
  const recreatedAfterSuccessResult = check(
    TOOL,
    "a path recreated after Git succeeds is refused rather than deleted",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /was replaced during teardown; its files were NOT removed/ },
    { env: gitInterleaveEnv(orcaEnv(teardownPlan(recreatedAfterSuccess)), "recreate-after-success", recreatedAfterSuccess.child) },
  )
  const recreatedSentinel = (() => {
    try {
      return readFileSync(join(recreatedAfterSuccess.child, "recreated-sentinel.txt"), "utf8")
    } catch (error) {
      return `unreadable: ${error.code}`
    }
  })()
  T(
    `${TOOL}: the recreated path and its contents remain in place`,
    recreatedSentinel === "recreated content must survive teardown\n",
    `${recreatedAfterSuccessResult.stderr}\nrecreated sentinel: ${recreatedSentinel}`,
  )

  const lockedTree = stageTeardownWorktree("ticket-124-locked", { changed: true, fastForwardMerged: true, lockReason: "probe" })
  const lockedRemovalProbe = spawnSync("git", ["-C", lockedTree.primary, "worktree", "remove", lockedTree.child], { encoding: "utf8" })
  const lockedTrace = stage("teardown/ticket-124-locked/git-trace.log", "")
  check(TOOL, "a LOCKED worktree is refused before anything is deleted", ["--issue", "ORB-124"], { status: 1, stderr: /is LOCKED \(probe\); git refuses to remove or prune a locked worktree, and nothing was touched/ }, { env: { ...orcaEnv(teardownPlan(lockedTree)), GIT_TRACE: lockedTrace } })
  const lockedSentinel = (() => {
    try {
      return readFileSync(join(lockedTree.child, "node_modules", "locked-sentinel.txt"), "utf8")
    } catch (error) {
      return `unreadable: ${error.code}`
    }
  })()
  T(`${TOOL}: the lock refusal leaves the worktree and its ignored files intact`, lockedSentinel === LOCKED_SENTINEL, `a locked worktree lost its ignored files: ${lockedSentinel}`)
  const lockedTraceOutput = readFileSync(lockedTrace, "utf8").replaceAll("\\", "/").toLowerCase()
  T(
    `${TOOL}: the lock refusal comes from Git's own exit 128`,
    lockedRemovalProbe.status === 128
      && /fatal: cannot remove a locked working tree, lock reason: probe/.test(lockedRemovalProbe.stderr)
      && lockedTraceOutput.includes("built-in: git worktree remove")
      && lockedTraceOutput.includes(lockedTree.child.replaceAll("\\", "/").toLowerCase()),
    `probe exit=${lockedRemovalProbe.status}; tool trace=${lockedTraceOutput || "empty"}`,
  )

  const reasonlessLockedTree = stageTeardownWorktree("ticket-124-reasonless-lock", { changed: true, fastForwardMerged: true, lockReason: null })
  check(
    TOOL,
    "a reasonless lock is reported as LOCKED with no reason given",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /is LOCKED \(no reason given\); git refuses to remove or prune a locked worktree, and nothing was touched/ },
    { env: orcaEnv(teardownPlan(reasonlessLockedTree)) },
  )

  const notDone = stageTeardownWorktree("not-done", { changed: true, fastForwardMerged: true, dirty: true })
  check(TOOL, "every independent refusal is reported in one pass", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt[\s\S]*UNMET ticket-done: ticket is OPEN with board status In Review, expected CLOSED and Done/ }, { env: { ...orcaEnv(teardownPlan(notDone, { state: "In Review", removePath: notDone.child })), ORBIT_TICKET_STATUS: "In Review", ORBIT_TICKET_STATE: "OPEN" } })

  const successfulRemovalTrace = stage("teardown/all-good/git-trace.log", "")
  const removed = check(TOOL, "a merged, clean, Done worktree is removed and verified", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree[\s\S]*RETAINED local branch feature\/orb-124-teardown/ }, { env: { ...orcaEnv(teardownPlan(allGood)), GIT_TRACE: successfulRemovalTrace } })
  T(`${TOOL}: verified removal actually deleted the fixture`, !existsSync(allGood.child), removed.stderr)
  const successfulTraceOutput = readFileSync(successfulRemovalTrace, "utf8").replaceAll("\\", "/").toLowerCase()
  T(
    `${TOOL}: Git owns the successful registration removal before residue cleanup`,
    successfulTraceOutput.includes("built-in: git worktree remove")
      && successfulTraceOutput.includes(allGood.child.replaceAll("\\", "/").toLowerCase()),
    successfulTraceOutput || "the Git trace was empty",
  )
  const junctionSentinel = (() => {
    try {
      return readFileSync(join(allGood.primary, "junction-sentinel.txt"), "utf8")
    } catch (error) {
      return `unreadable: ${error.code}`
    }
  })()
  T(`${TOOL}: removing a linked dependency preserves its target`, junctionSentinel === JUNCTION_SENTINEL, `the linked dependency target was emptied or removed: ${junctionSentinel}`)

  const selector = stageTeardownWorktree("selector", { changed: true, squashMerged: true })
  check(TOOL, "a path selector accepts a squash-merged tree without ancestry", ["--worktree", `path:${selector.child}`], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(selector, { removePath: selector.child })) })

}
