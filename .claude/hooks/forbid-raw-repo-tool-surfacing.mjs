#!/usr/bin/env node
// Stop and PostToolUse adapter for the raw repo-tool surfacing gate. It judges
// only commands framed as something Thomas should run. Skill internals, agent
// bodies, ticket bodies, PR descriptions, and help output are documentation,
// not user instructions.
// Appeals are command-scoped: the marker must share the command's line, and
// every surfaced command needs its own reason.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { filePathFrom, readStdinJson } from "./_lib/io.mjs"

const APPEAL_SUFFIX = /\s+(?:#\s*)?Repo-tool appeal:\s*(\S.*)\s*$/i
const COMMAND =
  /(?:node(?:\.exe)?\s+(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)|npx(?:\.cmd)?\s+(?:(?:--yes|-y)\s+)?(?:@?[a-z0-9_][a-z0-9_./@-]*)|(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.sh)(?:[ \t]+[^`\r\n]*)?/i
const SHELL_FENCE = /^(?:bash|sh|shell|zsh|powershell|pwsh|cmd|console)?$/i
const DOCUMENTATION =
  /\b(?:skill body|agent body|ticket body|linear ticket|PR description|pull request description|tool help|internally|under the hood|inside (?:its|the) automation)\b|(?<![\p{L}\p{N}_-])(?:--help|help)[^\p{L}\p{N}_\r\n]+(?:output|text)\b/iu
const DOCUMENT_PATH =
  /(?:^|[/\\])(?:\.claude[/\\](?:skills|agents|hooks)[/\\]|(?:ticket(?:-body)?|pr(?:-body|-description)?|pull-request-description|[A-Z][A-Z0-9]+-\d+)\.(?:md|txt)$)/i
const HELP_PATH = /(?:^|[/\\])(?:help|.+--help)(?:[-_.].*)?\.(?:md|txt|log)$/i

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

function splitAppeal(line) {
  const appeal = APPEAL_SUFFIX.exec(line)
  if (!appeal) return { line, reason: null }
  return { line: line.slice(0, appeal.index).trimEnd(), reason: appeal[1].trim() }
}

function isAmbiguousNpxName(command, insideFence) {
  if (insideFence === "shell") return false
  const invocation = /^npx(?:\.cmd)?\s+([^\s]+)(?:\s+(.*))?$/i.exec(command)
  if (!invocation || /^(?:--yes|-y)$/i.test(invocation[1])) return false
  if (/[./@-]/.test(invocation[1])) return false
  return !invocation[2]?.trimStart().startsWith("-")
}

function surfacedCommands(text) {
  const lines = text.split(/\r?\n/)
  const surfaced = []
  let insideFence = null

  for (let index = 0; index < lines.length; index++) {
    const { line, reason } = splitAppeal(lines[index])
    const fence = /^\s*```([a-z0-9_-]*)\s*$/i.exec(line)
    if (fence) {
      if (insideFence) insideFence = null
      else if (DOCUMENTATION.test(previousNonemptyLine(lines, index))) insideFence = "documentation"
      else insideFence = SHELL_FENCE.test(fence[1]) ? "shell" : "other"
      continue
    }
    if (insideFence === "documentation") continue
    if (insideFence === "other") continue

    const command = commandFrom(line)
    if (!command) continue
    const previousLine = previousNonemptyLine(lines, index)
    const framing = `${previousLine} ${line}`
    if (DOCUMENTATION.test(framing)) continue
    if (isAmbiguousNpxName(command, insideFence)) continue
    surfaced.push({ command, reason })
  }
  return surfaced
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

  const commands = surfacedCommands(text)
  if (!commands.length) return null

  const unappealed = commands.find(({ reason }) => !reason)
  if (!unappealed) {
    return {
      appeal: true,
      commands,
      message: commands.map(({ command, reason }) => `Repo-tool appeal recorded: ${reason} (${command})`).join("\n"),
    }
  }

  return {
    block: true,
    command: unappealed.command,
    message: [
      `Raw repo-tool command surfaced for Thomas: ${unappealed.command}`,
      alternativeFor(unappealed.command),
      'Remove the raw command, or put "Repo-tool appeal: <reason>" on the same line when it genuinely must be shown. Every surfaced command needs its own recorded reason.',
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
