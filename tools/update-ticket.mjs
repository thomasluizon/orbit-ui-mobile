#!/usr/bin/env node
/**
 * Replace the body of one ticket.
 *
 * The body was write-once until this existed (2026-08-13): `create-ticket.mjs` wrote it and nothing
 * could change it afterwards. D2 makes the ticket the prompt, so a correction to the work order
 * belongs here, in the body. `comment-ticket.mjs` also reaches the worker (compose-prompt renders
 * the thread), but a comment is for a decision arriving as its own event; a body plus errata
 * comments stops being one coherent work order.
 *
 * This replaces the whole body rather than appending, for the same reason. Compose the complete
 * body, then write it. GitHub keeps the previous body in the issue's edit history.
 *
 * The TITLE joined it on 2026-08-25, for the same reason one field over. orbit-tickets#365 kept
 * ordering "the 24 grid variant" in its title long after DESIGN.md:267 cancelled that deliverable,
 * and the body said so while the title did not. A title is the one line every board view and every
 * `gh issue list` shows, so a stale one misdirects for as long as it stands. Either field alone is
 * a valid write; at least one is required.
 *
 * Only `--body-file` needs `--confirm-replace`. The body flag carries that guard because a partial
 * file silently deletes every section it omits, and that failure has no counterpart in a title
 * typed out in full.
 */

import { readFileSync } from "node:fs"

import { readTicket, resolveTicket, updateBody, updateTitle } from "./lib/github-issues.mjs"

const USAGE = `usage: update-ticket.mjs --issue <ORB-N|#N|N> [--body-file <path|-> --confirm-replace] [--title <text>]

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --body-file <path|->  the COMPLETE new markdown body, or - to read stdin
  --confirm-replace     acknowledge that this overwrites the whole body (required with --body-file)
  --title <text>        the COMPLETE new title, one line
  --help, -h            print this usage and exit 0

At least one of --body-file and --title is required. Either may be given alone.

Replaces the fields it is given. It never appends, never comments, never changes labels, milestone
or board Status, and never opens or closes anything. A body or a title identical to the live one is
reported as unchanged and performs no write.

Compose the complete body: a partial file silently deletes every section it omits.

--issue MUST be copied from output produced in this run, never from memory (core rule 3).

exit codes: 0 written or already identical, 1 ticket read or write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const VALUE_FLAGS = new Set(["--issue", "--body-file", "--title"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--confirm-replace", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issueReference = argOf("--issue")
const wantsBody = process.argv.includes("--body-file")
const wantsTitle = process.argv.includes("--title")
const bodyFile = argOf("--body-file")
const newTitle = argOf("--title")
if (!issueReference || issueReference.startsWith("-")) fail(2, `${USAGE}\n\n--issue is required`)
if (!wantsBody && !wantsTitle) fail(2, `${USAGE}\n\nat least one of --body-file and --title is required`)
if (wantsBody && (!bodyFile || bodyFile.startsWith("--"))) fail(2, `${USAGE}\n\n--body-file needs a path`)
if (wantsTitle && (!newTitle || newTitle.startsWith("--"))) fail(2, `${USAGE}\n\n--title needs a title`)
if (wantsTitle && newTitle.trim().length === 0) fail(2, `${USAGE}\n\nthe new title is empty`)
/** A GitHub title is one line, so a newline here is a quoting mistake rather than a title. */
if (wantsTitle && /[\r\n]/.test(newTitle)) fail(2, `${USAGE}\n\nthe new title must be one line`)
/**
 * The overwrite is the whole point and it is still destructive, so it is stated rather than
 * assumed. tools/CONVENTIONS.md: a destructive action takes an explicit flag, never a prompt.
 * Only the BODY carries this guard: a partial file silently deletes every section it omits, and a
 * title typed out in full has no such failure.
 */
if (wantsBody && !process.argv.includes("--confirm-replace")) fail(2, `${USAGE}\n\n--confirm-replace is required, because this overwrites the whole body`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `update-ticket: ${error.message}`)
}

let body = null
if (wantsBody) {
  try {
    body = readFileSync(bodyFile === "-" ? 0 : bodyFile, "utf8")
  } catch (error) {
    fail(2, `update-ticket: cannot read ${bodyFile}: ${error.message}`)
  }
  if (body.trim().length === 0) fail(2, `${USAGE}\n\nthe new body is empty`)
}

try {
  const ticket = await readTicket(resolved.number, { withProjectItem: false })
  /** Normalized because GitHub returns CRLF for a body a browser submitted, and a file on disk here is LF. */
  const normalize = (text) => text.replace(/\r\n/g, "\n").trimEnd()
  const bodyChanged = wantsBody && normalize(ticket.body ?? "") !== normalize(body)
  const titleChanged = wantsTitle && (ticket.title ?? "").trim() !== newTitle.trim()
  /** Title first: if the body write then fails, the cheap field is already correct rather than both being stale. */
  if (titleChanged) await updateTitle(ticket.number, newTitle)
  if (bodyChanged) await updateBody(ticket.number, body)
  console.log(JSON.stringify({
    number: ticket.number,
    url: ticket.url,
    title: titleChanged ? newTitle : ticket.title,
    changed: bodyChanged || titleChanged,
    bodyChanged,
    titleChanged,
    bytesBefore: (ticket.body ?? "").length,
    bytesAfter: bodyChanged ? body.length : (ticket.body ?? "").length,
  }, null, 2))
} catch (error) {
  fail(1, `update-ticket: ${error.message}`)
}
