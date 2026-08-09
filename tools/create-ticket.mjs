#!/usr/bin/env node
/** Create one fully configured GitHub ticket through the repository adapter. */

import { readFileSync } from "node:fs"

import { createTicket } from "./lib/github-issues.mjs"

const USAGE = `usage: create-ticket.mjs --title <text> --body-file <path|-> --label <name> [options]

  --title <text>                 issue title (required)
  --body-file <path|->           issue body file, or - for stdin (required)
  --label <name>                 existing label; repeat for every label (required)
  --milestone <title>            existing milestone title; never creates one
  --status <name>                configured board Status (default: Todo)
  --blocked-by <ORB-N|#N|N>      existing blocker; repeat for every relation
  --help, -h                     print this usage and exit 0

Validates every label, milestone, and blocker before creating the issue. Then adds it to the
configured project, sets Status, and writes all blockedBy relations. Prints one JSON object with
number, url, title, milestone, and status.

exit codes: 0 created, 1 a validation or GitHub operation failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const valueFlags = new Set(["--title", "--body-file", "--label", "--milestone", "--status", "--blocked-by"])
const values = new Map()
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index]
  if (!valueFlags.has(flag)) fail(2, `${USAGE}\n\nunknown option: ${flag}`)
  const value = process.argv[index + 1]
  if (value === undefined || (value.startsWith("--") && value !== "-")) fail(2, `${USAGE}\n\n${flag} requires a value`)
  values.set(flag, [...(values.get(flag) ?? []), value])
  index++
}

for (const flag of ["--title", "--body-file", "--milestone", "--status"]) {
  if ((values.get(flag)?.length ?? 0) > 1) fail(2, `${USAGE}\n\n${flag} may be passed only once`)
}

const title = values.get("--title")?.[0]
const bodyFile = values.get("--body-file")?.[0]
const labels = values.get("--label") ?? []
const milestone = values.get("--milestone")?.[0] ?? null
const status = values.get("--status")?.[0] ?? "Todo"
const blockedBy = values.get("--blocked-by") ?? []
if (!title || !bodyFile || labels.length === 0) fail(2, USAGE)

let body
try {
  body = bodyFile === "-" ? readFileSync(0, "utf8") : readFileSync(bodyFile, "utf8")
} catch (error) {
  fail(2, `create-ticket: body could not be read: ${error.message}`)
}

try {
  const created = await createTicket({ title, body, labels, milestone, status, blockedBy })
  console.log(JSON.stringify(created, null, 2))
} catch (error) {
  fail(1, `create-ticket: ${error.message}`)
}
