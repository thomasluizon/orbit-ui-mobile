#!/usr/bin/env node
/** Add one existing GitHub issue to the configured Projects v2 board. */

import { addTicketToProject, resolveTicket } from "./lib/github-issues.mjs"

const USAGE = `usage: add-ticket-to-project.mjs --issue <ORB-N|#N|N>

  --issue <ORB-N|#N|N>  existing ticket to add to the configured project (required)
  --help, -h            print this usage and exit 0

Adds an existing issue to the configured project. If the issue is already present, writes nothing.
Prints one JSON object with number, url, title, and added.

exit codes: 0 added or already present, 1 ticket read or project write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

if (process.argv.length !== 4 || process.argv[2] !== "--issue" || !process.argv[3] || process.argv[3].startsWith("--")) {
  fail(2, USAGE)
}

let resolved
try {
  resolved = resolveTicket(process.argv[3])
} catch (error) {
  fail(2, `add-ticket-to-project: ${error.message}`)
}

try {
  console.log(JSON.stringify(await addTicketToProject(resolved.number), null, 2))
} catch (error) {
  fail(1, `add-ticket-to-project: ${error.message}`)
}
