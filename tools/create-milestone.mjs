#!/usr/bin/env node
/** Create one explicitly approved GitHub milestone through the repository adapter. */

import { readFileSync } from "node:fs"

import { createMilestone } from "./lib/github-issues.mjs"

const USAGE = `usage: create-milestone.mjs --title <text> --description-file <path|->

  --title <text>                 new milestone title (required)
  --description-file <path|->    locked decisions, or - for stdin (required)
  --help, -h                     print this usage and exit 0

Refuses a title that already exists. Prints the created title as JSON and never creates a ticket.

exit codes: 0 created, 1 validation or GitHub write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const known = new Set(["--title", "--description-file"])
const values = new Map()
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index]
  if (!known.has(flag)) fail(2, `${USAGE}\n\nunknown option: ${flag}`)
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith("--")) fail(2, `${USAGE}\n\n${flag} requires a value`)
  if (values.has(flag)) fail(2, `${USAGE}\n\n${flag} may be passed only once`)
  values.set(flag, value)
  index++
}
const title = values.get("--title")
const descriptionFile = values.get("--description-file")
if (!title || !descriptionFile) fail(2, USAGE)

let description
try {
  description = descriptionFile === "-" ? readFileSync(0, "utf8") : readFileSync(descriptionFile, "utf8")
} catch (error) {
  fail(2, `create-milestone: description could not be read: ${error.message}`)
}

try {
  console.log(JSON.stringify(await createMilestone({ title, description }), null, 2))
} catch (error) {
  fail(1, `create-milestone: ${error.message}`)
}
