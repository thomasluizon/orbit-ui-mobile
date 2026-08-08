#!/usr/bin/env node
/**
 * Export the whole ORB Linear team to one JSON file, including the two things the CSV export drops:
 * threaded comments and issue relations.
 *
 * Fails closed on truncation. `orca linear issue --full` applies caps and marks a shortened comment
 * with `bodyTruncated: true`, so a migration that ignored that flag would silently lose text.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, readFileSync, existsSync } from "node:fs"

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const OUT = process.argv[2]
if (!OUT) {
  console.error("usage: export-linear.mjs <output.json>")
  process.exit(2)
}

const orca = (args) => {
  const stdout = execFileSync(ORCA, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const parsed = JSON.parse(stdout)
  if (parsed.ok !== true) throw new Error(`orca ${args.join(" ")} returned ok=false: ${stdout.slice(0, 400)}`)
  return parsed.result
}

// Resume support: a 250-call export should not restart from zero on one transient failure.
const partialPath = `${OUT}.partial`
const issues = existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, "utf8")) : {}
console.error(`resuming with ${Object.keys(issues).length} issues already exported`)

// `--cursor` is refused without a concrete workspace: "Cursor pagination requires a concrete Linear
// workspace." The id below was read from result.meta.workspaceId of the first page in this run.
const WORKSPACE = "940a4273-8e9f-4f75-ba2f-33b8d2a45759"

const identifiers = []
let cursor = null
for (;;) {
  const args = ["linear", "list-issues", "--team", "ORB", "--limit", "100", "--include-archived", "--workspace", WORKSPACE, "--json"]
  if (cursor) args.push("--cursor", cursor)
  const result = orca(args)
  if (result.meta?.workspaceId !== WORKSPACE) throw new Error(`workspace drifted to ${result.meta?.workspaceId}`)
  for (const issue of result.issues) identifiers.push(issue.identifier)
  process.stderr.write(`listed ${identifiers.length}\r`)
  if (!result.meta?.hasMore) break
  cursor = result.meta.nextCursor
  if (!cursor) break
}
console.error(`\n${identifiers.length} issues listed, ${new Set(identifiers).size} unique`)

const truncated = []
let done = 0
for (const identifier of identifiers) {
  done += 1
  if (issues[identifier]) continue
  let result
  for (let attempt = 1; ; attempt += 1) {
    try {
      result = orca(["linear", "issue", identifier, "--full", "--json"])
      break
    } catch (error) {
      if (attempt >= 3) throw new Error(`${identifier} failed after 3 attempts: ${error.message}`)
      console.error(`\n${identifier} attempt ${attempt} failed, retrying: ${error.message.slice(0, 200)}`)
    }
  }
  for (const comment of result.comments ?? []) {
    if (comment.bodyTruncated) truncated.push(`${identifier} comment ${comment.id}`)
  }
  issues[identifier] = result
  process.stderr.write(`exported ${done}/${identifiers.length} ${identifier}          \r`)
  if (done % 25 === 0) writeFileSync(partialPath, JSON.stringify(issues))
}
console.error("")

const payload = {
  exportedAt: new Date().toISOString(),
  team: "ORB",
  order: identifiers,
  issues,
  truncatedComments: truncated,
}
writeFileSync(OUT, JSON.stringify(payload, null, 1))
writeFileSync(partialPath, JSON.stringify(issues))

console.log(JSON.stringify({
  issues: identifiers.length,
  comments: Object.values(issues).reduce((total, issue) => total + (issue.comments?.length ?? 0), 0),
  relations: Object.values(issues).reduce((total, issue) => total + (issue.relations?.length ?? 0), 0),
  truncatedComments: truncated.length,
  out: OUT,
}, null, 2))
if (truncated.length > 0) {
  console.error(`REFUSING to call this export complete: ${truncated.length} comment bodies were truncated by the read cap`)
  process.exit(1)
}
