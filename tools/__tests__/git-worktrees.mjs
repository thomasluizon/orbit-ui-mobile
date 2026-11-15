import { spawnSync } from "node:child_process"
import { mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { parseWorktreeList } from "../lib/git-worktrees.mjs"
import { T, root } from "./_harness.mjs"

const same = (name, got, want) => T(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

/** A repository with one linked worktree of each kind that `git worktree list --porcelain` prints. */
const stageRepository = () => {
  const base = join(root, "git-worktrees")
  const primary = join(base, "repository")
  mkdirSync(primary, { recursive: true })
  const git = (args) => spawnSync("git", ["-C", primary, ...args], { encoding: "utf8" })
  writeFileSync(join(primary, "a.txt"), "a\n")
  for (const args of [["init", "-q", "--initial-branch=main"], ["add", "a.txt"], ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "base"],
    ["worktree", "add", "-q", "-b", "feature/plain", "../plain"], ["worktree", "add", "-q", "--detach", "../detached"], ["worktree", "add", "-q", "-b", "feature/locked", "../locked"],
    ["worktree", "lock", "--reason", "a reason with spaces", "../locked"], ["worktree", "add", "-q", "-b", "feature/moved", "../moved"]]) {
    if (git(args).status !== 0) return null
  }
  // A worktree directory that moved away without git leaves a prunable registration.
  renameSync(join(base, "moved"), join(base, "moved-away"))
  const listed = git(["worktree", "list", "--porcelain"])
  return listed.status === 0 ? { base: realpathSync(base), porcelain: listed.stdout } : null
}

export const cases = () => {
  const staged = stageRepository()
  T("git-worktrees: the git fixture stages", staged !== null)
  if (staged === null) return
  const path = (name) => join(staged.base, name)
  const want = [
    { path: path("repository"), branch: "main", locked: false, prunable: false },
    { path: path("detached"), branch: null, locked: false, prunable: false },
    { path: path("locked"), branch: "feature/locked", locked: true, prunable: false },
    { path: path("moved"), branch: "feature/moved", locked: false, prunable: true },
    { path: path("plain"), branch: "feature/plain", locked: false, prunable: false },
  ]
  const byPath = (records) => [records[0], ...records.slice(1).sort((left, right) => left.path.localeCompare(right.path))]
  same("git-worktrees: real git output gives each record its path, short branch, lock and prunable state, the primary checkout first", byPath(parseWorktreeList(staged.porcelain)), want)
  same("git-worktrees: a trimmed output gives the same records", byPath(parseWorktreeList(staged.porcelain.trim())), want)
  same("git-worktrees: CRLF line ends give the same records", byPath(parseWorktreeList(staged.porcelain.replaceAll("\n", "\r\n"))), want)
  same("git-worktrees: an empty output gives no record", parseWorktreeList(""), [])
}
