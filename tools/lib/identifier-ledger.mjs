/**
 * Every GitHub node id this harness has actually OBSERVED, written by the tool that read it.
 *
 * WHY, measured 2026-08-08. `PRRT_kwDOR5Siws6XdcAt` was typed into resolve-bot-thread.mjs with a
 * shell `||` fallback to "try listing fresh if it fails". It was never read from any output. Node
 * ids are globally unique, so it resolved to a live CodeRabbit thread on a stranger's public
 * repository and a reply landed there.
 *
 * A rule in prose cannot catch that under a full context window, so the harness records what it
 * saw. tools/list-bot-threads.mjs appends every thread id it returns; the PreToolUse hook
 * .claude/hooks/forbid-invented-identifier.mjs refuses a command carrying a node id that appears in
 * no ledger and in no session artifact. An id that was typed is absent by construction.
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

export const readObservedIdentifiers = (repoRoot) => {
  try {
    const parsed = JSON.parse(readFileSync(identifierLedgerPath(repoRoot), "utf8"))
    return Array.isArray(parsed?.identifiers) ? parsed.identifiers.filter((entry) => typeof entry?.id === "string" && entry.id !== "") : []
  } catch {
    return []
  }
}

/**
 * @param identifiers node ids the caller genuinely read back from GitHub in this process
 * @param context `{ repoRoot, tool, repository }` for the provenance record
 * @returns the ledger path on success, null when the write failed
 */
export const recordObservedIdentifiers = (identifiers, { repoRoot, tool, repository = null }) => {
  const fresh = [...new Set(identifiers.filter((id) => typeof id === "string" && id !== ""))]
  if (fresh.length === 0) return null
  try {
    const path = identifierLedgerPath(repoRoot)
    const existing = readObservedIdentifiers(repoRoot)
    const known = new Set(existing.map((entry) => entry.id))
    const observedAt = new Date().toISOString()
    const appended = [...existing, ...fresh.filter((id) => !known.has(id)).map((id) => ({ id, tool, repository, observedAt }))]
    mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ identifiers: appended.slice(-MAX_ENTRIES) }, null, 2)}\n`)
    return path
  } catch {
    return null
  }
}
