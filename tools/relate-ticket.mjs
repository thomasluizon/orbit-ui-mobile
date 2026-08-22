#!/usr/bin/env node
/**
 * Add or remove blocked-by relations on one existing ticket.
 *
 * `create-ticket.mjs` writes blockers at creation and nothing could change them afterwards: the
 * raw-mutation hook blocks `gh issue edit` from a session, and `update-ticket.mjs` deliberately
 * touches only the body. That is the gap `label-ticket.mjs` closes for labels, one field over.
 * Measured 2026-08-22: seventeen redesign tickets needed an edge onto the design system tickets that
 * block them, and no sanctioned path existed. A dependency stated in prose is not a dependency.
 */

import { editBlockers, readTicket, resolveTicket } from "./lib/github-issues.mjs"

const USAGE = `usage: relate-ticket.mjs --issue <ORB-N|#N|N> [--add-blocked-by <ref>]... [--remove-blocked-by <ref>]...

  --issue <ORB-N|#N|N>       the ticket whose relations change (required)
  --add-blocked-by <ref>     a ticket that BLOCKS --issue; repeat for several
  --remove-blocked-by <ref>  a blocker to drop; repeat for several
  --help, -h                 print this usage and exit 0

At least one --add-blocked-by or --remove-blocked-by is required. Every added blocker is read before
the write, so a reference that does not exist fails here rather than landing an edge on a stranger's
issue. It never changes board Status, milestone, body, labels, or state.

Every reference MUST be copied from output produced in this run, never from memory (core rule 3).

exit codes: 0 relations written, 1 ticket read or write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const VALUE_FLAGS = new Set(["--issue", "--add-blocked-by", "--remove-blocked-by"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const valuesOf = (flag) => {
  const values = []
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== flag) continue
    const value = argv[index + 1]
    if (!value || value.startsWith("-")) fail(2, `${USAGE}\n\n${flag} needs a ticket reference`)
    values.push(value)
  }
  return values
}

const issueReference = (() => {
  const index = argv.indexOf("--issue")
  return index === -1 ? null : argv[index + 1]
})()
if (!issueReference || issueReference.startsWith("-")) fail(2, `${USAGE}\n\n--issue is required`)
if (argv.filter((value) => value === "--issue").length !== 1) fail(2, `${USAGE}\n\n--issue must be passed once`)

const add = valuesOf("--add-blocked-by")
const remove = valuesOf("--remove-blocked-by")
if (add.length === 0 && remove.length === 0) fail(2, `${USAGE}\n\nnothing to do: pass --add-blocked-by or --remove-blocked-by`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `relate-ticket: ${error.message}`)
}

try {
  await editBlockers(resolved.number, { add, remove })
  const ticket = await readTicket(resolved.number, { withProjectItem: false })
  console.log(JSON.stringify({
    number: ticket.number,
    url: ticket.url,
    title: ticket.title,
    blockedBy: ticket.blockedBy.map((blocker) => blocker.number),
  }, null, 2))
} catch (error) {
  fail(1, `relate-ticket: ${error.message}`)
}
