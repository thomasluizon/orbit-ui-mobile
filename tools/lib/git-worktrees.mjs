/**
 * What a worktree removal can take: the registered worktrees, from the one reader of `git worktree list --porcelain`,
 * and every repository or worktree with a `.git` entry under a directory; a bare repository is not found.
 * `git worktree remove` deletes an ignored directory with all it holds. Also the git arguments of a clean check and of
 * a removal that see every untracked file, whatever the git config says.
 */

import { spawnSync } from "node:child_process"
import { dirname } from "node:path"

/** A worktree with installed dependencies holds several hundred thousand files. */
const WALK_TIMEOUT_MS = 120_000

/**
 * `git status` arguments that list every change, whatever local, global or system config says: `status.showUntrackedFiles=no`
 * hides each untracked file, and `diff.ignoreSubmodules` or `submodule.<name>.ignore` hides a submodule change.
 */
export const CLEAN_STATUS_ARGUMENTS = ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"]

/**
 * `git worktree remove` refuses a changed tree through its own `git status`, which reads `status.showUntrackedFiles` too.
 * A `-c` setting reaches that child git and wins over every config file, so the refusal sees each untracked file.
 */
export const WORKTREE_REMOVE_ARGUMENTS = ["-c", "status.showUntrackedFiles=all", "worktree", "remove"]

/**
 * `{ path, branch, locked, prunable }` for each record of `git worktree list --porcelain`, the primary checkout first.
 * A record is one `worktree <path>` line and its attribute lines, and an empty line ends it: `HEAD <commit>`,
 * `branch refs/heads/<name>` or `detached`, `locked [<reason>]`, `prunable [<reason>]`. `branch` is the short name,
 * null for a detached HEAD or a bare repository.
 */
export const parseWorktreeList = (porcelain) => porcelain.split(/\r?\n(?:\r?\n)+/).filter((record) => record.trim() !== "").map((record) => {
  const fields = new Map(record.split(/\r?\n/).map((line) => {
    const separator = line.indexOf(" ")
    return separator === -1 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)]
  }))
  return { path: fields.get("worktree"), branch: fields.get("branch")?.replace(/^refs\/heads\//, "") ?? null, locked: fields.has("locked"), prunable: fields.has("prunable") }
})

/**
 * The directory of each `.git` entry under `path`, the path itself included; null when the walk fails or runs out of time.
 * A bare repository has no `.git` entry, so it is not found. A symbolic link is never followed, as neither `rm` nor
 * `git worktree remove` follows one.
 */
export const findRepositories = (path) => {
  const result = spawnSync("find", [path, "-name", ".git", "-print0", "-prune"], { encoding: "utf8", timeout: WALK_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })
  return result.status === 0 ? result.stdout.split("\0").filter(Boolean).map((entry) => dirname(entry)) : null
}
