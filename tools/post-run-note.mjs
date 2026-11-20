#!/usr/bin/env node

import { readFileSync } from "node:fs"

import { addComment, findRunRecord, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { composeRunNote, RUN_NOTE_KINDS, RUN_RECORD_TITLE } from "./lib/run-notes.mjs"

const USAGE = `usage: post-run-note.mjs --kind <${RUN_NOTE_KINDS.join("|")}> (--issue <ORB-N|#N|N> | --run-record) --body-file <path|->
                        [--round <n>] [--head <sha>] [--pullfrog-threads <n>] [--commits <sha,...>]

  Posts one run note as a comment, so the run's working state lives on GitHub and not on one computer.
  Each note starts with a marker line that tools/run-status.mjs and tools/compose-prompt.mjs read back.

  --kind round-note   a fix round's note, before its worker launches. Needs --round and --head (the full
                      SHA the round answers). --pullfrog-threads <n> (required) counts the Pullfrog
                      threads in the batch: one launch answers the local and the Pullfrog findings of one
                      head, and the fix round ledger records the kind pullfrog when n is above 0.
                      tools/launch-worker.mjs --fix-round refuses an order that carries no round note for
                      the worktree's head
  --kind review       a review result. Needs --head (the full SHA reviewed); the body starts with
                      VERDICT: CLEAN or VERDICT: DEFECTS (<n>) and lists every defect
  --kind report       a worker's final report. Needs --commits (the commit SHAs it made)
  --kind decision     a decision about one ticket, or with --run-record a decision about the whole run or an
                      owner question that no ticket owns
  --issue <reference> the ticket the note belongs to
  --run-record        the "${RUN_RECORD_TITLE}" issue instead of a ticket; only with --kind decision
  --body-file <path|-> the markdown body, or - to read stdin (required)
  --help, -h          print this usage and exit 0

The ticket and the run record live in the private tickets repository. Never post a note to a pull request:
only its body and thread replies go there. --issue MUST be copied from output of this run (core rule 3).

exit codes: 0 posted, 1 the ticket or run record could not be read or written, 2 usage error or an invalid note`

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const VALUE_FLAGS = new Set(["--kind", "--issue", "--body-file", "--round", "--head", "--commits", "--pullfrog-threads"])
const values = {}
let runRecord = false
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index++) {
  const flag = argv[index]
  if (flag === "--help" || flag === "-h") {
    console.log(USAGE)
    process.exit(0)
  }
  if (flag === "--run-record") runRecord = true
  else if (VALUE_FLAGS.has(flag) && typeof argv[index + 1] === "string" && !argv[index + 1].startsWith("--")) values[flag] = argv[++index]
  else fail(2, `${USAGE}\n\nunknown option or missing value: ${flag}`)
}
if (!values["--kind"]) fail(2, `${USAGE}\n\n--kind is required`)
if (!values["--body-file"]) fail(2, `${USAGE}\n\n--body-file is required`)
if (runRecord === Boolean(values["--issue"])) fail(2, `${USAGE}\n\npass exactly one of --issue or --run-record`)
if (runRecord && values["--kind"] !== "decision") fail(2, `${USAGE}\n\n--run-record takes only --kind decision`)

let body
try {
  body = readFileSync(values["--body-file"] === "-" ? 0 : values["--body-file"], "utf8")
} catch (error) {
  fail(2, `post-run-note: cannot read ${values["--body-file"]}: ${error.message}`)
}
/** Only decimal digits count: Number() reads "" as 0 and "0x2" as 2, so an unset shell variable would post a false count. */
const wholeNumberOf = (value) => /^\d+$/.test(value) ? Number(value) : Number.NaN
let note
try {
  note = composeRunNote({ kind: values["--kind"], round: values["--round"] === undefined ? null : wholeNumberOf(values["--round"]), head: values["--head"] ?? null,
    pullfrogThreads: values["--pullfrog-threads"] === undefined ? null : wholeNumberOf(values["--pullfrog-threads"]), commits: values["--commits"] ? values["--commits"].split(",") : [], body })
} catch (error) {
  fail(2, `post-run-note: ${error.message}`)
}
let resolved = null
if (!runRecord) {
  try { resolved = resolveTicket(values["--issue"]) } catch (error) { fail(2, `post-run-note: ${error.message}`) }
}

try {
  const target = runRecord ? await findRunRecord(RUN_RECORD_TITLE) : await readTicket(resolved.number, { withProjectItem: false })
  if (!target) fail(1, `post-run-note: no "${RUN_RECORD_TITLE}" issue exists; node tools/migrate-run-state.mjs --apply creates it`)
  await addComment(target.number, note)
  console.log(JSON.stringify({ number: target.number, url: target.url, kind: values["--kind"], bytes: Buffer.byteLength(note) }))
} catch (error) {
  fail(1, `post-run-note: ${error.message}`)
}
