#!/usr/bin/env node
/** Write one note, one body or one part of a ticket. A body or a part write passes `checkTicket` first. */

import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { checkTicket, comment, editComment, readBoardFor, readTicket, updateBody } from "./lib/github.mjs"
import { ownerParts, partOf } from "./lib/order.mjs"

const OWNER_MARKER = "<!-- orbit-owner -->"
const DECISION_MARKER = "<!-- orbit-decision -->"

const USAGE = `usage: update-ticket.mjs note (--owner | --decision) --ticket <N> --body-file <path|->
       update-ticket.mjs body --ticket <N> --body-file <path|-> --confirm-replace
       update-ticket.mjs part --ticket <N> --part <n> --body-file <path|->

  note                  comment one note on a ticket
  body                  replace the whole body of a ticket
  part                  replace the comment of part <n>, or add it when the ticket has none
  --owner               the note is an order of the owner
  --decision            the note is an answer or a decision of the owner session
  --ticket <N>          ticket number (required)
  --part <n>            part number (part only)
  --body-file <path|->  text file, or - for stdin (required)
  --confirm-replace     acknowledge that body replaces the whole body (body only)
  --help, -h            print this usage and exit 0

The tool puts the marker of a note on the first line. A body or a part write runs \`checkTicket\` and refuses a write that adds a problem.
Prints one JSON object.

exit codes: 0 written, 1 the check refused the write or the GitHub write failed, 2 usage error`

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

let parsed
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { owner: { type: "boolean" }, decision: { type: "boolean" }, "confirm-replace": { type: "boolean" }, ticket: { type: "string", multiple: true }, part: { type: "string", multiple: true }, "body-file": { type: "string", multiple: true }, help: { type: "boolean", short: "h" } },
  })
} catch (error) {
  fail(2, `${USAGE}\n\n${error.message}`)
}

const { values, positionals } = parsed
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
const mode = positionals[0]
if (positionals.length !== 1 || !["note", "body", "part"].includes(mode)) fail(2, USAGE)
if (mode === "note" && Boolean(values.owner) === Boolean(values.decision)) fail(2, `${USAGE}\n\npass exactly one of --owner and --decision`)
if (mode !== "note" && (values.owner || values.decision)) fail(2, `${USAGE}\n\n--owner and --decision belong to note`)
if (mode === "body" && !values["confirm-replace"]) fail(2, `${USAGE}\n\n--confirm-replace is required, because body replaces the whole body`)
if (mode === "part" && values.part?.length !== 1) fail(2, `${USAGE}\n\npass --part exactly once`)
if (mode === "part" && !/^[1-9]\d*$/.test(values.part[0])) fail(2, `${USAGE}\n\n--part takes a part number`)
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
if (text === "") fail(2, `update-ticket: the ${mode === "note" ? "note" : mode} is empty`)
if (text.startsWith("<!-- orbit-")) fail(2, "update-ticket: write the text with no orbit marker, because the tool adds it")

/** The reasons that the written ticket has and the read ticket had not. A write never adds a problem, and it needs no repair of an older one. */
const addedProblems = async (before, after) => {
  const known = new Set(checkTicket(before, await readBoardFor(before)))
  return checkTicket(after, await readBoardFor(after)).filter((problem) => !known.has(problem))
}

const refuse = (problems) => fail(1, `update-ticket: the ticket check refuses the write:\n- ${problems.join("\n- ")}`)

try {
  if (mode === "note") {
    const note = values.owner ? "owner" : "decision"
    await comment("tickets", Number(ticket), `${values.owner ? OWNER_MARKER : DECISION_MARKER}\n${text}\n`)
    console.log(JSON.stringify({ ticket: Number(ticket), note }, null, 2))
  } else if (mode === "body") {
    const before = await readTicket(Number(ticket))
    const problems = await addedProblems(before, { ...before, body: text })
    if (problems.length > 0) refuse(problems)
    await updateBody(before.number, text)
    console.log(JSON.stringify({ ticket: before.number, mode }, null, 2))
  } else {
    const number = Number(values.part[0])
    const head = partOf({ body: text })
    if (head === null) fail(2, "update-ticket: the part text must start with `## Part <n> of <m>: <title>`")
    const before = await readTicket(Number(ticket))
    const live = ownerParts(before.comments.filter((entry) => entry.kind === null)).filter((entry) => partOf(entry).number === number)
    if (live.length > 1) refuse([`Part ${number} has two live comments: ${live.map((entry) => entry.url).join(" and ")}. Start the old one with "Superseded: ".`])
    if (live.length === 0 && head.number !== number) fail(2, `update-ticket: --part ${number} does not match the heading of part ${head.number}`)
    const [old] = live
    const comments = old === undefined ? [...before.comments, { body: text, createdAt: new Date().toISOString(), kind: null }] : before.comments.map((entry) => (entry === old ? { ...entry, body: text } : entry))
    const problems = await addedProblems(before, { ...before, comments, edits: old === undefined ? [] : [{ before: old.body, after: text }] })
    if (problems.length > 0) refuse(problems)
    if (old === undefined) await comment("tickets", before.number, text + "\n")
    else await editComment(old.id, text + "\n")
    console.log(JSON.stringify({ ticket: before.number, mode, part: number, added: old === undefined }, null, 2))
  }
} catch (error) {
  fail(1, `update-ticket: ${error.message}`)
}
