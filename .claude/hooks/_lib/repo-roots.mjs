// Repository-root resolution shared by the session hooks.
// Pure and filesystem-only: a PreToolUse hook runs on every tool call, so it must never
// spawn a subprocess, and it must never carry a machine-specific path (the Orca workspaces
// directory is nowhere in here). Every function fails CLOSED: an unreadable or unrecognised
// `.git` returns null, and the caller then applies its normal, non-exempt behaviour.

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, posix, resolve, win32 } from "node:path"

const WINDOWS_PATH = /^(?:[a-z]:[\\/]|\\\\)/i
const GITDIR_LINE = /^gitdir:[ \t]*(.+?)[ \t]*$/m
const WORKTREE_SEGMENT = "/.git/worktrees/"

/** Is `target` inside `repoRoot`? Windows and POSIX roots never match each other. */
export function withinRoot(target, repoRoot) {
  if (typeof target !== "string" || typeof repoRoot !== "string" || !target || !repoRoot) return false
  const rootIsWindows = WINDOWS_PATH.test(repoRoot)
  if (rootIsWindows !== WINDOWS_PATH.test(target)) return false
  const pathApi = rootIsWindows ? win32 : posix
  const relation = pathApi.relative(pathApi.normalize(repoRoot), pathApi.normalize(target))
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relation))
}

/**
 * The repository owning a path, as `{ root, linked }`, or null when there is none.
 *
 * A linked worktree's root carries a `.git` FILE whose single `gitdir:` line points into
 * <main-root>/.git/worktrees/<name>, while an ordinary checkout carries a `.git` DIRECTORY.
 * `linked` is what separates a worker's worktree from the main checkout an orchestrating
 * session sits in, which is the discrimination both callers need.
 */
export function owningRepository(startPath) {
  if (typeof startPath !== "string" || !startPath) return null
  let current = resolve(startPath)
  let previous = ""
  while (current !== previous) {
    const marker = join(current, ".git")
    if (existsSync(marker)) {
      try {
        if (statSync(marker).isDirectory()) return { root: current, linked: false }
        const gitdir = GITDIR_LINE.exec(readFileSync(marker, "utf8"))
        if (!gitdir) return null
        const segments = gitdir[1].replace(/\\/g, "/").split(WORKTREE_SEGMENT)
        return segments.length === 2 && segments[0] ? { root: segments[0], linked: true } : null
      } catch {
        return null
      }
    }
    previous = current
    current = dirname(current)
  }
  return null
}

/** The hook's own repository plus every absolute path in orchestrator.json's `repos` map. */
export function declaredRepoRoots(hookRepoRoot) {
  try {
    const config = JSON.parse(readFileSync(resolve(hookRepoRoot, ".claude", "orchestrator.json"), "utf8"))
    const configured = Object.values(config?.repos ?? {}).filter(
      (repoPath) => typeof repoPath === "string" && (win32.isAbsolute(repoPath) || posix.isAbsolute(repoPath)),
    )
    return [hookRepoRoot, ...configured]
  } catch {
    return [hookRepoRoot]
  }
}

/** Does `path` sit inside a declared root, directly or through a linked worktree of one? */
export function belongsToDeclaredRepo(path, repoRoots) {
  if (repoRoots.some((repoRoot) => withinRoot(path, repoRoot))) return true
  const owner = owningRepository(path)
  return owner === null ? false : repoRoots.some((repoRoot) => withinRoot(owner.root, repoRoot))
}

/** Is `path` inside a LINKED worktree of a declared root? The main checkout is not one. */
export function insideLinkedWorktree(path, repoRoots) {
  const owner = owningRepository(path)
  return owner !== null && owner.linked && repoRoots.some((repoRoot) => withinRoot(owner.root, repoRoot))
}
