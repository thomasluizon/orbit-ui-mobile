#!/usr/bin/env node
/** Mark the old review and run notes of the open tickets as driver comments, so no order carries them. A one-time deploy step. */

import { editComment, readTickets } from "./lib/github.mjs"

const USAGE = `usage: mark-legacy-notes.mjs [--dry-run] [--help]

  Puts the line <!-- orbit-drive:legacy --> before each comment of an open ticket whose first line holds
  "Notes of the local review", "Review note of" or "Launch <n> of", or starts with <!-- orbit-run-note.
  It prints one line for each comment it marks: the ticket, the comment URL and the first line.
  A marked comment matches no more, so a second run changes nothing.

  --dry-run   print the same lines and write nothing
  --help, -h  print this usage and exit 0

exit codes: 0 done, 1 a GitHub read or write failed, 2 usage error`

const LEGACY_MARKER = "<!-- orbit-drive:legacy -->"
const LEGACY_FIRST_LINE = /Notes of the local review|Review note of|Launch \d+ of|^<!-- orbit-run-note/

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const unknown = args.find((argument) => argument !== "--dry-run")
if (unknown !== undefined) {
  console.error(`${USAGE}\n\nunknown option: ${unknown}`)
  process.exit(2)
}
const dryRun = args.includes("--dry-run")

try {
  let count = 0
  for (const ticket of await readTickets()) {
    for (const comment of ticket.comments) {
      const firstLine = comment.body.split("\n", 1)[0]
      if (!LEGACY_FIRST_LINE.test(firstLine)) continue
      if (!dryRun) await editComment(comment.id, `${LEGACY_MARKER}\n${comment.body}`)
      count += 1
      console.log(`#${ticket.number} ${comment.url} ${firstLine}`)
    }
  }
  console.log(`${dryRun ? "Would mark" : "Marked"} ${count} comment(s).`)
} catch (error) {
  console.error(`mark-legacy-notes: ${error.message}`)
  process.exitCode = 1
}
