#!/usr/bin/env node
/** Remove linked, completed Orca worktrees through safe teardown. */

import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const USAGE = `usage: reap-worktrees.mjs [--json]

Find non-primary Orca worktrees linked to Linear issues, read each current state,
and pass every Done worktree's exact path to teardown-worktree.mjs. Active or
agent-bearing non-Done worktrees are ignored after their state is confirmed.

exit codes: 0 inventory processed, 1 a Done candidate could not be removed,
            2 usage error, 3 Orca inventory or Linear state could not be read`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const knownFlags = new Set(["--json", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !knownFlags.has(token))
if (unknown.length > 0) {
  console.error(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
  process.exit(2)
}
const positional = process.argv.slice(2).filter((token) => !token.startsWith("-"))
if (positional.length > 0) {
  console.error(`${USAGE}\n\nunexpected argument(s): ${positional.join(" ")}`)
  process.exit(2)
}

const json = process.argv.includes("--json")
const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const TEARDOWN = process.env.ORBIT_TEARDOWN_SCRIPT || fileURLToPath(new URL("./teardown-worktree.mjs", import.meta.url))
const fail = (code, message) => {
  if (json) console.error(JSON.stringify({ ok: false, error: message }))
  else console.error(message)
  process.exit(code)
}
const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    fail(3, `orca ${args.join(" ")} failed: ${(error.stdout?.toString() || error.stderr?.toString() || error.message).trim()}`)
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed.ok === false) fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? parsed.message ?? "unknown error"}`)
    return parsed.result ?? parsed
  } catch (error) {
    if (error instanceof SyntaxError) fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 300)}`)
    throw error
  }
}
const issueState = (identifier) => {
  const result = orca(["linear", "issue", identifier])
  const issue = result.issue ?? result
  const state = issue.state?.name ?? issue.state
  if (typeof state !== "string" || state.length === 0) fail(3, `orca linear issue ${identifier} did not return a state`)
  return state
}
const inventory = orca(["worktree", "ps"])
if (!Array.isArray(inventory.worktrees)) fail(3, "Orca worktree inventory did not contain a worktrees array")
if (!Number.isInteger(inventory.totalCount)) fail(3, "Orca worktree inventory totalCount is not an integer")
if (typeof inventory.truncated !== "boolean") fail(3, "Orca worktree inventory truncated is not a boolean")
if (inventory.truncated || inventory.totalCount !== inventory.worktrees.length) fail(3, "Orca worktree inventory is truncated")
for (const [index, worktree] of inventory.worktrees.entries()) {
  const invalid = []
  if (!worktree || typeof worktree !== "object" || Array.isArray(worktree)) {
    fail(3, `Orca worktree inventory row ${index} is not an object`)
  }
  if (typeof worktree.path !== "string") invalid.push("path must be a string")
  if (typeof worktree.isMainWorktree !== "boolean") invalid.push("isMainWorktree must be a boolean")
  if (typeof worktree.isArchived !== "boolean") invalid.push("isArchived must be a boolean")
  if (typeof worktree.isActive !== "boolean") invalid.push("isActive must be a boolean")
  if (!Array.isArray(worktree.agents)) invalid.push("agents must be an array")
  if (worktree.linkedLinearIssue !== null && typeof worktree.linkedLinearIssue !== "string") {
    invalid.push("linkedLinearIssue must be a string or null")
  }
  if (invalid.length > 0) fail(3, `Orca worktree inventory row ${index} is invalid: ${invalid.join(", ")}`)
}

const candidates = inventory.worktrees.filter((worktree) =>
  !worktree.isMainWorktree
  && !worktree.isArchived
  && typeof worktree.path === "string"
  && /^[A-Z]+-\d+$/.test(worktree.linkedLinearIssue ?? ""),
)
const reaped = []
const skipped = []
for (const worktree of candidates) {
  const identifier = worktree.linkedLinearIssue
  const state = issueState(identifier)
  if (state !== "Done") {
    skipped.push({ identifier, path: worktree.path, state })
    continue
  }
  const result = spawnSync(process.execPath, [TEARDOWN, "--worktree", `path:${worktree.path}`], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) fail(3, `REAP_FAILED ${identifier} path=${worktree.path}: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
    fail(1, `${detail ? `${detail}\n` : ""}REAP_FAILED ${identifier} path=${worktree.path}`)
  }
  reaped.push({ identifier, path: worktree.path, output: result.stdout.trim() })
}

if (json) {
  console.log(JSON.stringify({ ok: true, reaped, skipped, ignored: inventory.worktrees.length - candidates.length }))
} else {
  for (const row of reaped) {
    if (row.output) console.log(row.output)
    console.log(`REAPED ${row.identifier} path=${row.path}`)
  }
  for (const row of skipped) console.log(`SKIPPED_NON_DONE ${row.identifier} state=${row.state} path=${row.path}`)
  console.log(`REAPER OK reaped=${reaped.length} skipped=${skipped.length} ignored=${inventory.worktrees.length - candidates.length}`)
}
