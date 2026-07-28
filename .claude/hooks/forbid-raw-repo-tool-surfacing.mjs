#!/usr/bin/env node
// Stop and PostToolUse adapter for the raw repo-tool surfacing gate. Skill
// internals, agent bodies, ticket bodies, PR descriptions, and help output are
// documentation, not user instructions.
// Artifact checks inspect only new tool-input text and skip files under declared
// repos, where source and documentation references are owned by CI.
// Appeals are command-scoped: the marker must share the command's line, and
// every surfaced command needs its own reason.
// Chat exemptions are bounded to punctuation clauses and adjacent inline-code
// atoms. An ambiguous quote, fence, or backtick parse fails closed.

import { existsSync, readFileSync } from "node:fs"
import { dirname, posix, resolve, win32 } from "node:path"
import { fileURLToPath } from "node:url"

import { filePathFrom, readStdinJson } from "./_lib/io.mjs"

const APPEAL_SUFFIX = /\s+(?:#\s*)?Repo-tool appeal:\s*(\S.*)\s*$/i
const NODE_TOOL_COMMAND =
  /\bnode(?:\.exe)?(?:[ \t]+-{1,2}[a-z0-9][a-z0-9-]*(?:=[^`\s]+|[ \t]+[^`\s]+)?)*[ \t]+(?:"(?:(?:[a-z]:)?[\\/]*(?:[^"`\r\n]+[\\/])*)?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)"|'(?:(?:[a-z]:)?[\\/]*(?:[^'`\r\n]+[\\/])*)?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts)'|(?:(?:[a-z]:)?[\\/]*(?:[a-z0-9_.-]+[\\/])*)?tools[\\/][a-z0-9_./\\-]+\.(?:mjs|cjs|js|ts))/gi
const TOOL_SCRIPT_COMMAND =
  /(?:(?:(?:pwsh|powershell)(?:\.exe)?[ \t]+)?["']?(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.ps1["']?|(?:\.?[\\/])?tools[\\/][a-z0-9_./\\-]+\.sh)/gi
const NPX_COMMAND = /\bnpx(?:\.cmd)?\b/gi
const SHELL_FENCE = /^(?:bash|sh|shell|zsh|powershell|pwsh|cmd|console)?$/i
const QUOTED_FENCE = /^(?:json|jsonc|yaml|yml|text|markdown|md|toml|xml)$/i
const DOCUMENTATION =
  /\b(?:skill body|agent body|ticket body|linear ticket|PR description|pull request description|tool help|internally|under the hood|inside (?:its|the) automation)\b|(?<![\p{L}\p{N}_-])(?:--help|help)[^\p{L}\p{N}_\r\n]+(?:output|text)\b/iu
const INTERNAL_DOCUMENTATION = /\b(?:internally|under the hood|inside (?:its|the) automation)\b/i
const SECOND_PERSON_RUN =
  /\b(?:you|you['’](?:d|ll)|you\s+(?:can|could|may|might|must|should|will|would)|you\s+(?:have|need|ought)\s+to)\s+(?:(?:just|simply)\s+)?run(?:\s+(?:this|it|the command))?\s*$/i
const DESCRIPTIVE_OWNER = /^\s*(?:the|this)\s+(?:implementation|orchestrator|skill|agent)\b/i
const DESCRIPTIVE_NPX_PREFIX =
  /^\s*(?:the|this|that)\s+(?:(?:--?[a-z0-9-]+)\s+)?(?:package|command|tool|option|flag|example|implementation)\b.*\b(?:as|about|regarding|describes?|explains?|tells?|mentions?)\s*$/i
const DESCRIPTIVE_NPX_CLAUSE =
  /^\s*(?:the|this|that)\b[^.!?]*\b(?:option|flag)\b[^.!?]*\b(?:tells?|describes?|explains?)\b/i
const DESCRIPTIVE_NPX_LINK = /\b(?:as|about|regarding|describes?|explains?|tells?|mentions?)\s*$/i
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

function commandMatches(text) {
  const matches = []
  for (const pattern of [NODE_TOOL_COMMAND, TOOL_SCRIPT_COMMAND, NPX_COMMAND]) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) matches.push({ index: match.index, end: match.index + match[0].length })
  }
  matches.sort((left, right) => left.index - right.index || right.end - left.end)

  const accepted = []
  for (const match of matches) {
    if (!accepted.length || match.index >= accepted.at(-1).end) accepted.push(match)
  }
  return accepted
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

function isContractionQuote(text, index) {
  return text[index] === "'" && /[\p{L}\p{N}]/u.test(text[index - 1] ?? "") && /[\p{L}\p{N}]/u.test(text[index + 1] ?? "")
}

function splitShellSegments(line) {
  const segments = []
  let start = 0
  let quote = null
  let ambiguous = false

  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (quote) {
      if (character === "\\" && quote === '"') index++
      else if (character === quote) quote = null
      continue
    }
    if ((character === "'" && !isContractionQuote(line, index)) || character === '"') {
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
  if (quote) ambiguous = true
  return { segments, ambiguous }
}

function isClauseBoundary(text, index) {
  const character = text[index]
  if (!/[.,;:]/.test(character)) return false
  if (character === ":" && /[a-z]/i.test(text[index - 1] ?? "") && /[\\/]/.test(text[index + 1] ?? "")) return false
  if (character === "." && text[index + 1] !== undefined && !/\s/.test(text[index + 1])) return false
  return true
}

function splitClauseAtoms(text) {
  const clauses = []
  let atoms = []
  let atomStart = 0
  let atomKind = "prose"
  let quote = null
  let codeTicks = 0
  let ambiguous = false

  const pushAtom = (end) => {
    if (end > atomStart) atoms.push({ text: text.slice(atomStart, end), start: atomStart, end, kind: atomKind })
  }
  const pushClause = () => {
    if (atoms.some(({ text: atomText }) => atomText.trim())) clauses.push({ atoms })
    atoms = []
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (!quote && character === "`") {
      let runLength = 1
      while (text[index + runLength] === "`") runLength++
      pushAtom(index)
      if (!codeTicks) {
        codeTicks = runLength
        atomKind = "code"
      } else if (codeTicks === runLength) {
        codeTicks = 0
        atomKind = "prose"
      } else {
        ambiguous = true
      }
      index += runLength - 1
      atomStart = index + 1
      continue
    }
    if (codeTicks) continue
    if (quote) {
      if (character === "\\" && quote === '"') index++
      else if (character === quote) quote = null
      continue
    }
    if ((character === "'" && !isContractionQuote(text, index)) || character === '"') {
      quote = character
      continue
    }
    if (!isClauseBoundary(text, index)) continue
    pushAtom(index + 1)
    pushClause()
    atomStart = index + 1
  }

  pushAtom(text.length)
  pushClause()
  if (quote || codeTicks) ambiguous = true
  return { clauses, ambiguous }
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

function isClearlyDescriptiveNpxMention(command, { insideFence, insideCode, prefix, clauseText }) {
  if (insideFence === "shell" || insideCode) return false
  if (DESCRIPTIVE_NPX_PREFIX.test(prefix)) return true
  if (DESCRIPTIVE_NPX_CLAUSE.test(clauseText)) return true
  const tokens = npxTokens(command)
  if (!/^npx(?:\.cmd)?$/i.test(tokens[0] ?? "")) return false
  const hasPrefix = prefix.trim().length > 0
  const standaloneCommand = !hasPrefix && !/[.,;!?:]\s*$/.test(clauseText)
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

function hasNpxInstructionFraming(prefix) {
  const stem = prefix.replace(DESCRIPTIVE_NPX_LINK, "").trimEnd()
  if (hasInstructionFraming(prefix) || hasInstructionFraming(stem)) return true
  if (DOCUMENTATION.test(stem) && !INTERNAL_DOCUMENTATION.test(stem)) return false
  return SECOND_PERSON_RUN.test(stem)
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

function fencePairs(lines) {
  const pairs = new Map()
  let opening = null
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*```[a-z0-9_-]*\s*$/i.test(lines[index])) continue
    if (opening === null) opening = index
    else {
      pairs.set(opening, index)
      pairs.set(index, opening)
      opening = null
    }
  }
  return { pairs, unclosed: opening }
}

function isDocumentationFenceIntroduction(line) {
  const { clauses, ambiguous } = splitClauseAtoms(line)
  if (ambiguous) return false
  const lastClause = clauses.at(-1)
  if (!lastClause) return false
  const clauseText = lastClause.atoms.map(({ text: atomText }) => atomText).join("")
  return DOCUMENTATION.test(clauseText) && !hasInstructionFraming(clauseText)
}

function isQuotedFenceIntroduction(line) {
  const { clauses, ambiguous } = splitClauseAtoms(line)
  if (ambiguous) return false
  const lastClause = clauses.at(-1)
  if (!lastClause) return false
  const clauseText = lastClause.atoms.map(({ text: atomText }) => atomText).join("")
  return /\b(?:(?:configuration|config)\s+(?:value|payload)|(?:example|sample|captured)\s+output|quoted material|(?:json|yaml|toml|xml|markdown|text)\s+(?:configuration|payload|value))(?:\s+(?:is|follows))?\s*:?\s*$/i.test(
    clauseText,
  )
}

function commandContexts(segmentText, insideFence, inheritedAmbiguity) {
  const { clauses, ambiguous: clauseAmbiguity } = splitClauseAtoms(segmentText)
  const contexts = []

  for (const { atoms } of clauses) {
    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex++) {
      const atom = atoms[atomIndex]
      const matches = commandMatches(atom.text)
      for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
        const match = matches[matchIndex]
        const end = matches[matchIndex + 1]?.index ?? atom.text.length
        const command = atom.text.slice(match.index, end).trim().replace(/[.,;:]+$/, "")
        const previous = atom.kind === "code" && atoms[atomIndex - 1]?.kind === "prose" ? atoms[atomIndex - 1].text : ""
        const following = atom.kind === "code" && atoms[atomIndex + 1]?.kind === "prose" ? atoms[atomIndex + 1].text : ""
        const prefix = `${previous}${atom.text.slice(0, match.index)}`
        contexts.push({
          ambiguous: inheritedAmbiguity || clauseAmbiguity,
          clauseText: `${previous}${atom.text}${following}`,
          command,
          documentationPrefix: atom.kind === "code" ? previous : prefix,
          documentationSuffix: atom.kind === "code" ? following : atom.text.slice(match.end),
          insideCode: atom.kind === "code",
          insideFence,
          prefix,
        })
      }
    }
  }
  return contexts
}

function surfacedCommands(text) {
  const lines = text.split(/\r?\n/)
  const surfaced = []
  let insideFence = null
  const { pairs, unclosed } = fencePairs(lines)

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fence = /^\s*```([a-z0-9_-]*)\s*$/i.exec(line)
    if (fence) {
      if (insideFence) insideFence = null
      else if (!pairs.has(index) || unclosed === index) insideFence = "ambiguous"
      else if (isDocumentationFenceIntroduction(previousNonemptyLine(lines, index))) insideFence = "documentation"
      else if (SHELL_FENCE.test(fence[1])) insideFence = "shell"
      else if (QUOTED_FENCE.test(fence[1]) && isQuotedFenceIntroduction(previousNonemptyLine(lines, index))) {
        insideFence = "quoted"
      } else {
        insideFence = "ambiguous"
      }
      continue
    }
    if (insideFence === "documentation") continue
    if (insideFence === "quoted") continue

    const lineCommands = []
    const { segments: rawSegments, ambiguous: shellAmbiguity } = splitShellSegments(lines[index])
    for (const rawSegment of rawSegments) {
      const segment = splitAppeal(rawSegment)
      const contexts = commandContexts(segment.line, insideFence, shellAmbiguity || insideFence === "ambiguous")
      const segmentCommands = []
      for (const context of contexts) {
        const instructionFramed =
          hasInstructionFraming(context.prefix) ||
          (/^npx(?:\.cmd)?\b/i.test(context.command) && hasNpxInstructionFraming(context.prefix))
        const documentedPrefix = DOCUMENTATION.test(context.documentationPrefix)
        const documentedSuffix =
          DOCUMENTATION.test(context.documentationSuffix) &&
          (!context.documentationPrefix.trim() || DESCRIPTIVE_OWNER.test(context.documentationPrefix))
        const documented = (documentedPrefix || documentedSuffix) && !instructionFramed
        const descriptiveNpx = isClearlyDescriptiveNpxMention(context.command, context)
        if (!context.ambiguous && (documented || descriptiveNpx)) continue
        segmentCommands.push({ command: context.command, reason: null })
      }
      if (segment.reason && segmentCommands.length) segmentCommands.at(-1).reason = segment.reason
      lineCommands.push(...segmentCommands)
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
  if (basename === "agent-review.sh" || basename === "agent-review.ps1") {
    return "Use /second-opinion for the supported cross-model verdict."
  }
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
      "Ambiguous command context is blocked by design: a false block can be appealed, while a false pass disables the gate.",
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
