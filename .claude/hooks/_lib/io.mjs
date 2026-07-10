// Shared payload helpers for Orbit's dual-target hook engine. The Claude Code
// hooks read a JSON payload on stdin; the opencode plugin gets (input, output)
// from tool.execute.before/after. These helpers normalize both so the rule
// logic in ./rules-*.mjs is written once and enforced in both tools.

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

// The text an Edit/Write/MultiEdit introduced (never the whole file).
export function addedTextFrom(toolInput = {}) {
  if (typeof toolInput.new_string === "string") return toolInput.new_string
  if (Array.isArray(toolInput.edits)) return toolInput.edits.map((e) => e?.new_string ?? "").join("\n")
  if (typeof toolInput.content === "string") return toolInput.content
  return ""
}

// opencode edit/write tool args -> the same { filePath, addedText } shape.
export function fromOpenCodeEdit(args = {}) {
  const addedText = typeof args.newString === "string" ? args.newString : typeof args.content === "string" ? args.content : ""
  return { filePath: args.filePath || args.path || null, addedText }
}
