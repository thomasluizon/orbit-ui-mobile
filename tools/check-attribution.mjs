#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { attributionFindings } from "./lib/attribution-lines.mjs"

const USAGE = `usage: check-attribution.mjs --range <base>..<head> [--root <repository>]

  Fails when a commit message in the range carries an attribution line: a co-author trailer (a
  line that starts with "Co-Authored-By:", in any letter case) or a line that starts with
  "Generated with", after any emoji or punctuation. A mention of either string inside a sentence
  is not an attribution line, so a rule that names them still passes. The pull request body is
  checked by .github/scripts/check-pr-metadata.mjs, which an edit of the body runs again.

  --range <base>..<head>  the pull request's commits, as a git revision range (required)
  --root <repository>     read commits from this repository instead of the script's repository
  --help, -h              print this usage and exit 0

exit codes: 0 no attribution line, 1 an attribution line was found, 2 usage error or unreadable input`

const fail = (message) => {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(2)
}

const parseArguments = (argv) => {
  const options = { range: null, root: resolve(dirname(fileURLToPath(import.meta.url)), "..") }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    const value = argv[index + 1]
    const key = { "--range": "range", "--root": "root" }[flag]
    if (key === undefined) fail(`unknown argument: ${flag}`)
    if (typeof value !== "string" || value === "" || value.startsWith("--")) fail(`${flag} requires a value`)
    options[key] = key === "root" ? resolve(value) : value
    index++
  }
  if (options.range === null) fail("--range is required")
  if (!/^[^\s.][^\s]*\.\.[^\s.][^\s]*$/.test(options.range) || options.range.includes("...")) {
    fail(`--range must be <base>..<head>, got "${options.range}"`)
  }
  return options
}

/** Every commit in the range as `{ sha, message }`. A range git cannot read is a usage error. */
const commitMessages = (root, range) => {
  const result = spawnSync("git", ["-C", root, "log", "--format=%H%x00%B%x1e", range, "--"], { encoding: "utf8", windowsHide: true })
  if (result.error || result.status !== 0) fail(`git log ${range} failed: ${(result.stderr || result.error?.message || "").trim()}`)
  return result.stdout.split("\x1e").map((record) => record.replace(/^\n/, "")).filter(Boolean).map((record) => {
    const separator = record.indexOf("\0")
    return { sha: record.slice(0, separator), message: record.slice(separator + 1) }
  })
}

const options = parseArguments(process.argv.slice(2))
const problems = commitMessages(options.root, options.range).flatMap(({ sha, message }) => attributionFindings(`commit ${sha.slice(0, 12)}`, message))
if (problems.length > 0) {
  console.error("Attribution lines are not allowed in pull request commits:")
  for (const problem of problems) console.error(`  ${problem}`)
  console.error("Remove each line: reword the commit.")
  process.exit(1)
}
console.log(`Attribution guard passed for ${options.range}.`)
