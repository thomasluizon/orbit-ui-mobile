#!/usr/bin/env node
/** Merge a review worker's report into the existing pull request body before delivery. */

import { readFileSync, writeFileSync } from "node:fs"
import { isAbsolute } from "node:path"
import { reviewHarnessSectionLines, reviewEvidenceProblem } from "./lib/review-harness.mjs"

const USAGE = `usage: merge-review-batch-body.mjs --body-file <absolute path> --report-file <absolute path> --out <absolute path> [--ui-scope]

  --body-file   current pull request body
  --report-file review worker's final report
  --out         merged body for gh pr edit --body-file
  --ui-scope    require complete Review harness evidence and replace the section for this batch

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

function* markdownLines(source) {
  let fence = null
  for (const line of source.split("\n")) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    const startsFence = !fence && !!marker && (marker[1][0] === "~" || !marker[2].includes("`"))
    const endsFence = !!fence && !!marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()
    const fenced = !!fence || startsFence
    if (startsFence) fence = marker[1]
    else if (endsFence) fence = null
    yield { line, fenced, startsFence, endsFence }
  }
}

// Worker reports arrive with CRLF line endings and may end on an empty heading with no newline.
const parse = (source) => {
  const preamble = []
  const sections = []
  let lines = preamble
  for (const { line, fenced } of markdownLines(source.replace(/\r\n?/g, "\n"))) {
    const heading = !fenced && line.match(/^## (.+)$/)
    if (heading) {
      lines = []
      sections.push({ title: heading[1], lines })
    } else lines.push(line)
  }
  if (new Set(sections.map(({ title }) => title)).size !== sections.length) throw new Error("duplicate level-two section")
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map(({ title, lines }) => ({ title, body: lines.join("\n").trim() })),
  }
}

const entries = (body) => {
  const result = []
  let lines = []
  let fenced = false
  const flush = () => {
    if (lines.length) result.push({ text: lines.join("\n"), fenced })
    lines = []
    fenced = false
  }
  for (const { line, fenced: insideFence, startsFence, endsFence } of markdownLines(body)) {
    if (startsFence || (!insideFence && (!line.trim() || /^- /.test(line)))) flush()
    if (insideFence || line.trim()) lines.push(line)
    if (startsFence) fenced = true
    if (endsFence) flush()
  }
  flush()
  return result
}

const merge = (existing, incoming) => {
  const seen = new Set()
  const kept = [...entries(existing), ...entries(incoming)].filter((entry) => {
    if (entry.fenced) return true
    const key = entry.text.trim().replace(/\s+/g, " ")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return kept.map((entry, index) => {
    const previous = kept[index - 1]
    const separator = previous && !previous.fenced && !entry.fenced && /^- /.test(previous.text) && /^- /.test(entry.text) ? "\n" : "\n\n"
    return `${index ? separator : ""}${entry.text}`
  }).join("")
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
    if (!incoming) throw new Error("missing ## Review harness in UI review report")
    const detail = reviewEvidenceProblem(reviewHarnessSectionLines(`## Review harness\n\n${incoming.body}`))
    if (detail) throw new Error(`incomplete ## Review harness in UI review report: ${detail}`)
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
