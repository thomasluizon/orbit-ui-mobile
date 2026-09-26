#!/usr/bin/env node

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
  const runIdentifier = input?.session_id
  for (const repoRoot of repoRoots) {
    for (const entry of readObservedIdentifiers(repoRoot, { runIdentifier })) observed.add(entry.id)
  }

  const scratchpads = sessionScratchpads(runIdentifier)
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
