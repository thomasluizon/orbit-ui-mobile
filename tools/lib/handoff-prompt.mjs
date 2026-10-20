/** The handoff prompt contract, checked mechanically so a handoff cannot ignore the mode the owner asked for. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, gitDirectoryOf } from "./run-state.mjs"

export const HANDOFF_PROMPT_PATH = ".claude/handoffs/NEXT.md"
const REQUEST_FILE = "orbit-handoff-request.json"
const KEPT_REQUESTS = 20

const SLEEP_TOKEN = /(?:^|[\s(])(?:--sleep|\/sleep)(?=$|[\s),;!?])/
// The hook documentation gives the typed text; the transcript stores the expanded command tags. Accept both.
const HANDOFF_COMMAND = /<command-name>\/(handoff|wrap-up)<\/command-name>|(?:^|[\s(])\/(handoff|wrap-up)(?=$|[\s),;!?])/g
const TAGGED_ARGS = /<command-args>([\s\S]*?)<\/command-args>/
const QUOTED_CONTENT = /(<pasted_content\b[^>]*>)|^[ \t]{0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)|(`+)/gm
const PASTED_TAG = /<(\/?)pasted_content\b([^>]*)>/g
const PASTED_ID = /\bid\s*=\s*"([^"]*)"/

// A pasted region ends at the closing tag that carries its own id, or at its balanced close, so a nested block cannot end it early.
const pastedRegionEnd = (prompt, start) => {
  const tags = new RegExp(PASTED_TAG.source, "g")
  tags.lastIndex = start
  const id = PASTED_ID.exec(tags.exec(prompt)[2])?.[1]
  let depth = 1
  for (let tag = tags.exec(prompt); tag; tag = tags.exec(prompt)) {
    if (id === undefined) depth += tag[1] ? -1 : 1
    else if (tag[1] && PASTED_ID.exec(tag[2])?.[1] === id) depth = 0
    if (depth === 0) return tag.index + tag[0].length
  }
  return prompt.length
}

const ownerPromptText = (prompt) => {
  const parts = []
  let previousEnd = 0
  for (const quoted of prompt.matchAll(QUOTED_CONTENT)) {
    if (quoted.index < previousEnd) continue
    const delimiter = quoted[2] ?? quoted[3]
    let end = quoted[1] ? pastedRegionEnd(prompt, quoted.index) : quoted.index + quoted[0].length
    if (delimiter) {
      const closing = quoted[2]
        ? new RegExp(`^[ \\t]{0,3}${delimiter[0]}{${delimiter.length},}[ \\t]*\\r?$`, "gm")
        : new RegExp(`(?<!${delimiter[0]})${delimiter[0]}{${delimiter.length}}(?!${delimiter[0]})`, "g")
      closing.lastIndex = end
      const match = closing.exec(prompt)
      if (!match && quoted[3]) continue
      end = match ? match.index + match[0].length : prompt.length
    }
    parts.push(prompt.slice(previousEnd, quoted.index), prompt.slice(quoted.index, end).replace(/[^\r\n]/g, " "))
    previousEnd = end
  }
  return parts.join("") + prompt.slice(previousEnd)
}

/** A `/handoff` or `/wrap-up` invocation and whether it asked for an unattended next session, or null. */
export const parseHandoffRequest = (prompt) => {
  if (typeof prompt !== "string") return null
  const text = ownerPromptText(prompt)
  const [first, next] = text.matchAll(HANDOFF_COMMAND)
  if (!first) return null
  const command = first[1] ?? first[2]
  const trailing = text.slice(first.index + first[0].length, next?.index ?? text.length)
  const args = first[1] ? (TAGGED_ARGS.exec(trailing)?.[1] ?? "") : trailing
  return { command, sleep: SLEEP_TOKEN.test(args) }
}

const headingLine = (lines, prefix) => lines.findIndex((line) => line.startsWith(prefix))

const sectionBody = (lines, prefix) => {
  const start = headingLine(lines, prefix)
  if (start < 0) return null
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n")
}

/** Every requirement the prompt misses; `sleep` true or false adds that mode's rules, undefined checks only the shared ones. */
export const validateHandoffPrompt = (text, { sleep }) => {
  const lines = String(text ?? "").split("\n")
  const firstNonEmptyLine = lines.find((line) => line.trim() !== "")?.trim() ?? ""
  const firstHeading = lines.findIndex((line) => line.startsWith("## "))
  const opening = lines.slice(0, firstHeading < 0 ? lines.length : firstHeading).join("\n")
  const missing = []
  if (sleep === true) {
    if (lines[0].replace(/\r$/, "") !== "/sleep") missing.push("the first line must be exactly `/sleep`, so the prompt runs with nothing added")
    if (headingLine(lines, "## Sleep") < 0) missing.push("a `## Sleep` section")
  } else if (sleep === false && firstNonEmptyLine.startsWith("/")) {
    missing.push("an attended prompt must not start with a slash command")
  }
  if (!/\.claude\/specs\/[\w.-]+\.md/.test(opening)) missing.push("the spec path `.claude/specs/<slug>.md` before the first `##` heading")
  const goal = sectionBody(lines, "## Goal")
  if (goal === null) missing.push("a `## Goal` section")
  else if (!goal.includes("gh issue list")) missing.push("a `gh issue list` query in `## Goal` that lists what is left")
  if (headingLine(lines, "## In flight") < 0) missing.push("a `## In flight` section")
  if (headingLine(lines, "## Previous prompt, disposition") < 0) missing.push("a `## Previous prompt, disposition` section giving every earlier instruction carried, done or superseded")
  if (!/identifier[\s\S]{0,120}lead to verify/i.test(text ?? "")) missing.push("the line saying every identifier is a lead to verify")
  return missing
}

const requestPath = (repoRoot) => join(gitDirectoryOf(repoRoot), REQUEST_FILE)

const readRequests = (repoRoot) => {
  try {
    return JSON.parse(readFileSync(requestPath(repoRoot), "utf8"))
  } catch {
    return {}
  }
}

/** Records a handoff request from the owner's prompt or the machine's context relay hook and tool. */
export const recordHandoffRequest = (sessionId, request, recordedAt, repoRoot = REPO_ROOT) => {
  if (!sessionId || !request) return
  const requests = readRequests(repoRoot)
  requests[sessionId] = { ...request, recordedAt }
  const kept = Object.entries(requests)
    .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
    .slice(0, KEPT_REQUESTS)
  mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
  writeFileSync(requestPath(repoRoot), `${JSON.stringify(Object.fromEntries(kept), null, 2)}\n`)
}

export const readHandoffRequest = (sessionId, repoRoot = REPO_ROOT) => (sessionId ? readRequests(repoRoot)[sessionId] ?? null : null)
