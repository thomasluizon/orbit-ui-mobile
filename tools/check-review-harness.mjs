#!/usr/bin/env node
/**
 * Withhold a redesign pull request that carries no review-harness evidence.
 *
 * Three pull requests (#766, #765, #763) merged into `redesign/main` with green CI, a Pullfrog
 * approval and zero unresolved threads, and none of them ran `interface-review` or
 * `better-interface` in full mode, which their tickets required. The retroactive pass then found a
 * HIGH regression nothing mechanical would have caught (thomasluizon/orbit-tickets#380).
 *
 * This gate only ever WITHHOLDS. It cannot grant visual completion and does not try to: it reads
 * the pull request body and fails when the evidence block is absent or empty. D13 retired the
 * per-cell status ledger (`.claude/manifests/signoff.json`, `forbid-gate-tamper`,
 * `check-surface-coverage.mjs`) and forbids rebuilding one, so nothing here records per-surface
 * state, writes a manifest, or persists a verdict. It reads one string and exits.
 *
 * It is a speed bump, not a proof: an author can write a block that says little. That is the
 * accepted cost of the only shape D13 leaves open. What it removes is the silent skip.
 *
 * APPLICABILITY is mechanical rather than label-driven, so no label discipline can defeat it: the
 * base must be `redesign/main` (D80 sends every redesign pull request there) AND at least one
 * changed file must be UI scope. A tooling or groundwork pull request to `redesign/main` renders
 * nothing, so it is not applicable and needs no block. That is the exemption, and it is derived
 * from the diff rather than declared by whoever opened the pull request.
 */

import { readFileSync } from "node:fs"

const USAGE = `usage: check-review-harness.mjs --base <ref> --body-file <path> --changed-files-file <path>

  Fails a UI pull request based on redesign/main whose body carries no review-harness evidence.

  --base <ref>                 the pull request's base branch
  --body-file <path>           file holding the pull request body
  --changed-files-file <path>  file holding the changed paths, one per line
  --help, -h                   print this usage and exit 0

  The body must carry a "## Review harness" heading, and under it one line per required skill:

      ## Review harness

      - interface-review: <what it found, or "no findings">
      - better-interface (full mode): <what it found, or "no findings">

exit codes: 0 not applicable or evidence present, 1 evidence missing or empty, 2 usage or configuration error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const REQUIRED_SKILLS = ["interface-review", "better-interface"]
/** The base D80 sends every redesign pull request to. Any other base is not this gate's business. */
const REDESIGN_BASE = "redesign/main"
/** The same scope the Cross-Platform Parity job reads, so "UI change" means one thing in this repo. */
const UI_SCOPE = /^apps\/(?:web|mobile)\/(?:app|components|hooks|stores|lib)\//
/**
 * A closed set, checked lowercased after punctuation is stripped. An open "looks empty" heuristic
 * would guess; this refuses only what somebody typed to fill the line.
 */
const PLACEHOLDERS = new Set(["", "todo", "tbd", "na", "n a", "none", "pending", "wip", "x", "y", "yes", "no", "done", "ok", "a confirmar"])

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
const uiFiles = changedFiles.filter((file) => UI_SCOPE.test(file))
if (uiFiles.length === 0) {
  console.log(`check-review-harness: ${changedFiles.length} changed path(s), none in UI scope; not applicable.`)
  process.exit(0)
}

const body = read(options.bodyFile, "pull request body")
const lines = body.split(/\r?\n/)
const headingIndex = lines.findIndex((line) => /^#{2,}\s+review\s+harness\s*$/i.test(line.trim()))
if (headingIndex === -1) {
  fail(
    1,
    `::error::This pull request changes ${uiFiles.length} UI file(s) on ${REDESIGN_BASE} and its body carries no "## Review harness" block. Run jakubkrehel/interface-review, then jakubkrehel/better-interface in full mode against the diff, then record one line each. Fetch each SKILL.md by raw URL from github.com/jakubkrehel/skills; "npx ui-skills get" does not serve them.`,
  )
}

const headingLevel = lines[headingIndex].trim().match(/^#+/)[0].length
const sectionLines = []
for (let index = headingIndex + 1; index < lines.length; index++) {
  const heading = lines[index].trim().match(/^(#+)\s+\S/)
  if (heading && heading[1].length <= headingLevel) break
  sectionLines.push(lines[index])
}

const evidenceOf = (skill) => {
  const pattern = new RegExp(`${skill}\\b[^:\\n]*:(.*)$`, "i")
  for (const line of sectionLines) {
    const match = line.match(pattern)
    if (match) return match[1]
  }
  return null
}

const missing = []
const empty = []
for (const skill of REQUIRED_SKILLS) {
  const raw = evidenceOf(skill)
  if (raw === null) {
    missing.push(skill)
    continue
  }
  const normalized = raw
    .toLowerCase()
    .replaceAll(/[`*_~[\]()<>./\\|,;:!?"'-]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
  if (PLACEHOLDERS.has(normalized) || normalized.length < 8) empty.push(skill)
}

if (missing.length > 0 || empty.length > 0) {
  const detail = [
    missing.length > 0 ? `no line for: ${missing.join(", ")}` : null,
    empty.length > 0 ? `empty or placeholder evidence for: ${empty.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ")
  fail(
    1,
    `::error::The "Review harness" block in this pull request body is incomplete: ${detail}. Each required skill needs one line saying what it found, or "no findings" where it found nothing. This gate only withholds; it never grants completion.`,
  )
}

console.log(`check-review-harness: review-harness evidence present for ${REQUIRED_SKILLS.join(" and ")} across ${uiFiles.length} UI file(s).`)
