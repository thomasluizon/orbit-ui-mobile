#!/usr/bin/env node

import { readFileSync } from "node:fs"

import { addComment, readTicket, resolveTicket } from "./lib/github-issues.mjs"

const USAGE = `usage: comment-ticket.mjs --issue <ORB-N|#N|N> --body-file <path|->

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --body-file <path|->  markdown comment body, or - to read stdin (required)
  --help, -h            print this usage and exit 0

Writes one comment. It never changes board Status and never opens or closes anything.

--issue MUST be copied from output produced in this run, never from memory (core rule 3).

exit codes: 0 comment posted, 1 ticket read or write failed, 2 usage error`

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
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issueReference = argOf("--issue")
const bodyFile = argOf("--body-file")
if (!issueReference || issueReference.startsWith("-")) fail(2, `${USAGE}\n\n--issue is required`)
if (!bodyFile || bodyFile.startsWith("--")) fail(2, `${USAGE}\n\n--body-file is required`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `comment-ticket: ${error.message}`)
}

let body
try {
  body = readFileSync(bodyFile === "-" ? 0 : bodyFile, "utf8")
} catch (error) {
  fail(2, `comment-ticket: cannot read ${bodyFile}: ${error.message}`)
}
if (body.trim().length === 0) fail(2, `${USAGE}\n\nthe comment body is empty`)

try {
  const ticket = await readTicket(resolved.number, { withProjectItem: false })
  await addComment(ticket.number, body)
  console.log(JSON.stringify({ number: ticket.number, url: ticket.url, title: ticket.title, bytes: body.length }, null, 2))
} catch (error) {
  fail(1, `comment-ticket: ${error.message}`)
}
