import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T } from "./_harness.mjs"

const REPORT = "design/unslop-ui-report.md"
const WORKSPACES = ["apps/web", "apps/mobile", "packages/shared"]

/** The rows of the table that follows a heading, as arrays of trimmed cells. */
const tableAfter = (text, heading) => {
  const start = text.indexOf(heading)
  if (start < 0) return null
  const lines = text.slice(start + heading.length).split("\n")
  const rows = []
  for (const line of lines.slice(1)) {
    if (line.startsWith("|")) rows.push(line.split("|").slice(1, -1).map((cell) => cell.trim()))
    else if (rows.length > 0) break
  }
  return rows
}

const sectionLines = (text, heading) => {
  const start = text.indexOf(`\n${heading}\n`)
  if (start < 0) return []
  const rest = text.slice(start + heading.length + 2)
  const end = rest.search(/\n## /)
  return (end < 0 ? rest : rest.slice(0, end)).split("\n").filter((line) => line.startsWith("- "))
}

export const cases = () => {
  const path = join(REPO_ROOT, REPORT)
  T(`${REPORT}: the report exists`, existsSync(path), "the report file is missing")
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")

  for (const workspace of WORKSPACES) {
    const rows = tableAfter(text, `## ${workspace}`)
    T(`${workspace}: the counter table exists`, rows !== null && rows.length > 2, "no table under the heading")
    if (!rows) continue
    T(`${workspace}: the table header is Rule, Before, After, Kept`, rows[0].join(",") === "Rule,Before,After,Kept", rows[0].join(","))
    const body = rows.slice(2)
    const bad = body.filter(([, before, after, kept]) => ![before, after, kept].every((cell) => /^\d+$/.test(cell)) || Number(kept) > Number(after) || Number(after) > Number(before))
    T(`${workspace}: every row has numeric Before, After and Kept with Kept at most After`, bad.length === 0, JSON.stringify(bad))
  }

  const kept = sectionLines(text, "## Kept on purpose")
  const unreasoned = kept.filter((line) => !/^- `[^`]+`.*: .{12,}/.test(line))
  T("Kept on purpose: each line names a path and gives a reason", kept.length > 0 && unreasoned.length === 0, unreasoned.join("\n"))

  const tasks = sectionLines(text, "## Tasks")
  const unlocated = tasks.filter((line) => !/^- \[ \] `[^`:]+:\d+`/.test(line))
  T("Tasks: each task names a file and a line", tasks.length > 0 && unlocated.length === 0, unlocated.join("\n"))
}
