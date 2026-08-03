#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const programsByEvent = {
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
  Stop: [".claude/hooks/forbid-raw-repo-tool-surfacing.mjs"],
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return
  }

  const programs = programsByEvent[input?.hook_event_name]
  if (!programs) return

  for (const relativeProgram of programs) {
    const result = spawnSync(process.execPath, [resolve(process.cwd(), relativeProgram)], {
      encoding: "utf8",
      input: JSON.stringify(input),
    })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.status === 0 || result.status === null) continue
    if (result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status)
  }
}

main()
