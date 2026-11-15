#!/usr/bin/env node

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { readRunState } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { declaredRepoRoots } from "./_lib/repo-roots.mjs"
import { REMOVAL_CHECK_TOOLS, checkApprovalPrompt, isUnattendedRun } from "./_lib/rules-approval.mjs"
import { additionalWorkingDirectories } from "./_lib/working-directories.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/** An unreadable run record cannot prove that a person is present, so the stricter reading applies. */
const runState = () => {
  try { return readRunState() } catch { return { sleep: true } }
}

try {
  const input = readStdinJson()
  if (!REMOVAL_CHECK_TOOLS.includes(input?.tool_name)) process.exit(0)
  if (!isUnattendedRun({ env: process.env, state: runState(), sessionId: input?.session_id ?? "" })) process.exit(0)
  const workingDirectories = [...declaredRepoRoots(repoRoot), ...additionalWorkingDirectories(repoRoot)]
  const verdict = checkApprovalPrompt(input?.tool_input?.command, { cwd: input?.cwd ?? "", workingDirectories })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`forbid-approval-prompt: ${error.message}\n`)
  process.exit(2)
}
