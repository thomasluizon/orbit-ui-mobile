/** The handoff prompt contract, checked mechanically so a handoff cannot ignore the mode the owner asked for. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, gitDirectoryOf } from "./run-state.mjs"

export const HANDOFF_PROMPT_PATH = ".claude/handoffs/NEXT.md"
const REQUEST_FILE = "orbit-handoff-request.json"
const KEPT_REQUESTS = 20

const HANDOFF_COMMANDS = new Set(["handoff", "wrap-up"])
const SLEEP_TOKEN = /(^|\s)(--sleep|\/sleep)(\s|$)/
// The hook documentation gives the typed text; the transcript stores the expanded command tags. Accept both.
const TYPED_COMMAND = /^\s*\/([a-z][\w-]*)\b([\s\S]*)$/
const TAGGED_COMMAND = /<command-name>\/([a-z][\w-]*)<\/command-name>/
const TAGGED_ARGS = /<command-args>([\s\S]*?)<\/command-args>/

/** A `/handoff` or `/wrap-up` invocation and whether it asked for an unattended next session, or null. */
export const parseHandoffRequest = (prompt) => {
  if (typeof prompt !== "string") return null
  const tagged = TAGGED_COMMAND.exec(prompt)
  const typed = tagged ? null : TYPED_COMMAND.exec(prompt)
  const command = tagged?.[1] ?? typed?.[1]
  if (!command || !HANDOFF_COMMANDS.has(command)) return null
  const args = tagged ? (TAGGED_ARGS.exec(prompt)?.[1] ?? "") : typed[2]
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

/** Records the owner's handoff request for one session; the prompt text is the owner's, never the model's. */
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
