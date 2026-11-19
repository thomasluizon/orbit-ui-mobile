#!/usr/bin/env node

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { readStdinJson } from "./_lib/io.mjs"
import { declaredRepoRoots } from "./_lib/repo-roots.mjs"
import { checkReadOnlyRun, checkWorkerBrowser } from "./_lib/rules-worker.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  // A worker never starts a browser or a dev server, and a read-only review or proof never writes GitHub.
  const verdict = checkWorkerBrowser(command, {
    env: process.env,
    cwd: input?.cwd ?? "",
    repoRoots: declaredRepoRoots(repoRoot),
  }) ?? checkReadOnlyRun(command, { env: process.env })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`forbid-worker-browser: ${error.message}\n`)
  process.exit(2)
}
