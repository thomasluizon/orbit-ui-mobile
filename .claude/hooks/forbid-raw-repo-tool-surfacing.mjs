#!/usr/bin/env node
// Stop and PostToolUse adapter for the raw repo-tool surfacing gate. Skill
// internals, agent bodies, ticket bodies, PR descriptions, and help output are
// documentation, not user instructions.
// Artifact checks inspect only new tool-input text and skip files under declared
// repos, where source and documentation references are owned by CI.
// Appeals are command-scoped: the marker must share the command's line, and
// every surfaced command needs its own reason.

import { existsSync, readFileSync } from "node:fs"
import { dirname, posix, resolve, win32 } from "node:path"
import { fileURLToPath } from "node:url"

import { filePathFrom, readStdinJson } from "./_lib/io.mjs"

const APPEAL_SUFFIX = /\s+(?:#\s*)?Repo-tool appeal:\s*(\S.*)\s*$/i
const NODE_TOOL_COMMAND =
  /\bnode(?:\.exe)?(?:[ \t]+-{1,2}[a-z0-9][a-z0-9-]*(?:=[^`\s]+|[ \t]+[^`\s]+)?)*[ \t]+(?:"(?:(?:[a-z]:)?[\\/]*(?:[^"`\r\n]+[\\/])*)?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)"|'(?:(?:[a-z]:)?[\\/]*(?:[^'`\r\n]+[\\/])*)?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)'|(?:(?:[a-z]:)?[\\/]*(?:[a-z0-9_.-]+[\\/])*)?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts))(?:[ \t]+[^`\r\n]*)?/i
const TOOL_SCRIPT_COMMAND = /(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.sh(?:[ \t]+[^`\r\n]*)?/i
const NPX_COMMAND = /\bnpx(?:\.cmd)?[ \t]+\S[^`\r\n]*/i
const SHELL_FENCE = /^(?:bash|sh|shell|zsh|powershell|pwsh|cmd|console)?$/i
const DOCUMENTATION =
  /\b(?:skill body|agent body|ticket body|linear ticket|PR description|pull request description|tool help|internally|under the hood|inside (?:its|the) automation)\b|(?<![\p{L}\p{N}_-])(?:--help|help)[^\p{L}\p{N}_\r\n]+(?:output|text)\b/iu
const INTERNAL_DOCUMENTATION = /\b(?:internally|under the hood|inside (?:its|the) automation)\b/i
const SECOND_PERSON_RUN =
  /\b(?:you|you['’](?:d|ll)|you\s+(?:can|could|may|might|must|should|will|would)|you\s+(?:have|need|ought)\s+to)\s+(?:(?:just|simply)\s+)?run(?:\s+(?:this|it|the command))?\s*$/i
const DOCUMENT_BASENAME = /^(?:ticket(?:-body)?|pr(?:-body|-description)?|pull-request-description)\.(?:md|txt)$/i
const TICKET_BASENAME = /^ORB-\d+\.(?:md|txt)$/
const HELP_BASENAME = /^(?:help|.+--help)(?:[-_.].*)?\.(?:md|txt|log)$/i
const HOOK_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const WINDOWS_PATH = /^(?:[a-z]:[\\/]|\\\\)/i

function declaredRepoRoots() {
  try {
    const config = JSON.parse(readFileSync(resolve(HOOK_REPO_ROOT, ".claude", "orchestrator.json"), "utf8"))
    const configured = Object.values(config?.repos ?? {}).filter(
      (repoPath) => typeof repoPath === "string" && (win32.isAbsolute(repoPath) || posix.isAbsolute(repoPath)),
    )
    return [HOOK_REPO_ROOT, ...configured]
  } catch {
    return [HOOK_REPO_ROOT]
  }
}

const REPO_ROOTS = declaredRepoRoots()

function commandMatch(line) {
  const match = [NODE_TOOL_COMMAND.exec(line), TOOL_SCRIPT_COMMAND.exec(line), NPX_COMMAND.exec(line)]
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)[0]
  if (!match) return null
  return { command: match[0].trim().replace(/[.,;:]+$/, ""), index: match.index }
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

function splitShellSegments(line) {
  const segments = []
  let start = 0
  let quote = null

  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (quote) {
      if (character === "\\" && quote === '"') index++
      else if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }

    const pair = line.slice(index, index + 2)
    const separatorLength = pair === "&&" || pair === "||" ? 2 : character === ";" || character === "|" ? 1 : 0
    if (!separatorLength) continue
    segments.push(line.slice(start, index))
    start = index + separatorLength
    index += separatorLength - 1
  }

  segments.push(line.slice(start))
  return segments
}

function npxTokens(command) {
  return command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+/g) ?? []
}

function npxOptionStates(tokens) {
  const pending = [{ index: 1, assigned: false, confirmed: false, consumed: false, quoted: false }]
  const states = []
  const seen = new Set()

  while (pending.length) {
    const state = pending.pop()
    const key = `${state.index}:${state.assigned}:${state.confirmed}:${state.consumed}:${state.quoted}`
    if (seen.has(key)) continue
    seen.add(key)

    const option = tokens[state.index]
    if (!/^-{1,2}[^-]/.test(option ?? "")) {
      states.push(state)
      continue
    }

    pending.push({
      ...state,
      index: state.index + 1,
      assigned: state.assigned || option.includes("="),
      confirmed: state.confirmed || /^(?:--yes|-y)$/i.test(option),
    })
    const value = tokens[state.index + 1]
    if (option.includes("=") || !value || /^-{1,2}[^-]/.test(value)) continue
    pending.push({
      ...state,
      index: state.index + 2,
      consumed: true,
      quoted: state.quoted || /^(['"]).*\1$/.test(value),
    })
  }

  return states
}

function isAmbiguousNpxName(command, insideFence, hasPrefix, standaloneCommand) {
  if (insideFence === "shell") return false
  const tokens = npxTokens(command)
  if (!/^npx(?:\.cmd)?$/i.test(tokens[0] ?? "")) return false
  const positionalInvocation = (hasPrefix || standaloneCommand) && !/^-{1,2}[^-]/.test(tokens[1] ?? "")

  return !npxOptionStates(tokens).some((state) => {
    if (state.assigned || state.confirmed || state.quoted) return true
    const packageName = tokens[state.index]
    if (!packageName) return state.consumed
    if (/[./@-]/.test(packageName)) return true
    const argumentsAfterPackage = tokens.slice(state.index + 1)
    return (
      argumentsAfterPackage[0]?.startsWith("-") ||
      (positionalInvocation && argumentsAfterPackage.length > 0) ||
      (state.consumed && argumentsAfterPackage.length === 0)
    )
  })
}

function hasInstructionFraming(prefix) {
  const framing = prefix.replace(/[`*_]+\s*$/, "").trimEnd()
  const directInstruction = /(?:^|[,:;]\s*)(?:please\s+)?run(?:\s+(?:this|it|the command))?\s*$/i.test(framing)
  return directInstruction || (INTERNAL_DOCUMENTATION.test(framing) && SECOND_PERSON_RUN.test(framing))
}

function isDocumentationArtifact(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/")
  const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1)
  return (
    /(?:^|\/)\.claude\/(?:skills|agents|hooks)\//i.test(normalizedPath) ||
    DOCUMENT_BASENAME.test(basename) ||
    TICKET_BASENAME.test(basename) ||
    HELP_BASENAME.test(basename)
  )
}

function surfacedCommands(text) {
  const lines = text.split(/\r?\n/)
  const surfaced = []
  let insideFence = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fence = /^\s*```([a-z0-9_-]*)\s*$/i.exec(line)
    if (fence) {
      if (insideFence) insideFence = null
      else if (DOCUMENTATION.test(previousNonemptyLine(lines, index))) insideFence = "documentation"
      else insideFence = SHELL_FENCE.test(fence[1]) ? "shell" : "other"
      continue
    }
    if (insideFence === "documentation") continue
    if (insideFence === "other") continue

    const lineCommands = []
    for (const rawSegment of splitShellSegments(lines[index])) {
      const segment = splitAppeal(rawSegment)
      const match = commandMatch(segment.line)
      if (!match) continue
      const prefix = segment.line.slice(0, match.index)
      const instructionFramed = hasInstructionFraming(prefix)
      if (DOCUMENTATION.test(segment.line) && !instructionFramed) continue
      const hasPrefix = prefix.trim().length > 0
      const standaloneCommand = !hasPrefix && !/[.!?:]\s*$/.test(segment.line)
      if (isAmbiguousNpxName(match.command, insideFence, hasPrefix, standaloneCommand)) continue
      lineCommands.push({ command: match.command, reason: segment.reason })
    }

    const appealed = lineCommands.filter(({ reason: commandReason }) => commandReason)
    if (lineCommands.length > 1 && appealed.length === 1 && lineCommands.at(-1) === appealed[0]) {
      lineCommands[0].reason = appealed[0].reason
      appealed[0].reason = null
    }
    surfaced.push(...lineCommands)
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
  const basename = /(?:^|[\s"'\\/])tools[\\/]([a-z0-9_.-]+)/i.exec(command)?.[1]?.toLowerCase()
  if (basename === "rollup.sh") return "Use /rollup for the supported cross-repo health report."
  if (basename === "worker-watch.mjs") return "Use /watch for the supported worker status report."
  if (
    ["compose-prompt.mjs", "launch-worker.mjs", "teardown-worktree.mjs", "nudge-worker.mjs", "worker-status.mjs", "pr-watch.mjs"].includes(
      basename,
    )
  ) {
    return "Use /orchestrate for the supported worker workflow."
  }
  if (basename === "check-ticket.mjs" || basename === "new-ticket.mjs") {
    return "Use /ticket for one work item or /feature for a multi-ticket feature."
  }
  if (basename === "orca-web-port.mjs") return "Use /dev-server for the supported local server workflow."
  if (basename === "agent-review.sh") return "Use /second-opinion for the supported cross-model verdict."
  return "No skill currently exposes this capability. Say that plainly and describe the skill to build instead of giving Thomas the raw command."
}

export function checkRawRepoToolSurfacing(text, { source = "chat", filePath = "" } = {}) {
  if (typeof text !== "string" || !text.trim()) return null
  if (source === "artifact" && isDocumentationArtifact(filePath)) return null

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

function isRepoArtifact(filePath) {
  if (!filePath) return false
  const target = win32.isAbsolute(filePath) || posix.isAbsolute(filePath) ? filePath : resolve(filePath)
  return REPO_ROOTS.some((repoRoot) => {
    const rootIsWindows = WINDOWS_PATH.test(repoRoot)
    if (rootIsWindows !== WINDOWS_PATH.test(target)) return false
    const pathApi = rootIsWindows ? win32 : posix
    const relation = pathApi.relative(pathApi.normalize(repoRoot), pathApi.normalize(target))
    return relation === "" || (relation !== ".." && !relation.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relation))
  })
}

function writtenArtifact(input) {
  const filePath = filePathFrom(input) ?? ""
  const chunks =
    input.tool_name === "Write"
      ? [input?.tool_input?.content]
      : input.tool_name === "Edit"
        ? [input?.tool_input?.new_string]
        : Array.isArray(input?.tool_input?.edits)
          ? input.tool_input.edits.map((edit) => edit?.new_string)
          : []
  return { filePath, chunks: chunks.filter((value) => typeof value === "string") }
}

function artifactVerdict(input) {
  const { filePath, chunks } = writtenArtifact(input)
  if (isRepoArtifact(filePath)) return null

  const appeals = []
  for (const text of chunks) {
    const verdict = checkRawRepoToolSurfacing(text, { source: "artifact", filePath })
    if (verdict?.block) return verdict
    if (verdict?.appeal) appeals.push(verdict)
  }
  if (!appeals.length) return null
  return { appeal: true, message: appeals.map(({ message }) => message).join("\n") }
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

    emit(artifactVerdict(input))
  } catch {
    process.exit(0)
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) runHook()
