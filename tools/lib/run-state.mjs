
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const GITDIR_LINE = /^gitdir:[ \t]*(.+?)[ \t]*$/m

/**
 * The directory git itself keeps state in. An ordinary checkout carries a `.git` DIRECTORY; a linked
 * worktree carries a `.git` FILE pointing at <main>/.git/worktrees/<name>. Following that line keeps
 * the state PER CHECKOUT, so a worktree can never read or clobber the orchestrating session's record.
 */
export const gitDirectoryOf = (repoRoot) => {
  const marker = join(repoRoot, ".git")
  try {
    if (statSync(marker).isDirectory()) return marker
    const gitdir = GITDIR_LINE.exec(readFileSync(marker, "utf8"))
    return gitdir ? resolve(repoRoot, gitdir[1]) : marker
  } catch {
    return marker
  }
}

/** tools/lib/ -> the repository root that owns this checkout's `.git`. */
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url))

export const runStatePath = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-orchestrate-run.json")
export const wakeSourceDirectory = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-wake-sources")

/** A PID alone can name a different process after reuse. Return null if the OS cannot prove its start. */
export const processStartIdentity = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const command = process.platform === "win32" ? "powershell" : "ps"
  const args = process.platform === "win32"
    ? ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`]
    : ["-p", String(pid), "-o", "lstart="]
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true })
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null
}

export const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === "EPERM" }
}

/** The orchestrator's own run record, or null when no run has written one. */
export const readRunState = (repoRoot = REPO_ROOT) => {
  try {
    return JSON.parse(readFileSync(runStatePath(repoRoot), "utf8"))
  } catch {
    return null
  }
}

export const writeRunState = (state, repoRoot = REPO_ROOT) => {
  mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
  const previous = readRunState(repoRoot)
  const sameSession = typeof state?.sessionId === "string" && state.sessionId !== "" && previous?.sessionId === state.sessionId
  const identities = [
    ...(sameSession && Array.isArray(previous?.readinessLedger) ? previous.readinessLedger : []),
    ...(sameSession && Array.isArray(previous?.pullRequests) ? previous.pullRequests : []),
    ...(Array.isArray(state?.readinessLedger) ? state.readinessLedger : []),
    ...(Array.isArray(state?.pullRequests) ? state.pullRequests : []),
  ]
  const rows = new Map()
  for (const entry of identities) {
    if (typeof entry?.repositoryKey !== "string" || !Number.isInteger(entry?.prNumber) || typeof entry?.receiptPath !== "string") continue
    const key = `${entry.repositoryKey}#${entry.prNumber}`
    const blocker = typeof entry.blocker === "string" && entry.blocker !== "" ? entry.blocker : null
    const existing = rows.get(key)
    if (!existing) {
      rows.set(key, { repositoryKey: entry.repositoryKey, prNumber: entry.prNumber, receiptPath: entry.receiptPath, blocker })
      continue
    }
    // A later sighting is the current one. It supersedes the receipt path, and it may add a blocker
    // the earlier sighting did not know about. It may also clear one that has since been resolved.
    existing.receiptPath = entry.receiptPath
    existing.blocker = blocker
  }
  const readinessLedger = [...rows.values()].map((row) => ({
    repositoryKey: row.repositoryKey,
    prNumber: row.prNumber,
    receiptPath: row.receiptPath,
    receiptWritten: existsSync(row.receiptPath),
    blocker: row.blocker,
  }))
  writeFileSync(runStatePath(repoRoot), `${JSON.stringify({ ...state, readinessLedger }, null, 2)}\n`)
}

/** Every wake source ever registered and not yet removed. Liveness is the CALLER's question. */
export const readWakeSources = (repoRoot = REPO_ROOT) => {
  const directory = wakeSourceDirectory(repoRoot)
  if (!existsSync(directory)) return []
  const sources = []
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue
    try {
      const source = JSON.parse(readFileSync(join(directory, name), "utf8"))
      if (Number.isInteger(source?.pid)) sources.push(source)
    } catch {
      /* an unreadable entry is not a live wake source, and must not mask the readable ones */
    }
  }
  return sources
}

export const registerWakeSource = (source, repoRoot = REPO_ROOT) => {
  try {
    mkdirSync(wakeSourceDirectory(repoRoot), { recursive: true })
    writeFileSync(join(wakeSourceDirectory(repoRoot), `${source.pid}.json`), `${JSON.stringify(source, null, 2)}\n`)
    return true
  } catch {
    /* a status file is never worth failing a launch over */
    return false
  }
}

export const clearWakeSource = (pid, repoRoot = REPO_ROOT) => {
  try {
    rmSync(join(wakeSourceDirectory(repoRoot), `${pid}.json`), { force: true })
  } catch {
    /* same: the reader checks liveness, so a leaked entry is already handled */
  }
}
