#!/usr/bin/env node
/** Preflight or perform the explicit post-merge ticket completion transition. */

import { addComment, completeTicket, preflightTicketCompletion, resolveTicket } from "./lib/github-issues.mjs"
import { extractManualSteps, renderManualSteps } from "./lib/manual-steps.mjs"

const USAGE = `usage: complete-ticket.mjs --issue <ORB-N|#N|N> [--preflight]

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --preflight           prove the open ticket and configured project item can be completed, and
                        PRINT any manual step its body carries; write nothing
  --help, -h            print this usage and exit 0

Without --preflight, posts the ticket's manual steps as a comment (when it has any), then sets
board Status Done and closes the issue with reason completed. This is the post-merge path. The
ordinary readiness status adapter still refuses Done.

The comment is posted BEFORE the close on purpose. orbit-tickets#81 said "merge, deploy to Render,
then set PostHog:ApiKey in the Render env"; the ticket closed, nobody set the key, and every
analytics event for two days was discarded. A step that survives only in a terminal report dies
with the scrollback. A ticket with no such step produces no comment at all.

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

const repoKeyOf = (ticket) => ticket.labels.map((label) => label.name).find((name) => name.startsWith("repo:"))?.slice("repo:".length) ?? null

try {
  const preflighted = await preflightTicketCompletion(resolved.number)
  const manual = renderManualSteps(extractManualSteps(preflighted.body, { repo: repoKeyOf(preflighted) }))

  if (process.argv.includes("--preflight")) {
    console.log(JSON.stringify({ number: preflighted.number, url: preflighted.url, title: preflighted.title, manualSteps: manual }, null, 2))
  } else {
    /**
     * Comment first, close second. A failure here fails the whole completion rather than closing the
     * ticket without its instruction, which is precisely the outcome this exists to prevent.
     */
    if (manual) await addComment(preflighted.number, manual)
    const ticket = await completeTicket(resolved.number, preflighted)
    console.log(JSON.stringify({ number: ticket.number, url: ticket.url, title: ticket.title, manualSteps: manual }, null, 2))
  }
} catch (error) {
  fail(1, `complete-ticket: ${error.message}`)
}
