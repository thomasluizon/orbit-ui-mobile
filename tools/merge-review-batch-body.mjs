#!/usr/bin/env node
/** Merge a review worker's report into the existing pull request body before delivery. */

import { readFileSync, writeFileSync } from "node:fs"
import { isAbsolute } from "node:path"

const USAGE = `usage: merge-review-batch-body.mjs --body-file <absolute path> --report-file <absolute path> --out <absolute path> [--ui-scope]

  --body-file   current pull request body
  --report-file review worker's final report
  --out         merged body for gh pr edit --body-file
  --ui-scope    require and replace the Review harness section for this batch

exit codes: 0 body written, 1 missing report evidence, 2 invalid arguments`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const option = (flag) => {
  const index = process.argv.indexOf(flag)
  return index < 0 ? null : process.argv[index + 1]
}
const bodyFile = option("--body-file")
const reportFile = option("--report-file")
const out = option("--out")
const uiScope = process.argv.includes("--ui-scope")
const allowed = new Set(["--body-file", "--report-file", "--out", "--ui-scope"])
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"))
if (!bodyFile || !reportFile || !out || ![bodyFile, reportFile, out].every(isAbsolute) || flags.some((flag) => !allowed.has(flag))) {
  console.error(USAGE)
  process.exit(2)
}

const parse = (markdown) => {
  const matches = [...markdown.matchAll(/^## ([^\n]+)\n/gm)]
  const sections = matches.map((match, index) => ({
    title: match[1],
    body: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length).trim(),
  }))
  if (new Set(sections.map(({ title }) => title)).size !== sections.length) throw new Error("duplicate level-two section")
  return { preamble: markdown.slice(0, matches[0]?.index ?? markdown.length).trim(), sections }
}

const entries = (body) => body.trim() ? body.trim().split(/\n(?=- )|\n{2,}/).map((entry) => entry.trim()).filter(Boolean) : []
const merge = (existing, incoming) => {
  const seen = new Set()
  return [...entries(existing), ...entries(incoming)].filter((entry) => {
    const key = entry.replace(/\s+/g, " ")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join("\n")
}

try {
  const body = parse(readFileSync(bodyFile, "utf8"))
  const report = parse(readFileSync(reportFile, "utf8"))
  const section = (document, title) => document.sections.find((candidate) => candidate.title === title)
  for (const title of ["Test evidence", "Assumptions", "Manual steps"]) {
    const incoming = section(report, title)
    if (!incoming) throw new Error(`missing ## ${title} in review report`)
    const existing = section(body, title)
    const merged = merge(existing?.body ?? "", incoming.body)
    if (existing) existing.body = merged
    else if (merged) body.sections.push({ title, body: merged })
  }
  if (uiScope) {
    const incoming = section(report, "Review harness")
    if (!incoming?.body) throw new Error("missing ## Review harness in UI review report")
    const existing = section(body, "Review harness")
    if (existing) existing.body = incoming.body
    else body.sections.push({ title: "Review harness", body: incoming.body })
  }
  const rendered = [body.preamble, ...body.sections.map(({ title, body: content }) => `## ${title}\n\n${content}`)].filter(Boolean).join("\n\n")
  writeFileSync(out, `${rendered}\n`, "utf8")
  console.log(out)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
