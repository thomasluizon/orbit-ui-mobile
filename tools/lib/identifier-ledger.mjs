/**
 * Every GitHub node id this harness has actually OBSERVED, written by the tool that read it.
 *
 * WHY, measured 2026-08-08. `PRRT_kwDOR5Siws6XdcAt` was typed into resolve-bot-thread.mjs with a
 * shell `||` fallback to "try listing fresh if it fails". It was never read from any output. Node
 * ids are globally unique, so it resolved to a live CodeRabbit thread on a stranger's public
 * repository and a reply landed there.
 *
 * A rule in prose cannot catch that under a full context window, so the harness records what it
 * saw. tools/list-bot-threads.mjs appends every thread id it returns with the current run id; the
 * PreToolUse hook .claude/hooks/forbid-invented-identifier.mjs admits only entries from its own
 * session. An id that was typed or observed by an earlier run is absent by construction.
 *
 * The file lives in `.git/`, exactly like tools/lib/run-state.mjs: per checkout, never committed,
 * always writable, and it needs no gitignore entry.
 *
 * Every write fails soft. Recording what a read saw must never fail the read.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { gitDirectoryOf } from "./run-state.mjs"

/**
 * Bounded so a long unattended night cannot grow an unbounded file. Oldest entries are dropped
 * first. 5000 is far above any real run: the whole 2026-08-08 night observed fewer than 40 threads.
 */
const MAX_ENTRIES = 5000

export const identifierLedgerPath = (repoRoot) => join(gitDirectoryOf(repoRoot), "orbit-observed-identifiers.json")

const readLedgerEntries = (repoRoot) => {
  try {
    const parsed = JSON.parse(readFileSync(identifierLedgerPath(repoRoot), "utf8"))
    return Array.isArray(parsed?.identifiers) ? parsed.identifiers.filter((entry) => typeof entry?.id === "string" && entry.id !== "") : []
  } catch {
    return []
  }
}

export const readObservedIdentifiers = (repoRoot, { runIdentifier } = {}) => {
  if (typeof runIdentifier !== "string" || runIdentifier === "") return []
  return readLedgerEntries(repoRoot).filter((entry) => entry.runIdentifier === runIdentifier)
}

export const currentRunIdentifier = (environment = process.env) => {
  for (const name of ["CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID"]) {
    const value = environment[name]
    if (typeof value === "string" && value !== "") return value
  }
  return null
}

/**
 * @param identifiers node ids the caller genuinely read back from GitHub in this process
 * @param context `{ repoRoot, tool, repository, runIdentifier }` for the provenance record
 * @returns the ledger path on success, null when the write failed
 */
export const recordObservedIdentifiers = (identifiers, { repoRoot, tool, repository = null, runIdentifier }) => {
  const fresh = [...new Set(identifiers.filter((id) => typeof id === "string" && id !== ""))]
  if (fresh.length === 0 || typeof runIdentifier !== "string" || runIdentifier === "") return null
  try {
    const path = identifierLedgerPath(repoRoot)
    const existing = readLedgerEntries(repoRoot)
    const known = new Set(existing.filter((entry) => entry.runIdentifier === runIdentifier).map((entry) => entry.id))
    const observedAt = new Date().toISOString()
    const appended = [...existing, ...fresh.filter((id) => !known.has(id)).map((id) => ({ id, tool, repository, runIdentifier, observedAt }))]
    mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ identifiers: appended.slice(-MAX_ENTRIES) }, null, 2)}\n`)
    return path
  } catch {
    return null
  }
}
