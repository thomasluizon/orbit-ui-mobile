#!/usr/bin/env node
/** Preflight or perform the explicit post-merge ticket completion transition. */

import { completeTicket, preflightTicketCompletion, resolveTicket } from "./lib/github-issues.mjs"

const USAGE = `usage: complete-ticket.mjs --issue <ORB-N|#N|N> [--preflight]

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --preflight           prove the open ticket and configured project item can be completed;
                        write nothing
  --help, -h            print this usage and exit 0

Without --preflight, sets board Status Done and closes the issue with reason completed. This is
the post-merge path. The ordinary readiness status adapter still refuses Done.

exit codes: 0 preflight or completion succeeded, 1 ticket read or write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const known = new Set(["--issue", "--preflight"])
for (let index = 2; index < process.argv.length; index++) {
  const value = process.argv[index]
  if (!known.has(value) && process.argv[index - 1] !== "--issue") fail(2, `${USAGE}\n\nunknown option: ${value}`)
}
const issueIndex = process.argv.indexOf("--issue")
const issueReference = issueIndex === -1 ? null : process.argv[issueIndex + 1]
if (!issueReference || issueReference.startsWith("--")) fail(2, USAGE)
if (process.argv.filter((value) => value === "--issue").length !== 1) fail(2, `${USAGE}\n\n--issue must be passed once`)
if (process.argv.filter((value) => value === "--preflight").length > 1) fail(2, `${USAGE}\n\n--preflight may be passed once`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `complete-ticket: ${error.message}`)
}

try {
  const ticket = process.argv.includes("--preflight")
    ? await preflightTicketCompletion(resolved.number)
    : await completeTicket(resolved.number)
  console.log(JSON.stringify({ number: ticket.number, url: ticket.url, title: ticket.title }, null, 2))
} catch (error) {
  fail(1, `complete-ticket: ${error.message}`)
}
