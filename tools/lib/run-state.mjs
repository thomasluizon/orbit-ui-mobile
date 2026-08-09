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
 * instead of removing it, which is exactly why the reader checks that the pid is still ALIVE rather
 * than trusting the file's existence.
 *
 * Every write fails soft. A launch must never die because a status file could not be written.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
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
  } catch {
    /* a status file is never worth failing a launch over */
  }
}

export const clearWakeSource = (pid, repoRoot = REPO_ROOT) => {
  try {
    rmSync(join(wakeSourceDirectory(repoRoot), `${pid}.json`), { force: true })
  } catch {
    /* same: the reader checks liveness, so a leaked entry is already handled */
  }
}
