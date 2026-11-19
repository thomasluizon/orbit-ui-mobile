/**
 * Stale files of a long run: old session directories and finished worktrees.
 * The listing, its store in the checkout's git directory, the owner offer and the removal live here.
 * Every check fails closed: evidence that cannot be read keeps the item.
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

import { claudeConfigDirectory, gitDirectoryOf, liveSessionProcesses, processIsAlive, readRunState, REPO_ROOT } from "./run-state.mjs"
import { readSessionChain } from "./session-chain.mjs"
import { CLEAN_STATUS_ARGUMENTS, HIDDEN_CHANGE_ARGUMENTS, WORKTREE_REMOVE_ARGUMENTS, findRepositories, hiddenChangesOf, parseWorktreeList } from "./git-worktrees.mjs"
import { WORKER_ACCOUNT, workerAccounts } from "./orchestrator-config.mjs"

/** The hook starts a new listing when the stored one is older than this. */
export const LISTING_MAX_AGE_MS = 15 * 60_000
/** One listing never runs longer than this; an item it did not reach has no size or stays kept. */
const LISTING_CEILING_MS = 10 * 60_000
const COMMAND_TIMEOUT_MS = 30_000
const MEASURE_TIMEOUT_MS = 120_000
/** A worktree with installed dependencies holds several hundred thousand files; a removal that stops halfway leaves a broken tree. */
const REMOVAL_TIMEOUT_MS = 10 * 60_000
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Each container branch costs one GitHub read, and the hourly GitHub budget is shared by every tool. */
const CONTAINER_BRANCH_LIMIT = 10

export const staleFilesStorePath = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-stale-files.json")

const canonical = (path) => {
  try { return realpathSync.native(path) } catch { return resolve(path) }
}
const within = (path, container) => {
  const relation = relative(container, path)
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
}

/** `{ command, directory }` for every process this user can read; null when the process table is unreadable. */
const readProcesses = () => {
  if (process.platform === "linux") {
    return readdirSync("/proc").filter((entry) => /^\d+$/.test(entry)).flatMap((pid) => {
      try {
        return [{ command: readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim(), directory: readlinkSync(`/proc/${pid}/cwd`) }]
      } catch {
        return [] // a process of another user, or one that exited during the read
      }
    })
  }
  const options = { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }
  const table = spawnSync("ps", ["-axww", "-o", "pid=,command="], options)
  // `lsof -F pn` prints one `p<pid>` line, one `fcwd` line and one `n<path>` line for each process.
  const working = spawnSync("lsof", ["-a", "-d", "cwd", "-Fpn"], options)
  if (table.status !== 0 || working.status !== 0) return null
  const directories = new Map()
  let pid = null
  for (const line of working.stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1)
    else if (line.startsWith("n")) directories.set(pid, line.slice(1))
  }
  return table.stdout.split("\n").map((line) => /^\s*(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, processId, command]) => ({ command, directory: directories.get(processId) ?? null }))
}

/**
 * A shell only holds a directory open: Orca leaves a login shell in each worktree it made, for days. A command that the
 * shell runs is its own process with the same directory, and that one counts.
 */
const SHELLS = new Set(["sh", "bash", "zsh", "fish", "dash", "ksh", "csh", "tcsh", "pwsh", "nu"])
const isShell = (command) => SHELLS.has(basename(command.split(" ")[0].replace(/^-/, "")))

/**
 * `{ sessionId, cwd }` for each session that runs, from the records Claude Code keeps in `<config>/sessions`, judged by the
 * run state's own reader. A record it cannot judge throws.
 */
const readLiveSessions = (configDirectories) => configDirectories.flatMap((directory) => liveSessionProcesses(directory)
  .map((live) => ({ sessionId: live.sessionId, cwd: live.cwd ?? null })))

/**
 * The Claude config directories whose session records the listing reads: this session's, the default one, and the worker
 * account's, which the variable that `workers.claude.configDirEnv` of `config` names gives, as the worker launch reads it.
 */
export const claudeConfigDirectories = (config, environment = process.env) => {
  const worker = workerAccounts("claude", config.workers?.claude, environment).find((account) => account.name === WORKER_ACCOUNT)
  return [...new Set([claudeConfigDirectory(), join(homedir(), ".claude"), worker?.configDirectory].filter((directory) => typeof directory === "string")
    .map((directory) => resolve(directory)))]
}

const runGit = (cwd, args, timeoutMs = COMMAND_TIMEOUT_MS) => {
  const result = spawnSync(process.env.GIT_BIN || "git", ["-C", cwd, ...args], { encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 })
  return result.status === 0 ? result.stdout.trim() : null
}

/** Every pull request of `branch`, as gh prints `number`, `state` (OPEN, CLOSED, MERGED) and `headRefOid`; null when unreadable. */
const readPullRequests = (worktreePath, branch) => {
  const result = spawnSync(process.env.GH_BIN || "gh", ["pr", "list", "--head", branch, "--state", "all", "--limit", "20", "--json", "number,state,headRefOid"],
    { cwd: worktreePath, encoding: "utf8", timeout: COMMAND_TIMEOUT_MS })
  if (result.status !== 0) return null
  try {
    const pullRequests = JSON.parse(result.stdout)
    return Array.isArray(pullRequests) ? pullRequests : null
  } catch {
    return null
  }
}

/** Bytes as `du` counts them. A cloned file counts in full for each copy, so the total can exceed the physical share. */
const measureBytes = (path) => {
  const result = spawnSync("du", ["-sk", path], { encoding: "utf8", timeout: MEASURE_TIMEOUT_MS })
  const kilobytes = /^(\d+)\s/.exec(result.stdout ?? "")
  return kilobytes ? Number(kilobytes[1]) * 1024 : null
}

export const systemProbes = { processes: readProcesses, liveSessions: readLiveSessions, git: runGit, pullRequests: readPullRequests, measure: measureBytes,
  repositories: findRepositories }

/**
 * This checkout and, for a linked worktree, its primary checkout. The run writes its record and its chain ledger in the
 * checkout it runs in, and a session in a linked worktree lists and removes too.
 */
const runCheckoutsOf = (repoRoot) => {
  const gitDirectory = gitDirectoryOf(repoRoot)
  const commonMarker = join(gitDirectory, "commondir")
  const primary = existsSync(commonMarker) ? dirname(resolve(gitDirectory, readFileSync(commonMarker, "utf8").trim())) : repoRoot
  return [...new Set([resolve(repoRoot), resolve(primary)])]
}

/**
 * This session, the run session, a live session, the session each of them took over from, and a successor the run
 * nominated: each one still reads its scratchpad. The run record counts whatever session reads it, so a second session
 * in the checkout or in a linked worktree never removes the relay pair of the run.
 */
const protectedSessionsOf = (sessionId, repoRoot = REPO_ROOT, liveSessionIds = []) => {
  const sessions = new Map([[sessionId, "this session"]])
  const add = (id, reason) => {
    if (typeof id === "string" && id !== "" && !sessions.has(id)) sessions.set(id, reason)
  }
  const checkouts = runCheckoutsOf(repoRoot)
  const heads = new Map(liveSessionIds.map((id) => [id, `live session ${id.slice(0, 8)}`]))
  for (const state of checkouts.map((checkout) => readRunState(checkout))) {
    const runSession = typeof state?.sessionId === "string" && state.sessionId !== "" ? state.sessionId : null
    const runName = runSession === sessionId ? "this session" : "the run session"
    add(runSession, "the run session")
    add(state?.relay?.from, `the predecessor of ${runName}`)
    add(state?.relay?.successorSessionId, `the nominated successor of ${runName}`)
    if (runSession) heads.set(runSession, runName)
  }
  heads.set(sessionId, "this session")
  for (const chain of checkouts.flatMap((checkout) => readSessionChain(checkout).chains)) {
    for (const entry of chain.entries ?? []) {
      if (heads.has(entry.successorSessionId)) add(entry.sessionId, `the predecessor of ${heads.get(entry.successorSessionId)}`)
    }
  }
  return sessions
}

/** Linked worktrees of one repository, from `git worktree list --porcelain`; null when git cannot list them. */
const listWorktrees = (repositoryPath, probes) => {
  const porcelain = probes.git(repositoryPath, ["worktree", "list", "--porcelain"])
  if (porcelain === null) return null
  return parseWorktreeList(porcelain).slice(1).map((worktree) => ({ repository: repositoryPath, path: worktree.path, branch: worktree.branch,
    locked: worktree.locked, missing: worktree.prunable || !existsSync(worktree.path) }))
}

/**
 * The live sessions, and why they are unknown: a record that cannot be read, or no record of the listing session itself,
 * which always runs. Unknown live sessions keep every item that a live session could use.
 */
const readLiveSessionEvidence = (context, probes) => {
  let liveSessions
  try { liveSessions = probes.liveSessions(context.configDirectories) }
  catch (error) { return { liveSessions: [], liveSessionsUnknown: `the live sessions could not be read: ${error.message}` } }
  const seen = liveSessions.some((live) => live.sessionId === context.sessionId)
  return { liveSessions, liveSessionsUnknown: seen ? null
    : `no live session record names this session ${context.sessionId.slice(0, 8)} in ${context.configDirectories.join(", ") || "any Claude config directory"}, so the live sessions are unknown` }
}

/** What every class reads once: the process table, the live sessions, the protected sessions and the worktrees. */
const gatherEvidence = (context, probes) => {
  const listed = Object.values(context.repositories).filter((path) => existsSync(path)).map((path) => ({ path, worktrees: listWorktrees(path, probes) }))
  const worktrees = listed.flatMap((repository) => repository.worktrees ?? [])
    .filter((worktree) => !worktree.missing).map((worktree) => ({ ...worktree, path: canonical(worktree.path) }))
  const { liveSessions, liveSessionsUnknown } = readLiveSessionEvidence(context, probes)
  return { sessionRoot: context.sessionRoot ? canonical(context.sessionRoot) : null, worktrees,
    unlistedRepositories: listed.filter((repository) => repository.worktrees === null).map((repository) => repository.path),
    protectedSessions: protectedSessionsOf(context.sessionId, context.repoRoot, liveSessions.map((live) => live.sessionId)), processes: probes.processes(),
    liveSessions, liveSessionsUnknown }
}

/** Why a live process or session still uses `path`; null when none does. An unreadable process table or unknown live sessions count as in use. */
const useOf = (path, evidence, sessionId = null) => {
  if (evidence.processes === null) return "the process table could not be read"
  if (evidence.liveSessionsUnknown) return evidence.liveSessionsUnknown
  const session = evidence.liveSessions.find((live) => live.sessionId === sessionId || (live.cwd && within(canonical(live.cwd), path)))
  if (session) return `live session ${session.sessionId.slice(0, 8)} uses it`
  if (evidence.processes.some((entry) => entry.directory !== null && !isShell(entry.command) && within(entry.directory, path))) return "a live process works in it"
  if (evidence.processes.some((entry) => entry.command.includes(path) || (sessionId !== null && entry.command.includes(sessionId)))) return "a live process names it"
  return null
}

/**
 * Why the tree at `path` holds a change; null when it holds none. A change that `git status` shows, and a path whose change
 * it cannot show: a tracked file with an index flag, or an untracked file that only a personal exclude source ignores.
 * A read that fails keeps the tree too, and its reason names the read, never a change that nobody saw.
 */
const changeOf = (path, probes) => {
  const status = probes.git(path, CLEAN_STATUS_ARGUMENTS)
  if (status === null) return "git status could not be read"
  if (status !== "") return "it holds an uncommitted change"
  const listing = probes.git(path, HIDDEN_CHANGE_ARGUMENTS)
  if (listing === null) return "git could not list its files"
  const [hidden] = hiddenChangesOf(listing)
  if (hidden === undefined) return null
  return hidden.startsWith("? ") ? `it holds an untracked file that no .gitignore ignores: ${hidden.slice(2)}`
    : `git status cannot show a change to ${hidden.slice(2)}, an assume-unchanged or skip-worktree file`
}

/** Why the commits that `revisions` selects must stay; null when git counts none. A count that git cannot read is no proof of a commit. */
const commitHoldOf = (path, revisions, lost, probes) => {
  const count = probes.git(path, ["rev-list", "--count", ...revisions])
  if (count === null) return "git rev-list could not be read"
  return count === "0" ? null : lost
}

/**
 * Why one registered worktree inside a session directory must stay; null when removing it loses nothing.
 * The worktree class rules apply: a session leaves the tree of an open pull request or an unpushed commit in its scratchpad.
 */
const nestedWorktreeHold = (worktree, probes) => {
  if (worktree.locked) return "it is locked"
  const change = changeOf(worktree.path, probes)
  if (change) return change
  if (worktree.branch !== null) {
    const verdict = judgeBranch(worktree, probes)
    return verdict.stale ? null : verdict.reason
  }
  // A detached HEAD has no branch that outlives the directory, so a commit that no remote has would be lost with it.
  return commitHoldOf(worktree.path, ["HEAD", "--not", "--remotes"], "it holds a commit that no remote has", probes)
}

/**
 * Why a repository that is no registered worktree must stay; null when removing it loses nothing. Its own object store
 * goes with the directory, so a commit on any of its references that no remote has would be lost.
 */
const nestedRepositoryHold = (directory, probes) => {
  // A broken `.git` makes git search upward, and then it reads the repository around this one.
  const top = probes.git(directory, ["rev-parse", "--show-toplevel"])
  if (top === null || canonical(top) !== canonical(directory)) return "git cannot read it"
  const change = changeOf(directory, probes)
  if (change) return change
  return commitHoldOf(directory, ["--all", "--not", "--remotes"], "it holds a commit that no remote has", probes)
}

/**
 * Why an item must stay for what lives under its path: a registered worktree in it must stay. A removal takes the whole tree, and `git worktree remove` takes an ignored
 * directory too, with every worktree in it.
 */
const holdOf = (path, evidence, probes) => {
  // A worktree git could not list is invisible here, and it can be the tree of an open pull request.
  if (evidence.unlistedRepositories.length > 0) return `the worktrees of ${evidence.unlistedRepositories.join(", ")} could not be listed`
  for (const worktree of evidence.worktrees.filter((candidate) => candidate.path !== path && within(candidate.path, path))) {
    const hold = nestedWorktreeHold(worktree, probes)
    if (hold) return `worktree ${worktree.path} in it stays: ${hold}`
  }
  return null
}

/**
 * Why a finished worktree must stay for a repository in its tree that is no registered worktree; null when none must.
 * `git worktree remove` takes an ignored directory, such as `node_modules/`, with every repository in it. A session
 * directory is never walked: it holds the throwaway repositories of a scratchpad, with local commits
 * and no remote, and this rule would keep almost every one of them forever.
 */
const repositoryHoldOf = (path, evidence, probes) => {
  const repositories = probes.repositories(path)
  if (repositories === null) return "the repositories in it could not be listed"
  const registered = new Set(evidence.worktrees.map((worktree) => worktree.path))
  for (const directory of repositories.filter((candidate) => !registered.has(canonical(candidate)))) {
    const hold = nestedRepositoryHold(directory, probes)
    if (hold) return `repository ${directory} in it stays: ${hold}`
  }
  return null
}

/** Each session directory under `sessionRoot` with the reason a session still owns it (null when none does); null when the root cannot be read. */
const readSessions = (sessionRoot, evidence) => {
  let names
  try { names = readdirSync(sessionRoot).filter((name) => SESSION_ID.test(name)) } catch { return null }
  // A removal by another session or the system's /tmp clean can take an entry after the listing; any error but ENOENT throws.
  return names.map((name) => ({ name, path: join(sessionRoot, name) })).filter((session) => lstatSync(session.path, { throwIfNoEntry: false })?.isDirectory())
    .map((session) => ({ ...session, owner: evidence.protectedSessions.get(session.name) ?? useOf(session.path, evidence, session.name) }))
}

/**
 * The session directories of every other project root beside the listing's own one: Claude Code keeps
 * `<session base>/<project>/<session id>/scratchpad`, and the run session or a live session can work in another project,
 * such as the primary checkout of a linked worktree. Null when the session base or one of its roots cannot be read.
 */
const readOtherSessions = (evidence) => {
  if (evidence.sessionRoot === null) return null
  const base = dirname(evidence.sessionRoot)
  let roots
  try { roots = readdirSync(base).map((name) => join(base, name)).filter((root) => root !== evidence.sessionRoot && lstatSync(root).isDirectory()) } catch { return null }
  const sessions = roots.map((root) => readSessions(root, evidence))
  return sessions.includes(null) ? null : sessions.flat()
}

/** Why a worktree in the session directory of another project root stays: that session stays, or it cannot be told. */
const otherSessionHoldOf = (path, evidence) => {
  if (evidence.otherSessions === null) {
    return path.split(sep).some((part) => SESSION_ID.test(part)) ? "it is in a session directory, and the session directories of the other project roots could not be read" : null
  }
  const session = evidence.otherSessions.find((candidate) => within(path, candidate.path))
  return session?.owner ? `it is in the directory of session ${session.name.slice(0, 8)}, which stays: ${session.owner}` : null
}

const classifySessions = (sessions, evidence, probes) => sessions.map((session) => {
  const keep = session.owner ?? holdOf(session.path, evidence, probes)
  return { kind: "session", path: session.path, stale: keep === null, reason: keep ?? "not this session, its predecessor, or a session with a live process" }
})

/** A pull request head that GitHub holds; fetched when this clone never saw it. False when it stays unreadable. */
const hasPullRequestHead = (worktree, pullRequest, probes) => {
  const present = () => probes.git(worktree.path, ["cat-file", "-e", `${pullRequest.headRefOid}^{commit}`]) !== null
  if (present()) return true
  probes.git(worktree.path, ["fetch", "--quiet", "origin", `refs/pull/${pullRequest.number}/head`])
  return present()
}

/**
 * A branch with no pull request is finished only when a merged branch holds every commit of it. `{ container }` names that
 * branch. `{ unread }` names the first read that failed when none was found: a failed read is no proof of work nobody merged.
 */
const mergedContainerOf = (worktree, tip, probes) => {
  const unread = []
  const contains = (container) => {
    const outside = probes.git(worktree.path, ["rev-list", "--count", tip, "--not", container])
    if (outside === null) unread.push("git rev-list could not be read")
    return outside === "0"
  }
  const base = probes.git(worktree.path, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) ?? "origin/main"
  if (contains(base)) return { container: `its branch is contained in ${base}` }
  const branches = probes.git(worktree.path, ["for-each-ref", "--contains", tip, "--format=%(refname:short)", "refs/heads"])
  if (branches === null) unread.push("git for-each-ref could not be read")
  for (const branch of (branches ?? "").split("\n").filter((name) => name && name !== worktree.branch).slice(0, CONTAINER_BRANCH_LIMIT)) {
    const pullRequests = probes.pullRequests(worktree.path, branch)
    if (pullRequests === null) unread.push(`the pull request state of ${branch} could not be read`)
    const merged = (pullRequests ?? []).filter((pullRequest) => pullRequest.state === "MERGED").find((pullRequest) => {
      if (hasPullRequestHead(worktree, pullRequest, probes)) return contains(pullRequest.headRefOid)
      unread.push(`the head of pull request #${pullRequest.number} could not be read`)
      return false
    })
    if (merged) return { container: `its branch is contained in ${branch}, which pull request #${merged.number} merged` }
  }
  return { unread: unread[0] ?? null }
}

/** `{ stale, reason }` for one clean, idle worktree with a branch, from its pull requests and its commits. */
const judgeBranch = (worktree, probes) => {
  const tip = probes.git(worktree.path, ["rev-parse", "HEAD"])
  if (tip === null) return { stale: false, reason: "git rev-parse could not be read" }
  const pullRequests = probes.pullRequests(worktree.path, worktree.branch)
  if (pullRequests === null) return { stale: false, reason: "its pull request state could not be read" }
  const open = pullRequests.find((pullRequest) => pullRequest.state === "OPEN")
  if (open) return { stale: false, reason: `pull request #${open.number} is open` }
  if (pullRequests.length === 0) {
    const { container, unread } = mergedContainerOf(worktree, tip, probes)
    return container ? { stale: true, reason: container }
      : { stale: false, reason: unread ?? "it holds work nobody merged: no pull request, and no merged branch contains its branch" }
  }
  const readHeads = pullRequests.filter((pullRequest) => hasPullRequestHead(worktree, pullRequest, probes))
  const unreadHead = pullRequests.find((pullRequest) => !readHeads.includes(pullRequest))
  // With a head that could not be read, a commit outside the other heads is no proof of a commit that nobody has.
  const unpushed = commitHoldOf(worktree.path, [tip, "--not", ...readHeads.map((pullRequest) => pullRequest.headRefOid), "--remotes"],
    unreadHead ? `the head of pull request #${unreadHead.number} could not be read` : "it holds a commit that no remote and no pull request has", probes)
  if (unpushed) return { stale: false, reason: unpushed }
  const finished = pullRequests.find((pullRequest) => pullRequest.state === "MERGED") ?? pullRequests[0]
  return { stale: true, reason: `pull request #${finished.number} ${finished.state === "MERGED" ? "merged" : "closed"}` }
}

const classifyWorktrees = (evidence, probes, deadline) => evidence.worktrees
  // A worktree inside a session directory belongs to that item, not to this class.
  .filter((worktree) => !(evidence.sessionRoot && within(worktree.path, evidence.sessionRoot)))
  .map((worktree) => {
    const keep = (worktree.branch === null ? "its HEAD is detached, so no branch proves its work merged" : null)
      ?? (worktree.locked ? "it is locked" : null) ?? useOf(worktree.path, evidence) ?? otherSessionHoldOf(worktree.path, evidence)
      ?? changeOf(worktree.path, probes)
      ?? (Date.now() > deadline ? "the listing reached its time limit before this check" : null)
    const verdict = keep === null ? judgeBranch(worktree, probes) : { stale: false, reason: keep }
    // Only a finished worktree pays for the walk of its tree, and only inside the listing's time limit.
    const hold = !verdict.stale ? null : Date.now() > deadline ? "the listing reached its time limit before this check"
      : holdOf(worktree.path, evidence, probes) ?? repositoryHoldOf(worktree.path, evidence, probes)
    return { kind: "worktree", path: worktree.path, repository: worktree.repository, ...(hold ? { stale: false, reason: hold } : verdict) }
  })

/** A removal takes everything under its path, so an item stays while a kept item lives in it. */
const keepContainers = (items) => {
  const kept = items.filter((item) => !item.stale)
  return items.map((item) => {
    const inner = item.stale ? kept.find((candidate) => candidate.path !== item.path && within(candidate.path, item.path)) : undefined
    return inner ? { ...item, stale: false, reason: `${KIND_NAMES[inner.kind][0]} ${inner.path} in it stays: ${inner.reason}` } : item
  })
}

/** A stable name for one exact set of stale items, so a removal acts only on the set the owner saw. */
export const listingIdOf = (stale) => createHash("sha256").update(stale.map((item) => `${item.kind}\t${item.path}`).sort().join("\n")).digest("hex").slice(0, 12)

/**
 * The complete listing for `context`: `{ sessionId, sessionRoot, repositories, configDirectories, repoRoot }`.
 * `knownSizes` maps a path to the bytes an earlier listing measured, so each stale item is measured once.
 * `unlistedRepositories` names each repository whose worktrees git could not list: its worktrees are no item of the listing.
 */
export const collectListing = (context, { probes = systemProbes, knownSizes = new Map(), measure = true, now = Date.now() } = {}) => {
  const deadline = now + LISTING_CEILING_MS
  const gathered = gatherEvidence(context, probes)
  const sessions = gathered.sessionRoot === null ? null : readSessions(gathered.sessionRoot, gathered)
  const otherSessions = readOtherSessions(gathered)
  const evidence = { ...gathered, otherSessions }
  const items = keepContainers([...classifySessions(sessions ?? [], evidence, probes), ...classifyWorktrees(evidence, probes, deadline)])
  const stale = items.filter((item) => item.stale).map(({ stale: _stale, ...item }) => ({ ...item,
    bytes: knownSizes.get(item.path) ?? (measure && Date.now() <= deadline ? probes.measure(item.path) : null) }))
  const kept = items.filter((item) => !item.stale).map(({ kind, path, reason }) => ({ kind, path, reason }))
  return { version: 1, generatedAt: new Date(now).toISOString(), listingId: listingIdOf(stale),
    context: { sessionId: context.sessionId, sessionRoot: evidence.sessionRoot }, stale, kept, unlistedRepositories: evidence.unlistedRepositories }
}

export const readStoredListing = (repoRoot = REPO_ROOT) => {
  try {
    const listing = JSON.parse(readFileSync(staleFilesStorePath(repoRoot), "utf8"))
    return listing?.version === 1 && Array.isArray(listing.stale) ? listing : null
  } catch {
    return null
  }
}

export const writeStoredListing = (listing, repoRoot = REPO_ROOT) => {
  const path = staleFilesStorePath(repoRoot)
  const unpublished = `${path}.${randomUUID()}.unpublished`
  writeFileSync(unpublished, `${JSON.stringify(listing, null, 2)}\n`, { flag: "wx" })
  renameSync(unpublished, path)
}

const refreshMarkerPath = (repoRoot) => join(gitDirectoryOf(repoRoot), "orbit-stale-files-refresh.json")

/** Is a new listing due: the stored one is absent or old, and no listing that an earlier prompt started still runs? */
export const refreshIsDue = (listing, repoRoot = REPO_ROOT, now = Date.now()) => {
  if (listing && now - Date.parse(listing.generatedAt) < LISTING_MAX_AGE_MS) return false
  try {
    const marker = JSON.parse(readFileSync(refreshMarkerPath(repoRoot), "utf8"))
    return !(processIsAlive(marker.pid) && now - marker.startedAt < 2 * LISTING_CEILING_MS)
  } catch {
    return true
  }
}

/** Starts one detached listing and records its pid. The prompt never waits for it. */
export const startRefresh = (sessionId, sessionRoot, repoRoot = REPO_ROOT, now = Date.now()) => {
  const child = spawn(process.execPath, [join(repoRoot, "tools", "stale-files.mjs"), "--list", "--session", sessionId, ...(sessionRoot ? ["--session-root", sessionRoot] : [])],
    { cwd: repoRoot, detached: true, stdio: "ignore", windowsHide: true })
  child.unref()
  writeFileSync(refreshMarkerPath(repoRoot), `${JSON.stringify({ pid: child.pid, startedAt: now })}\n`)
}

export const knownSizesOf = (listing) => new Map((listing?.stale ?? []).filter((item) => Number.isFinite(item.bytes)).map((item) => [item.path, item.bytes]))

const UNITS = ["B", "KB", "MB", "GB", "TB"]
export const describeBytes = (bytes) => {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`
}

const KIND_NAMES = { session: ["session directory", "session directories"], worktree: ["worktree", "worktrees"] }

/** `19 items, 120.4 GB (12 session directories, 7 worktrees)`. */
export const summarize = (stale) => {
  const measured = stale.filter((item) => Number.isFinite(item.bytes))
  const unmeasured = stale.length - measured.length
  const size = `${describeBytes(measured.reduce((total, item) => total + item.bytes, 0))}${unmeasured > 0 ? ` and ${unmeasured} not measured` : ""}`
  const classes = Object.entries(KIND_NAMES).map(([kind, [one, many]]) => [stale.filter((item) => item.kind === kind).length, one, many])
    .filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
  return `${stale.length} ${stale.length === 1 ? "item" : "items"}, ${size} (${classes.join(", ")})`
}

/** The context a prompt hook adds while stale items exist; null when the stored listing has none that still exist. */
export const offerOf = (listing, sessionId) => {
  const ownDirectory = listing?.context?.sessionRoot && sessionId ? join(listing.context.sessionRoot, sessionId) : null
  const stale = (listing?.stale ?? []).filter((item) => item.path !== ownDirectory && existsSync(item.path))
  if (stale.length === 0) return null
  return `Stale files on this machine: ${summarize(stale)}. Offer this cleanup to the owner in one line that gives the total size and the item count. ` +
    `Delete only after the owner says yes in a prompt: node tools/stale-files.mjs --delete --listing ${listing.listingId}. ` +
    "The command node tools/stale-files.mjs --list shows each item and the reason it is stale."
}

const freeBytes = (path) => {
  const volume = statfsSync(path)
  return Number(volume.bavail) * Number(volume.bsize)
}

/** The nearest directory at or above `path` that still exists: the removal of a worktree takes the parent of a worktree inside it. */
const existingAncestor = (path) => (existsSync(path) || dirname(path) === path ? path : existingAncestor(dirname(path)))

/** A session directory: only a real directory directly under its root. A link is never followed. */
const removeDirectory = (item, root) => {
  if (root === null || dirname(item.path) !== root || !lstatSync(item.path).isDirectory()) throw new Error(`${item.path} is not a directory directly under ${root}`)
  rmSync(item.path, { recursive: true, force: true })
}

/**
 * Git refuses a tree with a change that its `git status` shows, whatever `status.showUntrackedFiles` or `core.excludesFile`
 * says, and a locked one. Its refusal cannot see a change that an index flag hides or a file that only `info/exclude`
 * ignores, so the same check as the listing's runs first. A file that a `.gitignore` ignores goes with the tree. The local
 * branch stays.
 */
const removeWorktree = (item, probes) => {
  const change = changeOf(item.path, probes)
  if (change) throw new Error(`${item.path} was not removed: ${change}`)
  if (probes.git(item.repository, [...WORKTREE_REMOVE_ARGUMENTS, item.path], REMOVAL_TIMEOUT_MS) === null) throw new Error(`git worktree remove refused ${item.path}`)
}

/**
 * Why `fresh` holds no record of a stored item. Only a path that is gone "no longer exists": the worktrees of a repository
 * that git could not list, and the items of a root that could not be read, are still on disk.
 */
const absenceOf = (item, fresh) => {
  if (item.kind === "worktree" && fresh.unlistedRepositories.includes(item.repository)) return `the worktrees of ${item.repository} could not be listed`
  return lstatSync(item.path, { throwIfNoEntry: false }) ? "the listing at the removal does not hold it" : "it no longer exists"
}

/**
 * Removes the items of `stored` that `fresh` still calls stale, and nothing else. Returns `{ removed, skipped, failed, freed }`:
 * `freed` is the change of free space on the volumes the removed items were on.
 */
export const removeListed = (stored, fresh, repositories, { probes = systemProbes } = {}) => {
  const stillStale = new Map(fresh.stale.map((item) => [`${item.kind}\t${item.path}`, item]))
  const keptNow = new Map(fresh.kept.map((item) => [`${item.kind}\t${item.path}`, item.reason]))
  const outcome = { removed: [], skipped: [], failed: [], freed: 0 }
  const volumes = new Map()
  // The deepest item goes first: git then removes a worktree inside another one itself, and a failed one keeps its container.
  for (const item of [...stored.stale].sort((left, right) => right.path.length - left.path.length)) {
    const key = `${item.kind}\t${item.path}`
    if (!stillStale.has(key)) {
      outcome.skipped.push({ ...item, reason: keptNow.get(key) ?? absenceOf(item, fresh) })
      continue
    }
    const failedInside = outcome.failed.find((inner) => within(inner.path, item.path))
    if (failedInside) {
      outcome.skipped.push({ ...item, reason: `${failedInside.path} in it could not be removed` })
      continue
    }
    try {
      const parent = dirname(item.path)
      const device = statSync(parent).dev
      if (!volumes.has(device)) volumes.set(device, { path: parent, before: freeBytes(parent) })
      if (item.kind === "worktree") removeWorktree(stillStale.get(key), probes)
      else removeDirectory(item, fresh.context.sessionRoot)
      outcome.removed.push(item)
    } catch (error) {
      outcome.failed.push({ ...item, reason: error.message })
    }
  }
  // A removed session directory can hold a registered worktree; its registration now names a missing directory.
  if (outcome.removed.some((item) => item.kind !== "worktree")) {
    for (const repository of Object.values(repositories).filter((path) => existsSync(path))) probes.git(repository, ["worktree", "prune"])
  }
  for (const volume of volumes.values()) outcome.freed += freeBytes(existingAncestor(volume.path)) - volume.before
  return outcome
}
