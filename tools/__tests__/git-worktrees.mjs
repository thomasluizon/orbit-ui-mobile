import { spawnSync } from "node:child_process"
import { appendFileSync, mkdirSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { CLEAN_STATUS_ARGUMENTS, HIDDEN_CHANGE_ARGUMENTS, findRepositories, hiddenChangesOf, parseWorktreeList } from "../lib/git-worktrees.mjs"
import { T, root, same } from "./_harness.mjs"

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

/** A repository, a linked worktree's `.git` file, a link to a repository and a `.git` directory that holds another one. */
const walkCases = () => {
  const base = join(root, "git-worktrees-walk")
  for (const directory of ["repository", "linked", "plain/deeper", "repository/.git/modules/inner/.git"]) mkdirSync(join(base, directory), { recursive: true })
  writeFileSync(join(base, "linked", ".git"), "gitdir: /elsewhere\n")
  symlinkSync(join(base, "repository"), join(base, "plain", "link"), "dir")
  same("git-worktrees: the walk finds each .git directory and file, and never follows a link or enters a .git directory",
    findRepositories(base)?.sort(), [join(base, "linked"), join(base, "repository")])
  same("git-worktrees: a walk of a missing path is null, never an empty list", findRepositories(join(base, "missing")), null)
}

/**
 * Each source that hides a change from `git status`: an index flag on a tracked file, `core.excludesFile`, its default
 * `$XDG_CONFIG_HOME/git/ignore`, and `info/exclude`. Only a `.gitignore` of the tree may hide a path.
 */
const hiddenChangeCases = () => {
  const base = join(root, "git-worktrees-hidden")
  const repository = join(base, "repository")
  mkdirSync(join(base, "xdg", "git"), { recursive: true })
  mkdirSync(repository, { recursive: true })
  writeFileSync(join(base, "personal.gitignore"), "personal/\n")
  writeFileSync(join(base, "xdg", "git", "ignore"), "default/\n")
  writeFileSync(join(base, "empty.gitconfig"), "")
  writeFileSync(join(base, "personal.gitconfig"), `[core]\n\texcludesFile = ${join(base, "personal.gitignore")}\n`)
  const git = (args, globalConfig = join(base, "empty.gitconfig")) => spawnSync("git", ["-C", repository, ...args],
    { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, XDG_CONFIG_HOME: join(base, "xdg") } })
  for (const name of ["plain.txt", "assumed.txt", "skipped.txt"]) writeFileSync(join(repository, name), `${name}\n`)
  writeFileSync(join(repository, ".gitignore"), "ignored/\n")
  const staged = [["init", "-q", "--initial-branch=main"], ["add", "."], ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "base"],
    ["update-index", "--assume-unchanged", "assumed.txt"], ["update-index", "--skip-worktree", "skipped.txt"]].every((args) => git(args).status === 0)
  T("git-worktrees: the hidden change fixture stages", staged)
  if (!staged) return
  appendFileSync(join(repository, ".git", "info", "exclude"), "excluded/\n")
  for (const directory of ["ignored", "personal", "default", "excluded"]) {
    mkdirSync(join(repository, directory))
    writeFileSync(join(repository, directory, "file.txt"), "never added\n")
  }
  for (const name of ["assumed.txt", "skipped.txt"]) appendFileSync(join(repository, name), "edited, never committed\n")
  // Git reads the default only while `core.excludesFile` is not set, so each config hides one of the two files.
  const status = ["status", "--porcelain", "--untracked-files=all"]
  same("git-worktrees: without an override, core.excludesFile or its default hides a file, and no index flag or info/exclude change shows",
    [git(status, join(base, "personal.gitconfig")).stdout, git(status).stdout], ["?? default/file.txt\n", "?? personal/file.txt\n"])
  const both = "?? default/file.txt\n?? personal/file.txt\n"
  same("git-worktrees: the clean check shows each file that core.excludesFile or its default ignores, and still no index flag or info/exclude change",
    [git(CLEAN_STATUS_ARGUMENTS, join(base, "personal.gitconfig")).stdout, git(CLEAN_STATUS_ARGUMENTS).stdout], [both, both])
  const listing = git(HIDDEN_CHANGE_ARGUMENTS, join(base, "personal.gitconfig"))
  same("git-worktrees: the hidden change listing names each flagged file and each untracked file that no .gitignore ignores, and nothing else",
    hiddenChangesOf(listing.stdout).sort(), ["? default/file.txt", "? excluded/file.txt", "? personal/file.txt", "S skipped.txt", "h assumed.txt"])
  same("git-worktrees: a tree with no hidden change gives no line", hiddenChangesOf("H .gitignore\nH plain.txt\n"), [])
}

/** An fsmonitor hook that always answers "nothing changed": `git status` then never looks at an edited file again. */
const fsmonitorCases = () => {
  const base = join(root, "git-worktrees-fsmonitor")
  const repository = join(base, "repository")
  mkdirSync(repository, { recursive: true })
  writeFileSync(join(base, "fsmonitor-hook.sh"), "#!/bin/sh\nprintf 'token\\0'\n", { mode: 0o755 })
  writeFileSync(join(repository, "tracked.txt"), "committed\n")
  const git = (args) => spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" })
  // Two runs of `git status` store the fsmonitor state in the index; from then on git trusts the hook.
  const staged = [["init", "-q", "--initial-branch=main"], ["add", "tracked.txt"], ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "base"],
    ["config", "core.fsmonitor", join(base, "fsmonitor-hook.sh")], ["status", "--porcelain"], ["status", "--porcelain"]].every((args) => git(args).status === 0)
  T("git-worktrees: the fsmonitor fixture stages", staged)
  if (!staged) return
  appendFileSync(join(repository, "tracked.txt"), "edited, never committed\n")
  same("git-worktrees: git status with the fsmonitor hook hides the edit", git(["status", "--porcelain"]).stdout, "")
  same("git-worktrees: the clean check shows the edit that the fsmonitor hook hides", git(CLEAN_STATUS_ARGUMENTS).stdout, " M tracked.txt\n")
}

export const cases = () => {
  walkCases()
  hiddenChangeCases()
  fsmonitorCases()
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
