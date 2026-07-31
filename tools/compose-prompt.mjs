#!/usr/bin/env node
/** Compose one worker prompt from a Linear issue body and its chronological comments. */

import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"

const USAGE = `usage: compose-prompt.mjs --issue ORB-N --output <absolute path>

  --issue ORB-N                 Linear issue whose body and comments to compose (required)
  --output <absolute path>      prompt file to write outside every Orbit repository (required)
  --help, -h                    print this usage and exit 0

Reads the issue body and every comment through orca, preserving comment markdown verbatim.
Prints the output path on stdout.

exit codes: 0 prompt written, 2 usage or Linear read error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const issue = argOf("--issue")
const output = argOf("--output")
if (!issue || !/^ORB-\d+$/i.test(issue) || !output || !isAbsolute(output) || process.argv.length !== 6) {
  console.error(USAGE)
  process.exit(2)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
let result
try {
  const raw = execFileSync(ORCA, ["linear", "issue", issue.toUpperCase(), "--comments", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const parsed = JSON.parse(raw)
  if (parsed.ok === false) throw new Error(parsed.error?.message ?? "unknown orca error")
  result = parsed.result
} catch (error) {
  console.error(`failed to compose ${issue.toUpperCase()}: ${error.stderr?.toString().trim() || error.message}`)
  process.exit(2)
}

const full = result.issue
const comments = result.comments
if (!Array.isArray(comments)) {
  console.error(`failed to compose ${issue.toUpperCase()}: comments were not an array`)
  process.exit(2)
}
const body = full.description
const renderedComments = comments
  .slice()
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  .map((comment) => {
    const author = comment.user.displayName
    const createdAt = comment.createdAt
    const content = comment.body
    return `### ${author} - ${createdAt}\n\n${content}`
  })
const prompt = renderedComments.length ? `${body}\n\n---\n\n## Comments on this issue (part of the work order)\n\n${renderedComments.join("\n\n")}` : body
writeFileSync(resolve(output), `${prompt.replace(/\s*$/, "")}\n`, "utf8")
console.log(resolve(output))
