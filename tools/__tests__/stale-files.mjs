import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, orcaEnv, realOrchestratorConfig, root, run, stageWithConfig } from "./_harness.mjs"

const TOOL = "stale-files.mjs"
const THIS = "00000000-0000-4000-8000-000000000000"
const PREDECESSOR = "11111111-0000-4000-8000-000000000001"
const LIVE = "22222222-0000-4000-8000-000000000002"
const WORKED_IN = "33333333-0000-4000-8000-000000000003"
const STALE = "44444444-0000-4000-8000-000000000004"
const LATER = "55555555-0000-4000-8000-000000000005"

const base = join(root, "stale-cli")
const home = join(base, "home")
const configDirectory = join(base, "claude-config")
const sessionRoot = join(base, "sessions")
const carryRoot = join(home, ".orbit-run-carry")
const primary = join(base, "repository")
const worktreeRoot = join(base, "worktrees")
const outside = join(base, "outside")
const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
const same = (name, got, want) => T(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

/** A linked worktree on `branch` with one commit, pushed unless `push` is false. Returns its path and tip. */
const stageWorktree = (name, { push = true, detach = false } = {}) => {
  const path = join(worktreeRoot, name)
  const branch = `feature/${name}`
  if (git(primary, detach ? ["worktree", "add", "-q", "--detach", path] : ["worktree", "add", "-q", "-b", branch, path]).status !== 0) return null
  writeFileSync(join(path, `${name}.txt`), `${name}\n`)
  if (git(path, ["add", `${name}.txt`]).status !== 0 || git(path, ["commit", "-q", "-m", name]).status !== 0) return null
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
  writeFileSync(join(primary, ".gitignore"), "node_modules/\n")
  for (const args of [["add", ".gitignore"], ["commit", "-q", "-m", "base"], ["remote", "add", "origin", origin], ["push", "-q", "-u", "origin", "main"]]) {
    if (git(primary, args).status !== 0) return null
  }
  const names = ["merged", "closed", "open", "unpushed", "dirty", "part", "in-use", "unreadable", "locked"]
  const worktrees = Object.fromEntries(names.map((name) => [name, stageWorktree(name)]))
  worktrees.unmerged = stageWorktree("unmerged", { push: false })
  worktrees.contained = stageWorktree("contained", { push: false })
  worktrees.detached = stageWorktree("detached", { detach: true })
  if (Object.values(worktrees).some((worktree) => worktree === null)) return null
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
    one("in-use", 17, "MERGED"), one("locked", 18, "MERGED"), reply("feature/whole", [{ headRefOid: worktrees.part.tip, number: 16, state: "MERGED" }]),
    reply(worktrees.part.branch, []), reply(worktrees.unmerged.branch, []), reply(worktrees.contained.branch, [])]
}

const stageDirectories = (worktrees) => {
  for (const session of [THIS, PREDECESSOR, LIVE, WORKED_IN, STALE]) mkdirSync(join(sessionRoot, session, "scratchpad"), { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, "sentinel.txt"), "must survive\n")
  symlinkSync(outside, join(sessionRoot, STALE, "scratchpad", "outside"), "dir")
  writeFileSync(join(sessionRoot, STALE, "scratchpad", "notes.txt"), "old notes\n")
  for (const [name, hours] of [["durable-0a0a0a0a", 30], ["durable-0b0b0b0b", 20], ["durable-0c0c0c0c", 10]]) {
    mkdirSync(join(carryRoot, name), { recursive: true })
    utimesSync(join(carryRoot, name), new Date(Date.now() - hours * 3_600_000), new Date(Date.now() - hours * 3_600_000))
  }
  mkdirSync(join(configDirectory, "sessions"), { recursive: true })
  // The record shape Claude Code writes for a session that runs; the pid is this live test process.
  writeFileSync(join(configDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: LIVE, cwd: worktrees["in-use"].path }))
}

export const cases = async () => {
  const worktrees = stageRepository()
  T("stale-files: the git fixture stages", worktrees !== null)
  if (worktrees === null) return
  stageDirectories(worktrees)
  const staged = stageWithConfig("stale-cli", TOOL, { ...realOrchestratorConfig(), repos: { ui: primary } })
  mkdirSync(join(staged.base, ".git"))
  writeFileSync(join(staged.base, ".git", "orbit-orchestrate-run.json"), JSON.stringify({ sessionId: THIS, relay: { from: PREDECESSOR, pending: false } }))
  const env = { ...orcaEnv(pullRequestPlan(worktrees)), HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_CODE_SESSION_ID: "" }
  const tool = (argv) => run(TOOL, argv, { path: staged.path, env })
  const session = (id) => join(sessionRoot, id)
  const copy = (name) => join(carryRoot, name)
  const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: session(WORKED_IN), stdio: "ignore" })
  try {
    const listed = tool(["--list", "--json", "--session", THIS, "--session-root", sessionRoot])
    same("stale-files: --list --json exits 0", listed.status, 0)
    const listing = listed.status === 0 ? JSON.parse(listed.stdout) : { stale: [], kept: [] }
    const expectedStale = [session(STALE), copy("durable-0a0a0a0a"), worktrees.merged.path, worktrees.closed.path, worktrees.part.path, worktrees.contained.path].sort()
    same("stale-files: the listing marks each stale class and nothing else", listing.stale.map((item) => item.path).sort(), expectedStale)
    const staleReason = (path) => listing.stale.find((item) => item.path === path)?.reason ?? ""
    for (const [name, path, reason] of [
      ["a session directory", session(STALE), /not this session, its predecessor, or a session with a live process/], ["a durable copy", copy("durable-0a0a0a0a"), /older than the newest two/],
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
      ["a locked worktree", worktrees.locked.path, /locked/], ["the newest durable copy", copy("durable-0c0c0c0c"), /newest two/], ["the second durable copy", copy("durable-0b0b0b0b"), /newest two/],
    ]) T(`stale-files: ${name} is kept`, reason.test(keptReason(path)), `reason: ${keptReason(path)}`)

    const text = tool(["--list", "--session", THIS])
    T("stale-files: --list reuses the stored session root and prints each item, the total and the removal command", text.status === 0
      && text.stdout.includes(`STALE session ${session(STALE)} (`) && /TOTAL 6 items, .* \(1 session directory, 1 durable carry copy, 4 worktrees\)/.test(text.stdout)
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
    T("stale-files: --delete prints what it freed", /^FREED 5 items, .* \(1 session directory, 1 durable carry copy, 3 worktrees\); free space changed by [+-]/m.test(removed.stdout), removed.stdout)
    T("stale-files: a session directory that went stale after the listing survives", existsSync(session(LATER)))
    const keptPaths = [session(THIS), session(PREDECESSOR), session(LIVE), session(WORKED_IN), copy("durable-0b0b0b0b"), copy("durable-0c0c0c0c"),
      ...["open", "unpushed", "dirty", "unmerged", "detached", "in-use", "unreadable", "locked"].map((name) => worktrees[name].path)]
    same("stale-files: every protected item survives", keptPaths.filter((path) => !existsSync(path)), [])
    same("stale-files: a link inside a removed session directory keeps its target", readFileSync(join(outside, "sentinel.txt"), "utf8"), "must survive\n")
    T("stale-files: a removed worktree leaves the worktree list and keeps its branch", !git(primary, ["worktree", "list", "--porcelain"]).stdout.includes(worktrees.merged.path)
      && git(primary, ["rev-parse", "--verify", "--quiet", worktrees.merged.branch]).status === 0)
    same("stale-files: the store holds no stale item after the removal", JSON.parse(readFileSync(join(staged.base, ".git", "orbit-stale-files.json"), "utf8")).stale, [])
    same("stale-files: the same order does not run twice", tool(["--delete", "--listing", listing.listingId, "--session", THIS]).status, 1)
  } finally {
    worker.kill()
  }
}
