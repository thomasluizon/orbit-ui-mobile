#!/usr/bin/env node
/** Preflight or perform the explicit post-merge ticket completion transition. */

import { readFileSync } from "node:fs"

import { addComment, cancelTicket, completeTicket, preflightTicketCompletion, repairTicketStatus, resolveTicket } from "./lib/github-issues.mjs"
import { extractManualSteps, renderManualSteps } from "./lib/manual-steps.mjs"

const USAGE = `usage: complete-ticket.mjs --issue <ORB-N|#N|N> [--preflight | --repair-status | --cancel --reason-file <path|->]

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --preflight           prove the open ticket and configured project item can be completed, and
                        PRINT any manual step its body carries; write nothing
  --cancel --reason-file <path|->
                        close an OPEN ticket whose work is GONE rather than done: posts the reason,
                        sets Status Canceled and closes as not planned. The reason is required and must
                        name the decision that removed the work.
  --repair-status       reconcile an ALREADY CLOSED ticket's board Status with the reason it closed:
                        completed to Done, not planned to Canceled, duplicate to Duplicate. Posts no
                        comment and never closes anything. Use it when GitHub auto-closed the issue
                        from a merge commit and left the board column behind.
  --help, -h            print this usage and exit 0

Without --preflight, posts the ticket's manual steps as a comment (when it has any), then sets
board Status Done and closes the issue with reason completed. This is the post-merge path. The
ordinary readiness status adapter still refuses Done.

The comment is posted BEFORE the close on purpose. orbit-tickets#81 said "merge, deploy to Render,
then set PostHog:ApiKey in the Render env"; the ticket closed Done on 2026-08-08 and nothing in the
merge path ever mentioned the key. That it was already set is luck, not a mechanism. A step that
survives only in a terminal report dies with the scrollback. A ticket with no such step produces no
comment at all.

exit codes: 0 preflight or completion succeeded, 1 ticket read or write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const known = new Set(["--issue", "--preflight", "--repair-status", "--cancel", "--reason-file"])
/** The flags that take a value, so the word after one is data rather than an unknown option. */
const valueFlags = new Set(["--issue", "--reason-file"])
for (let index = 2; index < process.argv.length; index++) {
  const value = process.argv[index]
  if (!known.has(value) && !valueFlags.has(process.argv[index - 1])) fail(2, `${USAGE}\n\nunknown option: ${value}`)
}
const issueIndex = process.argv.indexOf("--issue")
const issueReference = issueIndex === -1 ? null : process.argv[issueIndex + 1]
if (!issueReference || issueReference.startsWith("--")) fail(2, USAGE)
if (process.argv.filter((value) => value === "--issue").length !== 1) fail(2, `${USAGE}\n\n--issue must be passed once`)
if (process.argv.filter((value) => value === "--preflight").length > 1) fail(2, `${USAGE}\n\n--preflight may be passed once`)
if (process.argv.filter((value) => value === "--repair-status").length > 1) fail(2, `${USAGE}\n\n--repair-status may be passed once`)
if (process.argv.filter((value) => value === "--cancel").length > 1) fail(2, `${USAGE}\n\n--cancel may be passed once`)
const repairingStatus = process.argv.includes("--repair-status")
const cancelling = process.argv.includes("--cancel")
if ([process.argv.includes("--preflight"), repairingStatus, cancelling].filter(Boolean).length > 1) {
  fail(2, `${USAGE}\n\n--preflight, --repair-status and --cancel are different jobs; pass one`)
}
const reasonIndex = process.argv.indexOf("--reason-file")
if (cancelling && reasonIndex === -1) fail(2, `${USAGE}\n\n--cancel requires --reason-file`)
if (!cancelling && reasonIndex !== -1) fail(2, `${USAGE}\n\n--reason-file is only valid with --cancel`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `complete-ticket: ${error.message}`)
}

const repoKeyOf = (ticket) => ticket.labels.map((label) => label.name).find((name) => name.startsWith("repo:"))?.slice("repo:".length) ?? null

if (cancelling) {
  const reasonFile = process.argv[reasonIndex + 1]
  if (!reasonFile || reasonFile.startsWith("--")) fail(2, `${USAGE}\n\n--reason-file requires a value`)
  let reason
  try {
    reason = readFileSync(reasonFile === "-" ? 0 : reasonFile, "utf8")
  } catch (error) {
    fail(1, `complete-ticket: ${error.message}`)
  }
  if (reason.trim().length === 0) fail(2, `${USAGE}\n\nthe cancellation reason is empty`)
  try {
    const cancelled = await cancelTicket(resolved.number, { reason })
    console.log(JSON.stringify(cancelled, null, 2))
  } catch (error) {
    fail(1, `complete-ticket: ${error.message}`)
  }
  process.exit(0)
}

if (repairingStatus) {
  try {
    const repaired = await repairTicketStatus(resolved.number)
    console.log(JSON.stringify(repaired, null, 2))
  } catch (error) {
    fail(1, `complete-ticket: ${error.message}`)
  }
  process.exit(0)
}

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
