#!/usr/bin/env node
// PreToolUse(Bash, PowerShell) and Stop adapter for the handoff prompt gate. The rules live in
// _lib/rules-handoff.mjs. Exits 0 (allow) or 2 + stderr (block). Any error exits 0 so the hook never
// wedges a shell or a stop.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { HANDOFF_PROMPT_PATH, readHandoffRequest } from "../../tools/lib/handoff-prompt.mjs"
import { REPO_ROOT } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkHandoffCommit, checkHandoffStop } from "./_lib/rules-handoff.mjs"

const git = (directory, args) =>
  execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })

const listed = (output) => output.split("\n").map((line) => line.trim()).includes(HANDOFF_PROMPT_PATH)

/** The NEXT.md text a commit would record: the working copy for a pathspec or `-a` commit, else the staged blob. */
const promptForCommit = (directory, command) => {
  const top = git(directory, ["rev-parse", "--show-toplevel"]).trim()
  const workingCopy = () => readFileSync(join(top, HANDOFF_PROMPT_PATH), "utf8")
  if (command.includes("handoffs/NEXT.md")) return workingCopy()
  if (/\scommit\b[^;&|\n]*\s(-a\w*|--all)\b/.test(command) && listed(git(top, ["diff", "--name-only"]))) return workingCopy()
  if (listed(git(top, ["diff", "--cached", "--name-only"]))) return git(top, ["show", `:${HANDOFF_PROMPT_PATH}`])
  return null
}

const headPrompt = () => {
  try {
    return {
      text: git(REPO_ROOT, ["show", `HEAD:${HANDOFF_PROMPT_PATH}`]),
      committedAt: git(REPO_ROOT, ["log", "-1", "--format=%cI", "HEAD", "--", HANDOFF_PROMPT_PATH]).trim(),
    }
  } catch {
    return { text: null, committedAt: "" }
  }
}

try {
  const input = readStdinJson()
  const request = readHandoffRequest(input?.session_id ?? "")
  let verdict = null
  if (input?.hook_event_name === "Stop") {
    const head = headPrompt()
    verdict = checkHandoffStop({ request, headPrompt: head.text, headPromptCommittedAt: head.committedAt })
  } else if (typeof input?.tool_input?.command === "string") {
    verdict = checkHandoffCommit({ command: input.tool_input.command, cwd: input?.cwd || process.cwd(), request, promptForCommit })
  }
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
