import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { gitDirectoryOf } from "./run-state.mjs"

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
