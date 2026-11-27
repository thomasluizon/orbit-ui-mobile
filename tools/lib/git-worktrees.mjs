/**
 * What a worktree removal can take: the registered worktrees, from the one reader of `git worktree list --porcelain`,
 * and every repository or worktree with a `.git` entry under a directory; a bare repository is not found.
 * `git worktree remove` deletes each path that a `.gitignore` ignores, with all it holds. Also the git arguments of a
 * clean check and of a removal, and the listing of each change that `git status` cannot show.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"

import { runBounded } from "./bounded-process.mjs"

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

const CLONE_TIMEOUT_MS = 10 * 60 * 1000
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000

/** The directories that can hold a `node_modules`, relative to `root`: the root itself (an empty string) and each npm workspace that its `package.json` names. A pattern `<directory>/*` names each subdirectory. */
export const workspaceDirectories = (root) => {
  const declared = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces ?? []
  const patterns = Array.isArray(declared) ? declared : declared.packages ?? []
  const directories = [""]
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) { directories.push(pattern); continue }
    const parent = pattern.slice(0, -2)
    if (!existsSync(join(root, parent))) continue
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) if (entry.isDirectory()) directories.push(`${parent}/${entry.name}`)
  }
  return directories
}

const sameLock = (source, target) => {
  try { return readFileSync(join(source, "package-lock.json")).equals(readFileSync(join(target, "package-lock.json"))) } catch { return false }
}

/**
 * Gives a new worktree its dependencies before a worker starts. The worktree is a checkout of a branch, so it holds no `node_modules`.
 * When its `package-lock.json` equals the lock of `source` (the main checkout) and `source` has installed dependencies, each
 * `node_modules` of the root and of the workspaces is cloned with `cp -c -R` (APFS clonefile: copy-on-write, so the clone adds no
 * disk), and only macOS clones. Any other case runs `npm ci` once in `target`. A checkout with no lock file needs no install.
 * Never throws. Resolves `{ action, ms, directories, reason }`: `action` is `clone`, `install`, `failed` or `none`.
 */
export const installDependencies = async (source, target, { run = runBounded, platform = process.platform, now = () => Date.now() } = {}) => {
  const startedAt = now()
  const done = (action, directories = [], reason = null) => ({ action, ms: now() - startedAt, directories, reason })
  try {
    if (!existsSync(join(source, "package-lock.json")) || !existsSync(join(target, "package-lock.json"))) return done("none", [], "no lock file")
    let reason = null
    if (platform !== "darwin") reason = "this platform has no clonefile"
    else if (!existsSync(join(source, "node_modules"))) reason = "the main checkout has no node_modules"
    else if (!sameLock(source, target)) reason = "the lock file differs from the main checkout"
    if (reason === null) {
      const cloned = []
      for (const directory of workspaceDirectories(source)) {
        const from = join(source, directory, "node_modules")
        const to = join(target, directory, "node_modules")
        // A workspace that the new tree lacks, or a tree that already has dependencies, keeps what it has.
        if (!existsSync(from) || !existsSync(join(target, directory)) || existsSync(to)) continue
        const copied = await run("cp", ["-c", "-R", from, to], { timeoutMs: CLONE_TIMEOUT_MS })
        if (copied.status !== 0) {
          rmSync(to, { recursive: true, force: true })
          reason = `cp failed for ${directory || "the root"}: ${String(copied.stderr ?? "").trim()}`
          break
        }
        cloned.push(directory)
      }
      if (reason === null) return cloned.length > 0 ? done("clone", cloned) : done("none", [], "no node_modules to clone")
      for (const directory of cloned) rmSync(join(target, directory, "node_modules"), { recursive: true, force: true })
    }
    const installed = await run("npm", ["ci"], { cwd: target, timeoutMs: INSTALL_TIMEOUT_MS })
    return installed.status === 0 ? done("install", [""], reason) : done("failed", [], `npm ci exit ${installed.status}: ${String(installed.stderr ?? "").trim().split("\n").at(-1)}`)
  } catch (error) {
    return done("failed", [], error.message)
  }
}
