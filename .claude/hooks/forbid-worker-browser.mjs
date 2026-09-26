#!/usr/bin/env node

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
