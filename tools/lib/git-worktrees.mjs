/** The one reader of `git worktree list --porcelain`, for every tool that lists, judges or removes worktrees. */

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
