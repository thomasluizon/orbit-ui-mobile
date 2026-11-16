/**
 * What a worktree removal can take: the registered worktrees, from the one reader of `git worktree list --porcelain`,
 * and every repository or worktree with a `.git` entry under a directory; a bare repository is not found.
 * `git worktree remove` deletes each path that a `.gitignore` ignores, with all it holds. Also the git arguments of a
 * clean check and of a removal, and the listing of each change that `git status` cannot show.
 */

import { spawnSync } from "node:child_process"
import { dirname } from "node:path"

/** A worktree with installed dependencies holds several hundred thousand files. */
const WALK_TIMEOUT_MS = 120_000

/**
 * `git status` arguments that turn off each setting that hides a change, whatever any config file says:
 * `status.showUntrackedFiles=no`, `core.excludesFile` or its default `$XDG_CONFIG_HOME/git/ignore` (an empty value names
 * no file and turns the default off), a `core.fsmonitor` that misses an edit, and `diff.ignoreSubmodules` or
 * `submodule.<name>.ignore`. No setting turns off an index flag or `info/exclude`: a clean check reads both below.
 */
export const CLEAN_STATUS_ARGUMENTS = ["-c", "core.excludesFile=", "-c", "core.fsmonitor=false", "status", "--porcelain", "--untracked-files=all",
  "--ignore-submodules=none"]

/**
 * `git ls-files` arguments that tag each tracked path and list each untracked path that no `.gitignore` of the tree
 * ignores. `--exclude-per-directory=.gitignore` without `--exclude-standard` reads no other exclude source: not
 * `core.excludesFile`, not its default and not `info/exclude`.
 */
export const HIDDEN_CHANGE_ARGUMENTS = ["ls-files", "-v", "--cached", "--others", "--exclude-per-directory=.gitignore"]

/**
 * The lines of a `HIDDEN_CHANGE_ARGUMENTS` listing whose change `git status` cannot show. With `-v`, git prints a
 * lowercase tag for an assume-unchanged path, which `core.ignoreStat` sets on each file git checks out or adds, and `S`
 * for a skip-worktree path; `git status` never compares either with the file. `?` is an untracked path that no
 * `.gitignore` ignores.
 */
export const hiddenChangesOf = (listing) => listing.split("\n").filter((line) => /^(?:[a-z]|S|\?) /.test(line))

/**
 * `git worktree remove` refuses a changed tree through its own `git status`, which reads the same settings. A `-c` setting
 * reaches that child git and wins over every config file, so the refusal sees each change that `CLEAN_STATUS_ARGUMENTS`
 * sees. It never sees a change that an index flag hides or a file that only `info/exclude` ignores: no setting turns those
 * off, so the caller checks them first.
 */
export const WORKTREE_REMOVE_ARGUMENTS = ["-c", "status.showUntrackedFiles=all", "-c", "core.excludesFile=", "-c", "core.fsmonitor=false", "worktree", "remove"]

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
