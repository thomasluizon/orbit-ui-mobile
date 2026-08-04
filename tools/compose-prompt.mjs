#!/usr/bin/env node
/** Compose one worker prompt from a Linear issue body and its chronological comments. */

import { execFileSyncHidden as execFileSync } from "./lib/subprocess-options.mjs"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"

const USAGE = `usage: compose-prompt.mjs --issue ORB-N --output <absolute path> [--brief-file <absolute path>]

  --issue ORB-N                 Linear issue whose body and comments to compose (required)
  --output <absolute path>      prompt file to write outside every Orbit repository (required)
  --brief-file <absolute path>  Sol execution brief JSON to bind after the unchanged ticket (optional)
  --help, -h                    print this usage and exit 0

Reads the issue body and every comment through orca, preserving comment markdown verbatim.
When a brief is supplied it must name the same issue, body SHA-256, base branch, and base SHA.
Prints the output path on stdout.

exit codes: 0 prompt written, 2 usage or Linear read error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  const value = process.argv[index + 1]
  return value && !value.startsWith("--") ? value : null
}

const issue = argOf("--issue")
const output = argOf("--output")
const briefFile = argOf("--brief-file")
const knownFlags = new Set(["--issue", "--output", "--brief-file", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !knownFlags.has(token))
if (
  unknown.length > 0
  || !issue
  || !/^ORB-\d+$/i.test(issue)
  || !output
  || !isAbsolute(output)
  || (briefFile !== null && !isAbsolute(briefFile))
) {
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
if (typeof body !== "string") {
  console.error(`failed to compose ${issue.toUpperCase()}: issue description was not a string`)
  process.exit(2)
}
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
let finalPrompt = prompt.replace(/\s*$/, "")
if (briefFile) {
  let brief
  try {
    brief = JSON.parse(readFileSync(resolve(briefFile), "utf8"))
  } catch (error) {
    console.error(`failed to compose ${issue.toUpperCase()}: execution brief is not valid JSON: ${error.message}`)
    process.exit(2)
  }
  const expectedIssue = issue.toUpperCase()
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex")
  if (
    brief?.issue !== expectedIssue
    || brief?.ticketBodySha256 !== bodySha256
    || !/^main$|^[A-Za-z0-9._/-]+$/.test(brief?.base ?? "")
    || !/^[0-9a-f]{40}$/.test(brief?.baseSha ?? "")
    || typeof brief?.summary !== "string"
    || !Array.isArray(brief?.scope)
  ) {
    console.error(`failed to compose ${expectedIssue}: execution brief does not bind the exact ticket body and base SHA`)
    process.exit(2)
  }
  finalPrompt += `\n\n---\n\n## Sol execution brief (bound to this ticket and base)\n\n${JSON.stringify(brief, null, 2)}\n`
}
writeFileSync(resolve(output), `${finalPrompt}\n`, "utf8")
console.log(resolve(output))
