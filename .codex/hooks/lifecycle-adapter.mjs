#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { minimalChildEnvironment } from "../../tools/lib/child-environment.mjs"
import { spawnSyncHidden } from "../../tools/lib/subprocess-options.mjs"

const programsByEvent = {
  SessionStart: [],
  UserPromptSubmit: [],
  PreToolUse: [
    ".claude/hooks/git-guardrails.mjs",
    ".claude/hooks/forbid-raw-linear-mutation.mjs",
    ".claude/hooks/orchestrator-guardrails.mjs",
  ],
  PostToolUse: [
    ".claude/hooks/forbid-raw-repo-tool-surfacing.mjs",
    ".claude/hooks/forbid-ef-migration-raw-index.mjs",
    ".claude/hooks/forbid-raw-linear-mutation.mjs",
  ],
  PostToolUseFailure: [
    ".claude/hooks/forbid-raw-repo-tool-surfacing.mjs",
    ".claude/hooks/forbid-ef-migration-raw-index.mjs",
    ".claude/hooks/forbid-raw-linear-mutation.mjs",
  ],
  PermissionRequest: [
    ".claude/hooks/git-guardrails.mjs",
    ".claude/hooks/forbid-raw-linear-mutation.mjs",
    ".claude/hooks/orchestrator-guardrails.mjs",
  ],
  SubagentStart: [],
  SubagentStop: [],
  Stop: [".claude/hooks/forbid-raw-repo-tool-surfacing.mjs"],
  SessionEnd: [],
}

const eventNameOf = (input) => input?.hook_event_name ?? input?.hookEventName ?? null

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return
  }

  const programs = programsByEvent[eventNameOf(input)]
  if (!programs) return

  for (const relativeProgram of programs) {
    const result = spawnSyncHidden(process.execPath, [resolve(process.cwd(), relativeProgram)], {
      encoding: "utf8",
      input: JSON.stringify(input),
      env: minimalChildEnvironment("worker"),
    })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.status === 0 || result.status === null) continue
    if (result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status)
  }
}

main()
