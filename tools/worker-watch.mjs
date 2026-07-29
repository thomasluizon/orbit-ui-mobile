#!/usr/bin/env node
/**
 * One screen answering "what is every child session doing right now".
 *
 * `worker-status.mjs` adjudicates DELIVERY from artifacts and is right to; nothing reported
 * LIVENESS. Over the 2026-07-27 ORB-88 run the orchestrator hand-ran `orca terminal read`
 * five times to answer "is this worker working, stuck, or asking a question", re-deriving the
 * same two things each time, and both are hostile to read raw: `orca terminal read` flattens a
 * TUI repaint, so a busy worker's tail arrives as thousands of characters of concatenated
 * `Working` fragments, and a single read cannot distinguish a busy worker from an idle one at
 * all. The cost was direct: Thomas twice noticed a stalled or duplicated child session before
 * the orchestrator did.
 *
 * So this REPORTS liveness alongside the contract verdict and never replaces it, and it never
 * acts: what to send a stalled worker is the orchestrator's judgement, not a watcher's.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { REPAINT_SAMPLE_MS, classifyTerminals, pause, sampleTerminals } from "./lib/tui-repaint.mjs"

const USAGE = `usage: worker-watch.mjs [options]

  --repo ui|api|landing  only worktrees of that repo (default: every repo in orchestrator.json)
  --lines <n>            how many meaningful output lines per worker (default: 8)
  --no-contract          skip the worker-status.mjs verdict, which costs a fetch + gh call per
                         worktree. Liveness only, for a fast look
  --json                 emit the report as JSON instead of text
  --help, -h             print this usage and exit 0

Per Orca worktree: the Linear ticket, the branch, the ticket's Linear state, BUSY or IDLE
classified by repaint delta over ${REPAINT_SAMPLE_MS}ms, the last meaningful output lines with
repaint noise stripped, and the worker-status.mjs contract verdict.

BUSY/IDLE is LIVENESS, never completion: an idle worker may be finished, stopped early, or
waiting on a question nobody will answer. The contract line is what says whether the work
landed.

exit codes: 0 the report printed (including "no worktrees", which is a result),
            2 usage error, 3 an orca command failed`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const WORKER_STATUS = fileURLToPath(new URL("./worker-status.mjs", import.meta.url))

/**
 * What a TUI paints while it is thinking, and nothing else. A tail full of these is not output,
 * it is the same frame redrawn: `orca terminal read` concatenates the frames with no separator,
 * so a busy worker's tail is `WorkingWorkingWorking...` for thousands of characters. Stripping
 * these leaves a line that is either real content or empty, and empty is what gets dropped.
 * Deliberately matched loosely (`inter\\w*` covers the CLI's own `interupt` typo) and only used
 * to DECIDE: what prints is the original line.
 */
const REPAINT_NOISE = /working|flowing|thinking|esc to inter\w*|ctrl\+?c|\b\d+s\b|\btokens?\b|[\u2800-\u28ff\u2500-\u257f\u2580-\u259f\u25a0-\u25ff]/gi
const ANSI = /\u001b\[[0-9;?]*[a-zA-Z]/g
/** Enough letters left after the noise to be a sentence rather than punctuation debris. */
const MIN_MEANINGFUL_CHARS = 4

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const KNOWN_FLAGS = new Set(["--repo", "--lines", "--no-contract", "--json", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !KNOWN_FLAGS.has(token))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const orca = (args, { soft = false } = {}) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    if (soft) return null
    const payload = error.stdout?.toString() ?? ""
    return fail(3, `orca ${args.join(" ")} failed: ${payload.trim().slice(0, 300) || error.stderr?.toString().trim() || error.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    if (soft) return null
    return fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 300)}`)
  }
  if (parsed.ok === false) {
    if (soft) return null
    return fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? "unknown orca error"}`)
  }
  return parsed.result ?? parsed
}

const repoFilter = argOf("--repo")
const lines = Number(argOf("--lines") ?? 8)
const withContract = !process.argv.includes("--no-contract")
const asJson = process.argv.includes("--json")

if (!Number.isInteger(lines) || lines < 1) fail(2, "--lines must be a positive integer")

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const repos = config.repos ?? {}
if (repoFilter && !repos[repoFilter]) fail(2, `--repo must be one of: ${Object.keys(repos).join(", ")}`)

const normalize = (path) => (path ?? "").replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
const wanted = Object.entries(repos).filter(([key]) => !repoFilter || key === repoFilter)

const worktrees = orca(["worktree", "list"]).worktrees ?? []

/**
 * Which repo a worktree belongs to, by the repoId its own MAIN worktree carries. Orca's
 * worktrees live outside the repo (`~/orca/workspaces/...`), so a path-prefix test cannot
 * answer this. `projectId` is the second signal, for a fleet listed without its main worktree.
 */
const repoIdOf = new Map(
  worktrees.filter((worktree) => worktree.isMainWorktree).map((worktree) => [normalize(worktree.path), worktree.repoId]),
)
const repoKeyOf = (worktree) => {
  for (const [key, path] of wanted) {
    const mainRepoId = repoIdOf.get(normalize(path))
    if (mainRepoId && worktree.repoId === mainRepoId) return key
    if (normalize(worktree.projectId).endsWith(`/${normalize(path).split("/").pop()}`)) return key
  }
  return null
}

const children = worktrees
  .filter((worktree) => !worktree.isMainWorktree && !worktree.isArchived)
  .map((worktree) => ({ worktree, repoKey: repoKeyOf(worktree) }))
  .filter((entry) => entry.repoKey)

if (children.length === 0) {
  const scope = repoFilter ? `the ${repoFilter} repo` : `the Orbit repos (${Object.keys(repos).join(", ")})`
  if (asJson) console.log(JSON.stringify({ worktrees: [], scope: repoFilter ?? null }, null, 2))
  else console.log(`no Orca worktrees in ${scope}; nothing is running`)
  process.exit(0)
}

/** Two samples one window apart: a running turn repaints continuously, an idle TUI emits nothing. */
const before = sampleTerminals(orca)
pause(REPAINT_SAMPLE_MS)
const after = sampleTerminals(orca)
const liveness = classifyTerminals(before, after)
const terminals = orca(["terminal", "list"]).terminals ?? []

const meaningfulLines = (tail) => {
  const kept = []
  for (const raw of tail) {
    const line = raw.replace(ANSI, "").replace(/\s+/g, " ").trim()
    if (!line) continue
    const bare = line.replace(REPAINT_NOISE, "").replace(/[^\p{L}\p{N}]/gu, "")
    if (bare.length < MIN_MEANINGFUL_CHARS) continue
    if (kept[kept.length - 1] === line) continue
    kept.push(line)
  }
  return kept.slice(-lines)
}

const contractVerdict = (path, issue, base) => {
  if (!issue) return { state: "skipped", detail: "the worktree carries no linked Linear issue" }
  const result = spawnSync(process.execPath, [WORKER_STATUS, "--worktree", path, "--issue", issue, "--base", base, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  let verdict = null
  try {
    verdict = JSON.parse(result.stdout)
  } catch {
    /* worker-status writes its own failure to stderr; the state below carries it */
  }
  if (verdict) return { state: verdict.ok ? "met" : "not-met", unmet: verdict.unmet, pullRequest: verdict.pullRequest }
  return { state: "unavailable", detail: (result.stderr || "").trim().split("\n")[0]?.slice(0, 200) || `worker-status exited ${result.status}` }
}

const report = children.map(({ worktree, repoKey }) => {
  const own = terminals.filter((terminal) => normalize(terminal.worktreePath) === normalize(worktree.path))
  const busy = own.some((terminal) => liveness.get(terminal.handle) === "BUSY")
  const newest = own.slice().sort((first, second) => (second.lastOutputAt ?? 0) - (first.lastOutputAt ?? 0))[0] ?? null
  const issue = worktree.linkedLinearIssue ?? null
  const detail = issue ? orca(["linear", "issue", issue], { soft: true }) : null
  const linearIssue = detail?.issue ?? detail
  const tail = newest ? orca(["terminal", "read", "--terminal", newest.handle, "--limit", "200"], { soft: true })?.terminal?.tail ?? [] : []

  return {
    issue,
    repo: repoKey,
    path: worktree.path,
    branch: (worktree.branch ?? "").replace(/^refs\/heads\//, ""),
    linearState: linearIssue?.state?.name ?? linearIssue?.state ?? (issue ? "unknown" : null),
    liveness: busy ? "BUSY" : "IDLE",
    terminals: own.map((terminal) => ({ handle: terminal.handle, liveness: liveness.get(terminal.handle) ?? "IDLE", title: terminal.title })),
    comment: worktree.comment || null,
    lastOutput: meaningfulLines(tail),
    contract: withContract ? contractVerdict(worktree.path, issue, worktree.baseRef ?? "main") : null,
  }
})

if (asJson) {
  console.log(JSON.stringify({ worktrees: report, scope: repoFilter ?? null }, null, 2))
  process.exit(0)
}

console.log(`${report.length} Orca worktree(s)${repoFilter ? ` in ${repoFilter}` : ""}, liveness sampled over ${REPAINT_SAMPLE_MS}ms\n`)
for (const entry of report) {
  console.log(`${entry.liveness}  ${entry.issue ?? "(no ticket)"}  ${entry.branch}  [${entry.repo}]`)
  console.log(`  path      ${entry.path}`)
  if (entry.linearState) console.log(`  linear    ${entry.linearState}`)
  if (entry.comment) console.log(`  card      ${entry.comment}`)
  const terminalLines = entry.terminals.map((terminal) => `${terminal.handle} ${terminal.liveness}`).join("\n            ")
  console.log(`  terminals ${terminalLines || "none (no TUI attached)"}`)
  if (entry.contract) {
    const line =
      entry.contract.state === "met"
        ? `CONTRACT MET (${entry.contract.pullRequest ?? "no PR recorded"})`
        : entry.contract.state === "not-met"
          ? `NOT MET: ${entry.contract.unmet.join(", ")}`
          : `${entry.contract.state}: ${entry.contract.detail}`
    console.log(`  contract  ${line}`)
  }
  console.log(`  last output${entry.lastOutput.length === 0 ? " (nothing but repaint noise)" : ""}`)
  for (const line of entry.lastOutput) console.log(`    | ${line.slice(0, 160)}`)
  console.log("")
}
