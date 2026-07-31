#!/usr/bin/env node
/** Report worker liveness from launcher-owned PIDs. Orca worktrees remain required; terminals are optional. */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const WORKER_STATUS = new URL("./worker-status.mjs", import.meta.url)
const USAGE = `usage: worker-watch.mjs [--repo ui|api|landing] [--json]

  Per Orca worktree: BUSY or IDLE from the launcher-written worker PID, the linked ticket and its
  Linear state, the branch, and the worker-status.mjs contract verdict. An empty fleet prints so.

  --repo   report only worktrees under that repo's path from .claude/orchestrator.json
  --json   emit the report as JSON instead of one line per worktree
  --help, -h  print this usage and exit 0

exit codes: 0 the report printed, including an empty fleet, 2 usage or config error`
if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(USAGE); process.exit(0) }
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !["--repo", "--json"].includes(value))
if (unknown.length) { console.error(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`); process.exit(2) }
const json = process.argv.includes("--json")
const repo = process.argv.includes("--repo") ? process.argv[process.argv.indexOf("--repo") + 1] : null
const fail = (message) => { console.error(message); process.exit(2) }
if (repo === undefined) fail("--repo requires a value")
const config = readOrchestratorConfig()
if (repo && !config.repos?.[repo]) fail(`--repo must be one of: ${Object.keys(config.repos ?? {}).join(", ")}`)
const orca = (args) => {
  const output = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8" })
  const payload = JSON.parse(output)
  if (payload.ok === false) throw new Error(payload.error?.message ?? "orca failure")
  return payload.result ?? payload
}
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (error) { return error.code !== "ESRCH" } }
const gitDir = (path) => resolve(path, (spawnSync("git", ["-C", path, "rev-parse", "--git-dir"], { encoding: "utf8" }).stdout ?? "").trim())
const pidsFor = (path) => {
  const marker = join(gitDir(path), "orbit-worker-pids.jsonl")
  if (!existsSync(marker)) return []
  return readFileSync(marker, "utf8").trim().split(/\r?\n/).filter(Boolean).flatMap((line) => { try { const row = JSON.parse(line); return row.worktreePath === path && Number.isInteger(row.pid) ? [row.pid] : [] } catch { return [] } })
}
const worktrees = orca(["worktree", "list"]).worktrees ?? []
/**
 * A verdict that cannot be read is reported as unavailable, never folded into MET or NOT MET.
 * The unmet list is the whole point of the NOT MET row: worker-status.mjs already returns
 * `{ unmet: [...], pullRequest }` on stdout, and reading only the exit code threw away the one
 * thing an operator acts on. IDLE plus NOT MET is the pair that costs a run, so it is exactly
 * the row that must say WHAT is unmet.
 */
const contractVerdict = (exitCode) => (exitCode === 0 ? "MET" : exitCode === 1 ? "NOT MET" : "unavailable")
const contractDetail = (status) => {
  if (status.status !== 0 && status.status !== 1) return { unmet: [], pullRequest: null }
  try {
    const verdict = JSON.parse(status.stdout)
    return { unmet: Array.isArray(verdict.unmet) ? verdict.unmet : [], pullRequest: verdict.pullRequest ?? null }
  } catch {
    return { unmet: [], pullRequest: null }
  }
}
const linearState = (issue) => {
  if (!issue) return "(no ticket)"
  try {
    const detail = orca(["linear", "issue", issue])
    return (detail.issue ?? detail)?.state?.name ?? "unknown"
  } catch {
    return "unknown"
  }
}
const report = worktrees.filter((entry) => !entry.isMainWorktree && !entry.isArchived).filter((entry) => !repo || resolve(entry.path).startsWith(resolve(config.repos[repo]))).map((entry) => {
  const pids = pidsFor(entry.path)
  const workerAlive = pids.some(alive)
  const status = entry.linkedLinearIssue
    ? spawnSync(process.execPath, [fileURLToPath(WORKER_STATUS), "--worktree", entry.path, "--issue", entry.linkedLinearIssue, "--base", entry.baseRef ?? "main", "--json"], { encoding: "utf8" })
    : { status: null }
  const { unmet, pullRequest } = contractDetail(status)
  return { issue: entry.linkedLinearIssue ?? null, state: linearState(entry.linkedLinearIssue), path: entry.path, branch: entry.branch ?? "", liveness: workerAlive ? "BUSY" : "IDLE", workerPids: pids.map((pid) => ({ pid, alive: alive(pid) })), contractExit: status.status, contract: contractVerdict(status.status), unmet, pullRequest }
})
if (json) console.log(JSON.stringify({ worktrees: report }, null, 2))
else if (report.length === 0) console.log(`no Orca worktrees${repo ? ` for ${repo}` : ""}`)
else for (const entry of report) console.log(`${entry.liveness}  ${entry.issue ?? "(no ticket)"}  ${entry.state}  ${entry.branch}  pid(s): ${entry.workerPids.map((worker) => `${worker.pid}:${worker.alive ? "alive" : "exited"}`).join(", ") || "none"}  contract  ${entry.contract}${entry.unmet.length > 0 ? `: ${entry.unmet.join(", ")}` : ""}`)
