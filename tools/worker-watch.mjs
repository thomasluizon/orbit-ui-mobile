#!/usr/bin/env node
/** Report the fleet from worker-status.mjs's own liveness and verdict. This tool derives neither. */
import { execFileSync, spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const WORKER_STATUS = new URL("./worker-status.mjs", import.meta.url)
const USAGE = `usage: worker-watch.mjs [--repo ui|api|landing] [--json]

  Per Orca worktree: the worker liveness and the delivery verdict worker-status.mjs decided, the
  linked ticket and its Linear state, the branch, and the contract verdict. An empty fleet prints so.

  Liveness is ALIVE, GONE or UNKNOWN, verbatim from worker-status.mjs, which reads the
  launcher-written PID marker and fails closed on a possibly recycled id. UNKNOWN is neither alive
  nor gone: it is a state nobody read, and the row says why instead of guessing.

  --repo   report only worktrees belonging to that repo from .claude/orchestrator.json, matched on
           orca's repoId rather than on the path, because a child worktree does not live under it
  --json   emit the report as JSON instead of one line per worktree
  --help, -h  print this usage and exit 0

exit codes: 0 the report printed, including an empty fleet, 2 usage or config error, including a
            --repo path orca does not list as a repository main worktree`
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
const worktrees = orca(["worktree", "list"]).worktrees ?? []
const samePath = (left, right) =>
  process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right)
/**
 * Orca does NOT put a child worktree under its repository's path. Measured 2026-07-31 on the live
 * fleet: repos.ui is C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile while its only
 * child sits in C:\Users\thoma\orca\workspaces\orbit-ui-mobile\<slug>, so the old
 * startsWith(repoPath) filter matched nothing and `--repo ui` printed an empty fleet over a live
 * worker. The link that does exist in the payload is repoId, carried by every entry including the
 * repository's own main worktree, which is the entry whose path IS the configured path. A
 * configured path orca does not list as a main worktree is refused rather than reported as an
 * empty fleet, because an unmatched filter is not a fleet observation.
 */
const repoIdOf = (repoPath) => {
  const main = worktrees.find((entry) => entry.isMainWorktree && entry.path && samePath(entry.path, repoPath))
  if (!main?.repoId) fail(`--repo ${repo} names ${repoPath}, which orca does not list as a repository main worktree`)
  return main.repoId
}
const repoId = repo ? repoIdOf(config.repos[repo]) : null
/**
 * One worker-status.mjs run per worktree, and that single call is the whole point: liveness and the
 * delivery verdict come from the tool that owns them. This file used to run its own
 * `process.kill(pid, 0)` with every non-ESRCH errno read as alive, no PID-reuse backstop and no
 * third state, so a recycled id printed BUSY: a tool reporting a state it never established.
 *
 * Measured 2026-07-31: 4.9s for the live ORB-163 worktree alone, and 9.2s for the real two-worktree
 * fleet, spent on git fetch, git ls-remote, gh pr list and orca linear issue, so the cost is
 * network-bound and linear in the fleet size. At maxParallelWorktrees 4 that is about 20 seconds for
 * a whole fleet report, which /watch accepts: it is an operator-invoked snapshot rather than a poll
 * loop, and it is the same per-worktree call this tool already made before the substitution. A
 * cheaper flag was considered and rejected, because the only thing left to make cheap is deriving
 * liveness here again, which is the defect.
 */
const statusOf = (entry) => {
  if (!entry.linkedLinearIssue) {
    return { exit: null, verdict: null, unread: "the worktree is linked to no Linear ticket, so worker-status.mjs has no --issue to read" }
  }
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(WORKER_STATUS), "--worktree", entry.path, "--issue", entry.linkedLinearIssue, "--base", entry.baseRef ?? "main", "--json"],
    { encoding: "utf8" },
  )
  try {
    return { exit: result.status, verdict: JSON.parse(result.stdout), unread: null }
  } catch {
    const reason = (result.stderr || result.stdout || result.error?.message || "").trim().split(/\r?\n/)[0] ?? ""
    return { exit: result.status, verdict: null, unread: `worker-status.mjs exited ${result.status} without a JSON verdict: ${reason}` }
  }
}
/**
 * A verdict that cannot be read is reported as unavailable, never folded into MET or NOT MET.
 * The unmet list is the whole point of the NOT MET row: worker-status.mjs already returns
 * `{ unmet: [...], pullRequest }` on stdout, and reading only the exit code threw away the one
 * thing an operator acts on. GONE plus NOT MET is the pair that costs a run, so it is exactly
 * the row that must say WHAT is unmet.
 */
const contractVerdict = (verdict) => (typeof verdict?.ok !== "boolean" ? "unavailable" : verdict.ok ? "MET" : "NOT MET")
const linearState = (issue) => {
  if (!issue) return "(no ticket)"
  try {
    const detail = orca(["linear", "issue", issue])
    return (detail.issue ?? detail)?.state?.name ?? "unknown"
  } catch {
    return "unknown"
  }
}
const report = worktrees.filter((entry) => !entry.isMainWorktree && !entry.isArchived).filter((entry) => !repoId || entry.repoId === repoId).map((entry) => {
  const { exit, verdict, unread } = statusOf(entry)
  return {
    issue: entry.linkedLinearIssue ?? null,
    state: linearState(entry.linkedLinearIssue),
    path: entry.path,
    branch: entry.branch ?? "",
    liveness: verdict?.liveness?.state ?? "unknown",
    livenessDetail: verdict?.liveness?.detail ?? unread,
    workerPids: verdict?.liveness?.pids ?? [],
    verdict: verdict?.verdict ?? null,
    contractExit: exit,
    contract: contractVerdict(verdict),
    unmet: Array.isArray(verdict?.unmet) ? verdict.unmet : [],
    pullRequest: verdict?.pullRequest ?? null,
  }
})
const line = (entry) =>
  [
    `worker ${entry.liveness.toUpperCase()}`,
    `verdict ${entry.verdict ?? "unavailable"}`,
    entry.issue ?? "(no ticket)",
    entry.state,
    entry.branch,
    `contract ${entry.contract}${entry.unmet.length > 0 ? `: ${entry.unmet.join(", ")}` : ""}`,
    ...(entry.liveness === "unknown" ? [`liveness unread: ${entry.livenessDetail}`] : []),
  ].join("  ")
if (json) console.log(JSON.stringify({ worktrees: report }, null, 2))
else if (report.length === 0) console.log(`no Orca worktrees${repo ? ` for ${repo}` : ""}`)
else for (const entry of report) console.log(line(entry))
