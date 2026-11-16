import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, same, stage, stageRepo } from "./_harness.mjs"
import { commonGitDirectory, installWriteGuard, readOnlyPaths, recordedWrites, resultVerdict, snapshotWorktrees, writesBetween } from "../lib/review-run.mjs"

const UNIT = "lib/review-run.mjs"

const gitWith = (environment) => (directory, args) => spawnSync("git", ["-C", directory, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], {
  encoding: "utf8",
  env: { ...process.env, ...environment },
})

const verdictCases = () => {
  same(`${UNIT}: a clean review verdict is read`, resultVerdict("VERDICT: CLEAN\n\nHEAD: abc\n", "review"), "VERDICT: CLEAN")
  same(`${UNIT}: a review verdict with defects is read`, resultVerdict("VERDICT: DEFECTS (3)\r\nmore", "review"), "VERDICT: DEFECTS (3)")
  same(`${UNIT}: a passing proof is read`, resultVerdict("PROOF: PASS\n", "proof"), "PROOF: PASS")
  same(`${UNIT}: a failing proof is read`, resultVerdict("PROOF: FAIL (2 defects)\n", "proof"), "PROOF: FAIL (2 defects)")
  for (const [text, mode] of [
    ["PROOF: PASS", "review"],
    ["VERDICT: CLEAN", "proof"],
    ["The verdict is VERDICT: CLEAN", "review"],
    ["\nVERDICT: CLEAN", "review"],
    ["VERDICT: DEFECTS", "review"],
    ["", "proof"],
  ]) {
    same(`${UNIT}: ${JSON.stringify(text)} is no ${mode} verdict line`, resultVerdict(text, mode), null)
  }
}

const pathCases = () => {
  const order = stage("review-run/order.md", "Review the head.\n")
  const output = join(dirname(order), "result.md")
  const copy = dirname(stage("review-run/copy/file.txt", "a copy outside every repository\n"))
  const repository = stageRepo("review-run-paths")
  mkdirSync(join(repository.path, "nested"), { recursive: true })
  const outside = readOnlyPaths(order, output, copy, "review")
  T(`${UNIT}: a copy outside every repository is accepted and is no git worktree`, outside.runDirectory === realpathSync(copy) && outside.gitWorktree === false, JSON.stringify(outside))
  const worktreeRoot = readOnlyPaths(order, output, repository.path, "proof")
  T(`${UNIT}: a worktree root is accepted as a git run directory`, worktreeRoot.gitWorktree === true && worktreeRoot.orderFile === realpathSync(order), JSON.stringify(worktreeRoot))
  for (const [label, argv, pattern] of [
    ["a missing --directory", [order, output, null], /--directory is required for --review/],
    ["a directory inside a repository that is not its root", [order, output, join(repository.path, "nested")], /is inside a repository but is not a worktree root/],
    ["a run directory that does not exist", [order, output, join(copy, "absent")], /run directory not found/],
    ["an output that already exists", [order, order, copy], /review output must be a new file/],
    ["an order inside the run directory", [join(copy, "file.txt"), output, copy], /order lives inside the run directory/],
    ["an output inside the run directory", [order, join(copy, "result.md"), copy], /output lives inside the run directory/],
  ]) {
    let message = "accepted"
    try { readOnlyPaths(...argv, "review") } catch (error) { message = error.message }
    T(`${UNIT}: refuses ${label}`, pattern.test(message), message)
  }
}

/** The hooks reach the worker through environment configuration, so these cases run git exactly as a worker's shell would. */
const guardCases = () => {
  const guarded = stageRepo("review-run-guarded")
  const other = stageRepo("review-run-other")
  const plainGit = gitWith({})
  plainGit(guarded.path, ["worktree", "add", "-q", "--detach", join(dirname(guarded.path), "review-run-guarded-detached")])
  const linked = join(dirname(guarded.path), "review-run-guarded-detached")
  const otherHookRecord = join(dirname(other.path), "review-run-other-hook-ran")
  const otherHooks = dirname(stage("review-run/other-hooks/.keep", ""))
  writeFileSync(join(otherHooks, "pre-commit"), `#!/bin/sh\necho ran > '${otherHookRecord}'\n`)
  chmodSync(join(otherHooks, "pre-commit"), 0o755)
  plainGit(other.path, ["config", "core.hooksPath", otherHooks])

  const guard = installWriteGuard([commonGitDirectory(guarded.path)], dirname(stage("review-run/guard/.keep", "")), { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "*" })
  T(`${UNIT}: the guard appends its two entries after configuration the caller already set`,
    guard.environment.GIT_CONFIG_COUNT === "3" && guard.environment.GIT_CONFIG_KEY_1.startsWith("includeIf.") && guard.environment.GIT_CONFIG_KEY_0 === undefined,
    JSON.stringify(guard.environment))
  const git = gitWith({ GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "*", ...guard.environment })
  const head = plainGit(guarded.path, ["rev-parse", "HEAD"]).stdout.trim()

  const commit = git(guarded.path, ["commit", "-q", "--allow-empty", "-m", "a reviewer commit"])
  const linkedCommit = git(linked, ["commit", "-q", "--allow-empty", "-m", "a reviewer commit in a linked worktree"])
  const branch = git(guarded.path, ["branch", "reviewer-branch"])
  const push = git(guarded.path, ["push", "-q", "origin", "HEAD:refs/heads/reviewer-push"])
  const fetch = git(guarded.path, ["fetch", "-q", "origin"])
  const otherCommit = git(other.path, ["commit", "-q", "--allow-empty", "-m", "a commit in an unprotected fixture"])
  T(`${UNIT}: the guard refuses a commit, a linked-worktree commit, a branch and a push in the protected repository`,
    commit.status !== 0 && linkedCommit.status !== 0 && branch.status !== 0 && push.status !== 0 &&
      plainGit(guarded.path, ["rev-parse", "HEAD"]).stdout.trim() === head &&
      plainGit(guarded.path, ["ls-remote", "origin", "refs/heads/reviewer-push"]).stdout.trim() === "",
    JSON.stringify({ commit: commit.stderr, linkedCommit: linkedCommit.stderr, branch: branch.stderr, push: push.stderr }))
  T(`${UNIT}: a fetch that only reads still succeeds in the protected repository`, fetch.status === 0, fetch.stderr)
  T(`${UNIT}: an unprotected repository commits with its own hooks path`,
    otherCommit.status === 0 && spawnSync("test", ["-f", otherHookRecord]).status === 0, otherCommit.stderr)

  const writes = recordedWrites(guard.logFile)
  const kinds = writes.map((write) => write.kind)
  T(`${UNIT}: each refused write is recorded with its kind and directory`,
    kinds.filter((kind) => kind === "ref-update").length >= 2 && kinds.includes("new-branch") && kinds.includes("push") &&
      writes.some((write) => write.directory === realpathSync(linked)) && writes.every((write) => write.directory !== realpathSync(other.path)),
    JSON.stringify(writes))
  writeFileSync(guard.logFile, "not json\n")
  same(`${UNIT}: an unreadable guard record is itself reported as a write`, recordedWrites(guard.logFile).map((write) => write.kind), ["unreadable-guard-record"])
  same(`${UNIT}: a missing guard log reports no write`, recordedWrites(join(otherHooks, "absent.jsonl")), [])
}

const snapshotCases = () => {
  const repository = stageRepo("review-run-snapshot")
  const plainGit = gitWith({})
  writeFileSync(join(repository.path, "tracked.txt"), "first\n")
  writeFileSync(join(repository.path, "dirty.txt"), "committed\n")
  plainGit(repository.path, ["add", "--", "tracked.txt", "dirty.txt"])
  plainGit(repository.path, ["commit", "-q", "-m", "tracked files"])
  const held = join(dirname(repository.path), "review-run-snapshot-held")
  const run = join(dirname(repository.path), "review-run-snapshot-run")
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", held])
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", run])
  writeFileSync(join(repository.path, "dirty.txt"), "dirty before the run\n")
  const runDirectory = realpathSync(run)
  const isHeld = (path) => path === realpathSync(held)
  const before = snapshotWorktrees([repository.path, repository.path], isHeld)
  T(`${UNIT}: the snapshot holds each worktree once`, before.size === 3, JSON.stringify([...before.keys()]))
  same(`${UNIT}: an unchanged tree finds no write`, writesBetween(before, snapshotWorktrees([repository.path], isHeld), runDirectory), [])

  writeFileSync(join(repository.path, "untracked.txt"), "a build output\n")
  writeFileSync(join(held, "tracked.txt"), "another worker's edit\n")
  same(`${UNIT}: an untracked file and an edit in a held worktree are no write`, writesBetween(before, snapshotWorktrees([repository.path], isHeld), runDirectory), [])

  writeFileSync(join(repository.path, "dirty.txt"), "changed again during the run\n")
  writeFileSync(join(run, "tracked.txt"), "a reviewer edit\n")
  plainGit(run, ["commit", "-q", "--allow-empty", "-m", "a commit the hooks did not see"])
  const writes = writesBetween(before, snapshotWorktrees([repository.path], isHeld), runDirectory)
  same(`${UNIT}: a further edit of a dirty file, an edit and a commit in the run directory are writes`,
    writes.map(({ kind, directory, detail }) => [kind, directory, kind === "commit" ? detail.startsWith("HEAD ") : detail]),
    [["tracked-change", realpathSync(repository.path), "dirty.txt"], ["commit", runDirectory, true], ["tracked-change", runDirectory, "tracked.txt"]])
}

export const cases = () => {
  verdictCases()
  pathCases()
  guardCases()
  snapshotCases()
}
