#!/usr/bin/env node
// PreToolUse(Bash, PowerShell) adapter for the invented-identifier guard. Thin: the reusable core
// is checkInventedIdentifier in _lib/rules-identifier.mjs. Exits 0 (allow) or 2 + stderr (block).
// Any error exits 0, so a hook fault can never wedge a shell.
//
// Registered on the PowerShell tool as well as Bash, for the same reason every other command guard
// here is: the PowerShell tool fires no hook by default, so a matcher naming only "Bash" is open on
// day one to anyone who reaches for the other shell.
//
// This adapter owns the two questions the pure core cannot answer: which identifiers this run has
// really observed, and where to look for them.
//
//   1. tools/lib/identifier-ledger.mjs, in each declared repository's `.git/`. list-bot-threads.mjs
//      appends every thread id it returns, so a copied id is present by construction.
//   2. the session scratchpad, so an id read from a saved artifact also clears the gate.
//
// The scratchpad scan is BOUNDED and fails open. A PreToolUse hook runs on every command, so it may
// not stall a shell, and a guard that blocks because it ran out of budget would be worse than the
// defect it guards. That bypass is disclosed in the rule module beside the others.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { readObservedIdentifiers } from "../../tools/lib/identifier-ledger.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { declaredRepoRoots } from "./_lib/repo-roots.mjs"
import { checkInventedIdentifier, extractNodeIds } from "./_lib/rules-identifier.mjs"

const SCAN_BUDGET_MS = 1500
const MAX_FILES = 4000
const MAX_FILE_BYTES = 8 * 1024 * 1024

/** Every directory named for this session under the Claude scratchpad tree. The layout is
 * <tmp>/claude/<project-slug>/<session-id>/, and the project slug is not derivable here, so the
 * session id is matched one level down rather than assumed. */
const sessionScratchpads = (sessionId) => {
  if (typeof sessionId !== "string" || sessionId === "") return []
  const base = join(tmpdir(), "claude")
  try {
    return readdirSync(base)
      .map((project) => join(base, project, sessionId))
      .filter((path) => {
        try {
          return statSync(path).isDirectory()
        } catch {
          return false
        }
      })
  } catch {
    return []
  }
}

const scanForIdentifiers = (roots, wanted, observed) => {
  const deadline = Date.now() + SCAN_BUDGET_MS
  let filesRead = 0
  const queue = [...roots]
  while (queue.length > 0 && filesRead < MAX_FILES && Date.now() < deadline) {
    if (wanted.every((id) => observed.has(id))) return
    const current = queue.shift()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(path)
        continue
      }
      if (!entry.isFile()) continue
      try {
        if (statSync(path).size > MAX_FILE_BYTES) continue
        const text = readFileSync(path, "utf8")
        filesRead++
        for (const id of extractNodeIds(text)) observed.add(id)
      } catch {
        /* an unreadable artifact proves nothing and must not mask the readable ones */
      }
    }
  }
}

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") process.exit(0)

  const wanted = extractNodeIds(command)
  if (wanted.length === 0) process.exit(0)

  const hookRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const repoRoots = declaredRepoRoots(hookRepoRoot)
  const observed = new Set()
  for (const repoRoot of repoRoots) {
    for (const entry of readObservedIdentifiers(repoRoot)) observed.add(entry.id)
  }

  const scratchpads = sessionScratchpads(input?.session_id)
  if (!wanted.every((id) => observed.has(id))) scanForIdentifiers(scratchpads, wanted, observed)

  const verdict = checkInventedIdentifier(command, {
    observedIdentifiers: observed,
    searchedRoots: [...repoRoots.map((repoRoot) => `${repoRoot} ledger`), ...scratchpads],
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
