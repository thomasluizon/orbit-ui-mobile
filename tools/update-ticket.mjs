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
 */

import { readFileSync } from "node:fs"

import { readTicket, resolveTicket, updateBody } from "./lib/github-issues.mjs"

const USAGE = `usage: update-ticket.mjs --issue <ORB-N|#N|N> --body-file <path|-> --confirm-replace

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --body-file <path|->  the COMPLETE new markdown body, or - to read stdin (required)
  --confirm-replace     acknowledge that this overwrites the whole body (required)
  --help, -h            print this usage and exit 0

Replaces the body. It never appends, never comments, never changes labels, milestone or board
Status, and never opens or closes anything. Writing a body identical to the live one is reported as
unchanged and performs no write.

Compose the complete body: a partial file silently deletes every section it omits.

--issue MUST be copied from output produced in this run, never from memory (core rule 3).

exit codes: 0 body replaced or already identical, 1 ticket read or write failed, 2 usage error`

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

const VALUE_FLAGS = new Set(["--issue", "--body-file"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--confirm-replace", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issueReference = argOf("--issue")
const bodyFile = argOf("--body-file")
if (!issueReference || issueReference.startsWith("-")) fail(2, `${USAGE}\n\n--issue is required`)
if (!bodyFile || bodyFile.startsWith("--")) fail(2, `${USAGE}\n\n--body-file is required`)
/**
 * The overwrite is the whole point and it is still destructive, so it is stated rather than
 * assumed. tools/CONVENTIONS.md: a destructive action takes an explicit flag, never a prompt.
 */
if (!process.argv.includes("--confirm-replace")) fail(2, `${USAGE}\n\n--confirm-replace is required, because this overwrites the whole body`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `update-ticket: ${error.message}`)
}

let body
try {
  body = readFileSync(bodyFile === "-" ? 0 : bodyFile, "utf8")
} catch (error) {
  fail(2, `update-ticket: cannot read ${bodyFile}: ${error.message}`)
}
if (body.trim().length === 0) fail(2, `${USAGE}\n\nthe new body is empty`)

try {
  const ticket = await readTicket(resolved.number, { withProjectItem: false })
  /** Normalized because GitHub returns CRLF for a body a browser submitted, and a file on disk here is LF. */
  const normalize = (text) => text.replace(/\r\n/g, "\n").trimEnd()
  const changed = normalize(ticket.body ?? "") !== normalize(body)
  if (changed) await updateBody(ticket.number, body)
  console.log(JSON.stringify({
    number: ticket.number,
    url: ticket.url,
    title: ticket.title,
    changed,
    bytesBefore: (ticket.body ?? "").length,
    bytesAfter: changed ? body.length : (ticket.body ?? "").length,
  }, null, 2))
} catch (error) {
  fail(1, `update-ticket: ${error.message}`)
}
