#!/usr/bin/env node

import { readFileSync } from "node:fs"
import {
  REDESIGN_BASE,
  REQUIRED_REVIEW_EVIDENCE,
  isUiReviewPath,
  reviewHarnessSectionLines,
  reviewEvidenceProblem,
  renderReviewEvidenceBlock,
} from "./lib/review-harness.mjs"

const USAGE = `usage: check-review-harness.mjs --base <ref> --body-file <path> --changed-files-file <path>

  Fails a UI pull request based on redesign/main whose body carries no review-harness evidence.

  --base <ref>                 the pull request's base branch
  --body-file <path>           file holding the pull request body
  --changed-files-file <path>  file holding the changed paths, one per line
  --help, -h                   print this usage and exit 0

  The body must carry a "## Review harness" heading, and under it one line per required lane and close-gate agent.
  The motion lane may be skipped only through its explicit does-not-animate statement:

${renderReviewEvidenceBlock().split("\n").map((line) => `      ${line}`).join("\n")}

exit codes: 0 not applicable or evidence present, 1 evidence missing or empty, 2 usage or configuration error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const options = { base: null, bodyFile: null, changedFilesFile: null }
const flags = new Map([
  ["--base", "base"],
  ["--body-file", "bodyFile"],
  ["--changed-files-file", "changedFilesFile"],
])
const positional = process.argv.slice(2)
while (positional.length > 0) {
  const flag = positional.shift()
  const key = flags.get(flag)
  if (!key) fail(2, `check-review-harness: unknown option: ${flag}\n\n${USAGE}`)
  if (positional.length === 0) fail(2, `check-review-harness: ${flag} requires a value\n\n${USAGE}`)
  if (options[key] !== null) fail(2, `check-review-harness: ${flag} may be passed once\n\n${USAGE}`)
  options[key] = positional.shift()
}
for (const [flag, key] of flags) {
  if (options[key] === null) fail(2, `check-review-harness: ${flag} is required\n\n${USAGE}`)
}

const read = (path, label) => {
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    fail(2, `check-review-harness: cannot read the ${label} at ${path}: ${error.message}`)
  }
}

if (options.base !== REDESIGN_BASE) {
  console.log(`check-review-harness: base is ${options.base}, not ${REDESIGN_BASE}; not applicable.`)
  process.exit(0)
}

const changedFiles = read(options.changedFilesFile, "changed-files list")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
const uiFiles = changedFiles.filter(isUiReviewPath)
if (uiFiles.length === 0) {
  console.log(`check-review-harness: ${changedFiles.length} changed path(s), none in UI scope; not applicable.`)
  process.exit(0)
}

const body = read(options.bodyFile, "pull request body")
const sectionLines = reviewHarnessSectionLines(body)
if (sectionLines === null) {
  fail(
    1,
    `::error::This pull request changes ${uiFiles.length} UI file(s) on ${REDESIGN_BASE} and its body carries no "## Review harness" block. Complete every lane and close-gate agent in the canonical review sweep, then record one line each. The motion lane may instead say "not applicable: no changed animation".`,
  )
}

const detail = reviewEvidenceProblem(sectionLines)
if (detail) {
  fail(
    1,
    `::error::The "Review harness" block in this pull request body is incomplete: ${detail}. Each required review entry needs one line saying what it found, or "no findings" where it found nothing. This gate only withholds; it never grants completion.`,
  )
}

console.log(`check-review-harness: review-harness evidence present for ${REQUIRED_REVIEW_EVIDENCE.map(({ name }) => name).join(", ")} across ${uiFiles.length} UI file(s).`)
