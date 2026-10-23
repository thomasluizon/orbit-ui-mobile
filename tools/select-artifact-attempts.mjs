#!/usr/bin/env node

import { cpSync, mkdirSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const USAGE = `usage: select-artifact-attempts.mjs --input-dir <path> --output-dir <path>

  Copies only the highest numeric attempt of each logical artifact into the output directory.
  Input contains artifact directories named <logical-name>-attempt-<positive-integer>.
  Output preserves each selected artifact's internal paths and prints selected names as JSON.
  The caller supplies a fresh report destination and verifies required reports after selection.
  No stdin is read. Explicit paths are resolved from the caller's working directory.

  --input-dir <path>   directory containing separately downloaded artifacts
  --output-dir <path>  destination for the selected reports
  --help, -h          print this usage and exit 0

exit codes: 0 selected reports copied, 1 invalid artifacts or filesystem failure, 2 usage error`

const argumentsList = process.argv.slice(2)
if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const options = new Map()
for (let index = 0; index < argumentsList.length; index++) {
  const option = argumentsList[index]
  const value = argumentsList[++index]
  if (!["--input-dir", "--output-dir"].includes(option) || options.has(option) || !value || value.startsWith("-")) {
    console.error(USAGE)
    process.exit(2)
  }
  options.set(option, resolve(value))
}
if (options.size !== 2) {
  console.error(USAGE)
  process.exit(2)
}

function selectAttempts(directory) {
  const selected = new Map()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const match = /^(.+)-attempt-([1-9]\d*)$/.exec(entry.name)
    if (!entry.isDirectory() || !match || !Number.isSafeInteger(Number(match[2]))) {
      throw new Error(`Expected an attempt-qualified artifact directory: ${entry.name}`)
    }
    const [, logicalName, attemptText] = match
    const attempt = Number(attemptText)
    if (!selected.has(logicalName) || attempt > selected.get(logicalName).attempt) {
      selected.set(logicalName, { name: entry.name, attempt })
    }
  }
  if (selected.size === 0) throw new Error("No artifact directories found")
  return [...selected.values()].map(({ name }) => name).sort()
}

try {
  const inputDirectory = options.get("--input-dir")
  const outputDirectory = options.get("--output-dir")
  if (outputDirectory === inputDirectory || outputDirectory.startsWith(`${inputDirectory}/`)) {
    throw new Error("Output must be outside the input directory")
  }
  const selected = selectAttempts(inputDirectory)
  mkdirSync(outputDirectory, { recursive: true })
  for (const name of selected) {
    cpSync(join(inputDirectory, name), outputDirectory, { recursive: true })
  }
  console.log(JSON.stringify(selected))
} catch (error) {
  console.error(`select-artifact-attempts: ${error.message}`)
  process.exit(1)
}
