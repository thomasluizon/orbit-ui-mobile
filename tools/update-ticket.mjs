#!/usr/bin/env node
/** Write one owner order or one decision of the owner session on a ticket, with the marker that carries it into every order. */

import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { comment } from "./lib/github.mjs"
import { DECISION_MARKER, OWNER_MARKER } from "./lib/order.mjs"

const USAGE = `usage: update-ticket.mjs note (--owner | --decision) --ticket <N> --body-file <path|->

  note                  comment one note on a ticket
  --owner               the note is an order of the owner
  --decision            the note is an answer or a decision of the owner session
  --ticket <N>          ticket number (required)
  --body-file <path|->  note text file, or - for stdin (required)
  --help, -h            print this usage and exit 0

The tool puts the marker of the note on the first line. Every order carries a marked note. A note that is newer than the
newest launch of the ticket starts one apply-comment order before the ticket can close. Prints one JSON object with
ticket and note.

exit codes: 0 written, 1 the GitHub write failed, 2 usage error`

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

let parsed
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { owner: { type: "boolean" }, decision: { type: "boolean" }, ticket: { type: "string", multiple: true }, "body-file": { type: "string", multiple: true }, help: { type: "boolean", short: "h" } },
  })
} catch (error) {
  fail(2, `${USAGE}\n\n${error.message}`)
}

const { values, positionals } = parsed
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (positionals.length !== 1 || positionals[0] !== "note") fail(2, USAGE)
if (Boolean(values.owner) === Boolean(values.decision)) fail(2, `${USAGE}\n\npass exactly one of --owner and --decision`)
for (const flag of ["ticket", "body-file"]) if (values[flag]?.length !== 1) fail(2, `${USAGE}\n\npass --${flag} exactly once`)
const [ticket] = values.ticket
const [bodyFile] = values["body-file"]
if (!/^[1-9]\d*$/.test(ticket)) fail(2, `${USAGE}\n\n--ticket takes a ticket number`)

let text
try {
  text = readFileSync(bodyFile === "-" ? 0 : bodyFile, "utf8").trim()
} catch (error) {
  fail(2, `update-ticket: body could not be read: ${error.message}`)
}
if (text === "") fail(2, "update-ticket: the note is empty")
if (text.startsWith("<!-- orbit-")) fail(2, "update-ticket: write the note with no orbit marker, because the tool adds it")

const note = values.owner ? "owner" : "decision"
try {
  await comment("tickets", Number(ticket), `${values.owner ? OWNER_MARKER : DECISION_MARKER}\n${text}\n`)
  console.log(JSON.stringify({ ticket: Number(ticket), note }, null, 2))
} catch (error) {
  fail(1, `update-ticket: ${error.message}`)
}
