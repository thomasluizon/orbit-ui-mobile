/**
 * What an unattended run has left to do, and what will wake it.
 *
 * WHY it exists, measured 2026-08-06: the ONLY thing that continues a `--sleep` run is a background
 * task completing and re-invoking the session. Nothing verified one existed. The orchestrator ended a
 * turn saying "CI will wake me" with nothing scheduled, and the night simply stopped, leaving an
 * artifact trail identical to a run that finished. A queue that ends silently is worse than one that
 * fails loudly, because nobody looks for it.
 *
 * Two files, in `.git/`, because that directory is per-checkout, never committed, always writable,
 * and needs no gitignore entry:
 *
 *   .git/orbit-orchestrate-run.json     the ORCHESTRATOR is its only writer: which session, whether
 *                                       --sleep is on, and which tickets remain.
 *   .git/orbit-wake-sources/<pid>.json  one file per live wake source, written by launch-worker.mjs
 *                                       when it starts and removed when it exits.
 *
 * One file per wake source rather than an array in one file: under `--parallel` three launchers write
 * at once, and a read-modify-write on a shared array loses entries. A crashed launcher leaks its file
 * instead of removing it. The reader checks the process start identity as well as liveness, because
 * a reused pid must never turn an old registration into evidence that a worker still exists.
 *
 * Every write fails soft. A launch must never die because a status file could not be written.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const GITDIR_LINE = /^gitdir:[ \t]*(.+?)[ \t]*$/m
// Linux proc_pid_stat(5): Z is zombie; x is the historical spelling of dead state X.
const LINUX_DEAD_PROCESS_STATES = new Set(["Z", "X", "x"])
export const PENDING_WAKE_SOURCE_MAX_AGE_MS = 45_000

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
  /**
   * One row per repository and pull request, in the order each was FIRST seen, but carrying the
   * LATEST value of every field.
   *
   * First-seen-wins on the whole row was wrong. `identities` lists the previous ledger before the
   * current state, so a pull request registered before its blocker was discovered kept the old row,
   * and the blocker recorded by the later call was discarded. The run then believed nothing was
   * blocking it. Ordering still comes from the first sighting, because the ledger is append only
   * and a row must not move.
   */
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
  /**
   * A ledger row whose receipt file does not exist is a promise nobody kept. Measured 2026-08-08:
   * four rows were accepted for receipts that were never written, and the Stop hook then read
   * them as unreadable rather than as absent, which is a different and much quieter failure.
   * The path is recorded either way, so the row is never silently dropped: `receiptWritten` says
   * which it is, and the hook can name it.
   */
  const readinessLedger = [...rows.values()].map((row) => ({
    repositoryKey: row.repositoryKey,
    prNumber: row.prNumber,
    receiptPath: row.receiptPath,
    receiptWritten: existsSync(row.receiptPath),
    blocker: row.blocker,
  }))
  writeFileSync(runStatePath(repoRoot), `${JSON.stringify({ ...state, readinessLedger }, null, 2)}\n`)
}

/**
 * OS start identity, never the launcher's wall-clock timestamp. Windows emits UTC .NET ticks as a
 * decimal string; Linux combines /proc stat field 22 with boot_id so a reboot cannot repeat it.
 * Both sources were read on this machine for #437. A failed probe supplies no identity evidence.
 */
const processStartIdentity = (pid) => {
  try {
    if (process.platform === "win32") {
      const result = spawnSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks.ToString()`,
      ], { encoding: "utf8", windowsHide: true, timeout: 3000 })
      const ticks = result.stdout?.trim()
      return result.status === 0 && /^\d+$/.test(ticks) ? `win32:${ticks}` : null
    }
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
      const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/)
      const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
      return !LINUX_DEAD_PROCESS_STATES.has(fields[0]) && /^\d+$/.test(fields[19]) && /^[0-9a-f-]{36}$/.test(bootId)
        ? `linux:${bootId}:${fields[19]}` : null
    }
  } catch {
    /* unreadable process metadata cannot identify a wake source */
  }
  return null
}

/** Recheck the recorded process at the decision point; pid ownership alone is not evidence. */
export const isWakeSourceAlive = (source) =>
  Number.isInteger(source?.pid) && source.pid > 0 &&
  typeof source.processStartIdentity === "string" &&
  source.processStartIdentity === processStartIdentity(source.pid)

const isPendingWakeSourceFresh = (source) => {
  if (source?.pending !== true) return true
  const pendingAt = Date.parse(source.pendingAt)
  const age = Date.now() - pendingAt
  return Number.isFinite(pendingAt) && age >= 0 && age <= PENDING_WAKE_SOURCE_MAX_AGE_MS
}

/** Only registrations that still identify their live process. Sweep only proven missing pids. */
export const readWakeSources = (repoRoot = REPO_ROOT) => {
  const directory = wakeSourceDirectory(repoRoot)
  let names
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  const sources = []
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    try {
      const source = JSON.parse(readFileSync(join(directory, name), "utf8"))
      if (!Number.isInteger(source?.pid) || source.pid <= 0) continue
      try {
        process.kill(source.pid, 0)
      } catch (error) {
        if (error?.code === "ESRCH") rmSync(join(directory, name), { force: true })
        // A denied or otherwise failed probe proves neither death nor a matching identity.
        continue
      }
      if (isPendingWakeSourceFresh(source) && isWakeSourceAlive(source)) sources.push(source)
    } catch {
      /* an unreadable entry is not a live wake source, and must not mask the readable ones */
    }
  }
  return sources
}

export const registerWakeSource = (source, repoRoot = REPO_ROOT) => {
  try {
    if (!Number.isInteger(source?.pid) || source.pid <= 0) return
    const identity = processStartIdentity(source.pid)
    mkdirSync(wakeSourceDirectory(repoRoot), { recursive: true })
    writeFileSync(join(wakeSourceDirectory(repoRoot), `${source.pid}.json`), `${JSON.stringify({ ...source, processStartIdentity: identity }, null, 2)}\n`)
  } catch {
    /* a status file is never worth failing a launch over */
  }
}

export const clearWakeSource = (pid, repoRoot = REPO_ROOT) => {
  try {
    rmSync(join(wakeSourceDirectory(repoRoot), `${pid}.json`), { force: true })
  } catch {
    /* same: the reader checks process identity and sweeps dead entries */
  }
}
