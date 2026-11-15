/**
 * Stale files of a long run: old session directories, old durable carry copies and finished worktrees.
 * The listing, its store in the checkout's git directory, the owner offer and the removal live here.
 * Every check fails closed: evidence that cannot be read keeps the item.
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

import { claudeConfigDirectory, gitDirectoryOf, processIsAlive, readRunState, REPO_ROOT } from "./run-state.mjs"
import { readSessionChain } from "./session-chain.mjs"

/** The hook starts a new listing when the stored one is older than this. */
export const LISTING_MAX_AGE_MS = 15 * 60_000
/** One listing never runs longer than this; an item it did not reach has no size or stays kept. */
export const LISTING_CEILING_MS = 10 * 60_000
const COMMAND_TIMEOUT_MS = 30_000
const MEASURE_TIMEOUT_MS = 120_000
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DURABLE_COPY = /^durable-([0-9a-f]{8})/
const LINK_HOP_LIMIT = 40

export const staleFilesStorePath = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-stale-files.json")
export const defaultCarryRoot = () => join(homedir(), ".orbit-run-carry")

const canonical = (path) => {
  try { return realpathSync.native(path) } catch { return resolve(path) }
}
const within = (path, container) => {
  const relation = relative(container, path)
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
}

/** `{ command, directory }` for every process this user can read; null when the process table is unreadable. */
export const readProcesses = () => {
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

/** Claude Code keeps one `{ pid, sessionId, cwd }` record for each session that runs, in `<config>/sessions`. */
export const readLiveSessions = (configDirectories) => configDirectories.flatMap((directory) => {
  let names
  try { names = readdirSync(join(directory, "sessions")).filter((name) => name.endsWith(".json")) } catch { return [] }
  return names.flatMap((name) => {
    try {
      const record = JSON.parse(readFileSync(join(directory, "sessions", name), "utf8"))
      return processIsAlive(record?.pid) && typeof record.sessionId === "string" ? [{ sessionId: record.sessionId, cwd: record.cwd ?? null }] : []
    } catch {
      return []
    }
  })
})

export const claudeConfigDirectories = (environment = process.env) => [...new Set([
  claudeConfigDirectory(), join(homedir(), ".claude"), environment.ORBIT_WORKER_CLAUDE_CONFIG_DIR,
].filter((directory) => typeof directory === "string" && directory !== "").map((directory) => resolve(directory)))]

const runGit = (cwd, args) => {
  const result = spawnSync(process.env.GIT_BIN || "git", ["-C", cwd, ...args], { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 })
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

export const systemProbes = { processes: readProcesses, liveSessions: readLiveSessions, git: runGit, pullRequests: readPullRequests, measure: measureBytes }

/** Each place a symbolic link passes through, hop by hop, so a link that points at a second link protects both targets. */
const linkHops = (link) => {
  const hops = []
  let current = link
  for (let hop = 0; hop < LINK_HOP_LIMIT; hop += 1) {
    let target
    try {
      if (!lstatSync(current).isSymbolicLink()) break
      target = resolve(dirname(current), readlinkSync(current))
    } catch {
      break
    }
    // Only the parent is made canonical: the last name can be the next link of the chain.
    hops.push(join(canonical(dirname(target)), basename(target)))
    current = target
  }
  return hops
}

/** Where the top-level links of one scratchpad point. The relay carry links build directories and never copies them. */
const scratchpadLinks = (session) => {
  const scratchpad = join(session.path, "scratchpad")
  let names
  try { names = readdirSync(scratchpad) } catch { return [] }
  return names.flatMap((name) => linkHops(join(scratchpad, name)).map((target) => ({ sessionId: session.name, target })))
}

/** This session, the session it took over from, and a successor it nominated: each one still reads its scratchpad. */
export const protectedSessionsOf = (sessionId, repoRoot = REPO_ROOT) => {
  const sessions = new Map([[sessionId, "this session"]])
  const state = readRunState(repoRoot)
  if (state?.sessionId === sessionId) {
    if (typeof state.relay?.from === "string") sessions.set(state.relay.from, "the predecessor of this session")
    if (typeof state.relay?.successorSessionId === "string") sessions.set(state.relay.successorSessionId, "the nominated successor of this session")
  }
  for (const chain of readSessionChain(repoRoot).chains) {
    for (const entry of chain.entries ?? []) {
      if (entry.successorSessionId === sessionId && !sessions.has(entry.sessionId)) sessions.set(entry.sessionId, "the predecessor of this session")
    }
  }
  return sessions
}

/** Linked worktrees of one repository, from `git worktree list --porcelain`; null when git cannot list them. */
const listWorktrees = (repositoryPath, probes) => {
  const porcelain = probes.git(repositoryPath, ["worktree", "list", "--porcelain"])
  if (porcelain === null) return null
  return porcelain.split(/\n\s*\n/).filter(Boolean).slice(1).map((record) => {
    const fields = Object.fromEntries(record.split("\n").map((line) => {
      const separator = line.indexOf(" ")
      return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)]
    }))
    return { repository: repositoryPath, path: fields.worktree, branch: typeof fields.branch === "string" ? fields.branch.replace(/^refs\/heads\//, "") : null,
      locked: fields.locked !== undefined, missing: fields.prunable !== undefined || !existsSync(fields.worktree) }
  })
}

/** What every class reads once: the process table, the live sessions, the protected sessions and the worktrees. */
const gatherEvidence = (context, probes) => {
  const worktrees = Object.values(context.repositories).filter((path) => existsSync(path)).flatMap((path) => listWorktrees(path, probes) ?? [])
    .filter((worktree) => !worktree.missing).map((worktree) => ({ ...worktree, path: canonical(worktree.path) }))
  return { sessionRoot: context.sessionRoot ? canonical(context.sessionRoot) : null, carryRoot: canonical(context.carryRoot), worktrees,
    protectedSessions: protectedSessionsOf(context.sessionId, context.repoRoot), processes: probes.processes(),
    liveSessions: probes.liveSessions(context.configDirectories) }
}

/** Why a live process or session still uses `path`; null when none does. An unreadable process table counts as in use. */
const useOf = (path, evidence, sessionId = null) => {
  if (evidence.processes === null) return "the process table could not be read"
  const session = evidence.liveSessions.find((live) => live.sessionId === sessionId || (live.cwd && within(canonical(live.cwd), path)))
  if (session) return `live session ${session.sessionId.slice(0, 8)} uses it`
  if (evidence.processes.some((entry) => entry.directory !== null && !isShell(entry.command) && within(entry.directory, path))) return "a live process works in it"
  if (evidence.processes.some((entry) => entry.command.includes(path) || (sessionId !== null && entry.command.includes(sessionId)))) return "a live process names it"
  return null
}

/** Why a directory outside the worktree class must stay: the scratchpad of a session that stays links into it, or it holds unsaved work. */
const holdOf = (path, evidence, probes) => {
  const link = evidence.links.find((entry) => within(entry.target, path))
  if (link) return `the scratchpad of session ${link.sessionId.slice(0, 8)} links into it`
  const dirty = evidence.worktrees.find((worktree) => within(worktree.path, path) && probes.git(worktree.path, ["status", "--porcelain"]) !== "")
  return dirty ? `worktree ${dirty.path} in it holds an uncommitted change` : null
}

/** Each session directory with the reason a session still owns it; null when no session does. */
const readSessions = (evidence) => {
  if (evidence.sessionRoot === null) return []
  let names
  try { names = readdirSync(evidence.sessionRoot).filter((name) => SESSION_ID.test(name)) } catch { return [] }
  return names.map((name) => ({ name, path: join(evidence.sessionRoot, name) })).filter((session) => lstatSync(session.path).isDirectory())
    .map((session) => ({ ...session, owner: evidence.protectedSessions.get(session.name) ?? useOf(session.path, evidence, session.name) }))
}

const classifySessions = (sessions, evidence, probes) => sessions.map((session) => {
  const keep = session.owner ?? holdOf(session.path, evidence, probes)
  return { kind: "session", path: session.path, stale: keep === null, reason: keep ?? "not this session, its predecessor, or a session with a live process" }
})

const classifyCarryCopies = (evidence, probes) => {
  let names
  try { names = readdirSync(evidence.carryRoot).filter((name) => DURABLE_COPY.test(name)) } catch { return [] }
  const copies = names.map((name) => ({ name, path: join(evidence.carryRoot, name), entry: lstatSync(join(evidence.carryRoot, name)) }))
    .filter((copy) => copy.entry.isDirectory())
    .sort((left, right) => right.entry.mtimeMs - left.entry.mtimeMs || right.name.localeCompare(left.name))
  const protectedPrefixes = new Map([...evidence.protectedSessions].map(([sessionId, reason]) => [sessionId.slice(0, 8), reason]))
  return copies.map((copy, position) => {
    const owner = protectedPrefixes.get(DURABLE_COPY.exec(copy.name)[1])
    const keep = (position < 2 ? "one of the newest two durable copies" : null) ?? (owner ? `the durable copy of ${owner}` : null)
      ?? useOf(copy.path, evidence) ?? holdOf(copy.path, evidence, probes)
    return { kind: "carry", path: copy.path, stale: keep === null, reason: keep ?? "older than the newest two durable copies" }
  })
}

const isAncestor = (worktree, commit, container, probes) => probes.git(worktree.path, ["merge-base", "--is-ancestor", commit, container]) !== null

/** A pull request head that GitHub holds; fetched when this clone never saw it. False when it stays unreadable. */
const hasPullRequestHead = (worktree, pullRequest, probes) => {
  const present = () => probes.git(worktree.path, ["cat-file", "-e", `${pullRequest.headRefOid}^{commit}`]) !== null
  if (present()) return true
  probes.git(worktree.path, ["fetch", "--quiet", "origin", `refs/pull/${pullRequest.number}/head`])
  return present()
}

/** A branch with no pull request is finished only when a merged branch holds every commit of it. */
const mergedContainerOf = (worktree, tip, probes) => {
  const symbolic = probes.git(worktree.path, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
  const base = symbolic ?? "origin/main"
  if (isAncestor(worktree, tip, base, probes)) return `its branch is contained in ${base}`
  const containers = (probes.git(worktree.path, ["for-each-ref", "--contains", tip, "--format=%(refname:short)", "refs/heads"]) ?? "")
    .split("\n").filter((branch) => branch && branch !== worktree.branch)
  for (const branch of containers) {
    const merged = (probes.pullRequests(worktree.path, branch) ?? []).find((pullRequest) => pullRequest.state === "MERGED"
      && hasPullRequestHead(worktree, pullRequest, probes) && isAncestor(worktree, tip, pullRequest.headRefOid, probes))
    if (merged) return `its branch is contained in ${branch}, which pull request #${merged.number} merged`
  }
  return null
}

/** `{ stale, reason }` for one clean, idle worktree with a branch, from its pull requests and its commits. */
const judgeBranch = (worktree, probes) => {
  const tip = probes.git(worktree.path, ["rev-parse", "HEAD"])
  const pullRequests = probes.pullRequests(worktree.path, worktree.branch)
  if (tip === null || pullRequests === null) return { stale: false, reason: "its pull request state could not be read" }
  const open = pullRequests.find((pullRequest) => pullRequest.state === "OPEN")
  if (open) return { stale: false, reason: `pull request #${open.number} is open` }
  if (pullRequests.length === 0) {
    const container = mergedContainerOf(worktree, tip, probes)
    return container ? { stale: true, reason: container } : { stale: false, reason: "it holds work nobody merged: no pull request, and no merged branch contains its branch" }
  }
  const heads = pullRequests.filter((pullRequest) => hasPullRequestHead(worktree, pullRequest, probes)).map((pullRequest) => pullRequest.headRefOid)
  const unpushed = probes.git(worktree.path, ["rev-list", "--count", tip, "--not", ...heads, "--remotes"])
  if (unpushed !== "0") return { stale: false, reason: "it holds a commit that no remote and no pull request has" }
  const finished = pullRequests.find((pullRequest) => pullRequest.state === "MERGED") ?? pullRequests[0]
  return { stale: true, reason: `pull request #${finished.number} ${finished.state === "MERGED" ? "merged" : "closed"}` }
}

const classifyWorktrees = (evidence, probes, deadline) => evidence.worktrees
  // A worktree inside a session directory or a carry copy belongs to that item, not to this class.
  .filter((worktree) => !(evidence.sessionRoot && within(worktree.path, evidence.sessionRoot)) && !within(worktree.path, evidence.carryRoot))
  .map((worktree) => {
    const keep = (worktree.branch === null ? "its HEAD is detached, so no branch proves its work merged" : null)
      ?? (worktree.locked ? "it is locked" : null) ?? useOf(worktree.path, evidence)
      ?? (probes.git(worktree.path, ["status", "--porcelain"]) === "" ? null : "it holds an uncommitted change")
      ?? (Date.now() > deadline ? "the listing reached its time limit before this check" : null)
    const verdict = keep === null ? judgeBranch(worktree, probes) : { stale: false, reason: keep }
    return { kind: "worktree", path: worktree.path, repository: worktree.repository, ...verdict }
  })

/** A stable name for one exact set of stale items, so a removal acts only on the set the owner saw. */
export const listingIdOf = (stale) => createHash("sha256").update(stale.map((item) => `${item.kind}\t${item.path}`).sort().join("\n")).digest("hex").slice(0, 12)

/**
 * The complete listing for `context`: `{ sessionId, sessionRoot, carryRoot, repositories, configDirectories, repoRoot }`.
 * `knownSizes` maps a path to the bytes an earlier listing measured, so each stale item is measured once.
 */
export const collectListing = (context, { probes = systemProbes, knownSizes = new Map(), measure = true, now = Date.now() } = {}) => {
  const deadline = now + LISTING_CEILING_MS
  const gathered = gatherEvidence(context, probes)
  const sessions = readSessions(gathered)
  // A session that stays still reads what its scratchpad links to, in an older session directory or in a carry copy.
  const evidence = { ...gathered, links: sessions.filter((session) => session.owner !== null).flatMap(scratchpadLinks) }
  const items = [...classifySessions(sessions, evidence, probes), ...classifyCarryCopies(evidence, probes), ...classifyWorktrees(evidence, probes, deadline)]
  const stale = items.filter((item) => item.stale).map(({ stale: _stale, ...item }) => ({ ...item,
    bytes: knownSizes.get(item.path) ?? (measure && Date.now() <= deadline ? probes.measure(item.path) : null) }))
  const kept = items.filter((item) => !item.stale).map(({ kind, path, reason }) => ({ kind, path, reason }))
  return { version: 1, generatedAt: new Date(now).toISOString(), listingId: listingIdOf(stale),
    context: { sessionId: context.sessionId, sessionRoot: evidence.sessionRoot, carryRoot: evidence.carryRoot }, stale, kept }
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

const KIND_NAMES = { session: ["session directory", "session directories"], carry: ["durable carry copy", "durable carry copies"], worktree: ["worktree", "worktrees"] }

/** `37 items, 120.4 GB (12 session directories, 18 durable carry copies, 7 worktrees)`. */
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

/** A session directory or a carry copy: only a real directory directly under its root. A link is never followed. */
const removeDirectory = (item, root) => {
  if (root === null || dirname(item.path) !== root || !lstatSync(item.path).isDirectory()) throw new Error(`${item.path} is not a directory directly under ${root}`)
  rmSync(item.path, { recursive: true, force: true })
}

/** Git refuses a tree with a tracked or untracked change, and a locked one. The local branch stays. */
const removeWorktree = (item, probes) => {
  if (probes.git(item.repository, ["worktree", "remove", item.path]) === null) throw new Error(`git worktree remove refused ${item.path}`)
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
  for (const item of stored.stale) {
    const key = `${item.kind}\t${item.path}`
    if (!stillStale.has(key)) {
      outcome.skipped.push({ ...item, reason: keptNow.get(key) ?? "it no longer exists" })
      continue
    }
    try {
      const parent = dirname(item.path)
      const device = statSync(parent).dev
      if (!volumes.has(device)) volumes.set(device, { path: parent, before: freeBytes(parent) })
      if (item.kind === "worktree") removeWorktree(stillStale.get(key), probes)
      else removeDirectory(item, item.kind === "session" ? fresh.context.sessionRoot : fresh.context.carryRoot)
      outcome.removed.push(item)
    } catch (error) {
      outcome.failed.push({ ...item, reason: error.message })
    }
  }
  // A removed session directory can hold a registered worktree; its registration now names a missing directory.
  if (outcome.removed.some((item) => item.kind !== "worktree")) {
    for (const repository of Object.values(repositories).filter((path) => existsSync(path))) probes.git(repository, ["worktree", "prune"])
  }
  for (const volume of volumes.values()) outcome.freed += freeBytes(volume.path) - volume.before
  return outcome
}
