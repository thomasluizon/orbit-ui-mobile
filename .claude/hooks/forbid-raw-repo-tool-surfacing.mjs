#!/usr/bin/env node
// Stop and PostToolUse adapter for the raw repo-tool surfacing gate. It judges
// only commands framed as something Thomas should run. Skill internals, agent
// bodies, ticket bodies, PR descriptions, and help output are documentation,
// not user instructions.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { filePathFrom, readStdinJson } from "./_lib/io.mjs"

const APPEAL = /^\s*Repo-tool appeal:\s*(\S.*)$/im
const COMMAND =
  /(?:node(?:\.exe)?\s+(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)|npx(?:\.cmd)?\s+(?:(?:--yes|-y)\s+)?(?:@?[a-z0-9_][a-z0-9_./@-]*)|(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.sh)(?:[ \t]+[^`\r\n]*)?/i
const DIRECT_COMMAND =
  /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:[$>]\s*)?(?:node(?:\.exe)?\s+(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)|npx(?:\.cmd)?\s+(?:(?:--yes|-y)\s+)?(?:@?[a-z0-9_][a-z0-9_./@-]*)|(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.sh)\b/i
const INSTRUCTION =
  /\b(?:run|execute|invoke|use|type|enter|try|rerun|re-run|re-derive|regenerate|recreate|repeat|command|shell|terminal)\b/i
const DOCUMENTATION =
  /\b(?:skill body|agent body|ticket body|linear ticket|PR description|pull request description|help output|help text|--help output|--help text|tool help|internally|under the hood)\b/i
const DOCUMENT_PATH =
  /(?:^|[/\\])(?:\.claude[/\\](?:skills|agents|hooks)[/\\]|(?:ticket(?:-body)?|pr(?:-body|-description)?|pull-request-description|[A-Z][A-Z0-9]+-\d+)\.(?:md|txt)$)/i
const HELP_PATH = /(?:^|[/\\])(?:help|.+--help)(?:[-_.].*)?\.(?:md|txt|log)$/i
const INSTRUCTION_HEADING = /^#{1,6}\s+.*\b(?:instructions?|steps?|commands?|how to|run|usage|re-derive|regenerate)\b/i

function commandFrom(line) {
  return (
    COMMAND.exec(line)?.[0]
      ?.trim()
      .replace(/[.,;:]+$/, "") ?? null
  )
}

function previousNonemptyLine(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    if (lines[cursor].trim()) return lines[cursor]
  }
  return ""
}

function commandInShellFence(lines, start) {
  const opening = /^\s*```(?:bash|sh|shell|zsh|powershell|pwsh|cmd|console)?\s*$/i
  if (!opening.test(lines[start])) return null
  if (DOCUMENTATION.test(previousNonemptyLine(lines, start))) return null

  for (let cursor = start + 1; cursor < lines.length; cursor++) {
    if (/^\s*```/.test(lines[cursor])) return null
    if (!lines[cursor].trim()) continue
    return DIRECT_COMMAND.test(lines[cursor]) ? commandFrom(lines[cursor]) : null
  }
  return null
}

function surfacedCommand(text, source) {
  const lines = text.split(/\r?\n/)
  let underInstructionHeading = false
  let insideDocumentationFence = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*```/.test(line)) {
      if (insideDocumentationFence) {
        insideDocumentationFence = false
        continue
      }
      if (DOCUMENTATION.test(previousNonemptyLine(lines, index))) {
        insideDocumentationFence = true
        continue
      }
    }
    if (insideDocumentationFence) continue

    const heading = /^#{1,6}\s+/.test(line)
    if (heading) underInstructionHeading = INSTRUCTION_HEADING.test(line)

    const fencedCommand = commandInShellFence(lines, index)
    if (fencedCommand) return fencedCommand

    const command = commandFrom(line)
    if (!command) continue
    const previousLine = previousNonemptyLine(lines, index)
    const framing = `${previousLine} ${line}`
    if (DOCUMENTATION.test(framing)) continue
    if (DIRECT_COMMAND.test(line)) return command
    const standaloneCodeSpan = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?`[^`]+`\s*[.,;:]?\s*$/.test(line)
    if (standaloneCodeSpan && INSTRUCTION.test(previousLine)) return command
    if (INSTRUCTION.test(line.slice(0, line.search(COMMAND)))) return command
    if (source === "artifact" && underInstructionHeading) return command
  }
  return null
}

function alternativeFor(command) {
  if (
    /(?:tools[\\/]wave-plan(?:\.mjs|\.sh)|npx(?:\.cmd)?\s+(?:(?:--yes|-y)\s+)?(?:@?[a-z0-9_][a-z0-9_./@-]*[\\/@-])?wave-plan)\b/i.test(
      command,
    )
  ) {
    return "Use /next for the supported read-only recommendation."
  }
  return "No skill currently exposes this capability. Say that plainly and describe the skill to build instead of giving Thomas the raw command."
}

export function checkRawRepoToolSurfacing(text, { source = "chat", filePath = "" } = {}) {
  if (typeof text !== "string" || !text.trim()) return null
  if (source === "artifact" && (DOCUMENT_PATH.test(filePath) || HELP_PATH.test(filePath))) return null

  const command = surfacedCommand(text, source)
  if (!command) return null

  const appeal = APPEAL.exec(text)
  if (appeal) {
    const reason = appeal[1].trim()
    return {
      appeal: true,
      reason,
      command,
      message: `Repo-tool appeal recorded: ${reason}`,
    }
  }

  return {
    block: true,
    command,
    message: [
      `Raw repo-tool command surfaced for Thomas: ${command}`,
      alternativeFor(command),
      'Remove the raw command, or state "Repo-tool appeal: <reason>" when it genuinely must be shown. The hook records the reason.',
    ].join("\n"),
  }
}

function transcriptAssistantMessage(transcriptPath) {
  if (typeof transcriptPath !== "string" || !existsSync(transcriptPath)) return ""
  const records = readFileSync(transcriptPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })

  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index]
    if (record?.type !== "assistant") continue
    const content = record?.message?.content
    if (typeof content === "string") return content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((block) => block?.type === "text" && typeof block?.text === "string")
      .map((block) => block.text)
      .join("\n")
    if (text) return text
  }
  return ""
}

function writtenArtifact(input) {
  const filePath = filePathFrom(input) ?? ""
  if (filePath && existsSync(filePath)) {
    return { filePath, text: readFileSync(filePath, "utf8") }
  }
  const candidates = [
    input?.tool_input?.content,
    input?.tool_input?.new_string,
    ...(Array.isArray(input?.tool_input?.edits) ? input.tool_input.edits.map((edit) => edit?.new_string) : []),
  ].filter((value) => typeof value === "string")
  return { filePath, text: candidates.join("\n") }
}

function emit(verdict) {
  if (!verdict) process.exit(0)
  if (verdict.appeal) {
    process.stdout.write(JSON.stringify({ systemMessage: verdict.message }))
    process.exit(0)
  }
  process.stderr.write(verdict.message)
  process.exit(2)
}

function runHook() {
  try {
    const input = readStdinJson()
    if (!input) process.exit(0)

    if (input.hook_event_name === "Stop") {
      if (input.stop_hook_active) process.exit(0)
      const text =
        typeof input.last_assistant_message === "string" ? input.last_assistant_message : transcriptAssistantMessage(input.transcript_path)
      emit(checkRawRepoToolSurfacing(text))
    }

    const { filePath, text } = writtenArtifact(input)
    emit(checkRawRepoToolSurfacing(text, { source: "artifact", filePath }))
  } catch {
    process.exit(0)
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) runHook()
