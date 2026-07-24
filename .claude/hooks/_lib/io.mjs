// Payload helpers for the Claude Code session hooks: they read a JSON payload on
// stdin, and these helpers normalize it into the shape the rule logic in
// ./rules-*.mjs consumes. (opencode was dropped from this repo, D22.)

import { readFileSync } from "node:fs"

export function readStdinJson() {
  try {
    return JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return null
  }
}

export function filePathFrom(input) {
  return input?.tool_input?.file_path ?? input?.tool_response?.filePath ?? null
}

