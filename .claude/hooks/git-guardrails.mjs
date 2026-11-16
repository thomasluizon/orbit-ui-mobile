#!/usr/bin/env node
// PreToolUse(Bash, Monitor, PowerShell) adapter for the git-workflow guard. Thin: the reusable core is
// the pure functions in _lib/rules-git.mjs (opencode was dropped from this repo,
// D22). Exits 0 (allow) or 2 + stderr (block). Errors block the command and name this hook.

import { execFileSync } from "node:child_process"
import { readRunState } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { isUnattendedRun } from "./_lib/rules-approval.mjs"
import { checkGitCommand, checkGitWorktreeRemove } from "./_lib/rules-git.mjs"

/** An unreadable run record cannot prove that a person is present, so the stricter reading applies. */
const runState = () => {
  try { return readRunState() } catch { return { sleep: true } }
}

try {
  const input = readStdinJson()
  const command = input?.tool_input?.command
  if (typeof command !== "string") process.exit(0)

  // git reads the chain of directories itself, so a symlink and `..` resolve as they do for the command.
  const resolveRemoteUrl = (chain, remote = "origin") =>
    execFileSync("git", [...chain.flatMap((directory) => ["-C", directory]), "remote", "get-url", "--push", remote], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()

  const unattended = isUnattendedRun({ env: process.env, state: runState(), sessionId: input?.session_id ?? "" })
  const verdict =
    checkGitCommand(command, { resolveRemoteUrl, cwd: input?.cwd || process.cwd(), unattended }) ?? checkGitWorktreeRemove(command)
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`git-guardrails: ${error.message}\n`)
  process.exit(2)
}
