#!/usr/bin/env node
// Adapter for the worker browser ban. The reusable core is checkWorkerBrowser in
// _lib/rules-worker.mjs. Wired to PreToolUse on Bash AND PowerShell, because the
// PowerShell tool fires no hook by default and that alone would defeat it.
// Exits 0 (allow) or 2 + stderr (block). Any error exits 0 so the hook never
// wedges a tool.
//
// It fires ONLY for a worker: the launcher's marker in the environment, or a cwd
// inside a launcher-created worktree. A session in the main checkout is Thomas,
// and /dev-server is his, so it is never touched here.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { readStdinJson } from "./_lib/io.mjs"
import { declaredRepoRoots } from "./_lib/repo-roots.mjs"
import { checkWorkerBrowser } from "./_lib/rules-worker.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

try {
  const input = readStdinJson()
  const verdict = checkWorkerBrowser(input?.tool_input?.command, {
    env: process.env,
    cwd: input?.cwd ?? "",
    repoRoots: declaredRepoRoots(repoRoot),
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
