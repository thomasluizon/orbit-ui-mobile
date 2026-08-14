#!/usr/bin/env node
/**
 * Add or remove labels on one existing ticket.
 *
 * `create-ticket.mjs` validates labels at creation and nothing could change them afterwards: the
 * raw-mutation hook blocks `gh issue edit` from a session, and `update-ticket.mjs` deliberately
 * never touches labels. Measured 2026-08-13: `needs:conversation` could not be applied to #36
 * through any sanctioned path. Every label is validated against the live label list before the
 * write, exactly like creation.
 */

import { editLabels, readTicket, resolveTicket } from "./lib/github-issues.mjs"

const USAGE = `usage: label-ticket.mjs --issue <ORB-N|#N|N> [--add <label>]... [--remove <label>]...

  --issue <ORB-N|#N|N>  migrated identifier or GitHub issue reference (required)
  --add <label>         label to add; repeat for several (validated against the live label list)
  --remove <label>      label to remove; repeat for several (validated the same way)
  --help, -h            print this usage and exit 0

At least one --add or --remove is required. It never changes board Status, milestone, body, or
state, and never creates a label.

--issue MUST be copied from output produced in this run, never from memory (core rule 3).

exit codes: 0 labels written, 1 ticket read or write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const VALUE_FLAGS = new Set(["--issue", "--add", "--remove"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const valuesOf = (flag) => {
  const values = []
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== flag) continue
    const value = argv[index + 1]
    if (!value || value.startsWith("-")) fail(2, `${USAGE}\n\n${flag} needs a label name`)
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

const add = valuesOf("--add")
const remove = valuesOf("--remove")
if (add.length === 0 && remove.length === 0) fail(2, `${USAGE}\n\nnothing to do: pass --add or --remove`)
const both = add.filter((label) => remove.includes(label))
if (both.length > 0) fail(2, `${USAGE}\n\nlabel(s) both added and removed: ${both.join(", ")}`)

let resolved
try {
  resolved = resolveTicket(issueReference)
} catch (error) {
  fail(2, `label-ticket: ${error.message}`)
}

try {
  await editLabels(resolved.number, { add, remove })
  const ticket = await readTicket(resolved.number, { withProjectItem: false })
  console.log(JSON.stringify({ number: ticket.number, url: ticket.url, title: ticket.title, labels: ticket.labels.map((label) => label.name) }, null, 2))
} catch (error) {
  fail(1, `label-ticket: ${error.message}`)
}
