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
  const readinessLedger = []
  const seen = new Set()
  for (const entry of identities) {
    if (typeof entry?.repositoryKey !== "string" || !Number.isInteger(entry?.prNumber) || typeof entry?.receiptPath !== "string") continue
    const key = `${entry.repositoryKey}#${entry.prNumber}`
    if (seen.has(key)) continue
    seen.add(key)
    readinessLedger.push({ repositoryKey: entry.repositoryKey, prNumber: entry.prNumber, receiptPath: entry.receiptPath })
  }
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
