import { spawn, spawnSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, orcaEnv, realOrchestratorConfig, root, run, same, stageWithConfig } from "./_harness.mjs"

const TOOL = "stale-files.mjs"
const THIS = "00000000-0000-4000-8000-000000000000"
const PREDECESSOR = "11111111-0000-4000-8000-000000000001"
const LIVE = "22222222-0000-4000-8000-000000000002"
const WORKED_IN = "33333333-0000-4000-8000-000000000003"
const STALE = "44444444-0000-4000-8000-000000000004"
const LATER = "55555555-0000-4000-8000-000000000005"
const NESTED_OPEN = "66666666-0000-4000-8000-000000000006"
const NESTED_UNPUSHED = "77777777-0000-4000-8000-000000000007"
const NESTED_DONE = "88888888-0000-4000-8000-000000000008"
const PROBE_REPOSITORY = "99999999-0000-4000-8000-000000000009"
const NESTED_UNTRACKED = "aaaaaaaa-0000-4000-8000-00000000000a"
const WORKER = "bbbbbbbb-0000-4000-8000-00000000000b"
const NESTED_FLAGGED = "cccccccc-0000-4000-8000-00000000000c"

const base = join(root, "stale-cli")
const home = join(base, "home")
const configDirectory = join(base, "claude-config")
const workerConfigDirectory = join(base, "worker-config")
const sessionRoot = join(base, "sessions")
const primary = join(base, "repository")
const worktreeRoot = join(base, "worktrees")
const outside = join(base, "outside")
const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
/** Global git config of the tool's run: it hides every untracked file, and each file under `notes/`, from `git status`. */
const hidingConfig = join(base, "hide-untracked.gitconfig")
const personalIgnore = join(base, "personal.gitignore")

/**
 * A linked worktree on `branch` with one commit unless `commit` is false, pushed unless `push` is false. Returns its path and tip.
 * `options` are git `-c` settings of the worktree's creation and commit.
 */
const stageWorktree = (name, { push = true, detach = false, commit = true, path = join(worktreeRoot, name), options = [] } = {}) => {
  const branch = `feature/${name}`
  if (git(primary, [...options, ...(detach ? ["worktree", "add", "-q", "--detach", path] : ["worktree", "add", "-q", "-b", branch, path])]).status !== 0) return null
  if (commit) writeFileSync(join(path, `${name}.txt`), `${name}\n`)
  if (commit && (git(path, [...options, "add", `${name}.txt`]).status !== 0 || git(path, [...options, "commit", "-q", "-m", name]).status !== 0)) return null
  if (push && !detach && git(path, ["push", "-q", "-u", "origin", branch]).status !== 0) return null
  return { path, branch, tip: git(path, ["rev-parse", "HEAD"]).stdout.trim() }
}

/** GitHub removes the head branch of a merged pull request, and a later fetch drops the remote reference. */
const dropRemoteBranch = (worktree) => git(primary, ["push", "-q", "origin", "--delete", worktree.branch]).status === 0 && git(primary, ["fetch", "-q", "--prune", "origin"]).status === 0

const stageRepository = () => {
  mkdirSync(primary, { recursive: true })
  const origin = join(base, "origin.git")
  if (spawnSync("git", ["init", "-q", "--bare", origin]).status !== 0) return null
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"]]) {
    if (git(primary, args).status !== 0) return null
  }
  // Claude Code makes its own worktrees under `.claude/worktrees/`, which the repository ignores.
  writeFileSync(join(primary, ".gitignore"), "node_modules/\n.claude/worktrees/\nbuild/\n")
  for (const args of [["add", ".gitignore"], ["commit", "-q", "-m", "base"], ["remote", "add", "origin", origin], ["push", "-q", "-u", "origin", "main"]]) {
    if (git(primary, args).status !== 0) return null
  }
  const names = ["merged", "closed", "open", "unpushed", "dirty", "part", "in-use", "unreadable", "locked"]
  const worktrees = Object.fromEntries(names.map((name) => [name, stageWorktree(name)]))
  worktrees.unmerged = stageWorktree("unmerged", { push: false })
  worktrees.contained = stageWorktree("contained", { push: false })
  worktrees.detached = stageWorktree("detached", { detach: true })
  // A session can leave a registered worktree in its scratchpad: the open pull request's tree, a commit no remote has, a finished one.
  const nested = (session) => join(sessionRoot, session, "scratchpad", "wt")
  worktrees["nested-open"] = stageWorktree("nested-open", { path: nested(NESTED_OPEN) })
  worktrees["nested-unpushed"] = stageWorktree("nested-unpushed", { detach: true, path: nested(NESTED_UNPUSHED) })
  worktrees["nested-done"] = stageWorktree("nested-done", { detach: true, commit: false, path: nested(NESTED_DONE) })
  worktrees["nested-untracked"] = stageWorktree("nested-untracked", { detach: true, commit: false, path: nested(NESTED_UNTRACKED) })
  // A finished worktree can hold a second registered worktree in an ignored path, which `git worktree remove` takes with it.
  for (const name of ["holds-dirty", "clean-outer", "holds-detached", "holds-repository", "holds-untracked-repository", "linked-build", "personal-ignore", "info-exclude",
    "holds-flagged-repository"]) worktrees[name] = stageWorktree(name)
  // `core.ignoreStat` makes git mark each file it writes assume-unchanged, so `git status` never compares it again.
  worktrees["ignore-stat"] = stageWorktree("ignore-stat", { options: ["-c", "core.ignoreStat=true"] })
  worktrees["nested-flagged"] = stageWorktree("nested-flagged", { detach: true, commit: false, path: nested(NESTED_FLAGGED) })
  const inner = (outer, name) => join(worktreeRoot, outer, ".claude", "worktrees", name)
  worktrees["nested-dirty"] = stageWorktree("nested-dirty", { path: inner("holds-dirty", "nested-dirty") })
  worktrees["nested-clean"] = stageWorktree("nested-clean", { path: inner("clean-outer", "nested-clean") })
  worktrees["detached-inner"] = stageWorktree("detached-inner", { detach: true, commit: false, path: inner("holds-detached", "detached-inner") })
  if (Object.values(worktrees).some((worktree) => worktree === null)) return null
  writeFileSync(join(worktrees["nested-dirty"].path, "nested-dirty.txt"), "edited, not committed\n")
  writeFileSync(join(worktrees["nested-dirty"].path, "untracked.txt"), "never added\n")
  // A repository of its own in an ignored path: its commit lives only in its own object store.
  const vendored = join(worktrees["holds-repository"].path, "node_modules", "vendored")
  mkdirSync(vendored, { recursive: true })
  writeFileSync(join(vendored, "local.txt"), "a commit no remote has\n")
  for (const args of [["init", "-q"], ["add", "local.txt"], ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "local"]]) {
    if (git(vendored, args).status !== 0) return null
  }
  // Untracked files only, which `status.showUntrackedFiles=no` hides: in a worktree inside a session directory, and in a
  // repository with no commit inside an ignored path of a finished worktree.
  writeFileSync(join(worktrees["nested-untracked"].path, "draft.txt"), "never added\n")
  // Changes that `git status` cannot show: an edit to a tracked file with an index flag, a file that only the global
  // `core.excludesFile` ignores, and a file that only the shared `info/exclude` ignores.
  appendFileSync(join(worktrees["ignore-stat"].path, "ignore-stat.txt"), "edited, never committed\n")
  if (git(worktrees["nested-flagged"].path, ["update-index", "--skip-worktree", ".gitignore"]).status !== 0) return null
  appendFileSync(join(worktrees["nested-flagged"].path, ".gitignore"), "# edited, never committed\n")
  writeFileSync(personalIgnore, "notes/\n")
  mkdirSync(join(worktrees["personal-ignore"].path, "notes"))
  writeFileSync(join(worktrees["personal-ignore"].path, "notes", "plan.md"), "never added\n")
  appendFileSync(join(primary, ".git", "info", "exclude"), "drafts/\n")
  mkdirSync(join(worktrees["info-exclude"].path, "drafts"))
  writeFileSync(join(worktrees["info-exclude"].path, "drafts", "todo.md"), "never added\n")
  // A clone in an ignored path: every commit of it is on its remote, and only an edit that an index flag hides is new.
  const flaggedClone = join(worktrees["holds-flagged-repository"].path, "node_modules", "flagged")
  if (git(primary, ["clone", "-q", "--branch", "main", join(base, "origin.git"), flaggedClone]).status !== 0 || git(flaggedClone, ["update-index", "--assume-unchanged", ".gitignore"]).status !== 0) return null
  appendFileSync(join(flaggedClone, ".gitignore"), "# edited, never committed\n")
  const scratch = join(worktrees["holds-untracked-repository"].path, "node_modules", "scratch")
  mkdirSync(scratch, { recursive: true })
  if (git(scratch, ["init", "-q"]).status !== 0) return null
  writeFileSync(join(scratch, "draft.txt"), "never added\n")
  mkdirSync(join(worktrees["linked-build"].path, "build"))
  writeFileSync(join(worktrees["linked-build"].path, "build", "app.bin"), "built\n")
  // `merged` and `unpushed` lost their remote branch at the merge; `unpushed` then gained a local commit.
  if (!dropRemoteBranch(worktrees.merged) || !dropRemoteBranch(worktrees.unpushed)) return null
  writeFileSync(join(worktrees.unpushed.path, "later.txt"), "never pushed\n")
  if (git(worktrees.unpushed.path, ["add", "later.txt"]).status !== 0 || git(worktrees.unpushed.path, ["commit", "-q", "-m", "later"]).status !== 0) return null
  writeFileSync(join(worktrees.dirty.path, "unsaved.txt"), "not committed\n")
  // `contained` went into main with no pull request. `whole` holds every commit of `part`, and its pull request merged.
  if (git(primary, ["merge", "-q", "--ff-only", worktrees.contained.branch]).status !== 0 || git(primary, ["push", "-q", "origin", "main"]).status !== 0) return null
  if (git(primary, ["branch", "feature/whole", worktrees.part.branch]).status !== 0 || git(primary, ["worktree", "lock", worktrees.locked.path]).status !== 0) return null
  return worktrees
}

const pullRequestPlan = (worktrees) => {
  const reply = (branch, pullRequests) => ({ match: `--head ${branch} --state all`, stdout: JSON.stringify(pullRequests) })
  const one = (name, number, state, headRefOid = worktrees[name].tip) => reply(worktrees[name].branch, [{ headRefOid, number, state }])
  // `unreadable` has no reply on purpose: the shim then fails the read, as an offline gh does.
  return [one("merged", 11, "MERGED"), one("closed", 12, "CLOSED"), one("open", 13, "OPEN"), one("unpushed", 14, "MERGED"), one("dirty", 15, "MERGED"),
    one("in-use", 17, "MERGED"), one("locked", 18, "MERGED"), one("nested-open", 19, "OPEN"),
    one("holds-dirty", 21, "MERGED"), one("clean-outer", 22, "MERGED"), one("nested-clean", 23, "MERGED"), one("holds-detached", 24, "MERGED"), one("holds-repository", 25, "MERGED"),
    one("holds-untracked-repository", 27, "MERGED"),
    one("linked-build", 26, "MERGED"), one("ignore-stat", 28, "MERGED"), one("personal-ignore", 29, "MERGED"), one("holds-flagged-repository", 30, "MERGED"),
    one("info-exclude", 31, "MERGED"), reply("feature/whole", [{ headRefOid: worktrees.part.tip, number: 16, state: "MERGED" }]),
    reply(worktrees.part.branch, []), reply(worktrees.unmerged.branch, []), reply(worktrees.contained.branch, [])]
}

/** A throwaway repository with two commits, an uncommitted file and no remote, as a session leaves in its scratchpad. */
const stageProbeRepository = (directory) => {
  mkdirSync(directory, { recursive: true })
  if (git(directory, ["init", "-q"]).status !== 0) return false
  for (const name of ["first", "second"]) {
    writeFileSync(join(directory, `${name}.txt`), `${name}\n`)
    if (git(directory, ["add", `${name}.txt`]).status !== 0) return false
    if (git(directory, ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", name]).status !== 0) return false
  }
  writeFileSync(join(directory, "draft.txt"), "not committed\n")
  return true
}

const stageDirectories = (worktrees) => {
  for (const session of [THIS, PREDECESSOR, LIVE, WORKED_IN, STALE, WORKER]) mkdirSync(join(sessionRoot, session, "scratchpad"), { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, "sentinel.txt"), "must survive\n")
  symlinkSync(outside, join(sessionRoot, STALE, "scratchpad", "outside"), "dir")
  writeFileSync(join(sessionRoot, STALE, "scratchpad", "notes.txt"), "old notes\n")
  // A link from this session's scratchpad into a finished worktree holds nothing: no relay carries a scratchpad forward.
  symlinkSync(join(worktrees["linked-build"].path, "build"), join(sessionRoot, THIS, "scratchpad", "build"), "dir")
  // An old session holds a throwaway probe repository: it goes with it.
  if (!stageProbeRepository(join(sessionRoot, PROBE_REPOSITORY, "scratchpad", "probe"))) return false
  mkdirSync(join(configDirectory, "sessions"), { recursive: true })
  // A session record with `pid`, `sessionId` and `cwd` only: without `procStart` the reader proves its pid, this live test process, alone.
  writeFileSync(join(configDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: LIVE, cwd: worktrees["in-use"].path }))
  // The session that lists runs too; without its own record the listing cannot see live sessions and keeps everything they could use.
  writeFileSync(join(configDirectory, "sessions", "listing-session.json"), JSON.stringify({ pid: process.pid, sessionId: THIS, cwd: primary }))
  // A worker session runs on the worker account, whose directory the variable that `workers.claude.configDirEnv` names gives.
  mkdirSync(join(workerConfigDirectory, "sessions"), { recursive: true })
  writeFileSync(join(workerConfigDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: WORKER, cwd: primary }))
  return true
}

export const cases = async () => {
  const worktrees = stageRepository()
  T("stale-files: the git fixture stages", worktrees !== null)
  if (worktrees === null) return
  const directoriesStaged = stageDirectories(worktrees)
  T("stale-files: the directory fixture stages", directoriesStaged)
  if (!directoriesStaged) return
  const config = realOrchestratorConfig()
  // A variable name other than the shipped one: the listing must read the name from the config, as the worker launch does.
  const workerVariable = "ORBIT_STALE_GATE_WORKER_CONFIG_DIR"
  const staged = stageWithConfig("stale-cli", TOOL, { ...config, repos: { ui: primary },
    workers: { ...config.workers, claude: { ...config.workers.claude, configDirEnv: workerVariable } } })
  writeFileSync(hidingConfig, `[status]\n\tshowUntrackedFiles = no\n[core]\n\texcludesFile = ${personalIgnore}\n`)
  mkdirSync(join(staged.base, ".git"))
  writeFileSync(join(staged.base, ".git", "orbit-orchestrate-run.json"), JSON.stringify({ sessionId: THIS, relay: { from: PREDECESSOR, pending: false } }))
  const env = { ...orcaEnv(pullRequestPlan(worktrees)), HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_CODE_SESSION_ID: "",
    [workerVariable]: workerConfigDirectory, GIT_CONFIG_GLOBAL: hidingConfig }
  const tool = (argv) => run(TOOL, argv, { path: staged.path, env })
  const session = (id) => join(sessionRoot, id)
  const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: session(WORKED_IN), stdio: "ignore" })
  try {
    const flaggedClone = join(worktrees["holds-flagged-repository"].path, "node_modules", "flagged")
    const hidden = [worktrees["ignore-stat"].path, worktrees["nested-flagged"].path, worktrees["personal-ignore"].path, worktrees["info-exclude"].path, flaggedClone]
    same("stale-files: the run's git status hides each change of the hidden change fixture", hidden.map((path) => spawnSync("git", ["-C", path, "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: hidingConfig } }).stdout), hidden.map(() => ""))
    const listed = tool(["--list", "--json", "--session", THIS, "--session-root", sessionRoot])
    same("stale-files: --list --json exits 0", listed.status, 0)
    const listing = listed.status === 0 ? JSON.parse(listed.stdout) : { stale: [], kept: [] }
    const expectedStale = [session(STALE), session(NESTED_DONE), session(PROBE_REPOSITORY), worktrees.merged.path, worktrees.closed.path, worktrees.part.path, worktrees.contained.path,
      worktrees["clean-outer"].path, worktrees["nested-clean"].path, worktrees["linked-build"].path].sort()
    same("stale-files: the listing marks each stale class and nothing else", listing.stale.map((item) => item.path).sort(), expectedStale)
    const staleReason = (path) => listing.stale.find((item) => item.path === path)?.reason ?? ""
    for (const [name, path, reason] of [
      ["a session directory", session(STALE), /not this session, its predecessor, or a session with a live process/],
      ["a session directory that holds a throwaway repository with local commits and no remote", session(PROBE_REPOSITORY), /^not this session, its predecessor, or a session with a live process$/],
      ["a finished worktree that the scratchpad of this session links into", worktrees["linked-build"].path, /^pull request #26 merged$/],
      ["a merged worktree", worktrees.merged.path, /^pull request #11 merged$/], ["a closed worktree", worktrees.closed.path, /^pull request #12 closed$/],
      ["a branch in a merged branch", worktrees.part.path, /contained in feature\/whole, which pull request #16 merged/], ["a branch in the base branch", worktrees.contained.path, /contained in origin\/main/],
    ]) T(`stale-files: ${name} carries its reason`, reason.test(staleReason(path)), `reason: ${staleReason(path)}`)
    T("stale-files: every stale item carries a measured size", listing.stale.length > 0 && listing.stale.every((item) => Number.isFinite(item.bytes)), JSON.stringify(listing.stale))
    const keptReason = (path) => listing.kept.find((item) => item.path === path)?.reason ?? ""
    for (const [name, path, reason] of [
      ["this session", session(THIS), /^this session$/], ["the predecessor", session(PREDECESSOR), /predecessor of this session/], ["a live session", session(LIVE), /live session 22222222 uses it/],
      ["a session a process works in", session(WORKED_IN), /a live process works in it/], ["an open pull request", worktrees.open.path, /pull request #13 is open/],
      ["an unpushed commit", worktrees.unpushed.path, /a commit that no remote and no pull request has/], ["a dirty tree", worktrees.dirty.path, /uncommitted change/],
      ["work nobody merged", worktrees.unmerged.path, /work nobody merged/], ["a detached worktree", worktrees.detached.path, /detached/],
      ["a worktree a live session works in", worktrees["in-use"].path, /live session 22222222 uses it/], ["an unreadable pull request state", worktrees.unreadable.path, /could not be read/],
      ["a locked worktree", worktrees.locked.path, /locked/],
      ["a session directory that holds an open pull request's worktree", session(NESTED_OPEN), /pull request #19 is open/],
      ["a session directory that holds a worktree with an unpushed commit", session(NESTED_UNPUSHED), /holds a commit that no remote has/],
      ["a finished worktree that holds a worktree with an uncommitted change", worktrees["holds-dirty"].path,
        new RegExp(`^worktree ${worktrees["nested-dirty"].path} in it stays: it holds an uncommitted change$`)],
      ["the worktree with an uncommitted change inside a finished worktree", worktrees["nested-dirty"].path, /^it holds an uncommitted change$/],
      ["a finished worktree that holds a kept detached worktree", worktrees["holds-detached"].path, new RegExp(`^worktree ${worktrees["detached-inner"].path} in it stays: its HEAD is detached`)],
      ["a finished worktree that holds a repository with a commit no remote has", worktrees["holds-repository"].path,
        new RegExp(`^repository ${join(worktrees["holds-repository"].path, "node_modules", "vendored")} in it stays: it holds a commit that no remote has$`)],
      ["a finished worktree whose only change is an untracked file that status.showUntrackedFiles=no hides", worktrees.dirty.path, /^it holds an uncommitted change$/],
      ["a session directory that holds a worktree whose only change is a hidden untracked file", session(NESTED_UNTRACKED),
        new RegExp(`^worktree ${worktrees["nested-untracked"].path} in it stays: it holds an uncommitted change$`)],
      ["a finished worktree that holds a repository whose only change is a hidden untracked file", worktrees["holds-untracked-repository"].path,
        new RegExp(`^repository ${join(worktrees["holds-untracked-repository"].path, "node_modules", "scratch")} in it stays: it holds an uncommitted change$`)],
      ["the session of a live record in the worker account directory that the config names", session(WORKER), /^live session bbbbbbbb uses it$/],
      ["a finished worktree whose edit an assume-unchanged flag from core.ignoreStat hides", worktrees["ignore-stat"].path,
        /^git status cannot show a change to \.gitignore, an assume-unchanged or skip-worktree file$/],
      ["a session directory that holds a worktree whose edit a skip-worktree flag hides", session(NESTED_FLAGGED),
        new RegExp(`^worktree ${worktrees["nested-flagged"].path} in it stays: git status cannot show a change to \\.gitignore, an assume-unchanged or skip-worktree file$`)],
      ["a finished worktree that holds a repository whose edit an assume-unchanged flag hides", worktrees["holds-flagged-repository"].path,
        new RegExp(`^repository ${flaggedClone} in it stays: git status cannot show a change to \\.gitignore, an assume-unchanged or skip-worktree file$`)],
      ["a finished worktree whose only change is a file that the global core.excludesFile ignores", worktrees["personal-ignore"].path, /^it holds an uncommitted change$/],
      ["a finished worktree whose only change is a file that only info/exclude ignores", worktrees["info-exclude"].path, /^it holds an untracked file that no \.gitignore ignores: drafts\/todo\.md$/],
    ]) T(`stale-files: ${name} is kept`, reason.test(keptReason(path)), `reason: ${keptReason(path)}`)

    const text = tool(["--list", "--session", THIS])
    T("stale-files: --list reuses the stored session root and prints each item, the total and the removal command", text.status === 0
      && text.stdout.includes(`STALE session ${session(STALE)} (`) && /TOTAL 10 items, .* \(3 session directories, 7 worktrees\)/.test(text.stdout)
      && text.stdout.includes(`node tools/stale-files.mjs --delete --listing ${listing.listingId}`), text.stdout + text.stderr)
    same("stale-files: the listing is stored in the git directory", JSON.parse(readFileSync(join(staged.base, ".git", "orbit-stale-files.json"), "utf8")).listingId, listing.listingId)
    same("stale-files: no session identity is a usage error", tool(["--list"]).status, 2)
    same("stale-files: --delete without --listing is a usage error", tool(["--delete", "--session", THIS]).status, 2)

    const wrong = tool(["--delete", "--listing", "000000000000", "--session", THIS])
    T("stale-files: a listing id that is not the stored one is refused and removes nothing", wrong.status === 1 && /is not the stored listing/.test(wrong.stderr) && expectedStale.every((path) => existsSync(path)), wrong.stderr)

    // After the owner saw the listing: one listed worktree gains an uncommitted file, and a new session directory goes stale.
    writeFileSync(join(worktrees.closed.path, "new-work.txt"), "written after the listing\n")
    mkdirSync(join(sessionRoot, LATER, "scratchpad"), { recursive: true })
    const removed = tool(["--delete", "--listing", listing.listingId, "--session", THIS])
    same("stale-files: --delete exits 0", removed.status, 0)
    const gone = expectedStale.filter((path) => path !== worktrees.closed.path)
    same("stale-files: --delete removes exactly the listed items that are still stale", gone.filter((path) => existsSync(path)), [])
    same("stale-files: --delete prints one line for each removed item", gone.filter((path) => !new RegExp(`^REMOVED \\w+ ${path} \\(`, "m").test(removed.stdout)), [])
    T("stale-files: a listed worktree with a new uncommitted file is skipped and survives", removed.stdout.includes(`SKIPPED worktree ${worktrees.closed.path}: it holds an uncommitted change`) && existsSync(join(worktrees.closed.path, "new-work.txt")), removed.stdout)
    T("stale-files: --delete prints what it freed", /^FREED 9 items, .* \(3 session directories, 6 worktrees\); free space changed by [+-]/m.test(removed.stdout), removed.stdout)
    T("stale-files: a session directory that went stale after the listing survives", existsSync(session(LATER)))
    const keptPaths = [session(THIS), session(PREDECESSOR), session(LIVE), session(WORKED_IN), session(NESTED_OPEN), session(NESTED_UNPUSHED), session(NESTED_UNTRACKED), session(WORKER),
      session(NESTED_FLAGGED),
      ...["open", "unpushed", "dirty", "unmerged", "detached", "in-use", "unreadable", "locked", "nested-open", "nested-unpushed",
        "nested-untracked", "holds-dirty", "nested-dirty", "holds-detached", "detached-inner", "holds-repository", "holds-untracked-repository", "ignore-stat",
        "nested-flagged", "personal-ignore", "info-exclude", "holds-flagged-repository"].map((name) => worktrees[name].path)]
    same("stale-files: every protected item survives", keptPaths.filter((path) => !existsSync(path)), [])
    same("stale-files: a link inside a removed session directory keeps its target", readFileSync(join(outside, "sentinel.txt"), "utf8"), "must survive\n")
    same("stale-files: every untracked file that status.showUntrackedFiles=no hides survives --delete", [join(worktrees.dirty.path, "unsaved.txt"),
      join(worktrees.closed.path, "new-work.txt"), join(worktrees["nested-untracked"].path, "draft.txt"),
      join(worktrees["holds-untracked-repository"].path, "node_modules", "scratch", "draft.txt")].filter((path) => !existsSync(path)), [])
    same("stale-files: every change that git status cannot show survives --delete", [[join(worktrees["ignore-stat"].path, "ignore-stat.txt"), "ignore-stat\nedited, never committed\n"],
      [join(worktrees["nested-flagged"].path, ".gitignore"), "node_modules/\n.claude/worktrees/\nbuild/\n# edited, never committed\n"],
      [join(flaggedClone, ".gitignore"), "node_modules/\n.claude/worktrees/\nbuild/\n# edited, never committed\n"],
      [join(worktrees["personal-ignore"].path, "notes", "plan.md"), "never added\n"], [join(worktrees["info-exclude"].path, "drafts", "todo.md"), "never added\n"]]
      .filter(([path, content]) => !existsSync(path) || readFileSync(path, "utf8") !== content).map(([path]) => path), [])
    T("stale-files: the uncommitted and untracked files of a worktree inside a finished worktree survive --delete",
      existsSync(join(worktrees["nested-dirty"].path, "nested-dirty.txt")) && existsSync(join(worktrees["nested-dirty"].path, "untracked.txt")))
    T("stale-files: the commit of a repository inside a finished worktree survives --delete", git(join(worktrees["holds-repository"].path, "node_modules", "vendored"), ["log", "--oneline"]).stdout.includes("local"))
    T("stale-files: a finished worktree inside a finished worktree is removed by git, so no registration of it is left",
      !removed.stderr.includes(worktrees["nested-clean"].path) && !git(primary, ["worktree", "list", "--porcelain"]).stdout.includes(worktrees["nested-clean"].path), removed.stdout + removed.stderr)
    T("stale-files: a removed worktree leaves the worktree list and keeps its branch", !git(primary, ["worktree", "list", "--porcelain"]).stdout.includes(worktrees.merged.path)
      && git(primary, ["rev-parse", "--verify", "--quiet", worktrees.merged.branch]).status === 0)
    T("stale-files: a worktree inside a removed session directory leaves the worktree list", !git(primary, ["worktree", "list", "--porcelain"]).stdout.includes(worktrees["nested-done"].path))
    same("stale-files: the store holds no stale item after the removal", JSON.parse(readFileSync(join(staged.base, ".git", "orbit-stale-files.json"), "utf8")).stale, [])
    same("stale-files: the same order does not run twice", tool(["--delete", "--listing", listing.listingId, "--session", THIS]).status, 1)
  } finally {
    worker.kill()
  }
}
