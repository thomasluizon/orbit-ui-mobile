import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { CLEAN_STATUS_ARGUMENTS, HIDDEN_CHANGE_ARGUMENTS, findRepositories, hiddenChangesOf, installDependencies, parseWorktreeList, workspaceDirectories } from "../lib/git-worktrees.mjs"
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
  same("git-worktrees: core.excludesFile or its default hides a file from a plain status, and the clean check shows each file with no index flag or info/exclude change",
    [git(status, join(base, "personal.gitconfig")).stdout, git(status).stdout, git(CLEAN_STATUS_ARGUMENTS, join(base, "personal.gitconfig")).stdout, git(CLEAN_STATUS_ARGUMENTS).stdout],
    ["?? default/file.txt\n", "?? personal/file.txt\n", "?? default/file.txt\n?? personal/file.txt\n", "?? default/file.txt\n?? personal/file.txt\n"])
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

/** A checkout with a lock file, the workspaces `apps/*` and `eslint-rules`, and a `node_modules` in the root, in `apps/web` and in `eslint-rules`. */
const stageCheckout = (name, { lock = "lock-a", modules = true } = {}) => {
  const directory = join(root, "dependencies", name)
  for (const workspace of ["apps/web", "apps/mobile", "eslint-rules"]) mkdirSync(join(directory, workspace), { recursive: true })
  writeFileSync(join(directory, "package.json"), JSON.stringify({ workspaces: ["apps/*", "eslint-rules"] }))
  if (lock !== null) writeFileSync(join(directory, "package-lock.json"), lock)
  if (modules) {
    for (const workspace of ["", "apps/web", "eslint-rules"]) {
      mkdirSync(join(directory, workspace, "node_modules", "package"), { recursive: true })
      writeFileSync(join(directory, workspace, "node_modules", "package", "index.js"), `module.exports = "${workspace}"\n`)
    }
    symlinkSync("../apps/web", join(directory, "node_modules", "web-link"), "dir")
  }
  return directory
}

const dependencyCases = async () => {
  const recorder = (reply = () => ({ status: 0, stderr: "" })) => {
    const calls = []
    return { calls, run: async (file, args, options) => { calls.push({ file, args, cwd: options?.cwd }); return reply(file, args) } }
  }
  const clock = () => { let tick = 0; return () => (tick += 7) }
  const install = (source, target, run, platform = "darwin") => installDependencies(source, target, { run, platform, now: clock() })

  same("git-worktrees: the workspaces are the root and each directory that a pattern names", workspaceDirectories(stageCheckout("names")).sort(), ["", "apps/mobile", "apps/web", "eslint-rules"])
  const object = join(root, "dependencies", "object-form")
  mkdirSync(join(object, "tools"), { recursive: true })
  writeFileSync(join(object, "package.json"), JSON.stringify({ workspaces: { packages: ["tools", "missing/*"] } }))
  same("git-worktrees: the object form of workspaces and a pattern with no parent directory are read", workspaceDirectories(object), ["", "tools"])
  writeFileSync(join(object, "package.json"), "{}")
  same("git-worktrees: a package.json with no workspaces names only the root", workspaceDirectories(object), [""])

  const source = stageCheckout("source")
  const same1 = stageCheckout("target-same", { modules: false })
  const clones = recorder()
  const cloned = await install(source, same1, clones.run)
  same("git-worktrees: a matching lock file clones the node_modules of the root and of each workspace that has one, and runs no npm", [clones.calls.map((call) => [call.file, ...call.args]).sort(), cloned.action, cloned.directories.sort(), cloned.ms],
    [[["cp", "-c", "-R", join(source, "apps/web/node_modules"), join(same1, "apps/web/node_modules")], ["cp", "-c", "-R", join(source, "eslint-rules/node_modules"), join(same1, "eslint-rules/node_modules")], ["cp", "-c", "-R", join(source, "node_modules"), join(same1, "node_modules")]], "clone", ["", "apps/web", "eslint-rules"], 7])

  const other = stageCheckout("target-other", { lock: "lock-b", modules: false })
  const differs = recorder()
  const installed = await install(source, other, differs.run)
  same("git-worktrees: a different lock file runs npm ci once in the new worktree and clones nothing", [differs.calls, installed.action, installed.reason], [[{ file: "npm", args: ["ci"], cwd: other }], "install", "the lock file differs from the main checkout"])

  const linux = recorder()
  same("git-worktrees: a platform with no clonefile runs npm ci", [(await install(source, stageCheckout("target-linux", { modules: false }), linux.run, "linux")).action, linux.calls.map((call) => call.file)], ["install", ["npm"]])
  const bare = recorder()
  const noModules = await install(stageCheckout("source-bare", { modules: false }), stageCheckout("target-bare", { modules: false }), bare.run)
  same("git-worktrees: a main checkout with no node_modules has nothing to clone, so npm ci runs", [noModules.action, noModules.reason, bare.calls.map((call) => call.file)], ["install", "the main checkout has no node_modules", ["npm"]])

  const noLock = recorder()
  same("git-worktrees: a checkout with no lock file needs no install", [(await install(stageCheckout("source-nolock", { lock: null }), stageCheckout("target-nolock", { lock: null, modules: false }), noLock.run)).action, noLock.calls.length], ["none", 0])
  const present = stageCheckout("target-present")
  const kept = recorder()
  same("git-worktrees: a tree that has its node_modules already keeps them", [(await install(source, present, kept.run)).action, kept.calls.length], ["none", 0])

  const broken = stageCheckout("target-broken", { modules: false })
  const half = recorder((file, args) => {
    if (file !== "cp") return { status: 0, stderr: "" }
    mkdirSync(args[3], { recursive: true })
    return args[3].endsWith(join("eslint-rules", "node_modules")) ? { status: 1, stderr: "no space left\n" } : { status: 0, stderr: "" }
  })
  const fellBack = await install(source, broken, half.run)
  same("git-worktrees: a failed clone removes every partial clone and falls back to npm ci", [fellBack.action, fellBack.reason, half.calls.at(-1).file, ["", "apps/web", "eslint-rules"].some((workspace) => existsSync(join(broken, workspace, "node_modules")))], ["install", "cp failed for eslint-rules: no space left", "npm", false])

  const failing = recorder(() => ({ status: 1, stderr: "npm error one\nnpm error last\n" }))
  const failed = await install(source, other, failing.run)
  same("git-worktrees: a failed npm ci reports failed with its last line and never throws", [failed.action, failed.reason], ["failed", "npm ci exit 1: npm error last"])
  const throwing = await install(source, other, async () => { throw new Error("spawn broke") })
  same("git-worktrees: a run that throws reports failed", [throwing.action, throwing.reason], ["failed", "spawn broke"])

  if (process.platform === "darwin") {
    const real = stageCheckout("target-real", { modules: false })
    const result = await installDependencies(source, real)
    same("git-worktrees: a real clone copies each node_modules and keeps a relative link inside the new tree", [result.action, readFileSync(join(real, "apps/web/node_modules/package/index.js"), "utf8"), readlinkSync(join(real, "node_modules/web-link"))], ["clone", 'module.exports = "apps/web"\n', "../apps/web"])
    writeFileSync(join(real, "node_modules/package/index.js"), "changed\n")
    same("git-worktrees: a write in the clone leaves the main checkout alone", readFileSync(join(source, "node_modules/package/index.js"), "utf8"), 'module.exports = ""\n')
  }
}

export const cases = async () => {
  await dependencyCases()
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
  same("git-worktrees: an empty output gives no record", parseWorktreeList(""), [])
}
