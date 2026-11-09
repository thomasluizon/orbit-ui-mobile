/** The handoff prompt contract, checked mechanically so a handoff cannot ignore the mode the owner asked for. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"

import { REPO_ROOT, gitDirectoryOf, readRunState, updateRunState } from "./run-state.mjs"

export const HANDOFF_PROMPT_PATH = ".claude/handoffs/NEXT.md"
// A relay re-reads the prompt and its spec in full, so both carry a byte ceiling (thomasluizon/orbit-tickets#2064).
export const HANDOFF_PROMPT_MAX_BYTES = 8192
export const SPEC_MAX_BYTES = 40960
const SPEC_PATH = /\.claude\/specs\/[\w.-]+\.md/g
const REQUEST_FILE = "orbit-handoff-request.json"
const KEPT_REQUESTS = 20

const SLEEP_TOKEN = /(?:^|[\s(])(?:--sleep|\/sleep)(?=$|[\s),;!?])/
const CRANK_TOKEN = /(?:^|[\s(])(?:--crank|\/crank)(?=$|[\s),;!?])/
// The hook documentation gives the typed text; the transcript stores the expanded command tags. Accept both.
const HANDOFF_COMMAND = /<command-name>\/(handoff|wrap-up)<\/command-name>|^[\t ]*\/(handoff|wrap-up)(?=$|[\s),;!?])/gm
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
  const args = first[1] ? (TAGGED_ARGS.exec(trailing)?.[1] ?? "") : trailing.split(/\r?\n|\s+\/(?:handoff|wrap-up)\b/)[0]
  const crank = CRANK_TOKEN.test(args)
  return { command, sleep: crank || SLEEP_TOKEN.test(args), crank }
}

const headingLine = (lines, prefix) => lines.findIndex((line) => line.startsWith(prefix))

const sectionBody = (lines, prefix) => {
  const start = lines.findIndex((line) => line.trimEnd() === prefix)
  if (start < 0) return null
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n")
}

/** The byte ceiling of a relay document: NEXT.md, a spec under `.claude/specs/`, or null for any other path. */
export const relayDocumentLimit = (path) => {
  if (path === HANDOFF_PROMPT_PATH) return HANDOFF_PROMPT_MAX_BYTES
  return /^\.claude\/specs\/[^/]+\.md$/.test(path) ? SPEC_MAX_BYTES : null
}

/** The requirement a relay document over its ceiling misses, naming the file and its size, or null. */
export const relayDocumentOversize = (path, text) => {
  const limit = relayDocumentLimit(path)
  const bytes = Buffer.byteLength(text, "utf8")
  if (limit === null || bytes <= limit) return null
  const remedy = path === HANDOFF_PROMPT_PATH
    ? "keep only the in-flight rows and the next steps, and point at the spec for the rest"
    : "replace the Current state paragraph and leave history to git, never append"
  return `\`${path}\` within ${limit} B (it is ${bytes} B): ${remedy}`
}

const promptOpening = (lines) => {
  const firstHeading = lines.findIndex((line) => line.startsWith("## "))
  return lines.slice(0, firstHeading < 0 ? lines.length : firstHeading).join("\n")
}

/** The spec paths named before the prompt's first `##` heading. */
export const openingSpecPaths = (text) => [...new Set(promptOpening(String(text ?? "").split("\n")).match(SPEC_PATH) ?? [])]

/**
 * Every requirement the prompt misses; `sleep` true or false adds that mode's rules, undefined checks only the shared ones.
 * `specVersions(path)` returns each version of a named spec that the caller would publish; omitted, no spec size is read.
 */
export const validateHandoffPrompt = (text, { sleep, crank, autoWork, specVersions }) => {
  const lines = String(text ?? "").split("\n")
  const firstNonEmptyLine = lines.find((line) => line.trim() !== "")?.trim() ?? ""
  const missing = []
  const promptOversize = relayDocumentOversize(HANDOFF_PROMPT_PATH, String(text ?? ""))
  if (promptOversize) missing.push(promptOversize)
  for (const path of specVersions ? openingSpecPaths(text) : []) {
    const oversize = specVersions(path).map((version) => relayDocumentOversize(path, version)).find(Boolean)
    if (oversize) missing.push(oversize)
  }
  if (sleep === true || crank === true || autoWork === true) {
    const entry = autoWork === true ? "/auto-work" : "/sleep"
    if (lines[0].replace(/\r$/, "") !== entry) missing.push(`the first line must be exactly \`${entry}\`, so the prompt runs with nothing added`)
    if (headingLine(lines, "## Sleep") < 0) missing.push("a `## Sleep` section")
  } else if (sleep === false && firstNonEmptyLine.startsWith("/")) {
    missing.push("an attended prompt must not start with a slash command")
  }
  if (crank === true) {
    const body = sectionBody(lines, "## Crank")
    if (body === null || !/(?:^|[\s`(])\/crank(?=$|[\s`),;.!?])/.test(body)) {
      missing.push("a `## Crank` section whose body invokes `/crank` immediately after `/sleep` entry")
    }
  }
  if (openingSpecPaths(text).length === 0) missing.push("the spec path `.claude/specs/<slug>.md` before the first `##` heading")
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
  const path = requestPath(repoRoot)
  try {
    const requests = JSON.parse(readFileSync(path, "utf8"))
    if (!requests || typeof requests !== "object" || Array.isArray(requests)) throw new Error("expected a request map")
    return requests
  } catch (error) {
    if (error.code === "ENOENT") return {}
    throw new Error(`Cannot read handoff requests ${path}: ${error.message}`, { cause: error })
  }
}

/** New requests enable the matching run when recorded; later run writes supersede that intent. */
export const handoffCrank = (request, state) =>
  typeof state?.crank === "boolean" ? state.crank : request?.crank === true

export const handoffAutoWork = (request, state) =>
  typeof state?.autoWork === "boolean" ? state.autoWork : request?.autoWork === true

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
  if (request.crank === true) updateRunState((state) => state?.sessionId === sessionId ? { ...state, crank: true } : undefined, repoRoot)
}

export const readHandoffRequest = (sessionId, repoRoot = REPO_ROOT) => (sessionId ? readRequests(repoRoot)[sessionId] ?? null : null)

/** The working copy of each spec a checkout would publish; a spec the checkout lacks has no version to measure. */
export const checkoutSpecVersions = (repoRoot) => (path) =>
  existsSync(join(repoRoot, path)) ? [readFileSync(join(repoRoot, path), "utf8")] : []

const promptHash = (prompt) => createHash("sha256").update(prompt).digest("hex")

/** An owner handoff binds intake to this predecessor and the exact prompt being handed over. */
export const prepareOwnerHandoffRun = (sessionId, repoRoot = REPO_ROOT) => {
  let ownerHandoff
  const written = updateRunState((state) => {
    if (state?.sessionId !== sessionId || state.autoWork !== true || readHandoffRequest(sessionId, repoRoot)?.origin !== "owner") return undefined
    const prompt = readFileSync(join(repoRoot, HANDOFF_PROMPT_PATH), "utf8")
    const missing = validateHandoffPrompt(prompt, { sleep: true, autoWork: true, crank: state.crank, specVersions: checkoutSpecVersions(repoRoot) })
    if (missing.length) throw new Error(`Owner handoff prompt misses: ${missing.join("; ")}`)
    ownerHandoff = { from: sessionId, promptHash: promptHash(prompt) }
    return { ...state, ownerHandoff }
  }, repoRoot)
  if (written === undefined) return false
  if (JSON.stringify(written.ownerHandoff) !== JSON.stringify(ownerHandoff)) throw new Error("Owner intake handoff write was not confirmed")
  return true
}

/** The actual incoming prompt, rather than a file read in its place, authorizes owner succession. */
export const adoptOwnerHandoffRun = (sessionId, prompt, repoRoot = REPO_ROOT) => {
  let previous
  const inherited = updateRunState((current) => {
    previous = current
    const record = previous?.ownerHandoff
    if (!sessionId || sessionId === previous?.sessionId || previous?.autoWork !== true || record?.from !== previous?.sessionId ||
        typeof prompt !== "string" || record.promptHash !== promptHash(prompt) || readHandoffRequest(record.from, repoRoot)?.origin !== "owner") return undefined
    if (record.promptHash !== promptHash(readFileSync(join(repoRoot, HANDOFF_PROMPT_PATH), "utf8"))) return undefined
    return { ...previous, sessionId, sleep: true, decisionLogPath: null, relay: { from: previous.sessionId, pending: false },
      ownerHandoff: { ...record, successorSessionId: sessionId } }
  }, repoRoot)
  if (inherited === undefined) return false
  if (inherited.sessionId !== sessionId || JSON.stringify(inherited.intake) !== JSON.stringify(previous.intake)) throw new Error("Owner intake adoption was not confirmed")
  return true
}
