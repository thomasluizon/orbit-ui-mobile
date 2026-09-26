#!/usr/bin/env node

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { readStdinJson } from "./_lib/io.mjs"
import { declaredRepoRoots } from "./_lib/repo-roots.mjs"
import { checkAdminMerge, checkBroadStaging, checkEngineInvocation } from "./_lib/rules-orchestrator.mjs"

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") process.exit(0)

  const repoRoots = declaredRepoRoots(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."))
  const verdict =
    checkAdminMerge(command) ??
    checkBroadStaging(command, { env: process.env, cwd: input?.cwd || process.cwd(), repoRoots }) ??
    checkEngineInvocation(command, { env: process.env, cwd: input?.cwd || process.cwd(), repoRoots })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
